/* CAM SPORTS · Indicador de cuentas de prueba y carruseles de la comunidad. */
(() => {
  'use strict';
  const ids = new Set();
  const listIds = ['aeHomeTakesRecentList','aeHomeTakesPositiveList','aeHomeTakesNegativeList','camHomeTakesRecent','camHomeTakesPositive','camHomeTakesNegative'];
  const $ = id => document.getElementById(id);
  const client = () => typeof db !== 'undefined' ? db : window.db;
  let loaded = false, filter = 'all', scheduled = false;
  function mark(el) {
    const id = el.dataset.camAuthorId;
    if (!loaded || !id) return;
    const demo = ids.has(id);
    // Los Takes conservan la atribución interna a una cuenta de prueba, pero
    // la ficha de lectura no lleva un distintivo dentro de la firma del autor.
    // Las conversaciones de Noticias también usan firmas sin distintivo.
    // La atribución interna y los filtros de comunidad se conservan.
    const takeSurface = el.closest('#aeTakeDiscussion, [data-take-id], .ae-community-popular-take, .cam-take-record, #camSportNewsCommunity');
    const showBadge = demo && !takeSurface;
    const badge = el.nextElementSibling?.classList?.contains('cam-demo-account-tag') ? el.nextElementSibling : null;
    if (showBadge && !badge) {
      const tag = document.createElement('span');
      tag.className = 'cam-demo-account-tag';
      tag.textContent = 'Prueba';
      tag.title = 'Cuenta de prueba administrada por CAM SPORTS';
      el.insertAdjacentElement('afterend', tag);
    } else if (!showBadge && badge) badge.remove();
    if (demo) el.setAttribute('aria-description', 'Cuenta de prueba; su actividad no es participación independiente');
    else el.removeAttribute('aria-description');
  }
  function paint() {
    scheduled = false;
    document.querySelectorAll('[data-cam-author-id]').forEach(mark);
    for (const id of listIds) {
      const list = $(id);
      if (!list) continue;
      const cards = [...list.children].filter(node => node.matches('li.ae-community-popular-take, .cam-hj-item') && node.querySelector('[data-cam-author-id]'));
      let shown = 0;
      for (const card of cards) {
        const authorId = card.querySelector('[data-cam-author-id]')?.dataset.camAuthorId || '';
        const demo = ids.has(authorId);
        const visible = filter === 'all' || !loaded || (filter === 'demo' ? demo : Boolean(authorId) && !demo);
        if (card.hidden !== !visible) card.hidden = !visible;
        if (visible) shown++;
      }
      const currentEmpty = list.querySelector(':scope > li.cam-community-filter-empty');
      if (loaded && cards.length && !shown) {
        const msg = filter === 'demo' ? 'No hay Takes de prueba en esta lista.' : 'No hay Takes de otras cuentas en esta lista.';
        if (!currentEmpty) {
          const row = document.createElement(list.tagName === 'OL' ? 'li' : 'div');
          row.className = 'cam-community-filter-empty';
          row.textContent = msg;
          list.append(row);
        } else if (currentEmpty.textContent !== msg) currentEmpty.textContent = msg;
      } else currentEmpty?.remove();
    }
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } }
  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-cam-demo-filter]');
    if (tab) {
      if (!loaded) return;
      filter = tab.dataset.camDemoFilter;
      document.querySelectorAll('[data-cam-demo-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === tab)));
      schedule();
      return;
    }
    const arrow = event.target.closest('[data-cam-take-scroll]');
    if (!arrow) return;
    const track = $(arrow.dataset.camTakeScroll);
    if (!track) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({left: (Number(arrow.dataset.camTakeDirection) || 1) * Math.max(180, Math.floor(track.clientWidth * .9)), behavior: reduced ? 'auto' : 'smooth'});
  });
  async function load() {
    try {
      const source = client();
      if (!source) throw Error('No se pudo conectar');
      const {data,error} = await source.from('cam_demo_accounts').select('user_id');
      if (error) throw error;
      (data || []).forEach(row => { if (row.user_id) ids.add(String(row.user_id)); });
      loaded = true;
      document.querySelectorAll('[data-cam-demo-filter]').forEach(b => { b.disabled = false; });
      for(const id of ['camCommunityProofNote','camJornadaCommunityProofNote']){
        const note=$(id);
        if(note)note.textContent='CAM SPORTS utiliza cuentas de prueba en la comunidad; sus votos pueden incluir actividad de demostración. Las cuentas siguen identificadas en el filtro de comunidad.';
      }
      schedule();
    } catch (err) {
      for(const id of ['camCommunityProofNote','camJornadaCommunityProofNote']){
        const note=$(id);
        if(note)note.textContent='No se pudo verificar el origen de las cuentas. Los votos pueden incluir pruebas.';
      }
      console.warn('Etiquetas de comunidad no disponibles', err);
    }
  }
  window.camDemoProfiles = Object.freeze({isDemo: id => loaded && ids.has(String(id)), ready: () => loaded});
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-cam-author-id']});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once:true});
  else void load();
})();
