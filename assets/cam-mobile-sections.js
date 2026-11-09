/* CAM SPORTS — phone section tabs and addresses.
   Inside NFL: La semana · Takes · Noticias (4 nov 2026: La semana holds the
   quiniela, the duel of the week and the scores; Power Rankings lives in Noticias;
   ?v=quiniela still works and opens it).
   Inside Fútbol: La semana · Takes · Noticias, with the same saved quiniela
   and its competition selector. Both scoreboards close La semana.
   Inside Picks: Picks · Historial · Chefs.
   A sticky bar at the top of the section shows one part at a time (the hiding
   rules live in cam-mobile-bottom-nav.css). Nothing is moved or re-rendered:
   the same live modules stay where their own scripts put them.
   Every section and tab has its own address (?s=nfl&v=quiniela), so the phone's
   Back button works and a link can open a section directly.
   Desktop (8 nov 2026): the same sections, tabs and addresses on every width;
   cam-escritorio.js and cam-escritorio.css give them the large-screen layout. */
(() => {
  'use strict';

  const main = document.getElementById('mainContent');
  if (!main || typeof window.filterByCategory !== 'function' || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  // NFL: La semana abre la sección; Power Rankings pertenece a Noticias.
  const NFL_TABS = [['semana', 'La semana'], ['takes', 'Takes'], ['noticias', 'Noticias']];
  // Old addresses keep working: ?v=clasificacion now opens Takes.
  const OLD_TABS = { clasificacion: 'takes' };
  const SECTIONS = {
    // ?s=nfl&v=quiniela (atajos de Inicio, perfil, enlaces viejos) abre La semana.
    NFL: { key: 'nfl', group: 'sport', owners: 'nfl', label: 'NFL', tabs: NFL_TABS, aliases: { quiniela: 'semana' } },
    'Fútbol': { key: 'futbol', group: 'sport', owners: 'football', label: 'Fútbol', tabs: NFL_TABS, aliases: { quiniela: 'semana' } },
    Picks: { key: 'picks', group: 'picks', label: 'Picks', tabs: [['picks', 'Picks'], ['historial', 'Historial'], ['chefs', 'Chefs']] }
  };
  // Address of each top-level page (Inicio has none).
  const SLUGS = { NFL: 'nfl', 'Fútbol': 'futbol', Picks: 'picks', Opiniones: 'opiniones' };
  const FROM_SLUG = Object.fromEntries(Object.entries(SLUGS).map(([category, slug]) => [slug, category]));
  // Which tab owns each part (kept in step with the CSS hiding rules).
  const OWNERS = {
    sport: {
      noticias: '#nflRankings, #championsRankings, #heroSection, #aeNewsHeadingRow, #aeSportLatestNews, #articlesGrid, #aeSportAllNewsFooter, #aeMoreNews, #aeNflLatestComments, #mainContent > .editorial-layout, #aeFootballMobileStage > .editorial-trending',
      quiniela: '#camNflQuiniela, #camFootballQuiniela, #aeSeasonPredictions',
      takes: '#freeTakes'
    },
    // La quiniela vive dentro de #freeTakes; el ranking completo encabeza Noticias.
    nfl: {
      semana: '#camNflSemana, #camNflQuiniela, #camNflScore, #aeSeasonPredictions',
      noticias: '#nflRankings, #heroSection, #aeNewsHeadingRow, #aeSportLatestNews, #articlesGrid, #aeSportAllNewsFooter, #aeMoreNews, #aeNflLatestComments, #mainContent > .editorial-layout',
      takes: '#freeTakes'
    },
    football: {
      semana: '#camFootballSemana, #camFootballQuiniela, #camFootballScore, #aeSeasonPredictions',
      noticias: '#championsRankings, #heroSection, #aeNewsHeadingRow, #aeSportLatestNews, #articlesGrid, #aeSportAllNewsFooter, #aeMoreNews, #mainContent > .editorial-layout, #aeFootballMobileStage > .editorial-trending',
      takes: '#freeTakes'
    },
    picks: {
      historial: '#cpSettleHistorySection, #aeHomePickHistoric',
      chefs: '#camPartyEntryPicks, #communityPicks > .ae-chefs-dual-standings',
      picks: '#aePicksTopPair, #aeWeeklyPickAdmin, #camWeeklyResultsAdmin, #communityPicks'
    }
  };

  const chosen = new Map();   // section → last tab chosen in this visit
  let applyingUrl = false;
  let pendingTab = null;

  const category = () => (typeof currentCategory === 'string' ? currentCategory : 'Todos');
  const searching = () => typeof currentSearchQuery === 'string' && currentSearchQuery.trim() !== '';
  const sectionOf = cat => (!searching() && SECTIONS[cat]) || null;
  const aliasOf = (section, tab) => (section && section.aliases && section.aliases[tab]) || tab;
  const validTab = (section, tab) => section.tabs.some(([key]) => key === aliasOf(section, tab));
  const tabOf = cat => {
    const section = SECTIONS[cat];
    if (!section) return null;
    const tab = chosen.get(cat);
    return validTab(section, tab) ? tab : section.tabs[0][0];
  };

  // ---------- The bar ----------
  const bar = document.createElement('nav');
  bar.id = 'camSectionTabs';
  bar.className = 'cam-section-tabs';
  bar.hidden = true;
  main.insertBefore(bar, main.firstChild);
  let barFor = null;

  function buildBar(cat) {
    if (barFor === cat) return;
    barFor = cat;
    const section = SECTIONS[cat];
    bar.replaceChildren();
    bar.setAttribute('aria-label', 'Apartados de ' + section.label);
    for (const [key, label] of section.tabs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cam-section-tab';
      button.dataset.tab = key;
      button.textContent = label;
      bar.append(button);
    }
  }

  function render() {
    const cat = category();
    const section = sectionOf(cat);
    const body = document.body;
    if (!section) {
      bar.hidden = true;
      delete body.dataset.camTabs;
      delete body.dataset.camTab;
      delete body.dataset.camSection;
      return;
    }
    buildBar(cat);
    // Each section pads #mainContent differently; the bar always meets the header.
    main.style.setProperty('--cam-tabs-pull', getComputedStyle(main).paddingTop);
    const tab = tabOf(cat);
    body.dataset.camTabs = section.group;
    body.dataset.camSection = section.key;
    body.dataset.camTab = tab;
    bar.hidden = false;
    for (const button of bar.children) {
      const on = button.dataset.tab === tab;
      if (on) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    const active = bar.querySelector('[aria-current="true"]');
    if (active && (active.offsetLeft < bar.scrollLeft || active.offsetLeft + active.offsetWidth > bar.scrollLeft + bar.clientWidth)) {
      bar.scrollLeft = active.offsetLeft - 16;
    }
  }

  // ---------- Scroll ----------
  // Every page starts at the top; browser history must not restore an old height.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  function jumpTop() {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  // ---------- Address ----------
  function wanted() {
    const cat = category();
    const slug = SLUGS[cat] || null;
    const section = SECTIONS[cat];
    // The tab is part of the address on every width (desktop has the same tabs).
    const tab = section && !searching() ? tabOf(cat) : null;
    return { slug, tab };
  }
  function userGesture() {
    const activation = navigator.userActivation;
    return activation ? activation.isActive : document.readyState === 'complete';
  }
  // A new section adds a step to the phone's Back button; switching tabs inside
  // a section only updates the address, so Back leaves the section in one step.
  function syncUrl(options = {}) {
    if (applyingUrl) return;
    let url;
    try { url = new URL(location.href); } catch { return; }
    const { slug, tab } = wanted();
    const currentSlug = url.searchParams.get('s');
    const currentTab = url.searchParams.get('v');
    if (currentSlug === slug && currentTab === tab) return;
    if (slug) url.searchParams.set('s', slug); else url.searchParams.delete('s');
    if (tab) url.searchParams.set('v', tab); else url.searchParams.delete('v');
    try {
      if (userGesture() && !options.replace) history.pushState(history.state, '', url.href);
      else history.replaceState(history.state, '', url.href);
    } catch {}
  }
  function fromUrl() {
    let params;
    try { params = new URL(location.href).searchParams; } catch { return { cat: 'Todos', tab: null }; }
    const cat = FROM_SLUG[params.get('s')] || 'Todos';
    const asked = params.get('v');
    const old = OLD_TABS[asked];
    const tab = aliasOf(SECTIONS[cat], old || asked);
    return { cat, tab, old: !!old || (asked != null && tab !== asked) };
  }

  // ---------- Navigation ----------
  function selectTab(tab, options = {}) {
    const cat = category();
    const section = SECTIONS[cat];
    if (!section || !validTab(section, tab)) return false;
    tab = aliasOf(section, tab);
    const previous = tabOf(cat);
    if (previous === tab && !options.force) {
      if (options.scroll !== false) jumpTop();
      return true;
    }
    chosen.set(cat, tab);
    render();
    if (options.scroll !== false) jumpTop();
    if (options.url !== false) syncUrl({ replace: true });
    document.dispatchEvent(new CustomEvent('cam:section-tab', { detail: { section: SECTIONS[cat].key, tab } }));
    return true;
  }

  const originalFilter = window.filterByCategory;
  window.filterByCategory = function camSectionAwareFilter() {
    const before = category();
    const result = originalFilter.apply(this, arguments);
    const after = category();
    if (pendingTab && SECTIONS[after] && validTab(SECTIONS[after], pendingTab)) chosen.set(after, aliasOf(SECTIONS[after], pendingTab));
    pendingTab = null;
    render();
    if (after !== before) jumpTop();
    syncUrl();
    return result;
  };

  bar.addEventListener('click', event => {
    const button = event.target.closest('button.cam-section-tab');
    if (button) selectTab(button.dataset.tab);
  });
  bar.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...bar.querySelectorAll('button.cam-section-tab')];
    let index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].focus();
    selectTab(tabs[index].dataset.tab);
  });

  // Scripts that scroll to a part of the section (Top 10, Pick del editor…)
  // first open the tab that contains it.
  function reveal(element) {
    const cat = category();
    const section = sectionOf(cat);
    if (!section || !(element instanceof Element)) return;
    const owners = OWNERS[section.owners || section.group];
    for (const [tab, selector] of Object.entries(owners)) {
      if (element.closest(selector)) {
        if (tab !== tabOf(cat)) selectTab(tab, { scroll: false });
        return;
      }
    }
  }
  const nativeScrollIntoView = Element.prototype.scrollIntoView;
  if (typeof nativeScrollIntoView === 'function') {
    Element.prototype.scrollIntoView = function camRevealThenScroll() {
      try { reveal(this); } catch {}
      return nativeScrollIntoView.apply(this, arguments);
    };
  }

  window.addEventListener('popstate', () => {
    const { cat, tab } = fromUrl();
    applyingUrl = true;
    try {
      if (cat !== category()) {
        pendingTab = tab;
        window.filterByCategory(cat);
      } else if (tab && SECTIONS[cat] && tab !== tabOf(cat)) {
        selectTab(tab, { url: false });
      }
      jumpTop();
    } finally {
      applyingUrl = false;
      pendingTab = null;
    }
  });

  function onLayoutChange() {
    render();
    syncUrl();
  }
  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', onLayoutChange);
  else if (typeof mobile.addListener === 'function') mobile.addListener(onLayoutChange);

  // Search results are not split into tabs.
  for (const id of ['searchInput', 'mobileSearchInput']) {
    document.getElementById(id)?.addEventListener('input', () => queueMicrotask(render));
  }

  // First visit: open the section and tab of the address (?s=nfl&v=quiniela).
  const start = fromUrl();
  if (start.cat !== 'Todos' && start.cat !== category()) {
    applyingUrl = true;
    try {
      pendingTab = start.tab;
      window.filterByCategory(start.cat);
    } finally {
      applyingUrl = false;
      pendingTab = null;
    }
  } else if (start.tab && SECTIONS[start.cat] && validTab(SECTIONS[start.cat], start.tab)) {
    chosen.set(start.cat, aliasOf(SECTIONS[start.cat], start.tab));
  }
  render();
  if (start.old) syncUrl({ replace: true });

  window.camSectionTabs = Object.freeze({
    select: (tab, options) => selectTab(tab, options),
    current: () => ({ section: SECTIONS[category()]?.key || null, tab: sectionOf(category()) ? tabOf(category()) : null }),
    reveal
  });
})();
