/* CAM SPORTS · Inicio: lectura y comunidad, 9 nov 2026.
   Una noticia principal y dos secundarias; la próxima cita de cada quiniela;
   un carrusel de Takes compartido por Recientes, Populares e Impopulares.
   Atajos opcionales en un desplegable. Se reutilizan los listados originales,
   sus conversaciones y sus votos; vuelven a su sitio al salir de Inicio.
   Los calendarios y sus contadores siguen completos. Se conservan la caché de
   cinco minutos y las consultas públicas existentes, sin temporizadores.
   13 nov 2026: con un evento especial en marcha (la Liguilla), su tarjeta abre
   el carrusel de «Quinielas» (escudos, «?» y un botón directo); después, la
   próxima cita de cada liga. Las tarjetas de partido llevan un círculo de
   elección en vez de «2 pts». */
(() => {
  'use strict';

  const main = document.getElementById('mainContent');
  if (!main || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const REFRESH_MS = 5 * 60 * 1000;
  const MAX_GAMES = 80;
  const LEAGUES = { champions: 'Champions', laliga: 'LaLiga', premier: 'Premier', ligamx: 'Liga MX' };
  // Evento especial (13 nov 2026): mientras hay uno en marcha (hoy, la Liguilla de la
  // Liga MX) la sección «Quinielas» se vuelve ese evento y lleva directo a participar.
  // El campeón se queda 4 días en Inicio; después vuelve la sección de siempre.
  const EVENT_AFTER_MS = 4 * 864e5;
  const seasonGuess = () => { const d = new Date(); return d.getUTCFullYear() - (d.getUTCMonth() < 6 ? 1 : 0); };

  const state = {
    loadedAt: 0, loading: false,
    nfl: [], football: [], teams: new Map(), gamesOk: false,
    takes: [], takesOk: false, takesError: false, takeReplyCounts: null, takeViewerId: null,
    ev: null, evLoadedAt: 0, evLoading: false, evDirty: false
  };

  /* ---------- utilidades ---------- */
  function el(tag, text, className, attrs) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
    return node;
  }
  const client = () => (typeof db !== 'undefined' && db) ? db : null;
  const isHome = () => document.body.classList.contains('ae-is-home');
  const searching = () => typeof currentSearchQuery === 'string' && currentSearchQuery.trim() !== '';
  // 8 nov 2026: también en escritorio (cam-escritorio.css le da rejillas y flechas).
  const active = () => isHome() && !searching();
  const now = () => Date.now();
  const isOpen = g => g && g.status === 'scheduled' && g.picks_open && g.odds_locked_at != null && new Date(g.kickoff).getTime() > now();

  function dayLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const that = new Date(d); that.setHours(0, 0, 0, 0);
    const days = Math.round((that - today) / 864e5);
    const hm = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (days === 0) return 'Hoy · ' + hm;
    if (days === 1) return 'Mañana · ' + hm;
    if (days > 1 && days < 7) return d.toLocaleDateString('es', { weekday: 'short' }).replace('.', '') + ' · ' + hm;
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '') + ' · ' + hm;
  }
  function shortDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }).replace('.', '');
  }
  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 3).join('').toUpperCase();
  }
  function crest(logo, label, alt) {
    const box = el('span', null, 'cam-hj-crest');
    box.append(el('span', label || '?', 'cam-hj-crest-text', { 'aria-hidden': 'true' }));
    if (/^https:\/\//i.test(String(logo || ''))) {
      const img = el('img', null, null, { alt: alt || '', width: '28', height: '28', decoding: 'async', loading: 'lazy' });
      img.addEventListener('load', () => box.classList.add('is-loaded'));
      img.addEventListener('error', () => img.remove());
      img.src = logo;
      box.append(img);
    }
    return box;
  }
  // Iconos de la barra de navegación (los mismos dibujos de NFL, Fútbol y Picks).
  function navIcon(category) {
    const svg = document.querySelector('button.category-btn[data-category="' + category + '"] svg');
    const box = el('span', null, 'cam-hj-icon', { 'aria-hidden': 'true' });
    if (svg) {
      const copy = svg.cloneNode(true);
      copy.removeAttribute('class');
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('focusable', 'false');
      box.append(copy);
    }
    return box;
  }
  const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 20h4.2L19.4 8.8a2.3 2.3 0 0 0 0-3.2l-1-1a2.3 2.3 0 0 0-3.2 0L4 15.8Z" fill="currentColor" fill-opacity=".16"/><path d="m13.6 6.2 4.2 4.2"/><path d="M13 20h7"/></svg>';
  function penIcon() {
    const box = el('span', null, 'cam-hj-icon', { 'aria-hidden': 'true' });
    box.innerHTML = PEN;
    return box;
  }

  /* ---------- acciones ---------- */
  function goQuiniela(sport) {
    if (typeof window.camGoQuiniela === 'function') return window.camGoQuiniela(sport);
    if (typeof window.filterByCategory === 'function') window.filterByCategory(sport === 'football' ? 'Fútbol' : 'NFL');
    window.camSectionTabs?.select?.('quiniela');
  }
  function goPicks(tab) {
    if (typeof window.filterByCategory === 'function') window.filterByCategory('Picks');
    if (tab) window.camSectionTabs?.select?.(tab);
  }
  function openTakeComposer() {
    if (typeof window.aeOpenTakeComposer === 'function') window.aeOpenTakeComposer();
  }
  function openPickComposer() {
    if (typeof window.aeOpenPickComposer === 'function') return void window.aeOpenPickComposer();
    goPicks('picks');
  }

  /* ---------- estructura ---------- */
  const root = el('section', null, 'cam-hj', { id: 'camHomeJornada', 'aria-labelledby': 'camHomeJornadaTitle' });
  root.hidden = true;
  const head = el('header', null, 'cam-hj-top');
  const title = el('h2', 'Tu jornada', 'cam-hj-title', { id: 'camHomeJornadaTitle' });
  const today = el('p', '', 'cam-hj-date');
  head.append(title, today);

  const shortcuts = el('nav', null, 'cam-hj-shortcuts', { 'aria-label': 'Demuestra tu conocimiento' });
  function shortcut(label, icon, action, extra) {
    const b = el('button', null, 'cam-hj-shortcut', { type: 'button' });
    b.append(icon);
    const text = el('span', null, 'cam-hj-shortcut-label');
    label.split('\n').forEach((line, i) => { if (i) text.append(el('br')); text.append(document.createTextNode(line)); });
    b.append(text);
    if (extra) b.dataset.shortcut = extra;
    b.setAttribute('aria-label', label.replace('\n', ' '));
    b.addEventListener('click', action);
    return b;
  }
  const nflShortcut = shortcut('Quiniela\nNFL', navIcon('NFL'), () => goQuiniela('nfl'), 'nfl');
  const footballShortcut = shortcut('Quiniela\nFútbol', navIcon('Fútbol'), () => goQuiniela('football'), 'football');
  shortcuts.append(
    nflShortcut, footballShortcut,
    shortcut('Publicar\nTake', penIcon(), openTakeComposer, 'take'),
    shortcut('Publicar\nPick', navIcon('Picks'), openPickComposer, 'pick')
  );
  function badge(button, count, label) {
    button.querySelector('.cam-hj-badge')?.remove();
    const base = button.getAttribute('aria-label').replace(/ · .*$/, '');
    if (!count) { button.setAttribute('aria-label', base); return; }
    const text = count >= MAX_GAMES ? MAX_GAMES + '+' : String(count);
    button.append(el('span', text, 'cam-hj-badge', { 'aria-hidden': 'true' }));
    button.setAttribute('aria-label', base + ' · ' + text + ' ' + label);
  }

  // Una fila deslizable: encabezado (título + «Ver todo ›») y tarjetas.
  function row(key, label, more) {
    const section = el('section', null, 'cam-hj-section', { 'data-row': key, 'aria-labelledby': 'camHj-' + key });
    const top = el('div', null, 'cam-hj-head');
    top.append(el('h3', label, 'cam-hj-heading', { id: 'camHj-' + key }));
    if (more) {
      const b = el(more.href ? 'a' : 'button', more.text, 'cam-hj-more', { 'aria-label': more.aria || more.text });
      if (more.href) b.href = more.href;
      else { b.type = 'button'; b.addEventListener('click', more.action); }
      top.append(b);
    }
    const list = el('div', null, 'cam-hj-row', { role: 'list', 'aria-label': label });
    section.append(top, list);
    section.hidden = true;
    return { section, list };
  }
  const rows = {
    jornada: row('jornada', 'Quinielas', { text: 'Ver partidos ›', action: () => goQuiniela(rows.jornada.section.dataset.nextSport || 'nfl') }),
    news: row('news', 'Últimas noticias', { text: 'Ver todas ›', aria: 'Ver todas las noticias', href: '?s=opiniones' }),
    takes: row('takes', 'Takes de la comunidad', { text: 'Publicar ›', aria: 'Publicar un Take', action: openTakeComposer })
  };
  // La lectura abre Inicio. Los partidos y la comunidad se descubren después.
  const shortcutDisclosure = el('details', null, 'cam-hj-shortcuts-disclosure');
  shortcutDisclosure.append(el('summary', 'Demuestra tu conocimiento', 'cam-desk-rail-toggle'), shortcuts);
  root.append(head, shortcutDisclosure, rows.news.section, rows.jornada.section, rows.takes.section);

  // Una sola comunidad: reutiliza los listados reales y sus votos/respuestas.
  // Cada filtro conserva su lista y usa el mismo carrusel horizontal nativo.
  let takeView = 'recent';
  const takeViews = new Map();
  const takeFilters = el('div', null, 'cam-take-filters', { role: 'group', 'aria-label': 'Orden de los Takes' });
  rows.takes.list.id = 'camHomeTakesRecent';
  function takeTrack(list, label) {
    list.classList.add('cam-home-takes-track');
    list.setAttribute('tabindex', '0');
    list.setAttribute('aria-label', label);
    list.setAttribute('aria-roledescription', 'carrusel');
  }
  takeTrack(rows.takes.list, 'Takes recientes');
  const takeButtons = new Map();
  for (const [key, label, id] of [
    ['recent', 'Recientes', 'camHomeTakesRecent'],
    ['positive', 'Populares', 'aeHomeTakesPopular'],
    ['negative', 'Impopulares', 'aeHomeTakesUnpopular']
  ]) {
    const button = el('button', label, 'cam-take-filter', { type: 'button', 'aria-controls': id, 'aria-pressed': String(key === takeView) });
    button.addEventListener('click', () => selectTakeView(key));
    takeButtons.set(key, button);
    takeFilters.append(button);
  }
  rows.takes.section.querySelector('.cam-hj-head').after(takeFilters);
  function selectTakeView(key) {
    takeView = key;
    rows.takes.section.dataset.takeView = key;
    rows.takes.list.hidden = key !== 'recent';
    for (const [view, button] of takeButtons) button.setAttribute('aria-pressed', String(view === key));
    for (const [view, entry] of takeViews) entry.node.hidden = view !== key;
  }
  function mountTakeViews() {
    for (const [key, id] of [['positive', 'aeHomeTakesPopular'], ['negative', 'aeHomeTakesUnpopular']]) {
      const node = document.getElementById(id);
      if (!node || takeViews.has(key)) continue;
      const mark = document.createComment(' cam-home: ' + id + ' ');
      node.before(mark);
      takeViews.set(key, { node, mark });
      rows.takes.section.append(node);
      const list = node.querySelector('ol');
      takeTrack(list, key === 'positive' ? 'Takes populares' : 'Takes impopulares');
    }
    selectTakeView(takeView);
  }
  function returnTakeViews() {
    for (const { node, mark } of takeViews.values()) {
      node.hidden = false;
      const list = node.querySelector('ol');
      list.classList.remove('cam-home-takes-track');
      for (const attribute of ['tabindex', 'aria-label', 'aria-roledescription']) list.removeAttribute(attribute);
      if (mark.parentNode) mark.replaceWith(node);
    }
    takeViews.clear();
  }

  function place() {
    if (root.closest('#camDeskLayout')) return;
    const tabs = document.getElementById('camSectionTabs');
    if (tabs && tabs.parentNode === main) { if (tabs.nextSibling !== root) tabs.after(root); }
    else if (main.firstChild !== root) main.prepend(root);
  }
  function item(card) {
    const wrap = el('div', null, 'cam-hj-item' + (card.classList.contains('cam-hj-sep') ? ' is-sep' : ''), { role: 'listitem' });
    wrap.append(card);
    return wrap;
  }
  function fill(r, cards) {
    r.list.replaceChildren(...cards.map(item));
    r.section.hidden = cards.length === 0;
    r.list.scrollLeft = 0;
  }

  /* ---------- Cierran pronto ---------- */
  function nflTeam(id) {
    const list = typeof NFL_TEAMS !== 'undefined' && Array.isArray(NFL_TEAMS) ? NFL_TEAMS : [];
    const team = list.find(t => t.id === id);
    const name = team?.name || id;
    return { short: String(name).split(/\s+/).pop(), name, logo: team?.logo, abbr: id };
  }
  function footballTeam(id) {
    const team = state.teams.get(String(id));
    const name = team?.name || 'Por confirmar';
    return { short: team?.short_name || name, name, logo: team?.logo, abbr: team?.abbreviation || initials(name) };
  }
  function pickLine(team, points, prefix) {
    const line = el('span', null, 'cam-hj-pick');
    if (team) line.append(crest(team.logo, team.abbr, ''));
    else line.append(el('span', '=', 'cam-hj-crest cam-hj-crest--draw', { 'aria-hidden': 'true' }));
    const name = el('span', null, 'cam-hj-pick-name');
    if (prefix) name.append(el('span', prefix, 'cam-hj-at', { 'aria-hidden': 'true' }));
    name.append(document.createTextNode(team ? team.short : 'Empate'));
    line.append(name);
    // 13 nov 2026: sin «2 pts» en Inicio (no invitaban a jugar); un círculo de elección,
    // solo decorativo. Los puntos siguen en la quiniela.
    line.append(el('span', null, 'cam-hj-choice', { 'aria-hidden': 'true' }));
    return line;
  }
  function gameCard(g, sport) {
    const card = el('button', null, 'cam-hj-card cam-hj-game', { type: 'button', 'data-sport': sport });
    const top = el('span', null, 'cam-hj-kicker');
    const league = sport === 'nfl' ? 'NFL' + (g.week ? ' · Semana ' + g.week : '') : (LEAGUES[g.competition] || 'Fútbol');
    top.append(el('span', league, 'cam-hj-league'), el('span', dayLabel(g.kickoff), 'cam-hj-when'));
    card.append(top);
    const picks = el('span', null, 'cam-hj-picks');
    let aria;
    if (sport === 'nfl') {
      const away = nflTeam(g.away_id), home = nflTeam(g.home_id);
      picks.append(pickLine(away, g.points_away), pickLine(home, g.points_home, '@ '));
      aria = away.name + ' en ' + home.name;
    } else {
      const home = footballTeam(g.home_id), away = footballTeam(g.away_id);
      picks.append(pickLine(home, g.points_home), pickLine(null, g.points_draw), pickLine(away, g.points_away));
      aria = home.name + ' contra ' + away.name;
    }
    card.append(picks, el('span', 'Jugar ›', 'cam-hj-cta'));
    card.setAttribute('aria-label', league + ', ' + aria + ', ' + dayLabel(g.kickoff) + '. Jugar en la quiniela');
    card.addEventListener('click', () => goQuiniela(sport));
    return card;
  }
  /* ---------- Evento especial: la Liguilla ---------- */
  const ROUND_NAME = { qf: 'Cuartos', sf: 'Semifinales', final: 'Final' };
  // Orden del cuadro: 1-8 y 4-5 arriba, 2-7 y 3-6 abajo; la elección de cuartos se guarda
  // en el hueco del mejor sembrado menos uno (1-8 → 0, 2-7 → 1, 3-6 → 2, 4-5 → 3).
  const BRACKET = [[1, 8], [4, 5], [2, 7], [3, 6]];

  function viewerId() {
    try { if (typeof currentUser !== 'undefined' && currentUser?.id) return currentUser.id; } catch {}
    return state.takeViewerId || null;
  }
  const shortName = t => String(t?.short_name || t?.name || 'Por definir');
  const abbrOf = t => String(t?.abbreviation || t?.short_name || t?.name || '?').normalize('NFD').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase();
  // El mismo escudo de reserva que la liguilla: azul y dorado con las siglas.
  function shieldUri(ab) {
    const text = String(ab || '?').slice(0, 3);
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46">'
      + '<path d="M20 2 37 8v14c0 11-7.5 18.5-17 22C10.5 40.5 3 33 3 22V8Z" fill="#0B2233" stroke="#BE9270" stroke-width="2.4" stroke-linejoin="round"/>'
      + '<path d="M8 11.5 20 7.6l12 3.9" fill="none" stroke="#E8BF79" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>'
      + '<text x="20" y="28" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="' + (text.length > 2 ? 10.5 : 13) + '" fill="#E8BF79">' + text.replace(/[<&>]/g, '') + '</text></svg>');
  }
  function evCrest(t) {
    const box = el('span', null, 'cam-hj-ev-crest', { 'aria-hidden': 'true' });
    const img = el('img', null, null, { alt: '', width: '24', height: '24', decoding: 'async' });
    const fallback = () => { if (img.dataset.fallback) return; img.dataset.fallback = '1'; img.src = shieldUri(abbrOf(t)); };
    img.addEventListener('error', fallback);
    if (/^https:\/\//i.test(String(t?.logo || ''))) img.src = t.logo; else fallback();
    box.append(img);
    return box;
  }
  // Lo que la liguilla guarda en este aparato mientras se elige (invitado o sin guardar).
  function localEight(win) {
    for (const who of [...new Set([viewerId() || 'anon', 'anon'])]) {
      try {
        const raw = JSON.parse(localStorage.getItem('cam:liguilla:mis8:' + who + ':' + (win?.id || 0)) || 'null');
        if (Array.isArray(raw) && raw.length) return raw.map(String);
      } catch {}
    }
    return [];
  }

  // 13 nov 2026 (tarde): la Liguilla es una tarjeta pequeña, la primera del carrusel de
  // «Quinielas»: escudos de los clasificados, «?» en los lugares por decidir y un botón.
  // Paso 1 · Tus 8 (cam_liguilla_candidates). Los ya clasificados van fijos.
  function qualifiersView(cand, at) {
    const win = cand.window;
    const teams = Array.isArray(cand.teams) ? cand.teams : [];
    const byId = new Map(teams.map(t => [String(t.team_id), t]));
    const fixed = teams.filter(t => t.status === 'in').sort((a, b) => a.rank - b.rank).slice(0, 8);
    const free = Math.max(0, 8 - fixed.length);
    const server = Array.isArray(cand.mine) ? cand.mine.map(String) : null;
    const saved = !!server && server.length === 8;
    const chosen = [...new Set(saved ? server : localEight(win))]
      .map(id => byId.get(id)).filter(t => t && t.status === 'alive').slice(0, free);
    const ready = free > 0 && chosen.length >= free;
    const closes = Date.parse(win.closes_at);
    const open = !!win.open && closes > at;
    const slots = [...fixed.map(t => ({ t, kind: 'fixed' })), ...chosen.map(t => ({ t, kind: 'mine' }))];
    for (let i = chosen.length; i < free; i++) slots.push({ kind: 'open', live: open });
    const kicker = 'Liga MX';
    if (open) {
      const left = free - chosen.length;
      if (saved) return { kicker, title: 'Tus 8 están listos', slots, cta: 'Ver mi liguilla ›' };
      if (ready) return { kicker, title: 'Tus 8 están listos', slots, cta: 'Guardar mis 8 ›', picker: true };
      if (!free) return { kicker, title: 'Los 8 ya están dentro', slots, cta: 'Ver la Liguilla ›' };
      return { kicker, title: chosen.length ? (left === 1 ? 'Te falta 1' : 'Te faltan ' + left) : '¿Quiénes crees que serán el top 8?',
        slots, cta: fixed.length ? 'Completar mis 8 ›' : 'Elegir mis 8 ›', picker: true };
    }
    // Cerrado y a la espera de que se abra el cuadro (al terminar la última jornada).
    if (!win.opened && Number.isFinite(closes) && at - closes < EVENT_AFTER_MS) {
      return { kicker, title: saved ? 'Tus 8 están guardados' : 'Tu cuadro se abre pronto', slots, cta: 'Ver la Liguilla ›' };
    }
    return null;
  }

  // Pasos 2 y 3 (cam_liguilla_state): el cuadro y, después, ronda a ronda.
  function liguillaView(st, at) {
    const L = st.liguilla;
    const seeds = (Array.isArray(st.seeds) ? st.seeds : []).slice().sort((a, b) => a.seed - b.seed);
    const team = id => seeds.find(s => String(s.team_id) === String(id)) || null;
    const seed = n => seeds.find(s => Number(s.seed) === n) || null;
    const mine = st.mine || null;
    if (L.open && Date.parse(L.closes_at) > at) {
      const semis = new Map((mine?.bracket || []).filter(p => p.stage === 'semis').map(p => [Number(p.slot), String(p.team_id)]));
      const count = (mine?.bracket || []).length;
      return { kicker: 'Liga MX · Cuadro', title: count >= 7 ? 'Tu cuadro está listo' : 'Arma tu cuadro',
        pairs: BRACKET.map(([a, b]) => ({ a: seed(a), b: seed(b), pick: semis.get(a - 1) })).filter(r => r.a && r.b),
        cta: count >= 7 ? 'Ver mi cuadro ›' : count ? 'Seguir con mi cuadro ›' : 'Armar mi cuadro ›' };
    }
    const series = Array.isArray(st.series) ? st.series : [];
    const order = ['qf', 'sf', 'final'];
    const round = order.find(r => series.some(s => s.round === r && s.status !== 'decided'))
      || [...order].reverse().find(r => series.some(s => s.round === r));
    if (!round) return null;
    const list = series.filter(s => s.round === round).sort((a, b) => a.slot - b.slot);
    const fin = round === 'final' ? list.find(s => s.winner_id) : null;
    if (fin) {
      const kicks = (fin.legs || []).map(g => Date.parse(g.kickoff)).filter(Number.isFinite);
      if (!kicks.length || at - Math.max(...kicks) > EVENT_AFTER_MS) return null;
      return { kicker: 'Liga MX · Final', title: 'Campeón: ' + shortName(team(fin.winner_id)), champ: team(fin.winner_id), cta: 'Ver la Liguilla ›' };
    }
    const pickOf = id => (mine?.series || []).find(p => Number(p.series_id) === Number(id))?.team_id || null;
    const done = list.every(s => pickOf(s.id));
    return { kicker: 'Liga MX · ' + ROUND_NAME[round], title: round === 'final' ? 'La Final' : '¿Quién pasa?',
      pairs: list.map(s => ({ a: team(s.high_id), b: team(s.low_id), pick: pickOf(s.id) })).filter(r => r.a && r.b),
      cta: mine && done ? 'Ver la Liguilla ›' : round === 'final' ? 'Elegir campeón ›' : 'Elegir quién pasa ›' };
  }

  function eventView() {
    const ev = state.ev;
    if (!ev) return null;
    try {
      const v = ev.state ? liguillaView(ev.state, now()) : ev.cand ? qualifiersView(ev.cand, now()) : null;
      return v ? { name: 'La Liguilla', ...v } : null;
    } catch (error) {
      console.warn('Inicio: no se pudo pintar la Liguilla.', error);
      return null;
    }
  }
  async function loadEvent(c) {
    const season = seasonGuess();
    let ev = null;
    try {
      const st = await c.rpc('cam_liguilla_state', { p_season: season });
      if (!st.error && st.data?.liguilla && liguillaView(st.data, now())) ev = { state: st.data };
      else {
        const cd = await c.rpc('cam_liguilla_candidates', { p_season: season });
        if (!cd.error && cd.data?.window && !cd.data.window.opened && qualifiersView(cd.data, now())) ev = { cand: cd.data };
      }
    } catch (error) {
      console.warn('Inicio: no se pudo cargar la Liguilla.', error);
      return state.ev;
    }
    state.ev = ev;
    state.evLoadedAt = now();
    return ev;
  }
  async function refreshEvent() {
    const c = client();
    if (!c || state.evLoading) return;
    state.evLoading = true;
    try { await loadEvent(c); } finally { state.evLoading = false; if (on) paintJornada(); }
  }
  // En «Tus 8», la liguilla tiene el selector plegado: al llegar desde aquí se abre solo.
  function openPicker() {
    let tries = 0;
    const step = () => {
      const lg = document.getElementById('camLiguilla');
      const picker = lg && !lg.hidden ? lg.querySelector('details.cam-lg-qualifiers') : null;
      if (!picker) { if (++tries < 40) setTimeout(step, 100); return; }
      if (!picker.open) picker.open = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { window.scrollTo({ top: Math.max(0, picker.getBoundingClientRect().top + window.scrollY - 76), behavior: 'auto' }); } catch {}
      }));
    };
    setTimeout(step, 60);
  }
  function goEvent(picker) {
    state.evDirty = true;   // al volver a Inicio se relee (por si guardó sus 8 o su cuadro)
    if (typeof window.camGoLiguilla === 'function') window.camGoLiguilla();
    else goQuiniela('football');
    if (picker === true) openPicker();
  }

  function evSlot(s) {
    if (s.kind === 'open') {
      if (!s.live) return el('span', '?', 'cam-hj-ev-slot is-open', { 'aria-hidden': 'true' });
      const b = el('button', '?', 'cam-hj-ev-slot is-open', { type: 'button', 'aria-label': 'Elegir un equipo' });
      b.addEventListener('click', event => { event.stopPropagation(); goEvent(true); });
      return b;
    }
    const box = el('span', null, 'cam-hj-ev-slot is-' + s.kind);
    box.append(evCrest(s.t), el('span', shortName(s.t) + (s.kind === 'fixed' ? ', ya dentro' : ', tu elección'), 'cam-hj-sr'));
    return box;
  }
  function evPair(r) {
    const pair = el('span', null, 'cam-hj-ev-pair');
    const side = t => {
      const mine = r.pick && String(r.pick) === String(t.team_id);
      const s = el('span', null, 'cam-hj-ev-side' + (mine ? ' is-mine' : ''));
      s.append(evCrest(t), el('span', shortName(t) + (mine ? ', tu elección' : ''), 'cam-hj-sr'));
      return s;
    };
    pair.append(side(r.a), el('span', 'vs', 'cam-hj-ev-vs', { 'aria-hidden': 'true' }), side(r.b));
    return pair;
  }
  function eventCard(v) {
    const card = el('section', null, 'cam-hj-ev', { 'aria-labelledby': 'camHjEvTitle' });
    card.append(el('span', v.kicker, 'cam-hj-ev-kicker'), el('h4', v.title, 'cam-hj-ev-title', { id: 'camHjEvTitle' }));
    if (v.slots && v.slots.length) {
      const grid = el('div', null, 'cam-hj-ev-grid');
      v.slots.forEach(s => grid.append(evSlot(s)));
      card.append(grid);
    }
    if (v.pairs && v.pairs.length) {
      const grid = el('div', null, 'cam-hj-ev-pairs');
      v.pairs.forEach(r => grid.append(evPair(r)));
      card.append(grid);
    }
    if (v.champ) {
      const champ = el('div', null, 'cam-hj-ev-champ');
      champ.append(evCrest(v.champ), el('span', shortName(v.champ), 'cam-hj-ev-champ-name'));
      card.append(champ);
    }
    const cta = el('button', v.cta, 'cam-hj-ev-cta', { type: 'button' });
    card.append(cta);
    // Toda la tarjeta lleva a la Liguilla, como las de partido (el botón es el control accesible).
    card.addEventListener('click', event => { if (!event.target.closest('button:not(.cam-hj-ev-cta)')) goEvent(!!v.picker); });
    return card;
  }

  // Entre la Liguilla y los partidos: un filete dorado con una línea de texto.
  // En el teléfono va de pie dentro del carrusel; en escritorio cruza la rejilla.
  function separator(text) {
    const sep = el('div', null, 'cam-hj-sep');
    const ornament = () => el('span', null, 'cam-hj-sep-diamond', { 'aria-hidden': 'true' });
    sep.append(el('span', null, 'cam-hj-sep-line', { 'aria-hidden': 'true' }), ornament(),
      el('p', text, 'cam-hj-sep-text'), el('span', '→', 'cam-hj-sep-arrow', { 'aria-hidden': 'true' }),
      ornament(), el('span', null, 'cam-hj-sep-line', { 'aria-hidden': 'true' }));
    return sep;
  }

  function paintJornada() {
    const cards = [];
    const nfl = state.nfl.filter(isOpen).map(g => ({ ...g, sport: 'nfl' }));
    const football = state.football.filter(isOpen).map(g => ({ ...g, sport: 'football' }));
    // Carrusel: la próxima cita de cada liga (NFL, Liga MX, Champions, LaLiga, Premier).
    // Todo el calendario permanece en su quiniela y los atajos siguen contando todos los juegos.
    const leagues = new Set();
    const firsts = football.filter(g => !leagues.has(g.competition) && leagues.add(g.competition));
    const upcoming = [nfl[0], ...firsts].filter(Boolean)
      .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    // Con un evento especial en marcha (la Liguilla), su tarjeta abre el carrusel.
    const view = eventView();
    if (view) cards.push(eventCard(view));
    if (view && upcoming.length) cards.push(separator('Participa en la quiniela de otras ligas'));
    for (const g of upcoming) cards.push(gameCard(g, g.sport));
    if (view) rows.jornada.section.dataset.event = 'liguilla'; else delete rows.jornada.section.dataset.event;
    rows.jornada.section.dataset.nextSport = upcoming[0]?.sport || 'nfl';
    fill(rows.jornada, cards);
    badge(nflShortcut, nfl.length, nfl.length === 1 ? 'partido abierto' : 'partidos abiertos');
    badge(footballShortcut, football.length, football.length === 1 ? 'partido abierto' : 'partidos abiertos');
  }

  /* ---------- Últimas noticias (las que la portada ya cargó) ---------- */
  function newsCard(a) {
    const card = el('article', null, 'cam-hj-card cam-hj-news');
    const read = el('button', null, 'cam-hj-news-open', { type: 'button' });
    const media = el('span', null, 'cam-hj-media');
    if (/^https?:\/\//i.test(String(a.image || ''))) {
      const img = el('img', null, null, { alt: '', decoding: 'async', loading: 'lazy' });
      if (typeof window.setImageFocus === 'function') window.setImageFocus(img, a);
      else img.style.setProperty('--ae-image-focus', (a.image_focus_x ?? 50) + '% ' + (a.image_focus_y ?? 50) + '%');
      img.addEventListener('error', () => { img.remove(); media.classList.add('is-empty'); });
      img.src = a.image;
      media.append(img);
    } else media.classList.add('is-empty');
    if (a.category) media.append(el('span', a.category, 'cam-hj-chip'));
    read.append(media);
    const body = el('span', null, 'cam-hj-news-body');
    body.append(el('span', a.title || '', 'cam-hj-card-title'));
    if (a.summary) body.append(el('span', a.summary, 'cam-hj-news-summary'));
    read.append(body);
    read.setAttribute('aria-label', (a.category ? a.category + ': ' : '') + (a.title || 'Noticia'));
    read.addEventListener('click', () => { if (typeof window.openArticleModal === 'function') window.openArticleModal(a.id); });
    card.append(read);
    const actions = el('div');
    actions.innerHTML = window.renderArticleInteractions(a);
    card.append(actions.firstElementChild);
    return card;
  }
  function paintNews() {
    const list = typeof articles !== 'undefined' && Array.isArray(articles) ? articles : [];
    const shown = list.filter(a => a && a.remote && a.id && a.title).slice(0, 3);
    fill(rows.news, shown.map(newsCard));
  }

  /* ---------- Takes de la comunidad ---------- */
  function takeCard(t) {
    return window.camHomeTakeCard(t,'recent',state.takeReplyCounts,state.takeViewerId);
  }
  function paintTakes() {
    const cards = state.takes.map(takeCard);
    if (!cards.length) cards.push(el('p', state.takesOk ? 'Aún no hay Takes.' : state.takesError ? 'No se pudieron cargar los Takes.' : 'Cargando Takes…', 'cam-hj-empty'));
    fill(rows.takes, cards);
    rows.takes.list.dataset.camContentState = state.takesOk ? (state.takes.length ? 'ready' : 'empty') : state.takesError ? 'error' : 'loading';
  }

  /* ---------- datos ---------- */
  async function load(force) {
    const c = client();
    if (!c || state.loading) return;
    if (!force && state.loadedAt && now() - state.loadedAt < REFRESH_MS) return;
    state.loading = true;
    const finishEntrance = window.camPageLoader?.begin?.();
    try {
      const since = new Date().toISOString();
      const open = (table, cols) => c.from(table).select(cols)
        .eq('status', 'scheduled').eq('picks_open', true).not('odds_locked_at', 'is', null)
        .gt('kickoff', since).order('kickoff', { ascending: true }).limit(MAX_GAMES);
      const [nfl, football, takes] = await Promise.all([
        open('cam_nfl_games', 'id,week,home_id,away_id,kickoff,status,picks_open,odds_locked_at,points_home,points_away'),
        open('cam_football_games', 'id,competition,matchday,home_id,away_id,kickoff,status,picks_open,odds_locked_at,points_home,points_draw,points_away'),
        c.rpc('ae_public_take_feed', { p_sport: 'all' }),
        // Evento especial: una o dos llamadas públicas (el estado y, si aún no hay cuadro, «Tus 8»).
        loadEvent(c)
      ]);
      state.gamesOk = !nfl.error && !football.error;
      if (!nfl.error) state.nfl = (nfl.data || []).filter(isOpen).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
      if (!football.error) state.football = (football.data || []).filter(isOpen).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
      state.takesOk = !takes.error;
      state.takesError = Boolean(takes.error);
      if (!takes.error) state.takes = Array.isArray(takes.data) ? takes.data : [];
      if (!takes.error) {
        const takeIds=state.takes.map(t=>String(t.id));
        const [counts,viewer]=await Promise.all([
          takeIds.length ? c.rpc('ae_public_take_reply_counts',{p_take_ids:takeIds}) : Promise.resolve({data:[]}),
          c.auth.getUser().catch(()=>({data:{user:null}}))
        ]);
        state.takeReplyCounts=counts.error ? null : new Map((counts.data||[]).map(r=>[String(r.take_id),Math.max(0,Number(r.reply_count)||0)]));
        state.takeViewerId=viewer.data?.user?.id||null;
      }
      // Escudos solo de los partidos que se van a ver.
      const leagueFirsts = state.football.filter((g, i, all) => all.findIndex(x => x.competition === g.competition) === i);
      const ids = [...new Set(state.football.slice(0, 12).concat(leagueFirsts).flatMap(g => [g.home_id, g.away_id]).map(String))]
        .filter(id => !state.teams.has(id));
      if (ids.length) {
        const teams = await c.from('cam_football_teams').select('id,name,short_name,abbreviation,logo').in('id', ids);
        if (!teams.error) for (const t of teams.data || []) state.teams.set(String(t.id), t);
      }
      state.loadedAt = now();
    } catch (error) {
      if (!state.takesOk) state.takesError = true;
      console.warn('Tu jornada: no se pudieron cargar los partidos o los Takes.', error);
    } finally {
      state.loading = false;
      if (active()) paint();
      finishEntrance?.();
    }
  }

  /* ---------- pintar y mostrar ---------- */
  function paint() {
    today.textContent = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    paintJornada();
    paintNews();
    paintTakes();
  }
  let on = false;
  function sync() {
    const next = active();
    if (next) place();
    if (next !== on) {
      on = next;
      root.hidden = !on;
      document.body.classList.toggle('cam-home-jornada', on);
      if (on) {
        mountTakeViews();
        paint();
        void load(false);
        // Vuelve de la Liguilla: puede haber guardado sus 8 o su cuadro.
        if (state.evDirty) { state.evDirty = false; void refreshEvent(); }
      } else returnTakeViews();
    }
  }
  const repaint = () => { if (on) paint(); };

  place();
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', sync);
  else if (typeof mobile.addListener === 'function') mobile.addListener(sync);
  for (const id of ['searchInput', 'mobileSearchInput']) {
    document.getElementById(id)?.addEventListener('input', () => queueMicrotask(sync));
  }
  // La página pinta las noticias cuando llegan sus datos.
  const original = window.renderArticlesFeed;
  if (typeof original === 'function') {
    window.renderArticlesFeed = function camJornadaArticles() {
      const result = original.apply(this, arguments);
      queueMicrotask(() => { sync(); if (on) paintNews(); });
      return result;
    };
  }
  document.addEventListener('ae:takes-updated', () => { state.loadedAt = 0; if (on) void load(true); });
  // Al entrar o salir de la cuenta cambia lo propio de la Liguilla (tus 8, tu cuadro).
  try {
    client()?.auth?.onAuthStateChange?.(() => {
      if (state.evLoadedAt) setTimeout(() => { if (on) void refreshEvent(); else state.evDirty = true; }, 80);
    });
  } catch {}
  // Al volver a la página (otra app, otra pestaña) se refresca si pasaron 5 min.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && on) void load(false); });
  window.addEventListener('pageshow', sync);
  sync();

  window.camHomeJornada = Object.freeze({ refresh: () => load(true), repaint, _state: () => state });
})();
