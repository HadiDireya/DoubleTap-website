# DoubleTap Website — Build Prompt

Build the full marketing website for **DoubleTap**, a macOS menu bar utility that lets you double-tap any modifier key or function key to trigger keyboard shortcuts or shell commands.

Follow `CLAUDE.md` for all code rules (design tokens, no hardcoded values, CSS custom properties, semantic HTML, etc.). Follow `PLAN.md` for page structure. The site is plain HTML / CSS / JS — no framework, no build step.

The hero section already exists. Build everything below it.

---

## About the Product

**DoubleTap** is a macOS menu bar app for keyboard power users. You pick a trigger key (like Right Option), assign an action (a keyboard shortcut or shell command), and double-tap that key to fire it. No mouse. No complex chord combos. Just tap-tap.

### Trigger Keys Supported
- **Modifier keys (left/right distinct):** Left/Right Command (⌘), Left/Right Option (⌥), Left/Right Control (⌃), Left/Right Shift (⇧), Fn (Globe)
- **Function keys:** F1 through F12

### Actions You Can Trigger
- **Keyboard shortcuts** — any key combo with any modifiers (⌘⌥⌃⇧)
- **Multi-step shortcuts** — up to 3 sequential keystrokes fired 50ms apart (e.g., double-tap Option → ⌘C then ⌘V)
- **Shell commands** — run any terminal command via `/bin/zsh -c` (e.g., `open -a "Brave Browser"`, `say "Hello"`)

### Feedback HUD (3 styles)
- **Glass** — floating frosted-glass bezel in bottom-right, shows trigger symbol + action label, fades in/out
- **Notch** — expands the MacBook notch sideways with a bounce animation showing trigger + icon (falls back to a centered pill on non-notch Macs)
- **Off** — silent, no visual feedback

### How Detection Works
Double-tap speed is adjustable: 0.1s to 0.5s (default 0.3s). Uses a CGEventTap to detect modifier releases. One mapping per key — no conflicts.

### Settings
- Launch at Login
- Hide from Dock / Menu Bar
- Enable/Disable Monitoring (pause button)
- Feedback style picker (Glass / Notch / Off)
- Double-tap speed slider
- Accessibility permission status + link to System Settings

### Privacy & Security
- Runs 100% locally. No internet required (except one-time license activation)
- No analytics, no tracking, no telemetry, no cloud
- Mappings stored locally in `~/Library/Application Support/DoubleTap/`
- Requires Accessibility permission (for global key listening + keystroke injection)
- App Sandbox disabled (required for CGEventTap)
- Signed with Developer ID, ready for notarization

### Pricing
- **14-day free trial** — full functionality, no restrictions
- **One-time purchase** via Gumroad (link: `https://hadidireya.gumroad.com/l/DoubleTap`)
- License key activates via Gumroad API (single online check, then never again)
- **Lifetime updates included** — no subscription

### System Requirements
- **macOS 13.0+ (Ventura)**
- Works on macOS 13–15 (Sequoia)
- Notch HUD requires MacBook with notch (Pro 14/16 2021+)

### App UI
- 3-pane layout: sidebar nav (Mappings / Settings / License)
- Mapping cards: 170×170 grid cards showing trigger symbol, side badge (L/R), action preview
- Menu bar icon: hand.tap outline (disabled), hand.tap.fill (enabled), red (expired)
- Full dark mode and light mode support

### Branding
- **Name:** DoubleTap
- **Developer:** Hadi Direya
- **Bundle ID:** com.hadi.doubletap
- **Current version:** 1.1.0
- **Tagline:** "Double-tap any modifier key to trigger a shortcut"
- **Appcast (updates):** `https://hadidireya.github.io/DoubleTap-releases/appcast.xml`

---

## What to Build

