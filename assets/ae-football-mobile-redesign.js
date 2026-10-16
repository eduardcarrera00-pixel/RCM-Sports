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

/* Ajustes fieles a la referencia de Fútbol: solo presentación móvil. */
(() => {
  const css = `
  @media(max-width:760px){
    body.ae-is-football #articlesGrid>article:nth-child(3){display:flex!important}
    body.ae-is-football #articlesGrid{gap:0!important;border:1px solid rgba(190,143,103,.32)!important}
    body.ae-is-football #articlesGrid>article{border:0!important;border-radius:0!important;box-shadow:none!important;border-bottom:1px solid rgba(190,143,103,.25)!important}
    body.ae-is-football #articlesGrid>article:last-child{border-bottom:0!important}
    body.ae-is-football #championsRankings .ae-rank-hero-head{min-height:0!important;padding:12px!important;align-items:center!important}
    body.ae-is-football #championsRankings .ae-rank-title-wrap{width:100%!important;max-width:100%!important}
    body.ae-is-football #championsRankings .ae-rank-title-wrap h2,
    body.ae-is-football #championsRankings .ae-rank-title-wrap h2 span{font-size:clamp(23px,6.3vw,30px)!important;line-height:1.05!important}
    body.ae-is-football #championsRankings #championsRankOne.ae-ranking-leader{position:relative!important;top:auto!important;right:auto!important;width:auto!important;max-width:none!important;margin:8px 0 0!important}
    body.ae-is-football #championsRankings #championsList.ae-full-ranking-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    body.ae-is-football #aeFootballPublishBottom{display:none!important}
    body.ae-is-football #freeTakes .ae-free-controls,
    body.ae-is-football #freeTakes #aeTakesFeedHeading,
    body.ae-is-football #freeTakes #freeTakesFeed,
    body.ae-is-football #aeFootballMoreTakes{display:none!important}
    body.ae-is-football #freeTakes .ae-takes-head{min-height:0!important;padding:12px!important}
    body.ae-is-football #freeTakes #aeSportTakePublish{min-height:32px!important}
    body.ae-is-football #mainContent,body.ae-is-football .editorial-layout{max-width:100%!important}
    body.ae-is-football .editorial-layout *{min-width:0}
  }`;
  if (!document.getElementById('ae-football-reference-mobile-patch')) {
    const style=document.createElement('style');
    style.id='ae-football-reference-mobile-patch';
    style.textContent=css;
    document.head.appendChild(style);
  }
})();
