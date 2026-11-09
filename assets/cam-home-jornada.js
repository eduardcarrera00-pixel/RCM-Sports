/* CAM SPORTS · Inicio en el teléfono: «Tu jornada» (3 nov 2026).
   En el teléfono, la portada pasa de ~6 pantallas a unas 2:
     1. Atajos: Quiniela NFL · Quiniela Fútbol · Publicar Take · Sube tu Pick
        (las quinielas con el número de partidos abiertos).
     2. Filas deslizables, cada una solo si tiene algo que enseñar:
        Cierran pronto (Pick del editor vigente y partidos abiertos de las dos
        quinielas), Últimas noticias, Takes de la comunidad; al final, el módulo compartido de Picks.
   Cada tarjeta abre lo de siempre (la quiniela, la noticia, la conversación
   del Take, el Top 10). En escritorio no cambia nada: los bloques de la
   portada de siempre solo se ocultan en el teléfono (clase cam-home-jornada
   en <body>, reglas en cam-home-jornada.css).

   Cuota: noticias y Picks salen de lo que la página
   ya cargó. Solo se piden los partidos abiertos (dos consultas pequeñas + los
   escudos de fútbol) y los últimos Takes, una vez al abrir Inicio en el
   teléfono y de nuevo como mucho cada 5 minutos. Sin temporizadores. */
