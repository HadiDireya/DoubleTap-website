/* ================================================================
   DoubleTap Pricing Page — Script
   Theme toggle, mobile nav, tier selector, scroll reveal.
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
   Nav — scrolled + mobile toggle
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
   Smooth scroll for anchor links
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
   Pricing cards — point each card's CTA at its Gumroad variant
   ================================================================ */
const GUMROAD_BASE_URL = 'https://hadidireya.gumroad.com/l/DoubleTap';

document.querySelectorAll('.price-card').forEach((card) => {
  const cta = card.querySelector('.price-card-cta');
  if (!cta) return;

  const { name, price } = card.dataset;
  if (!name || !price) return;

  const params = new URLSearchParams({
    variant: name,
    option: name,
    price,
    wanted: 'true',
  });
  cta.href = `${GUMROAD_BASE_URL}?${params.toString()}`;
});

/* ================================================================
   Scroll reveal
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
