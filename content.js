const shared = window.AIIGAnkiShared;
const NOTEBOOKLM_BRIDGE_REQUEST = "STUDY_QUIZ_ANKI_NOTEBOOKLM_REQUEST";
const NOTEBOOKLM_BRIDGE_RESPONSE = "STUDY_QUIZ_ANKI_NOTEBOOKLM_RESPONSE";
const runtimeSite = detectRuntimeSite();
const isTopWindow = window.top === window;
let quickExporterUi = null;

(function initContentScript() {
  if (!shared || !runtimeSite) {
    return;
  }

  if (runtimeSite === "notebooklm-frame" || (runtimeSite === "notebooklm" && !isTopWindow)) {
    installNotebookLmFrameBridge();
    return;
  }

  if (runtimeSite === "aiig") {
    injectBridge();
  }

  installMessageListener();
  installQuickExporter();
})();

function detectRuntimeSite() {
  if (!shared) {
    return null;
  }

  const directSite = shared.detectSupportedSite(window.location.href);
  if (directSite) {
    return directSite;
  }

  if (isNotebookLmEmbeddedFrame()) {
    return "notebooklm-frame";
  }

  return null;
}

function isNotebookLmEmbeddedFrame() {
  if (window.top === window) {
    return false;
  }

  const ancestors = Array.from(window.location.ancestorOrigins || []);
  const hasNotebookAncestor = (
    ancestors.some((origin) => shared.isNotebookLmUrl(origin))
    || shared.isNotebookLmUrl(document.referrer || "")
  );
  if (hasNotebookAncestor) {
    return true;
  }

  const href = String(window.location.href || "");
  const protocol = String(window.location.protocol || "");
  const genericEmbeddedUrl = protocol === "blob:"
    || protocol === "data:"
    || href === "about:blank"
    || href.startsWith("about:srcdoc");
  if (!genericEmbeddedUrl) {
    return false;
  }

  const title = String(document.title || "");
  const bodyText = String((document.body && (document.body.innerText || document.body.textContent)) || "");
  return /NotebookLM/i.test(title)
    || /(?:Review quiz|Finish review|Question\s+\d+|\d+\s*(?:\/|of)\s*\d+)/i.test(bodyText);
}

function injectBridge() {
  if (document.getElementById("aiig-anki-page-bridge")) {
    return;
  }

  const script = document.createElement("script");
  script.id = "aiig-anki-page-bridge";
  script.src = chrome.runtime.getURL("page-bridge.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function installMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || (
      message.type !== "getPageContext"
      && message.type !== "collectExportContext"
      && message.type !== "toggleQuickExporter"
    )) {
      return undefined;
    }

    const task = message.type === "getPageContext"
      ? getPageContext()
      : message.type === "collectExportContext"
        ? collectExportContext(message.scope || "question")
        : toggleQuickExporterPanel();

    task
      .then((context) => sendResponse({ ok: true, context }))
      .catch((error) => sendResponse({ ok: false, error: shared.serializeError(error) }));

    return true;
  });
}

function installQuickExporter() {
  if (document.getElementById("aiig-anki-root")) {
    return;
  }

  const root = document.createElement("div");
  root.id = "aiig-anki-root";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "aiig-anki-toggle";
  toggle.textContent = "Anki";

  const panel = document.createElement("div");
  panel.className = "aiig-anki-panel aiig-anki-hidden";

  const title = document.createElement("div");
  title.className = "aiig-anki-panel-title";
  title.textContent = "Export to Anki";

  const currentQuestionButton = document.createElement("button");
  currentQuestionButton.type = "button";
  currentQuestionButton.className = "aiig-anki-action";
  currentQuestionButton.textContent = "Add current question";
  currentQuestionButton.addEventListener("click", () => exportFromPage("question"));

  const currentQuizButton = document.createElement("button");
  currentQuizButton.type = "button";
  currentQuizButton.className = "aiig-anki-action";
  currentQuizButton.textContent = "Add full quiz";
  currentQuizButton.addEventListener("click", () => exportFromPage("quiz"));

  const missedQuestionsButton = document.createElement("button");
  missedQuestionsButton.type = "button";
  missedQuestionsButton.className = "aiig-anki-action";
  missedQuestionsButton.textContent = "Add missed questions";
  missedQuestionsButton.addEventListener("click", () => exportFromPage("missed"));

  const helper = document.createElement("div");
  helper.className = "aiig-anki-helper";
  helper.textContent = "Uses AnkiConnect on your computer.";

  const connectButton = document.createElement("button");
  connectButton.type = "button";
  connectButton.className = "aiig-anki-connect aiig-anki-hidden";
  connectButton.textContent = "Connect Anki";
  connectButton.addEventListener("click", () => {
    connectAnkiFromPage().catch((error) => {
      showToast(shared.serializeError(error), "error");
    });
  });

  panel.appendChild(title);
  panel.appendChild(currentQuestionButton);
  panel.appendChild(currentQuizButton);
  panel.appendChild(missedQuestionsButton);
  panel.appendChild(helper);
  panel.appendChild(connectButton);
  root.appendChild(toggle);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  quickExporterUi = {
    connectButton,
    currentQuestionButton,
    currentQuizButton,
    helper,
    missedQuestionsButton,
    panel,
    root,
    toggle
  };

  toggle.addEventListener("click", () => {
    toggleQuickExporterPanel().catch((error) => {
      showToast(shared.serializeError(error), "error");
    });
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) {
      closeQuickExporterPanel();
    }
  });
}

function disableQuickExporterActions() {
  if (!quickExporterUi) {
    return;
  }

  quickExporterUi.currentQuestionButton.disabled = true;
  quickExporterUi.currentQuizButton.disabled = true;
  quickExporterUi.missedQuestionsButton.disabled = true;
}

function setQuickExporterConnectVisible(visible) {
  if (!quickExporterUi) {
    return;
  }

  quickExporterUi.connectButton.classList.toggle("aiig-anki-hidden", !visible);
}

async function ensureAnkiReadyForQuickExporter() {
  const result = await chrome.runtime.sendMessage({ type: "checkAnki" });
  if (result && result.ok) {
    setQuickExporterConnectVisible(false);
    return true;
  }

  setQuickExporterConnectVisible(true);
  quickExporterUi.helper.textContent = "Anki is not connected. Install AnkiConnect (2055492159), restart Anki, keep it open, then click Connect Anki.";
  return false;
}

