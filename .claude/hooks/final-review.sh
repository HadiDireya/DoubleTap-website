#!/bin/bash
# Stop hook: project-wide review before Claude finishes.
# Site lives in <repo>/frontend; backend (TypeScript) is excluded.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SITE_ROOT="$REPO_ROOT/frontend"
[[ -d "$SITE_ROOT" ]] || SITE_ROOT="$REPO_ROOT"
ISSUES=""

resolve_ref() {
  # $1: site root, $2: html file abs path, $3: ref string
  local site="$1" htmlfile="$2" ref="$3"
  # Strip query/fragment
  ref="${ref%%[\?#]*}"
  [[ -z "$ref" ]] && { echo ""; return; }
  if [[ "$ref" == /* ]]; then
    echo "$site$ref"
  else
    echo "$(dirname "$htmlfile")/$ref"
  fi
}

# --- HTML: scan all files under the site root ---
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  NAME=$(basename "$f")

  # Missing alt on images — handle multi-line <img> by joining lines first.
  MISSING_ALT=$(awk 'BEGIN{IGNORECASE=1} /<img\b/{flag=1; buf=""} flag{buf=buf" "$0; if (match(buf,/>/)) {if (buf !~ /\balt=/) print buf; flag=0; buf=""}}' "$f" 2>/dev/null || true)
  [[ -n "$MISSING_ALT" ]] && ISSUES+="[$NAME] Missing alt on <img>\n"

  # target="_blank" without rel=noopener
  UNSAFE_LINKS=$(grep 'target="_blank"' "$f" 2>/dev/null | grep -v 'noopener' || true)
  [[ -n "$UNSAFE_LINKS" ]] && ISSUES+="[$NAME] target=\"_blank\" without rel=\"noopener noreferrer\"\n"

  # Check referenced local assets exist (skip external/anchor/data/mailto/tel).
  while IFS= read -r src; do
    [[ -z "$src" || "$src" == http* || "$src" == data:* || "$src" == "#"* || "$src" == "mailto:"* || "$src" == "tel:"* || "$src" == "javascript:"* ]] && continue
    # Skip pure fragment-or-query refs (no path).
    [[ "$src" == "?"* ]] && continue
    RESOLVED=$(resolve_ref "$SITE_ROOT" "$f" "$src")
    [[ -z "$RESOLVED" ]] && continue
    if [[ ! -e "$RESOLVED" ]]; then
      ISSUES+="[$NAME] Broken reference: $src\n"
    fi
  done < <(grep -o 'src="[^"]*"\|href="[^"]*"' "$f" 2>/dev/null | sed 's/.*="//;s/"$//' || true)

done < <(find "$SITE_ROOT" -maxdepth 3 -name "*.html" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null)

# --- JS: security scan (frontend only) ---
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  NAME=$(basename "$f")
  SEC=$(grep -n 'eval(\|\.innerHTML\|document\.write\|new Function(' "$f" 2>/dev/null || true)
  [[ -n "$SEC" ]] && ISSUES+="[$NAME] Security issues:\n$SEC\n"
done < <(find "$SITE_ROOT" -maxdepth 3 -name "*.js" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null)

# --- CSS: check !important density ---
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  NAME=$(basename "$f")
  IMPORTANT_COUNT=$(grep -c '!important' "$f" 2>/dev/null || true)
  IMPORTANT_COUNT=${IMPORTANT_COUNT:-0}
  [[ "$IMPORTANT_COUNT" -gt 5 ]] 2>/dev/null && ISSUES+="[$NAME] Excessive !important ($IMPORTANT_COUNT instances)\n"
done < <(find "$SITE_ROOT" -maxdepth 3 -name "*.css" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null)

# --- Common files that should exist at the site root ---
[[ ! -f "$SITE_ROOT/favicon.ico" && ! -f "$SITE_ROOT/favicon.svg" ]] && ISSUES+="Missing favicon\n"

if [[ -n "$ISSUES" ]]; then
  echo -e "Final review:\n$ISSUES"
fi
exit 0
