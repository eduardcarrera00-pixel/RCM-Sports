/* AE SPORTS · Champions League en móviles.
   El ranking es siempre el publicado por Supabase. No se escriben datos. */
(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const mobile = window.matchMedia('(max-width:760px)');
  const originalLocations = new Map();
  let working = false;
  let pending = false;
  // The community's NFL Savant / NFL Rookie module is a single live node.
  // On NFL it belongs immediately before the Top 10 inside the Takes section.
  let nflTakeAnchor = null;
  const nflMobileActive = () => mobile.matches && document.body.classList.contains('ae-is-nfl');

  function placeNflTakes(onNfl){
    const root = byId('aeSportTakeLeaders');
    if(!root)return;
    if(!nflTakeAnchor){
      nflTakeAnchor = document.createComment('AE: posición original de NFL Savant / NFL Rookie');
      root.parentNode?.insertBefore(nflTakeAnchor,root);
    }
    const takeFeed = byId('freeTakes');
    const standing = byId('aeSportTakeRanking');
    const nflSection = document.body.classList.contains('ae-is-nfl');
    // NFL: Demuestra tu conocimiento, Savant/Rookie y después Top 10.
    // Se mueve el nodo real; votos, respuestas y usuarios mantienen sus eventos.
    if(nflSection && takeFeed && standing?.parentElement === takeFeed){
      if(root.parentElement !== takeFeed || root.nextElementSibling !== standing){
        takeFeed.insertBefore(root,standing);
      }
    } else if(nflTakeAnchor.parentNode && (root.parentElement !== nflTakeAnchor.parentElement || nflTakeAnchor.nextSibling !== root)){
      nflTakeAnchor.parentNode.insertBefore(root,nflTakeAnchor.nextSibling);
    }
  }

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

  // Un único ranking para escritorio y móvil: el DOM publicado por
  // champions.js conserva las imágenes, la animación y los puestos reales.
  // No creamos un segundo ticker, un Top 10 modal ni controles de pausa.

  function compose() {
    if (working) return;
    working = true;
    try {
      if (!footballActive()) {
        if (originalLocations.size) restoreDesktopOrder();
        placeNflTakes(nflMobileActive());
        return;
      }
      // Restore the original sidebar anchor before Fútbol moves this live node.
      placeNflTakes(false);
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
      // The same footer follows the mobile news grid.
      moveTo(byId('aeSportAllNewsFooter'), stage);
      moveTo(byId('freeTakes'), stage);
      moveTo(byId('aeNflLatestComments'), stage);
      moveTo(byId('aeSportTakeLeaders'), stage);
      moveTo(byId('communityLeaders')?.closest('.editorial-community'), stage);
      const trending = document.querySelector('.editorial-trending');
      moveTo(trending, stage);
      if (trending) trending.hidden = false;

      // El título interactivo lo actualiza renderArticlesFeed; no reemplazar su botón.
      if (byId('aeSportGeniosTitle')) byId('aeSportGeniosTitle').textContent = 'Respira fútbol';
      if (byId('aeSportAnoetosTitle')) byId('aeSportAnoetosTitle').textContent = 'Vende Humos';

      if (ranking) {
        ranking.classList.add('ae-football-ranking-feature');
        // championsViewport/championsTrack son los mismos en ambos formatos.
      }
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
    const articlesGrid = byId('articlesGrid');
    if (articlesGrid) new MutationObserver(schedule).observe(articlesGrid, {childList:true});
    mobile.addEventListener('change', schedule);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) schedule();
    });
    schedule();
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
