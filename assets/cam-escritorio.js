/* CAM SPORTS · Escritorio (8 nov 2026).
   El ordenador tiene las mismas secciones, pestañas y direcciones que el
   teléfono (?s=…&v=…, cam-mobile-sections.js), con una composición pensada
   para pantalla grande:
     · cabecera: Inicio · NFL · Fútbol · Picks · Actualidad · Perfil (los
       mismos botones; Inicio y Perfil son los de la barra del teléfono);
     · sub-barra de pestañas fija bajo la cabecera (la misma #camSectionTabs);
     · ≥ 1280 px: carril de atajos · contenido · carril derecho fijo;
       1024–1279 px: contenido + carril derecho, los atajos arriba;
       761–1023 px: una columna (el carril derecho va al final).
   No copia HTML ni lógica: los atajos son los de «Tu jornada» (se mueven al
   carril y vuelven a su sitio en el teléfono) y el carril derecho muestra lo
   que la página ya cargó (Power Rankings de #rankingList y #championsList).
   Todo vuelve a su sitio al pasar a ≤ 760 px. Sin consultas a Supabase.
   Estilos: cam-escritorio.css (paquete cam-perf-app-panels.css).
   Fases: 1) navegación, rejilla e Inicio; 2) NFL y Fútbol; 3) Picks,
   Actualidad y Perfil (ver la nota escritorio-secciones.md del proyecto). */
