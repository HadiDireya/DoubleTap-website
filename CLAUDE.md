# DoubleTap Website

Static marketing site for the DoubleTap macOS app. Plain HTML/CSS/JS — no framework, no build step.

See `PLAN.md` for the full page structure and design requirements.

## Stack

- HTML / CSS / JS (vanilla, no framework)
- Google Fonts: Outfit
- Deployed on Vercel from GitHub
- Payments via Gumroad (external link)

---

## Claude Setup

### Directory Structure

```
.claude/
├── settings.json         — project permissions, hooks, plugins
├── settings.local.json   — machine-specific permissions (not committed)
├── hooks/
│   ├── web-lint.sh       — per-file HTML/CSS/JS lint (PostToolUse)
│   ├── security-scan.sh  — per-file security scan (PostToolUse)
│   └── final-review.sh   — project-wide review (Stop)
└── commands/
    ├── review.md         — /review agent
    ├── security.md       — /security agent
    ├── lint.md           — /lint agent
    ├── accessibility.md  — /accessibility agent
    └── perf.md           — /perf agent
```

---

### Hooks (Automated — run automatically, no manual invocation needed)

#### `web-lint.sh` — PostToolUse (Edit | Write)

Runs automatically after every file edit or write. Checks the modified file only.

**HTML checks:**
- Missing `alt` attribute on `<img>` tags
- Missing `<!DOCTYPE html>`
- Missing `lang` attribute on `<html>`
- Missing `<meta charset>`
- Missing `<meta viewport>`
- `target="_blank"` without `rel="noopener"`
- Empty `href=""` or `src=""` attributes

**CSS checks:**
- Excessive `!important` usage (warns if > 5 instances)
- `@import` appearing after other CSS rules (must come first)

**JS checks:**
- `console.log` / `console.debug` / `console.info` left in code
- Possible implicit global variables (assignments without `const`/`let`/`var`)

#### `security-scan.sh` — PostToolUse (Edit | Write)

Runs automatically after every file edit or write. Scans the modified file for security issues.

**JS & HTML checks:**
- `eval()` — code injection risk
- `.innerHTML` / `.outerHTML` — XSS risk
- `document.write()` — XSS risk
- `new Function()` — code injection risk
- `setTimeout` / `setInterval` with string arguments — code injection risk

**HTML-only checks:**
- `<iframe>` without `sandbox` attribute
- `<form>` action using `http://` instead of `https://`

**All files:**
- Hardcoded API keys, secrets, passwords, tokens, or credentials
- Non-HTTPS URLs (ignores `localhost`, `xmlns`, `w3.org`, `example.com`)

#### `final-review.sh` — Stop

Runs automatically when Claude finishes a task. Scans all project files.

**HTML (all `.html` files):**
- Missing `alt` on `<img>`
- `target="_blank"` without `rel="noopener noreferrer"`
- Broken local asset references (checks `src` and `href` paths exist on disk)

**JS (all `.js` files):**
- `eval()`, `.innerHTML`, `document.write()`, `new Function()`

**CSS (all `.css` files):**
- Excessive `!important` (> 5 instances per file)

**Project-wide:**
- Missing favicon (`favicon.ico` or `favicon.svg`)

#### `notify.sh` — Stop, Notification, PreToolUse (AskUserQuestion)

Global notification hook (lives at `~/.claude/hooks/notify.sh`). Sends a system notification when:
- Claude finishes a task (Stop)
- Claude sends a notification (Notification)
- Claude is about to ask the user a question (AskUserQuestion) — sends an idle prompt alert

---

### Agents (Manual — invoke with slash commands)

#### `/review` — Code Review

**When to use:** After making changes, before committing. Run to catch quality issues across HTML/CSS/JS.

**What it does:**
1. Diffs uncommitted changes (or last commit if clean)
2. Reads every changed file
3. Checks against PLAN.md for alignment
4. Evaluates HTML (semantics, alt, headings, meta tags, links), CSS (unused selectors, naming, !important, animations, hardcoded values, dark-first), JS (console.log, leaks, caching, globals, var usage, dependencies), and cross-file consistency (selectors match DOM, assets exist, no dead code)
5. Reports findings by severity with file names and line numbers