async function connectAnkiFromPage() {
  if (!quickExporterUi) {
    throw new Error("The quick exporter is not available on this page.");
  }

  quickExporterUi.helper.textContent = "Checking Anki...";
  const result = await chrome.runtime.sendMessage({ type: "authorizeAnki" });
  if (!result || !result.ok) {
    const message = result && result.error
      ? result.error
      : "Could not connect to AnkiConnect.";
    quickExporterUi.helper.textContent = `Still not connected. ${message}`;
    setQuickExporterConnectVisible(true);
    throw new Error(message);
  }

  showToast("Anki is connected.", "success");
  return refreshQuickExporterPanel();
}

async function refreshQuickExporterPanel() {
  if (!quickExporterUi) {
    throw new Error("The quick exporter is not available on this page.");
  }

  disableQuickExporterActions();
  quickExporterUi.helper.textContent = "Checking Anki...";
  setQuickExporterConnectVisible(false);

  const ankiReady = await ensureAnkiReadyForQuickExporter();
  if (!ankiReady) {
    return null;
  }

  quickExporterUi.helper.textContent = "Inspecting the current quiz...";

  try {
    const context = await getPageContext();
    quickExporterUi.currentQuestionButton.disabled = !(context && context.capabilities && context.capabilities.exportCurrentQuestion);
    quickExporterUi.currentQuizButton.disabled = !(context && context.capabilities && context.capabilities.exportCurrentQuiz);
    quickExporterUi.missedQuestionsButton.disabled = !(context && context.capabilities && context.capabilities.exportMissedQuestions);
    quickExporterUi.helper.textContent = context && context.exportBehaviorNote
      ? context.exportBehaviorNote
      : "Uses AnkiConnect on your computer.";
    return context;
  } catch (error) {
    disableQuickExporterActions();
    quickExporterUi.helper.textContent = shared.serializeError(error);
    throw error;
  }
}

function closeQuickExporterPanel() {
  if (quickExporterUi) {
    quickExporterUi.panel.classList.add("aiig-anki-hidden");
  }
}

async function openQuickExporterPanel() {
  if (!quickExporterUi) {
    throw new Error("The quick exporter is not available on this page.");
  }

  quickExporterUi.panel.classList.remove("aiig-anki-hidden");
  return refreshQuickExporterPanel();
}

async function toggleQuickExporterPanel() {
  if (!quickExporterUi) {
    throw new Error("The quick exporter is not available on this page.");
  }

  if (quickExporterUi.panel.classList.contains("aiig-anki-hidden")) {
    return openQuickExporterPanel();
  }

  closeQuickExporterPanel();
  return null;
}

async function exportFromPage(scope) {
  try {
    const ankiReady = await chrome.runtime.sendMessage({ type: "checkAnki" });
    if (!ankiReady || !ankiReady.ok) {
      setQuickExporterConnectVisible(true);
      quickExporterUi.helper.textContent = "Anki is not connected. Install AnkiConnect (2055492159), restart Anki, keep it open, then click Connect Anki.";
      throw new Error((ankiReady && ankiReady.error) || "Could not connect to AnkiConnect.");
    }

    if (quickExporterUi) {
      quickExporterUi.helper.textContent = "Sending to Anki...";
    }
    showToast("Sending to Anki...");
    const context = await collectExportContext(scope);
    if (!context) {
      throw new Error("This page did not return any export data.");
    }

    const result = await chrome.runtime.sendMessage({
      type: scope === "question"
        ? "exportCurrentQuestion"
        : scope === "missed"
          ? "exportMissedQuestions"
          : "exportCurrentQuiz",
      action: scope === "question"
        ? "addCurrentQuestion"
        : scope === "missed"
          ? "addMissedQuestions"
          : "addCurrentQuiz",
      scope,
      context
    });

    if (!result.ok) {
      throw new Error(result.error || "Export failed.");
    }

    if (quickExporterUi) {
      quickExporterUi.helper.textContent = result.message;
    }
    showToast(result.message, "success");
  } catch (error) {
    if (quickExporterUi) {
      quickExporterUi.helper.textContent = shared.serializeError(error);
    }
    showToast(shared.serializeError(error), "error");
  }
}

async function getPageContext() {
  if (runtimeSite === "aiig") {
    return getAiigPageContext();
  }
  if (runtimeSite === "notebooklm") {
    return getNotebookLmPageContext();
  }
  throw new Error("This page is not supported.");
}

async function collectExportContext(scope) {
  if (runtimeSite === "aiig") {
    return getAiigPageContext();
  }
  if (runtimeSite === "notebooklm") {
    return scope === "quiz"
      ? collectNotebookLmQuizExportContext()
      : scope === "missed"
        ? collectNotebookLmMissedQuestionsContext()
        : collectNotebookLmQuestionExportContext();
  }
  throw new Error("This page is not supported.");
}

function getAiigPageContext() {
  return requestAiigPageContext().then((context) => {
    const questionCount = context && context.quizData && Array.isArray(context.quizData.questions)
      ? context.quizData.questions.length
      : 0;
    const missedCount = shared.collectAiigMissedQuestionEntries(context && context.quizData, context).length;
    const quizTitle = context && context.quizData && context.quizData.title
      ? context.quizData.title
      : "Active quiz";
    const questionLabel = context && context.currentQuestion
      ? shared.questionNumberLabel(context.currentQuestion, context.currentIndex, questionCount)
      : null;

    return {
      ...context,
      source: "aiig",
      siteLabel: "AIIG QBank",
      pageSummary: context && context.currentQuestion
        ? `${quizTitle}${questionLabel ? ` • Question ${questionLabel}` : ""}`
        : `${quizTitle} is open.`,
      exportBehaviorNote: missedCount > 0
        ? `Uses AnkiConnect on your computer. ${missedCount} confirmed missed question${missedCount === 1 ? "" : "s"} ready to export.`
        : "Uses AnkiConnect on your computer.",
      missedCount,
      capabilities: {
        exportCurrentQuestion: !!(context && context.currentQuestion),
        exportCurrentQuiz: questionCount > 0,
        exportMissedQuestions: missedCount > 0
      }
    };
  });
}

