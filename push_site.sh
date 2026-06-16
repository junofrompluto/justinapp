#!/bin/bash
# JUSTINAPP — push the site to GitHub (Netlify auto-deploys from there).
# Uses a fresh temp clone each run so no .git state lives in this folder.
set -e
SITE_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN="$(head -n1 "$SITE_DIR/.deploy-token" | tr -d '[:space:]')"
REPO_URL="https://x-access-token:${TOKEN}@github.com/junofrompluto/justinapp.git"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if git clone --depth 1 "$REPO_URL" "$TMP/repo" 2>/dev/null; then
  cd "$TMP/repo"
else
  mkdir -p "$TMP/repo" && cd "$TMP/repo"
  git init -q && git remote add origin "$REPO_URL"
fi

# Mirror current site into the clone (delete removed files too)
rsync -a --delete \
  --exclude '.git' \
  --exclude '.deploy-token' \
  --exclude '__pycache__' \
  --exclude 'Screenshot*' \
  --exclude '.DS_Store' \
  "$SITE_DIR/" .

git config user.name "JUSTINAPP Bot"
git config user.email "loumcastro@gmail.com"
git add -A
if git commit -m "Site update $(date '+%Y-%m-%d %H:%M')" -q; then
  git branch -M main
  git push -q -u origin main
  echo "Pushed to GitHub — Netlify will deploy automatically."
else
  echo "No changes to push."
fi