**Accepts arguments:** `/review just the hero section`, `/review css only`

#### `/security` — Security Audit

**When to use:** Before deploying. After adding external scripts, forms, iframes, or any user-facing input handling.

**What it does:**
1. Reads every `.html`, `.css`, `.js` file
2. Checks against OWASP top 10 for frontend
3. Scans for XSS vectors (innerHTML, eval, document.write, javascript: URLs, unsanitized URL params)
4. Checks content security (CSP meta tag, iframe sandbox, SRI on external scripts, HTTPS, noopener)
5. Checks for data exposure (hardcoded secrets, sensitive HTML comments, .env files)
6. Checks third-party risk (CDN scripts without SRI, outdated libraries)
7. Reports every finding with severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, description, fix, and code example

**Accepts arguments:** `/security check the new pricing section`

#### `/lint` — Lint & Fix

**When to use:** Before committing. To clean up code after a large set of changes. This agent **fixes** issues rather than just reporting them.

**What it does:**
1. Reads all `.html`, `.css`, `.js` files
2. HTML: DOCTYPE, lang, charset, viewport, alt, duplicate IDs, closed tags, deprecated elements, inline styles/handlers
3. CSS: valid values, duplicate properties/selectors, @import order, !important, shorthand, zero units, color format consistency, orphaned selectors
4. JS: const/let not var, strict equality, no console.log, unused variables, unreachable code, quote/semicolon consistency, implicit globals, arrow functions, template literals, passive listeners
5. Fixes every issue found and states what was wrong and what changed

**Accepts arguments:** `/lint js only`, `/lint index.html`

#### `/accessibility` — WCAG 2.1 AA Audit

**When to use:** After building a new section. Before launching. When adding interactive elements, images, or animations.

**What it does:**
1. Reads all `.html`, `.css`, `.js` files
2. Perceivable: meaningful alt text, decorative images marked, color contrast (4.5:1 normal, 3:1 large), no color-only info, text resize
3. Operable: keyboard accessible, logical focus order, visible focus styles, no keyboard traps, skip-to-content link, 44x44px tap targets, prefers-reduced-motion, no excessive flashing
4. Understandable: lang attribute, labeled form inputs, descriptive errors, consistent nav, descriptive link text
5. Robust: valid HTML, correct ARIA, proper roles, labeled icon buttons
6. CSS: prefers-reduced-motion, prefers-color-scheme, prefers-contrast, rem/em font sizes, 1.5 line-height, focus outlines not removed
7. Fixes critical issues (missing alt, no focus styles, no reduced-motion). Reports other findings with severity

**Accepts arguments:** `/accessibility check dark mode contrast`

#### `/perf` — Performance Audit

**When to use:** After adding images, external scripts, or animations. Before deploying. When page feels slow.

**What it does:**
1. Reads all `.html`, `.css`, `.js` files and checks `assets/` directory
2. Loading (LCP): eager/lazy loading attributes, fetchpriority, critical CSS, font display=swap, preconnect hints, unused CSS, defer on JS
3. Images: WebP format, width/height attributes, oversized images, picture/srcset, SVG for icons, favicon
4. Runtime (INP/CLS): GPU-only animations (transform/opacity), no layout-triggering animation, will-change, passive listeners, IntersectionObserver, no forced sync layouts
5. Network: HTTPS, minimal third-party scripts, same-origin preference, cache-friendly naming
6. Bundle size: no heavy libraries for small tasks, lazy-load Swiper.js, total page weight
7. Fixes what it can (loading attributes, defer, preconnect, width/height) and reports the rest with impact (HIGH/MEDIUM/LOW)

**Accepts arguments:** `/perf check images only`

---

### Permissions

#### Auto-Allowed (no confirmation needed)

**Shell basics:**
`ls`, `find`, `grep`, `cat`, `head`, `tail`, `wc`, `sort`, `diff`, `which`, `echo`, `pwd`, `jq`, `curl`

**Node / npm:**
`node -e`, `node -p`, `python3 -c`, `python3 -m http.server`, `npm run`, `npm test`, `npm audit`, `npm install`, `npm ls`, `npm outdated`

