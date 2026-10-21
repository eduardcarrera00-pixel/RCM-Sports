/* CAM SPORTS — Open the classical welcome on the first home visit of each tab session.
   Keep the original five-minute registration notification and admin preview intact. */
(() => {
  'use strict';
  const KEY = 'cam_sports_home_welcome_seen_session_v1';
  const $ = id => document.getElementById(id);
  let locallyShown = false;
  let pending = null;
  let retries = 0;
  // Warm only the image used by the current theme before the first welcome opens.
  // Using the same URL as CSS lets the browser reuse the downloaded bytes.
  function preloadWelcomeBackground() {
    const theme = document.documentElement.classList.contains('dark') ? 'noche' : 'dia';
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = 'assets/cam-welcome-' + theme + '-fast.webp';
    link.fetchPriority = 'high';
    document.head.appendChild(link);
  }
  function hasSeen() {
    if (locallyShown) return true;
    try { return sessionStorage.getItem(KEY) === '1'; }
    catch (_) { return false; }
  }
  function remember() {
    locallyShown = true;
    try { sessionStorage.setItem(KEY, '1'); } catch (_) {}
  }
  function onHome() {
    // Do not interrupt deep-linked picks, articles, comments or take discussions.
    const params = new URLSearchParams(location.search);
    return !['article', 'pick', 'take', 'comment'].some(k => params.has(k));
  }
  function safeToOpen() {
    if (document.hidden || $('camWelcomeDialog')?.open) return false;
    if (document.querySelector('dialog[open]')) return false;
    const auth = $('userAuthModal');
    return !auth || auth.classList.contains('hidden');
  }
  function tryOpen() {
    pending = null;
    if (hasSeen() || !onHome()) return;
    const dialog = $('camWelcomeDialog');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    if (!safeToOpen()) {
      if (++retries < 90) pending = setTimeout(tryOpen, 1400);
      return;
    }
    try {
      const label = $('camWelcomePreviewLabel');
      if (label) label.hidden = true;
      dialog.showModal();
      remember();
    } catch (_) {
      if (++retries < 90) pending = setTimeout(tryOpen, 1400);
    }
  }
  function init() {
    // When the visitor has already been welcomed on this tab, don't schedule
    // a second automatic popup following signup; the five-minute inbox
    // notification remains available from the notification bell.
    const api = window.camWelcome;
    if (api && typeof api.startNewAccount === 'function') {
      const startOriginal = api.startNewAccount;
      api.startNewAccount = function(id) {
        if (hasSeen()) return;
        return startOriginal.call(this, id);
      };
    }
    if (!hasSeen() && onHome()) {
      preloadWelcomeBackground();
      pending = setTimeout(tryOpen, 100);
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !hasSeen() && onHome()) {
        clearTimeout(pending);
        pending = setTimeout(tryOpen, 350);
      }
    });
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
