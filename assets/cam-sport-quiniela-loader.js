/* CAM SPORTS · Cargar las Quinielas únicamente al visitar NFL o Fútbol.
 * El resto de Home, la sesión y los módulos compartidos siguen sin cambios.
 */
(() => {
  'use strict';
  const base=new URL('.',document.currentScript?.src||new URL('assets/',location.href));
  const config={
    nfl:{className:'ae-is-nfl',root:'camNflQuiniela',status:'camNflStatus',
      src:'cam-nfl-quiniela.js?v=20261026-ticket-views-1'},
    football:{className:'ae-is-football',root:'camFootballQuiniela',status:'camFootballStatus',
      src:'cam-football-quiniela.js?v=20261028-league-logos-1'}
  };
  const requests=new Map();
  const loaded=new Set();

  function visible(key){
    return document.body.classList.contains(config[key].className);
  }
  function feedback(key,message){
    const el=document.getElementById(config[key].status);
    if(el && visible(key))el.textContent=message;
  }
  function ensure(key){
    const entry=config[key];
    if(!entry)return Promise.reject(Error('Sección desconocida'));
    if(!document.getElementById(entry.root))return Promise.resolve(false);
    if(loaded.has(key))return Promise.resolve(true);
    if(requests.has(key))return requests.get(key);
    feedback(key,'Cargando La Quiniela…');
    const task=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.async=true;
      script.src=new URL(entry.src,base).href;
      script.onload=()=>{loaded.add(key);resolve(true);};
      script.onerror=()=>{
        script.remove();
        reject(Error('No se pudo descargar La Quiniela. Vuelve a entrar en la sección para reintentar.'));
      };
      document.head.append(script);
    }).catch(error=>{
      requests.delete(key);feedback(key,error.message);return false;
    });
    requests.set(key,task);
    return task;
  }
  function sync(){
    if(visible('nfl'))void ensure('nfl');
    if(visible('football'))void ensure('football');
  }

  // The route switches body classes in renderArticlesFeed(), including mobile nav.
  // Observe once rather than changing the existing routing or global handlers.
  if(document.body && 'MutationObserver' in window)
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});
  else sync();
  // Permit a network-error retry when returning to the tab without a route change.
  window.addEventListener('focus',sync);
  window.camSportQuinielaLoader=Object.freeze({
    ensure,
    isLoaded:key=>loaded.has(key)
  });
})();