**Web dev tools (npx):**
`npx serve`, `npx http-server`, `npx htmlhint`, `npx stylelint`, `npx eslint`, `npx lighthouse`, `npx playwright`

**Browser:**
`open` (open files/URLs in default browser)

**Git (read + local write):**
`git status`, `git log`, `git diff`, `git branch`, `git show`, `git blame`, `git rev-parse`, `git stash`, `git add`, `git commit`, `git fetch`, `git remote`

**GitHub CLI:**
`gh pr`, `gh issue`, `gh api`

**Vercel (read-only):**
`vercel list`, `vercel inspect`, `vercel logs`, `vercel whoami`, `vercel project ls`, `vercel env ls`

**Web research:**
`WebSearch`, `WebFetch`

#### Requires Confirmation (ask mode)

**Git (destructive/remote):**
`git push`, `git reset`, `git checkout`, `git rebase`

**File operations:**
`rm`, `mv`, `cp`, `chmod`

**Vercel (write/deploy):**
`vercel deploy`, `vercel rm`, `vercel env add`, `vercel env rm`, `vercel promote`, `vercel rollback`, `vercel alias`

---

### Settings

**Plugins:** Warp terminal integration (`warp@claude-code-warp`)

**Status line:** Custom status line via `~/.claude/statusline-command.sh`

**Voice:** Enabled in hold mode

**Thinking:** Always-on thinking enabled

---

## Code Rules

### No Hardcoded Values

Never write raw color, spacing, font-size, border-radius, shadow, or timing values directly in CSS rules. Always use CSS custom properties defined in `:root`.

```css
/* BAD */
.card { background: #1a1a1a; padding: 24px; border-radius: 16px; }

/* GOOD */
.card { background: var(--color-surface); padding: var(--space-6); border-radius: var(--radius-lg); }
```

The only places raw values may appear:
- Inside `:root` or `[data-theme]` variable definitions
- `0` (zero needs no variable)
- `100%`, `100vh`, `100vw` (layout primitives)
- `1px` for borders (use `var(--border-width)` if it varies)
- Keyframe percentages (`0%`, `50%`, `100%`)
- CSS custom property fallbacks

### Design Tokens

All tokens live in `:root` at the top of `style.css`. Theme overrides go in `[data-theme]` or `.light` / `.mono` selectors.

**Colors** — use semantic names, not descriptive ones:
```
--color-bg           (page background)
--color-surface      (card/key background)
--color-surface-hover
--color-border       (subtle borders)
--color-text         (primary text)
--color-text-muted   (secondary/tagline text)
--color-text-faint   (tertiary/hint text)
--color-glow         (radial glow effects)
--color-shadow       (box-shadow color)
--color-icon-filter  (filter value for key icons)
```

**Spacing** — 4px base scale:
```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
--space-20: 80px
```

**Typography:**
```
--font-family:       'Outfit', -apple-system, sans-serif
--font-family-system: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif
--font-size-xs:      12px
--font-size-sm:      14px
--font-size-base:    16px
--font-size-md:      18px
--font-size-lg:      24px
--font-size-xl:      32px
--font-size-2xl:     40px
--font-size-3xl:     48px
--font-size-hero:    56px
--font-weight-normal: 400
--font-weight-semibold: 600
--font-weight-bold:  700
--font-weight-heavy: 800
--font-weight-black: 900
--line-height-tight:  1
--line-height-snug:   1.25
--line-height-normal: 1.5
--letter-spacing-tight: -2px
--letter-spacing-normal: 0
--letter-spacing-wide: 0.5px
```

**Border Radius:**
```
--radius-sm:   8px
--radius-md:   12px
--radius-lg:   16px
--radius-xl:   18px
--radius-2xl:  24px
--radius-icon: 36px
--radius-full: 9999px
```

**Shadows:**
```
--shadow-key:   0 4px 30px var(--color-shadow)
--shadow-card:  0 2px 20px var(--color-shadow)
--shadow-inset: inset 0 1px 0 var(--color-border)
```

**Transitions:**
```
--duration-fast:   150ms
--duration-normal: 300ms
--duration-slow:   600ms
--ease-default:    ease
--ease-out:        cubic-bezier(0.16, 1, 0.3, 1)
--ease-in-out:     ease-in-out
--transition-colors: color var(--duration-slow) var(--ease-default),
                     background var(--duration-slow) var(--ease-default),
                     border-color var(--duration-slow) var(--ease-default)
```

