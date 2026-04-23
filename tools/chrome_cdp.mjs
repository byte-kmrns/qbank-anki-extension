#!/usr/bin/env node

import fs from "node:fs/promises";

const host = process.env.CDP_HOST || "127.0.0.1";
const port = process.env.CDP_PORT || "9222";
const baseUrl = `http://${host}:${port}`;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();

  switch (command) {
    case "list":
      return printJson(await cdpJson("/json/list"));
    case "open":
      return printJson(await openTarget(args[0]));
    case "activate":
      return printText(await activateTarget(await resolveTarget(args)));
    case "eval":
      return runEval(args);
    case "screenshot":
      return runScreenshot(args);
    default:
      printUsage();
      process.exitCode = command ? 1 : 0;
  }
}

function printUsage() {
  console.log(`Usage:
  chrome_cdp.mjs list
  chrome_cdp.mjs open <url>
  chrome_cdp.mjs activate [--target-id <id> | --url-substring <text>]
  chrome_cdp.mjs eval [--target-id <id> | --url-substring <text>] [--expr <js>]
  chrome_cdp.mjs screenshot [--target-id <id> | --url-substring <text>] --out <file>`);
}

async function cdpJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  if (!response.ok) {
    throw new Error(`CDP HTTP request failed (${response.status}) for ${path}`);
  }
  return response.json();
}

async function openTarget(url) {
  if (!url) {
    throw new Error("A URL is required.");
  }

  const response = await fetch(`${baseUrl}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT"
  });
  if (!response.ok) {
    throw new Error(`Could not open a new target (${response.status}).`);
  }
  return response.json();
}

async function activateTarget(target) {
  const response = await fetch(`${baseUrl}/json/activate/${target.id}`);
  if (!response.ok) {
    throw new Error(`Could not activate target ${target.id}.`);
  }
  return `${target.id} ${target.url}`;
}

async function resolveTarget(args) {
  const options = parseTargetArgs(args);
  const targets = await cdpJson("/json/list");
  const pages = targets.filter((target) => target.type === "page");

  if (options.targetId) {
    const match = pages.find((target) => target.id === options.targetId);
    if (match) {
      return match;
    }
    throw new Error(`No page target matched id ${options.targetId}.`);
  }

  const urlSubstring = options.urlSubstring || "";
  const match = pages.find((target) => String(target.url || "").includes(urlSubstring));
  if (match) {
    return match;
  }

  throw new Error(urlSubstring
    ? `No page target matched URL substring ${JSON.stringify(urlSubstring)}.`
    : "No page targets were available.");
}

function parseTargetArgs(args) {
  const parsed = {
    targetId: "",
    urlSubstring: ""
  };

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--target-id") {
      parsed.targetId = args[index + 1] || "";
      index += 1;
    } else if (value === "--url-substring") {
      parsed.urlSubstring = args[index + 1] || "";
      index += 1;
    }
  }

  return parsed;
}

async function readExpression(args) {
  const exprIndex = args.indexOf("--expr");
  if (exprIndex !== -1) {
    return args[exprIndex + 1] || "";
  }

  if (process.stdin.isTTY) {
    throw new Error("Provide JavaScript with --expr or stdin.");
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function runEval(args) {
  const target = await resolveTarget(args);
  const expression = await readExpression(args);
  const value = await withTargetSession(target, async (send) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });

    if (result.exceptionDetails) {
      const detail = result.exceptionDetails;
      throw new Error(detail.text || detail.exception?.description || "Runtime.evaluate failed.");
    }

    return result.result ? result.result.value : null;
  });

  if (typeof value === "string") {
    printText(value);
    return;
  }

  printJson(value);
}

async function runScreenshot(args) {
  const outIndex = args.indexOf("--out");
  const outFile = outIndex === -1 ? "" : (args[outIndex + 1] || "");
  if (!outFile) {
    throw new Error("Use --out <file> for screenshots.");
  }

  const target = await resolveTarget(args);
  const pngBase64 = await withTargetSession(target, async (send) => {
    await send("Page.bringToFront");
    const capture = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    return capture.data;
  });

  await fs.writeFile(outFile, Buffer.from(pngBase64, "base64"));
  printText(outFile);
}

async function withTargetSession(target, task) {
  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error("The target is missing a WebSocket debugger URL.");
  }

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  let sequence = 0;

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data));
    if (!payload.id || !pending.has(payload.id)) {
      return;
    }

    const { resolve, reject } = pending.get(payload.id);
    pending.delete(payload.id);
    if (payload.error) {
      reject(new Error(payload.error.message || "CDP command failed."));
      return;
    }
    resolve(payload.result || {});
  });

  socket.addEventListener("close", () => {
    for (const { reject } of pending.values()) {
      reject(new Error("The CDP socket closed before the command completed."));
    }
    pending.clear();
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    sequence += 1;
    pending.set(sequence, { resolve, reject });
    socket.send(JSON.stringify({
      id: sequence,
      method,
      params
    }));
  });

  try {
    await send("Runtime.enable");
    await send("Page.enable");
    return await task(send);
  } finally {
    socket.close();
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printText(value) {
  console.log(String(value || ""));
}
