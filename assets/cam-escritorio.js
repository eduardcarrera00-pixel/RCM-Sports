/* CAM SPORTS · Desktop pages, 9 November 2026.
   Two independent content columns reuse the live modules. NFL/Fútbol show the
   week, news, rankings, quiniela and Takes together. Every moved node has a
   return marker: routing and resizing restore the exact original nodes before
   the phone composition takes over. No copies, data requests or inline heights. */
(() => {
  'use strict';
  const main = document.getElementById('mainContent');
  const header = document.querySelector('body > header');
  if (!main || !header || !window.matchMedia) return;
  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const body = document.body;
  const byId = id => document.getElementById(id);
  const category = () => { try { return typeof currentCategory === 'string' ? currentCategory : 'Todos'; } catch { return 'Todos'; } };
  function el(tag, text, className, attrs) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    if (attrs) for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
    return node;
  }
  function page() {
    if (body.classList.contains('ae-is-home')) return 'home';
    if (body.dataset.camSportPage) return body.dataset.camSportPage;
    if (body.classList.contains('ae-is-opinions')) return 'opiniones';
    return window.camSectionTabs?.current?.().section || 'otra';
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
  railIn.append(el('h2', 'Atajos', 'cam-desk-rail-toggle', { id: 'camDeskRailTitle' }));
  rail.append(railIn);
  const aside = el('aside', null, 'cam-desk-aside', { id: 'camDeskAside', 'aria-label': 'Destacados' });
  const asideIn = el('div', null, 'cam-desk-aside-in');
  aside.append(asideIn);

  // Atajos: los cuatro de «Tu jornada» (con su número de partidos abiertos) + Mis grupos.
  let shortcuts = null;
  let shortcutsHome = null;
  const parties = el('button', null, 'cam-hj-shortcut cam-desk-parties', { type: 'button', 'aria-label': 'Mis grupos', 'data-shortcut': 'parties' });
  {
    const icon = el('span', null, 'cam-hj-icon', { 'aria-hidden': 'true' });
    const svg = document.querySelector('#aeProfileTabParty svg');
    if (svg) {
      const copy = svg.cloneNode(true);
      copy.removeAttribute('class');
      copy.setAttribute('aria-hidden', 'true');
      copy.setAttribute('fill', 'none');
      copy.setAttribute('stroke', 'currentColor');
      copy.setAttribute('stroke-width', '1.6');
      copy.setAttribute('stroke-linecap', 'round');
      copy.setAttribute('stroke-linejoin', 'round');
      copy.setAttribute('focusable', 'false');
      icon.append(copy);
    }
    parties.append(icon, el('span', 'Mis grupos', 'cam-hj-shortcut-label'));
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


  const top = el('div', null, 'cam-desk-top', {id:'camDeskTop'});
  const shell = el('div', null, 'cam-desk-layout', {id:'camDeskLayout'});
  const primary = el('div', null, 'cam-desk-main', {id:'camDeskMain'});
  shell.append(primary, aside);
  const editorial = main.querySelector('.editorial-layout');
  const editorialCommunity = main.querySelector('.editorial-community');
  const placements = new Map();
  let mounted = null;
  let asideFor = null;

  function move(node, target) {
    if (!node || !node.parentNode || node.parentNode === target) return;
    if (!placements.has(node)) {
      const mark = document.createComment('CAM desktop return: ' + (node.id || node.className));
      node.before(mark);
      placements.set(node, {mark,target});
    } else placements.get(node).target = target;
    target.append(node);
  }
  function order(target, nodes) {
    let previous = null;
    for (const node of nodes.filter(node => node?.parentNode === target)) {
      const next = previous ? previous.nextElementSibling : target.firstElementChild;
      if (next !== node) target.insertBefore(node,next);
      previous = node;
    }
  }
  function restore() {
    for (const [node,{mark,target}] of placements) {
      // A different page (e.g. Actualidad) may already own the original node.
      if (node.parentNode === target && mark.parentNode) mark.replaceWith(node);
      else mark.remove();
    }
    placements.clear();
    shell.remove();
    top.remove();
    rail.remove();
    returnShortcuts();
    mounted = null;
    asideFor = null;
    delete body.dataset.camDeskAside;
  }
  function compose(p) {
    if (p !== mounted) { restore(); mounted = p; }
    adoptShortcuts();
    rail.hidden = !shortcuts;
    if (p === 'home' || p === 'nfl' || p === 'futbol') {
      if (!shell.isConnected) main.append(shell);
      if (rail.parentNode !== main) main.insertBefore(rail,shell);
      if (p === 'home') {
        move(byId('camHomeJornada'), primary);
        move(editorial, primary);
        move(byId('aeTrendingPortada'), asideIn);
        // Reuse the existing live community leaderboard rather than leaving a
        // large empty rail beside the home news and Picks.
        move(editorialCommunity, asideIn);
        order(primary,[byId('camHomeJornada'),editorial]);
        order(asideIn,[byId('aeTrendingPortada'),editorialCommunity]);
      } else {
        const prefix = p === 'nfl' ? 'camNfl' : 'camFootball';
        move(byId(prefix + 'Semana'), primary);
        move(editorial, primary);
        if (top.parentNode !== main || top.nextSibling !== shell) main.insertBefore(top,shell);
        move(byId(p === 'nfl' ? 'nflRankings' : 'championsRankings'), top);
        move(byId(prefix + 'Quiniela'), primary);
        move(byId('freeTakes'), primary);
        move(byId(prefix + 'Score'), asideIn);
        move(byId('aeTrendingPortada'), asideIn);
        move(byId('aeSportTakeLeaders'), asideIn);
        order(primary,[byId(prefix+'Semana'),byId(prefix+'Quiniela'),byId('freeTakes'),editorial]);
        // Lead with news discovery on both sports, like on the home page.
        order(asideIn,[byId('aeTrendingPortada'),byId(prefix+'Score'),byId('aeSportTakeLeaders')]);
      }
      aside.hidden = false;
      body.dataset.camDeskAside = '';
      asideFor = p;
    } else {
      const bar = byId('camSectionTabs');
      if (bar?.parentNode === main) { if (bar.nextSibling !== rail) bar.after(rail); }
      else if (main.firstChild !== rail) main.prepend(rail);
    }
  }
  function measure() {
    if (mobile.matches) return;
    const style = getComputedStyle(header);
    const headerH = /sticky|fixed/.test(style.position) ? header.getBoundingClientRect().height : 0;
    const bar = byId('camSectionTabs');
    const barH = bar && !bar.hidden ? bar.getBoundingClientRect().height : 0;
    const values = {
      '--cam-desk-head':headerH + 'px',
      '--cam-desk-bar-height':barH + 'px',
      '--cam-desk-stick':(headerH + barH + 20) + 'px',
      '--cam-desk-pull':getComputedStyle(main).paddingTop,
      '--cam-desk-aside-top':Math.min(headerH + barH + 20, innerHeight - asideIn.getBoundingClientRect().height - 24) + 'px'
    };
    for (const [name,value] of Object.entries(values)) if(main.style.getPropertyValue(name)!==value) main.style.setProperty(name,value);
  }
  function layout() {
    if (mobile.matches) {
      restore();
      delete body.dataset.camDesk;
      for (const name of ['--cam-desk-head','--cam-desk-stick','--cam-desk-pull','--cam-desk-aside-top','--cam-desk-bar-height']) main.style.removeProperty(name);
      return;
    }
    body.dataset.camDesk = '';
    headerLayout();
    compose(page());
    measure();
  }
  let frame = 0;
  function queue() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame=0; layout(); });
  }
  mobile.addEventListener?.('change',queue);
  new MutationObserver(queue).observe(body,{attributes:true,attributeFilter:['class','data-cam-section','data-cam-sport-page','data-cam-tab']});
  // Mobile and legacy renderers may restore their own nodes after a resize.
  // Re-adopt only when ownership actually changes; stable nodes keep focus.
  const children = new MutationObserver(queue);
  for (const node of [main,top,primary,asideIn]) children.observe(node,{childList:true});
  document.addEventListener('cam:section-tab',queue);
  window.addEventListener('resize',queue);
  window.addEventListener('pageshow',queue);
  if (typeof ResizeObserver === 'function') {
    const sizes = new ResizeObserver(measure);
    sizes.observe(header);
    sizes.observe(asideIn);
  }
  window.camEscritorio = Object.freeze({layout:queue,restore,page,_aside:()=>asideFor});
  layout();
})();