(() => {
  'use strict';

  const main = document.getElementById('mainContent');
  const header = document.querySelector('body > header');
  if (!main || !header || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const wide = window.matchMedia('(min-width: 1280px)');
  const medium = window.matchMedia('(min-width: 1024px)');
  const body = document.body;
  const desk = () => !mobile.matches;

  function el(tag, text, className, attrs) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, v);
    return node;
  }
  const shown = node => !!node && node.isConnected && !node.hidden && node.getClientRects().length > 0;
  const category = () => { try { return typeof currentCategory === 'string' ? currentCategory : 'Todos'; } catch { return 'Todos'; } };

  /* ---------- Página actual: 'home', 'nfl:semana', 'futbol:takes', 'picks:chefs', 'opiniones'… ---------- */
  function page() {
    if (body.classList.contains('ae-is-home')) return 'home';
    const now = window.camSectionTabs?.current?.();
    if (now && now.section && now.tab) return now.section + ':' + now.tab;
    if (body.classList.contains('ae-is-opinions')) return 'opiniones';
    return 'otra';
  }

  /* ---------- 1. Cabecera: Inicio y Perfil también en el ordenador ---------- */
  const nav = header.querySelector('nav.ae-sport-nav');
  const home = nav ? nav.querySelector('button.category-btn[data-category="Todos"]') : null;
  function headerLayout() {
    const dock = window.camMobileDock;
    if (!nav || nav.parentNode === body) return; // la barra inferior del teléfono manda
    if (home) {
      if (!home.querySelector('.ae-nav-icon') && dock && dock.homeIcon) home.innerHTML = dock.homeIcon;
      home.hidden = false;
      home.removeAttribute('aria-hidden');
      home.setAttribute('aria-label', 'Inicio');
    }
    const profile = dock && dock.profile;
    if (profile && profile.parentNode !== nav) nav.append(profile);
  }

  /* ---------- 2. Carriles ---------- */
  const rail = el('aside', null, 'cam-desk-rail', { id: 'camDeskRail', 'aria-labelledby': 'camDeskRailTitle' });
  const railIn = el('div', null, 'cam-desk-rail-in');
  railIn.append(el('h2', 'Atajos', 'cam-desk-rail-title', { id: 'camDeskRailTitle' }));
  rail.append(railIn);
  const aside = el('aside', null, 'cam-desk-aside', { id: 'camDeskAside', 'aria-label': 'Destacados' });
  const asideIn = el('div', null, 'cam-desk-aside-in');
  aside.append(asideIn);

  // Atajos: los cuatro de «Tu jornada» (con su número de partidos abiertos) + Mis parties.
  let shortcuts = null;
  let shortcutsHome = null;
  const parties = el('button', null, 'cam-hj-shortcut cam-desk-parties', { type: 'button', 'aria-label': 'Mis parties', 'data-shortcut': 'parties' });
  {
    const icon = el('span', null, 'cam-hj-icon', { 'aria-hidden': 'true' });
    const svg = document.querySelector('#aeProfileTabParty svg');
    if (svg) {
      const copy = svg.cloneNode(true);
      copy.removeAttribute('class');
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('focusable', 'false');
      icon.append(copy);
    }
    parties.append(icon, el('span', 'Mis parties', 'cam-hj-shortcut-label'));
    parties.addEventListener('click', () => {
      const cat = category();
      const sport = cat === 'NFL' ? 'nfl' : cat === 'Fútbol' ? 'football' : 'all';
      window.camParties?.openHub?.(cat === 'Picks' ? 'picks' : undefined, sport);
    });
  }
  function adoptShortcuts() {
    shortcuts = shortcuts || document.querySelector('#camHomeJornada .cam-hj-shortcuts');
    if (!shortcuts) return;
    if (!shortcutsHome) shortcutsHome = { parent: shortcuts.parentNode, next: shortcuts.nextSibling };
    if (shortcuts.parentNode !== railIn) railIn.append(shortcuts);
    if (parties.parentNode !== shortcuts) shortcuts.append(parties);
    // Una línea por atajo en el carril («Quiniela NFL»); en el teléfono van en dos.
    for (const button of shortcuts.querySelectorAll('.cam-hj-shortcut')) {
      const label = button.querySelector('.cam-hj-shortcut-label');
      if (label) button.dataset.deskLabel = [...label.childNodes].map(node => node.nodeName === 'BR' ? ' ' : node.textContent).join('').replace(/\s+/g, ' ').trim();
    }
  }
  function returnShortcuts() {
    parties.remove();
    if (!shortcuts || !shortcutsHome) return;
    for (const button of shortcuts.querySelectorAll('[data-desk-label]')) delete button.dataset.deskLabel;
    if (shortcuts.parentNode !== shortcutsHome.parent) {
      const next = shortcutsHome.next && shortcutsHome.next.parentNode === shortcutsHome.parent ? shortcutsHome.next : null;
      shortcutsHome.parent.insertBefore(shortcuts, next);
    }
  }

  /* ---------- 3. Carril derecho: qué lleva cada página ---------- */
  // Power Rankings compactos (top 5) con las listas que la página ya pintó.
  const rankings = el('section', null, 'cam-desk-panel cam-desk-rankings', { 'aria-labelledby': 'camDeskRankingsTitle' });
  const rankingsList = el('div', null, 'cam-desk-rankings-list');
  rankings.append(el('h2', 'Power Rankings', 'cam-desk-panel-title', { id: 'camDeskRankingsTitle' }), rankingsList);
  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).map(s => s[0]).slice(0, 3).join('').toUpperCase();
  }
  function crest(src, text) {
    const box = el('span', null, 'cam-desk-crest', { 'aria-hidden': 'true' });
    box.append(el('span', text || '?', 'cam-desk-crest-text'));
    if (src) {
      const img = el('img', null, null, { alt: '', decoding: 'async', loading: 'lazy' });
      img.addEventListener('error', () => img.remove());
      img.src = src;
      box.append(img);
    }
    return box;
  }
  function rankingCard(sport, listId, editionId, open) {
    const items = [...(document.getElementById(listId)?.querySelectorAll('li.rcm-team') || [])].slice(0, 5);
    if (!items.length) return null;
    const label = sport === 'nfl' ? 'NFL' : 'Champions';
    const edition = (document.getElementById(editionId)?.textContent || '').trim();
    const card = el('button', null, 'cam-desk-rank-card', { type: 'button', 'data-sport': sport });
    const top = el('span', null, 'cam-desk-rank-top');
    top.append(el('span', label, 'cam-desk-rank-league'), el('span', edition, 'cam-desk-rank-edition'));
    const list = el('span', null, 'cam-desk-rank-list');
    for (const li of items) {
      const line = el('span', null, 'cam-desk-rank');
      const rank = li.dataset.rank || li.querySelector('strong')?.textContent || '';
      const name = li.dataset.teamName || li.querySelector('.ae-team-name')?.textContent || '';
      line.append(el('span', rank, 'cam-desk-rank-n'),
        crest(li.querySelector('img')?.src, li.querySelector('.ae-logo-initials')?.textContent || initials(name)),
        el('span', name, 'cam-desk-rank-name'));
      // Solo los cambios (▲ ▼ Nuevo), como hacía Inicio en el teléfono.
      const trend = li.querySelector('.ae-rank-trend');
      const kind = trend && ['up', 'down', 'new'].find(k => trend.classList.contains('ae-rank-' + k));
      if (kind) line.append(el('span', trend.textContent.trim(), 'cam-desk-trend is-' + kind, { 'aria-label': trend.getAttribute('aria-label') || '' }));
      list.append(line);
    }
    card.append(top, list, el('span', 'Ver Top 10 ›', 'cam-desk-rank-cta'));
    card.setAttribute('aria-label', 'Power Rankings ' + label + (edition ? ' ' + edition : '') + ': abrir el Top 10');
    card.addEventListener('click', open);
    return card;
  }
  function paintRankings() {
    const cards = [
      rankingCard('nfl', 'rankingList', 'rankingEdition', () => window.openNflTopTen?.()),
      rankingCard('champions', 'championsList', 'championsEdition', () => window.openChampionsTopTen?.())
    ].filter(Boolean);
    rankingsList.replaceChildren(...cards);
    rankings.hidden = cards.length === 0;
  }
  for (const id of ['rankingList', 'championsList']) {
    const list = document.getElementById(id);
    if (list) new MutationObserver(() => { if (asideFor === 'home') { paintRankings(); queue(); } }).observe(list, { childList: true });
  }

  // Módulos que ya existen y se prestan al carril derecho (vuelven a su sitio después).
  const borrowed = new Map();   // nodo → comentario que marca su sitio
  function borrow(node) {
    if (!node || !node.parentNode) return null;
    if (!borrowed.has(node)) {
      const mark = document.createComment(' cam-escritorio: ' + (node.id || node.className || node.nodeName) + ' ');
      node.parentNode.insertBefore(mark, node);
      borrowed.set(node, mark);
    }
    return node;
  }
  function giveBack(node) {
    const mark = borrowed.get(node);
    borrowed.delete(node);
    if (!mark) return;
    // Si otro script ya se lo llevó (p. ej. Lo más leído a Actualidad), manda ese script.
    if (node.parentNode === asideIn && mark.parentNode) mark.parentNode.replaceChild(node, mark);
    else mark.remove();
  }
  const byId = id => document.getElementById(id);
  const ASIDE = {
    home: () => { paintRankings(); return [rankings]; },
    // NFL y Fútbol: ¿Quién será campeón? junto a La semana; las opiniones junto a
    // los Takes (el Take histórico y el Top 10 necesitan ancho: siguen en el centro);
    // Lo más leído junto a las noticias de Fútbol.
    'nfl:semana': () => [borrow(byId('aeSeasonPredictions'))],
    'futbol:semana': () => [borrow(byId('aeSeasonPredictions'))],
    'nfl:takes': () => [borrow(byId('aeSportTakeLeaders'))],
    'futbol:takes': () => [borrow(byId('aeSportTakeLeaders'))],
    'futbol:noticias': () => [borrow(byId('aeTrendingPortada'))]
    // Picks no presta nada: sus estilos dependen de #communityPicks, así que su
    // columna derecha (Chefs y Mis parties; Pick histórico) se compone en su sitio
    // con una rejilla en cam-escritorio.css.
    // Actualidad (9 nov, «Actualidad moderna»): ya trae su propia columna derecha con
    // Opinadores distinguidos y Lo más leído, y sus estilos dependen de #aeOpinions;
    // no se presta nada.
  };
  let asideFor = null;
  function fillAside(p) {
    // Otro script puede llevarse un módulo prestado (p. ej. Lo más leído vuelve a su
    // sitio al cambiar una clase de <body>): entonces se vuelve a pedir.
    if (asideFor === p && [...borrowed.keys()].every(node => node.parentNode === asideIn)) return;
    asideFor = p;
    for (const node of [...borrowed.keys()]) giveBack(node);
    const nodes = (ASIDE[p] ? ASIDE[p]() : []).filter(Boolean);
    asideIn.replaceChildren(...nodes);
  }
  // Algunos módulos prestados se muestran solos cuando llegan sus datos (atributo hidden).
  function asideHasContent() {
    const was = aside.hidden;
    aside.hidden = false;
    const any = [...asideIn.children].some(node => node.getClientRects().length > 0);
    aside.hidden = was;
    return any;
  }
  new MutationObserver(() => queue()).observe(asideIn, { attributes: true, attributeFilter: ['hidden'], subtree: true });

  /* ---------- 4. Inicio: «Cierran pronto» a todo el ancho, con flechas ---------- */
  const strip = () => document.querySelector('#camHomeJornada .cam-hj-section[data-row="jornada"]');
  const arrows = el('div', null, 'cam-desk-arrows', { role: 'group', 'aria-label': 'Mover «Cierran pronto»' });
  const prev = el('button', '‹', 'cam-desk-arrow', { type: 'button', 'aria-label': 'Partidos anteriores' });
  const next = el('button', '›', 'cam-desk-arrow', { type: 'button', 'aria-label': 'Más partidos' });
  arrows.append(prev, next);
  let stripList = null;
  function updateArrows() {
    if (!stripList) return;
    const max = stripList.scrollWidth - stripList.clientWidth;
    prev.disabled = stripList.scrollLeft <= 2;
    next.disabled = stripList.scrollLeft >= max - 2;
    arrows.hidden = max <= 2;
  }
  function slide(direction) {
    if (!stripList) return;
    const step = Math.max(220, stripList.clientWidth - 120);
    stripList.scrollBy({ left: direction * step, behavior: 'smooth' });
  }
  prev.addEventListener('click', () => slide(-1));
  next.addEventListener('click', () => slide(1));
  const stripWatch = new MutationObserver(() => requestAnimationFrame(updateArrows));
  function addArrows() {
    const section = strip();
    if (!section) return;
    section.dataset.camDeskFull = '';
    const head = section.querySelector('.cam-hj-head');
    const list = section.querySelector('.cam-hj-row');
    if (head && arrows.parentNode !== head) head.append(arrows);
    if (list && list !== stripList) {
      stripList?.removeEventListener('scroll', updateArrows);
      stripList = list;
      list.addEventListener('scroll', updateArrows, { passive: true });
      stripWatch.disconnect();
      stripWatch.observe(list, { childList: true });
    }
    updateArrows();
  }
  function removeArrows() {
    arrows.remove();
    const section = strip();
    if (section) delete section.dataset.camDeskFull;
    stripWatch.disconnect();
    stripList?.removeEventListener('scroll', updateArrows);
    stripList = null;
  }

  /* ---------- 5. Dónde van los carriles ---------- */
  function placeRail(p) {
    const root = document.getElementById('camHomeJornada');
    const bar = document.getElementById('camSectionTabs');
    if (p === 'home' && root && !root.hidden) {
      // Inicio: los atajos siguen a la tira «Cierran pronto» (o a la cabecera de Tu jornada).
      const after = shown(strip()) ? strip() : root.querySelector('.cam-hj-top');
      if (after && after.nextSibling !== rail) after.after(rail);
      else if (!after && root.firstChild !== rail) root.prepend(rail);
    } else if (/^(nfl|futbol):semana$/.test(p) && semana(p)) {
      // La semana: los atajos entran en su rejilla, bajo la cabecera a todo el ancho.
      const box = semana(p);
      if (box.nextSibling !== rail) box.after(rail);
    } else if (bar && bar.parentNode === main) {
      if (bar.nextSibling !== rail) bar.after(rail);
    } else if (main.firstChild !== rail) main.prepend(rail);
  }
  const semana = p => document.getElementById(p.startsWith('nfl') ? 'camNflSemana' : 'camFootballSemana');
  function placeAside() {
    if (main.lastElementChild !== aside) main.append(aside);
  }

  /* ---------- 6. Medidas: arranque de los carriles, carriles fijos y alto mínimo ---------- */
  const px = value => (Math.round(value * 10) / 10) + 'px';
  function setVar(name, value) {
    if (main.style.getPropertyValue(name) !== value) main.style.setProperty(name, value);
  }
  function measure() {
    if (!desk()) return;
    const headerStyle = getComputedStyle(header);
    const headerH = /sticky|fixed/.test(headerStyle.position) ? header.getBoundingClientRect().height : 0;
    const bar = document.getElementById('camSectionTabs');
    const barH = shown(bar) ? bar.getBoundingClientRect().height : 0;
    setVar('--cam-desk-head', px(headerH));
    // Lo que va pegado a la cabecera (sub-barra, «Cierran pronto») recupera el relleno superior de la página.
    setVar('--cam-desk-pull', getComputedStyle(main).paddingTop);
    const stick = headerH + barH + 16;
    const mainStyle = getComputedStyle(main);
    const mainTop = main.getBoundingClientRect().top;
    let top = parseFloat(mainStyle.paddingTop) || 0;
    // Lo que va a todo el ancho: la tira de Inicio y la cabecera de La semana (se repinta, por eso va por selector).
    for (const node of [bar, ...main.querySelectorAll('[data-cam-desk-full], body[data-cam-tab="semana"] .cam-nfl-semana .cam-ns-head')]) {
      if (!shown(node)) continue;
      top = Math.max(top, node.getBoundingClientRect().bottom - mainTop + 24);
    }
    setVar('--cam-desk-top', px(top));
    setVar('--cam-desk-stick', px(stick));
    // Un carril más alto que la pantalla se queda fijo por su pie, no por su cabeza.
    const asideH = asideIn.getBoundingClientRect().height;
    const room = window.innerHeight - stick - 16;
    setVar('--cam-desk-stick-aside', px(asideH > room ? Math.min(stick, window.innerHeight - asideH - 16) : stick));
    const railH = wide.matches && !rail.hidden ? railIn.getBoundingClientRect().height : 0;
    const sideH = medium.matches && !aside.hidden ? asideH : 0;
    const bottom = parseFloat(mainStyle.paddingBottom) || 0;
    setVar('--cam-desk-minh', px(Math.max(railH, sideH) ? top + Math.max(railH, sideH) + bottom : 0));
  }

  /* ---------- 7. Montar y desmontar ---------- */
  function layout() {
    if (!desk()) return teardown();
    body.dataset.camDesk = '';
    headerLayout();
    const p = page();
    adoptShortcuts();
    fillAside(p);
    if (p === 'home') addArrows(); else removeArrows();
    rail.hidden = !shortcuts;
    aside.hidden = !asideHasContent();
    if (aside.hidden) delete body.dataset.camDeskAside;
    else body.dataset.camDeskAside = '';
    placeRail(p);
    placeAside();
    measure();
    updateArrows();
  }
  function teardown() {
    if (!('camDesk' in body.dataset) && !rail.isConnected && !aside.isConnected) return;
    delete body.dataset.camDesk;
    delete body.dataset.camDeskAside;
    for (const node of [...borrowed.keys()]) giveBack(node);
    asideIn.replaceChildren();
    asideFor = null;
    returnShortcuts();
    removeArrows();
    rail.remove();
    aside.remove();
    for (const name of ['--cam-desk-head', '--cam-desk-pull', '--cam-desk-top', '--cam-desk-stick', '--cam-desk-stick-aside', '--cam-desk-minh']) main.style.removeProperty(name);
  }

  let frame = 0;
  function queue() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; layout(); });
  }
  let measureFrame = 0;
  function queueMeasure() {
    if (measureFrame) return;
    measureFrame = requestAnimationFrame(() => { measureFrame = 0; measure(); });
  }

  for (const query of [mobile, wide, medium]) {
    if (typeof query.addEventListener === 'function') query.addEventListener('change', queue);
    else if (typeof query.addListener === 'function') query.addListener(queue);
  }
  // Cambio de sección (clases ae-is-*) o de pestaña (data-cam-tab).
  new MutationObserver(queue).observe(body, { attributes: true, attributeFilter: ['class', 'data-cam-tab', 'data-cam-section'] });
  document.addEventListener('cam:section-tab', queue);
  window.addEventListener('resize', queueMeasure);
  window.addEventListener('pageshow', queue);
  if (typeof ResizeObserver === 'function') {
    const sizes = new ResizeObserver(queueMeasure);
    for (const node of [main, header, railIn, asideIn]) sizes.observe(node);
  }
  layout();

  window.camEscritorio = Object.freeze({ layout: queue, page, _aside: () => asideFor });
})();
