/* ================================================================
   DoubleTap Website — Main Script
   ================================================================ */

const hero = document.getElementById('hero');
const icons = {
  dark: document.getElementById('icon-dark'),
  light: document.getElementById('icon-light'),
  mono: document.getElementById('icon-mono'),
};

const modes = ['dark', 'light', 'mono'];
let currentMode = 0;

/* ================================================================
   Hero — Icon theme cycling on double-click
   ================================================================ */

hero.addEventListener('dblclick', () => {
  currentMode = (currentMode + 1) % modes.length;
  const mode = modes[currentMode];

  document.body.classList.remove('light', 'mono');
  if (mode !== 'dark') {
    document.body.classList.add(mode);
  }

  Object.values(icons).forEach(img => img.classList.remove('active'));
  icons[mode].classList.add('active');
});

/* ================================================================
   Nav — Scrolled state with backdrop blur
   ================================================================ */

const nav = document.getElementById('nav');

const handleNavScroll = () => {
  if (window.scrollY > 20) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }
};

window.addEventListener('scroll', handleNavScroll, { passive: true });

/* ================================================================
   Nav — Mobile hamburger toggle
   ================================================================ */

const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');

const openNav = () => {
  nav.classList.add('open');
  navToggle.setAttribute('aria-expanded', 'true');
  document.body.classList.add('nav-open');
};

const closeNav = () => {
  nav.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('nav-open');
};

navToggle.addEventListener('click', () => {
  const isOpen = nav.classList.contains('open');
  if (isOpen) {
    closeNav();
  } else {
    openNav();
  }
});

/* Close mobile nav when a link is clicked */
const navLinkItems = navLinks.querySelectorAll('a');
navLinkItems.forEach(link => {
  link.addEventListener('click', () => {
    closeNav();
  });
});

/* ================================================================
   Smooth scroll for anchor links
   ================================================================ */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (targetId === '#') {
      return;
    }

    const scrollBehavior = prefersReducedMotion.matches ? 'auto' : 'smooth';

    if (targetId === '#top') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: scrollBehavior });
      return;
    }

    const targetEl = document.querySelector(targetId);
    if (targetEl) {
      e.preventDefault();
      const navHeight = nav.offsetHeight;
      const targetPosition = targetEl.getBoundingClientRect().top + window.scrollY - navHeight;

      window.scrollTo({
        top: targetPosition,
        behavior: scrollBehavior,
      });
    }
  });
});

/* ================================================================
   Feature card — HUD shape toggle (Glass / Notch)
   ================================================================ */

const hudPreview = document.querySelector('.feature-hud-preview');
const hudOptions = document.querySelectorAll('.feature-hud-option');

if (hudPreview && hudOptions.length > 0) {
  hudOptions.forEach(option => {
    option.addEventListener('click', () => {
      const style = option.dataset.hud;
      hudPreview.dataset.hudStyle = style;
      hudOptions.forEach(other => {
        const isActive = other === option;
        other.classList.toggle('active', isActive);
        other.setAttribute('aria-selected', String(isActive));
      });
    });
  });
}

/* ================================================================
   Feature card — Adjustable speed slider
   ================================================================ */

const speedSlider = document.querySelector('.feature-slider-input');
const speedValue = document.querySelector('.feature-slider-value-number');

if (speedSlider) {
  const updateSlider = () => {
    const min = Number(speedSlider.min);
    const max = Number(speedSlider.max);
    const val = Number(speedSlider.value);
    const progress = ((val - min) / (max - min)) * 100;
    speedSlider.style.setProperty('--slider-progress', `${progress}%`);
    if (speedValue) {
      speedValue.textContent = val.toFixed(2);
    }
  };

  updateSlider();
  speedSlider.addEventListener('input', updateSlider);
}

/* ================================================================
   Scroll reveal — IntersectionObserver
   ================================================================ */

const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px',
  }
);

revealElements.forEach(el => revealObserver.observe(el));
