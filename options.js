const shared = window.AIIGAnkiShared;

const form = document.getElementById("settings-form");
const deckRootInput = document.getElementById("deck-root");
const deckStrategyInput = document.getElementById("deck-strategy");
const noteModelNameInput = document.getElementById("note-model-name");
const extraTagsInput = document.getElementById("extra-tags");
const allowDuplicatesInput = document.getElementById("allow-duplicates");
const deckPreview = document.getElementById("deck-preview");
const resetDefaultsButton = document.getElementById("reset-defaults");
const saveStatus = document.getElementById("save-status");

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const settings = await shared.loadSettings();
  applySettings(settings);
  updatePreview();

  form.addEventListener("submit", saveForm);
  resetDefaultsButton.addEventListener("click", resetDefaults);
  deckRootInput.addEventListener("input", updatePreview);
  deckStrategyInput.addEventListener("change", updatePreview);
}

function applySettings(settings) {
  deckRootInput.value = settings.deckRoot;
  deckStrategyInput.value = settings.deckStrategy;
  noteModelNameInput.value = settings.noteModelName;
  extraTagsInput.value = settings.extraTags;
  allowDuplicatesInput.checked = !!settings.allowDuplicates;
}

function currentSettings() {
  return {
    deckRoot: deckRootInput.value.trim(),
    deckStrategy: deckStrategyInput.value,
    noteModelName: noteModelNameInput.value.trim(),
    extraTags: extraTagsInput.value.trim(),
    allowDuplicates: allowDuplicatesInput.checked
  };
}

function updatePreview() {
  deckPreview.textContent = shared.buildDeckName({
    source: "aiig",
    category: "Unit Name",
    title: "Quiz Title"
  }, currentSettings());
}

async function saveForm(event) {
  event.preventDefault();
  const settings = await shared.saveSettings(currentSettings());
  applySettings(settings);
  updatePreview();
  saveStatus.textContent = "Settings saved.";
}

async function resetDefaults() {
  const settings = await shared.saveSettings(shared.DEFAULT_SETTINGS);
  applySettings(settings);
  updatePreview();
  saveStatus.textContent = "Defaults restored.";
}
