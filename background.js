importScripts("shared.js", "card-format.js");

const shared = self.AIIGAnkiShared;
const cards = self.AIIGAnkiCards;
const ANKI_API_VERSION = 5;
const MODEL_CARD_NAME = "Card 1";

chrome.runtime.onInstalled.addListener(async () => {
  await shared.saveSettings({});
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id || !shared.detectSupportedSite(tab.url || "")) {
    return;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "toggleQuickExporter" });
      return;
    } catch (error) {
      if (attempt === 3) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: shared.serializeError(error)
      });
    });

  return true;
});

async function handleMessage(message, sender) {
  const messageType = resolveMessageType(message);

  switch (messageType) {
    case "checkAnki":
      return checkAnki();
    case "authorizeAnki":
      return authorizeAnki();
    case "getSettings":
      return {
        ok: true,
        settings: await shared.loadSettings()
      };
    case "saveSettings":
      return {
        ok: true,
        settings: await shared.saveSettings(message.settings || {})
      };
    case "getQuizzes":
      return {
        ok: true,
        quizzes: await fetchQbankJson("/quizzes")
      };
    case "getQuizById":
      return {
        ok: true,
        quiz: await fetchQuizDetails(message.quizId)
      };
    case "exportCurrentQuestion":
      return exportCurrentQuestion(message.context);
    case "exportCurrentQuiz":
      return exportCurrentQuiz(message.context);
    case "exportMissedQuestions":
      return exportMissedQuestions(message.context);
    case "exportQuizById":
      return exportQuizById(message.quizId);
    default:
      return {
        ok: false,
        error: `Unknown message type: ${describeUnknownMessage(message)}`
      };
  }
}

function resolveMessageType(message) {
  if (!message || typeof message !== "object") {
    return "";
  }

  const rawType = normalizeMessageToken(message.type);
  const rawAction = normalizeMessageToken(message.action);
  const candidate = rawType || rawAction;

  switch (candidate) {
    case "checkAnki":
    case "authorizeAnki":
    case "getSettings":
    case "saveSettings":
    case "getQuizzes":
    case "getQuizById":
    case "exportCurrentQuestion":
    case "exportCurrentQuiz":
    case "exportMissedQuestions":
    case "exportQuizById":
      return candidate;
    case "exportMissedQuestion":
    case "addMissedQuestions":
    case "addMissedQuestion":
    case "exportIncorrectQuestions":
    case "exportWrongQuestions":
      return "exportMissedQuestions";
    case "exportQuestion":
    case "addCurrentQuestion":
      return "exportCurrentQuestion";
    case "exportQuiz":
    case "addCurrentQuiz":
      return "exportCurrentQuiz";
    default:
      break;
  }

  const requestedScope = normalizeMessageToken(message.scope);
  if (requestedScope === "missed") {
    return "exportMissedQuestions";
  }
  if (requestedScope === "question") {
    return "exportCurrentQuestion";
  }
  if (requestedScope === "quiz" && message.quizId) {
    return "exportQuizById";
  }
  if (requestedScope === "quiz") {
    return "exportCurrentQuiz";
  }

  return candidate;
}

function normalizeMessageToken(value) {
  return typeof value === "string" ? value.trim() : "";
}

function describeUnknownMessage(message) {
  if (!message || typeof message !== "object") {
    return String(message);
  }

  const details = [];
  if (normalizeMessageToken(message.type)) {
    details.push(`type=${message.type}`);
  }
  if (normalizeMessageToken(message.action)) {
    details.push(`action=${message.action}`);
  }
  if (normalizeMessageToken(message.scope)) {
    details.push(`scope=${message.scope}`);
  }
  if (!details.length) {
    details.push(`keys=${Object.keys(message).sort().join(",") || "(none)"}`);
  }

  return details.join(" ");
}

