#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
ARCHIVE_PATH="$DIST_DIR/aiig-qbank-to-anki.zip"

mkdir -p "$DIST_DIR"
rm -f "$ARCHIVE_PATH"

cd "$ROOT_DIR"
zip -r "$ARCHIVE_PATH" \
  manifest.json \
  *.html \
  *.css \
  *.js \
  icons \
  docs \
  .gitignore \
  README.md >/dev/null

echo "Created $ARCHIVE_PATH"
