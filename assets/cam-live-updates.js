/* CAM SPORTS: one small foreground revision check; reload data only after changes. */
(() => {
  'use strict';
  const BASE_DELAY = 60000, MAX_DELAY = 300000;
  let timer, inFlight = false, stopped = false, revisions = null, failures = 0;
  const pending = new Set();
  const client = () => typeof db !== 'undefined' ? db : null;
  const editing = () => Boolean(document.querySelector('dialog[open]') ||
    document.activeElement?.matches('input,textarea,select,[contenteditable="true"]'));
  const emit = name => document.dispatchEvent(new CustomEvent(name, {detail: {source: 'live'}}));
  const safely = task => { try { Promise.resolve(task()).catch(() => {}); } catch {} };

  function flush() {
    if (document.hidden || editing() || !pending.size) return;
    const changes = new Set(pending);
    pending.clear();
    if (changes.has('takes')) emit('ae:takes-updated');
    if (changes.has('picks')) emit('cam:live-picks');
    if (changes.has('community')) emit('cam:live-community');
    if (changes.has('news')) safely(() => {
      if (typeof loadArticlesFromStorage === 'function') return loadArticlesFromStorage();
    });
    if (changes.has('scores')) {
      safely(() => window.camNflQuiniela?.refreshLive?.());
      safely(() => window.camFootballQuiniela?.refreshLive?.());
      if (typeof currentCategory !== 'undefined' && currentCategory === 'NFL')
        safely(() => window.camNflQuiniela?.refreshStandings?.());
      if (typeof currentCategory !== 'undefined' && currentCategory === 'Fútbol')
        safely(() => window.camFootballQuiniela?.refreshStandings?.());
      if (typeof currentCategory !== 'undefined' && currentCategory === 'Todos' && !changes.has('takes')) {
        safely(() => window.camHomeJornada?.refresh?.());
      }
      emit('cam:live-community');
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!stopped && !document.hidden && navigator.onLine !== false) {
      timer = setTimeout(check, Math.min(MAX_DELAY, BASE_DELAY * 2 ** failures));
    }
  }
  async function check() {
    clearTimeout(timer);
    if (stopped || document.hidden || navigator.onLine === false || inFlight) return;
    const connection = client();
    if (!connection) { schedule(); return; }
    inFlight = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 10000);
    try {
      const query = connection.rpc('cam_read_live_revisions');
      const result = await (query.abortSignal ? query.abortSignal(controller.signal) : query);
      if (result.error) throw result.error;
      const next = result.data;
      if (!next || Array.isArray(next) || typeof next !== 'object') throw Error('Invalid revisions');
      if (revisions) {
        for (const key of ['takes', 'picks', 'news', 'community', 'scores']) {
          if (next[key] != null && next[key] !== revisions[key]) pending.add(key);
        }
      }
      revisions = next;
      failures = 0;
      flush();
    } catch {
      failures = Math.min(failures + 1, 3);
    } finally {
      clearTimeout(deadline);
      inFlight = false;
      schedule();
    }
  }
  function resume() { if (!document.hidden) { flush(); void check(); } else clearTimeout(timer); }
  document.addEventListener('visibilitychange', resume);
  document.addEventListener('focusout', () => setTimeout(flush, 0));
  document.addEventListener('close', flush, true);
  window.addEventListener('online', resume);
  window.addEventListener('offline', () => clearTimeout(timer));
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); });
  window.addEventListener('pageshow', () => { if (stopped) { stopped = false; resume(); } });
  window.camLiveUpdates = Object.freeze({check});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, {once: true});
  else void check();
})();
