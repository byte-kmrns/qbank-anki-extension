const shared = window.AIIGAnkiShared;

const state = {
  activeSite: null,
  activeTab: null,
  ankiReady: false,
  pageContext: null,
  quizzes: [],
  filteredQuizzes: []
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindElements();
  bindEvents();
  await Promise.all([
    refreshAnki(false),
    loadPageContext(),
    loadQuizzes()
  ]);
}

function bindElements() {
  elements.ankiAuthorize = document.getElementById("anki-authorize");
  elements.ankiMessage = document.getElementById("anki-message");
  elements.ankiPill = document.getElementById("anki-pill");
  elements.ankiSetupCard = document.getElementById("anki-setup-card");
  elements.exportCurrentQuestion = document.getElementById("export-current-question");
  elements.exportCurrentQuiz = document.getElementById("export-current-quiz");
  elements.exportMissedQuestions = document.getElementById("export-missed-questions");
  elements.exportSelectedQuiz = document.getElementById("export-selected-quiz");
  elements.libraryCount = document.getElementById("library-count");
  elements.openOptions = document.getElementById("open-options");
  elements.pagePill = document.getElementById("page-pill");
  elements.pageSummary = document.getElementById("page-summary");
  elements.quizSearch = document.getElementById("quiz-search");
  elements.quizSelect = document.getElementById("quiz-select");
  elements.statusMessage = document.getElementById("status-message");
  elements.openAnkiConnectPage = document.getElementById("open-ankiconnect-page");
}

function bindEvents() {
  elements.ankiAuthorize.addEventListener("click", () => refreshAnki(true));
  elements.openAnkiConnectPage.addEventListener("click", openAnkiConnectPage);
  elements.exportCurrentQuestion.addEventListener("click", () => exportFromCurrentPage("question"));
  elements.exportCurrentQuiz.addEventListener("click", () => exportFromCurrentPage("quiz"));
  elements.exportMissedQuestions.addEventListener("click", () => exportFromCurrentPage("missed"));
  elements.exportSelectedQuiz.addEventListener("click", exportSelectedQuiz);
  elements.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.quizSearch.addEventListener("input", renderQuizList);
}

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function setAnkiSetupVisible(visible) {
  elements.ankiSetupCard.classList.toggle("hidden", !visible);
}

function syncCurrentPageActions() {
  const context = state.pageContext;
  elements.exportCurrentQuestion.disabled = !(
    state.ankiReady
    && context
    && context.capabilities
    && context.capabilities.exportCurrentQuestion
  );
  elements.exportCurrentQuiz.disabled = !(
    state.ankiReady
    && context
    && context.capabilities
    && context.capabilities.exportCurrentQuiz
  );
  elements.exportMissedQuestions.disabled = !(
    state.ankiReady
    && context
    && context.capabilities
    && context.capabilities.exportMissedQuestions
  );
}

function syncLibraryActions() {
  elements.exportSelectedQuiz.disabled = !state.ankiReady || state.filteredQuizzes.length === 0;
}

function setPill(element, kind, text) {
  element.className = `pill ${kind}`;
  element.textContent = text;
}

function sendRuntimeMessage(message) {
  return chrome.runtime.sendMessage(message);
}

async function refreshAnki(promptForPermission) {
  setStatus(promptForPermission ? "Checking Anki authorization..." : "Checking Anki...");

  const result = await sendRuntimeMessage({
    type: promptForPermission ? "authorizeAnki" : "checkAnki"
  });

  if (result.ok) {
    state.ankiReady = true;
    setPill(elements.ankiPill, "pill-success", `Connected v${result.version}`);
    elements.ankiMessage.textContent = "AnkiConnect is reachable.";
    setAnkiSetupVisible(false);
    setStatus("Anki is connected.");
  } else {
    state.ankiReady = false;
    setPill(elements.ankiPill, "pill-danger", "Not connected");
    elements.ankiMessage.textContent = result.error;
    setAnkiSetupVisible(true);
    setStatus(result.error);
  }

  syncCurrentPageActions();
  syncLibraryActions();
}

