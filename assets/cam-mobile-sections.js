/* CAM SPORTS — phone section tabs and addresses.
   Inside NFL and Fútbol: Noticias · Takes · Quiniela · Clasificación.
   Inside Picks: Picks · Historial · Chefs.
   A sticky bar at the top of the section shows one part at a time (the hiding
   rules live in cam-mobile-bottom-nav.css). Nothing is moved or re-rendered:
   the same live modules stay where their own scripts put them.
   Every section and tab has its own address (?s=nfl&v=quiniela), so the phone's
   Back button works and a link can open a section directly. */
(() => {
  'use strict';

  const main = document.getElementById('mainContent');
  if (!main || typeof window.filterByCategory !== 'function' || !window.matchMedia) return;

  const mobile = window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const SPORT_TABS = [['noticias', 'Noticias'], ['takes', 'Takes'], ['quiniela', 'Quiniela'], ['clasificacion', 'Clasificación']];
  const SECTIONS = {
    NFL: { key: 'nfl', group: 'sport', label: 'NFL', tabs: SPORT_TABS },
    'Fútbol': { key: 'futbol', group: 'sport', label: 'Fútbol', tabs: SPORT_TABS },
    Picks: { key: 'picks', group: 'picks', label: 'Picks', tabs: [['picks', 'Picks'], ['historial', 'Historial'], ['chefs', 'Chefs']] }
  };
  // Address of each top-level page (Inicio has none).
  const SLUGS = { NFL: 'nfl', 'Fútbol': 'futbol', Picks: 'picks', Opiniones: 'opiniones' };
  const FROM_SLUG = Object.fromEntries(Object.entries(SLUGS).map(([category, slug]) => [slug, category]));
  // Which tab owns each part (kept in step with the CSS hiding rules).
  const OWNERS = {
    sport: {
      noticias: '#heroSection, #aeNewsHeadingRow, #articlesGrid, #aeSportAllNewsFooter, #aeMoreNews, #aeNflLatestComments, #mainContent > .editorial-layout, #aeFootballMobileStage > .editorial-trending',
      quiniela: '#camNflQuiniela, #camFootballQuiniela, #aeSeasonPredictions',
      clasificacion: '#nflRankings, #championsRankings, #aeSportTakeRanking',
      takes: '#freeTakes'
    },
    picks: {
      historial: '#cpSettleHistorySection, #aeHomePickHistoric',
      chefs: '#camPartyEntryPicks, #communityPicks > .ae-chefs-dual-standings',
      picks: '#aePicksTopPair, #aeWeeklyPickAdmin, #camWeeklyResultsAdmin, #communityPicks'
    }
  };

  const chosen = new Map();   // section → last tab chosen in this visit
  const scrolls = new Map();  // section|tab → scroll position
  let applyingUrl = false;
  let pendingTab = null;

  const category = () => (typeof currentCategory === 'string' ? currentCategory : 'Todos');
  const searching = () => typeof currentSearchQuery === 'string' && currentSearchQuery.trim() !== '';
  const sectionOf = cat => (mobile.matches && !searching() && SECTIONS[cat]) || null;
  const validTab = (section, tab) => section.tabs.some(([key]) => key === tab);
  const tabOf = cat => {
    const section = SECTIONS[cat];
    if (!section) return null;
    const tab = chosen.get(cat);
    return validTab(section, tab) ? tab : section.tabs[0][0];
  };
  const memoryKey = (cat, tab) => cat + '|' + (tab || '');

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
      return;
    }
    buildBar(cat);
    // Each section pads #mainContent differently; the bar always meets the header.
    main.style.setProperty('--cam-tabs-pull', getComputedStyle(main).paddingTop);
    const tab = tabOf(cat);
    body.dataset.camTabs = section.group;
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
  // Where the content of the section starts (the bar sticks right there).
  function contentTop() {
    return Math.max(0, main.getBoundingClientRect().top + window.scrollY);
  }
  function remember(cat, tab) {
    scrolls.set(memoryKey(cat, tab), window.scrollY);
  }
  function jump(y) {
    window.scrollTo({ top: Math.max(0, Math.round(y)), behavior: 'auto' });
  }

  // ---------- Address ----------
  function wanted() {
    const cat = category();
    const slug = SLUGS[cat] || null;
    const section = SECTIONS[cat];
    // The tab is part of the address on phones only (desktop shows every part).
    const tab = section && mobile.matches && !searching() ? tabOf(cat) : null;
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
    const tabMatters = mobile.matches;
    if (currentSlug === slug && (!tabMatters || currentTab === tab)) return;
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
    const tab = params.get('v');
    return { cat, tab };
  }

  // ---------- Navigation ----------
  function selectTab(tab, options = {}) {
    const cat = category();
    const section = SECTIONS[cat];
    if (!section || !validTab(section, tab)) return false;
    const previous = tabOf(cat);
    if (previous === tab && !options.force) {
      if (options.scroll !== false) {
        const top = contentTop();
        if (window.scrollY > top) jump(top);
      }
      return true;
    }
    if (mobile.matches && options.scroll !== false) remember(cat, previous);
    chosen.set(cat, tab);
    render();
    if (mobile.matches && options.scroll !== false) {
      const top = contentTop();
      const saved = scrolls.get(memoryKey(cat, tab));
      const settle = Math.min(window.scrollY, top);
      jump(saved != null ? Math.max(saved, settle) : settle);
    }
    if (options.url !== false) syncUrl({ replace: true });
    document.dispatchEvent(new CustomEvent('cam:section-tab', { detail: { section: SECTIONS[cat].key, tab } }));
    return true;
  }

  const originalFilter = window.filterByCategory;
  window.filterByCategory = function camSectionAwareFilter() {
    const before = category();
    const beforeTab = tabOf(before);
    if (mobile.matches) remember(before, sectionOf(before) ? beforeTab : null);
    const result = originalFilter.apply(this, arguments);
    const after = category();
    if (pendingTab && SECTIONS[after] && validTab(SECTIONS[after], pendingTab)) chosen.set(after, pendingTab);
    pendingTab = null;
    render();
    if (after !== before && mobile.matches) {
      const saved = scrolls.get(memoryKey(after, sectionOf(after) ? tabOf(after) : null));
      jump(saved || 0);
    }
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

  // Tapping the section you are on again (in the dock) goes back to the top of its tab.
  document.addEventListener('cam:dock-reselect', () => {
    const cat = category();
    if (sectionOf(cat)) scrolls.delete(memoryKey(cat, tabOf(cat)));
  });

  // Scripts that scroll to a part of the section (Top 10, Pick del editor…)
  // first open the tab that contains it.
  function reveal(element) {
    const cat = category();
    const section = sectionOf(cat);
    if (!section || !(element instanceof Element)) return;
    const owners = OWNERS[section.group];
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
  } else if (start.tab && SECTIONS[start.cat]) {
    chosen.set(start.cat, start.tab);
  }
  render();

  window.camSectionTabs = Object.freeze({
    select: (tab, options) => selectTab(tab, options),
    current: () => ({ section: SECTIONS[category()]?.key || null, tab: sectionOf(category()) ? tabOf(category()) : null }),
    reveal
  });
})();