(() => {
  'use strict';

  const main = document.getElementById('mainContent');
  if (!main || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const REFRESH_MS = 5 * 60 * 1000;
  const MAX_GAMES = 80;
  const LEAGUES = { champions: 'Champions', laliga: 'LaLiga', premier: 'Premier', ligamx: 'Liga MX' };

  const state = {
    loadedAt: 0, loading: false,
    nfl: [], football: [], teams: new Map(), gamesOk: false,
    takes: [], takesOk: false
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
  const active = () => mobile.matches && isHome() && !searching();
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

  const shortcuts = el('nav', null, 'cam-hj-shortcuts', { 'aria-label': 'Atajos' });
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
    shortcut('Sube tu\nPick', navIcon('Picks'), openPickComposer, 'pick')
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
      const b = el('button', more.text, 'cam-hj-more', { type: 'button', 'aria-label': more.aria || more.text });
      if (more.newsCategory) b.dataset.aeNewsCategory = more.newsCategory; // abre el archivo de noticias
      else b.addEventListener('click', more.action);
      top.append(b);
    }
    const list = el('div', null, 'cam-hj-row', { role: 'list', 'aria-label': label });
    section.append(top, list);
    section.hidden = true;
    return { section, list };
  }
  const rows = {
    jornada: row('jornada', 'Cierran pronto'),
    news: row('news', 'Últimas noticias', { text: 'Ver todas ›', aria: 'Ver todas las noticias', newsCategory: 'Todas' }),
    takes: row('takes', 'Takes de la comunidad', { text: 'Publicar ›', aria: 'Publicar un Take', action: openTakeComposer })
  };
  root.append(head, shortcuts, ...Object.values(rows).map(r => r.section));

  function place() {
    const tabs = document.getElementById('camSectionTabs');
    if (tabs && tabs.parentNode === main) { if (tabs.nextSibling !== root) tabs.after(root); }
    else if (main.firstChild !== root) main.prepend(root);
  }
  function item(card) {
    const wrap = el('div', null, 'cam-hj-item', { role: 'listitem' });
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
    const pts = Number(points);
    if (Number.isFinite(pts) && pts > 0) line.append(el('span', pts + ' pts', 'cam-hj-pts'));
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
  function moreCard(label, sub, action, className) {
    const card = el('button', null, 'cam-hj-card cam-hj-more-card' + (className ? ' ' + className : ''), { type: 'button' });
    card.append(el('span', label, 'cam-hj-card-title'));
    if (sub) card.append(el('span', sub, 'cam-hj-card-sub'));
    card.append(el('span', '›', 'cam-hj-more-arrow', { 'aria-hidden': 'true' }));
    card.addEventListener('click', action);
    return card;
  }
  // Las dos quinielas se intercalan (la más próxima primero) para que una
  // jornada llena de una competición no esconda la otra al final de la fila.
  function interleave(a, b, limit) {
    const out = [];
    let i = 0, j = 0;
    let takeA = !b.length || (a.length && new Date(a[0].kickoff) <= new Date(b[0].kickoff));
    while (out.length < limit && (i < a.length || j < b.length)) {
      if ((takeA && i < a.length) || j >= b.length) out.push(a[i++]);
      else out.push(b[j++]);
      takeA = !takeA;
    }
    return out;
  }
  function paintJornada() {
    const cards = [];
    const nfl = state.nfl.filter(isOpen).map(g => ({ ...g, sport: 'nfl' }));
    const football = state.football.filter(isOpen).map(g => ({ ...g, sport: 'football' }));
    for (const g of interleave(nfl, football, 10)) cards.push(gameCard(g, g.sport));
    if (nfl.length) cards.push(moreCard('Quiniela NFL', nfl.length + (nfl.length === 1 ? ' partido abierto' : ' partidos abiertos'), () => goQuiniela('nfl')));
    if (football.length) cards.push(moreCard('Quiniela de Fútbol', football.length + (football.length === 1 ? ' partido abierto' : ' partidos abiertos'), () => goQuiniela('football')));
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
    const shown = list.filter(a => a && a.remote && a.id && a.title).slice(0, 8);
    fill(rows.news, shown.map(newsCard));
  }

  /* ---------- Takes de la comunidad ---------- */
  function takeCard(t) {
    const card = el('button', null, 'cam-hj-card cam-hj-take', { type: 'button' });
    const top = el('span', null, 'cam-hj-kicker');
    const league = String(t.competition || '').trim() || (t.sport === 'nfl' ? 'NFL' : 'Fútbol');
    top.append(el('span', league, 'cam-hj-league'), el('span', shortDate(t.created_at), 'cam-hj-when'));
    card.append(top, el('span', t.title || 'Take', 'cam-hj-card-title'));
    if (t.body) card.append(el('span', String(t.body).replace(/\s+/g, ' ').trim(), 'cam-hj-excerpt'));
    const foot = el('span', null, 'cam-hj-take-foot');
    foot.append(el('span', '@' + (t.author || 'aficionado'), 'cam-hj-author'));
    const votes = el('span', null, 'cam-hj-votes');
    votes.append(el('span', '▲ ' + (Number(t.upvotes) || 0), 'is-up'), el('span', '▼ ' + (Number(t.downvotes) || 0), 'is-down'));
    foot.append(votes);
    card.append(foot);
    card.setAttribute('aria-label', 'Take de @' + (t.author || 'aficionado') + ': ' + (t.title || '') + '. ' + (Number(t.upvotes) || 0) + ' apoyos, ' + (Number(t.downvotes) || 0) + ' cuestionados');
    card.addEventListener('click', () => window.aeTakeReplies?.open?.(t));
    return card;
  }
  function paintTakes() {
    const cards = state.takes.slice(0, 8).map(takeCard);
    if (state.takesOk || cards.length) {
      cards.push(moreCard('Publica tu Take', 'Opina y suma puntos si aciertas', openTakeComposer, 'cam-hj-invite'));
    }
    fill(rows.takes, cards);
  }

  /* ---------- datos ---------- */
  async function load(force) {
    const c = client();
    if (!c || state.loading) return;
    if (!force && state.loadedAt && now() - state.loadedAt < REFRESH_MS) return;
    state.loading = true;
    try {
      const since = new Date().toISOString();
      const open = (table, cols) => c.from(table).select(cols)
        .eq('status', 'scheduled').eq('picks_open', true).not('odds_locked_at', 'is', null)
        .gt('kickoff', since).order('kickoff', { ascending: true }).limit(MAX_GAMES);
      const [nfl, football, takes] = await Promise.all([
        open('cam_nfl_games', 'id,week,home_id,away_id,kickoff,status,picks_open,odds_locked_at,points_home,points_away'),
        open('cam_football_games', 'id,competition,matchday,home_id,away_id,kickoff,status,picks_open,odds_locked_at,points_home,points_draw,points_away'),
        c.rpc('ae_public_take_feed', { p_sport: 'all' })
      ]);
      state.gamesOk = !nfl.error && !football.error;
      if (!nfl.error) state.nfl = (nfl.data || []).filter(isOpen).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
      if (!football.error) state.football = (football.data || []).filter(isOpen).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
      state.takesOk = !takes.error;
      if (!takes.error) state.takes = Array.isArray(takes.data) ? takes.data : [];
      // Escudos solo de los partidos que se van a ver.
      const ids = [...new Set(state.football.slice(0, 12).flatMap(g => [g.home_id, g.away_id]).map(String))]
        .filter(id => !state.teams.has(id));
      if (ids.length) {
        const teams = await c.from('cam_football_teams').select('id,name,short_name,abbreviation,logo').in('id', ids);
        if (!teams.error) for (const t of teams.data || []) state.teams.set(String(t.id), t);
      }
      state.loadedAt = now();
    } catch (error) {
      console.warn('Tu jornada: no se pudieron cargar los partidos o los Takes.', error);
    } finally {
      state.loading = false;
      if (active()) paint();
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
        paint();
        void load(false);
      }
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
  // Al volver a la página (otra app, otra pestaña) se refresca si pasaron 5 min.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && on) void load(false); });
  window.addEventListener('pageshow', sync);
  sync();

  window.camHomeJornada = Object.freeze({ refresh: () => load(true), repaint, _state: () => state });
})();