async function loadPageContext() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  state.activeTab = tabs[0] || null;
  state.activeSite = state.activeTab ? shared.detectSupportedSite(state.activeTab.url || "") : null;

  if (!state.activeTab || !state.activeSite) {
    state.pageContext = null;
    setPill(elements.pagePill, "pill-warning", "Unsupported page");
    elements.pageSummary.textContent = "The active tab is not AIIG or NotebookLM. You can still use the AIIG library export below.";
    syncCurrentPageActions();
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(state.activeTab.id, {
      type: "getPageContext"
    });

    if (!response || !response.ok || !response.context) {
      throw new Error("The active page did not return export context.");
    }

    state.pageContext = response.context;
    const context = state.pageContext;
    const label = context.siteLabel || (state.activeSite === "notebooklm" ? "NotebookLM" : "AIIG");

    setPill(elements.pagePill, "pill-success", label);
    elements.pageSummary.textContent = context.pageSummary || "The active page is ready to export.";
    syncCurrentPageActions();
  } catch (error) {
    state.pageContext = null;
    setPill(elements.pagePill, "pill-danger", "Unavailable");
    elements.pageSummary.textContent = state.activeSite === "notebooklm"
      ? "NotebookLM was open, but no quiz was detected in the Studio app viewer."
      : "The AIIG qbank was open, but the extension could not detect an active question yet.";
    syncCurrentPageActions();
  }
}

async function collectContextFromCurrentTab(scope) {
  if (!state.activeTab || !state.activeSite) {
    throw new Error("The active tab is not a supported export page.");
  }

  const response = await chrome.tabs.sendMessage(state.activeTab.id, {
    type: "collectExportContext",
    scope
  });

  if (!response || !response.ok || !response.context) {
    throw new Error((response && response.error) || "The active page could not build export data.");
  }

  state.pageContext = response.context;
  return response.context;
}

async function exportFromCurrentPage(scope) {
  if (!state.ankiReady) {
    setStatus("Connect Anki first. Install AnkiConnect in Anki, restart Anki, then click Authorize / Retry.");
    setAnkiSetupVisible(true);
    return;
  }

  try {
    setStatus(
      scope === "quiz"
        ? "Collecting the full quiz..."
        : scope === "missed"
          ? "Collecting missed questions from the current quiz..."
          : "Collecting the current question..."
    );
    const context = await collectContextFromCurrentTab(scope);
    const result = await sendRuntimeMessage({
      type: scope === "quiz"
        ? "exportCurrentQuiz"
        : scope === "missed"
          ? "exportMissedQuestions"
          : "exportCurrentQuestion",
      action: scope === "quiz"
        ? "addCurrentQuiz"
        : scope === "missed"
          ? "addMissedQuestions"
          : "addCurrentQuestion",
      scope,
      context
    });

    setStatus(result.ok ? result.message : (result.error || "Export failed."));
    await loadPageContext();
  } catch (error) {
    setStatus(shared.serializeError(error));
  }
}

async function loadQuizzes() {
  setStatus("Loading AIIG quiz library...");
  const result = await sendRuntimeMessage({ type: "getQuizzes" });
  if (!result.ok) {
    setStatus(result.error || "Could not load quizzes.");
    return;
  }

  state.quizzes = result.quizzes || [];
  renderQuizList();
  setStatus("AIIG quiz library loaded.");
}

function renderQuizList() {
  const search = (elements.quizSearch.value || "").trim().toLowerCase();
  state.filteredQuizzes = state.quizzes.filter((quiz) => {
    if (!search) {
      return true;
    }

    return [
      quiz.title,
      quiz.category,
      quiz.subcategory,
      quiz.id
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });

  elements.quizSelect.innerHTML = "";

  for (const quiz of state.filteredQuizzes) {
    const option = document.createElement("option");
    option.value = quiz.id;
    option.textContent = `${quiz.title} • ${quiz.question_count}q • ${quiz.category || "Uncategorized"}`;
    elements.quizSelect.appendChild(option);
  }

  if (state.filteredQuizzes.length) {
    elements.quizSelect.selectedIndex = 0;
  }

  syncLibraryActions();
  elements.libraryCount.textContent = `${state.filteredQuizzes.length} quiz${state.filteredQuizzes.length === 1 ? "" : "zes"}`;
}

async function exportSelectedQuiz() {
  if (!state.ankiReady) {
    setStatus("Connect Anki first. Install AnkiConnect in Anki, restart Anki, then click Authorize / Retry.");
    setAnkiSetupVisible(true);
    return;
  }

  const quizId = elements.quizSelect.value;
  if (!quizId) {
    setStatus("Pick an AIIG quiz first.");
    return;
  }

  setStatus("Sending the selected AIIG quiz to Anki...");
  const result = await sendRuntimeMessage({
    type: "exportQuizById",
    quizId
  });
  setStatus(result.ok ? result.message : (result.error || "Export failed."));
}

function openAnkiConnectPage() {
  chrome.tabs.create({
    url: "https://ankiweb.net/shared/info/2055492159"
  });
}
