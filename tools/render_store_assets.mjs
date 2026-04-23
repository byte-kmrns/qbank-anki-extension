import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const EXTENSION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(EXTENSION_DIR, "docs", "screenshots");
const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9222;

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function listTargets() {
  return json(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
}

async function newPage(url) {
  const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT"
  });
  if (!response.ok) {
    throw new Error(`Could not open page for ${url}`);
  }
  return response.json();
}

function createClient(webSocketUrl) {
  let id = 0;
  const pending = new Map();
  const events = new Map();
  const socket = new WebSocket(webSocketUrl);

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id) {
      const entry = pending.get(payload.id);
      if (!entry) {
        return;
      }
      pending.delete(payload.id);
      if (payload.error) {
        entry.reject(new Error(payload.error.message || JSON.stringify(payload.error)));
      } else {
        entry.resolve(payload.result);
      }
      return;
    }

    const handlers = events.get(payload.method) || [];
    for (const handler of handlers) {
      handler(payload.params || {});
    }
  });

  async function ready() {
    if (socket.readyState === WebSocket.OPEN) {
      return;
    }

    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
  }

  async function send(method, params = {}) {
    await ready();
    const messageId = ++id;

    return new Promise((resolve, reject) => {
      pending.set(messageId, { resolve, reject });
      socket.send(JSON.stringify({ id: messageId, method, params }));
    });
  }

  function on(method, handler) {
    const list = events.get(method) || [];
    list.push(handler);
    events.set(method, list);
  }

  async function close() {
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  }

  return { send, on, close, ready };
}

async function waitForPageLoad(client) {
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  await new Promise((resolve) => {
    let done = false;
    client.on("Page.loadEventFired", () => {
      if (!done) {
        done = true;
        resolve();
      }
    });
  });
}

async function waitForExpression(client, expression, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      returnByValue: true
    });
    if (result?.result?.value) {
      return true;
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for expression: ${expression}`);
}

async function captureTarget(target, fileName, prepareExpression) {
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await client.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 245, g: 241, b: 232, a: 1 }
  });
  await delay(1000);

  if (prepareExpression) {
    await client.send("Runtime.evaluate", {
      expression: prepareExpression,
      awaitPromise: true
    });
    await delay(800);
  }

  const { data } = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true
  });
  await fs.writeFile(path.join(OUT_DIR, fileName), Buffer.from(data, "base64"));
  await client.close();
}

async function closeOtherChromeInstances() {
  try {
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targets = await listTargets();
    for (const target of targets) {
      if (target.id) {
        try {
          await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`);
        } catch {
          // ignore close failures
        }
      }
    }
  } catch {
    // no debug instance yet
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await closeOtherChromeInstances();

  const version = await json(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
  if (!version.Browser) {
    throw new Error("Chrome remote debugging is not available. Start Chrome with --remote-debugging-port=9222.");
  }

  const targets = await listTargets();
  const extensionTarget = targets.find((target) =>
    typeof target.url === "string" && target.url.startsWith("chrome-extension://")
  );
  if (!extensionTarget) {
    throw new Error("Could not find the loaded extension target.");
  }

  const extensionId = extensionTarget.url.split("/")[2];

  const qbankTarget = await newPage("https://aiig-qbank.up.railway.app/");
  await captureTarget(
    qbankTarget,
    "01-qbank-page.png",
    `
      new Promise((resolve) => {
        const waitForUi = () => {
          const qbankButton = document.querySelector('.quiz-card');
          if (qbankButton) {
            qbankButton.click();
            setTimeout(() => {
              const startButton = [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Start Quiz'));
              if (startButton) {
                startButton.click();
              }
              setTimeout(() => {
                const ankiToggle = document.querySelector('.aiig-anki-toggle');
                if (ankiToggle) {
                  ankiToggle.click();
                }
                resolve(true);
              }, 1200);
            }, 400);
            return;
          }
          setTimeout(waitForUi, 300);
        };
        waitForUi();
      });
    `
  );

  const popupTarget = await newPage(`chrome-extension://${extensionId}/popup.html`);
  await captureTarget(
    popupTarget,
    "02-popup.png",
    `
      new Promise((resolve) => {
        const setState = () => {
          const ankiPill = document.getElementById('anki-pill');
          const ankiMessage = document.getElementById('anki-message');
          const pagePill = document.getElementById('page-pill');
          const pageSummary = document.getElementById('page-summary');
          const libraryCount = document.getElementById('library-count');
          const select = document.getElementById('quiz-select');
          const status = document.getElementById('status-message');
          if (!ankiPill || !select) {
            setTimeout(setState, 200);
            return;
          }
          ankiPill.className = 'pill pill-success';
          ankiPill.textContent = 'Connected v6';
          ankiMessage.textContent = 'AnkiConnect is reachable.';
          pagePill.className = 'pill pill-success';
          pagePill.textContent = 'Question found';
          pageSummary.textContent = 'Sample Quiz Title • Question 1 of 50';
          libraryCount.textContent = '5 quizzes';
          select.innerHTML = '';
          [
            'Sample Quiz One • 50q • Unit Name',
            'Sample Quiz Two • 40q • Unit Name',
            'Sample Quiz Three • 30q • Unit Name',
            'Sample Quiz Four • 65q • Unit Name',
            'Sample Quiz Five • 25q • Unit Name'
          ].forEach((label, index) => {
            const option = document.createElement('option');
            option.textContent = label;
            option.selected = index === 0;
            select.appendChild(option);
          });
          status.textContent = 'Added 1 card to Anki.';
          resolve(true);
        };
        setState();
      });
    `
  );

  const optionsTarget = await newPage(`chrome-extension://${extensionId}/options.html`);
  await captureTarget(
    optionsTarget,
    "03-options.png",
    `
      new Promise((resolve) => {
        const waitForUi = () => {
          const deckRoot = document.getElementById('deck-root');
          const noteModel = document.getElementById('note-model-name');
          const extraTags = document.getElementById('extra-tags');
          const allowDuplicates = document.getElementById('allow-duplicates');
          const saveStatus = document.getElementById('save-status');
          if (!deckRoot || !noteModel) {
            setTimeout(waitForUi, 200);
            return;
          }
          deckRoot.value = 'AIIG QBank';
          noteModel.value = 'Study Quiz Rich';
          extraTags.value = 'study qbank';
          allowDuplicates.checked = false;
          saveStatus.textContent = 'Settings saved.';
          resolve(true);
        };
        waitForUi();
      });
    `
  );

  console.log(`Rendered screenshots using extension id ${extensionId}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
