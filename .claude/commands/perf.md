Audit this project for web performance issues. This is a static HTML/CSS/JS site with no build step — recommendations must work without a bundler.

Steps:
1. Read all `.html`, `.css`, and `.js` files.
2. Check all assets in the `assets/` directory.
3. Evaluate against Core Web Vitals best practices.

**Loading Performance (LCP):**
- Hero images/icons should have `loading="eager"` and `fetchpriority="high"`
- Below-fold images should have `loading="lazy"`
- CSS is render-blocking — check if critical CSS can be inlined
- Google Fonts: using `display=swap` to avoid FOIT
- Preconnect hints for external origins (`<link rel="preconnect">`)
- No unused CSS rules that bloat the stylesheet
- JS is loaded with `defer` or at end of `<body>` (not render-blocking in `<head>`)

**Image Optimization:**
- Images should be WebP format (per PLAN.md)
- Images have explicit `width` and `height` to prevent layout shift
- No oversized images (check if source dimensions far exceed display dimensions)
- Consider `<picture>` element with srcset for responsive images
- SVG used for icons/logos where possible instead of PNG
- Favicon exists and is optimized

**Runtime Performance (INP/CLS):**
- CSS animations use `transform` and `opacity` only (GPU-accelerated)
- No layout-triggering properties animated (`width`, `height`, `top`, `left`, `margin`)
- `will-change` used sparingly and only where needed
- Scroll event handlers use `passive: true`
- IntersectionObserver used instead of scroll listeners for visibility detection
- No forced synchronous layouts (read then write DOM in same frame)

**Network:**
- External resources use HTTPS
- Third-party scripts are minimal
- Resources from same origin where possible (fewer DNS lookups)
- Cache-friendly file naming (for Vercel deployment)

**Bundle Size:**
- No large libraries loaded for small tasks
- Swiper.js (if added) loaded only when needed, not on initial load
- Total page weight estimate

Report findings with impact level (HIGH / MEDIUM / LOW) and specific fix instructions. Fix what you can directly (adding loading attributes, defer, preconnect, width/height on images).

$ARGUMENTS
