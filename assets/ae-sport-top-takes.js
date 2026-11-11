/* AE SPORTS: destacados de Takes por deporte, sin sustituir los comentarios de portada. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const footballSports=new Set(['football','laliga','premier','ligamx','champions']);
 let request=0,current='',lastRun=0;
 const el=(tag,text,cls)=>{
   const n=document.createElement(tag);
   if(text!==undefined)n.textContent=String(text);
   if(cls)n.className=cls;
   return n;
 };

 let desktopHomeMarker=null;
 let nflAlignFrame=0;
 function alignNflOpinions(){
   if(nflAlignFrame)return;
   nflAlignFrame=requestAnimationFrame(()=>{
     nflAlignFrame=0;
     const root=$('aeSportTakeLeaders'),cards=$('articlesGrid');
     if(!root)return;
     if(!window.matchMedia('(min-width:961px)').matches||
       !document.body.classList.contains('ae-is-nfl')||root.hidden||
       !root.parentElement?.matches('#mainContent .editorial-layout > aside')||
       !cards||cards.hidden||cards.classList.contains('hidden')){
       root.style.removeProperty('--ae-nfl-opinions-height');
       return;
     }
     const height=Math.round(cards.getBoundingClientRect().bottom-root.getBoundingClientRect().top);
     if(height>=250&&height<=4000)root.style.setProperty('--ae-nfl-opinions-height',height+'px');
     else root.style.removeProperty('--ae-nfl-opinions-height');
   });
 }
 function watchNflNews(){
   const grid=$('articlesGrid');
   if('ResizeObserver' in window){
     const observer=new ResizeObserver(alignNflOpinions);
     if(grid)observer.observe(grid);
     const heading=$('aeNewsHeadingRow');if(heading)observer.observe(heading);
   }
   if(grid&&'MutationObserver' in window){
     new MutationObserver(alignNflOpinions).observe(grid,{childList:true});
   }
   window.addEventListener('resize',alignNflOpinions,{passive:true});
   alignNflOpinions();
 }
 function syncFootballDesktopPlacement(){
   const root=$('aeSportTakeLeaders');
   // Escritorio (8 nov 2026): mientras está en el carril derecho, cam-escritorio.js
   // lo devuelve a su sitio al cambiar de pestaña.
   if(root&&root.closest('#camDeskAside'))return;
   const layout=document.querySelector('#mainContent .editorial-layout');
   const sidebar=layout?.querySelector('aside');
   if(!root||!layout||!sidebar)return;
   if(!desktopHomeMarker){
     desktopHomeMarker=document.createComment('AE Sports: posición original de Takes deportivos');
     sidebar.insertBefore(desktopHomeMarker,root.parentElement===sidebar?root:null);
   }
   const section=typeof currentCategory==='undefined'?'':currentCategory;
   // Fútbol: ambas clasificaciones van dentro de la sección editorial,
   // justo debajo del encabezado y antes del historial, a cualquier ancho.
   if(section==='Fútbol'){
     const feed=$('freeTakes'),history=$('aeTakesFeedHeading');
     const before=history;
     if(feed&&history?.parentElement===feed&&before&&
        (root.parentElement!==feed||root.nextElementSibling!==before)){
       feed.insertBefore(root,before);
     }
     return;
   }
   // NFL: las opiniones destacadas van justo debajo de "Demuestra tu conocimiento"
   // y antes de los Takes publicados, tanto en escritorio como en teléfono.
   // Mover el nodo existente conserva votos, comentarios y escuchas.
   if(section==='NFL'){
     const feed=$('freeTakes'),header=feed?.querySelector(':scope > .ae-takes-head');
     const anchor=header;
     if(feed&&anchor&&
        (root.parentElement!==feed||root.previousElementSibling!==anchor)){
       anchor.after(root);
     }
     root.style.removeProperty('--ae-nfl-opinions-height');
     return;
   }
   // Al volver a la portada, restaurar el nodo en su sitio original.
   if(root.parentElement!==sidebar||desktopHomeMarker.nextSibling!==root){
     desktopHomeMarker.after(root);
   }
 }
 // Misma tarjeta que «Últimos Takes» (10 nov 2026): populares e impopulares usan
 // la tarjeta de free-takes.js (window.aeTakeCards), con sus votos, su respuesta
 // rápida y su enlace al perfil. Se ven las tres primeras; «Ver las N» despliega
 // el resto (hasta 10).
 const VISIBLE_ROWS=3;
 const net=t=>Number(t.upvotes||0)-Number(t.downvotes||0);
 // Clasificación compartida: free-takes.js la usa para pedir, en su misma consulta,
 // el número de respuestas de estos Takes.
 function rank(data){
   const recent=(a,b)=>new Date(b.created_at)-new Date(a.created_at);
   return {
     positive:data.filter(t=>net(t)>0)
       .sort((a,b)=>net(b)-net(a)||Number(b.upvotes||0)-Number(a.upvotes||0)||recent(a,b)).slice(0,10),
     negative:data.filter(t=>net(t)<0)
       .sort((a,b)=>net(a)-net(b)||Number(b.downvotes||0)-Number(a.downvotes||0)||recent(a,b)).slice(0,10)
   };
 }
 window.aeSportTopTakes=Object.freeze({rank});
 function renderList(id,items,mode){
   const list=$(id);if(!list)return;
   const root=list.closest('#aeSportTakeLeaders');
   const sport=root?.dataset.sport==='football'?'football':'nfl';
   root?.classList.add('cam-op');
   if(list.dataset.renderSport!==sport)list.dataset.expanded='false';
   list.dataset.renderSport=sport;
   list.classList.remove('ae-football-cyclic','ae-nfl-expanded');
   list.style.removeProperty('--ae-cycle-count');
   list.style.removeProperty('scroll-behavior');
   list.removeAttribute('tabindex');
   list.setAttribute('role','list');
   const label=mode==='up'?'Takes populares':'Takes impopulares';
   list.setAttribute('aria-label',label+' de '+(sport==='nfl'?'NFL':'Fútbol')+'; '+items.length+' '+(items.length===1?'Take':'Takes')+'.');
   const cards=window.aeTakeCards;
   const restoreFocus=cards?.keepFocus?.(list);
   list.replaceChildren();
   for(const [i,t] of items.entries()){
     const li=el('li',undefined,'cam-op-row'+(i>=VISIBLE_ROWS?' cam-op-extra':''));
     li.dataset.takeId=String(t.id);
     if(cards)li.append(cards.build(t,mode));
     else{
       // Sin el módulo de tarjetas queda el título, que abre la conversación.
       const open=el('button',t.title||'Ver Take','cam-op-title');
       open.type='button';
       open.addEventListener('click',()=>window.aeTakeReplies?.open(t));
       li.append(open);
     }
     list.append(li);
   }
   if(!items.length){
     const empty=el('li','Aún sin votos '+(mode==='up'?'positivos.':'negativos.'),'cam-op-empty');
     list.append(empty);
   }
   restoreFocus?.();
   // Botón propio para ver el resto; el antiguo «Ver todos» queda oculto.
   const group=list.closest('.ae-sport-takes-group');
   if(group)group.dataset.camContentState=items.length?'ready':'empty';
   let more=group?.querySelector(':scope > .cam-op-more');
   if(group&&!more){
     more=el('button',undefined,'cam-op-more');
     more.type='button';
     more.setAttribute('aria-controls',id);
     more.addEventListener('click',()=>{
       const open=list.dataset.expanded!=='true';
       list.dataset.expanded=String(open);
       paintMore(more,list);
       if(!open)group.scrollIntoView?.({block:'nearest',behavior:'smooth'});
     });
     list.after(more);
   }
   if(more)paintMore(more,list);
 }
 function paintMore(more,list){
   const total=list.querySelectorAll(':scope > .cam-op-row').length;
   const open=list.dataset.expanded==='true';
   more.hidden=total<=VISIBLE_ROWS;
   more.setAttribute('aria-expanded',String(open));
   more.textContent=open?'Ver menos':'Ver las '+total+' ›';
 }
 async function refreshHistoric(sport,section,seq){
   const target=$('aeSportTakeHistoricTake');
   if(!target)return;
   const active=()=>seq===request&&current===sport&&currentCategory===section;
   target.setAttribute('aria-busy','true');
   target.replaceChildren(el('p','Cargando Take histórico…','ae-discovery-empty'));
   try{
     if(typeof db==='undefined'||!db)throw Error('Sin conexión');
     const result=await db.rpc('ae_sport_take_historic',{p_sport:sport});
     if(result.error)throw result.error;
     if(!active())return;
     const winner=(result.data||[]).find(t=>t.id&&Number(t.points)>0&&
       (sport==='nfl'?t.sport==='nfl':footballSports.has(t.sport)));
     target.closest('#aeSportTakeHistoric').dataset.camContentState=winner?'ready':'empty';
     if(winner)target.replaceChildren(window.aeTakeHistoricCard.create(winner));
     else window.aeTakeHistoricCard.empty(target,
       'Aún sin Takes puntuados.',section);
   }catch(error){
     if(!active())return;
     target.closest('#aeSportTakeHistoric').dataset.camContentState='error';
     const retry=el('button','Volver a intentar','cam-take-record-cta');
     retry.type='button';
     retry.addEventListener('click',()=>refresh(true));
     target.replaceChildren(el('p','No se pudo cargar el Take histórico de '+section+'.','ae-discovery-empty'),retry);
   }finally{
     if(active())target.removeAttribute('aria-busy');
   }
 }
 async function refresh(force=false) {
   const section=typeof currentCategory==='undefined'?'':currentCategory;
   const root=$('aeSportTakeLeaders'),voices=document.querySelector('.editorial-community');
   if(!root||!voices)return;
   const sport=section==='NFL'?'nfl':section==='Fútbol'?'football':'';
   root.hidden=!sport;voices.hidden=!!sport;
   const historic=$('aeSportTakeHistoric');
   if(historic){
     historic.hidden=!sport;
     historic.dataset.sport=sport;
     $('aeSportTakeHistoricKicker').textContent='Salón de la fama · '+section;
   }
   root.dataset.sport=sport;
   syncFootballDesktopPlacement();
   alignNflOpinions();
   if(!sport){current='';request++;return;}
   // Los destacados deportivos tienen nombres propios; los de portada
   // (#aeTopTakesPositiveTitle / #aeTopTakesNegativeTitle) no se modifican.
   $('aeSportGeniosTitle').textContent='Takes populares';
   $('aeSportAnoetosTitle').textContent='Takes impopulares';
   if(!force&&sport===current&&Date.now()-lastRun<15000)return;
   current=sport;
   const seq=++request;const status=$('aeSportTakeStatus');
   const historicRequest=refreshHistoric(sport,section,seq);
   status.textContent='Cargando opiniones de la comunidad…';
   try{
     if(!db)throw Error('Sin conexión');
     const r=await db.rpc('ae_public_take_feed',{p_sport:sport==='nfl'?'nfl':'all'});
     if(r.error)throw r.error;
     if(seq!==request||current!==sport)return;
     const data=(r.data||[]).filter(t=>sport==='nfl'?t.sport==='nfl':footballSports.has(t.sport));
     const {positive,negative}=rank(data);
     renderList('aeSportTakePositive',positive,'up');
     renderList('aeSportTakeNegative',negative,'down');
     status.textContent='Clasificación según los votos de Takes de '+(sport==='nfl'?'NFL.':'Fútbol.');
     lastRun=Date.now();
   }catch(e){
     if(seq===request){
       status.textContent='No se pudieron cargar los Takes destacados.';
       for(const id of ['aeSportTakePositive','aeSportTakeNegative']){
         const list=$(id);
         if(list)list.replaceChildren(el('li','No pudimos cargar la clasificación.','ae-top-takes-empty'));
       }
     }
   }finally{
     await historicRequest;
   }
 }
 window.refreshAeSportTopTakes=refresh;
 document.addEventListener('DOMContentLoaded',()=>{watchNflNews();refresh(true);});
 window.matchMedia('(min-width:761px)').addEventListener('change',()=>{
   syncFootballDesktopPlacement();
   if(window.matchMedia('(min-width:761px)').matches)refresh(true);
   alignNflOpinions();
 });
 document.addEventListener('ae:takes-updated',()=>refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
