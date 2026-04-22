Review all changed files in this project for quality, correctness, and adherence to the project plan.

Steps:
1. Run `git diff` to see all uncommitted changes. If no uncommitted changes, run `git diff HEAD~1` to review the last commit.
2. Read every changed file in full.
3. Check against PLAN.md to ensure changes align with the planned structure and design principles.
4. For each file, evaluate:

**HTML:**
- Semantic markup (use `<section>`, `<nav>`, `<main>`, `<footer>`, not just `<div>`)
- All `<img>` tags have descriptive `alt` attributes
- Proper heading hierarchy (h1 -> h2 -> h3, no skipping)
- `<a target="_blank">` has `rel="noopener noreferrer"`
- No empty `href` or `src` attributes
- Meta tags present (charset, viewport, description, og tags)
- Proper `lang` attribute on `<html>`

**CSS:**
- No unused selectors for elements that don't exist in HTML
- Consistent naming convention (BEM or whatever pattern is established)
- No `!important` unless absolutely necessary
- Media queries for mobile responsiveness
- Transitions/animations use `transform`/`opacity` for performance (not `width`/`height`/`top`/`left`)
- No hardcoded colors that should be CSS custom properties
- Dark-first design maintained per PLAN.md

**JS:**
- No `console.log` left in production code
- Event listeners properly scoped (no leaks)
- DOM queries cached, not repeated in loops
- No global variable pollution
- `const`/`let` used, never `var`
- IntersectionObserver used correctly for scroll animations
- No unnecessary dependencies

**Cross-file:**
- CSS selectors match actual HTML classes/IDs
- JS selectors match actual DOM elements
- Referenced assets (images, fonts) exist at the specified paths
- No dead code or orphaned files

Report findings grouped by severity: errors first, then warnings, then suggestions. Be specific with file names and line numbers.

$ARGUMENTS
