/* CAM SPORTS · «El marcador» como menú vertical (13 nov 2026, pedido del dueño).
   Tres filas que se tocan como un menú, en NFL y en las cuatro ligas de Fútbol:
     · El marcador (o La crónica): los resultados de siempre (los pinta cada deporte);
     · Clasificación: NFL por conferencia (AFC / NFC) y división, con el puesto de
       playoff; Fútbol con la tabla de la liga elegida y sus zonas (Champions,
       descenso, liguilla, octavos…);
     · Mejores anotadores (NFL, touchdowns) / Goleadores (Fútbol).
   Se abre una fila y se cierra la que estaba abierta; al cargar, El marcador.
   Datos: public.cam_sport_tables_get (copia de ESPN que una tarea programada
   renueva como mucho una vez por hora). Una llamada por competición y visita, y
   solo cuando el menú se acerca a la pantalla. Sin datos (o sin la migración
   20261113040000), el menú enseña solo El marcador, como antes.
   La usan cam-nfl-semana.js y cam-football-semana.js; estilos en cam-nfl-semana.css. */
(() => {
  'use strict';

  const TZ = 'America/Toronto';
  const STALE = 30 * 6e4;
  const cache = new Map();      // competición → { status: 'loading'|'ready'|'missing'|'error', data, at }
  const state = new Map();      // deporte → { open, conf, tableAll, scorersAll }
  let focusKey = null;

  const client = () => { try { return typeof db !== 'undefined' && db ? db : (window.db || null); } catch { return null; } };
  function el(tag, text, className, attrs) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
    return node;
  }
  function svg(paths) {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    for (const d of paths) {
      const node = document.createElementNS(ns, d.startsWith('c:') ? 'circle' : d.startsWith('r:') ? 'rect' : 'path');
      if (d.startsWith('c:')) { const [cx, cy, r] = d.slice(2).split(','); node.setAttribute('cx', cx); node.setAttribute('cy', cy); node.setAttribute('r', r); }
      else if (d.startsWith('r:')) { const [x, y, w, h, rx] = d.slice(2).split(','); node.setAttribute('x', x); node.setAttribute('y', y); node.setAttribute('width', w); node.setAttribute('height', h); node.setAttribute('rx', rx); }
      else node.setAttribute('d', d);
      s.append(node);
    }
    return s;
  }
  const ICONS = {
    marcador: ['r:3,5,18,14,2', 'M12 5v14', 'M7 10v4', 'M15.5 10h2v4h-2z'],
    tabla: ['M10 6h10', 'M10 12h10', 'M10 18h10', 'M4 6h2', 'M4 12h2', 'M4 18h2'],
    nfl: ['M4.5 19.5c-1.6-5.4 2.6-13.4 15-15 1.6 5.4-2.6 13.4-15 15z', 'M9 15l6-6', 'M10.5 11.5l2 2', 'M12.5 9.5l2 2'],
    futbol: ['c:12,12,9', 'M12 7.5l3.8 2.8-1.5 4.4H9.7l-1.5-4.4z', 'M12 3v4.5', 'M15.8 10.3l4.6-1.5', 'M14.3 14.7l2.8 3.9', 'M9.7 14.7l-2.8 3.9', 'M8.2 10.3l-4.6-1.5']
  };

  // Escudo con el mismo marcado que el resto de La semana (.cam-ns-crest).
  function crest(text, logo, size) {
    const box = el('span', null, 'cam-ns-crest');
    box.style.setProperty('--crest', size + 'px');
    box.append(el('span', text, 'cam-ns-crest-text', { 'aria-hidden': 'true' }));
    if (/^https:\/\//i.test(String(logo || ''))) {
      const img = el('img', null, null, { alt: '', width: String(size), height: String(size), decoding: 'async', loading: 'lazy' });
      img.addEventListener('load', () => box.classList.add('is-loaded'));
      img.addEventListener('error', () => img.remove());
      img.src = logo;
      box.append(img);
    }
    return box;
  }

  /* ---------- datos ---------- */
  function entry(competition) { return cache.get(competition) || null; }
  async function load(competition, force) {
    const now = Date.now();
    const old = cache.get(competition);
    if (old && (old.status === 'loading' || old.status === 'missing')) return;
    if (old && old.status === 'ready' && !force && now - old.at < STALE) return;
    const c = client();
    if (!c || typeof c.rpc !== 'function') return;
    cache.set(competition, { status: 'loading', data: old?.data || null, at: old?.at || 0 });
    let next;
    try {
      const { data, error } = await c.rpc('cam_sport_tables_get', { p_competition: competition });
      if (error) {
        const missing = /cam_sport_tables_get|function|schema cache|PGRST202|42883/i.test(String(error.message || error.code || ''));
        next = { status: missing ? 'missing' : 'error', data: old?.data || null, at: now };
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        next = { status: row ? 'ready' : 'missing', data: row || null, at: now };
      }
    } catch {
      next = { status: 'error', data: old?.data || null, at: now };
    }
    cache.set(competition, next);
    document.dispatchEvent(new CustomEvent('cam:sport-tables', { detail: { competition } }));
  }

  // Carga perezosa: cuando el menú está a menos de una pantalla de distancia.
  const watching = new WeakMap();
  function watch(node, competition) {
    if (!('IntersectionObserver' in window)) { void load(competition); return; }
    const io = new IntersectionObserver(items => {
      if (!items.some(i => i.isIntersecting)) return;
      io.disconnect();
      void load(competition);
    }, { rootMargin: '600px 0px' });
    io.observe(node);
    watching.set(node, io);
  }

  /* ---------- formato ---------- */
  const signed = n => n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
  const record = t => t.t ? t.w + '-' + t.l + '-' + t.t : t.w + '-' + t.l;
  const surname = name => String(name || '').trim().split(/\s+/).filter(w => !/^(jr\.?|sr\.?|i{2,3}|iv)$/i.test(w)).slice(-1)[0] || name;
  function joinNames(list) {
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ' y ' + list[list.length - 1];
  }
  function updated(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const day = d => new Intl.DateTimeFormat('es', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    const time = new Intl.DateTimeFormat('es', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
    if (day(date) === day(new Date())) return 'actualizado a las ' + time;
    return 'actualizado el ' + new Intl.DateTimeFormat('es', { timeZone: TZ, day: 'numeric', month: 'short' }).format(date).replace(/\./g, '');
  }
  // Puesto con empates (1, 1, 3…) sobre la lista ordenada por ESPN.
  function ranked(list, value) {
    let last = null, rank = 0;
    return list.map((item, i) => {
      const v = value(item);
      if (v !== last) { rank = i + 1; last = v; }
      return { item, rank };
    });
  }

  const DIVISION = { East: 'Este', North: 'Norte', South: 'Sur', West: 'Oeste' };
  const divisionName = name => String(name || '').replace(/\b(East|North|South|West)\b/, w => DIVISION[w] || w);
  const ZONES = {
    ligamx: { z1: 'Liguilla (1.º al 8.º)' },
    champions: { z1: 'Octavos directos', z2: 'Play-off', z4: 'Eliminados' },
    laliga: { z1: 'Champions', z2: 'Europa League', z3: 'Conference', z4: 'Descenso' },
    premier: { z1: 'Champions', z2: 'Europa League', z3: 'Conference', z4: 'Descenso' }
  };
  function zoneOf(competition, row) {
    const note = String(row.note || '');
    if (competition === 'ligamx') return row.rank <= 8 ? 'z1' : '';
    if (competition === 'champions') {
      if (/round of 16|octavos/i.test(note)) return 'z1';
      if (/play-?off/i.test(note)) return 'z2';
      if (/eliminat/i.test(note)) return 'z4';
      return '';
    }
    if (/relegat|descenso/i.test(note)) return 'z4';
    if (/conference/i.test(note)) return 'z3';
    if (/europa/i.test(note)) return 'z2';
    if (/champions/i.test(note)) return 'z1';
    return '';
  }

  // «Apertura 2026 · jornada 16 de 17», «Fase liga · jornada 4 de 8», «Temporada 2026-27 · jornada 12».
  function intro(competition, table) {
    const rows = Array.isArray(table?.rows) ? table.rows : [];
    const played = Math.max(0, ...rows.map(r => Number(r.played) || 0));
    const day = played ? 'jornada ' + played : '';
    if (competition === 'ligamx') {
      const m = /(Apertura|Clausura)/i.exec(String(table.group || '')), y = /(\d{4})/.exec(String(table.group || ''));
      const name = m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() + (y ? ' ' + y[1] : '') : 'Liga MX';
      return [name, day && rows.length > 1 ? day + ' de ' + (rows.length - 1) : day].filter(Boolean).join(' · ');
    }
    if (competition === 'champions') return ['Fase liga', day ? day + ' de 8' : ''].filter(Boolean).join(' · ');
    const season = /(\d{4}-\d{2})/.exec(String(table.season || table.group || ''));
    return [season ? 'Temporada ' + season[1] : '', day].filter(Boolean).join(' · ');
  }

  /* ---------- paneles ---------- */
  function more(text, expanded, action, key) {
    const b = el('button', text, 'cam-ns-link cam-st-more', { type: 'button', 'aria-expanded': String(expanded), 'data-cam-st-focus': key || null });
    b.addEventListener('click', action);
    return b;
  }
  function note(text, className) { return el('p', text, 'cam-st-note' + (className ? ' ' + className : '')); }

  function nflTable(o, data, st, rebuild) {
    const panel = document.createDocumentFragment();
    const confs = Array.isArray(data?.conferences) ? data.conferences : [];
    const conf = confs.find(c => c.name === st.conf) || confs[0];
    const group = el('div', null, 'cam-st-seg', { role: 'group', 'aria-label': 'Conferencia' });
    for (const c of confs) {
      const b = el('button', c.name, 'cam-st-seg-btn', { type: 'button', 'aria-pressed': String(c === conf), 'data-cam-st-focus': o.sport + ':conf:' + c.name });
      b.addEventListener('click', () => { st.conf = c.name; rebuild(); });
      group.append(b);
    }
    panel.append(group);
    for (const d of conf?.divisions || []) {
      const box = el('div', null, 'cam-st-group');
      const head = el('div', null, 'cam-st-row cam-st-head');
      head.append(el('span', divisionName(d.name), 'cam-st-group-name'), el('span', 'G-P', 'cam-st-num cam-st-w52'), el('span', 'DIF', 'cam-st-num cam-st-w40'));
      box.append(head);
      const list = el('ol', null, 'cam-st-list');
      for (const t of d.teams || []) {
        const info = o.team ? o.team(t.id) : null;
        const row = el('li', null, 'cam-st-row cam-st-team');
        const name = el('span', null, 'cam-st-name');
        name.append(el('span', info?.nick || t.id, 'cam-st-name-text'));
        if (Number(t.seed) >= 1 && Number(t.seed) <= 7) name.append(el('span', 'n.º ' + t.seed, 'cam-st-seed', { title: 'Puesto de playoff' }));
        const diff = Number(t.diff) || 0;
        row.append(crest(t.id, info?.logo, 26), name,
          el('span', record(t), 'cam-st-num cam-st-w52 cam-st-strong'),
          el('span', signed(diff), 'cam-st-num cam-st-w40 ' + (diff > 0 ? 'is-up' : diff < 0 ? 'is-down' : '')));
        row.setAttribute('aria-label', (info?.name || t.id) + ': ' + record(t) + (t.seed <= 7 ? ', puesto ' + t.seed + ' de playoff' : ''));
        list.append(row);
      }
      box.append(list);
      panel.append(box);
    }
    panel.append(note('«n.º» es su puesto de playoff hoy: entran los 7 primeros de cada conferencia.'));
    return panel;
  }

  function soccerTable(o, data, st, rebuild) {
    const panel = document.createDocumentFragment();
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const shown = st.tableAll ? rows : rows.slice(0, 10);
    const head = el('div', null, 'cam-st-row cam-st-head cam-st-soccer');
    head.append(el('span', null, 'cam-st-zone'), el('span', '#', 'cam-st-num cam-st-w20'), el('span', 'Equipo', 'cam-st-group-name cam-st-team-head'),
      el('span', 'PJ', 'cam-st-num cam-st-w26'), el('span', 'DG', 'cam-st-num cam-st-w34'), el('span', 'Pts', 'cam-st-num cam-st-w30'));
    panel.append(head);
    const list = el('ol', null, 'cam-st-list');
    let prev = null;
    const seen = new Set();
    for (const r of shown) {
      const zone = zoneOf(o.competition, r);
      if (zone) seen.add(zone);
      const row = el('li', null, 'cam-st-row cam-st-team cam-st-soccer' + (prev !== null && zone !== prev ? ' is-cut' : ''));
      prev = zone;
      const z = el('span', null, 'cam-st-zone' + (zone ? ' is-' + zone : ''), { 'aria-hidden': 'true' });
      const name = el('span', null, 'cam-st-name');
      name.append(el('span', r.name, 'cam-st-name-text'));
      row.append(z, el('span', r.rank, 'cam-st-num cam-st-w20 cam-st-rank'), crest(r.abbr || '', r.logo, 22), name,
        el('span', r.played, 'cam-st-num cam-st-w26'), el('span', signed(Number(r.gd) || 0), 'cam-st-num cam-st-w34'),
        el('span', r.pts, 'cam-st-num cam-st-w30 cam-st-strong'));
      row.setAttribute('aria-label', r.rank + '.º ' + r.name + ': ' + r.pts + ' puntos en ' + r.played + ' partidos' + (zone ? ' (' + (ZONES[o.competition]?.[zone] || '') + ')' : ''));
      list.append(row);
    }
    panel.append(list);
    if (rows.length > 10) {
      panel.append(more(st.tableAll ? 'Ver menos' : 'Ver los ' + rows.length + ' equipos ›', st.tableAll, () => { st.tableAll = !st.tableAll; rebuild(o.sport + ':more:tabla'); }, o.sport + ':more:tabla'));
    }
    const labels = ZONES[o.competition] || {};
    for (const r of rows) { const z = zoneOf(o.competition, r); if (z) seen.add(z); }
    const legend = el('ul', null, 'cam-st-legend');
    for (const z of ['z1', 'z2', 'z3', 'z4']) {
      if (!seen.has(z) || !labels[z]) continue;
      const item = el('li', null, 'cam-st-legend-item');
      item.append(el('span', null, 'cam-st-zone is-' + z, { 'aria-hidden': 'true' }), document.createTextNode(labels[z]));
      legend.append(item);
    }
    if (legend.childNodes.length) panel.append(legend);
    return panel;
  }

  function scorers(o, list, st, rebuild) {
    const panel = document.createDocumentFragment();
    const nfl = o.sport === 'nfl';
    const all = ranked(list || [], p => Number(nfl ? p.td : p.goals)).filter(x => x.rank <= 10);
    const shown = st.scorersAll ? all : all.slice(0, 5);
    if (nfl) panel.append(note('Touchdowns totales: de carrera, de recepción y de retorno.', 'is-intro'));
    const ol = el('ol', null, 'cam-st-list');
    for (const { item: p, rank } of shown) {
      const row = el('li', null, 'cam-st-player');
      const who = el('span', null, 'cam-st-who');
      who.append(el('span', p.name, 'cam-st-player-name'));
      const sub = el('span', null, 'cam-st-player-sub');
      if (nfl) {
        const info = o.team ? o.team(p.team) : null;
        const how = [[p.rush, 'de carrera'], [p.rec, 'de recepción'], [p.ret, 'de retorno']]
          .filter(([n]) => Number(n) > 0).map(([n, t]) => n + ' ' + t).join(', ');
        sub.append(crest(p.team || '', info?.logo, 16), document.createTextNode([info?.nick || p.team, p.pos, how].filter(Boolean).join(' · ')));
      } else {
        const team = o.teamRow ? o.teamRow(p.team_id) : null;
        const games = Number(p.apps);
        sub.append(crest(team?.abbr || '', team?.logo, 16),
          document.createTextNode((team?.name || p.team || '') + (games ? ' · ' + games + (games === 1 ? ' partido' : ' partidos') : '')));
      }
      who.append(sub);
      const value = Number(nfl ? p.td : p.goals);
      const total = el('span', null, 'cam-st-total');
      total.append(el('span', value, 'cam-st-total-value'), el('span', nfl ? 'TD' : (value === 1 ? 'GOL' : 'GOLES'), 'cam-st-total-unit'));
      row.append(el('span', rank, 'cam-st-player-rank' + (rank <= 3 ? ' is-top' : '')), who, total);
      ol.append(row);
    }
    panel.append(ol);
    if (all.length > 5) panel.append(more(st.scorersAll ? 'Ver menos' : 'Ver el top 10 ›', st.scorersAll, () => { st.scorersAll = !st.scorersAll; rebuild(o.sport + ':more:anotadores'); }, o.sport + ':more:anotadores'));
    return panel;
  }

  /* ---------- el menú ---------- */
  /* o: { sport: 'nfl'|'futbol', competition, league (nombre corto), label (nombre completo),
          score: { title, teaser, content: Node | null },
          team(id) → { name, nick, logo } (NFL), rebuild() } */
  function menu(o) {
    const st = state.get(o.sport) || { open: 'marcador', conf: null, tableAll: false, scorersAll: false, competition: o.competition };
    state.set(o.sport, st);
    // Otra liga: las listas vuelven a su tamaño corto.
    if (st.competition !== o.competition) { st.competition = o.competition; st.tableAll = false; st.scorersAll = false; }
    const e = entry(o.competition);
    const data = e?.data || null;
    const nfl = o.sport === 'nfl';
    const table = data?.standings || null;
    const leaders = Array.isArray(data?.leaders) ? data.leaders : null;
    const tableRows = nfl ? (table?.conferences || []).length : (table?.rows || []).length;
    if (!nfl) o.teamRow = id => (table?.rows || []).find(r => String(r.team_id) === String(id)) || null;
    const pending = !e || e.status === 'loading';
    const failed = e?.status === 'error' && !data;
    // Sin la migración o sin datos de la competición, solo El marcador (como antes).
    const hideData = e?.status === 'missing' || (e?.status === 'ready' && !tableRows && !leaders?.length);

    const rebuild = key => { if (key) focusKey = key; o.rebuild(); };
    const items = [];
    if (o.score?.content) items.push({ key: 'marcador', title: o.score.title, teaser: o.score.teaser, icon: ICONS.marcador, block: 'marcador', body: () => o.score.content });
    if (!hideData) {
      const tableTeaser = () => {
        if (pending) return 'Cargando…';
        if (failed || !tableRows) return 'No disponible ahora mismo';
        if (nfl) {
          const teams = (table.conferences || []).flatMap(c => (c.divisions || []).flatMap(d => d.teams || []));
          const pct = t => (t.w + t.t / 2) / Math.max(1, t.w + t.l + t.t);
          const best = Math.max(...teams.map(pct));
          const top = teams.filter(t => pct(t) === best);
          const names = top.slice(0, 3).map(t => o.team?.(t.id)?.nick || t.id);
          return 'Mejor récord: ' + joinNames(names) + (top.length > 3 ? ' y otros' : '') + ' (' + record(top[0]) + ')';
        }
        const lead = table.rows[0];
        return 'Líder: ' + lead.name + ' · ' + lead.pts + ' pts';
      };
      const scorersTeaser = () => {
        if (pending) return 'Cargando…';
        if (failed || !leaders?.length) return 'No disponible ahora mismo';
        const top = leaders[0];
        const value = p => Number(nfl ? p.td : p.goals);
        const tied = leaders.filter(p => value(p) === value(top));
        const unit = nfl ? (value(top) === 1 ? ' touchdown' : ' touchdowns') : (value(top) === 1 ? ' gol' : ' goles');
        if (tied.length === 1) return top.name + ' lidera con ' + value(top) + unit;
        if (tied.length <= 3) return joinNames(tied.map(p => surname(p.name))) + ', ' + value(top) + unit;
        return tied.length + ' jugadores con ' + value(top) + unit;
      };
      const source = iso => note('Datos de ESPN' + (updated(iso) ? ' · ' + updated(iso) : ''), 'is-source');
      const emptyPanel = () => {
        const f = document.createDocumentFragment();
        if (pending) f.append(note('Cargando…', 'is-loading'));
        else {
          f.append(note('No se pudo cargar ahora mismo.', 'is-error'));
          const retry = more('Reintentar', false, () => { focusKey = o.sport + ':retry'; void load(o.competition, true); o.rebuild(); });
          retry.removeAttribute('aria-expanded');
          retry.setAttribute('data-cam-st-focus', o.sport + ':retry');
          f.append(retry);
        }
        return f;
      };
      items.push({
        key: 'tabla', title: nfl ? 'Clasificación NFL' : 'Clasificación · ' + o.league, teaser: tableTeaser(), icon: ICONS.tabla, block: 'clasificacion',
        body: () => {
          if (!tableRows) return emptyPanel();
          const f = document.createDocumentFragment();
          if (!nfl && intro(o.competition, table)) f.append(note(intro(o.competition, table), 'is-intro'));
          f.append(nfl ? nflTable(o, table, st, rebuild) : soccerTable(o, table, st, rebuild), source(data.standings_at));
          return f;
        }
      });
      items.push({
        key: 'anotadores', title: nfl ? 'Mejores anotadores' : 'Goleadores', teaser: scorersTeaser(), icon: nfl ? ICONS.nfl : ICONS.futbol, block: 'anotadores',
        body: () => {
          if (!leaders?.length) return emptyPanel();
          const f = document.createDocumentFragment();
          f.append(scorers(o, leaders, st, rebuild), source(data.leaders_at));
          return f;
        }
      });
    }
    if (!items.length) return null;
    if (!items.some(i => i.key === st.open) && st.open !== 'ninguno') st.open = items[0].key;

    const root = el('section', null, 'cam-ns-block cam-st-menu', {
      'data-block': 'marcador-menu', 'data-sport': o.sport, 'data-competition': o.competition,
      'aria-label': nfl ? 'El marcador, la clasificación y los mejores anotadores de la NFL'
        : 'El marcador, la clasificación y los goleadores de ' + o.label
    });
    for (const it of items) {
      const open = st.open === it.key;
      const id = 'camSt-' + o.sport + '-' + it.key;
      const box = el('div', null, 'cam-st-item' + (open ? ' is-open' : ''), { 'data-block': it.block, 'data-key': it.key });
      const head = el('h3', null, 'cam-st-heading');
      const btn = el('button', null, 'cam-st-toggle', { type: 'button', 'aria-expanded': String(open), 'aria-controls': id, 'data-cam-st-focus': o.sport + ':toggle:' + it.key });
      const icon = el('span', null, 'cam-st-icon', { 'aria-hidden': 'true' });
      icon.append(svg(it.icon));
      const text = el('span', null, 'cam-st-text');
      text.append(el('span', it.title, 'cam-st-title'), el('span', it.teaser, 'cam-st-teaser'));
      btn.append(icon, text, el('span', null, 'cam-st-chevron', { 'aria-hidden': 'true' }));
      head.append(btn);
      const panel = el('div', null, 'cam-st-panel', { id, role: 'region', 'aria-label': it.title });
      panel.hidden = !open;
      if (open) panel.append(it.body());
      let filled = open;
      btn.addEventListener('click', () => {
        const next = st.open === it.key ? 'ninguno' : it.key;
        st.open = next;
        // Abrir y cerrar sin repintar La semana: el foco sigue en el botón.
        for (const other of root.querySelectorAll(':scope > .cam-st-item')) {
          const on = other.dataset.key === next;
          other.classList.toggle('is-open', on);
          other.querySelector('.cam-st-toggle')?.setAttribute('aria-expanded', String(on));
          const p = other.querySelector(':scope > .cam-st-panel');
          if (p) p.hidden = !on;
        }
        if (next === it.key && !filled) { panel.append(it.body()); filled = true; }
        if (next === it.key) requestAnimationFrame(() => {
          const r = box.getBoundingClientRect();
          if (r.top < 0 || r.top > innerHeight - 120) { try { box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {} }
        });
        focusKey = o.sport + ':toggle:' + it.key;
      });
      box.append(head, panel);
      root.append(box);
    }
    if (!e || (e.status === 'ready' && Date.now() - e.at > STALE)) watch(root, o.competition);
    // Al repintar (datos nuevos), el foco vuelve al mismo control si se había perdido.
    if (focusKey) requestAnimationFrame(() => {
      const key = focusKey;
      if (!root.isConnected || (document.activeElement && document.activeElement !== document.body)) return;
      root.querySelector('[data-cam-st-focus="' + CSS.escape(key) + '"]')?.focus({ preventScroll: true });
    });
    return root;
  }

  document.addEventListener('focusin', event => {
    const target = event.target?.closest?.('[data-cam-st-focus]');
    if (target) focusKey = target.getAttribute('data-cam-st-focus');
  });
  // Al volver a la pestaña después de un buen rato, la copia se renueva al repintar.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    for (const [competition, e] of cache) if (e.status === 'ready' && Date.now() - e.at > STALE) {
      e.at = 0;
      document.dispatchEvent(new CustomEvent('cam:sport-tables', { detail: { competition, stale: true } }));
    }
  });

  window.camSportTables = Object.freeze({ menu, load, entry, _zoneOf: zoneOf, _ranked: ranked });
})();
