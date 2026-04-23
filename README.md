# Study Quiz to Anki Exporter

A Manifest V3 Chrome extension that exports questions from the AIIG qbank at `https://aiig-qbank.up.railway.app/` and NotebookLM quizzes into nicely formatted Anki cards.

This is an unofficial utility and is not affiliated with the AIIG qbank, Google, NotebookLM, or Anki.

## Public Repo Notes

- This public repo intentionally omits real qbank screenshots and packaged zip artifacts.
- It does not contain local machine paths, Chrome Web Store account details, or private study screenshots.
- You still need your own access to the supported sites and your own local Anki Desktop install.

## What It Does

- exports the current question from the live qbank page
- exports the full current quiz from the live qbank page
- exports only missed questions from AIIG quiz sessions and completed NotebookLM quiz reviews
- shows a same-tab floating export panel instead of requiring a separate popup tab
- lets you move the floating panel to any screen corner from the in-page gear menu
- creates and maintains its own Anki note type, `Study Quiz Rich`
- organizes cards into configurable decks and tags
- avoids duplicate exports by default using a stable per-question key
- keeps data local to the study page and your own Anki Desktop instance

## Setup

1. Open Anki Desktop.
2. Install the `AnkiConnect` add-on in Anki with add-on code `2055492159`.
3. Restart Anki.
4. In Chrome, open `chrome://extensions`.
5. Enable `Developer mode`.
6. Click `Load unpacked`.
7. Select the extension folder you cloned or downloaded locally.

### First-time connection

The extension does not need a manual IP or API-key setup. It automatically tries the standard local AnkiConnect endpoints:

- `http://127.0.0.1:8765`
- `http://localhost:8765`

If Anki is not connected yet, the popup and same-tab panel now show a `Connect Anki` setup flow with the AnkiConnect add-on code and retry step.

## Supported Sources

- `https://aiig-qbank.up.railway.app/`
- `https://notebooklm.google.com/`

## Usage

### Quick export in the same tab

When you are on the AIIG qbank or an open NotebookLM quiz, the extension injects a floating `Anki` button in the page. You can also click the extension icon in Chrome and it will open that same in-page panel on supported pages instead of opening a separate browser popup.

From the in-page panel you can:

- add the current question
- add the full quiz
- add only the questions you got wrong in an AIIG quiz session or completed NotebookLM quiz review
- click the gear button to move the widget to the top-left, top-right, bottom-left, or bottom-right corner

### Options

Use the options page to configure:

- optional deck root prefix
- one deck per source vs source -> unit/notebook -> quiz subdecks
- note model name
- extra tags
- duplicate handling

By default, deck paths look like:

- `AIIG Qbank::Unit Name::Quiz Title`
- `NotebookLM Qbank::Notebook Name::Quiz Title`

## Card Format

The extension creates a custom Anki note type so the cards are readable and durable instead of dumping raw text into `Basic`. The note type includes:

- a styled header with quiz metadata
- clean front-side question stems and answer choices
- back-side correct answer callout
- explanation blocks
- optional learning objective and reference sections

## Privacy Summary

- The extension reads question content from the AIIG qbank page or API.
- It sends exported card data only to a local AnkiConnect server on `127.0.0.1` or `localhost`.
- It does not send question data to any third-party remote server.
- Settings are stored locally in Chrome sync storage.

## Do You Need A Separate Anki Add-on?

You do need `AnkiConnect`, because the browser needs a local bridge into Anki Desktop.

You do **not** need a second custom Anki add-on for this extension to work. This extension already:

- talks to Anki through AnkiConnect
- creates the deck if needed
- creates and updates its own note type if needed

A custom Anki add-on would only become necessary if you later want features beyond AnkiConnect, like:

- custom browser panes inside Anki
- special review-time behavior
- advanced media ingestion workflows
- bulk post-processing after import

For the current qbank use case, the extension plus AnkiConnect is the right setup.

## Packaging

To create a zip archive for easy loading or sharing:

```bash
./package.sh
```

## Development

- `manifest.json` defines the extension permissions, content scripts, and background worker
- `content.js` drives the in-page export UI and site extraction logic
- `background.js` handles export requests and AnkiConnect communication
- `shared.js` contains shared settings and deck-building helpers

## License

MIT
