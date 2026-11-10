/* CAM SPORTS · NFL «La semana» (4 nov 2026). Teléfono.
   Primera pestaña de NFL (La semana · Takes · Noticias), como la portada de un
   periódico de domingo:
     · cabecera de edición: la semana, sus fechas y cuándo cierra el próximo partido;
     · Duelo de la semana: el partido entre los dos mejores del Power Ranking
       (sin ranking, el más parejo), para elegir ahí mismo;
     · La quiniela completa sigue directamente al duelo;
     · ¿Le ganas al editor? (cuando la base de datos tiene la migración 20261104090000);
     · El marcador (o La crónica, lunes y martes): resultados con sorpresas y caídas
       del Top 10;
     · Power Rankings conserva su módulo completo y su diseño en Noticias.
   El marcador y la crónica cierran la pestaña, después de la quiniela.

   Cuota: no hace consultas propias salvo el marcador «tú contra el editor» (una
   llamada por jornada). Los partidos, tus elecciones y las del editor salen de
   La Quiniela (window.camNflQuiniela); el ranking, de community.js.
   Escritorio (8 nov 2026): la misma pestaña, compuesta en columnas por
   cam-escritorio.css. */
(() => {
  'use strict';

  const root = document.getElementById('camNflSemana');
  const body = document.getElementById('camNflSemanaBody');
  const scoreRoot = document.getElementById('camNflScoreBody');
  if (!root || !body || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const TZ = 'America/Toronto';
  const H = 36e5;
  const ui = { scoreOpen: false, liveOpen: false, liveKey: null, savingGame: null, saveResult: null };
  const duelCache = new Map();   // 'temporada|semana|usuario' → fila de cam_nfl_expert_duel (o null)

  /* ---------- utilidades ---------- */
  function el(tag, text, className, attrs) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
    return node;
  }
  const client = () => { try { return typeof db !== 'undefined' && db ? db : null; } catch { return null; } };
  const catalog = () => { try { return typeof NFL_TEAMS !== 'undefined' ? NFL_TEAMS : []; } catch { return []; } };
  const teamOf = id => window.CamNFLQuinielaTeams?.getTeam?.(id) || catalog().find(t => t.id === id) || null;
  const nick = id => { const words = String(teamOf(id)?.name || id).trim().split(/\s+/); return words[words.length - 1] || id; };
  const published = () => { try { return typeof rankingPublished !== 'undefined' ? rankingPublished : null; } catch { return null; } };
  const nflOn = () => document.body.classList.contains('ae-is-nfl');
  // 8 nov 2026: también en escritorio (cam-escritorio.css la compone en columnas).
  const active = () => nflOn();
  const pts = n => n + (Number(n) === 1 ? ' pt' : ' pts');

  const parts = (value, options) => new Intl.DateTimeFormat('es', { timeZone: TZ, ...options }).format(new Date(value)).replace(/\./g, '');
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const clock = iso => parts(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
  const when = iso => cap(parts(iso, { weekday: 'short' })) + ' ' + clock(iso);
  const dayMonth = iso => parts(iso, { day: 'numeric', month: 'short' });
  const weekday = () => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date());
  const weekName = w => ({ 19: 'Wild Card', 20: 'Divisional', 21: 'Finales de conferencia', 22: 'Super Bowl' })[w] || 'Semana ' + w;
  const started = g => g.status !== 'scheduled' || Date.parse(g.kickoff) <= Date.now();
  const finished = g => g.status === 'final' || g.status === 'tie';
  const pointsFor = (g, id) => id === g.home_id ? g.points_home : g.points_away;

  function crest(id, size = 28) {
    const team = teamOf(id);
    const box = el('span', null, 'cam-ns-crest');
    box.style.setProperty('--crest', size + 'px');
    box.append(el('span', id, 'cam-ns-crest-text', { 'aria-hidden': 'true' }));
    if (/^https:\/\//i.test(String(team?.logo || ''))) {
      const img = el('img', null, null, { alt: '', width: String(size), height: String(size), decoding: 'async', loading: 'lazy' });
      img.addEventListener('load', () => box.classList.add('is-loaded'));
      img.addEventListener('error', () => img.remove());
      img.src = team.logo;
      box.append(img);
    }
    return box;
  }
  function section(key, kicker, aside) {
    const box = el('section', null, 'cam-ns-block', { 'data-block': key });
    const head = el('div', null, 'cam-ns-block-head');
    head.append(el('h3', kicker, 'cam-ns-kicker'));
    if (aside) head.append(typeof aside === 'string' ? el('span', aside, 'cam-ns-aside') : aside);
    box.append(head);
    return box;
  }
  function link(text, action, extra) {
    const b = el('button', text, 'cam-ns-link' + (extra ? ' ' + extra : ''));
    b.type = 'button';
    b.addEventListener('click', action);
    return b;
  }
  const quiniela = () => window.camNflQuiniela || null;
  function focusGame(id) {
    release();
    window.camSectionTabs?.select?.('quiniela', { scroll: false });
    const q = quiniela();
    if (q) q.focus(id);
    else document.getElementById('camNflQuiniela')?.scrollIntoView({ block: 'start' });
  }

  /* ---------- la semana en datos ---------- */
  function currentWeek(games, season) {
    const inSeason = games.filter(g => Number(g.season) === season);
    const weeks = [...new Set(inSeason.map(g => Number(g.week)))].sort((a, b) => a - b);
    if (!weeks.length) return null;
    const t = Date.now();
    return weeks.find(w => inSeason.some(g => Number(g.week) === w && Date.parse(g.kickoff) + 6 * H >= t)) || weeks[weeks.length - 1];
  }
  function phase(weekGames) {
    const t = Date.now();
    if (weekGames.some(g => g.status === 'live' || (g.status === 'scheduled' && Date.parse(g.kickoff) <= t && Date.parse(g.kickoff) + 4 * H > t))) return 'envivo';
    const day = weekday();
    return day === 'Mon' || day === 'Tue' ? 'cronica' : 'duelos';
  }
  function chooseDuel(weekGames, rankIds) {
    if (!weekGames.length) return null;
    const pos = id => { const i = rankIds.indexOf(id); return i < 0 ? 99 : i + 1; };
    const balance = g => Math.abs((Number(g.points_home) || 6) - (Number(g.points_away) || 6));
    const score = g => {
      const a = pos(g.away_id), h = pos(g.home_id);
      if (a < 99 && h < 99) return a + h;
      if (a < 99 || h < 99) return 100 + 2 * Math.min(a, h) + balance(g);
      return 300 + balance(g);
    };
    return weekGames.slice().sort((a, b) => score(a) - score(b) || Date.parse(a.kickoff) - Date.parse(b.kickoff))[0];
  }
  /* ---------- bloques ---------- */
  function header() {
    const head = el('header', null, 'cam-ns-head');
    head.append(el('h2', 'La semana', 'cam-ns-title', { id: 'camNflSemanaTitle' }));
    head.append(el('span', null, 'cam-ns-rule', { 'aria-hidden': 'true' }));
    return head;
  }

  function sideButton(g, id, snap) {
    const chosen = snap.mine.get(g.id) === id;
    const b = el('button', null, 'cam-ns-pick' + (chosen ? ' is-selected' : ''));
    b.type = 'button';
    b.disabled = ui.savingGame != null;
    b.setAttribute('aria-pressed', String(chosen));
    const p = pointsFor(g, id);
    const doubled = p != null && snap.laurel === g.id;
    b.append(el('strong', nick(id)), el('span', p == null ? 'pts pendientes' : (doubled ? pts(p * 2) + ' · x2' : pts(p)), 'cam-ns-pick-points'));
    b.setAttribute('aria-label', 'Quiniela: elegir ' + (teamOf(id)?.name || id) + (p == null ? '' : ', ' + pts(doubled ? p * 2 : p)) + (chosen ? ' (tu elección guardada)' : ''));
    b.addEventListener('click', async () => {
      const q = quiniela();
      if (!q || ui.savingGame != null) return;
      ui.savingGame = g.id;
      ui.saveResult = null;
      for (const button of b.parentElement.children) if (button.tagName === 'BUTTON') button.disabled = true;
      try {
        const saved = await q.save(g.id, id);
        if (saved) ui.saveResult = { game: g.id, text: 'Quiniela guardada: ' + nick(id) + '.' };
        else if (snap.user) ui.saveResult = { game: g.id, text: document.getElementById('camNflStatus')?.textContent || 'No se pudo guardar. Inténtalo de nuevo.' };
      } finally { ui.savingGame = null; schedule(); }
    });
    return b;
  }

  function duelBlock(snap, duel, rankIds) {
    const pos = id => { const i = rankIds.indexOf(id); return i < 0 ? null : i + 1; };
    const a = pos(duel.away_id), h = pos(duel.home_id);
    const label = a && h ? 'n.º ' + a + ' vs n.º ' + h : a || h ? 'juega el n.º ' + Math.min(a || 99, h || 99) : 'el más parejo';
    const box = section('duelo', 'Duelo de la semana · ' + label);
    box.classList.add('cam-ns-feature');
    const teams = el('div', null, 'cam-ns-duel');
    const team = (id, side) => {
      const t = el('div', null, 'cam-ns-duel-team', { 'data-side': side });
      t.append(crest(id, 40), el('span', nick(id), 'cam-ns-duel-name'));
      return t;
    };
    teams.append(team(duel.away_id, 'away'), el('span', '@', 'cam-ns-at', { 'aria-hidden': 'true' }), team(duel.home_id, 'home'));
    box.append(teams);
    const sr = el('p', (teamOf(duel.away_id)?.name || duel.away_id) + ' en casa de ' + (teamOf(duel.home_id)?.name || duel.home_id), 'cam-ns-sr');
    box.append(sr);

    if (finished(duel)) {
      box.append(el('p', duel.away_id + ' ' + duel.away_score + ' – ' + duel.home_score + ' ' + duel.home_id, 'cam-ns-duel-score'));
    } else {
      box.append(el('p', (started(duel) ? (duel.status === 'live' ? 'En juego · ' : 'Cerrado · ') : '') + when(duel.kickoff) + ' · ' + dayMonth(duel.kickoff), 'cam-ns-duel-when'));
    }

    const opinion = el('div', null, 'cam-ns-opinion');
    const take = link('Publicar mi take sobre este duelo', () => {
      window.aeOpenTakeComposer?.('NFL');
    }, 'cam-ns-link-take');
    take.setAttribute('aria-controls', 'aeTakeComposerDialog');
    take.setAttribute('aria-haspopup', 'dialog');
    opinion.append(take);
    box.append(opinion);

    const play = el('div', null, 'cam-ns-quiniela', { role: 'group', 'aria-label': 'Quiniela del duelo de la semana' });
    if (finished(duel)) {
      const mine = snap.mine.get(duel.id);
      const winner = duel.winner_id;
      if (mine) play.append(el('p', mine === winner ? 'Acertaste: ' + nick(mine) + '.' : 'Elegiste ' + nick(mine) + '.', 'cam-ns-note'));
    } else if (started(duel)) {
      const mine = snap.mine.get(duel.id);
      play.append(el('p', mine ? 'Tu elección: ' + nick(mine) : 'Pronósticos cerrados', 'cam-ns-note'));
    } else {
      const picks = el('div', null, 'cam-ns-picks');
      if (quiniela()?.isOpen?.(duel)) picks.append(sideButton(duel, duel.away_id, snap), sideButton(duel, duel.home_id, snap));
      else picks.append(el('p', 'Se abre cuando lleguen las cuotas.', 'cam-ns-note'));
      play.append(picks);
    }
    if (ui.saveResult?.game === duel.id) {
      play.append(el('p', ui.saveResult.text, 'cam-ns-note', { role: 'status' }));
    } else if (!started(duel) && snap.mine.has(duel.id)) {
      play.append(el('p', 'Tu elección guardada: ' + nick(snap.mine.get(duel.id)), 'cam-ns-note'));
    }
    const share = snap.split?.get(duel.id);
    if (share && Number(share.total) >= 5) {
      const away = Math.round(100 * Number(share.away_picks) / Number(share.total));
      play.append(el('p', 'La comunidad: ' + away + ' % ' + nick(duel.away_id) + ' · ' + (100 - away) + ' % ' + nick(duel.home_id), 'cam-ns-note'));
    }
    box.append(play);
    return box;
  }


  function liveBlock(weekGames) {
    const live = weekGames.filter(g => g.status === 'live' || (g.status === 'scheduled' && started(g) && Date.parse(g.kickoff) + 6 * H > Date.now()))
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    if (!live.length) { ui.liveOpen = false; return null; }
    const box = el('details', null, 'cam-ns-block cam-ns-live', { 'data-block': 'envivo' });
    box.open = ui.liveOpen;
    const toggle = el('summary', null, 'cam-ns-live-toggle');
    toggle.append(el('span', 'En juego', 'cam-ns-kicker'), el('span', live.length + (live.length === 1 ? ' partido' : ' partidos'), 'cam-ns-aside'));
    box.append(toggle);
    box.addEventListener('toggle', () => {
      if (!box.isConnected || ui.liveOpen === box.open) return;
      ui.liveOpen = box.open;
      if (ui.liveOpen) refreshLive();
    });
    const list = el('ul', null, 'cam-ns-results');
    for (const g of live) {
      const row = el('li', null, 'cam-ns-result');
      const score = g.home_score != null && g.away_score != null ? g.away_id + ' ' + g.away_score + ' – ' + g.home_score + ' ' + g.home_id : g.away_id + ' @ ' + g.home_id;
      row.append(el('span', score, 'cam-ns-result-score'), el('span', 'Desde las ' + clock(g.kickoff), 'cam-ns-result-tag is-quiet'));
      list.append(row);
    }
    box.append(list);
    return box;
  }

  function scoreBlock(snap, games, season, week, rankIds, mode) {
    const has = w => games.some(g => Number(g.season) === season && Number(g.week) === w && finished(g));
    const target = has(week) ? week : (week > 1 && has(week - 1) ? week - 1 : null);
    if (target == null) return null;
    const results = games.filter(g => Number(g.season) === season && Number(g.week) === target && finished(g));
    const pos = id => { const i = rankIds.indexOf(id); return i < 0 ? null : i + 1; };
    const scored = results.map(g => {
      const loser = g.winner_id ? (g.winner_id === g.home_id ? g.away_id : g.home_id) : null;
      const paid = g.winner_id ? pointsFor(g, g.winner_id) : null;
      const fall = loser ? pos(loser) : null;
      let tag = null, weight = 0;
      if (paid != null && paid >= 6) { tag = 'Sorpresa · pagó ' + paid; weight = 100 + paid; }
      else if (fall) { tag = 'Cae el n.º ' + fall; weight = 50 - fall; }
      return { g, tag, weight };
    }).sort((a, b) => b.weight - a.weight || Date.parse(a.g.kickoff) - Date.parse(b.g.kickoff));
    const title = (mode === 'cronica' ? 'La crónica · ' : 'El marcador · ') + weekName(target);
    const box = section('marcador', title);
    const list = el('ul', null, 'cam-ns-results');
    const shown = ui.scoreOpen ? scored : scored.slice(0, 3);
    for (const { g, tag } of shown) {
      const row = el('li', null, 'cam-ns-result');
      const score = el('span', null, 'cam-ns-result-score');
      const team = (id, value) => { const s = el('span', id + ' ' + value, g.winner_id === id ? 'is-winner' : null); return s; };
      score.append(team(g.away_id, g.away_score), el('span', ' – ', 'cam-ns-dash'), team(g.home_id, g.home_score));
      score.setAttribute('aria-label', (teamOf(g.away_id)?.name || g.away_id) + ' ' + g.away_score + ', ' + (teamOf(g.home_id)?.name || g.home_id) + ' ' + g.home_score);
      row.append(score);
      if (tag) row.append(el('span', tag, 'cam-ns-result-tag' + (tag.startsWith('Sorpresa') ? ' is-surprise' : '')));
      const mine = snap.mine.get(g.id);
      if (mine && g.winner_id) row.append(el('span', mine === g.winner_id ? 'Acertaste' : 'Fallaste', 'cam-ns-result-mine' + (mine === g.winner_id ? ' is-hit' : ' is-miss')));
      list.append(row);
    }
    box.append(list);
    if (scored.length > 3) {
      const more = link(ui.scoreOpen ? 'Ver menos' : 'Ver los ' + scored.length + ' resultados ›', () => { ui.scoreOpen = !ui.scoreOpen; render(); });
      more.setAttribute('aria-expanded', String(ui.scoreOpen));
      box.append(more);
    }
    box.dataset.week = String(target);
    return box;
  }

  /* ---------- tú contra el editor (una llamada por jornada) ---------- */
  async function loadDuel(season, week, user) {
    const key = season + '|' + week + '|' + (user?.id || '-');
    if (duelCache.has(key)) return;
    duelCache.set(key, null);
    const c = client();
    if (!c) return;
    try {
      const { data, error } = await c.rpc('cam_nfl_expert_duel', { p_season: season, p_week: week });
      if (!error) duelCache.set(key, Array.isArray(data) ? data[0] || null : data || null);
    } catch {}
    schedule();
  }

  /* ---------- pintar ---------- */
  function render() {
    if (!active()) return;
    const q = quiniela();
    const snap = q?.snapshot?.() || null;
    const games = snap?.games || [];
    const fragment = document.createDocumentFragment();
    const rankIds = Array.isArray(published()?.team_ids) ? published().team_ids : [];
    if (!snap || !snap.loaded) {
      fragment.append(el('p', 'Cargando la semana…', 'cam-ns-loading'));
      body.replaceChildren(fragment);
      scoreRoot?.replaceChildren();
      root.dataset.phase = 'cargando';
      return;
    }
    const season = Number(snap.season);
    const week = currentWeek(games, season) ?? Number(snap.week);
    const liveKey = season + '|' + week;
    if (ui.liveKey !== liveKey) { ui.liveKey = liveKey; ui.liveOpen = false; }
    const weekGames = games.filter(g => Number(g.season) === season && Number(g.week) === week)
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    const mode = phase(weekGames);
    root.dataset.phase = mode;
    fragment.append(header(snap, week, weekGames));
    const duel = chooseDuel(weekGames, rankIds);
    const score = scoreBlock(snap, games, season, week, rankIds, mode);
    const scoreWeek = score ? Number(score.dataset.week) : null;
    if (scoreWeek != null && snap.expert) void loadDuel(season, scoreWeek, snap.user);
    const blocks = {
      envivo: liveBlock(snap.liveGames || weekGames),
      duelo: duel ? duelBlock(snap, duel, rankIds) : null,
            marcador: score
    };
    // La quiniela precede al editor y al marcador en todos los días de la semana.
    const order = ['envivo', 'duelo'];
    scoreRoot?.replaceChildren(...[blocks.marcador].filter(Boolean));
    for (const key of order) if (blocks[key]) fragment.append(blocks[key]);
    if (!weekGames.length) fragment.append(el('p', 'Todavía no hay partidos de esta semana. Vuelve cuando se publique el calendario.', 'cam-ns-text'));
    const liveFocused = body.querySelector('.cam-ns-live-toggle') === document.activeElement;
    body.replaceChildren(fragment);
    if (liveFocused) body.querySelector('.cam-ns-live-toggle')?.focus({ preventScroll: true });
    keepAnchor();
  }

  /* ---------- Ir a la quiniela o al Top 10 (Inicio, perfil) ----------
     La semana se pinta encima cuando llegan los datos: quien pidió la quiniela o los
     Power Rankings los sigue teniendo a la vista, salvo que ya esté moviendo la pantalla. */
  let anchorUntil = 0, anchorId = null;
  const release = () => { anchorUntil = 0; };
  for (const type of ['touchmove', 'wheel', 'keydown']) window.addEventListener(type, release, { passive: true, capture: true });
  function anchor(id) { anchorId = id; anchorUntil = Date.now() + 6000; }
  function keepAnchor() {
    if (!anchorUntil) return;
    if (Date.now() > anchorUntil || !active()) { anchorUntil = 0; return; }
    const target = document.getElementById(anchorId);
    if (target && target.getClientRects().length) { try { target.scrollIntoView({ block: 'start' }); } catch {} }
  }
  const originalGo = typeof window.camGoQuiniela === 'function' ? window.camGoQuiniela : null;
  window.camGoQuiniela = function camSemanaGoQuiniela(sport) {
    if (sport !== 'football') anchor('camNflQuiniela');
    if (originalGo) return originalGo.apply(this, arguments);
    if (typeof window.filterByCategory === 'function') window.filterByCategory(sport === 'football' ? 'Fútbol' : 'NFL');
    window.camSectionTabs?.select?.('quiniela');
    requestAnimationFrame(() => document.getElementById(sport === 'football' ? 'camFootballQuiniela' : 'camNflQuiniela')?.scrollIntoView({ block: 'start' }));
  };
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }

  /* ---------- «Ver Top 10» abre Noticias y enfoca el módulo completo ---------- */
  window.openNflTopTen = function camSemanaTopTen() {
    if (typeof window.filterByCategory === 'function') window.filterByCategory('NFL');
    window.camSectionTabs?.select?.('noticias', { scroll: false });
    anchor('nflRankings');
    requestAnimationFrame(() => {
      const rankings = document.getElementById('nflRankings');
      rankings?.focus({ preventScroll: true });
      rankings?.scrollIntoView({ block: 'start' });
    });
  };

  document.addEventListener('cam:nfl-quiniela-data', schedule);
  document.addEventListener('cam:nfl-ranking', schedule);
  document.addEventListener('cam:section-tab', event => {
    if (event.detail?.section !== 'nfl') return;
    // A delayed data repaint must not undo the visitor's next tab choice.
    if ((anchorId === 'nflRankings' && event.detail.tab !== 'noticias') ||
        (anchorId === 'camNflQuiniela' && event.detail.tab !== 'semana')) release();
    schedule();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', schedule);
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  schedule();

  window.camNflSemana = Object.freeze({ render, _ui: ui, _choose: chooseDuel, _phase: phase });
  function refreshLive() {
    if (active() && !document.hidden && (document.body.dataset.camTab === 'semana' || document.body.dataset.camSportPage) && ui.liveOpen)
      void quiniela()?.refreshLive?.();
  }
  setInterval(refreshLive, 60000);
  window.addEventListener('focus', refreshLive);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLive(); });
})();

