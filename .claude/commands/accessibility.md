Audit this project for WCAG 2.1 AA accessibility compliance. Check every HTML file and its associated CSS/JS.

Steps:
1. Read all `.html`, `.css`, and `.js` files.
2. Evaluate against WCAG 2.1 AA criteria relevant to a static marketing site.

**Perceivable:**
- All `<img>` have meaningful `alt` text (not just "image" or filename)
- Decorative images use `alt=""` and `role="presentation"`
- Color contrast ratios meet AA minimums (4.5:1 for normal text, 3:1 for large text)
- Check text colors against background colors in both dark and light modes
- No information conveyed by color alone
- Text can be resized to 200% without loss of content
- All non-text content has a text alternative

**Operable:**
- All interactive elements are keyboard accessible
- Focus order is logical (follows DOM order)
- Focus is visible (`:focus` or `:focus-visible` styles exist)
- No keyboard traps
- Skip-to-content link for keyboard users
- Links and buttons have sufficient click/tap target size (44x44px minimum)
- Animations respect `prefers-reduced-motion`
- No content that flashes more than 3 times per second

**Understandable:**
- `<html lang="en">` is set
- Form inputs have associated `<label>` elements
- Error messages are descriptive
- Navigation is consistent across pages
- Link text is descriptive (no "click here" or "read more" without context)

**Robust:**
- Valid HTML (proper nesting, closed tags)
- ARIA attributes used correctly (not overriding native semantics)
- `role` attributes only where native HTML semantics aren't sufficient
- Interactive custom elements have appropriate ARIA roles and states
- `aria-label` or `aria-labelledby` on icon-only buttons

**CSS Accessibility:**
- `prefers-reduced-motion` media query disables/reduces animations
- `prefers-color-scheme` handled if both dark/light modes exist
- `prefers-contrast` considered for high-contrast mode
- Font sizes use `rem`/`em`, not `px` for body text
- Line height at least 1.5 for body text
- Focus outlines not removed without replacement (`outline: none` without `:focus-visible`)

Fix critical issues (missing alt, no focus styles, no reduced-motion). Report other findings with severity and recommendations.

$ARGUMENTS
