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
   Tier selector — switch pricing + Gumroad variant
   ================================================================ */
const GUMROAD_BASE_URL = 'https://hadidireya.gumroad.com/l/DoubleTap';
const tierSelector = document.getElementById('tier-selector');
const priceDisplay = document.getElementById('price-display');
const breakdownPrice = document.getElementById('breakdown-price');
const breakdownTotal = document.getElementById('breakdown-total');
const buyBtn = document.querySelector('.pricing-buy-btn');

if (tierSelector && priceDisplay && breakdownPrice && breakdownTotal) {
  const tiers = tierSelector.querySelectorAll('.pricing-tier');
  const radios = tierSelector.querySelectorAll('input[name="tier"]');

  const updateTier = (selectedRadio) => {
    const price = selectedRadio.value;
    const formatted = `$${price}`;

    priceDisplay.textContent = formatted;
    breakdownPrice.textContent = formatted;
    breakdownTotal.textContent = formatted;

    tiers.forEach((tier) => tier.classList.remove('pricing-tier-selected'));
    selectedRadio.closest('.pricing-tier').classList.add('pricing-tier-selected');

    if (buyBtn) {
      const variant = selectedRadio.dataset.name || '';
      const params = new URLSearchParams();
      if (variant) params.set('variant', variant);
      params.set('option', variant);
      params.set('price', price);
      params.set('wanted', 'true');
      buyBtn.href = `${GUMROAD_BASE_URL}?${params.toString()}`;
    }
  };

  radios.forEach((radio) => {
    radio.addEventListener('change', () => updateTier(radio));
  });

  tiers.forEach((tier) => {
    tier.addEventListener('click', () => {
      const radio = tier.querySelector('input[type="radio"]');
      if (!radio) return;
      radio.checked = true;
      updateTier(radio);
    });
  });

  const initialRadio = tierSelector.querySelector('input[name="tier"]:checked');
  if (initialRadio) updateTier(initialRadio);
}

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
