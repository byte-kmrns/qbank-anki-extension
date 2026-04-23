# How To Use Study Quiz to Anki Exporter

## Before you start

1. Install the extension in Chrome.
2. Open Anki Desktop.
3. Install the AnkiConnect add-on in Anki.
4. Make sure Anki stays open while exporting.

## Connect Anki the first time

1. Open the extension popup.
2. If Anki is not connected, use the `Connect Anki` card.
3. In Anki, go to `Tools -> Add-ons -> Get Add-ons...`.
4. Paste add-on code `2055492159`.
5. Restart Anki.
6. Keep Anki open, then click `Authorize / Retry` or `Connect Anki`.

## Main workflow: export in the same tab

1. Open a supported page:
   - an AIIG qbank quiz
   - or a NotebookLM quiz viewer
2. Click the floating `Anki` button in the bottom-right corner.
3. You can also click the extension icon in Chrome and it will open that same in-page panel on supported pages.
4. Choose:
   - `Add current question`
   - `Add full quiz`
   - `Add missed questions` for AIIG quizzes or completed NotebookLM quiz reviews with incorrect answers
5. Wait for the success toast confirming the export.

## AIIG example

1. Open an AIIG quiz and wait for the floating `Anki` button to appear.
2. Click `Anki` to open the export panel in the same tab.
3. Choose `Add current question`, `Add full quiz`, or `Add missed questions`.
4. Keep Anki open in the background while the export runs.
5. Confirm the success toast on the page.

Decks go to:

- `AIIG Qbank::Unit Name::Quiz Title`
- `AIIG Qbank::Unit Name::Another Quiz Title`

## NotebookLM example

1. Open a notebook.
2. Open a quiz in the Studio viewer.
3. Click the floating `Anki` button.
4. Choose `Add current question`, `Add full quiz`, or `Add missed questions` from a completed quiz review.
5. If you export a full NotebookLM quiz, the extension may rewind the quiz viewer and reveal answers while it captures them.

Decks go to:

- `NotebookLM Qbank::Notebook Name::Quiz Title`

## Screenshots

Public repo copies intentionally omit real qbank screenshots so study content is not redistributed here.

## Options

Use the Options page to change:

- optional deck root prefix
- single deck vs nested decks
- note type name
- extra tags
- duplicate handling

## What gets sent to Anki

Each exported note includes:

- question stem
- answer choices
- correct answer
- explanation
- quiz title
- category and subcategory
- learning objective when present
- reference text when present