async function fetchQbankJson(path) {
  const response = await fetch(`${shared.QBANK_API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`QBank request failed (${response.status})`);
  }
  return response.json();
}

async function fetchQuizDetails(quizId) {
  if (!quizId) {
    throw new Error("Quiz ID is required.");
  }
  const quiz = await fetchQbankJson(`/quizzes/${encodeURIComponent(quizId)}`);
  if (!quiz.source) {
    quiz.source = "aiig";
  }
  return quiz;
}

async function ankiInvoke(action, params) {
  let lastError = null;

  for (const endpoint of shared.ANKI_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          version: ANKI_API_VERSION,
          params: params || {}
        })
      });

      const payload = await response.json();
      if (payload.error) {
        throw new Error(payload.error);
      }
      return payload.result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Could not connect to AnkiConnect.");
}

function friendlyAnkiError(error) {
  const message = shared.serializeError(error);
  const lowered = message.toLowerCase();

  if (lowered.includes("failed to fetch") || lowered.includes("networkerror")) {
    return "Could not reach AnkiConnect. Open Anki Desktop and make sure the AnkiConnect add-on is installed.";
  }
  if (lowered.includes("cors")) {
    return "AnkiConnect blocked the request. Try the Authorize button in the extension and accept the prompt inside Anki.";
  }

  return message;
}

async function checkAnki() {
  try {
    const version = await ankiInvoke("version");
    return { ok: true, version };
  } catch (error) {
    return { ok: false, error: friendlyAnkiError(error) };
  }
}

async function authorizeAnki() {
  try {
    const permission = await ankiInvoke("requestPermission");
    if (permission && permission.permission === "denied") {
      return {
        ok: false,
        error: "Permission was denied in the AnkiConnect prompt."
      };
    }

    const version = await ankiInvoke("version");
    return {
      ok: true,
      version,
      permission
    };
  } catch (error) {
    return {
      ok: false,
      error: friendlyAnkiError(error)
    };
  }
}

async function ensureDecks(deckNames) {
  const existing = new Set(await ankiInvoke("deckNames"));

  for (const deckName of deckNames) {
    if (!deckName || existing.has(deckName)) {
      continue;
    }
    await ankiInvoke("createDeck", { deck: deckName });
    existing.add(deckName);
  }
}

async function ensureModel(modelName) {
  const modelNames = await ankiInvoke("modelNames");

  if (!modelNames.includes(modelName)) {
    await ankiInvoke("createModel", {
      modelName,
      inOrderFields: cards.MODEL_FIELDS,
      cardTemplates: [
        {
          Name: MODEL_CARD_NAME,
          Front: cards.FRONT_TEMPLATE,
          Back: cards.BACK_TEMPLATE
        }
      ],
      css: cards.MODEL_CSS
    });
    return;
  }

  await ankiInvoke("updateModelTemplates", {
    model: {
      name: modelName,
      templates: {
        [MODEL_CARD_NAME]: {
          Front: cards.FRONT_TEMPLATE,
          Back: cards.BACK_TEMPLATE
        }
      }
    }
  });

  await ankiInvoke("updateModelStyling", {
    model: {
      name: modelName,
      css: cards.MODEL_CSS
    }
  });
}

async function moveCreatedCardsToDecks(createdNotes) {
  if (!createdNotes.length) {
    return;
  }

  const deckByNoteId = new Map(
    createdNotes.map(({ noteId, deckName }) => [String(noteId), deckName])
  );
  const noteInfos = await ankiInvoke("notesInfo", {
    notes: createdNotes.map(({ noteId }) => noteId)
  });
  const cardsByDeck = new Map();

  for (const noteInfo of noteInfos || []) {
    const deckName = deckByNoteId.get(String(noteInfo && noteInfo.noteId));
    const cardIds = noteInfo && Array.isArray(noteInfo.cards) ? noteInfo.cards : [];

    if (!deckName || !cardIds.length) {
      continue;
    }

    if (!cardsByDeck.has(deckName)) {
      cardsByDeck.set(deckName, []);
    }

    cardsByDeck.get(deckName).push(...cardIds);
  }

  for (const [deckName, cardIds] of cardsByDeck.entries()) {
    await ankiInvoke("changeDeck", {
      cards: [...new Set(cardIds)],
      deck: deckName
    });
  }
}

function summarizeExport(result, scope) {
  const createdText = scope === "missed"
    ? (result.created === 1 ? "Added 1 missed question to Anki." : `Added ${result.created} missed questions to Anki.`)
    : result.created === 1
      ? "Added 1 card to Anki."
      : `Added ${result.created} ${scope === "question" ? "card" : "cards"} to Anki.`;

  if (result.created === 0 && result.skippedDuplicates > 0 && result.failed === 0) {
    return scope === "question"
      ? "That question is already in Anki."
      : scope === "missed"
        ? `All missed questions were already in Anki. Skipped ${result.skippedDuplicates} duplicates.`
        : `All selected cards were already in Anki. Skipped ${result.skippedDuplicates} duplicates.`;
  }

  const details = [];
  if (result.skippedDuplicates > 0) {
    details.push(`skipped ${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? "" : "s"}`);
  }
  if (result.failed > 0) {
    details.push(`${result.failed} failed`);
  }

  return details.length ? `${createdText} Also ${details.join(" and ")}.` : createdText;
}

function withExportNotice(result, context) {
  if (!result.ok || !context || !context.exportNotice) {
    return result;
  }

  return {
    ...result,
    message: `${result.message} ${context.exportNotice}`
  };
}

async function exportNotes(notes, settings, scope) {
  await ensureModel(settings.noteModelName);
  await ensureDecks([...new Set(notes.map((note) => note.deckName))]);

  let allowed = notes.map(() => true);
  if (!settings.allowDuplicates) {
    allowed = await ankiInvoke("canAddNotes", { notes });
  }

  const notesToAdd = notes.filter((note, index) => allowed[index]);
  const addResults = notesToAdd.length ? await ankiInvoke("addNotes", { notes: notesToAdd }) : [];
  const createdNotes = addResults
    .map((noteId, index) => noteId === null ? null : {
      noteId,
      deckName: notesToAdd[index].deckName
    })
    .filter(Boolean);

  await moveCreatedCardsToDecks(createdNotes);
  const created = addResults.filter((noteId) => noteId !== null).length;

  return {
    ok: true,
    total: notes.length,
    created,
    skippedDuplicates: allowed.filter((value) => !value).length,
    failed: notesToAdd.length - created,
    message: summarizeExport({
      total: notes.length,
      created,
      skippedDuplicates: allowed.filter((value) => !value).length,
      failed: notesToAdd.length - created
    }, scope)
  };
}

function normalizeQuizDataFromContext(context) {
  if (!context || !context.quizData) {
    throw new Error("No active quiz data found on the page.");
  }

  const quizData = JSON.parse(JSON.stringify(context.quizData));
  quizData.source = quizData.source || context.source || "aiig";
  if (!quizData.id && context.quizId) {
    quizData.id = context.quizId;
  }
  if (!Array.isArray(quizData.questions)) {
    quizData.questions = [];
  }

  return quizData;
}

async function exportCurrentQuestion(context) {
  if (!context || !context.currentQuestion) {
    throw new Error("No active question detected. Open a quiz question first.");
  }

  const settings = await shared.loadSettings();
  const quizData = normalizeQuizDataFromContext(context);
  const currentQuestion = context.currentQuestion;
  const questions = Array.isArray(quizData.questions) ? quizData.questions : [];

  let index = questions.findIndex((question) => String(question.id) === String(currentQuestion.id));
  if (index === -1 && Number.isInteger(context.currentIndex)) {
    index = context.currentIndex;
  }
  if (index === -1) {
    index = 0;
  }

  const loMap = cards.buildLearningObjectiveMap(quizData);
  const note = cards.buildNote({
    quizData,
    question: currentQuestion,
    loText: context.currentQuestionLearningObjectiveText || cards.lookupLearningObjective(quizData, currentQuestion, loMap),
    index
  }, settings);

  return withExportNotice(await exportNotes([note], settings, "question"), context);
}

async function exportCurrentQuiz(context) {
  const settings = await shared.loadSettings();
  const quizData = normalizeQuizDataFromContext(context);
  if (!quizData.questions.length) {
    throw new Error("No questions were available in the current quiz.");
  }

  const notes = cards.buildNotesForQuiz(quizData, settings);
  return withExportNotice(await exportNotes(notes, settings, "quiz"), context);
}

async function exportMissedQuestions(context) {
  const settings = await shared.loadSettings();
  const quizData = normalizeQuizDataFromContext(context);
  const missedEntries = quizData.source === "notebooklm"
    ? (quizData.questions || []).map((question, index) => ({
      question,
      index: Number.isInteger(question && question.original_index) ? question.original_index : index
    }))
    : shared.collectAiigMissedQuestionEntries(quizData, context);

  if (!missedEntries.length) {
    throw new Error(
      quizData.source === "notebooklm"
        ? "No missed NotebookLM questions were found in the reviewed quiz."
        : "No missed questions were found yet. Confirm at least one incorrect AIIG answer first."
    );
  }

  const loMap = cards.buildLearningObjectiveMap(quizData);
  const notes = missedEntries.map(({ question, index }) => cards.buildNote({
    quizData,
    source: quizData.source,
    question,
    loText: cards.lookupLearningObjective(quizData, question, loMap),
    index
  }, settings));

  return withExportNotice(await exportNotes(notes, settings, "missed"), context);
}

async function exportQuizById(quizId) {
  const settings = await shared.loadSettings();
  const quizData = await fetchQuizDetails(quizId);
  const notes = cards.buildNotesForQuiz(quizData, settings);
  return exportNotes(notes, settings, "quiz");
}
