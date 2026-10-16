/* AE SPORTS · Champions League en móviles.
   El ranking es siempre el publicado por Supabase. No se escriben datos. */
(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const mobile = window.matchMedia('(max-width:760px)');
  const originalLocations = new Map();
  let working = false;
  let pending = false;

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
      moveTo(byId('aeNflLatestComments'), stage);
      moveTo(byId('aeSportTakeLeaders'), stage);
      moveTo(byId('communityLeaders')?.closest('.editorial-community'), stage);
      const trending = document.querySelector('.editorial-trending');
      moveTo(trending, stage);
      if (trending) trending.hidden = false;

      if (newsHeading?.querySelector('h2')) newsHeading.querySelector('h2').textContent = 'Noticias de Fútbol';
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
