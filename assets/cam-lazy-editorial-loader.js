/* CAM SPORTS · Load editorial views when requested, not on every Home visit.
 * Public Home, Picks, NFL and Fútbol do not need Opiniones or the full news archive.
 */
(() => {
  'use strict';
  const base=new URL('.',document.currentScript?.src||new URL('assets/',location.href));
  const source={
    opinions:'ae-opinions.js?v=20261024-lazy-editorial-1',
    archive:'ae-news-archive.js?v=20261024-lazy-editorial-1'
  };
  const inFlight=new Map(),loaded=new Set();
  const errorMessage=key=>key==='opinions'
    ? 'No pudimos cargar Opiniones. Vuelve a entrar en esta sección.'
    : 'No pudimos abrir todas las noticias. Inténtalo de nuevo.';
  function report(key){
    const node=document.getElementById(key==='opinions'?'aeOpinionsStatus':'aeNewsArchiveStatus');
    if(node)node.textContent=errorMessage(key);
  }
  function load(key){
    if(loaded.has(key))return Promise.resolve(true);
    if(inFlight.has(key))return inFlight.get(key);
    const promise=new Promise((resolve,reject)=>{
      const tag=document.createElement('script');
      tag.src=new URL(source[key],base).href;
      tag.async=true;
      tag.onload=()=>{
        const ready=key==='opinions'
          ? window.aeOpinions!==opinionsProxy&&typeof window.aeOpinions?.show==='function'
          : window.aeOpenNewsArchive!==archiveProxy&&typeof window.aeOpenNewsArchive==='function';
        if(ready){loaded.add(key);resolve(true);}
        else reject(Error('Módulo editorial no inicializado'));
      };
      tag.onerror=()=>{tag.remove();reject(Error('No se pudo descargar la vista editorial'));};
      document.head.append(tag);
    }).catch(()=>{
      inFlight.delete(key);
      report(key);
      return false; // Safe retry if the user visits the view again.
    });
    inFlight.set(key,promise);
    return promise;
  }
  const visibleOpinions=()=>Boolean(document.getElementById('aeOpinions')&&!document.getElementById('aeOpinions').hidden);
  const opinionsProxy=Object.freeze({
    show:()=>load('opinions').then(ok=>{if(ok&&visibleOpinions())window.aeOpinions.show();}),
    rerender:()=>{if(visibleOpinions())return opinionsProxy.show();},
    reload:()=>load('opinions').then(ok=>{if(ok)window.aeOpinions.reload();}),
    refreshNews:()=>{if(visibleOpinions())return opinionsProxy.show();}
  });
  window.aeOpinions=opinionsProxy;

  function archiveProxy(category='Todas',opener=null){
    return load('archive').then(ok=>{
      if(ok)window.aeOpenNewsArchive(category,opener);
      return ok;
    });
  }
  window.aeOpenNewsArchive=archiveProxy;
  window.aeRefreshNewsArchive=()=>{if(loaded.has('archive'))window.aeRefreshNewsArchive();};

  // Preserve the first click while the archive's handlers are still downloading.
  document.addEventListener('click',event=>{
    if(loaded.has('archive'))return;
    const trigger=event.target?.closest?.('[data-ae-news-category]');
    if(!trigger)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void archiveProxy(trigger.dataset.aeNewsCategory||'Todas',trigger);
  },true);

  // Shared URLs must still open Opiniones when arriving directly from a link.
  function deepLink(){
    if(!/^[0-9a-f-]{36}$/i.test(new URLSearchParams(location.search).get('opinion')||''))return;
    if(typeof filterByCategory==='function')filterByCategory('Opiniones');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',deepLink,{once:true});
  else deepLink();
  window.camLazyEditorial=Object.freeze({isLoaded:key=>loaded.has(key)});
})();
