/* CAM SPORTS — Reuse the actual sport nav as a mobile bottom bar (no cloned buttons). */
(() => {
  'use strict';

  const nav = document.querySelector('body > header nav.ae-sport-nav');
  if (!nav || !document.body || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const originalParent = nav.parentNode;
  const originalNextSibling = nav.nextSibling;
  const originalLabel = nav.getAttribute('aria-label') || 'Explorar deportes';
  const buttons = Array.from(nav.querySelectorAll('button.category-btn[data-category]'));
  const mainSports = new Set(['Picks', 'NFL', 'Fútbol', 'Opiniones']);
  const editableSelector = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

  function updateActive() {
    for (const button of buttons) {
      // filterByCategory() remains the only navigation/selection implementation.
      const active = button.classList.contains('active');
      if (mainSports.has(button.dataset.category)) {
        button.setAttribute('aria-pressed', String(active));
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
    }
  }

  function updatePlacement() {
    if (mobile.matches) {
      if (nav.parentNode !== document.body) document.body.appendChild(nav);
      nav.classList.add('cam-mobile-bottom-nav');
      nav.setAttribute('aria-label', 'Secciones principales de CAM SPORTS');
    } else {
      if (nav.parentNode !== originalParent) originalParent.insertBefore(nav, originalNextSibling);
      nav.classList.remove('cam-mobile-bottom-nav');
      nav.setAttribute('aria-label', originalLabel);
      document.body.classList.remove('cam-mobile-input-focus');
    }
    updateActive();
  }

  // The existing filter can be called by footer links, logo, rankings, and other scripts.
  // Reflect its .active state without wrapping or replacing filterByCategory().
  const observer = new MutationObserver(updateActive);
  for (const button of buttons) {
    observer.observe(button, { attributes: true, attributeFilter: ['class'] });
  }
  nav.addEventListener('click', () => Promise.resolve().then(updateActive));
  window.addEventListener('pageshow', updateActive);
  window.addEventListener('popstate', updateActive);

  function isEditing(element) {
    return element instanceof Element && !!element.closest(editableSelector);
  }
  document.addEventListener('focusin', (event) => {
    if (mobile.matches && isEditing(event.target)) document.body.classList.add('cam-mobile-input-focus');
  }, true);
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      document.body.classList.toggle('cam-mobile-input-focus',
        mobile.matches && isEditing(document.activeElement));
    }, 0);
  }, true);

  if (typeof mobile.addEventListener === 'function') {
    mobile.addEventListener('change', updatePlacement);
  } else if (typeof mobile.addListener === 'function') {
    mobile.addListener(updatePlacement);
  }
  updatePlacement();
})();
