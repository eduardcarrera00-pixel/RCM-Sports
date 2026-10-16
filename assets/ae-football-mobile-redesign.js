/* AE SPORTS — controles de vista previa móvil de Fútbol.
   Solo cambian clases de presentación; no modifican votos ni Supabase. */
(() => {
  'use strict';
  function setup(){
    const actions=[
      ...document.querySelectorAll('#aeSportTakeLeaders .ae-football-leaders-more'),
      document.getElementById('aeFootballMoreTakes')
    ].filter(Boolean);
    for(const button of actions){
      if(button.dataset.aeFootballBound==='true')continue;
      const list=document.getElementById(button.getAttribute('aria-controls'));
      if(!list)continue;
      button.dataset.aeFootballBound='true';
      button.addEventListener('click',()=>{
        const opened=list.classList.toggle('ae-football-expanded');
        button.setAttribute('aria-expanded',String(opened));
        button.replaceChildren(document.createTextNode(opened?'Ver menos ':'Ver todos '+(button.id==='aeFootballMoreTakes'?'los Takes ':'')));
        const arrow=document.createElement('span');
        arrow.setAttribute('aria-hidden','true');
        arrow.textContent=opened?'↑':'→';
        button.append(arrow);
      });
    }
    const publish=document.getElementById('aeFootballPublishBottom');
    if(publish&&publish.dataset.aeFootballBound!=='true'){
      publish.dataset.aeFootballBound='true';
      publish.addEventListener('click',()=>{
        document.getElementById('aeSportTakePublish')?.click();
      });
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();