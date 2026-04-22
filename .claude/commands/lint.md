Run a comprehensive lint check across all HTML, CSS, and JS files in this project. Fix every issue you find — do not just report them.

Steps:
1. Read all `.html`, `.css`, and `.js` files.
2. Check and fix every issue below.

**HTML Lint:**
- DOCTYPE present and correct (`<!DOCTYPE html>`)
- `<html lang="en">` has lang attribute
- `<meta charset="UTF-8">` present
- `<meta name="viewport">` present
- All `<img>` have `alt` attributes
- No duplicate `id` attributes across the page
- All opened tags are properly closed
- No deprecated HTML elements (`<center>`, `<font>`, `<b>` → `<strong>`)
- Boolean attributes don't have redundant values
- Self-closing void elements are consistent (`<img>` not `<img/>`)
- No inline styles (move to CSS)
- No inline event handlers (`onclick="..."` — move to JS)

**CSS Lint:**
- Valid property values (no typos like `colr` or `10xp`)
- No duplicate properties in the same rule
- No duplicate selectors
- `@import` statements come before all other rules
- No `!important` unless justified
- Shorthand properties used where appropriate
- `0` values don't have units (`0` not `0px`)
- Colors are consistent format (hex, rgb, or hsl — pick one)
- No vendor prefixes that autoprefixer would handle (unless no build step requires them)
- Media queries ordered mobile-first or desktop-first consistently
- No orphaned selectors (selectors with no matching HTML)

**JS Lint:**
- `const`/`let` used, never `var`
- Strict equality (`===`/`!==`), never loose (`==`/`!=`)
- No `console.log`, `console.debug`, `console.info` in production code
- No unused variables or functions
- No unreachable code after `return`/`break`/`continue`
- Consistent quote style (single or double — match existing)
- Semicolons consistent (with or without — match existing)
- No implicit global variables (missing `const`/`let` declaration)
- Arrow functions used consistently for callbacks
- Template literals used instead of string concatenation where cleaner
- Event listeners use `{ passive: true }` for scroll/touch events

Fix all issues found. For each fix, briefly state what was wrong and what you changed.

$ARGUMENTS
