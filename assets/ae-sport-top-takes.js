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

 // Fútbol: top 10 real, con scroll exclusivamente manual.
 // Sin intervalos, copias DOM ni saltos automáticos al primer puesto.
 function startFootballCycle(list,items,mode){
   list.classList.remove('ae-football-cyclic');
   list.style.removeProperty('--ae-cycle-count');
   list.style.removeProperty('scroll-behavior');
   list.tabIndex=0;
   list.setAttribute('role','region');
   const phone=window.matchMedia('(max-width:760px)').matches;
   list.setAttribute('aria-label',(mode==='up'?'Opiniones populares':'Opiniones impopulares')+
     ' de Fútbol; '+items.length+' entradas. Desliza hacia la '+(phone?'derecha':'parte inferior')+' para consultar las demás.');
 }
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
     if(feed&&history?.parentElement===feed&&
        (root.parentElement!==feed||root.nextElementSibling!==history)){
       feed.insertBefore(root,history);
     }
     return;
   }
   // NFL: las opiniones destacadas van justo debajo de "Demuestra tu conocimiento"
   // y antes de los Takes publicados, tanto en escritorio como en teléfono.
   // Mover el nodo existente conserva votos, comentarios y escuchas.
   if(section==='NFL'){
     const feed=$('freeTakes'),header=feed?.querySelector(':scope > .ae-takes-head');
     if(feed&&header&&
        (root.parentElement!==feed||root.previousElementSibling!==header)){
       header.after(root);
     }
     root.style.removeProperty('--ae-nfl-opinions-height');
     return;
   }
   // Al volver a la portada, restaurar el nodo en su sitio original.
   if(root.parentElement!==sidebar||desktopHomeMarker.nextSibling!==root){
     desktopHomeMarker.after(root);
   }
 }
 function renderList(id,items,mode){
   const list=$(id);if(!list)return;
   const football=list.closest('#aeSportTakeLeaders')?.dataset.sport==='football';
   const sport=football?'football':'nfl';
   const savedTop=list.dataset.renderSport===sport?list.scrollTop:0;
   const savedLeft=list.dataset.renderSport===sport?list.scrollLeft:0;
   list.classList.remove('ae-football-cyclic');
   list.style.removeProperty('--ae-cycle-count');
   list.style.removeProperty('scroll-behavior');
   list.replaceChildren();
   list.dataset.renderSport=sport;
   for(const [i,t] of items.entries()){
     const li=el('li',undefined,'ae-sport-take-item ae-sport-chef-entry');
     const number=el('span',String(i+1).padStart(2,'0'),'ae-top-take-number');
     const content=el('div',undefined,'ae-top-take-content');
     const meta=el('div',undefined,'ae-sport-take-meta');
     const author=el('button',(football?'':'@')+(t.author||'Aficionado'),'ae-top-take-author');
     author.type='button';
     author.disabled=!t.author_id;
     author.setAttribute('aria-label','Ver perfil y Takes de '+(t.author||'Aficionado'));
     author.addEventListener('click',()=>{
       if(t.author_id)window.openAePublicProfile?.(t.author_id);
     });
     const up=Number(t.upvotes||0),down=Number(t.downvotes||0);
     const net=up-down;
     const score=el('span',(net>0?'+':'')+net+' votos netos','ae-sport-take-net');
     score.setAttribute('title',up+' votos positivos · '+down+' negativos');
     score.setAttribute('aria-label',up+' votos positivos, '+down+' negativos, balance '+net);
     meta.append(author);
     const title=el('strong',undefined,'ae-sport-take-title');
     const openTake=el('button',t.title||'Ver Take','ae-sport-take-open');
     openTake.type='button';
     openTake.setAttribute('aria-label','Leer Take y ver su conversación: '+(t.title||'Publicación'));
     openTake.addEventListener('click',()=>window.aeTakeReplies?.open(t));
     title.append(openTake);
     // NFL stores its optional sport/division/team context on the first line.
     // Keep the original body for the discussion; omit that metadata in this preview.
     const preview=String(t.body||'').replace(/\r\n/g,'\n').trim();
     const takeText=t.sport==='nfl'?preview.replace(/^NFL(?: · [^\n]*)?\n\n/,'').trim():preview;
     const excerpt=el('p',takeText,'ae-sport-take-excerpt');
     const reply=el('button','Responder','ae-top-take-reply');
     reply.type='button';
     reply.setAttribute('aria-label','Responder al Take: '+(t.title||'Publicación'));
     reply.addEventListener('click',()=>window.aeTakeReplies?.open(t,{focusComposer:true}));
     if(football){
       // Perfil y votos en la misma línea; respuesta al final del Take.
       score.dataset.compact=(net>0?'+':'')+net+' netos';
       meta.append(score);
       content.append(meta,title,excerpt,reply);
     }else{
       meta.append(score,reply);
       content.append(meta,title,excerpt);
     }
     li.append(number,content);
     li.addEventListener('click',event=>{
       if(!event.target.closest('button'))window.aeTakeReplies?.open(t);
     });
     list.append(li);
   }
   if(football){
     startFootballCycle(list,items,mode);
   }else if(list.closest('#aeSportTakeLeaders')?.dataset.sport==='nfl'){
     list.tabIndex=0;
     list.setAttribute('role','region');
     const phone=window.matchMedia('(max-width:760px)').matches;
     list.setAttribute('aria-label',(mode==='up'?'Opiniones apoyadas':'Opiniones hateadas')+
       ' de NFL; '+items.length+' entradas. Desliza hacia '+(phone?'la derecha':'abajo')+' para consultar las demás.');
   }else{
     list.removeAttribute('tabindex'); list.removeAttribute('role'); list.removeAttribute('aria-label');
   }
   if(football && savedTop>0 && !window.matchMedia('(max-width:760px)').matches)list.scrollTop=savedTop;
   if(savedLeft>0 && window.matchMedia('(max-width:760px)').matches)list.scrollLeft=savedLeft;
   if(!items.length)list.append(el('li',mode==='up'?
     'Aún no hay Takes con votos netos positivos.':
     'Aún no hay Takes con votos netos negativos.','ae-top-takes-empty'));
 }
 async function refresh(force=false) {
   const section=typeof currentCategory==='undefined'?'':currentCategory;
   const root=$('aeSportTakeLeaders'),voices=document.querySelector('.editorial-community');
   if(!root||!voices)return;
   const sport=section==='NFL'?'nfl':section==='Fútbol'?'football':'';
   root.hidden=!sport;voices.hidden=!!sport;
   root.dataset.sport=sport;
   syncFootballDesktopPlacement();
   alignNflOpinions();
   if(!sport){current='';request++;return;}
   // Los destacados deportivos tienen nombres propios; los de portada
   // (#aeTopTakesPositiveTitle / #aeTopTakesNegativeTitle) no se modifican.
   $('aeSportGeniosTitle').textContent=sport==='nfl'?'Opiniones apoyadas':'Opiniones populares';
   $('aeSportAnoetosTitle').textContent=sport==='nfl'?'Opiniones hateadas':'Opiniones impopulares';
   if(!force&&sport===current&&Date.now()-lastRun<15000)return;
   current=sport;
   const seq=++request;const status=$('aeSportTakeStatus');
   status.textContent='Cargando opiniones de la comunidad…';
   try{
     if(!db)throw Error('Sin conexión');
     const r=await db.rpc('ae_public_take_feed',{p_sport:sport==='nfl'?'nfl':'all'});
     if(r.error)throw r.error;
     if(seq!==request||current!==sport)return;
     const data=(r.data||[]).filter(t=>sport==='nfl'?t.sport==='nfl':footballSports.has(t.sport));
     const net=t=>Number(t.upvotes||0)-Number(t.downvotes||0);
     const positive=data.filter(t=>net(t)>0)
       .sort((a,b)=>net(b)-net(a)||Number(b.upvotes||0)-Number(a.upvotes||0)||new Date(b.created_at)-new Date(a.created_at)).slice(0,10);
     const negative=data.filter(t=>net(t)<0)
       .sort((a,b)=>net(a)-net(b)||Number(b.downvotes||0)-Number(a.downvotes||0)||new Date(b.created_at)-new Date(a.created_at)).slice(0,10);
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
