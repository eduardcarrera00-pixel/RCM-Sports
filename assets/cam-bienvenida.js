/* CAM SPORTS — Bienvenida y tarjetas de sección (18 nov 2026, pedido de Eduard).

   Bienvenida (la primera vez que alguien entra por Inicio): una hoja que sube
   desde abajo con tres pasos. El centro de CAM Sports son los Takes:
     1. «Tú lo viste primero. Que quede escrito.» (qué es un Take, con un ejemplo);
     2. dónde se juega: NFL, Fútbol y Picks;
     3. el camino de rangos, de Cobre a Leyenda CAM.
   El último botón abre «Publicar mi primer Take».
     · Una sola vez por teléfono/navegador (localStorage `cam_intro_seen_v1`).
     · No sale a quien ya tiene la sesión iniciada, ni a quien llega desde un
       enlace a algo concreto (?s=nfl, una noticia, un Take…): llegó buscando algo.

   Tarjetas de sección (NFL, Fútbol, Picks y Actualidad): la primera vez que se
   abre cada sección, una tarjeta más corta con lo que hay dentro y un botón a
   lo que más engancha. En NFL y Fútbol, si hay datos reales: cuánto falta para
   que cierre el próximo partido de la quiniela y (NFL) con quién va el editor.
   Una «i» pequeña al final de las pestañas de la sección vuelve a abrirla.

   Calma: sale 0,9 s después de que se vaya la pantalla de carga y solo si la
   persona no está tocando, bajando la página o escribiendo; si en 10 s no hubo
   un momento de calma, se queda para otra visita. Nunca encima de otra ventana
   ni del aviso de «desliza» (este espera a que se cierre la tarjeta: evento
   `cam:intro`). Se cierra con la ×, tocando fuera, deslizándola hacia abajo,
   con Escape o con el botón secundario. «Reducir movimiento»: sin animaciones.

   Medición: cuántas visitas la ven, tocan el botón o la cierran
   (camAnalytics.trackIntro → cam_track_intro, sin IP ni cookies).

   Los navegadores automáticos (pruebas, rastreadores) no la ven salir sola;
   las pruebas la activan con window.__camIntroTest = true. */
