# Privacy Policy

Last updated: April 22, 2026

## Study Quiz to Anki Exporter

Study Quiz to Anki Exporter is an unofficial Chrome extension that helps a user export questions from the AIIG qbank and quizzes from NotebookLM into Anki through AnkiConnect running on the same computer.

## What data the extension accesses

The extension can access:

- question content from `https://aiig-qbank.up.railway.app/`
- quiz content visible in `https://notebooklm.google.com/` when a user opens a NotebookLM quiz viewer
- quiz metadata such as quiz title, category, subcategory, reference text, and learning objectives
- the user's extension settings stored in Chrome storage

## What the extension does with that data

The extension uses the accessed study content only to:

- build Anki note content for the user
- send the selected question or quiz to the user's local AnkiConnect server at `http://127.0.0.1:8765` or `http://localhost:8765`
- organize exported notes into decks, note types, and tags chosen by the user

## What the extension does not do

The extension does not:

- send AIIG or NotebookLM question content to any third-party remote server
- sell data
- use analytics
- use ads
- track browsing beyond the AIIG qbank and NotebookLM pages needed for the export feature

## Local storage

The extension stores only basic configuration in Chrome storage, such as:

- preferred deck root
- deck layout
- note type name
- extra tags
- duplicate-handling preference

## Third-party services

The extension communicates with:

- the AIIG qbank website, to read quiz data
- NotebookLM pages in the browser, to read the currently open quiz viewer
- AnkiConnect on the same computer, to create notes in Anki

No remote third-party storage or sync service is used by the extension itself.

## Contact

For support or removal requests, contact the publisher listed on the Chrome Web Store item.
