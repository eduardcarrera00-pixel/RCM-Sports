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

  // The original WebP artwork contains detail/color that is lost when the dock
  // applies monochrome image filters. Draw transparent, single-color SVG icons
  // ONLY for the relocated phone navigation; keep the desktop images intact.
  const svgNS = 'http://www.w3.org/2000/svg';
  const mobileIconShapes = {
    Picks: [
      ['circle', { cx: 12, cy: 12, r: 9 }],
      ['circle', { cx: 12, cy: 12, r: 5.5 }],
      ['circle', { cx: 12, cy: 12, r: 1.7, fill: 'currentColor', stroke: 'none' }]
    ],
    NFL: [
      ['path', { d: 'M20.2 3.8c-6.2 0-10.3 2.1-13.3 5.1S2.3 16 3.8 20.2c4.2 1.5 8.3-.1 11.3-3.1s5.1-7.1 5.1-13.3Z' }],
      ['path', { d: 'm8 8 8 8' }],
      ['path', { d: 'm9.4 12.2 2.8-2.8M11.8 14.6l2.8-2.8' }]
    ],
    'Fútbol': [
      ['circle', { cx: 12, cy: 12, r: 9 }],
      ['polygon', { points: '12,7 16,10 14.7,15 9.3,15 8,10' }],
      ['path', { d: 'M12 7V3.2M8 10 4.2 8.2M9.3 15l-2 4.2M14.7 15l2 4.2M16 10l3.8-1.8' }]
    ],
    Opiniones: [
      ['path', { d: 'M20.5 11a8.5 8.5 0 0 1-8.5 8.5c-1.2 0-2.5-.2-3.7-.7L3.5 20l1.2-4.8A8.5 8.5 0 1 1 20.5 11Z' }],
      ['path', { d: 'M8 10.5h8M8 13.5h5' }]
    ]
  };

  function mountMobileVectorIcons() {
    for (const button of buttons) {
      const shapes = mobileIconShapes[button.dataset.category];
      const wrapper = button.querySelector('.ae-nav-icon');
      if (!shapes || !wrapper || wrapper.querySelector('.cam-mobile-nav-symbol')) continue;
      const svg = document.createElementNS(svgNS, 'svg');
      for (const [name, value] of Object.entries({
        class: 'cam-mobile-nav-symbol',
        viewBox: '0 0 24 24',
        width: 27, height: 27,
        fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        focusable: 'false', 'aria-hidden': 'true'
      })) svg.setAttribute(name, String(value));
      for (const [shapeName, attrs] of shapes) {
        const shape = document.createElementNS(svgNS, shapeName);
        for (const [name, value] of Object.entries(attrs)) shape.setAttribute(name, String(value));
        svg.appendChild(shape);
      }
      wrapper.appendChild(svg);
    }
  }
  mountMobileVectorIcons();

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
