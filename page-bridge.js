(function() {
  if (window.__aiigAnkiBridgeInstalled) {
    return;
  }
  window.__aiigAnkiBridgeInstalled = true;

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function gatherContext() {
    const context = {
      view: typeof App !== "undefined" && App ? App.currentView : null,
      quizId: null,
      currentIndex: null,
      currentQuestion: null,
      currentQuestionLearningObjectiveText: null,
      quizData: null,
      answers: {},
      confirmed: {},
      flaggedQuestionIds: []
    };

    if (typeof Quiz === "undefined" || !Quiz) {
      return context;
    }

    context.quizId = Quiz.quizId || null;
    context.currentIndex = typeof Quiz.currentIndex === "number" ? Quiz.currentIndex : null;
    context.answers = Quiz.answers ? cloneJson(Quiz.answers) : {};
    context.confirmed = Quiz.confirmed ? cloneJson(Quiz.confirmed) : {};
    context.flaggedQuestionIds = Quiz.flagged ? Array.from(Quiz.flagged) : [];

    if (Quiz.quizData) {
      context.quizData = cloneJson(Quiz.quizData);
      if (!context.quizData.id && context.quizId) {
        context.quizData.id = context.quizId;
      }
    }

    if (Quiz.questions && context.quizData) {
      context.quizData.questions = cloneJson(Quiz.questions);
    }

    if (context.quizData && Array.isArray(context.quizData.questions) && context.currentIndex !== null) {
      context.currentQuestion = context.quizData.questions[context.currentIndex] || null;
    }

    if (!context.currentQuestion && Quiz.questions && context.currentIndex !== null) {
      context.currentQuestion = cloneJson(Quiz.questions[context.currentIndex] || null);
    }

    if (context.currentQuestion && Quiz.loMap && context.currentQuestion.learning_objective) {
      context.currentQuestionLearningObjectiveText =
        Quiz.loMap[context.currentQuestion.learning_objective] || null;
    }

    return context;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data || {};
    if (data.source !== "AIIG_ANKI_EXTENSION" || data.type !== "AIIG_ANKI_GET_CONTEXT") {
      return;
    }

    try {
      window.postMessage({
        source: "AIIG_ANKI_BRIDGE",
        type: "AIIG_ANKI_CONTEXT",
        requestId: data.requestId,
        context: gatherContext()
      }, "*");
    } catch (error) {
      window.postMessage({
        source: "AIIG_ANKI_BRIDGE",
        type: "AIIG_ANKI_CONTEXT",
        requestId: data.requestId,
        error: error.message || String(error)
      }, "*");
    }
  });
})();
