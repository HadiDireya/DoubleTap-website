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
   Pricing cards — inline checkout. Click CTA → reveal email field →
   submit POSTs /lahza/init → redirect to Lahza's hosted checkout.
   No /buy hop, no plan re-selection.
   ================================================================ */
const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_BASE = window.DT_API_BASE
  || (isLocal ? 'http://127.0.0.1:8787' : 'https://doubletap-license.hadidireya.workers.dev');

document.querySelectorAll('.price-card').forEach((card) => {
  const cta = card.querySelector('.price-card-cta');
  const form = card.querySelector('.price-checkout');
  if (!cta || !form) return;

  const plan = card.dataset.plan;
  const ctaLabel = card.dataset.ctaLabel || 'Continue';
  const emailInput = form.querySelector('input[type="email"]');
  const payBtn = form.querySelector('.price-checkout-pay');
  const errorEl = form.querySelector('.price-checkout-error');

  cta.addEventListener('click', () => {
    cta.hidden = true;
    form.hidden = false;
    if (emailInput) emailInput.focus();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!plan || !emailInput || !payBtn) return;

    const email = (emailInput.value || '').trim();
    if (!email || email.indexOf('@') === -1) {
      showFormError(errorEl, 'Please enter a valid email address.');
      emailInput.focus();
      return;
    }
    hideFormError(errorEl);

    setBusy(payBtn, true, 'Redirecting…');
    emailInput.disabled = true;

    fetch(`${API_BASE}/lahza/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, plan }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.success || !data.authorization_url) {
          throw new Error((data && data.error) || 'init_failed');
        }
        window.location.href = data.authorization_url;
      })
      .catch((err) => {
        setBusy(payBtn, false, `${ctaLabel} →`);
        emailInput.disabled = false;
        showFormError(errorEl, `Couldn't start checkout (${err.message}). Please try again.`);
      });
  });
});

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.textContent = label;
}

function showFormError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function hideFormError(el) {
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
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
