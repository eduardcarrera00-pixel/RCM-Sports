/* CAM SPORTS — reuse the real category buttons in a phone-only capsule dock. */
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
  const originalButtonLabels = new Map(buttons.map(button => [button, button.getAttribute('aria-label')]));
  const editableSelector = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

  function positionCapsule(activeButton) {
    if (!mobile.matches || nav.parentNode !== document.body) return;
    if (!activeButton) {
      nav.classList.remove('cam-nav-has-active');
      return;
    }
    // The indicator is a single nav pseudo-element; no duplicate links or overlays.
    const bar = nav.getBoundingClientRect();
    const target = activeButton.getBoundingClientRect();
    if (bar.width > 0 && target.width > 0) {
      const left = Math.max(0, target.left - bar.left + 2);
      nav.style.setProperty('--cam-pill-left', left.toFixed(2) + 'px');
      nav.style.setProperty('--cam-pill-width', Math.max(0, target.width - 4).toFixed(2) + 'px');
    }
    nav.classList.add('cam-nav-has-active');
  }

  function updateActive() {
    let activeMain = null;
    for (const button of buttons) {
      // Existing filterByCategory() is still the only navigation implementation.
      const active = button.classList.contains('active');
      if (mainSports.has(button.dataset.category)) {
        button.setAttribute('aria-pressed', String(active));
        if (active) {
          button.setAttribute('aria-current', 'page');
          activeMain = button;
        } else {
          button.removeAttribute('aria-current');
        }
      }
    }
    // Home ("Todos") and optional sections have no falsely selected main tab.
    positionCapsule(activeMain);
  }

  function updatePlacement() {
    if (mobile.matches) {
      if (nav.parentNode !== document.body) document.body.appendChild(nav);
      nav.classList.add('cam-mobile-bottom-nav');
      nav.setAttribute('aria-label', 'Secciones principales de CAM SPORTS');
      // Inactive text is visually hidden, so preserve explicit accessible names.
      for (const button of buttons) {
        if (mainSports.has(button.dataset.category)) button.setAttribute('aria-label', button.dataset.category);
      }
    } else {
      if (nav.parentNode !== originalParent) originalParent.insertBefore(nav, originalNextSibling);
      nav.classList.remove('cam-mobile-bottom-nav', 'cam-nav-has-active');
      nav.style.removeProperty('--cam-pill-left');
      nav.style.removeProperty('--cam-pill-width');
      nav.setAttribute('aria-label', originalLabel);
      document.body.classList.remove('cam-mobile-input-focus');
      for (const button of buttons) {
        const original = originalButtonLabels.get(button);
        if (original === null) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', original);
      }
    }
    updateActive();
  }

  // Reflect section changes from the nav, footer, logo and every existing script.
  const observer = new MutationObserver(updateActive);
  for (const button of buttons) observer.observe(button, { attributes: true, attributeFilter: ['class'] });
  nav.addEventListener('click', () => Promise.resolve().then(updateActive));
  window.addEventListener('pageshow', updateActive);
  window.addEventListener('popstate', updateActive);
  window.addEventListener('resize', updateActive);

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
