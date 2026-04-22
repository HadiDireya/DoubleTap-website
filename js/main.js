/* ================================================================
   DoubleTap Website — Main Script
   Terminal aesthetic. Theme toggle, cycling action slot, scroll
   reveal, triggers ledger, mobile nav.
   ================================================================ */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* ================================================================
   Theme toggle (dark / light)
   ================================================================ */
const themeButtons = document.querySelectorAll('.theme-toggle button');

const setTheme = (t) => {
  document.body.classList.toggle('light', t === 'light');
  themeButtons.forEach((b) => b.classList.toggle('active', b.dataset.theme === t));
  try { localStorage.setItem('dt-theme', t); } catch (e) { /* noop */ }
};

themeButtons.forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.theme)));

try {
  const saved = localStorage.getItem('dt-theme');
  if (saved === 'light' || saved === 'dark') setTheme(saved);
} catch (e) { /* noop */ }

/* ================================================================
   Nav — Scrolled state + mobile toggle
   ================================================================ */
const nav = document.getElementById('nav');
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

if (nav) {
  const handleNavScroll = () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  };
  window.addEventListener('scroll', handleNavScroll, { passive: true });
}

if (navToggle && navLinks) {
  const closeNav = () => {
    nav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open');
  };

  navToggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('nav-open', isOpen);
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeNav);
  });
}

/* ================================================================
   Smooth scroll for anchor links (respecting reduce-motion)
   ================================================================ */
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (targetId === '#' || targetId === '') return;

    const behavior = prefersReducedMotion.matches ? 'auto' : 'smooth';

    if (targetId === '#top') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior });
      return;
    }

    const target = document.querySelector(targetId);
    if (!target) return;

    e.preventDefault();
    const navHeight = nav ? nav.offsetHeight : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 12;
    window.scrollTo({ top, behavior });
  });
});

/* ================================================================
   Hero — cycling action slot + tap-key modifier carousel
   ================================================================ */
const actionItems = document.querySelectorAll('#action-slot .action-item');
const actionIndicators = document.querySelectorAll('#action-indicators .i');
const tapKey = document.getElementById('tap-key');
const tapKeySvg = document.getElementById('tap-key-svg');
const tapKeyName = document.getElementById('tap-key-name');
const tapLabel = document.getElementById('tap-label');

const HERO_MODIFIERS = [
  { svg: 'option.svg',  name: 'option',  label: 'Left Option',   side: 'left',  mod: 'option'  },
  { svg: 'command.svg', name: 'command', label: 'Right Command', side: 'right', mod: 'command' },
  { svg: 'control.svg', name: 'control', label: 'Left Control',  side: 'left',  mod: 'control' },
  { svg: 'globe.svg',   name: 'fn',      label: 'Fn',            side: 'left',  mod: 'fn'      },
];

if (actionItems.length > 0 || tapKey) {
  let idx = 0;
  setInterval(() => {
    idx += 1;
    if (actionItems.length > 0) {
      const a = idx % actionItems.length;
      actionItems.forEach((it, i) => it.classList.toggle('active', i === a));
      actionIndicators.forEach((d, i) => d.classList.toggle('on', i === a));
    }
    if (tapKey && tapKeySvg && tapKeyName && tapLabel) {
      const m = HERO_MODIFIERS[idx % HERO_MODIFIERS.length];
      tapKey.dataset.side = m.side;
      tapKey.dataset.mod = m.mod;
      tapKeySvg.src = `assets/keys/${m.svg}`;
      tapKeyName.textContent = m.name;
      tapLabel.textContent = m.label;
    }
  }, 2400);
}

/* ================================================================
   Triggers — interactive keyboard + rotating ledger
   ================================================================ */
const kbTargets = document.querySelectorAll('.kb-key[data-target]');
const kbHud = document.getElementById('kb-hud');
const kbHudLabel = document.getElementById('kb-hud-label');

const TRIGGER_LABELS = {
  lopt: 'Spotlight opened',
  ropt: 'Ghostty launched',
  rcmd: 'Saved → Closed → Switched',
  fn: 'Clipboard piped to jq',
  lctrl: 'Dictation started',
  lcmd: 'Hide all windows',
  lshift: 'Caps Lock toggled',
  rshift: 'Screen zoomed',
};

const setActiveTarget = (target) => {
  kbTargets.forEach((k) => k.classList.toggle('is-target', k.dataset.target === target));
};

let hudTimer = null;
const showHud = (label) => {
  if (!kbHud || !kbHudLabel) return;
  kbHudLabel.textContent = label;
  kbHud.classList.add('is-visible');
  if (hudTimer) clearTimeout(hudTimer);
  hudTimer = setTimeout(() => kbHud.classList.remove('is-visible'), 1800);
};

const fireKey = (key) => {
  key.classList.remove('is-fired');
  void key.offsetWidth;
  key.classList.add('is-fired');
  key.classList.add('is-pressed');
  setTimeout(() => key.classList.remove('is-pressed'), 140);
  setTimeout(() => key.classList.remove('is-fired'), 700);
  const target = key.dataset.target;
  if (target) {
    setActiveTarget(target);
    showHud(TRIGGER_LABELS[target] || 'Action fired');
  }
};

kbTargets.forEach((key) => {
  key.addEventListener('click', () => fireKey(key));
});

/* ================================================================
   Scroll reveal — IntersectionObserver
   ================================================================ */
const revealElements = document.querySelectorAll('.reveal');

if (revealElements.length > 0 && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
  );

  revealElements.forEach((el) => revealObserver.observe(el));
} else {
  revealElements.forEach((el) => el.classList.add('revealed'));
}