(() => {
  'use strict';
  if (window.camIntro) return;

  const UA = navigator.userAgent || '';
  const AUTOMATED = navigator.webdriver === true ||
    /HeadlessChrome|Lighthouse|PhantomJS|Googlebot|bingbot|crawler|spider|\bbot\b/i.test(UA);
  const AUTO = !AUTOMATED || window.__camIntroTest === true;

  const SEEN_KEY = 'cam_intro_seen_v1';      // { bienvenida: fecha, nfl: fecha, … }
  const IDLE = 900;                          // ms de calma antes de salir
  const WINDOW = 10000;                      // ms buscando ese momento de calma
  const OUT_MS = 200;
  const CARD_OF = { NFL: 'nfl', 'Fútbol': 'futbol', Picks: 'picks', Opiniones: 'actualidad' };
  const LABEL = { nfl: 'NFL', futbol: 'Fútbol', picks: 'Picks', actualidad: 'Actualidad' };
  const TZ = 'America/Toronto';

  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(motion && motion.matches);
  const now = () => Date.now();
  const $ = id => document.getElementById(id);

  // ---------- Guardado (sin nada en el servidor) ----------
  let memSeen = {};
  function seenMap() {
    try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); if (v && typeof v === 'object') return v; } catch {}
    return memSeen;
  }
  const seen = card => Boolean(seenMap()[card]);
  function mark(card) {
    const map = { ...seenMap(), [card]: new Date().toISOString().slice(0, 10) };
    memSeen = map;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)); } catch {}
  }
  const track = (card, action) => { try { window.camAnalytics?.trackIntro?.(card, action); } catch {} };

  // ---------- Dónde está la persona ----------
  const category = () => { try { return typeof currentCategory === 'string' ? currentCategory : 'Todos'; } catch { return 'Todos'; } };
  const searching = () => { try { return typeof currentSearchQuery === 'string' && currentSearchQuery.trim() !== ''; } catch { return false; } };
  function area() {
    if (searching()) return '';
    const cat = category();
    return cat === 'Todos' ? 'inicio' : (CARD_OF[cat] || '');
  }
  // ¿Entró por la portada, sin un enlace a algo concreto? (las marcas de campaña no cuentan)
  const landedHome = (() => {
    try {
      const url = new URL(location.href);
      if (url.hash.length > 1) return false;
      for (const key of url.searchParams.keys()) {
        if (!/^(utm_[a-z_]+|fbclid|gclid|igshid|ttclid|twclid|si|ref|mc_[a-z_]+)$/i.test(key)) return false;
      }
      return true;
    } catch { return false; }
  })();
  let welcomeEligible = landedHome && !seen('bienvenida');

  // Sesión: quien ya tiene cuenta no necesita la bienvenida.
  let signedIn = null;
  (async () => {
    try {
      const client = typeof db !== 'undefined' ? db : window.db;
      const r = await client?.auth?.getSession?.();
      signedIn = Boolean(r?.data?.session?.user);
    } catch { signedIn = false; }
  })();

  function loading() {
    if (document.documentElement.classList.contains('cam-booting')) return true;
    const loader = $('camPageLoader');
    return Boolean(loader && getComputedStyle(loader).display !== 'none');
  }
  function typing() {
    const a = document.activeElement;
    if (!a || a === document.body) return false;
    if (a.isContentEditable || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
    return a.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(a.type || '');
  }
  function otherWindowOpen() {
    if (document.querySelector('dialog[open]:not(#camIntro)')) return true;
    for (const id of ['userAuthModal', 'publishModal', 'articleModal', 'aeArticlePhotoModal']) {
      const m = $(id);
      if (m && !m.classList.contains('hidden') && !m.hidden && m.getClientRects().length) return true;
    }
    return false;
  }
  function blocked() {
    return document.hidden || loading() || otherWindowOpen() || typing() ||
      Boolean(window.camSectionSwipe?.hinting?.()) ||
      Boolean(window.visualViewport && window.visualViewport.scale > 1.02);
  }

  // ---------- Iconos (mismo trazo que los de la navegación: 1,55, puntas redondas) ----------
  const ICON = {
    take: '<path d="M4 5.5h16v10.5H10.5L5.5 20v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    week: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    news: '<path d="M5 4.5h11v15H6.5A1.5 1.5 0 0 1 5 18z"/><path d="M16 8.5h3v9.5a1.5 1.5 0 0 1-3 0M8 8.5h5M8 12h5M8 15.5h3"/>',
    cup: '<path d="M7.5 4.5h9v4.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6.5H5a2.5 2.5 0 0 0 2.6 3M16.5 6.5H19a2.5 2.5 0 0 1-2.6 3M12 13.5v3.5M8.5 19.5h7"/>',
    camera: '<path d="M4 8.5h3.2l1.8-2.5h6l1.8 2.5H20v10H4z"/><circle cx="12" cy="13" r="3.3"/>',
    plate: '<circle cx="12" cy="12.5" r="4.8"/><circle cx="12" cy="12.5" r="2.4"/><path d="M4 4.5v4a1.5 1.5 0 0 0 3 0v-4M5.5 4.5v15M20 4.5c-1.5 1-2.3 3-2.3 6.3H20v8.7"/>',
    chef: '<path d="M7.5 15.5V12.6A3.8 3.8 0 1 1 9.4 5.6a3.8 3.8 0 0 1 5.2 0 3.8 3.8 0 1 1 1.9 7v2.9z"/><path d="M7.5 19.5h9v-4h-9zM10.5 15.5v-2.5M13.5 15.5v-2.5"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.3 2.8-5.2 5.5-5.2s4.9 1.9 5.5 5.2"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M15.5 14c2.6-.2 4.5 1.5 5 4.5"/>',
    pen: '<path d="M4.5 19.5h4L19 9l-4-4L4.5 15.5z"/><path d="M13.5 6.5l4 4"/>',
    flame: '<path d="M12 3.5c.6 3-2.8 4.6-2.8 8.2a2.8 2.8 0 0 0 5.6 0c0-1.1-.4-2-.9-2.7 2.3.9 4.1 3.3 4.1 6A6 6 0 0 1 6 15c0-5 6-6.6 6-11.5z"/>',
    vote: '<path d="M12 4.5 5.5 12h4v7.5h5V12h4z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none"/>'
  };
  const NAV = { nfl: 'NFL', futbol: 'Fútbol', picks: 'Picks', actualidad: 'Opiniones' };
  function svg(name) {
    // Los de NFL, Fútbol, Picks y Actualidad son los mismos de la barra de navegación.
    if (NAV[name]) {
      const original = document.querySelector('.category-btn[data-category="' + NAV[name] + '"] svg');
      if (original) {
        const copy = original.cloneNode(true);
        copy.removeAttribute('class');
        copy.setAttribute('aria-hidden', 'true');
        copy.setAttribute('focusable', 'false');
        return copy;
      }
      name = name === 'actualidad' ? 'take' : 'target';
    }
    const box = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    box.setAttribute('viewBox', '0 0 24 24');
    box.setAttribute('fill', 'none');
    box.setAttribute('stroke', 'currentColor');
    box.setAttribute('stroke-width', '1.55');
    box.setAttribute('stroke-linecap', 'round');
    box.setAttribute('stroke-linejoin', 'round');
    box.setAttribute('aria-hidden', 'true');
    box.setAttribute('focusable', 'false');
    box.innerHTML = ICON[name] || '';
    return box;
  }
  function el(tag, text, className, attrs) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
    return node;
  }
  function row(icon, label, text) {
    const item = el('li', null, 'cam-intro-row');
    const ico = el('span', null, 'cam-intro-ico');
    ico.append(svg(icon));
    const copy = el('p', null, 'cam-intro-row-text');
    copy.append(el('strong', label), document.createTextNode(' ' + text));
    item.append(ico, copy);
    return item;
  }
  function rows(list) {
    const ul = el('ul', null, 'cam-intro-rows');
    for (const r of list) ul.append(row(...r));
    return ul;
  }
  function hook(icon, text) {
    const p = el('div', null, 'cam-intro-hook');   // div: las <p> de la web van sin esquinas
    const ico = el('span', null, 'cam-intro-hook-ico');
    ico.append(svg(icon));
    p.append(ico, el('span', text));
    return p;
  }

  // ---------- Datos reales para los ganchos ----------
  function closesIn(iso) {
    const ms = Date.parse(iso) - now();
    if (!(ms > 0)) return null;
    const m = Math.max(1, Math.round(ms / 6e4)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    const nb = '\u00a0';   // «1 d 2 h» no se parte en dos líneas
    if (d >= 1) return d + nb + 'd' + (h ? nb + h + nb + 'h' : '');
    if (h >= 1) return h + nb + 'h' + (m % 60 ? nb + (m % 60) + nb + 'min' : '');
    return m + nb + 'min';
  }
  function nextOpen(api) {
    try {
      const snap = api?.snapshot?.();
      if (!snap || !snap.loaded || typeof api.isOpen !== 'function') return null;
      const open = (snap.games || []).filter(g => api.isOpen(g)).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
      return open.length ? { snap, open } : null;
    } catch { return null; }
  }
  function countdown(sport) {
    const found = nextOpen(sport === 'nfl' ? window.camNflQuiniela : window.camFootballQuiniela);
    if (!found) return null;
    const left = closesIn(found.open[0].kickoff);
    if (!left) return null;
    const where = sport === 'nfl' ? 'la NFL' : (found.snap.competitionName || 'la jornada');
    return 'Quedan ' + left + ' para elegir el próximo partido de ' + where + '.';
  }
  const nflTeam = id => {
    try { return window.CamNFLQuinielaTeams?.getTeam?.(id) || (typeof NFL_TEAMS !== 'undefined' ? NFL_TEAMS.find(t => t.id === id) : null) || null; }
    catch { return null; }
  };
  const nick = id => { const words = String(nflTeam(id)?.name || id).trim().split(/\s+/); return words[words.length - 1] || id; };
  // «El editor va con los Chiefs contra los Bills. ¿Y tú?» — solo con un partido
  // abierto en el que el editor ya eligió (si no, la línea no sale).
  function editorChallenge() {
    const found = nextOpen(window.camNflQuiniela);
    const picks = found?.snap?.expert?.picks;
    if (!found || !(picks instanceof Map) || !picks.size) return null;
    const withPick = found.open.filter(g => picks.has(g.id));
    if (!withPick.length) return null;
    let game = withPick[0];
    try {
      const ranking = typeof rankingPublished !== 'undefined' && Array.isArray(rankingPublished?.team_ids) ? rankingPublished.team_ids : [];
      const week = found.snap.games.filter(g => Number(g.season) === Number(found.snap.season) && Number(g.week) === Number(game.week));
      const duel = window.camNflSemana?._choose?.(week, ranking);
      if (duel && picks.has(duel.id) && withPick.some(g => g.id === duel.id)) game = duel;
    } catch {}
    const team = picks.get(game.id);
    const other = team === game.home_id ? game.away_id : game.home_id;
    if (!team || !other) return null;
    return 'El editor va con los ' + nick(team) + ' contra los ' + nick(other) + '. ¿Y tú?';
  }
  function liguillaPhase() {
    try {
      const ev = window.camHomeJornada?._state?.()?.ev;
      if (ev?.cand) return 'mis8';
      if (ev?.state) return 'cuadro';
    } catch {}
    return '';
  }

  // ---------- Acciones de los botones ----------
  function goTab(tab) {
    try { window.camSectionTabs?.select?.(tab); } catch {}
  }
  function openQualifiers() {
    let tries = 0;
    const step = () => {
      const lg = $('camLiguilla');
      const picker = lg && !lg.hidden ? lg.querySelector('details.cam-lg-qualifiers') : null;
      if (!picker) { if (++tries < 40) setTimeout(step, 100); return; }
      if (!picker.open) picker.open = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try { window.scrollTo({ top: Math.max(0, picker.getBoundingClientRect().top + window.scrollY - 76), behavior: 'auto' }); } catch {}
      }));
    };
    setTimeout(step, 60);
  }

  // ---------- Contenido ----------
  const WELCOME_STEPS = 3;
  function welcome(step) {
    if (step === 0) {
      const body = document.createDocumentFragment();
      body.append(el('p', 'Comparte tus Takes: esa opinión que hoy nadie te cree. La comunidad vota y, si se cumple, sumas puntos. Cuanto más atrevido, más vale.', 'cam-intro-text'));
      const sample = el('figure', null, 'cam-intro-take', { 'aria-label': 'Ejemplo de Take: Gilberto Mora será Balón de Oro en 2030' });
      const tag = el('span', null, 'cam-intro-take-tag', { 'aria-hidden': 'true' });
      tag.append(svg('take'), el('span', 'Tu Take · Fútbol'));
      const quote = el('blockquote', 'Gilberto Mora será Balón de Oro en 2030', null, { 'aria-hidden': 'true' });
      const votes = el('figcaption', null, 'cam-intro-take-votes', { 'aria-hidden': 'true' });
      const up = el('span', null, 'is-up'); up.append(svg('vote'), el('span', 'Apoyar'));
      const down = el('span', null, 'is-down'); down.append(svg('vote'), el('span', 'Cuestionar'));
      votes.append(up, down);
      sample.append(tag, quote, votes);
      body.append(sample);
      return { kicker: 'Bienvenido a CAM Sports', title: 'Tú lo viste primero. Que quede escrito.', body,
        primary: ['Ver cómo funciona', () => showStep(1)], secondary: ['Explorar por mi cuenta', () => close('cerrada')] };
    }
    if (step === 1) {
      return { kicker: 'Dónde se juega', title: 'Cada deporte, su conversación', body: rows([
        ['nfl', 'NFL.', 'Takes, la quiniela de cada semana y el reto al editor.'],
        ['futbol', 'Fútbol.', 'Takes y quiniela de Liga MX, LaLiga, Premier y Champions.'],
        ['picks', 'Picks.', 'Sube la captura de tu apuesta antes del partido y mira si pega.']
      ]), primary: ['Siguiente', () => showStep(2)], secondary: ['Saltar', () => close('cerrada')] };
    }
    const body = document.createDocumentFragment();
    const levels = window.CamLeagues?.levels || ['Cobre', 'Bronce', 'Plata', 'Oro', 'Platino', 'Diamante', 'Leyenda CAM'];
    const ranks = el('div', null, 'cam-intro-ranks', { role: 'img', 'aria-label': 'Rangos, de menor a mayor: ' + levels.slice(0, -1).join(', ') + ' y ' + levels[levels.length - 1] });
    const line = el('div', null, 'cam-intro-ranks-line', { 'aria-hidden': 'true' });
    levels.forEach((name, i) => {
      const slot = el('span', null, 'cam-intro-rank');
      const crest = typeof window.CamLeagues?.emblem === 'function' ? window.CamLeagues.emblem(i) : el('span', name.charAt(0), 'cam-intro-rank-letter');
      slot.append(crest);
      line.append(slot);
    });
    const ends = el('div', null, 'cam-intro-ranks-ends', { 'aria-hidden': 'true' });
    ends.append(el('span', levels[0]), el('span', levels[levels.length - 1]));
    ranks.append(line, ends);
    body.append(ranks, el('p', 'Tus aciertos en las quinielas y en los Picks te suben de rango cada mes. ¿Hasta dónde llegas?', 'cam-intro-text'));
    return { kicker: 'Tu camino', title: 'Todos empiezan en Cobre. Pocos llegan a Leyenda.', body,
      primary: ['Publicar mi primer Take', () => close('boton', () => window.aeOpenTakeComposer?.())],
      secondary: ['Primero quiero mirar', () => close('cerrada')] };
  }

  function sectionCard(card) {
    if (card === 'nfl') {
      const body = document.createDocumentFragment();
      body.append(rows([
        ['take', 'Takes.', 'Suelta tu opinión; si se cumple, suma.'],
        ['week', 'La semana.', 'Elige ganadores en la quiniela y reta al editor.'],
        ['news', 'Noticias.', 'Lo último de la NFL y los Power Rankings de CAM.']
      ]));
      const left = countdown('nfl'), dare = editorChallenge();
      if (dare) body.append(hook('target', dare));
      if (left) body.append(hook('clock', left));
      return { kicker: 'NFL', title: 'La NFL, semana a semana', body,
        primary: ['¿Le ganas al editor?', () => close('boton', () => goTab('semana'))], secondary: ['Ahora no', () => close('cerrada')] };
    }
    if (card === 'futbol') {
      const phase = liguillaPhase();
      const body = document.createDocumentFragment();
      body.append(rows([
        ['take', 'Takes.', 'Lo que tú ves y los demás todavía no.'],
        ['week', 'La semana.', 'La quiniela de cada jornada, liga por liga.'],
        phase === 'mis8' ? ['cup', 'Liguilla.', 'Elige a los 8 que crees que clasificarán en la Liga MX.']
          : phase === 'cuadro' ? ['cup', 'Liguilla.', 'Arma tu cuadro de la Liga MX, de cuartos a campeón.']
          : ['news', 'Noticias.', 'Lo último de tus ligas y su Power Ranking.']
      ]));
      const left = countdown('futbol');
      if (left) body.append(hook('clock', left));
      const primary = phase === 'mis8' ? ['Elegir mis 8', () => close('boton', () => { window.camGoLiguilla?.(); openQualifiers(); })]
        : phase === 'cuadro' ? ['Arma tu cuadro', () => close('boton', () => window.camGoLiguilla?.())]
        : ['Ver la jornada', () => close('boton', () => goTab('semana'))];
      return { kicker: 'Fútbol', title: 'Liga MX, LaLiga, Premier y Champions', body, primary, secondary: ['Ahora no', () => close('cerrada')] };
    }
    if (card === 'picks') {
      return { kicker: 'Picks', title: 'Aquí se cocinan los Picks', body: rows([
        ['camera', 'Tu Pick.', 'Sube la captura de tu apuesta antes del partido.'],
        ['plate', 'Si pega,', 'tu plato entra al menú de los mejores.'],
        ['chef', 'Chefs.', 'Compite con tus amigos en la tabla de Chefs.']
      ]), primary: ['Preparar mi primer Pick', () => close('boton', () => window.aeOpenPickComposer?.())],
      secondary: ['Ahora no', () => close('cerrada')] };
    }
    return { kicker: 'Actualidad', title: 'Lo que se dice y lo que se debate', body: rows([
      ['pen', 'Columnas.', 'Lo que escriben los opinadores de CAM.'],
      ['flame', 'Lo más debatido.', 'Las publicaciones que más conversación levantan.'],
      ['vote', 'Tu voz.', 'Comenta y vota: los más apoyados se distinguen.']
    ]), primary: ['Ver lo más debatido', () => close('boton', () => {
      try { $('aeOpinionsDebated')?.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); } catch {}
    })], secondary: ['Ahora no', () => close('cerrada')] };
  }

  // ---------- La ventana ----------
  let dialog = null, ui = null, current = null, closing = false, after = null;
  function build() {
    if (dialog) return dialog;
    dialog = el('dialog', null, 'cam-intro', { id: 'camIntro', 'aria-labelledby': 'camIntroTitle', 'aria-describedby': 'camIntroBody' });
    const sheet = el('div', null, 'cam-intro-sheet');
    const grip = el('span', null, 'cam-intro-grip', { 'aria-hidden': 'true' });
    const head = el('div', null, 'cam-intro-head');
    const kicker = el('p', null, 'cam-intro-kicker');
    const x = el('button', null, 'cam-intro-close', { type: 'button', 'aria-label': 'Cerrar' });
    x.append(svg('close'));
    x.addEventListener('click', () => close('cerrada'));
    head.append(kicker, x);
    const content = el('div', null, 'cam-intro-content');
    const title = el('h2', null, 'cam-intro-title', { id: 'camIntroTitle', tabindex: '-1' });
    const body = el('div', null, 'cam-intro-body', { id: 'camIntroBody' });
    content.append(title, body);
    const dots = el('div', null, 'cam-intro-dots', { 'aria-hidden': 'true' });
    const step = el('p', null, 'cam-intro-sr', { 'aria-live': 'polite' });
    const actions = el('div', null, 'cam-intro-actions');
    const primary = el('button', null, 'cam-intro-primary', { type: 'button' });
    const secondary = el('button', null, 'cam-intro-secondary', { type: 'button' });
    primary.addEventListener('click', () => ui.primaryRun?.());
    secondary.addEventListener('click', () => ui.secondaryRun?.());
    actions.append(primary, secondary);
    sheet.append(grip, head, content, dots, step, actions);
    dialog.append(sheet);
    document.body.append(dialog);
    ui = { sheet, kicker, title, body, content, dots, step, primary, secondary, primaryRun: null, secondaryRun: null };

    dialog.addEventListener('cancel', event => { event.preventDefault(); close('cerrada'); });
    // Tocar fuera de la hoja (el fondo oscuro) la cierra; el fondo no se desplaza.
    dialog.addEventListener('click', event => { if (event.target === dialog) close('cerrada'); });
    dialog.addEventListener('touchmove', event => { if (event.target === dialog && event.cancelable) event.preventDefault(); }, { passive: false });
    dialog.addEventListener('keydown', event => {
      if (current?.card !== 'bienvenida' || event.target.closest?.('button')) return;
      if (event.key === 'ArrowRight' && current.step < WELCOME_STEPS - 1) showStep(current.step + 1);
      if (event.key === 'ArrowLeft' && current.step > 0) showStep(current.step - 1);
    });
    bindGestures(sheet);
    return dialog;
  }

  function paint(model, animate) {
    const apply = () => {
      ui.kicker.textContent = model.kicker;
      ui.title.textContent = model.title;
      ui.body.replaceChildren(model.body);
      ui.primary.replaceChildren(el('span', model.primary[0]), el('span', '›', 'cam-intro-chevron', { 'aria-hidden': 'true' }));
      ui.primaryRun = model.primary[1];
      ui.secondary.textContent = model.secondary[0];
      ui.secondaryRun = model.secondary[1];
      const welcomeOn = current.card === 'bienvenida';
      ui.dots.replaceChildren();
      ui.dots.hidden = !welcomeOn;
      if (welcomeOn) for (let i = 0; i < WELCOME_STEPS; i++) ui.dots.append(el('span', null, i === current.step ? 'is-on' : null));
      ui.step.textContent = welcomeOn ? 'Paso ' + (current.step + 1) + ' de ' + WELCOME_STEPS : '';
      dialog.dataset.card = current.card;
      dialog.dataset.step = welcomeOn ? String(current.step) : '';
      ui.sheet.scrollTop = 0;
    };
    if (!animate || reduced()) { apply(); return; }
    ui.content.classList.add('is-turning');
    setTimeout(() => {
      apply();
      ui.content.classList.remove('is-turning');
    }, 140);
  }
  function showStep(step) {
    if (!current || current.card !== 'bienvenida' || closing) return;
    const next = Math.max(0, Math.min(WELCOME_STEPS - 1, step));
    if (next === current.step) return;
    current.step = next;
    if (next > 0) track('bienvenida', 'paso' + (next + 1));
    paint(welcome(next), true);
    if (dialog.contains(document.activeElement) && document.activeElement !== ui.primary) ui.title.focus({ preventScroll: true });
  }

  function open(card, options = {}) {
    if (!card || closing) return false;
    if (dialog?.open) return false;
    build();
    current = { card, step: 0, auto: Boolean(options.auto) };
    paint(card === 'bienvenida' ? welcome(0) : sectionCard(card), false);
    dialog.classList.remove('is-leaving');
    ui.sheet.style.removeProperty('transform');
    ui.sheet.style.removeProperty('transition');
    try { dialog.showModal(); } catch { return false; }
    // El foco va al título (lo lee el lector de pantalla) sin pintar un anillo sobre el botón.
    ui.title.focus({ preventScroll: true });
    if (options.auto) mark(card);
    track(card, options.auto ? 'vista' : 'info');
    document.dispatchEvent(new CustomEvent('cam:intro', { detail: { card, action: 'open', auto: Boolean(options.auto) } }));
    return true;
  }

  function close(reason, then) {
    if (!dialog?.open || closing) return;
    closing = true;
    after = typeof then === 'function' ? then : null;
    const card = current?.card;
    track(card, reason === 'boton' ? 'boton' : 'cerrada');
    const finish = () => {
      try { dialog.close(); } catch {}
      dialog.classList.remove('is-leaving');
      ui.sheet.style.removeProperty('transform');
      ui.sheet.style.removeProperty('transition');
      closing = false;
      current = null;
      document.dispatchEvent(new CustomEvent('cam:intro', { detail: { card, action: 'close', reason } }));
      const run = after;
      after = null;
      if (run) { try { run(); } catch (error) { console.warn('CAM bienvenida:', error); } }
    };
    if (reduced()) { finish(); return; }
    dialog.classList.add('is-leaving');
    setTimeout(finish, OUT_MS);
  }

  // Deslizar la hoja hacia abajo la cierra; de lado, cambia de paso en la bienvenida.
  function bindGestures(sheet) {
    let g = null;
    sheet.addEventListener('touchstart', event => {
      if (event.touches.length !== 1 || closing) { g = null; return; }
      const t = event.touches[0];
      g = { x: t.clientX, y: t.clientY, dx: 0, dy: 0, mode: '' };
    }, { passive: true });
    sheet.addEventListener('touchmove', event => {
      if (!g) return;
      const t = event.touches[0];
      g.dx = t.clientX - g.x; g.dy = t.clientY - g.y;
      if (!g.mode) {
        if (Math.hypot(g.dx, g.dy) < 8) return;
        if (Math.abs(g.dy) > Math.abs(g.dx) && g.dy > 0 && sheet.scrollTop <= 0) g.mode = 'down';
        else if (Math.abs(g.dx) > Math.abs(g.dy) * 1.4 && current?.card === 'bienvenida') g.mode = 'side';
        else g.mode = 'none';
      }
      if (g.mode === 'down') {
        if (event.cancelable) event.preventDefault();
        if (!reduced()) sheet.style.setProperty('transform', 'translate3d(0,' + Math.max(0, g.dy * 0.92).toFixed(1) + 'px,0)');
      } else if (g.mode === 'side' && event.cancelable) event.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!g) return;
      const s = g; g = null;
      if (s.mode === 'down') {
        if (s.dy > 90) { close('cerrada'); return; }
        sheet.style.setProperty('transition', 'transform 200ms cubic-bezier(.2,.8,.2,1)');
        sheet.style.setProperty('transform', 'translate3d(0,0,0)');
        setTimeout(() => { sheet.style.removeProperty('transition'); sheet.style.removeProperty('transform'); }, 220);
      } else if (s.mode === 'side' && Math.abs(s.dx) > 50 && current) {
        showStep(current.step + (s.dx < 0 ? 1 : -1));
      }
    };
    sheet.addEventListener('touchend', end, { passive: true });
    sheet.addEventListener('touchcancel', () => { g = null; sheet.style.removeProperty('transform'); }, { passive: true });
  }

  // ---------- Cuándo sale sola ----------
  let plan = null;   // { kind, area, until, timer }
  function cancelPlan() {
    if (plan?.timer) clearTimeout(plan.timer);
    plan = null;
  }
  // Los 10 s para encontrar un momento de calma cuentan desde que se va la pantalla de carga.
  function arm() {
    if (!plan) return;
    if (!plan.until && !loading()) plan.until = now() + WINDOW;
    clearTimeout(plan.timer);
    plan.timer = setTimeout(tryShow, IDLE);
  }
  function giveUp() {
    if (plan?.kind === 'bienvenida') welcomeEligible = false;   // otra visita
    cancelPlan();
  }
  function consider() {
    if (!AUTO) return;
    const where = area();
    if (where !== 'inicio') welcomeEligible = false;            // la bienvenida es solo al llegar a la portada
    if (plan && plan.area === where) return;
    cancelPlan();
    if (dialog?.open) return;
    let kind = '';
    if (where === 'inicio') kind = welcomeEligible && !seen('bienvenida') ? 'bienvenida' : '';
    else if (where && !seen(where)) kind = where;
    if (!kind) return;
    plan = { kind, area: where, until: 0, timer: 0 };
    arm();
  }
  function tryShow() {
    if (!plan) return;
    plan.timer = 0;
    if (area() !== plan.area) { cancelPlan(); consider(); return; }
    if (loading()) { plan.until = 0; arm(); return; }
    if (plan.kind === 'bienvenida') {
      if (signedIn === null) { if (now() > plan.until) giveUp(); else arm(); return; }
      if (signedIn) { mark('bienvenida'); welcomeEligible = false; cancelPlan(); return; }
    }
    if (blocked()) { if (now() > plan.until) giveUp(); else arm(); return; }
    const kind = plan.kind;
    cancelPlan();
    if (kind === 'bienvenida') welcomeEligible = false;
    open(kind, { auto: true });
  }
  // Tocar, bajar la página o escribir: espera otro momento de calma (hasta 10 s).
  function stir() {
    if (!plan || !plan.timer) return;
    if (plan.until && now() > plan.until) { giveUp(); return; }
    arm();
  }
  for (const type of ['touchstart', 'pointerdown', 'wheel', 'keydown']) {
    window.addEventListener(type, stir, { capture: true, passive: true });
  }
  window.addEventListener('scroll', stir, { passive: true });

  // ---------- La «i» al final de las pestañas de la sección ----------
  function syncInfo() {
    const bar = $('camSectionTabs');
    if (!bar) return;
    const where = area();
    let button = bar.querySelector(':scope > .cam-intro-info');
    if (bar.hidden || !['nfl', 'futbol', 'picks'].includes(where)) { if (button) button.hidden = true; return; }
    if (!button) {
      button = el('button', null, 'cam-intro-info', { type: 'button' });
      button.append(svg('info'));
      button.addEventListener('click', event => {
        event.stopPropagation();
        const card = button.dataset.card;
        if (card) { cancelPlan(); open(card, { auto: false }); }
      });
    }
    if (bar.lastElementChild !== button) bar.append(button);
    button.hidden = false;
    button.dataset.card = where;
    const label = '¿Qué hay en ' + LABEL[where] + '?';
    if (button.getAttribute('aria-label') !== label) { button.setAttribute('aria-label', label); button.title = label; }
  }

  // ---------- Vigilar cambios de sección y la pantalla de carga ----------
  let queued = false;
  const refresh = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; syncInfo(); consider(); });
  };
  function start() {
    new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-cam-tabs', 'data-cam-section'] });
    new MutationObserver(() => { if (plan) arm(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const bar = $('camSectionTabs');
    if (bar) new MutationObserver(refresh).observe(bar, { childList: true, attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('visibilitychange', () => { if (plan && !document.hidden) arm(); });
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.camIntro = Object.freeze({
    open: card => open(card === 'inicio' ? 'bienvenida' : card, { auto: false }),
    close: () => close('cerrada'),
    isOpen: () => Boolean(dialog?.open),
    card: () => current?.card || null,
    step: () => (current ? current.step : null),
    pending: () => (plan ? plan.kind : null),
    seen: card => seen(card)
  });
})();
