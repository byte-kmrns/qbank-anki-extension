#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const defaultConfigPath = path.join(repoRoot, ".chrome-webstore.local.json");
const defaultPackagePath = path.join(repoRoot, "dist", "aiig-qbank-to-anki.zip");
const chromeWebstoreScope = "https://www.googleapis.com/auth/chromewebstore";
const uploadBase = "https://www.googleapis.com/upload/chromewebstore/v1.1";
const itemBase = "https://www.googleapis.com/chromewebstore/v1.1/items";

const defaultPublicConfig = {
  itemId: "bipbnlimbdpeflnibnhebhaijlhpdjdb",
  packagePath: defaultPackagePath,
  publishTarget: "default"
};

function usage() {
  console.log(`Usage:
  node tools/chrome_webstore_api.mjs token
  node tools/chrome_webstore_api.mjs status
  node tools/chrome_webstore_api.mjs upload --yes [zipPath]
  node tools/chrome_webstore_api.mjs publish --yes
  node tools/chrome_webstore_api.mjs release --yes [zipPath]

Credentials are read from ${path.relative(repoRoot, defaultConfigPath)} or env:
  CWS_CLIENT_ID
  CWS_CLIENT_SECRET
  CWS_REFRESH_TOKEN
  CWS_ITEM_ID
`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args.find((arg) => !arg.startsWith("-")) || "help";
  const yes = args.includes("--yes");
  const positional = args.filter((arg) => !arg.startsWith("-"));
  return {
    command,
    yes,
    packagePath: positional[1] ? path.resolve(positional[1]) : defaultPackagePath
  };
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig() {
  const fileConfig = loadJsonIfExists(process.env.CWS_CONFIG || defaultConfigPath);
  const config = {
    ...defaultPublicConfig,
    ...fileConfig,
    clientId: process.env.CWS_CLIENT_ID || fileConfig.clientId,
    clientSecret: process.env.CWS_CLIENT_SECRET || fileConfig.clientSecret,
    refreshToken: process.env.CWS_REFRESH_TOKEN || fileConfig.refreshToken,
    itemId: process.env.CWS_ITEM_ID || fileConfig.itemId || defaultPublicConfig.itemId,
    packagePath: process.env.CWS_PACKAGE_PATH || fileConfig.packagePath || defaultPublicConfig.packagePath,
    publishTarget: process.env.CWS_PUBLISH_TARGET || fileConfig.publishTarget || defaultPublicConfig.publishTarget
  };

  const missing = ["clientId", "clientSecret", "refreshToken", "itemId"]
    .filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing Chrome Web Store config: ${missing.join(", ")}`);
  }

  return config;
}

function requireYes(command, yes) {
  if (!yes) {
    throw new Error(`Refusing to ${command} without --yes.`);
  }
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/"access_token":\s*"[^"]+"/g, "\"access_token\": \"[redacted]\"")
    .replace(/"refresh_token":\s*"[^"]+"/g, "\"refresh_token\": \"[redacted]\"");
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_error) {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${safeJson(body)}`);
  }
  return body;
}

async function getAccessToken(config) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token"
  });

  return requestJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
}

async function apiRequest(config, pathSuffix, options = {}) {
  const token = await getAccessToken(config);
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    ...(options.headers || {})
  };
  return requestJson(pathSuffix, { ...options, headers });
}

async function printTokenStatus(config) {
  const token = await getAccessToken(config);
  console.log(safeJson({
    ok: true,
    expiresIn: token.expires_in,
    tokenType: token.token_type,
    scope: token.scope || chromeWebstoreScope
  }));
}

async function printItemStatus(config) {
  const result = await apiRequest(config, `${itemBase}/${config.itemId}?projection=DRAFT`);
  console.log(safeJson(result));
}

async function uploadPackage(config, packagePath) {
  const resolvedPackagePath = path.resolve(packagePath || config.packagePath || defaultPackagePath);
  if (!fs.existsSync(resolvedPackagePath)) {
    throw new Error(`Package not found: ${resolvedPackagePath}`);
  }

  const bytes = fs.readFileSync(resolvedPackagePath);
  const result = await apiRequest(config, `${uploadBase}/items/${config.itemId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(bytes.length),
      "x-goog-api-version": "2"
    },
    body: bytes
  });
  console.log(safeJson(result));
}

async function publishDraft(config) {
  const result = await apiRequest(
    config,
    `${itemBase}/${config.itemId}/publish?publishTarget=${encodeURIComponent(config.publishTarget)}`,
    {
      method: "POST",
      headers: {
        "Content-Length": "0",
        "x-goog-api-version": "2"
      }
    }
  );
  console.log(safeJson(result));
}

async function main() {
  const { command, yes, packagePath } = parseArgs(process.argv);
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }

  const config = loadConfig();
  switch (command) {
    case "token":
      await printTokenStatus(config);
      break;
    case "status":
      await printItemStatus(config);
      break;
    case "upload":
      requireYes("upload", yes);
      await uploadPackage(config, packagePath);
      break;
    case "publish":
      requireYes("publish", yes);
      await publishDraft(config);
      break;
    case "release":
      requireYes("release", yes);
      await uploadPackage(config, packagePath);
      await publishDraft(config);
      break;
    default:
      usage();
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
