# DoubleTap Website Plan

Reference: [clipbook.app](https://clipbook.app)

## Tech Stack

- Plain HTML / CSS / JS (no framework, no build step)
- Google Fonts: Outfit (already using)
- Swiper.js for tabbed carousels (if needed)
- IntersectionObserver for scroll-reveal animations
- WebP images for performance
- Hosted on Vercel (free, deploys from GitHub)
- Payments via Gumroad (existing setup)

## Page Structure

### 1. Nav Bar
- Logo + "DoubleTap" text
- Links: Features, Pricing, Changelog
- "Download" CTA button (right side)
- Sticky on scroll
- Mobile: hamburger menu

### 2. Hero (existing)
- Floating 3D key animations
- App icon (dark/light/mono on double-click)
- "DoubleTap" title + tagline
- Download button + "Buy on Gumroad" link
- macOS version badge (e.g. "macOS 13.0+")

### 3. Social Proof
- Star ratings / testimonials (add once you have them)
- "X active users" counter (optional, add later)

### 4. What It Does
- Short headline: "Double-tap any key. Trigger any action."
- Animated demo or screenshot showing: tap Option twice -> something happens
- Keep it visual, minimal text

### 5. Feature Showcase (tabbed or scrolling)
- **Modifier Keys**: Option, Command, Control, Shift, Fn (left/right)
- **F-Keys**: F1-F12 triggers
- **Multi-Step Shortcuts**: Up to 3 shortcut steps in sequence
- **Shell Commands**: Run any terminal command on double-tap
- Each feature: icon/visual + short description + screenshot

### 6. How It Works
- 3-step visual:
  1. Pick a trigger key (e.g. double-tap Right Option)
  2. Assign an action (shortcut or shell command)
  3. Double-tap to fire
- Simple, clean, no jargon

### 7. Feedback HUD
- Show the 3 HUD styles: Glass, Notch, Off
- Screenshots or short video/GIF of each
- Highlight the notch-expanding animation

### 8. Privacy & Security
- "Runs locally. No internet required."
- No analytics, no tracking, no cloud
- Accessibility permission explained simply
- Open or closed source note

### 9. Pricing
- Simple card:
  - 14-day free trial
  - One-time purchase $X (Gumroad link)
  - Lifetime updates included
- Keep it on the same page (no separate pricing page needed yet)

### 10. Download / Final CTA
- "Try DoubleTap free for 14 days"
- Download DMG button
- macOS version requirement
- "Buy License" button (Gumroad)

### 11. Footer
- Logo + tagline
- Links: Download, Changelog, Privacy Policy, Contact
- Social links (if any)
- Copyright

## Pages (for later)

These can be added as the product grows:

- **/changelog** — version history (simple list)
- **/privacy** — privacy policy
- **/terms** — terms of use
- **/contact** — email or form

## Design Principles

- Dark-first design (matches the app and hero)
- Minimal, lots of whitespace
- Scroll-reveal animations (subtle fade-in on scroll)
- macOS-native feel (SF-style typography, rounded corners, glass effects)
- Mobile responsive
- Fast loading (no heavy frameworks, optimized images)

## Assets Needed

- [ ] App screenshots (settings view, mapping detail, sidebar)
- [ ] HUD style screenshots/GIFs (glass, notch)
- [ ] Short demo video or animated GIF of double-tap in action
- [ ] Favicon (from app icon)
- [ ] Open Graph image for social sharing

## File Structure

```
DoubleTap-website/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── main.js
├── assets/
│   ├── icons/          (app icons)
│   ├── keys/           (modifier key symbols)
│   ├── screenshots/    (app screenshots, to add)
│   └── og-image.png    (social sharing, to add)
├── favicon.ico
├── PLAN.md
└── README.md           (optional)
```
