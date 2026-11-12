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
   cam-escritorio.css.
   Duelo (12 nov 2026): «Tu pick» (los equipos son los botones, sin puntos),
   «Tu jornada» al elegir y «Tu Take» como campo para escribir. */
(() => {
  'use strict';

  const root = document.getElementById('camNflSemana');
  const body = document.getElementById('camNflSemanaBody');
  const scoreRoot = document.getElementById('camNflScoreBody');
  if (!root || !body || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const TZ = 'America/Toronto';
  const H = 36e5;
  const ui = { scoreOpen: false, liveOpen: false, liveKey: null, savingGame: null, saveResult: null, focusTeam: null };
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
    // Desde el 12 nov 2026 todos los aciertos valen 2: lo parejo se mide con las probabilidades congeladas.
    const balance = g => g.probability_home == null ? 10 : Math.abs(Number(g.probability_home) - Number(g.probability_away)) * 10;
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

  /* ---------- Duelo de la semana (12 nov 2026) ----------
     Dos pasos con aspecto distinto:
       · Tu pick: los equipos, con su logo, SON los botones (un toque guarda el
         pronóstico de la quiniela). Sin puntos a la vista: todos los aciertos valen igual.
       · Tu Take: un campo para escribir; cuanto más atrevido, más vale.
     Al elegir aparece «Tu jornada»: cuántos llevas, los días (jueves, domingo,
     lunes…) y un botón al siguiente partido abierto, o cuándo volver. */
  const ICONS = {
    pick: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    take: '<path d="M4 5h16v11H10l-6 4V5z"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  };
  function icon(name) {
    const box = el('span', null, 'cam-ns-ico', { 'aria-hidden': 'true' });
    box.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + ICONS[name] + '</svg>';
    return box;
  }
  const dayOf = value => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const dayLong = iso => parts(iso, { weekday: 'long' });
  const dayShort = iso => cap(parts(iso, { weekday: 'short' }));
  const byKickoff = (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff);
  function relativeDay(iso) {
    const key = dayOf(iso);
    if (key === dayOf(Date.now())) return 'hoy';
    if (key === dayOf(Date.now() + 24 * H)) return 'mañana';
    return null;
  }
  function closesIn(iso) {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return null;
    const m = Math.max(1, Math.round(ms / 6e4)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    if (d >= 1) return d + ' d ' + h + ' h';
    if (h >= 1) return h + ' h ' + (m % 60) + ' min';
    return m + ' min';
  }
  function stepLabel(kind, text) {
    const label = el('p', null, 'cam-ns-step-label');
    label.append(icon(kind), el('span', text));
    return label;
  }
  function action(text, fn, className, attrs) {
    const b = el('button', text, className, attrs);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function openTake(title) {
    if (typeof window.aeOpenTakeComposer !== 'function') return;
    window.aeOpenTakeComposer('NFL', title ? { competition: 'NFL', title } : { competition: 'NFL' });
  }

  function sideTile(g, id, snap, open) {
    const home = id === g.home_id;
    const chosen = snap.mine.get(g.id) === id;
    const other = snap.mine.has(g.id) && !chosen;
    const name = teamOf(id)?.name || id;
    let cls = 'cam-ns-side' + (chosen ? ' is-selected' : '') + (other ? ' is-other' : '') + (open ? '' : ' is-static');
    if (finished(g) && g.winner_id) cls += g.winner_id === id ? ' is-winner' : ' is-loser';
    const tile = el(open ? 'button' : 'div', null, cls, { 'data-side': home ? 'home' : 'away', 'data-team': id });
    const mark = el('span', null, 'cam-ns-side-mark', { 'aria-hidden': 'true' });
    if (chosen) mark.append(icon('check'));
    const label = el('span', null, 'cam-ns-side-label');
    label.append(el('span', nick(id), 'cam-ns-side-name'), el('span', chosen ? 'Tu pick' : (home ? 'Local' : 'Visitante'), 'cam-ns-side-sub'));
    tile.append(mark, crest(id, 52), label);
    if (!open) {
      if (chosen) tile.setAttribute('aria-label', name + ': tu pick');
      return tile;
    }
    tile.type = 'button';
    tile.disabled = ui.savingGame != null;
    tile.setAttribute('aria-pressed', String(chosen));
    tile.setAttribute('aria-label', (chosen ? 'Tu pick: ' : 'Elegir a ') + name);
    tile.addEventListener('click', async () => {
      const q = quiniela();
      if (!q || ui.savingGame != null || snap.mine.get(g.id) === id) return;
      ui.savingGame = g.id;
      ui.saveResult = null;
      for (const button of tile.parentElement.querySelectorAll('button')) button.disabled = true;
      try {
        const saved = await q.save(g.id, id);
        if (saved) { ui.saveResult = { game: g.id, ok: true }; ui.focusTeam = id; }
        else if (snap.user) ui.saveResult = { game: g.id, ok: false, text: document.getElementById('camNflStatus')?.textContent || 'No se pudo guardar. Inténtalo de nuevo.' };
      } finally { ui.savingGame = null; schedule(); }
    });
    return tile;
  }

  function hintLine(snap, duel, open) {
    const mine = snap.mine.get(duel.id) || null;
    const result = ui.saveResult?.game === duel.id ? ui.saveResult : null;
    const hint = el('p', null, 'cam-ns-hint', { role: 'status' });
    if (result && !result.ok) {
      hint.classList.add('is-error');
      hint.textContent = result.text;
    } else if (finished(duel)) {
      if (mine && mine === duel.winner_id) { hint.classList.add('is-saved'); hint.append(icon('check'), el('span', 'Acertaste: ' + nick(mine) + '.')); }
      else hint.textContent = mine ? 'Elegiste ' + nick(mine) + '.' : 'No elegiste en este duelo.';
    } else if (started(duel)) {
      hint.textContent = mine ? 'Tu pick: ' + nick(mine) + ' · pronósticos cerrados' : 'Pronósticos cerrados';
    } else if (!open) {
      hint.textContent = 'Se abre cuando lleguen las cuotas.';
    } else if (mine) {
      hint.classList.add('is-saved');
      const rel = relativeDay(duel.kickoff);
      hint.append(icon('check'), el('span', 'Guardado. Puedes cambiarlo hasta ' + (rel || 'el ' + dayLong(duel.kickoff)) + ' a las ' + clock(duel.kickoff) + '.'));
    } else {
      const left = closesIn(duel.kickoff);
      hint.textContent = 'Un toque y estás dentro' + (left ? ' · cierra en ' + left : '');
    }
    return hint;
  }

  /* «Tu jornada»: la quiniela NFL se juega por jornada (jueves, domingo, lunes…).
     Tras elegir el duelo, invita a seguir con lo abierto o a volver el día que toque. */
  function journeyBlock(snap, weekGames, duel) {
    const q = quiniela();
    const now = Date.now();
    const games = weekGames.filter(g => g.status !== 'cancelled' && g.status !== 'postponed');
    if (!games.length) return null;
    const isOpen = g => !!q?.isOpen?.(g);
    const upcoming = g => g.status === 'scheduled' && Date.parse(g.kickoff) > now;
    const has = g => snap.mine.has(g.id);
    const days = [];
    for (const g of games.slice().sort(byKickoff)) {
      const key = dayOf(g.kickoff);
      let day = days.find(d => d.key === key);
      if (!day) days.push(day = { key, games: [] });
      day.games.push(g);
    }
    for (const day of days) {
      day.done = day.games.filter(has).length;
      day.open = day.games.filter(g => isOpen(g) && !has(g));
      day.later = day.games.filter(g => upcoming(g) && !isOpen(g) && !has(g));
      day.state = day.done === day.games.length ? 'done' : day.open.length ? 'open' : day.later.length ? 'later' : 'closed';
    }
    const total = games.length, picked = games.filter(has).length;
    const open = days.flatMap(d => d.open).sort(byKickoff);
    const later = days.flatMap(d => d.later).sort(byKickoff);
    const complete = picked === total && games.some(upcoming);
    if (!open.length && !later.length && !complete) return null;

    const box = el('div', null, 'cam-ns-next', { role: 'group', 'aria-labelledby': 'camNsNextTitle' });
    const head = el('div', null, 'cam-ns-next-head');
    head.append(el('p', 'Tu jornada', 'cam-ns-next-title', { id: 'camNsNextTitle' }), el('span', picked + ' de ' + total, 'cam-ns-next-count'));
    const bar = el('span', null, 'cam-ns-next-bar', { role: 'progressbar', 'aria-label': 'Partidos elegidos en la jornada',
      'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(picked) });
    bar.style.setProperty('--done', Math.round(100 * picked / total) + '%');
    bar.append(el('span', null, 'cam-ns-next-fill'));
    const row = el('div', null, 'cam-ns-days');
    for (const day of days) {
      const first = day.games[0];
      const target = day.open[0] || day.games.find(g => !has(g)) || first;
      const status = day.state === 'done' ? '✓' : day.state === 'later' ? 'Pronto' : day.done + '/' + day.games.length;
      const label = cap(dayLong(first.kickoff)) + ' ' + dayMonth(first.kickoff) + ': ' +
        (day.state === 'later' ? 'se abre más adelante' : day.done + ' de ' + day.games.length + ' elegidos');
      const chip = action(null, () => focusGame(target.id), 'cam-ns-day is-' + day.state, { 'aria-label': label });
      chip.append(el('strong', dayShort(first.kickoff)), el('span', status, 'cam-ns-day-status', { 'aria-hidden': 'true' }));
      row.append(chip);
    }
    box.append(head, bar, row);

    let message, cta = null;
    if (open.length) {
      const next = open[0];
      const rel = relativeDay(next.kickoff);
      const sameDay = open.filter(g => dayOf(g.kickoff) === dayOf(next.kickoff)).length;
      message = (open.length === 1 ? 'Te queda 1 partido por elegir.' : 'Te quedan ' + open.length + ' partidos por elegir.') +
        (rel ? ' El siguiente empieza ' + rel + ' a las ' + clock(next.kickoff) + '.' : '');
      const what = (sameDay === 1 ? 'el' : 'los ' + sameDay) + (rel ? ' de ' + rel : ' del ' + dayLong(next.kickoff));
      cta = action('Elegir ' + what + ' →', () => focusGame(next.id), 'cam-ns-next-cta');
    } else if (later.length) {
      const next = later[0];
      const rel = relativeDay(next.kickoff);
      message = 'Ya elegiste todo lo abierto. Lo ' + (rel ? 'de ' + rel : 'del ' + dayLong(next.kickoff)) +
        ' se abre cuando lleguen sus cuotas: vuelve ' + (rel ? '' : 'el ' + dayLong(next.kickoff) + ' ') + 'antes de las ' + clock(next.kickoff) + '.';
    } else {
      message = '¡Jornada completa! Ya elegiste ' + (total === 1 ? 'el partido.' : 'los ' + total + ' partidos.');
      const laurelTarget = snap.laurel === null ? [duel, ...games].find(g => has(g) && isOpen(g)) : null;
      if (laurelTarget) {
        message += ' Ponle el laurel a tu partido más seguro: si aciertas, vale el doble.';
        cta = action('Poner el laurel →', () => focusGame(laurelTarget.id), 'cam-ns-next-cta');
      } else {
        message += ' Vuelve cuando acabe cada día para ver cómo te fue.';
      }
    }
    box.append(el('p', message, 'cam-ns-next-text'));
    if (cta) box.append(cta);
    return box;
  }

  function takeBlock(snap, duel) {
    const mine = snap.mine.get(duel.id) || null;
    const invited = !!mine && !started(duel);
    const pickedNick = mine ? nick(mine) : null;
    const box = el('div', null, 'cam-ns-take' + (invited ? ' is-invited' : ''), { role: 'group', 'aria-labelledby': 'camNsTakeTitle' });
    box.append(stepLabel('take', 'Tu Take'),
      el('h4', invited ? '¿Y cómo ganan los ' + pickedNick + '?' : '¿Qué crees que va a pasar?', 'cam-ns-step-title', { id: 'camNsTakeTitle' }),
      el('p', 'Una predicción con tus palabras. Lo que se publica aquí no se borra.', 'cam-ns-take-text'));
    if (invited) {
      const ideas = el('div', null, 'cam-ns-ideas');
      const list = el('div', null, 'cam-ns-ideas-row');
      for (const idea of ['Los ' + pickedNick + ' ganan por 10 o más', 'Los ' + pickedNick + ' remontan en el último cuarto'])
        list.append(action(idea, () => openTake(idea), 'cam-ns-idea', { 'aria-haspopup': 'dialog', 'aria-controls': 'aeTakeComposerDialog' }));
      ideas.append(el('p', 'Ideas para empezar', 'cam-ns-ideas-label'), list);
      box.append(ideas);
    }
    const example = pickedNick || nick(duel.home_id);
    const field = action(null, () => openTake(), 'cam-ns-take-field', { 'aria-label': 'Escribir mi Take', 'aria-haspopup': 'dialog', 'aria-controls': 'aeTakeComposerDialog' });
    const pen = el('span', null, 'cam-ns-take-pen', { 'aria-hidden': 'true' });
    pen.append(icon('pen'));
    field.append(el('span', '«Los ' + example + ' ganan por más de 10…»', 'cam-ns-take-placeholder', { 'aria-hidden': 'true' }), pen);
    const scale = el('p', null, 'cam-ns-take-scale');
    const bars = el('span', null, 'cam-ns-bars', { 'aria-hidden': 'true' });
    bars.append(el('span'), el('span'), el('span'));
    scale.append(bars, el('span', 'Cuanto más atrevido, más vale si aciertas'));
    box.append(field, scale);
    return box;
  }

  function duelBlock(snap, duel, rankIds, weekGames) {
    const pos = id => { const i = rankIds.indexOf(id); return i < 0 ? null : i + 1; };
    const a = pos(duel.away_id), h = pos(duel.home_id);
    const label = a && h ? 'n.º ' + a + ' vs n.º ' + h : a || h ? 'juega el n.º ' + Math.min(a || 99, h || 99) : 'el más parejo';
    const box = section('duelo', 'Duelo de la semana · ' + label);
    box.classList.add('cam-ns-feature', 'cam-ns-duelo');
    if (finished(duel)) {
      box.append(el('p', duel.away_id + ' ' + duel.away_score + ' – ' + duel.home_score + ' ' + duel.home_id, 'cam-ns-duel-score'));
    } else {
      box.append(el('p', (started(duel) ? (duel.status === 'live' ? 'En juego · ' : 'Cerrado · ') : '') + when(duel.kickoff) + ' · ' + dayMonth(duel.kickoff), 'cam-ns-duel-when'));
    }
    box.append(el('p', (teamOf(duel.away_id)?.name || duel.away_id) + ' en casa de ' + (teamOf(duel.home_id)?.name || duel.home_id), 'cam-ns-sr'));

    const open = !started(duel) && !!quiniela()?.isOpen?.(duel);
    const pick = el('div', null, 'cam-ns-step cam-ns-step-pick', { role: 'group', 'aria-labelledby': 'camNsPickTitle' });
    pick.append(stepLabel('pick', 'Tu pick'), el('h4', finished(duel) ? '¿Quién ganó?' : '¿Quién gana?', 'cam-ns-step-title', { id: 'camNsPickTitle' }));
    const sides = el('div', null, 'cam-ns-sides');
    sides.append(sideTile(duel, duel.away_id, snap, open), el('span', '@', 'cam-ns-at', { 'aria-hidden': 'true' }), sideTile(duel, duel.home_id, snap, open));
    pick.append(sides, hintLine(snap, duel, open));
    const share = snap.split?.get(duel.id);
    if (share && Number(share.total) >= 5) {
      const away = Math.round(100 * Number(share.away_picks) / Number(share.total));
      pick.append(el('p', 'La comunidad: ' + away + ' % ' + nick(duel.away_id) + ' · ' + (100 - away) + ' % ' + nick(duel.home_id), 'cam-ns-note'));
    }
    if (snap.mine.has(duel.id)) {
      const journey = journeyBlock(snap, weekGames, duel);
      if (journey) pick.append(journey);
    }
    box.append(pick, takeBlock(snap, duel));
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
      const chance = g.winner_id ? (g.winner_id === g.home_id ? g.probability_home : g.probability_away) : null;
      const fall = loser ? pos(loser) : null;
      let tag = null, weight = 0;
      if (chance != null && Number(chance) <= 1 / 3) { tag = 'Sorpresa'; weight = 100 + Math.round((1 - Number(chance)) * 10); }
      else if (g.is_bonus) { tag = 'Partido bonus'; weight = 90; }
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
      duelo: duel ? duelBlock(snap, duel, rankIds, weekGames) : null,
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
    // Tras guardar el pick, el foco vuelve al equipo elegido (la tarjeta se repinta entera).
    if (ui.focusTeam) {
      body.querySelector('.cam-ns-side[data-team="' + CSS.escape(ui.focusTeam) + '"]')?.focus({ preventScroll: true });
      ui.focusTeam = null;
    }
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

