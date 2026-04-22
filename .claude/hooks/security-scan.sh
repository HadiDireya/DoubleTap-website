#!/bin/bash
# PostToolUse hook: scan for XSS, injection, and common web security issues
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

[[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]] && exit 0

EXT="${FILE_PATH##*.}"
WARNINGS=""

# --- JS & HTML security checks ---
if [[ "$EXT" == "js" || "$EXT" == "html" ]]; then

  # eval() - code injection risk
  EVAL=$(grep -n 'eval(' "$FILE_PATH" || true)
  [[ -n "$EVAL" ]] && WARNINGS+="SECURITY: eval() detected (code injection risk):\n$EVAL\n"

  # innerHTML / outerHTML - XSS risk
  INNER=$(grep -n '\.innerHTML\|\.outerHTML' "$FILE_PATH" || true)
  [[ -n "$INNER" ]] && WARNINGS+="SECURITY: innerHTML/outerHTML usage (XSS risk - use textContent or DOM APIs):\n$INNER\n"

  # document.write - XSS risk
  DOCWRITE=$(grep -n 'document\.write' "$FILE_PATH" || true)
  [[ -n "$DOCWRITE" ]] && WARNINGS+="SECURITY: document.write() detected (XSS risk):\n$DOCWRITE\n"

  # new Function() - code injection
  NEWFUNC=$(grep -n 'new Function(' "$FILE_PATH" || true)
  [[ -n "$NEWFUNC" ]] && WARNINGS+="SECURITY: new Function() detected (code injection risk):\n$NEWFUNC\n"

  # setTimeout/setInterval with string arg
  SETTIMEOUT=$(grep -n 'setTimeout(\s*["\x27]' "$FILE_PATH" || true)
  SETINTERVAL=$(grep -n 'setInterval(\s*["\x27]' "$FILE_PATH" || true)
  [[ -n "$SETTIMEOUT$SETINTERVAL" ]] && WARNINGS+="SECURITY: setTimeout/setInterval with string argument (use function reference):\n$SETTIMEOUT$SETINTERVAL\n"
fi

# --- HTML-specific ---
if [[ "$EXT" == "html" ]]; then
  # iframe without sandbox
  IFRAME=$(grep -n '<iframe' "$FILE_PATH" | grep -v 'sandbox' || true)
  [[ -n "$IFRAME" ]] && WARNINGS+="SECURITY: <iframe> without sandbox attribute:\n$IFRAME\n"

  # Form action to HTTP
  HTTP_FORM=$(grep -n '<form' "$FILE_PATH" | grep 'action="http://' || true)
  [[ -n "$HTTP_FORM" ]] && WARNINGS+="SECURITY: Form action using HTTP (use HTTPS):\n$HTTP_FORM\n"
fi

# --- All files: secrets & credentials ---
SECRETS=$(grep -iEn '(api[_-]?key|api[_-]?secret|password|access[_-]?token|private[_-]?key)\s*[:=]\s*["\x27]' "$FILE_PATH" || true)
[[ -n "$SECRETS" ]] && WARNINGS+="SECURITY: Possible hardcoded secret/credential:\n$SECRETS\n"

# --- Non-HTTPS URLs (skip xmlns, localhost, data URIs) ---
if [[ "$EXT" != "svg" ]]; then
  HTTP_URLS=$(grep -n 'http://' "$FILE_PATH" | grep -v 'localhost\|127\.0\.0\.1\|xmlns\|w3\.org\|example\.com' || true)
  [[ -n "$HTTP_URLS" ]] && WARNINGS+="SECURITY: Non-HTTPS URLs (use HTTPS):\n$HTTP_URLS\n"
fi

if [[ -n "$WARNINGS" ]]; then
  echo -e "Security scan for $(basename "$FILE_PATH"):\n$WARNINGS"
fi
exit 0
