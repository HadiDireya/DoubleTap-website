/* ================================================================
   DoubleTap Pricing Page — Script
   ================================================================ */

/* ================================================================
   Nav — Mobile hamburger toggle
   ================================================================ */

const nav = document.getElementById('nav');
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

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    closeNav();
  });
});

/* ================================================================
   Tier selector — switch pricing
   ================================================================ */

const tierSelector = document.getElementById('tier-selector');
const priceDisplay = document.getElementById('price-display');
const breakdownPrice = document.getElementById('breakdown-price');
const breakdownTotal = document.getElementById('breakdown-total');
const tiers = tierSelector.querySelectorAll('.checkout-tier');
const radios = tierSelector.querySelectorAll('input[name="tier"]');
const buyBtn = document.querySelector('.checkout-buy-btn');
const GUMROAD_BASE_URL = 'https://hadidireya.gumroad.com/l/DoubleTap';

const updateTier = (selectedRadio) => {
  const price = selectedRadio.value;
  const formatted = `$${price}`;

  priceDisplay.textContent = formatted;
  breakdownPrice.textContent = formatted;
  breakdownTotal.textContent = formatted;

  tiers.forEach(tier => tier.classList.remove('checkout-tier-selected'));
  selectedRadio.closest('.checkout-tier').classList.add('checkout-tier-selected');

  // Pre-select the variant on Gumroad via query params.
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

radios.forEach(radio => {
  radio.addEventListener('change', () => {
    updateTier(radio);
  });
});

// Initialize the buy URL for the default-checked tier.
const initialRadio = tierSelector.querySelector('input[name="tier"]:checked');
if (initialRadio) updateTier(initialRadio);

/* Also handle clicking the label directly */
tiers.forEach(tier => {
  tier.addEventListener('click', () => {
    const radio = tier.querySelector('input[type="radio"]');
    radio.checked = true;
    updateTier(radio);
  });
});

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
