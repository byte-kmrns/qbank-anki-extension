# Chrome Web Store Listing Draft

## Name

Study Quiz to Anki Exporter

## Summary

Export AIIG qbank questions and NotebookLM quizzes into clean, formatted Anki cards through your local AnkiConnect setup.

## Single Purpose

This extension helps a user export supported study questions and quizzes from the AIIG qbank website and NotebookLM quiz viewer into Anki Desktop by converting the selected question or quiz into nicely formatted Anki notes and sending them to the user's local AnkiConnect instance.

## Description

Study Quiz to Anki Exporter is an unofficial study helper for users who already study from the AIIG qbank or NotebookLM quizzes and want a faster way to move questions into Anki.

Features:

- add the current question directly from the AIIG qbank or NotebookLM quiz viewer
- add the full current AIIG or NotebookLM quiz from the page
- add only the questions you got wrong in an AIIG quiz session or completed NotebookLM quiz review
- use a same-tab floating export panel instead of leaving the study page
- show a first-run `Connect Anki` setup flow with the AnkiConnect add-on code
- search and export any AIIG quiz from the popup
- create a polished custom Anki note type automatically
- preserve quiz title, category, subcategory, reference text, and learning objectives when available
- organize cards into source -> unit or notebook -> quiz deck paths by default
- avoid duplicate exports by default
- keep exported data local to the study page and your own Anki Desktop instance

How it works:

1. Open Anki Desktop with AnkiConnect installed. In Anki, use `Tools -> Add-ons -> Get Add-ons...` and paste add-on code `2055492159`.
2. Open the AIIG qbank or a NotebookLM quiz viewer.
3. Use the floating Anki button on the page, or click the extension icon to open that same in-page panel.
4. Send the current question, full quiz, or missed questions into Anki.

Important:

- This extension is unofficial and is not affiliated with the AIIG qbank or Google NotebookLM.
- Anki Desktop and the AnkiConnect add-on are required. The AnkiConnect add-on code is `2055492159`.
- No manual IP setup is required for normal installs; the extension automatically tries the standard local AnkiConnect addresses.

## Permissions Justification

- `storage`: saves deck and export preferences
- `https://aiig-qbank.up.railway.app/*`: reads quiz content from the AIIG qbank
- `https://notebooklm.google.com/*`: reads the currently open NotebookLM quiz viewer so the user can export it
- `http://127.0.0.1/*` and `http://localhost/*`: sends selected cards to the user's local AnkiConnect server

## Privacy Practices Draft

- Not using remote code
- No sale of user data
- No analytics
- No advertising
- Reads AIIG qbank content and NotebookLM quiz content only to support the visible export feature
- Sends exported content only to the user's local AnkiConnect server

## Suggested Category

Education

## Suggested Visibility

Unlisted first, then Public if review and real-world testing are clean
