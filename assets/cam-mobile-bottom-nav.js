/* CAM SPORTS — phone app dock: Inicio · NFL · Fútbol · Picks · Opiniones.
   Reuses the real header category buttons (same handlers, same filterByCategory);
   only their place and order change on phones. Perfil lives in the header
   and opens the profile (or sign-in).
   Everything is restored exactly on wider screens. */
(() => {
  'use strict';

  const nav = document.querySelector('body > header nav.ae-sport-nav');
  if (!nav || !document.body || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const originalParent = nav.parentNode;
  const originalNextSibling = nav.nextSibling;
  const originalLabel = nav.getAttribute('aria-label') || 'Explorar deportes';
  const buttons = Array.from(nav.querySelectorAll('button.category-btn[data-category]'));
  const originalOrder = buttons.slice();
  const byCategory = key => buttons.find(button => button.dataset.category === key) || null;
  const home = byCategory('Todos');
  const opinions = byCategory('Opiniones');
  const DOCK = ['Todos', 'NFL', 'Fútbol', 'Picks', 'Opiniones'];
  const dockButtons = DOCK.map(byCategory).filter(Boolean);
  const originalButtonLabels = new Map(buttons.map(button => [button, button.getAttribute('aria-label')]));
  const homeOriginal = home ? { html: home.innerHTML, hidden: home.hidden } : null;
  const actions = document.querySelector('body > header .ae-header-actions');
  const editableSelector = 'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';
  const svgAttrs = 'class="cam-category-nav-symbol cam-mobile-nav-symbol" viewBox="1.750 1.750 20.500 20.500" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';
  const HOME_ICON = '<span class="ae-nav-icon"><svg ' + svgAttrs + '><path d="M2.9 11.3 12 3.5l9.1 7.8"/><path d="M5.3 9.5v11.1h13.4V9.5"/><path d="M16 5.9V4h2.2v3.8"/><path d="M9.9 20.6v-5.3a.9.9 0 0 1 .9-.9h2.4a.9.9 0 0 1 .9.9v5.3Z" fill="currentColor" stroke="none"/></svg></span><span>Inicio</span>';
  const PROFILE_ICON = '<span class="ae-nav-icon"><svg ' + svgAttrs + '><circle cx="12" cy="8.1" r="4.2" fill="currentColor" fill-opacity=".22"/><path d="M3.7 21c.7-4.4 4.1-7.1 8.3-7.1s7.6 2.7 8.3 7.1Z" fill="currentColor" fill-opacity=".22"/></svg></span><span>Perfil</span>';

  // A plain category-btn keeps the dock's shared styling. It has no data-category,
  // so filterByCategory never marks it active and sport counts ignore it.
  const profile = document.createElement('button');
  profile.type = 'button';
  profile.id = 'camNavProfile';
  profile.className = 'category-btn';
  profile.innerHTML = PROFILE_ICON;
  profile.addEventListener('click', () => {
    if (typeof window.openAeProfile === 'function') window.openAeProfile();
    else if (typeof window.openUserAuthModal === 'function') window.openUserAuthModal();
  });

  const signedIn = () => (typeof currentUser !== 'undefined' && Boolean(currentUser)) ||
    (typeof currentAdmin !== 'undefined' && Boolean(currentAdmin));
  function labelProfile() {
    const name = (typeof currentUser !== 'undefined' && currentUser?.username) ||
      (typeof currentAdmin !== 'undefined' && currentAdmin?.name) || '';
    const label = signedIn() ? (name ? 'Mi perfil, ' + name : 'Mi perfil') : 'Perfil: iniciar sesión o crear cuenta';
    profile.setAttribute('aria-label', label);
    profile.title = signedIn() ? 'Mi perfil' : 'Iniciar sesión';
  }

  let lastActive = null;
  function updateActive() {
    let active = null;
    for (const button of dockButtons) {
      const on = button.classList.contains('active');
      button.setAttribute('aria-pressed', String(on));
      if (on) { button.setAttribute('aria-current', 'page'); active = button; }
      else button.removeAttribute('aria-current');
    }
    if (opinions) {
      if (opinions.classList.contains('active')) opinions.setAttribute('aria-current', 'page');
      else opinions.removeAttribute('aria-current');
    }
    lastActive = active;
    labelProfile();
  }

  function phoneLayout() {
    if (nav.parentNode !== document.body) document.body.appendChild(nav);
    nav.classList.add('cam-mobile-bottom-nav');
    nav.setAttribute('aria-label', 'Secciones principales de CAM SPORTS');
    if (home) {
      if (!home.querySelector('.ae-nav-icon')) home.innerHTML = HOME_ICON;
      home.hidden = false;
      home.removeAttribute('aria-hidden');
    }
    // The five real category buttons retain their original handlers.
    for (const button of dockButtons) nav.appendChild(button);
    for (const button of originalOrder) {
      if (!dockButtons.includes(button) && button !== opinions) nav.appendChild(button);
    }
    if (actions && profile.parentNode !== actions) {
      const theme = actions.querySelector("#themeToggle");
      actions.insertBefore(profile, theme?.parentNode === actions ? theme.nextSibling : actions.firstChild);
    }
    for (const button of dockButtons) button.setAttribute('aria-label', button === home ? 'Inicio' : button.dataset.category);
  }

  function desktopLayout() {
    if (nav.parentNode !== originalParent) originalParent.insertBefore(nav, originalNextSibling);
    profile.remove();
    for (const button of originalOrder) nav.appendChild(button);
    if (home && homeOriginal) {
      home.innerHTML = homeOriginal.html;
      home.hidden = homeOriginal.hidden;
    }
    nav.classList.remove('cam-mobile-bottom-nav', 'cam-nav-has-active');
    nav.style.removeProperty('--cam-pill-left');
    nav.style.removeProperty('--cam-pill-width');
    nav.setAttribute('aria-label', originalLabel);
    document.body.classList.remove('cam-mobile-input-focus');
    for (const button of buttons) {
      const original = originalButtonLabels.get(button);
      if (original === null || original === undefined) button.removeAttribute('aria-label');
      else button.setAttribute('aria-label', original);
    }
  }

  function updatePlacement() {
    if (mobile.matches) phoneLayout();
    else desktopLayout();
    updateActive();
  }

  // Reflect section changes from the nav, footer, logo and every existing script.
  const observer = new MutationObserver(updateActive);
  for (const button of buttons) observer.observe(button, { attributes: true, attributeFilter: ['class'] });

  // Tapping the tab you are already on returns to the top, as in phone apps.
  let reselect = false;
  nav.addEventListener('click', event => {
    const button = event.target.closest?.('button.category-btn[data-category]');
    reselect = Boolean(button && mobile.matches && button === lastActive);
  }, true);
  nav.addEventListener('click', () => {
    const again = reselect;
    reselect = false;
    Promise.resolve().then(() => {
      updateActive();
      if (again) {
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
        document.dispatchEvent(new CustomEvent('cam:dock-reselect'));
      }
    });
  });
  window.addEventListener('pageshow', updateActive);
  window.addEventListener('popstate', updateActive);
  window.addEventListener('resize', updateActive);
  document.addEventListener('focusin', event => { if (event.target === profile) labelProfile(); });

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
  window.camMobileDock = Object.freeze({ profile, update: updateActive });
})();
