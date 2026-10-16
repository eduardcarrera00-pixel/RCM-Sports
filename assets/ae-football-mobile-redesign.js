/* AE SPORTS · Champions League en móviles.
   El ranking es siempre el publicado por Supabase. No se escriben datos. */
(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const mobile = window.matchMedia('(max-width:760px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const originalLocations = new Map();
  let working = false;
  let pending = false;
  let tickerFingerprint = null;
  let paused = reducedMotion.matches;
  let userOptedIn = false;

  const footballActive = () =>
    mobile.matches && document.body.classList.contains('ae-is-football');

  function moveTo(element, container) {
    if (!element || !container) return;
    if (!originalLocations.has(element)) {
      const marker = document.createComment('AE: ubicación original del módulo');
      element.parentNode?.insertBefore(marker, element);
      originalLocations.set(element, marker);
    }
    if (element.parentNode !== container || element !== container.lastElementChild) {
      container.appendChild(element);
    }
  }

  function restoreDesktopOrder() {
    for (const [element, marker] of originalLocations) {
      if (marker.parentNode) marker.parentNode.insertBefore(element, marker);
      marker.remove();
    }
    originalLocations.clear();
    byId('aeFootballMobileStage')?.remove();
    byId('championsRankings')?.classList.remove('ae-football-ranking-feature');
  }

  function syncMotion() {
    const track = byId('aeFootballTickerTrack');
    const button = byId('aeFootballRankingMotion');
    if (!track || !button) return;
    track.classList.toggle('is-paused', paused);
    track.classList.toggle('ae-user-play', userOptedIn && !paused);
    button.textContent = paused ? '▶' : 'Ⅱ';
    button.setAttribute('aria-label', paused ? 'Reanudar movimiento del ranking' : 'Pausar movimiento del ranking');
    button.setAttribute('aria-pressed', String(!paused));
    button.title = paused ? 'Reanudar movimiento' : 'Pausar movimiento';
  }

  function showFullRanking() {
    const source = byId('championsList');
    const rows = source ? [...source.children] : [];
    if (!rows.length) return;
    const existing = byId('aeFootballFullRankingDialog');
    if (existing) existing.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'aeFootballFullRankingDialog';
    dialog.className = 'ae-football-ranking-dialog';
    dialog.setAttribute('aria-labelledby', 'aeFootballFullRankingTitle');

    const top = document.createElement('div');
    top.className = 'ae-football-ranking-dialog-head';
    const heading = document.createElement('h2');
    heading.id = 'aeFootballFullRankingTitle';
    heading.textContent = 'Power Rankings · Champions League';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ae-football-ranking-dialog-close';
    close.textContent = 'Cerrar ×';
    close.addEventListener('click', () => dialog.close());
    top.append(heading, close);

    const edition = document.createElement('p');
    edition.className = 'ae-football-ranking-dialog-edition';
    edition.textContent = byId('championsEdition')?.textContent || '';
    const list = document.createElement('ol');
    list.className = 'ae-football-ranking-dialog-list';
    list.setAttribute('aria-label', 'Top 10 de Champions League');
    rows.forEach(row => {
      const clone = row.cloneNode(true);
      clone.removeAttribute('id');
      list.append(clone);
    });
    dialog.append(top, edition, list);
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    document.body.appendChild(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function ensureRankingUI(ranking) {
    if (!ranking) return;
    if (!byId('aeFootballTicker')) {
      const viewport = document.createElement('div');
      viewport.id = 'aeFootballTicker';
      viewport.setAttribute('aria-label', 'Los tres primeros equipos del ranking en movimiento');
      const track = document.createElement('div');
      track.id = 'aeFootballTickerTrack';
      viewport.appendChild(track);
      ranking.appendChild(viewport);
    }
    if (!byId('aeFootballRankingControls')) {
      const header = ranking.querySelector('.ae-rank-hero-head');
      if (!header) return;
      const controls = document.createElement('div');
      controls.id = 'aeFootballRankingControls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'Controles de Power Rankings');

      const motion = document.createElement('button');
      motion.id = 'aeFootballRankingMotion';
      motion.type = 'button';
      motion.addEventListener('click', () => {
        paused = !paused;
        if (!paused) userOptedIn = true;
        syncMotion();
      });
      const all = document.createElement('button');
      all.id = 'aeFootballRankingAll';
      all.type = 'button';
      all.textContent = '↗';
      all.setAttribute('aria-label', 'Ver clasificación completa de Champions League');
      all.title = 'Ver Top 10';
      all.addEventListener('click', showFullRanking);
      controls.append(motion, all);
      header.appendChild(controls);
    }
    syncMotion();
  }

  function renderTicker() {
    const source = byId('championsList');
    const target = byId('aeFootballTickerTrack');
    if (!source || !target) return;
    const topThree = [...source.children].slice(0,3);
    const signature = topThree.map(el =>
      el.textContent + '|' + [...el.querySelectorAll('img')].map(img => img.getAttribute('src')).join('|')
    ).join('::');
    if (signature === tickerFingerprint) return;
    tickerFingerprint = signature;

    target.replaceChildren();
    for (let copy = 0; copy < 2; copy++) {
      topThree.forEach((row, index) => {
        const duplicate = row.cloneNode(true);
        duplicate.removeAttribute('id');
        duplicate.classList.add('ae-football-rank-item');
        duplicate.dataset.rank = String(index + 1);
        duplicate.setAttribute('aria-hidden', 'true');
        target.appendChild(duplicate);
      });
    }
    target.classList.toggle('is-moving', topThree.length > 1);
    const motion = byId('aeFootballRankingMotion');
    const all = byId('aeFootballRankingAll');
    if (motion) motion.hidden = topThree.length < 2;
    if (all) all.disabled = topThree.length === 0;
    syncMotion();
  }

  function compose() {
    if (working) return;
    working = true;
    try {
      if (!footballActive()) {
        if (originalLocations.size) restoreDesktopOrder();
        return;
      }
      const main = byId('mainContent');
      const layout = main?.querySelector('.editorial-layout');
      if (!main || !layout) return;
      let stage = byId('aeFootballMobileStage');
      if (!stage) {
        stage = document.createElement('div');
        stage.id = 'aeFootballMobileStage';
        main.insertBefore(stage, layout);
      }

      const grid = byId('articlesGrid');
      const newsHeading = grid?.previousElementSibling;
      const ranking = byId('championsRankings');

      // La clasificación encabeza siempre la categoría Fútbol en móvil.
      moveTo(ranking, stage);
      moveTo(byId('heroSection'), stage);
      moveTo(newsHeading, stage);
      moveTo(grid, stage);
      moveTo(byId('freeTakes'), stage);
      moveTo(byId('aeSportTakeLeaders'), stage);
      moveTo(byId('communityLeaders')?.closest('.editorial-community'), stage);
      const trending = document.querySelector('.editorial-trending');
      moveTo(trending, stage);
      if (trending) trending.hidden = false;

      if (newsHeading?.querySelector('h2')) newsHeading.querySelector('h2').textContent = 'Noticias de Fútbol';
      if (byId('aeSportGeniosTitle')) byId('aeSportGeniosTitle').textContent = 'Genios';
      if (byId('aeSportAnoetosTitle')) byId('aeSportAnoetosTitle').textContent = 'Anoetos';

      if (ranking) {
        ranking.classList.add('ae-football-ranking-feature');
        ensureRankingUI(ranking);
      }
      renderTicker();
    } finally {
      working = false;
    }
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      compose();
    });
  }

  function init() {
    new MutationObserver(schedule).observe(document.body, {
      attributes: true, attributeFilter: ['class']
    });
    const rankingList = byId('championsList');
    if (rankingList) new MutationObserver(() => {
      tickerFingerprint = null;
      schedule();
    }).observe(rankingList, {childList:true, subtree:true, characterData:true});
    const articlesGrid = byId('articlesGrid');
    if (articlesGrid) new MutationObserver(schedule).observe(articlesGrid, {childList:true});
    mobile.addEventListener('change', schedule);
    reducedMotion.addEventListener('change', () => {
      if (!userOptedIn) paused = reducedMotion.matches;
      syncMotion();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();