Reference site for visual style: [clipbook.app](https://clipbook.app) — clean, dark, minimal, scroll-animated.

### Section 1: Nav Bar
- Left: DoubleTap logo (app icon small, ~32px) + "DoubleTap" text
- Center/Right links: Features, Pricing, Changelog
- Right: "Download" CTA button (primary style, rounded, stands out)
- Sticky on scroll with subtle backdrop blur
- Mobile: hamburger menu, slide-in panel
- Smooth-scroll to sections on click

### Section 2: Hero (ALREADY EXISTS — do not rebuild)
- Keep the existing floating 3D key animations, app icon cycle (dark/light/mono on double-click), title, and tagline
- Add below the existing tagline:
  - Download button (primary CTA) — links to DMG or Gumroad
  - "Buy on Gumroad" text link (secondary)
  - macOS version badge: "Requires macOS 13.0+" in a subtle pill

### Section 3: Social Proof (placeholder for now)
- Space for star ratings / testimonials (can be empty initially)
- Optional "X active users" counter
- Use a simple grid or horizontal scroll of quote cards
- Mark as "coming soon" in the code with a comment

### Section 4: What It Does
- Headline: "Double-tap any key. Trigger any action."
- Subheading: one line explaining the concept simply
- Visual: animated or static demo showing the flow — tap Option twice → action fires
- Keep it extremely visual, minimal text
- Could use a CSS animation of a key being tapped twice with an arrow to an action

### Section 5: Feature Showcase
Tabbed or scrolling cards. Each feature gets an icon/visual + short description.

**Features to showcase:**

1. **Modifier Keys** — "Every modifier, left and right"
   - Command, Option, Control, Shift, Fn — left and right treated as separate triggers
   - 10+ trigger keys from day one

2. **Function Keys** — "F1 through F12"
   - Turn any function key into a double-tap trigger
   - Great for app-switching, media controls, or custom workflows

3. **Multi-Step Shortcuts** — "Chain up to 3 actions"
   - Fire sequential keystrokes 50ms apart
   - Example: double-tap Right Option → ⌘C, then ⌘V (copy-paste in one gesture)
   - Each step has independent modifier selection

4. **Shell Commands** — "Run anything from your keyboard"
   - Execute any terminal command on double-tap
   - Examples: `open -a Safari`, `say "Hello"`, `brew update`
   - Runs asynchronously, never blocks the UI

5. **Smart Feedback** — "Know it worked"
   - Glass HUD: frosted floating bezel
   - Notch HUD: expands the MacBook notch with a bounce
   - Or turn it off for silent execution
   - Show visual of each HUD style

6. **Adjustable Speed** — "Fine-tune your timing"
   - Double-tap speed slider: 0.1s to 0.5s
   - Find your perfect rhythm
   - One mapping per key, zero conflicts

### Section 6: How It Works
3-step visual with icons/illustrations:

1. **Pick a trigger** — Choose any modifier or function key (e.g., Right Option)
2. **Assign an action** — Set a keyboard shortcut, multi-step combo, or shell command
3. **Double-tap to fire** — Tap-tap and it just works. Every time.

Clean, centered, large icons or numbers (1, 2, 3), short text beneath each.

### Section 7: Privacy & Security
- Headline: "Your keyboard. Your Mac. Your business."
- Bullet points with icons:
  - "Runs locally — no internet required"
  - "No analytics, no tracking, no cloud"
  - "Accessibility permission — that's it"
  - "Signed & notarized by Apple"
- Subtle lock/shield icon visual
- Dark, trustworthy tone

### Section 8: Pricing
Single centered card:

- **Free Trial** badge at top
- "Try free for 14 days"
- Price: one-time purchase (use a placeholder like "$9" or pull from Gumroad)
- Feature bullets:
  - All features unlocked during trial
  - One-time payment, no subscription
  - Lifetime updates included
  - Activate with a license key
- Two buttons:
  - "Download Free Trial" (primary)
  - "Buy License" (secondary, links to `https://hadidireya.gumroad.com/l/DoubleTap`)
- Small text: "Requires macOS 13.0+"

### Section 9: Final CTA
- Headline: "Try DoubleTap free for 14 days"
- Subheading: "No account. No credit card. Just download and go."
- Download button (large, primary)
- "Buy License" link
- macOS version pill

### Section 10: Footer
- Left: DoubleTap logo + "Double-tap any key. Trigger any action."
- Links column: Download, Changelog, Privacy Policy, Contact
- Legal: "© 2026 Hadi Direya. All rights reserved."
- Keep it minimal, one row on desktop, stacked on mobile

---

## Design Direction

- **Dark-first** — black (#000) background, white text, subtle glass effects
- **macOS-native feel** — SF-style rounded corners, glass/blur, system-like spacing
- **Scroll animations** — every section fades in + slides up on scroll using IntersectionObserver
- **Respect `prefers-reduced-motion`** — disable all animations when set
- **Mobile responsive** — hamburger nav, stacked layouts, touch-friendly tap targets (44px+)
- **Fast** — no heavy libraries, WebP images, lazy loading below the fold

## Animations

- **Scroll reveal** — sections fade in from below (opacity 0 → 1, translateY 30px → 0) when entering viewport
- **Nav** — subtle background blur appears on scroll (transparent at top, blurred dark after scrolling)
- **Keys** — existing floating 3D key animations in hero (keep as-is)
- **Hover states** — buttons scale slightly on hover, cards lift with shadow
- **HUD preview** — if possible, animate the Glass/Notch HUD styles in the feature section
- All animations: `transform` and `opacity` only (GPU-accelerated)

## Assets Available

In `assets/`:
- `assets/icons/icon-dark.png` — dark mode app icon
- `assets/icons/icon-light.png` — light mode app icon
- `assets/icons/icon-mono.png` — monochrome app icon
- `assets/keys/command.png` — Command key symbol
- `assets/keys/option.png` — Option key symbol
- `assets/keys/control.png` — Control key symbol
- `assets/keys/shift.png` — Shift key symbol
- `assets/keys/fn.png` — Fn key symbol

**Assets NOT yet available (use placeholders):**
- App screenshots (settings view, mapping cards, sidebar)
- HUD screenshots/GIFs (Glass, Notch)
- Demo video/GIF of double-tap in action
- Favicon
- Open Graph image

---

## Implementation Notes

- Single file: `index.html` — all sections in one page
- Single stylesheet: `css/style.css` — design tokens at top, then sections
- Single script: `js/main.js` — scroll animations, nav toggle, smooth scroll
- Use CSS custom properties for every value (see CLAUDE.md design tokens)
- Semantic HTML: `<nav>`, `<main>`, `<section>`, `<footer>`
- All `<section>` elements get `id` attributes for nav anchor links
- Images: `loading="lazy"` for everything below the hero
- JS: use `IntersectionObserver` for scroll-reveal, `type="module"` on script tag
- No external JS libraries needed for v1 (add Swiper.js later if needed for carousels)
