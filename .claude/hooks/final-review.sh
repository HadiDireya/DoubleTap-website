#!/bin/bash
# Stop hook: project-wide review before Claude finishes
# Acts as an automated review agent - catches issues across all files
set -uo pipefail

PROJECT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ISSUES=""

# --- HTML: scan all files ---
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  NAME=$(basename "$f")

  # Missing alt on images
  MISSING_ALT=$(grep '<img ' "$f" 2>/dev/null | grep -v 'alt=' || true)
  [[ -n "$MISSING_ALT" ]] && ISSUES+="[$NAME] Missing alt on <img>\n"

  # target="_blank" without noopener
  UNSAFE_LINKS=$(grep 'target="_blank"' "$f" 2>/dev/null | grep -v 'noopener' || true)
  [[ -n "$UNSAFE_LINKS" ]] && ISSUES+="[$NAME] target=\"_blank\" without rel=\"noopener noreferrer\"\n"

  # Check referenced local assets exist
  while IFS= read -r src; do
    [[ -z "$src" || "$src" == http* || "$src" == data:* || "$src" == "#"* || "$src" == "mailto:"* ]] && continue
    if [[ ! -f "$PROJECT_DIR/$src" ]]; then
      ISSUES+="[$NAME] Broken reference: $src\n"
    fi
  done < <(grep -o 'src="[^"]*"\|href="[^"]*"' "$f" 2>/dev/null | sed 's/.*="//;s/"$//' || true)

done < <(find "$PROJECT_DIR" -maxdepth 3 -name "*.html" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null)

# --- JS: security scan all files ---
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  NAME=$(basename "$f")
  SEC=$(grep -n 'eval(\|\.innerHTML\|document\.write\|new Function(' "$f" 2>/dev/null || true)
  [[ -n "$SEC" ]] && ISSUES+="[$NAME] Security issues:\n$SEC\n"
done < <(find "$PROJECT_DIR" -maxdepth 3 -name "*.js" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null)

# --- CSS: check for issues ---
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  NAME=$(basename "$f")
  IMPORTANT_COUNT=$(grep -c '!important' "$f" 2>/dev/null || true)
  IMPORTANT_COUNT=${IMPORTANT_COUNT:-0}
  [[ "$IMPORTANT_COUNT" -gt 5 ]] 2>/dev/null && ISSUES+="[$NAME] Excessive !important ($IMPORTANT_COUNT instances)\n"
done < <(find "$PROJECT_DIR" -maxdepth 3 -name "*.css" -not -path "*/.git/*" -not -path "*/node_modules/*" 2>/dev/null)

# --- Check for common files that should exist ---
[[ ! -f "$PROJECT_DIR/favicon.ico" && ! -f "$PROJECT_DIR/favicon.svg" ]] && ISSUES+="Missing favicon\n"

if [[ -n "$ISSUES" ]]; then
  echo -e "Final review:\n$ISSUES"
fi
exit 0
