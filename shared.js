(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AIIGAnkiShared = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const QBANK_ORIGIN = "https://aiig-qbank.up.railway.app";
  const QBANK_API_BASE = `${QBANK_ORIGIN}/api`;
  const NOTEBOOKLM_ORIGIN = "https://notebooklm.google.com";
  const ANKI_ENDPOINTS = ["http://127.0.0.1:8765", "http://localhost:8765"];
  const DEFAULT_SETTINGS = {
    deckRoot: "",
    deckStrategy: "quiz",
    noteModelName: "Study Quiz Rich",
    extraTags: "",
    allowDuplicates: false
  };

  function mergeSettings(saved) {
    const merged = { ...DEFAULT_SETTINGS, ...(saved || {}) };

    merged.deckRoot = trimInline(merged.deckRoot);
    if (merged.deckRoot === "Study Quiz Exports") {
      merged.deckRoot = "";
    }

    merged.deckStrategy = merged.deckStrategy === "single"
      ? "single"
      : DEFAULT_SETTINGS.deckStrategy;
    merged.noteModelName = trimInline(merged.noteModelName) || DEFAULT_SETTINGS.noteModelName;
    merged.extraTags = String(merged.extraTags || "");
    merged.allowDuplicates = !!merged.allowDuplicates;

    return merged;
  }

  function trimInline(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function nl2br(value) {
    return escapeHtml(value).replace(/\r?\n/g, "<br>");
  }

  function textBlockToHtml(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    return raw
      .split(/\r?\n\s*\r?\n/g)
      .map((paragraph) => `<p>${nl2br(paragraph.trim())}</p>`)
      .join("");
  }

  function sanitizeDeckSegment(value) {
    return trimInline(value).replace(/::+/g, " - ");
  }

  function pushDeckSegment(parts, value) {
    const segment = sanitizeDeckSegment(value);
    if (!segment) {
      return;
    }

    if (parts[parts.length - 1] !== segment) {
      parts.push(segment);
    }
  }

  function resolveDeckGroup(meta) {
    if (!meta) {
      return "";
    }

    return meta.deckGroup || meta.category || meta.subcategory || "";
  }

  function slugifyTagSegment(value) {
    const slug = trimInline(value)
      .toLowerCase()
      .replace(/::+/g, " ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return slug || "unknown";
  }

  function parseExtraTags(value) {
    return String(value || "")
      .split(/[\s,]+/g)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => tag.replace(/\s+/g, "_"));
  }

  function buildDeckName(meta, settings) {
    const merged = mergeSettings(settings);
    const parts = [];

    pushDeckSegment(parts, merged.deckRoot);
    pushDeckSegment(parts, meta && meta.source ? sourceLabelFor(meta.source) : "");

    if (merged.deckStrategy === "single") {
      return parts.join("::") || "Study Quiz";
    }

    pushDeckSegment(parts, resolveDeckGroup(meta));
    if (merged.deckStrategy === "quiz") {
      pushDeckSegment(parts, meta && meta.title ? meta.title : "");
    }

    return parts.join("::") || "Study Quiz";
  }

  function sourceLabelFor(source) {
    if (source === "notebooklm") {
      return "NotebookLM Qbank";
    }
    return "AIIG Qbank";
  }

  function buildTags(meta, settings) {
    const merged = mergeSettings(settings);
    const source = meta && meta.source ? slugifyTagSegment(meta.source) : "unknown";
    const tags = ["study_quiz_export", `source::${source}`];

    if (source === "aiig") {
      tags.push("aiig_qbank");
    }
    if (source === "notebooklm") {
      tags.push("notebooklm_quiz");
    }

    if (meta && meta.category) {
      tags.push(`category::${slugifyTagSegment(meta.category)}`);
    }
    if (meta && meta.subcategory) {
      tags.push(`subcategory::${slugifyTagSegment(meta.subcategory)}`);
    }
    if (meta && meta.quizId) {
      tags.push(`quiz::${slugifyTagSegment(meta.quizId)}`);
    }
    if (meta && meta.questionId !== undefined && meta.questionId !== null) {
      tags.push(`question::${slugifyTagSegment(meta.questionId)}`);
    }

    return [...new Set(tags.concat(parseExtraTags(merged.extraTags)).filter(Boolean))];
  }

  function questionNumberLabel(question, index, total) {
    const base = Number.isInteger(index) ? String(index + 1) : "";
    const totalPart = Number.isInteger(total) && total > 0 ? ` of ${total}` : "";

    if (question && question.order && base) {
      return String(question.order);
    }
    if (base) {
      return `${base}${totalPart}`;
    }
    if (question && question.order) {
      return String(question.order);
    }

    return "";
  }

  function questionStateKeys(question, index) {
    const keys = [];

    if (question && question.id !== undefined && question.id !== null) {
      keys.push(question.id, String(question.id));
    }
    if (Number.isInteger(index)) {
      keys.push(index + 1, String(index + 1));
    }

    return [...new Set(keys.filter((value) => value !== undefined && value !== null && value !== ""))];
  }

  function readQuestionState(record, question, index) {
    if (!record || typeof record !== "object") {
      return null;
    }

    for (const key of questionStateKeys(question, index)) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        return record[key];
      }
    }

    return null;
  }

  function normalizeAiigChoice(value) {
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "string") {
      return trimInline(value).toUpperCase();
    }
    if (typeof value === "number") {
      return String(value).trim().toUpperCase();
    }
    if (typeof value === "object") {
      return normalizeAiigChoice(
        value.choice !== undefined ? value.choice
          : value.answer !== undefined ? value.answer
            : value.selected !== undefined ? value.selected
              : value.value
      );
    }

    return "";
  }

  function isConfirmedQuestion(record, question, index) {
    const value = readQuestionState(record, question, index);
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value > 0;
    }
    if (typeof value === "string") {
      const lowered = value.trim().toLowerCase();
      return lowered === "true" || lowered === "1" || lowered === "yes";
    }
    if (value && typeof value === "object") {
      if (typeof value.confirmed === "boolean") {
        return value.confirmed;
      }
      if (typeof value.isConfirmed === "boolean") {
        return value.isConfirmed;
      }
      return true;
    }

    return false;
  }

  function isAiigQuestionMissed(question, context, index) {
    if (!question || !context || !isConfirmedQuestion(context.confirmed, question, index)) {
      return false;
    }

    const selected = normalizeAiigChoice(readQuestionState(context.answers, question, index));
    const correct = normalizeAiigChoice(question.correct_answer);
    return !!selected && !!correct && selected !== correct;
  }

  function collectAiigMissedQuestionEntries(quizData, context) {
    const questions = quizData && Array.isArray(quizData.questions) ? quizData.questions : [];
    const entries = [];

    for (const [index, question] of questions.entries()) {
      if (isAiigQuestionMissed(question, context, index)) {
        entries.push({ question, index });
      }
    }

    return entries;
  }

  function serializeError(error) {
    if (!error) {
      return "Unknown error";
    }
    if (typeof error === "string") {
      return error;
    }
    if (error.message) {
      return error.message;
    }
    try {
      return JSON.stringify(error);
    } catch (jsonError) {
      return String(error);
    }
  }

  function isAiigUrl(url) {
    return typeof url === "string" && url.startsWith(QBANK_ORIGIN);
  }

  function isNotebookLmUrl(url) {
    return typeof url === "string" && url.startsWith(NOTEBOOKLM_ORIGIN);
  }

  function detectSupportedSite(url) {
    if (isAiigUrl(url)) {
      return "aiig";
    }
    if (isNotebookLmUrl(url)) {
      return "notebooklm";
    }
    return null;
  }

  function storageArea() {
    return (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) ? chrome.storage.sync : null;
  }

  async function storageGet(keys) {
    const area = storageArea();
    if (!area) {
      return {};
    }
    return area.get(keys);
  }

  async function storageSet(values) {
    const area = storageArea();
    if (!area) {
      return;
    }
    await area.set(values);
  }

  async function loadSettings() {
    const saved = await storageGet(DEFAULT_SETTINGS);
    return mergeSettings(saved);
  }

  async function saveSettings(partial) {
    const next = mergeSettings({
      ...(await storageGet(DEFAULT_SETTINGS)),
      ...(partial || {})
    });
    await storageSet(next);
    return next;
  }

  return {
    ANKI_ENDPOINTS,
    DEFAULT_SETTINGS,
    NOTEBOOKLM_ORIGIN,
    QBANK_API_BASE,
    QBANK_ORIGIN,
    buildDeckName,
    buildTags,
    collectAiigMissedQuestionEntries,
    detectSupportedSite,
    escapeHtml,
    isAiigUrl,
    isAiigQuestionMissed,
    isNotebookLmUrl,
    loadSettings,
    mergeSettings,
    nl2br,
    parseExtraTags,
    pushDeckSegment,
    questionNumberLabel,
    resolveDeckGroup,
    sanitizeDeckSegment,
    saveSettings,
    serializeError,
    slugifyTagSegment,
    sourceLabelFor,
    storageGet,
    storageSet,
    textBlockToHtml,
    trimInline
  };
});
