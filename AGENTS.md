# Codex Notes For This Extension

This is a public Chrome extension repo. Keep it clean for public GitHub.

## Public-Safety Rules

- Do not commit OAuth secrets, refresh tokens, access tokens, Web Store cookies, packaged zip files, local screenshots with private study content, or machine-specific paths.
- Keep release artifacts in `dist/` only; `.gitignore` intentionally keeps them out of the repo.
- Prefer source/docs commits over generated artifacts.

## Chrome Web Store Publishing

When asked to upload, submit, or publish a new version, use the Chrome Web Store API first.

1. Verify the repo is clean enough to release.
2. Run syntax/package checks.
3. Run `./package.sh`.
4. Verify `dist/aiig-qbank-to-anki.zip` contains the intended `manifest.json` version.
5. Upload the package through the official Chrome Web Store API.
6. Submit/publish the draft through the official Chrome Web Store API.
7. Use the Developer Dashboard only if API OAuth is blocked or unavailable.

Use environment variables or a local ignored credential file for API auth. Never paste or print live OAuth tokens in terminal output, browser fields, or screenshots. Avoid using OAuth Playground with Computer Use because accessibility output can expose authorization codes or tokens.

Useful API shape:

- Upload package: Chrome Web Store item upload endpoint for the item ID.
- Submit/publish draft: `POST https://chromewebstore.googleapis.com/v2/publishers/{publisherId}/items/{itemId}:publish`
- Required OAuth scope: `https://www.googleapis.com/auth/chromewebstore`

If API auth fails because the OAuth client is `org_internal`, do not keep retrying that client. Use a Chrome Web Store-authorized OAuth client/account, or fall back to the dashboard for that release and note the blocker.
