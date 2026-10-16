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


/* Composición editorial móvil fiel a la referencia, sin duplicar fuentes de datos. */
(() => {
 'use strict';
 const mobile=window.matchMedia('(max-width:760px)');
 const anchors=new Map();
 const get=id=>document.getElementById(id);
 const active=()=>mobile.matches&&document.body.classList.contains('ae-is-football');
 const move=(el,parent,before=null)=>{
   if(!el||!parent)return;
   if(!anchors.has(el)){const marker=document.createComment('AE football original position');el.parentNode?.insertBefore(marker,el);anchors.set(el,marker);}
   if(el.parentNode!==parent||el.nextSibling!==before)parent.insertBefore(el,before);
 };
 function restore(){
   for(const [el,marker] of anchors){if(marker.parentNode)marker.parentNode.insertBefore(el,marker);marker.remove();}
   anchors.clear();
 }
 function layout(){
   if(!active()){if(anchors.size)restore();return;}
   const main=get('mainContent'),hero=get('heroSection'),layout=document.querySelector('.editorial-layout');
   const articles=get('articlesGrid'),rank=get('championsRankings'),takes=get('freeTakes');
   const leaders=get('aeSportTakeLeaders'),community=get('communityLeaders')?.closest('.editorial-community');
   const trending=document.querySelector('.editorial-trending');
   if(!main||!layout||!articles||!rank)return;
   let host=get('aeFootballMobileComposition');
   if(!host){host=document.createElement('div');host.id='aeFootballMobileComposition';main.insertBefore(host,layout);}
   const heading=articles.previousElementSibling;
   move(hero,host);move(heading,host);move(articles,host);
   move(rank,host);
   move(takes,host);move(leaders,host);move(community,host);move(trending,host);
   if(trending)trending.hidden=false;
   const title=heading?.querySelector('h2');if(title)title.textContent='Noticias de Fútbol';
   const genios=get('aeSportGeniosTitle'),anoetos=get('aeSportAnoetosTitle');
   if(genios)genios.textContent='Genios';
   if(anoetos)anoetos.textContent='Anoetos';
   const rankingTitle=rank.querySelector('#championsTitle span');
   if(rankingTitle)rankingTitle.textContent='Power Rankings';
   rank.classList.remove('hidden');
   const edition=get('championsEdition');if(edition)edition.hidden=false;
 }
 let scheduled=false;
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;layout();refreshTicker();});}
 let signature='';
 function refreshTicker(){
   if(!active())return;
   const list=get('championsList'),track=get('aeFootballTop3Track');
   if(!list||!track)return;
   const items=[...list.querySelectorAll(':scope > li')].slice(0,3);
   const key=items.map(x=>x.textContent.trim()+x.innerHTML.length).join('|');
   if(key===signature)return;
   signature=key;
   track.replaceChildren();
   if(!items.length)return;
   for(let repeat=0;repeat<2;repeat++){
     for(const item of items){
       const clone=item.cloneNode(true);
       clone.removeAttribute('id');
       clone.setAttribute('aria-hidden','true');
       clone.classList.add('ae-football-ticker-card');
       track.append(clone);
     }
   }
   track.classList.toggle('ae-football-animate',items.length>1);
 }
 function setup(){
   const rank=get('championsRankings');
   if(rank&&!get('aeFootballTop3Ticker')){
     const wrap=document.createElement('div');wrap.id='aeFootballTop3Ticker';wrap.setAttribute('aria-label','Los tres primeros equipos de Champions League');
     const track=document.createElement('div');track.id='aeFootballTop3Track';wrap.append(track);rank.append(wrap);
     const list=get('championsList');
     if(list)new MutationObserver(()=>{signature='';schedule();}).observe(list,{childList:true,subtree:true,characterData:true});
   }
   const main=get('mainContent');
   if(main)new MutationObserver(()=>schedule()).observe(main,{attributes:true,attributeFilter:['class']});
   new MutationObserver(()=>schedule()).observe(document.body,{attributes:true,attributeFilter:['class']});
   mobile.addEventListener('change',()=>{signature='';schedule();});
   document.addEventListener('click',e=>{if(e.target.closest('[data-category], [onclick*="filterByCategory"]'))setTimeout(schedule,0);});
   schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
