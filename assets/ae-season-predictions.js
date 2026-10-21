/* CAM SPORTS · ¿Quién será campeón? dentro de Fútbol y NFL.
 * Usa las mismas preguntas cerradas de ae_take_questions y suma sus premios
 * a la clasificación de Picks cuando el resultado se confirma.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const LEAGUES = { laliga: 'LaLiga', premier: 'Premier League', ligamx: 'Liga MX', champions: 'Champions', nfl: 'NFL', colegial: 'Colegial' };
  const ORDER = ['laliga', 'premier', 'ligamx', 'champions', 'nfl', 'colegial'];
  const FOOTBALL = new Set(['laliga', 'premier', 'ligamx', 'champions']);
  const FOOTBALL_LOGO_IDS = {
    'fc barcelona': 83, 'barcelona': 83, 'real madrid': 86, 'atletico de madrid': 1068,
    'atletico madrid': 1068, 'sevilla': 243, 'real sociedad': 89, 'athletic club': 93,
    'celta': 85, 'celta vigo': 85, 'elche': 3751, 'espanyol': 88, 'getafe': 2922,
    'levante': 1538, 'rc deportivo': 90, 'deportivo': 90, 'real betis': 244,
    'valencia': 94, 'villarreal': 102, 'arsenal': 359, 'manchester city': 382,
    'chelsea': 363, 'liverpool': 364, 'manchester united': 360, 'aston villa': 362,
    'bournemouth': 349, 'brentford': 337, 'crystal palace': 384, 'everton': 368,
    'fulham': 370, 'leeds united': 357, 'newcastle united': 361,
    'nottingham forest': 393, 'tottenham': 367, 'tottenham hotspur': 367,
    'toluca': 223, 'america': 227, 'chivas': 219, 'guadalajara': 219,
    'cruz azul': 218, 'tigres': 232, 'tigres uanl': 232, 'monterrey': 220,
    'tijuana': 10125, 'atlas': 216, 'atlante': 226, 'leon': 228, 'necaxa': 229,
    'pachuca': 234, 'puebla': 231, 'pumas': 233, 'pumas unam': 233,
    'santos laguna': 225, 'santos': 225, 'paris saint-germain': 160,
    'bayern munchen': 132, 'bayern munich': 132, 'inter de milan': 110,
    'internazionale': 110, 'napoli': 114, 'borussia dortmund': 124, 'sporting cp': 2250
  };
  const RECENT_DAYS = 60;
  let questions = [], options = [], mine = [], nflLogos = new Map(), user = null;
  let active = '', section = '', busy = false, request = 0, loaded = false;

  const client = () => { try { return typeof db !== 'undefined' ? db : window.db; } catch { return window.db; } };
  const isAdmin = () => { try { return typeof currentAdmin !== 'undefined' && Boolean(currentAdmin); } catch { return false; } };
  const isOpen = q => q.status === 'open' && new Date(q.closes_at).getTime() > Date.now();
  const closeText = s => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s));
  const optionsOf = q => options.filter(o => o.question_id === q.id);
  const pointsOf = (q, o) => { const n = Number(o.points); return Number.isFinite(n) && n > 0 ? n : Number(q.points); };
  const status = text => { const n = $('aeSeasonStatus'); if (n) n.textContent = text || ''; };
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const sectionName = value => value === 'NFL' || value === 'nfl' ? 'nfl' : value === 'Fútbol' || value === 'football' ? 'football' : '';
  const allowedCompetition = q => section === 'nfl' ? q.competition === 'nfl' : section === 'football' && FOOTBALL.has(q.competition);
  const initials = label => /^otro\b/i.test(label) ? 'OTRO' : String(label).split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const logoOf = (q, o) => {
    if (q.competition === 'nfl') return nflLogos.get(normalize(o.label)) || '';
    const id = FOOTBALL_LOGO_IDS[normalize(o.label)];
    return id ? 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png' : '';
  };
  const sortOptions = (q, list) => list.slice().sort((a, b) =>
    (/^otro/i.test(a.label) ? 1 : 0) - (/^otro/i.test(b.label) ? 1 : 0) || pointsOf(q, a) - pointsOf(q, b) || a.label.localeCompare(b.label, 'es'));

  function visibleQuestions() {
    const since = Date.now() - RECENT_DAYS * 864e5;
    return questions.filter(q => {
      if (!allowedCompetition(q) || q.status === 'void') return false;
      if (isOpen(q)) return true;
      const played = mine.some(m => m.question_id === q.id);
      if (q.status === 'settled') return played && new Date(q.settled_at || q.closes_at).getTime() > since;
      return isAdmin();
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
      b.type = 'button'; b.title = o.label; b.dataset.team = o.label;
      const crest = el('span', null, 'ae-season-crest');
      crest.append(el('span', initials(o.label), 'ae-season-crest-fallback'));
      const logo = logoOf(q, o);
      if (logo) {
        const img = el('img'); img.src = logo; img.alt = ''; img.width = 64; img.height = 64;
        img.loading = 'lazy'; img.decoding = 'async';
        img.addEventListener('load', () => crest.classList.add('is-loaded'));
        img.addEventListener('error', () => img.remove());
        crest.append(img);
      }
      b.append(crest, el('span', o.label, 'sr-only'), el('strong', '+' + value, 'ae-season-option-points'));
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
        ? (existing.awarded_points > 0 ? '¡Acertaste! +' + existing.awarded_points + ' pts en tu clasificación de Picks' : 'Esta vez no fue. Tu elección: ' + (picked?.label || '—'))
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
        if (!select.value || busy || !confirm('¿Confirmar el resultado oficial y repartir los puntos?')) return;
        await adminAction('ae_settle_take', { p_question_id: q.id, p_option_id: select.value }, 'Resultado confirmado. Los puntos ya cuentan en Picks.');
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
    root.dataset.sport = section;
    const overline = $('aeSeasonOverline');
    if (overline) overline.textContent = section === 'nfl' ? 'NFL · PICKS CAM SPORTS' : 'FÚTBOL · PICKS CAM SPORTS';
    const list = visibleQuestions();
    const leagues = ORDER.filter(c => list.some(q => q.competition === c));
    root.hidden = !section || !leagues.length;
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
      status('¡Predicción guardada! Los puntos se sumarán a Picks si aciertas.');
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
      const [opts, preds, nfl] = await Promise.all([
        ids.length ? api.from('ae_take_options').select('id,question_id,label,points').in('question_id', ids) : { data: [], error: null },
        user ? api.from('ae_take_predictions').select('question_id,option_id,awarded_points').eq('user_id', user.id) : { data: [], error: null },
        api.from('nfl_teams').select('name,logo')
      ]);
      if (opts.error) throw opts.error;
      if (preds.error) throw preds.error;
      if (seq !== request) return;
      questions = q.data || []; options = opts.data || []; mine = preds.data || [];
      nflLogos = new Map((nfl.error ? [] : nfl.data || []).map(team => [normalize(team.name), team.logo]));
      loaded = true;
      render();
    } catch (e) {
      if (seq === request) status('No pudimos cargar las predicciones. ' + (e.message || ''));
    }
  }

  function setSection(value) {
    const next = sectionName(value);
    const changed = next !== section;
    section = next;
    if (!section) { active = ''; render(); return; }
    if (changed) active = '';
    if (loaded) render(); else load();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sportRoot = $('freeTakes');
    if (sportRoot && 'MutationObserver' in window) {
      new MutationObserver(() => setSection(sportRoot.dataset.sport || (sportRoot.hidden ? '' : (typeof currentCategory === 'undefined' ? '' : currentCategory))))
        .observe(sportRoot, { attributes: true, attributeFilter: ['hidden', 'data-sport'] });
    }
    try { client()?.auth?.onAuthStateChange?.(() => setTimeout(() => { if (section) load(true); else loaded = false; }, 200)); } catch {}
    setSection(sportRoot?.dataset.sport || (typeof currentCategory === 'undefined' ? '' : currentCategory));
  });
  window.aeSeasonPredictions = { refresh: () => load(true), rerender: () => { if (loaded) render(); }, setSection };
})();
