/* CAM SPORTS · Predicciones de temporada (preguntas cerradas ae_take_questions).
 * Cada opción paga según su dificultad (1–20 pts, ae_take_options.points).
 * Público: preguntas abiertas y las ya resueltas en las que participó.
 * Admin: además, las cerradas sin resultado para validarlas o anularlas.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const LEAGUES = { laliga: 'LaLiga', premier: 'Premier League', ligamx: 'Liga MX', champions: 'Champions', nfl: 'NFL', colegial: 'Colegial' };
  const ORDER = ['laliga', 'premier', 'ligamx', 'champions', 'nfl', 'colegial'];
  const RECENT_DAYS = 60;
  let questions = [], options = [], mine = [], user = null, active = '', busy = false, request = 0, loaded = false;

  const client = () => { try { return typeof db !== 'undefined' ? db : window.db; } catch { return window.db; } };
  const isAdmin = () => { try { return typeof currentAdmin !== 'undefined' && Boolean(currentAdmin); } catch { return false; } };
  const isOpen = q => q.status === 'open' && new Date(q.closes_at).getTime() > Date.now();
  const closeText = s => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s));
  const optionsOf = q => options.filter(o => o.question_id === q.id);
  const pointsOf = (q, o) => { const n = Number(o.points); return Number.isFinite(n) && n > 0 ? n : Number(q.points); };
  const status = text => { const n = $('aeSeasonStatus'); if (n) n.textContent = text || ''; };
  const sortOptions = (q, list) => list.slice().sort((a, b) =>
    (/^otro/i.test(a.label) ? 1 : 0) - (/^otro/i.test(b.label) ? 1 : 0) || pointsOf(q, a) - pointsOf(q, b) || a.label.localeCompare(b.label, 'es'));

  function visibleQuestions() {
    const since = Date.now() - RECENT_DAYS * 864e5;
    return questions.filter(q => {
      if (q.status === 'void') return false;
      if (isOpen(q)) return true;
      const played = mine.some(m => m.question_id === q.id);
      if (q.status === 'settled') return played && new Date(q.settled_at || q.closes_at).getTime() > since;
      return isAdmin(); // cerrada sin resultado: solo para validar
    });
  }

  function rangeText(q) {
    const values = optionsOf(q).map(o => pointsOf(q, o));
    if (!values.length) return '';
    const lo = Math.min(...values), hi = Math.max(...values);
    return lo === hi ? hi + ' pts' : 'De ' + lo + ' a ' + hi + ' pts';
  }

  function renderQuestion(q) {
    const card = el('article', null, 'ae-season-card');
    const existing = mine.find(m => m.question_id === q.id);
    const open = isOpen(q);
    const meta = el('p', null, 'ae-season-meta');
    meta.append(el('span', (q.period === 'weekly' ? 'Partido' : 'Temporada') + ' · ' + rangeText(q)),
      el('span', q.status === 'settled' ? 'Resultado confirmado' : open ? 'Cierra el ' + closeText(q.closes_at) : 'Cerrada · pendiente de resultado'));
    card.append(meta, el('h3', q.prompt));

    const grid = el('div', null, 'ae-season-options');
    for (const o of sortOptions(q, optionsOf(q))) {
      const value = pointsOf(q, o);
      const chosen = existing?.option_id === o.id;
      const winner = q.status === 'settled' && q.correct_option_id === o.id;
      const b = el('button', null, 'ae-season-option');
      b.type = 'button';
      b.append(el('span', o.label, 'ae-season-option-label'), el('strong', '+' + value, 'ae-season-option-points'));
      b.setAttribute('aria-label', o.label + ', ' + value + ' puntos si aciertas' + (chosen ? ', tu elección' : '') + (winner ? ', resultado correcto' : ''));
      b.disabled = busy || !open || Boolean(existing);
      if (chosen) b.classList.add('is-chosen');
      if (winner) b.classList.add('is-winner');
      b.addEventListener('click', () => submit(q, o));
      grid.append(b);
    }
    card.append(grid);

    if (existing) {
      const picked = optionsOf(q).find(o => o.id === existing.option_id);
      const note = q.status === 'settled'
        ? (existing.awarded_points > 0 ? '¡Acertaste! +' + existing.awarded_points + ' pts' : 'Esta vez no fue. Tu elección: ' + (picked?.label || '—'))
        : 'Tu elección: ' + (picked?.label || '—') + ' · +' + (picked ? pointsOf(q, picked) : 0) + ' pts si aciertas';
      card.append(el('p', note, 'ae-season-note' + (q.status === 'settled' && existing.awarded_points > 0 ? ' is-won' : '')));
    }
    if (isAdmin() && q.status === 'open') card.append(adminTools(q, open));
    return card;
  }

  function adminTools(q, open) {
    const box = el('div', null, 'ae-season-admin');
    if (!open) {
      const select = el('select');
      select.setAttribute('aria-label', 'Resultado oficial de ' + q.prompt);
      const empty = el('option', 'Resultado oficial…'); empty.value = ''; select.append(empty);
      for (const o of sortOptions(q, optionsOf(q))) { const n = el('option', o.label + ' · ' + pointsOf(q, o) + ' pts'); n.value = o.id; select.append(n); }
      const settle = el('button', 'Validar resultado'); settle.type = 'button';
      settle.addEventListener('click', async () => {
        if (!select.value || busy) return;
        if (!confirm('¿Confirmar el resultado oficial y repartir los puntos?')) return;
        await adminAction('ae_settle_take', { p_question_id: q.id, p_option_id: select.value }, 'Resultado confirmado.');
      });
      box.append(select, settle);
    }
    const cancel = el('button', 'Anular', 'is-minor'); cancel.type = 'button';
    cancel.addEventListener('click', async () => {
      if (busy || !confirm('¿Anular esta pregunta sin repartir puntos?')) return;
      await adminAction('ae_void_take', { p_question_id: q.id }, 'Pregunta anulada.');
    });
    box.append(cancel);
    return box;
  }

  function render() {
    const root = $('aeSeasonPredictions');
    if (!root) return;
    const list = visibleQuestions();
    const leagues = ORDER.filter(c => list.some(q => q.competition === c));
    root.hidden = !leagues.length;
    if (!leagues.length) return;
    if (!leagues.includes(active)) active = leagues[0];

    const tabs = $('aeSeasonTabs');
    tabs.replaceChildren(...leagues.map(c => {
      const b = el('button', LEAGUES[c] || c); b.type = 'button'; b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c === active));
      b.addEventListener('click', () => { active = c; render(); });
      return b;
    }));
    tabs.hidden = leagues.length < 2;

    const target = $('aeSeasonList');
    const shown = list.filter(q => q.competition === active)
      .sort((a, b) => (isOpen(b) ? 1 : 0) - (isOpen(a) ? 1 : 0) || (a.period === 'season' ? -1 : 1) - (b.period === 'season' ? -1 : 1) || new Date(a.closes_at) - new Date(b.closes_at));
    target.replaceChildren(...shown.map(renderQuestion));
  }

  async function submit(q, o) {
    if (busy) return;
    const api = client();
    if (!api) return status('La conexión no está disponible.');
    if (!user || user.is_anonymous) { if (typeof openUserAuthModal === 'function') openUserAuthModal(); else status('Inicia sesión para participar.'); return; }
    if (!confirm('Tu predicción: ' + o.label + ' (+' + pointsOf(q, o) + ' pts si aciertas).\nNo podrás cambiarla después.')) return;
    busy = true; render(); status('Guardando tu predicción…');
    try {
      const r = await api.rpc('ae_submit_take', { p_question_id: q.id, p_option_id: o.id });
      if (r.error) throw r.error;
      status('¡Predicción guardada! Se resolverá cuando termine la competición.');
      busy = false;
      await load(true);
    } catch (e) { status(e.message || 'No se pudo guardar la predicción.'); }
    finally { busy = false; render(); }
  }

  async function adminAction(name, args, success) {
    busy = true; render();
    try { const r = await client().rpc(name, args); if (r.error) throw r.error; status(success); busy = false; await load(true); }
    catch (e) { status(e.message || 'No se pudo guardar.'); }
    finally { busy = false; render(); }
  }

  async function load(force) {
    const api = client();
    if (!api || !$('aeSeasonPredictions')) return;
    if (loaded && !force) { render(); return; }
    const seq = ++request;
    try {
      const auth = await api.auth.getUser();
      user = auth?.data?.user || null;
      const q = await api.from('ae_take_questions').select('id,competition,period,prompt,closes_at,points,status,correct_option_id,settled_at')
        .neq('status', 'void').order('closes_at', { ascending: true }).limit(200);
      if (q.error) throw q.error;
      const ids = (q.data || []).map(x => x.id);
      const [opts, preds] = await Promise.all([
        ids.length ? api.from('ae_take_options').select('id,question_id,label,points').in('question_id', ids) : { data: [], error: null },
        user ? api.from('ae_take_predictions').select('question_id,option_id,awarded_points').eq('user_id', user.id) : { data: [], error: null }
      ]);
      if (opts.error) throw opts.error;
      if (preds.error) throw preds.error;
      if (seq !== request) return;
      questions = q.data || []; options = opts.data || []; mine = preds.data || []; loaded = true;
      render();
    } catch (e) {
      if (seq === request) { status('No pudimos cargar las predicciones. ' + (e.message || '')); }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const picks = $('footballTakes');
    if (picks && 'MutationObserver' in window) {
      new MutationObserver(() => { if (!picks.hidden) load(); }).observe(picks, { attributes: true, attributeFilter: ['hidden'] });
    }
    try { client()?.auth?.onAuthStateChange?.(() => setTimeout(() => { if (picks && !picks.hidden) load(true); else loaded = false; }, 200)); } catch {}
    if (!picks || !picks.hidden) load();
  });
  window.aeSeasonPredictions = { refresh: () => load(true), rerender: () => { if (loaded) render(); } };
})();
