Run a thorough security audit on all HTML, CSS, and JS files in this project.

Steps:
1. Read every `.html`, `.css`, and `.js` file in the project.
2. Check each file against the OWASP top 10 web vulnerabilities and common frontend security issues.

**XSS (Cross-Site Scripting):**
- `innerHTML`, `outerHTML`, `insertAdjacentHTML` usage — flag and suggest `textContent` or DOM API alternatives
- `document.write()` — flag as dangerous
- `eval()`, `new Function()`, `setTimeout(string)`, `setInterval(string)` — flag as code injection vectors
- Unescaped user input rendered into the DOM
- URL parameters read and inserted into the page without sanitization
- `javascript:` URLs in href attributes

**Content Security:**
- Missing or weak Content-Security-Policy headers (check for CSP meta tag)
- `<iframe>` elements without `sandbox` attribute
- External scripts loaded over HTTP instead of HTTPS
- External resources without `integrity` (SRI) attributes
- `<a target="_blank">` without `rel="noopener noreferrer"` (reverse tabnapping)
- Forms submitting to HTTP endpoints

**Data Exposure:**
- Hardcoded API keys, tokens, passwords, or secrets in any file
- Sensitive data in HTML comments
- `.env` files or config files with credentials tracked in git
- Source maps exposing internal code in production

**Third-Party Risk:**
- External scripts from CDNs without SRI hashes
- Outdated libraries with known vulnerabilities
- Scripts loaded from untrusted domains

**Clickjacking:**
- Missing X-Frame-Options consideration
- No frame-ancestors CSP directive

Report every finding with:
- Severity: CRITICAL / HIGH / MEDIUM / LOW
- File and line number
- What the vulnerability is
- How to fix it
- A code example of the fix if applicable

$ARGUMENTS