function requestAiigPageContext() {
  return new Promise((resolve, reject) => {
    const requestId = `aiig-anki-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for qbank page data."));
    }, 1500);

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    }

    function handleMessage(event) {
      if (event.source !== window) {
        return;
      }

      const data = event.data || {};
      if (data.source !== "AIIG_ANKI_BRIDGE" || data.type !== "AIIG_ANKI_CONTEXT" || data.requestId !== requestId) {
        return;
      }

      cleanup();
      if (data.error) {
        reject(new Error(data.error));
        return;
      }
      resolve(data.context || null);
    }

    window.addEventListener("message", handleMessage);
    window.postMessage({
      source: "AIIG_ANKI_EXTENSION",
      type: "AIIG_ANKI_GET_CONTEXT",
      requestId
    }, "*");
  });
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normalizeNotebookText(value) {
  return shared.trimInline(String(value || "").replace(/\s+/g, " "));
}

function splitNotebookLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => normalizeNotebookText(line))
    .filter(Boolean);
}

function isNotebookCounterText(text) {
  return /^(?:Question\s*)?\d+\s*(?:\/|of)\s*\d+$/i.test(normalizeNotebookText(text));
}

function isNotebookStatusText(text) {
  return /^(?:Not quite|Right answer|Correct answer|Correct|Incorrect|Wrong answer|That'?s right!|That is correct!?|That is right!?|Your answer|Selected answer|Answer)(?:\s*\([^)]*\))?$/i.test(normalizeNotebookText(text));
}

function isNotebookControlText(text) {
  return /^(?:Next(?: question)?|Previous(?: question)?|Submit|Review quiz|Finish review|Try again|Close|Done|Back|Skip|Exit|Return|Sources|Studio|Generate|Create|Open notebook|Connect Anki|Export to Anki|Add current question|Add full quiz|Add missed questions)$/i.test(normalizeNotebookText(text));
}

function isNotebookQuestionCandidateText(text) {
  const normalized = normalizeNotebookText(text);
  if (!normalized || normalized.length < 12 || normalized.length > 500) {
    return false;
  }

  if (isNotebookCounterText(normalized) || isNotebookStatusText(normalized) || isNotebookControlText(normalized)) {
    return false;
  }

  if (/^[A-H][\.\):]?\s*$/i.test(normalized)) {
    return false;
  }

  return true;
}

function getNotebookInteractiveElements(root) {
  return queryNotebookAllDeep(root, "button, [role='button'], [role='radio'], [aria-checked], [aria-selected]");
}

function getNotebookElementText(element) {
  if (!element) {
    return "";
  }

  return normalizeNotebookText(
    element.innerText
    || element.textContent
    || element.getAttribute("aria-label")
    || element.getAttribute("aria-description")
    || ""
  );
}

function queryNotebookAllDeep(root, selector) {
  const results = [];
  const seenRoots = new Set();
  const seenElements = new Set();
  const queue = [root];

  while (queue.length) {
    const current = queue.shift();
    if (!current || seenRoots.has(current) || typeof current.querySelectorAll !== "function") {
      continue;
    }
    seenRoots.add(current);

    current.querySelectorAll(selector).forEach((element) => {
      if (!seenElements.has(element)) {
        seenElements.add(element);
        results.push(element);
      }
    });

    current.querySelectorAll("*").forEach((element) => {
      if (element && element.shadowRoot) {
        queue.push(element.shadowRoot);
      }
    });
  }

  return results;
}

function findNotebookArtifactTitle() {
  const labeled = Array.from(document.querySelectorAll("input, textarea"))
    .find((element) => /artifact title/i.test(element.getAttribute("aria-label") || ""));
  if (labeled && labeled.value) {
    return shared.trimInline(labeled.value);
  }

  const disabledField = Array.from(document.querySelectorAll("input[disabled], textarea[disabled]"))
    .find((element) => element.value && element.value.length < 160);
  return disabledField ? shared.trimInline(disabledField.value) : "";
}

function findNotebookTitle() {
  return shared.trimInline(document.title.replace(/\s*-\s*NotebookLM\s*$/i, ""));
}

function buildNotebookBridgeRequestId() {
  return `study-quiz-anki-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getNotebookChildWindows() {
  return queryNotebookAllDeep(document, "iframe, frame")
    .map((frame) => frame.contentWindow)
    .filter((frameWindow, index, windows) => frameWindow && windows.indexOf(frameWindow) === index);
}

function requestNotebookBridgeAction(targetWindow, action, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const requestId = buildNotebookBridgeRequestId();
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for the NotebookLM quiz frame."));
    }, timeoutMs || 1200);

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    }

    function handleMessage(event) {
      if (event.source !== targetWindow) {
        return;
      }

      const data = event.data || {};
      if (data.source !== NOTEBOOKLM_BRIDGE_RESPONSE || data.requestId !== requestId) {
        return;
      }

      cleanup();
      if (!data.ok) {
        reject(new Error(data.error || "NotebookLM frame request failed."));
        return;
      }
      resolve(data.payload === undefined ? null : data.payload);
    }

    window.addEventListener("message", handleMessage);

    try {
      targetWindow.postMessage({
        source: NOTEBOOKLM_BRIDGE_REQUEST,
        requestId,
        action,
        payload: payload || {}
      }, "*");
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function installNotebookLmFrameBridge() {
  window.addEventListener("message", async (event) => {
    const data = event.data || {};
    if (data.source !== NOTEBOOKLM_BRIDGE_REQUEST || !data.requestId) {
      return;
    }

    try {
      let payload = null;
      switch (data.action) {
        case "snapshot":
          payload = await getNotebookLmFrameSnapshotOrChildSnapshot();
          break;
        case "clickButton":
          payload = await clickNotebookLmFrameChoiceOrChild(data.payload && data.payload.buttonIndex);
          break;
        case "clickControl":
          payload = await clickNotebookLmFrameControlOrChild(data.payload && data.payload.control);
          break;
        default:
          throw new Error("Unknown NotebookLM bridge action.");
      }

      event.source.postMessage({
        source: NOTEBOOKLM_BRIDGE_RESPONSE,
        requestId: data.requestId,
        ok: true,
        payload
      }, "*");
    } catch (error) {
      event.source.postMessage({
        source: NOTEBOOKLM_BRIDGE_RESPONSE,
        requestId: data.requestId,
        ok: false,
        error: shared.serializeError(error)
      }, "*");
    }
  });
}

function parseNotebookCounter(root) {
  const lines = splitNotebookLines(root ? (root.innerText || root.textContent || "") : "");
  const patterns = [
    /^(?:Question\s*)?(\d+)\s*\/\s*(\d+)$/i,
    /^(?:Question\s*)?(\d+)\s+of\s+(\d+)$/i,
    /Question\s+(\d+)\s+(?:of|\/)\s+(\d+)/i,
    /\b(\d+)\s*\/\s*(\d+)\b/
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) {
        continue;
      }

      const current = Number(match[1]);
      const total = Number(match[2]);
      if (!current || !total || current > total || total > 500) {
        continue;
      }

      return { current, total };
    }
  }

  return { current: null, total: null };
}

