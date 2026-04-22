#!/bin/bash
# PostToolUse hook: lightweight HTML/CSS/JS lint after each edit
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]] && exit 0

EXT="${FILE_PATH##*.}"
ISSUES=""

case "$EXT" in
  html)
    # Missing alt on images
    MISSING_ALT=$(grep -n '<img ' "$FILE_PATH" | grep -v 'alt=' || true)
    [[ -n "$MISSING_ALT" ]] && ISSUES+="Missing alt on <img>:\n$MISSING_ALT\n"

    # Missing DOCTYPE
    if ! head -1 "$FILE_PATH" | grep -qi 'doctype'; then
      ISSUES+="Missing <!DOCTYPE html>\n"
    fi

    # Missing lang attribute
    if grep -q '<html' "$FILE_PATH" && ! grep -q '<html[^>]*lang=' "$FILE_PATH"; then
      ISSUES+="Missing lang attribute on <html>\n"
    fi

    # Missing meta charset
    if ! grep -qi 'meta.*charset' "$FILE_PATH"; then
      ISSUES+="Missing <meta charset>\n"
    fi

    # Missing viewport meta
    if ! grep -qi 'meta.*viewport' "$FILE_PATH"; then
      ISSUES+="Missing <meta viewport>\n"
    fi

    # target="_blank" without rel="noopener"
    UNSAFE_LINKS=$(grep -n 'target="_blank"' "$FILE_PATH" | grep -v 'noopener' || true)
    [[ -n "$UNSAFE_LINKS" ]] && ISSUES+="target=\"_blank\" without rel=\"noopener\":\n$UNSAFE_LINKS\n"

    # Empty href or src
    EMPTY_ATTRS=$(grep -n 'href=""\|src=""' "$FILE_PATH" || true)
    [[ -n "$EMPTY_ATTRS" ]] && ISSUES+="Empty href or src attributes:\n$EMPTY_ATTRS\n"
    ;;

  css)
    # Excessive !important
    IMPORTANT_COUNT=$(grep -c '!important' "$FILE_PATH" || true)
    [[ "$IMPORTANT_COUNT" -gt 5 ]] && ISSUES+="Excessive !important usage ($IMPORTANT_COUNT instances)\n"

    # @import not at top (after other rules)
    if grep -q '@import' "$FILE_PATH"; then
      FIRST_RULE=$(grep -n '{' "$FILE_PATH" | head -1 | cut -d: -f1)
      LAST_IMPORT=$(grep -n '@import' "$FILE_PATH" | tail -1 | cut -d: -f1)
      if [[ -n "$FIRST_RULE" && -n "$LAST_IMPORT" && "$LAST_IMPORT" -gt "$FIRST_RULE" ]]; then
        ISSUES+="@import after other rules (must come first)\n"
      fi
    fi
    ;;

  js)
    # console.log left in code
    CONSOLE=$(grep -n 'console\.\(log\|debug\|info\)' "$FILE_PATH" || true)
    [[ -n "$CONSOLE" ]] && ISSUES+="console.log found (remove before production):\n$CONSOLE\n"

    # Undeclared assignments (no var/let/const/=)
    GLOBALS=$(grep -n '^[[:space:]]*[a-zA-Z_$][a-zA-Z0-9_$]*[[:space:]]*=' "$FILE_PATH" | grep -v 'var \|let \|const \|this\.\|=>\|==\|!=\|export\|module\.\|window\.\|document\.' || true)
    [[ -n "$GLOBALS" ]] && ISSUES+="Possible implicit globals:\n$GLOBALS\n"
    ;;
esac

if [[ -n "$ISSUES" ]]; then
  echo -e "Lint issues in $(basename "$FILE_PATH"):\n$ISSUES"
fi
exit 0
