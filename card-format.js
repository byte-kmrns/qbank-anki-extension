(function(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./shared.js"));
  } else {
    root.AIIGAnkiCards = factory(root.AIIGAnkiShared);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function(shared) {
  if (!shared) {
    throw new Error("AIIGAnkiShared is required");
  }

  const MODEL_FIELDS = [
    "UniqueKey",
    "Question",
    "Answer",
    "QuizTitle",
    "Category",
    "Subcategory",
    "QuestionNumber",
    "Reference",
    "LearningObjective",
    "QuizId",
    "QuestionId"
  ];

  const MODEL_CSS = `
.card {
  margin: 0;
  padding: 0;
  background: #f3efe7;
  color: #1f2933;
  font-family: "Aptos", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  text-align: left;
}

.aiig-shell {
  max-width: 780px;
  margin: 0 auto;
  border-radius: 18px;
  overflow: hidden;
  background: #fffdf8;
  box-shadow: 0 10px 28px rgba(19, 28, 39, 0.12);
}

.aiig-header {
  padding: 22px 24px 18px;
  background: linear-gradient(135deg, #16324f 0%, #28587b 100%);
  color: #f8fbff;
}

.aiig-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.aiig-quiz-title {
  margin-top: 14px;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 800;
}

.aiig-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.aiig-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #f4f8fb;
  font-size: 12px;
  line-height: 1.2;
}

.aiig-body {
  padding: 24px;
}

.aiig-stem {
  font-size: 22px;
  line-height: 1.45;
  font-weight: 700;
  color: #13202b;
}

.aiig-choice-list {
  display: grid;
  gap: 12px;
  margin-top: 20px;
}

.aiig-choice-row {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 14px;
  align-items: start;
  padding: 14px 16px;
  border-radius: 14px;
  background: #f6f7fb;
  border: 1px solid #d8dee8;
}

.aiig-choice-row.is-correct {
  background: #edf8f0;
  border-color: #6fc08a;
}

.aiig-choice-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: #16324f;
  color: #fdfefe;
  font-weight: 800;
  font-size: 16px;
}

.aiig-choice-row.is-correct .aiig-choice-badge {
  background: #147d4b;
}

.aiig-choice-text {
  font-size: 17px;
  line-height: 1.55;
  color: #243746;
}

.aiig-divider {
  height: 1px;
  margin: 24px 0;
  background: linear-gradient(90deg, rgba(22, 50, 79, 0) 0%, rgba(22, 50, 79, 0.2) 15%, rgba(22, 50, 79, 0.2) 85%, rgba(22, 50, 79, 0) 100%);
}

.aiig-answer-box,
.aiig-meta-block {
  padding: 18px;
  border-radius: 16px;
  background: #f7f3ea;
  border: 1px solid #e3dac8;
}

.aiig-answer-label,
.aiig-section-label {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-weight: 800;
  color: #7a5c2e;
}

.aiig-answer-box .aiig-choice-row {
  margin-top: 12px;
}

.aiig-section {
  margin-top: 20px;
}

.aiig-prose {
  font-size: 17px;
  line-height: 1.68;
  color: #223342;
}

.aiig-prose p {
  margin: 0 0 14px;
}

.aiig-prose p:last-child {
  margin-bottom: 0;
}

.aiig-meta-block {
  margin-top: 18px;
}

.aiig-meta-text {
  margin-top: 8px;
  font-size: 15px;
  line-height: 1.55;
  color: #34485a;
}
`;

  const FRONT_TEMPLATE = `
<div class="aiig-shell">
  <div class="aiig-header">
    <div class="aiig-brand">STUDY QUIZ</div>
    {{#QuizTitle}}<div class="aiig-quiz-title">{{QuizTitle}}</div>{{/QuizTitle}}
    <div class="aiig-meta-row">
      {{#Category}}<span class="aiig-chip">{{Category}}</span>{{/Category}}
      {{#Subcategory}}<span class="aiig-chip">{{Subcategory}}</span>{{/Subcategory}}
      {{#QuestionNumber}}<span class="aiig-chip">Question {{QuestionNumber}}</span>{{/QuestionNumber}}
    </div>
  </div>
  <div class="aiig-body">
    {{Question}}
  </div>
</div>
`;

  const BACK_TEMPLATE = `
<div class="aiig-shell">
  <div class="aiig-header">
    <div class="aiig-brand">STUDY QUIZ</div>
    {{#QuizTitle}}<div class="aiig-quiz-title">{{QuizTitle}}</div>{{/QuizTitle}}
    <div class="aiig-meta-row">
      {{#Category}}<span class="aiig-chip">{{Category}}</span>{{/Category}}
      {{#Subcategory}}<span class="aiig-chip">{{Subcategory}}</span>{{/Subcategory}}
      {{#QuestionNumber}}<span class="aiig-chip">Question {{QuestionNumber}}</span>{{/QuestionNumber}}
    </div>
  </div>
  <div class="aiig-body">
    {{Question}}
    <div class="aiig-divider"></div>
    {{Answer}}
    {{#LearningObjective}}
      <div class="aiig-meta-block">
        <div class="aiig-section-label">Learning Objective</div>
        <div class="aiig-meta-text">{{LearningObjective}}</div>
      </div>
    {{/LearningObjective}}
    {{#Reference}}
      <div class="aiig-meta-block">
        <div class="aiig-section-label">Reference</div>
        <div class="aiig-meta-text">{{Reference}}</div>
      </div>
    {{/Reference}}
  </div>
</div>
`;

  function buildLearningObjectiveMap(quizData) {
    const map = {};
    const learningObjectives = (quizData && Array.isArray(quizData.learning_objectives)) ? quizData.learning_objectives : [];
    for (const objective of learningObjectives) {
      if (objective && objective.id) {
        map[objective.id] = objective.text || "";
      }
    }
    return map;
  }

  function renderChoices(question, highlightKey) {
    return Object.entries(question.choices || {})
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, value]) => {
        const className = key === highlightKey ? "aiig-choice-row is-correct" : "aiig-choice-row";
        return `
<div class="${className}">
  <div class="aiig-choice-badge">${shared.escapeHtml(key)}</div>
  <div class="aiig-choice-text">${shared.nl2br(value)}</div>
</div>`;
      })
      .join("");
  }

  function buildQuestionField(question) {
    return `
<div class="aiig-stem">${shared.nl2br(question.stem || "")}</div>
<div class="aiig-choice-list">
  ${renderChoices(question)}
</div>`;
  }

  function buildAnswerField(question) {
    const correctKey = question.correct_answer || "";
    const correctText = (question.choices && question.choices[correctKey]) ? question.choices[correctKey] : "";
    const explanation = shared.textBlockToHtml(question.explanation || "");
    const explanationSection = explanation ? `
<div class="aiig-section">
  <div class="aiig-section-label">Explanation</div>
  <div class="aiig-prose">${explanation}</div>
</div>` : "";

    return `
<div class="aiig-answer-box">
  <div class="aiig-answer-label">Correct Answer</div>
  ${renderChoices({ choices: { [correctKey]: correctText } }, correctKey)}
</div>
${explanationSection}`;
  }

  function normalizeQuizId(quizData) {
    return shared.trimInline(quizData.id || quizData.quizId || quizData.title || "custom-quiz");
  }

  function normalizeQuestionId(question, index) {
    if (question && question.id !== undefined && question.id !== null) {
      return String(question.id);
    }
    return String(index + 1);
  }

  function lookupLearningObjective(quizData, question, loMap) {
    const map = loMap || buildLearningObjectiveMap(quizData);
    if (!question || !question.learning_objective) {
      return "";
    }
    return map[question.learning_objective] || "";
  }

  function buildNote(options, settings) {
    const quizData = options.quizData || {};
    const question = options.question || {};
    const loText = options.loText || "";
    const index = Number.isInteger(options.index) ? options.index : 0;
    const totalQuestions = Array.isArray(quizData.questions) ? quizData.questions.length : null;
    const source = shared.trimInline(quizData.source || options.source || "aiig") || "aiig";
    const quizId = normalizeQuizId(quizData);
    const questionId = normalizeQuestionId(question, index);
    const questionNumber = shared.questionNumberLabel(question, index, totalQuestions);
    const merged = shared.mergeSettings(settings);
    const deckName = shared.buildDeckName(
      {
        source,
        category: quizData.category,
        subcategory: quizData.subcategory,
        title: quizData.title
      },
      merged
    );

    return {
      deckName,
      modelName: merged.noteModelName,
      fields: {
        UniqueKey: `${source.toUpperCase()}|${shared.escapeHtml(quizId)}|${shared.escapeHtml(questionId)}`,
        Question: buildQuestionField(question),
        Answer: buildAnswerField(question),
        QuizTitle: shared.escapeHtml(quizData.title || ""),
        Category: shared.escapeHtml(quizData.category || ""),
        Subcategory: shared.escapeHtml(quizData.subcategory || ""),
        QuestionNumber: shared.escapeHtml(questionNumber),
        Reference: shared.escapeHtml(question.reference || ""),
        LearningObjective: shared.escapeHtml(loText || ""),
        QuizId: shared.escapeHtml(quizId),
        QuestionId: shared.escapeHtml(questionId)
      },
      tags: shared.buildTags(
        {
          source,
          category: quizData.category,
          subcategory: quizData.subcategory,
          quizId,
          questionId
        },
        merged
      ),
      options: {
        allowDuplicate: !!merged.allowDuplicates,
        duplicateScope: "deck",
        duplicateScopeOptions: {
          deckName,
          checkChildren: false,
          checkAllModels: false
        }
      }
    };
  }

  function buildNotesForQuiz(quizData, settings) {
    const questions = Array.isArray(quizData.questions) ? quizData.questions : [];
    const loMap = buildLearningObjectiveMap(quizData);

    return questions.map((question, index) => buildNote({
      quizData,
      source: quizData.source,
      question,
      loText: lookupLearningObjective(quizData, question, loMap),
      index
    }, settings));
  }

  return {
    BACK_TEMPLATE,
    FRONT_TEMPLATE,
    MODEL_CSS,
    MODEL_FIELDS,
    buildLearningObjectiveMap,
    buildNote,
    buildNotesForQuiz,
    lookupLearningObjective
  };
});
