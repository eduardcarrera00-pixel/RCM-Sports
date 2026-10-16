/* AE SPORTS · Fútbol móvil · composición editorial y ranking animado.
   Solo reubica nodos existentes; nunca altera Supabase ni el ranking publicado. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const mq=window.matchMedia('(max-width:760px)');
 const saved=new Map();
 const isFootball=()=>mq.matches&&document.body.classList.contains('ae-is-football');
 let updating=false, queued=false, lastRank='';
 function relocate(el,host){
   if(!el||!host)return;
   if(!saved.has(el)){const marker=document.createComment('AE original');el.parentNode?.insertBefore(marker,el);saved.set(el,marker);}
   if(el.parentNode!==host||el!==host.lastElementChild)host.appendChild(el);
 }
 function restore(){
   for(const [el,marker] of saved){if(marker.parentNode)marker.parentNode.insertBefore(el,marker);marker.remove();}
   saved.clear();
   $('aeFootballMobileStage')?.remove();
 }
 function tick(){
   const source=$('championsList'),target=$('aeFootballTickerTrack');
   if(!source||!target)return;
   const first=[...source.children].slice(0,3);
   const fingerprint=first.map(x=>x.outerHTML).join('');
   if(fingerprint===lastRank)return;
   lastRank=fingerprint;
   target.replaceChildren();
   for(let copy=0;copy<2;copy++)for(const row of first){
     const node=row.cloneNode(true);node.removeAttribute('id');node.classList.add('ae-football-rank-item');
     node.setAttribute('aria-hidden','true');target.append(node);
   }
   target.classList.toggle('is-moving',first.length>1);
 }
 function compose(){
   if(updating)return;
   updating=true;
   try{
     if(!isFootball()){if(saved.size)restore();return;}
     const main=$('mainContent'),layout=main?.querySelector('.editorial-layout');
     if(!main||!layout)return;
     let stage=$('aeFootballMobileStage');
     if(!stage){stage=document.createElement('div');stage.id='aeFootballMobileStage';main.insertBefore(stage,layout);}
     const grid=$('articlesGrid');
     const heading=grid?.previousElementSibling;
     relocate($('heroSection'),stage);
     relocate(heading,stage);
     relocate(grid,stage);
     const rank=$('championsRankings');relocate(rank,stage);
     if(rank&&!$('aeFootballTicker')){
       const ticker=document.createElement('div');ticker.id='aeFootballTicker';ticker.setAttribute('aria-label','Power Rankings de Champions League en movimiento');
       const track=document.createElement('div');track.id='aeFootballTickerTrack';ticker.append(track);rank.append(ticker);
     }
     relocate($('freeTakes'),stage);
     relocate($('aeSportTakeLeaders'),stage);
     relocate($('communityLeaders')?.closest('.editorial-community'),stage);
     const trending=document.querySelector('.editorial-trending');relocate(trending,stage);
     if(trending)trending.hidden=false;
     if(heading?.querySelector('h2'))heading.querySelector('h2').textContent='Noticias de Fútbol';
     if($('aeSportGeniosTitle'))$('aeSportGeniosTitle').textContent='Genios';
     if($('aeSportAnoetosTitle'))$('aeSportAnoetosTitle').textContent='Anoetos';
     tick();
   }finally{updating=false;}
 }
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;compose();});}
 function start(){
   new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
   const list=$('championsList');
   if(list)new MutationObserver(()=>{lastRank='';schedule();}).observe(list,{childList:true,subtree:true,characterData:true});
   const grid=$('articlesGrid');
   if(grid)new MutationObserver(schedule).observe(grid,{childList:true});
   mq.addEventListener('change',schedule);
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
   schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