function parseNotebookChoiceButtons(root) {
  function parseChoiceLines(text) {
    const lines = splitNotebookLines(text);
    const choices = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const inlineMatch = line.match(/^([A-H])[\.\):]\s*(.+)$/i);
      const splitMatch = line.match(/^([A-H])[\.\):]\s*$/i);
      if (!inlineMatch && !splitMatch) {
        continue;
      }

      const key = (inlineMatch || splitMatch)[1].toUpperCase();
      let textValue = inlineMatch ? inlineMatch[2] : "";
      let cursor = index + 1;
      if (!textValue && lines[cursor] && !isNotebookStatusText(lines[cursor])) {
        textValue = lines[cursor];
        cursor += 1;
      }

      const extraLines = [];
      while (cursor < lines.length) {
        const nextLine = lines[cursor];
        if (/^[A-H][\.\):]\s*(?:.+)?$/i.test(nextLine)) {
          break;
        }
        if (isNotebookControlText(nextLine) || isNotebookCounterText(nextLine)) {
          break;
        }
        extraLines.push(nextLine);
        cursor += 1;
      }

      let status = "";
      if (extraLines[0] && /^done$/i.test(extraLines[0])) {
        extraLines.shift();
      }
      if (extraLines[0] && isNotebookStatusText(extraLines[0])) {
        status = extraLines.shift();
      }

      if (textValue) {
        choices.push({
          button: null,
          buttonIndex: -1,
          className: "",
          isCorrect: /(?:right|correct)/i.test(status),
          key,
          text: textValue,
          status,
          explanation: extraLines.join(" ")
        });
      }

      index = Math.max(index, cursor - 1);
    }

    return choices;
  }

  const interactiveElements = getNotebookInteractiveElements(root);
  let autoKeyCode = 65;

  const interactiveChoices = interactiveElements
    .map((button, buttonIndex) => {
      const lines = splitNotebookLines(
        button.innerText
        || button.textContent
        || button.getAttribute("aria-label")
        || ""
      );
      if (!lines.length) {
        return null;
      }

      let key = "";
      let text = "";
      let contentLineCount = 1;

      const role = String(button.getAttribute("role") || "");
      const ariaLabel = normalizeNotebookText(button.getAttribute("aria-label") || "");
      const inlineMatch = lines[0].match(/^([A-H])[\.\):]\s*(.+)$/i);
      if (inlineMatch) {
        key = inlineMatch[1].toUpperCase();
        text = inlineMatch[2];
      } else {
        const splitMatch = lines[0].match(/^([A-H])[\.\):]\s*$/i);
        if (splitMatch && lines[1]) {
          key = splitMatch[1].toUpperCase();
          text = lines[1];
          contentLineCount = 2;
        }
      }

      const choiceLike = (
        !!key
        || /^radio$/i.test(role)
        || button.hasAttribute("aria-checked")
        || button.hasAttribute("aria-selected")
        || /^option\b/i.test(ariaLabel)
      );
      if (!choiceLike) {
        return null;
      }

      if (!key) {
        key = String.fromCharCode(autoKeyCode);
        autoKeyCode += 1;
      }

      if (!text) {
        text = lines
          .slice(contentLineCount)
          .find((line) => !isNotebookStatusText(line) && !isNotebookControlText(line) && !isNotebookCounterText(line))
          || lines[0];
      }

      if (!text || isNotebookControlText(text) || isNotebookCounterText(text)) {
        return null;
      }

      let status = "";
      const className = String(button.className || "");
      const extraLines = lines.slice(contentLineCount);

      if (extraLines[0] && /^done$/i.test(extraLines[0])) {
        extraLines.shift();
      }
      if (extraLines[0] && isNotebookStatusText(extraLines[0])) {
        status = extraLines.shift();
      }

      return {
        button,
        buttonIndex,
        className,
        isCorrect: /\bcorrect\b/i.test(className) || /(?:right|correct)/i.test(status),
        key,
        text,
        status,
        explanation: extraLines.join(" ")
      };
    })
    .filter(Boolean);

  if (interactiveChoices.length >= 2) {
    return interactiveChoices.sort((left, right) => left.key.localeCompare(right.key));
  }

  const lineChoices = parseChoiceLines(root ? (root.innerText || root.textContent || "") : "");
  if (!lineChoices.length) {
    return interactiveChoices.sort((left, right) => left.key.localeCompare(right.key));
  }

  return lineChoices
    .map((choice, index) => {
      const interactiveChoice = interactiveChoices[index];
      if (!interactiveChoice) {
        return choice;
      }

      return {
        ...choice,
        button: interactiveChoice.button,
        buttonIndex: interactiveChoice.buttonIndex,
        className: interactiveChoice.className,
        isCorrect: choice.isCorrect || interactiveChoice.isCorrect
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

function scoreNotebookQuestionCandidate(text) {
  const normalized = normalizeNotebookText(text);
  if (!isNotebookQuestionCandidateText(normalized)) {
    return -1;
  }

  let score = 0;
  if (/[?]$/.test(normalized)) {
    score += 3;
  }
  if (/^question\b/i.test(normalized)) {
    score += 2;
  }
  if (normalized.split(/\s+/).length >= 6) {
    score += 2;
  }
  if (normalized.length >= 30) {
    score += 1;
  }
  return score;
}

function cleanNotebookQuestionText(text) {
  return normalizeNotebookText(text)
    .replace(/^(?:Reviewing\s+)?Question\s+\d+\s*:\s*/i, "")
    .replace(/^\d+\s*(?:\/|of)\s*\d+\s*(?:edit\s+)?/i, "")
    .replace(/\s+edit$/i, "")
    .trim();
}

function findNotebookQuestionText(root, choices) {
  const semanticCandidates = queryNotebookAllDeep(
    root,
    "h1, h2, h3, h4, [role='heading'], [aria-label*='question' i], [data-testid*='question' i], [class*='question' i]"
  )
    .map((element) => getNotebookElementText(element))
    .filter(Boolean)
    .sort((left, right) => scoreNotebookQuestionCandidate(right) - scoreNotebookQuestionCandidate(left));

  const semanticChoice = semanticCandidates.find((candidate) => scoreNotebookQuestionCandidate(candidate) >= 2);
  if (semanticChoice) {
    return cleanNotebookQuestionText(semanticChoice);
  }

  const lines = splitNotebookLines(root ? (root.innerText || root.textContent || "") : "");
  const choiceLineIndex = lines.findIndex((line) => {
    if (/^[A-H][\.\):]\s*(?:.+)?$/i.test(line)) {
      return true;
    }

    return choices.some((choice) => {
      const choiceText = normalizeNotebookText(choice.text);
      return choiceText && line === choiceText;
    });
  });

  if (choiceLineIndex > 0) {
    for (let index = choiceLineIndex - 1; index >= 0; index -= 1) {
      const candidate = lines[index];
      if (scoreNotebookQuestionCandidate(candidate) >= 2) {
        return cleanNotebookQuestionText(candidate);
      }
    }
  }

  const fallback = lines
    .filter((line) => scoreNotebookQuestionCandidate(line) >= 2)
    .sort((left, right) => scoreNotebookQuestionCandidate(right) - scoreNotebookQuestionCandidate(left))[0];

  return fallback ? cleanNotebookQuestionText(fallback) : "";
}

function findNotebookButtonIndex(root, pattern) {
  return getNotebookInteractiveElements(root)
    .findIndex((button) => pattern.test(getNotebookElementText(button)));
}

function getNotebookControlPattern(control) {
  switch (control) {
    case "review":
      return /^Review quiz$/i;
    case "retake":
      return /^Retake quiz$/i;
    case "previous":
      return /^(?:Previous question|Previous|Back)$/i;
    case "next":
      return /^(?:Next question|Next)$/i;
    case "finish":
      return /^(?:Finish review|Finish Review|Done|Close)$/i;
    default:
      return null;
  }
}

function hasNotebookControl(root, control) {
  const pattern = getNotebookControlPattern(control);
  if (!pattern) {
    return false;
  }

  return getNotebookInteractiveElements(root)
    .some((button) => pattern.test(getNotebookElementText(button)));
}

function findNotebookOutcomeText(root) {
  const lines = splitNotebookLines(root ? (root.innerText || root.textContent || "") : "");
  return lines.find((line) => /^(?:Not quite|That'?s right!|That is correct!?|That is right!?|Correct|Incorrect)$/i.test(line)) || "";
}

function notebookChoiceStatusText(choice) {
  return normalizeNotebookText(choice && choice.status);
}

function isNotebookCorrectChoice(choice) {
  return !!(
    choice
    && (
      choice.isCorrect
      || /(?:right answer|correct answer|that'?s right!?|that is correct!?|that is right!?|^correct$)/i.test(notebookChoiceStatusText(choice))
      || /\bcorrect\b/i.test(String(choice.className || ""))
    )
  );
}

function isNotebookSelectedChoice(choice) {
  if (!choice) {
    return false;
  }

  const status = notebookChoiceStatusText(choice);
  const className = String(choice.className || "");
  return /\byour answer\b/i.test(status)
    || /\bselected\b/i.test(status)
    || /\bselected\b/i.test(className)
    || /\bchecked\b/i.test(className);
}

function getNotebookSelectedChoice(choices) {
  return (choices || []).find((choice) => isNotebookSelectedChoice(choice)) || null;
}

function sanitizeNotebookExplanationText(text) {
  return normalizeNotebookText(text)
    .replace(/^(?:(?:close|explain|hint)\s+)*/i, "")
    .replace(/^(?:Not quite|Right answer|Correct answer|Correct|Incorrect|Wrong answer|That'?s right!|That is correct!?|That is right!?|Your answer|Selected answer|Answer)(?:\s*\([^)]*\))?\s*/i, "")
    .trim();
}

function isNotebookQuestionMissed(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.choices)) {
    return false;
  }

  if ((snapshot.choices || []).some((choice) => /\bskipped\b/i.test(notebookChoiceStatusText(choice)))) {
    return true;
  }

  const selectedChoice = getNotebookSelectedChoice(snapshot.choices);
  if (selectedChoice && !isNotebookCorrectChoice(selectedChoice)) {
    return true;
  }

  if ((snapshot.choices || []).some((choice) => /\bincorrect\b/i.test(notebookChoiceStatusText(choice)))) {
    return true;
  }

  return /^(?:Not quite|Incorrect)$/i.test(normalizeNotebookText(snapshot.outcomeText));
}

function getNotebookExplanationText(snapshot, correctChoice) {
  const explanationParts = [];
  const correctExplanation = sanitizeNotebookExplanationText(correctChoice && correctChoice.explanation);
  if (correctExplanation) {
    explanationParts.push(correctExplanation);
  }

  for (const choice of (snapshot && snapshot.choices) || []) {
    const explanation = sanitizeNotebookExplanationText(choice && choice.explanation);
    if (explanation && !explanationParts.includes(explanation)) {
      explanationParts.push(explanation);
    }
  }

  return explanationParts.join("\n\n");
}

function looksLikeNotebookReviewState(snapshot) {
  return !!(
    snapshot
    && (
      snapshot.mode === "summary"
      || (
        snapshot.mode === "question"
        && snapshot.answered
        && (
          snapshot.currentIndex > 0
          || snapshot.canFinishReview
          || /^(?:Not quite|That'?s right!|That is correct!?|That is right!?|Correct|Incorrect)$/i.test(normalizeNotebookText(snapshot.outcomeText))
          || (snapshot.choices || []).some((choice) => isNotebookSelectedChoice(choice))
        )
      )
    )
  );
}

function isNotebookLmQuestionSnapshot(snapshot) {
  return !!(
    snapshot
    && snapshot.mode === "question"
    && Number.isInteger(snapshot.currentIndex)
    && snapshot.currentIndex >= 0
    && Number.isInteger(snapshot.totalQuestions)
    && snapshot.totalQuestions > 0
    && shared.trimInline(snapshot.questionText)
    && Array.isArray(snapshot.choices)
    && snapshot.choices.length > 0
  );
}

function isNotebookLmSummarySnapshot(snapshot) {
  return !!(
    snapshot
    && snapshot.mode === "summary"
    && Number.isInteger(snapshot.totalQuestions)
    && snapshot.totalQuestions > 0
    && snapshot.canReview
  );
}

function isNotebookLmFrameState(snapshot) {
  return isNotebookLmQuestionSnapshot(snapshot) || isNotebookLmSummarySnapshot(snapshot);
}

function notebookAnswerIsRevealed(choices, outcomeText) {
  return choices.some((choice) => choice.status || choice.explanation || choice.isCorrect)
    || /^(?:Not quite|That'?s right!|That is correct!?|That is right!?|Correct|Incorrect)$/i.test(normalizeNotebookText(outcomeText));
}

function snapshotNotebookFrameDocument() {
  const root = document.body || document.documentElement;
  if (!root) {
    return null;
  }

  const counter = parseNotebookCounter(root);
  const choices = parseNotebookChoiceButtons(root);
  const questionText = findNotebookQuestionText(root, choices);
  const outcomeText = findNotebookOutcomeText(root);
  const summaryHeading = getNotebookElementText(
    queryNotebookAllDeep(root, "h1, h2, h3, h4, [role='heading']").find((element) => /quiz complete/i.test(getNotebookElementText(element)))
  );

  if (counter.total && hasNotebookControl(root, "review") && !choices.length) {
    return {
      mode: "summary",
      totalQuestions: counter.total,
      scoreCount: counter.current,
      canReview: true,
      canRetake: hasNotebookControl(root, "retake"),
      summaryHeading: summaryHeading || "Quiz complete"
    };
  }

  if (!counter.current || !counter.total || !choices.length || !questionText) {
    return null;
  }

  return {
    mode: "question",
    currentIndex: counter.current - 1,
    totalQuestions: counter.total,
    questionText,
    choices: choices.map(({ button, ...choice }) => choice),
    answered: notebookAnswerIsRevealed(choices, outcomeText),
    canGoNext: hasNotebookControl(root, "next") || hasNotebookControl(root, "finish"),
    canGoPrevious: hasNotebookControl(root, "previous"),
    canFinishReview: hasNotebookControl(root, "finish"),
    outcomeText
  };
}

async function getNotebookLmFrameSnapshotOrChildSnapshot() {
  const localSnapshot = snapshotNotebookFrameDocument();
  if (isNotebookLmFrameState(localSnapshot)) {
    return localSnapshot;
  }

  for (const childWindow of getNotebookChildWindows()) {
    try {
      const childSnapshot = await requestNotebookBridgeAction(childWindow, "snapshot", {}, 700);
      if (isNotebookLmFrameState(childSnapshot)) {
        return childSnapshot;
      }
    } catch (error) {
      // Ignore non-quiz frames while searching.
    }
  }

  return null;
}

function clickNotebookFrameControl(control) {
  const pattern = getNotebookControlPattern(control);
  if (!pattern) {
    return false;
  }

  const button = getNotebookInteractiveElements(document)
    .find((candidate) => pattern.test(getNotebookElementText(candidate)));
  if (!button) {
    return false;
  }

  button.click();
  return true;
}

function clickNotebookFrameChoice(buttonIndex) {
  if (!Number.isInteger(buttonIndex) || buttonIndex < 0) {
    return false;
  }

  const button = getNotebookInteractiveElements(document)[buttonIndex];
  if (!button) {
    return false;
  }

  button.click();
  return true;
}

async function clickNotebookLmFrameControlOrChild(control) {
  if (clickNotebookFrameControl(control)) {
    return true;
  }

  for (const childWindow of getNotebookChildWindows()) {
    try {
      await requestNotebookBridgeAction(childWindow, "clickControl", { control }, 700);
      return true;
    } catch (error) {
      // Keep searching for the active quiz frame.
    }
  }

  throw new Error("NotebookLM control button was not found.");
}

async function clickNotebookLmFrameChoiceOrChild(buttonIndex) {
  if (clickNotebookFrameChoice(buttonIndex)) {
    return true;
  }

  for (const childWindow of getNotebookChildWindows()) {
    try {
      await requestNotebookBridgeAction(childWindow, "clickButton", { buttonIndex }, 700);
      return true;
    } catch (error) {
      // Keep searching for the active quiz frame.
    }
  }

  throw new Error("NotebookLM answer choice was not found.");
}

async function findNotebookLmBridgeTarget(predicate, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const localSnapshot = snapshotNotebookFrameDocument();
    if (isNotebookLmFrameState(localSnapshot) && predicate(localSnapshot)) {
      return {
        targetWindow: window,
        snapshot: localSnapshot
      };
    }

    for (const childWindow of getNotebookChildWindows()) {
      try {
        const snapshot = await requestNotebookBridgeAction(childWindow, "snapshot", {}, 1200);
        if (isNotebookLmFrameState(snapshot) && predicate(snapshot)) {
          return {
            targetWindow: childWindow,
            snapshot
          };
        }
      } catch (error) {
        // Ignore non-responsive frames while polling.
      }
    }

    await sleep(150);
  }

  throw new Error(
    `Open a NotebookLM quiz in the Studio app viewer first. ` +
    `Debug: top=${window === window.top ? "yes" : "no"}, frames=${getNotebookChildWindows().length}, ` +
    `interactive=${getNotebookInteractiveElements(document).length}, title=${JSON.stringify(document.title || "")}.`
  );
}

async function waitForNotebookLmBridge(targetWindow, test, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const candidateWindows = [];
    const seenWindows = new Set();

    function addCandidate(win) {
      if (!win || seenWindows.has(win)) {
        return;
      }
      seenWindows.add(win);
      candidateWindows.push(win);
    }

    addCandidate(targetWindow);
    addCandidate(window);
    for (const childWindow of getNotebookChildWindows()) {
      addCandidate(childWindow);
    }

    for (const candidateWindow of candidateWindows) {
      try {
        const snapshot = candidateWindow === window
          ? snapshotNotebookFrameDocument()
          : await requestNotebookBridgeAction(candidateWindow, "snapshot", {}, 1200);
        if (isNotebookLmFrameState(snapshot) && test(snapshot)) {
          return {
            targetWindow: candidateWindow,
            snapshot
          };
        }
      } catch (error) {
        // Keep polling. NotebookLM can remount the review frame mid-export.
      }
    }

    await sleep(150);
  }

  throw new Error("Timed out waiting for NotebookLM quiz data.");
}

function buildNotebookQuizMeta(meta) {
  const notebookId = shared.trimInline(window.location.pathname.split("/").filter(Boolean).pop() || "notebook");
  return {
    source: "notebooklm",
    id: `${notebookId}::${shared.slugifyTagSegment(meta.quizTitle || "notebooklm_quiz")}`,
    title: meta.quizTitle || "NotebookLM Quiz",
    category: meta.notebookTitle || "NotebookLM",
    subcategory: "NotebookLM Quiz"
  };
}

function getNotebookLmTopMetadata() {
  return {
    notebookTitle: findNotebookTitle(),
    quizTitle: findNotebookArtifactTitle()
  };
}

function buildNotebookQuestionStub(snapshot) {
  return {
    id: `q${snapshot.currentIndex + 1}`,
    order: `${snapshot.currentIndex + 1} of ${snapshot.totalQuestions}`,
    stem: snapshot.questionText,
    choices: Object.fromEntries(snapshot.choices.map((choice) => [choice.key, choice.text]))
  };
}

function buildNotebookQuestionFromSnapshot(snapshot) {
  const correctChoice = snapshot.choices.find((choice) => isNotebookCorrectChoice(choice));
  if (!correctChoice) {
    throw new Error("Could not determine the correct answer from NotebookLM.");
  }

  const selectedChoice = getNotebookSelectedChoice(snapshot.choices);

  return {
    id: `q${snapshot.currentIndex + 1}`,
    order: `${snapshot.currentIndex + 1} of ${snapshot.totalQuestions}`,
    original_index: snapshot.currentIndex,
    stem: snapshot.questionText,
    choices: Object.fromEntries(snapshot.choices.map((choice) => [choice.key, choice.text])),
    correct_answer: correctChoice.key,
    explanation: getNotebookExplanationText(snapshot, correctChoice),
    selected_answer: selectedChoice ? selectedChoice.key : "",
    was_missed: isNotebookQuestionMissed(snapshot),
    reference: "",
    learning_objective: null
  };
}

async function clickNotebookLmControl(targetWindow, control) {
  async function tryClick(candidateWindow) {
    if (candidateWindow === window) {
      if (!clickNotebookFrameControl(control)) {
        throw new Error("NotebookLM control button was not found.");
      }
      return;
    }

    await requestNotebookBridgeAction(candidateWindow, "clickControl", { control }, 1200);
  }

  try {
    await tryClick(targetWindow);
    return;
  } catch (error) {
    const recovered = await findNotebookLmBridgeTarget(() => true, 2000).catch(() => null);
    if (recovered && recovered.targetWindow !== targetWindow) {
      await tryClick(recovered.targetWindow);
      return;
    }
    throw error;
  }
}

async function clickNotebookLmChoice(targetWindow, buttonIndex) {
  async function tryClick(candidateWindow) {
    if (candidateWindow === window) {
      if (!clickNotebookFrameChoice(buttonIndex)) {
        throw new Error("NotebookLM answer choice was not found.");
      }
      return;
    }

    await requestNotebookBridgeAction(candidateWindow, "clickButton", { buttonIndex }, 1200);
  }

  try {
    await tryClick(targetWindow);
    return;
  } catch (error) {
    const recovered = await findNotebookLmBridgeTarget(
      (snapshot) => snapshot && snapshot.mode === "question" && Array.isArray(snapshot.choices) && snapshot.choices.length > buttonIndex,
      2000
    ).catch(() => null);
    if (recovered && recovered.targetWindow !== targetWindow) {
      await tryClick(recovered.targetWindow);
      return;
    }
    throw error;
  }
}

async function ensureNotebookAnswerRevealed(bridge) {
  if (bridge.snapshot.answered) {
    return {
      bridge,
      revealedDuringExport: false
    };
  }

  const firstChoice = bridge.snapshot.choices[0];
  if (!firstChoice) {
    throw new Error("No answer choices were found in NotebookLM.");
  }

  await clickNotebookLmChoice(bridge.targetWindow, firstChoice.buttonIndex);
  const revealedBridge = await waitForNotebookLmBridge(
    bridge.targetWindow,
    (next) => next.currentIndex === bridge.snapshot.currentIndex && next.answered,
    6000
  );

  return {
    bridge: revealedBridge,
    revealedDuringExport: true
  };
}

function notebookQuizExportNote(kind) {
  if (kind === "quiz") {
    return "NotebookLM note: exporting the full quiz revealed each answer inside the quiz viewer.";
  }
  if (kind === "missed") {
    return "NotebookLM note: exporting missed questions uses the reviewed quiz state and keeps only the questions you got wrong.";
  }
  return "NotebookLM note: exporting the current question revealed its answer inside the quiz viewer.";
}

function getNotebookLmPageContext() {
  return findNotebookLmBridgeTarget(() => true, 6000).then((bridge) => {
    const meta = getNotebookLmTopMetadata();
    const quizData = buildNotebookQuizMeta(meta);
    const currentQuestion = bridge.snapshot.mode === "question"
      ? buildNotebookQuestionStub(bridge.snapshot)
      : null;

    return {
      source: "notebooklm",
      siteLabel: "NotebookLM",
      currentIndex: bridge.snapshot.mode === "question" ? bridge.snapshot.currentIndex : 0,
      currentQuestion,
      quizData: {
        ...quizData,
        questions: currentQuestion ? [currentQuestion] : []
      },
      pageSummary: bridge.snapshot.mode === "question"
        ? `${quizData.title} • Question ${bridge.snapshot.currentIndex + 1} of ${bridge.snapshot.totalQuestions}`
        : `${quizData.title} • ${bridge.snapshot.summaryHeading || "Quiz summary"} detected`,
      exportBehaviorNote: bridge.snapshot.mode === "summary"
        ? "Quiz summary detected. Add full quiz or Add missed questions will open Review quiz and capture the reviewed questions."
        : bridge.snapshot.currentIndex === 0
          ? "Full NotebookLM quiz export reveals answers as it captures them. Add missed questions works after the quiz is complete or while Review quiz is open."
          : "Current-question export works anywhere. Full NotebookLM quiz export rewinds to question 1 and reveals answers as it captures them.",
      capabilities: {
        exportCurrentQuestion: bridge.snapshot.mode === "question",
        exportCurrentQuiz: bridge.snapshot.totalQuestions > 0,
        exportMissedQuestions: bridge.snapshot.mode === "summary" || bridge.snapshot.answered || looksLikeNotebookReviewState(bridge.snapshot)
      }
    };
  });
}

async function collectNotebookLmQuestionExportContext() {
  const bridge = await findNotebookLmBridgeTarget(() => true, 6000);
  if (bridge.snapshot.mode !== "question") {
    throw new Error("Current-question export is only available while a NotebookLM question is open. Use Add full quiz from the quiz summary screen.");
  }
  const result = await ensureNotebookAnswerRevealed(bridge);
  const quizData = buildNotebookQuizMeta(getNotebookLmTopMetadata());
  const question = buildNotebookQuestionFromSnapshot(result.bridge.snapshot);

  return {
    source: "notebooklm",
    currentIndex: result.bridge.snapshot.currentIndex,
    currentQuestion: question,
    quizData: {
      ...quizData,
      questions: [question]
    },
    exportNotice: result.revealedDuringExport ? notebookQuizExportNote("question") : ""
  };
}

async function collectNotebookLmQuizExportContext() {
  let bridge = await findNotebookLmBridgeTarget(() => true, 6000);
  if (bridge.snapshot.mode === "summary") {
    await clickNotebookLmControl(bridge.targetWindow, "review");
    bridge = await waitForNotebookLmBridge(
      bridge.targetWindow,
      (snapshot) => isNotebookLmQuestionSnapshot(snapshot),
      8000
    );
    await sleep(250);
  }

  if (bridge.snapshot.mode !== "question") {
    throw new Error("Could not open NotebookLM review mode for quiz export.");
  }

  let rewoundDuringExport = false;
  while (bridge.snapshot.currentIndex > 0) {
    if (!bridge.snapshot.canGoPrevious) {
      throw new Error("Could not rewind the NotebookLM quiz back to question 1.");
    }

    const startingIndex = bridge.snapshot.currentIndex;
    await clickNotebookLmControl(bridge.targetWindow, "previous");
    bridge = await waitForNotebookLmBridge(
      bridge.targetWindow,
      (snapshot) => snapshot.currentIndex < startingIndex,
      6000
    );
    rewoundDuringExport = true;
    await sleep(200);
  }

  const quizData = buildNotebookQuizMeta(getNotebookLmTopMetadata());
  const questions = [];
  const visitedIndexes = new Set();

  while (!visitedIndexes.has(bridge.snapshot.currentIndex)) {
    const currentIndex = bridge.snapshot.currentIndex;
    visitedIndexes.add(currentIndex);

    if (questions.length >= bridge.snapshot.totalQuestions) {
      break;
    }

    const revealed = await ensureNotebookAnswerRevealed(bridge);
    questions.push(buildNotebookQuestionFromSnapshot(revealed.bridge.snapshot));
    bridge = revealed.bridge;

    if (!bridge.snapshot.canGoNext || bridge.snapshot.canFinishReview) {
      break;
    }

    await clickNotebookLmControl(bridge.targetWindow, "next");
    let nextBridge = null;

    try {
      nextBridge = await waitForNotebookLmBridge(
        bridge.targetWindow,
        (snapshot) => snapshot.currentIndex !== currentIndex,
        4000
      );
    } catch (error) {
      break;
    }

    if (visitedIndexes.has(nextBridge.snapshot.currentIndex)) {
      break;
    }

    bridge = nextBridge;
    await sleep(200);
  }

  return {
    source: "notebooklm",
    currentIndex: 0,
    currentQuestion: questions[0] || null,
    quizData: {
      ...quizData,
      questions
    },
    exportNotice: rewoundDuringExport
      ? "NotebookLM note: exporting the full quiz rewound the viewer to question 1 and revealed each answer inside the quiz viewer."
      : notebookQuizExportNote("quiz")
  };
}

async function collectNotebookLmMissedQuestionsContext() {
  let bridge = await findNotebookLmBridgeTarget(() => true, 6000);
  if (bridge.snapshot.mode === "summary") {
    await clickNotebookLmControl(bridge.targetWindow, "review");
    bridge = await waitForNotebookLmBridge(
      bridge.targetWindow,
      (snapshot) => isNotebookLmQuestionSnapshot(snapshot),
      8000
    );
    await sleep(250);
  }

  if (bridge.snapshot.mode !== "question") {
    throw new Error("Open Review quiz in NotebookLM before exporting missed questions.");
  }

  if (!bridge.snapshot.answered && !looksLikeNotebookReviewState(bridge.snapshot)) {
    throw new Error("NotebookLM missed-question export works after the quiz is complete or while Review quiz is open.");
  }

  let rewoundDuringExport = false;
  while (bridge.snapshot.currentIndex > 0) {
    if (!bridge.snapshot.canGoPrevious) {
      throw new Error("Could not rewind the NotebookLM review back to question 1.");
    }

    const startingIndex = bridge.snapshot.currentIndex;
    await clickNotebookLmControl(bridge.targetWindow, "previous");
    bridge = await waitForNotebookLmBridge(
      bridge.targetWindow,
      (snapshot) => snapshot.currentIndex < startingIndex,
      6000
    );
    rewoundDuringExport = true;
    await sleep(200);
  }

  const quizData = buildNotebookQuizMeta(getNotebookLmTopMetadata());
  const missedQuestions = [];
  const visitedIndexes = new Set();

  while (!visitedIndexes.has(bridge.snapshot.currentIndex)) {
    const currentIndex = bridge.snapshot.currentIndex;
    visitedIndexes.add(currentIndex);

    if (!bridge.snapshot.answered) {
      throw new Error("NotebookLM missed-question export needs the completed quiz review. Finish the quiz and open Review quiz first.");
    }

    const question = buildNotebookQuestionFromSnapshot(bridge.snapshot);
    if (question.was_missed) {
      missedQuestions.push(question);
    }

    if (!bridge.snapshot.canGoNext || bridge.snapshot.canFinishReview) {
      break;
    }

    await clickNotebookLmControl(bridge.targetWindow, "next");
    let nextBridge = null;

    try {
      nextBridge = await waitForNotebookLmBridge(
        bridge.targetWindow,
        (snapshot) => snapshot.currentIndex !== currentIndex,
        4000
      );
    } catch (error) {
      break;
    }

    if (visitedIndexes.has(nextBridge.snapshot.currentIndex)) {
      break;
    }

    bridge = nextBridge;
    await sleep(200);
  }

  if (!missedQuestions.length) {
    throw new Error("No missed NotebookLM questions were found in this reviewed quiz.");
  }

  return {
    source: "notebooklm",
    currentIndex: 0,
    currentQuestion: missedQuestions[0] || null,
    quizData: {
      ...quizData,
      questions: missedQuestions
    },
    exportNotice: rewoundDuringExport
      ? "NotebookLM note: exporting missed questions rewound the review to question 1 and kept only the questions you got wrong."
      : notebookQuizExportNote("missed")
  };
}

function showToast(message, kind) {
  const toast = document.createElement("div");
  toast.className = `aiig-anki-toast ${kind === "success" ? "is-success" : ""}${kind === "error" ? " is-error" : ""}`;
  toast.textContent = message;
  document.documentElement.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 180);
  }, 2600);
}