**Layout:**
```
--content-width:   1200px
--content-narrow:  800px
--nav-height:      64px
--key-size:        70px
--icon-size:       160px
--icon-img-size:   40px
```

### CSS Rules

1. **Mobile-first** — write base styles for mobile, add `min-width` media queries for larger screens
2. **Logical properties** — prefer `margin-inline`, `padding-block` over `margin-left`, `padding-top` where it doesn't hurt readability
3. **No `!important`** — fix specificity instead. The only exception is utility overrides
4. **Class naming** — use flat descriptive classes: `.hero`, `.hero-glow`, `.app-title`, `.key`. No BEM needed for a project this size. Prefix state classes with the section: `.hero.light`, `.hero.mono`
5. **Animations** — only animate `transform` and `opacity` for performance. Use `will-change` sparingly. Always provide `prefers-reduced-motion` fallback
6. **Units** — `px` for borders and small fixed sizes, `rem` for font sizes in body text sections, `px` for the hero/display type. `vh`/`vw`/`%` for layout
7. **Selectors** — max 2 levels of nesting specificity. Never use IDs for styling. Never use `!important`
8. **Custom properties over shorthand overlap** — if a shorthand like `background` would reset a custom property transition, use the longhand (`background-color`)

### HTML Rules

1. **Semantic elements** — use `<nav>`, `<main>`, `<section>`, `<footer>`, `<article>`, `<aside>`. Reserve `<div>` for non-semantic wrappers only
2. **Every `<img>` must have `alt`** — descriptive for content images, `alt=""` for decorative ones with `role="presentation"`
3. **Every `<section>` should have a heading** — use `aria-label` if the heading is visual-only or hidden
4. **Links opening new tabs** — always add `rel="noopener noreferrer"` to `target="_blank"` links
5. **No inline styles** — move to CSS. The only exception is CSS custom property overrides on specific elements (e.g. `style="--delay: 0.2s"`)
6. **No inline event handlers** — no `onclick`, `onmouseover`, etc. Use `addEventListener` in JS
7. **Image dimensions** — always include `width` and `height` attributes to prevent layout shift
8. **Loading** — hero images: `loading="eager"`. Below-fold images: `loading="lazy"`

### JS Rules

1. **`const` by default** — use `let` only when reassignment is needed. Never use `var`
2. **Strict equality** — always `===` and `!==`, never `==` or `!=`
3. **No `eval()`** — never use `eval()`, `new Function()`, or string args in `setTimeout`/`setInterval`
4. **No `innerHTML`** — use `textContent` for text, DOM APIs (`createElement`, `append`) for structure
5. **Cache DOM queries** — query once at the top, store in a `const`. Never query inside loops or frequent callbacks
6. **Event delegation** — for repeated elements (like keys), attach one listener to the parent, not one per element
7. **Passive listeners** — use `{ passive: true }` for `scroll`, `touchstart`, `touchmove`, `wheel` events
8. **No global pollution** — wrap in an IIFE or use ES modules (`type="module"` on the script tag). No top-level `var` or undeclared assignments
9. **No console.log** — remove before committing. Use `console.warn`/`console.error` only for genuine runtime warnings
10. **Clean up** — remove event listeners, cancel `requestAnimationFrame`, disconnect `IntersectionObserver` when no longer needed

### File Organization

```
index.html              — single-page site
css/style.css           — all styles (tokens at top, then base, then sections)
js/main.js              — all behavior
assets/icons/           — app icons (dark, light, mono)
assets/keys/            — modifier key images
assets/screenshots/     — app screenshots (to add)
```

CSS section order in `style.css`:
1. Design tokens (`:root` custom properties)
2. Reset
3. Base / typography
4. Layout (nav, sections grid)
5. Components (keys, cards, buttons)
6. Section-specific (hero, features, pricing, footer)
7. Theme variants (`.light`, `.mono`)
8. Animations / keyframes
9. Media queries (mobile-first breakpoints)
10. Accessibility (`prefers-reduced-motion`, `prefers-color-scheme`)
