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

 const footballCycles=new WeakMap();
 function clearFootballCycle(list){
   const current=footballCycles.get(list);
   if(current){
     clearInterval(current.interval);
     clearTimeout(current.reset);
     clearTimeout(current.resume);
     current.events.abort();
     footballCycles.delete(list);
   }
   list.classList.remove('ae-football-cyclic');
   list.style.removeProperty('--ae-cycle-count');
   list.style.removeProperty('scroll-behavior');
 }
 function startFootballCycle(list,items,mode){
   if(!items.length)return;
   list.tabIndex=0;
   list.setAttribute('role','region');
   list.setAttribute('aria-label',mode==='up'?
     'Top 3 opiniones populares; desplaza las opiniones en bucle':
     'Top 3 opiniones impopulares; desplaza las opiniones en bucle');
   if(items.length<2)return;
   list.classList.add('ae-football-cyclic');
   list.style.setProperty('--ae-cycle-count',String(Math.min(3,items.length)));
   // Two copies let the final item transition back to the first one
   // without a visual jump, and never duplicate votes or database records.
   for(let i=0;i<items.length;i++){
     const copy=list.children[i].cloneNode(true);
     copy.classList.add('ae-football-cycle-copy');
     copy.setAttribute('aria-hidden','true');
     copy.querySelectorAll('button').forEach(button=>{
       button.tabIndex=-1;
       button.disabled=true;
     });
     list.append(copy);
   }
   const events=new AbortController();
   const settings={events,interval:0,reset:0,resume:0,paused:false,index:0,automatic:false};
   footballCycles.set(list,settings);
   const step=()=>list.firstElementChild?.getBoundingClientRect().height||94;
   const position=()=>Math.round(items.length*step());
   const snapToFirst=()=>{
     if(footballCycles.get(list)!==settings)return;
     list.style.scrollBehavior='auto';
     list.scrollTop=0;
     settings.index=0;
     requestAnimationFrame(()=>{
       if(footballCycles.get(list)===settings)list.style.removeProperty('scroll-behavior');
     });
   };
   const pause=()=>{
     settings.paused=true;
     clearTimeout(settings.resume);
     settings.resume=setTimeout(()=>{settings.paused=false;},8000);
   };
   list.addEventListener('wheel',pause,{passive:true,signal:events.signal});
   list.addEventListener('touchstart',pause,{passive:true,signal:events.signal});
   list.addEventListener('focusin',pause,{signal:events.signal});
   list.addEventListener('pointerenter',()=>{settings.paused=true;clearTimeout(settings.resume);},{signal:events.signal});
   list.addEventListener('pointerleave',()=>{clearTimeout(settings.resume);settings.resume=setTimeout(()=>settings.paused=false,1200);},{signal:events.signal});
   list.addEventListener('scroll',()=>{
     if(settings.automatic)return;
     const target=position();
     if(list.scrollTop>=target-3){
       clearTimeout(settings.reset);
       settings.reset=setTimeout(snapToFirst,550);
     }else{
       settings.index=Math.min(items.length-1,Math.round(list.scrollTop/step()));
     }
   },{passive:true,signal:events.signal});
   if(!window.matchMedia('(prefers-reduced-motion:reduce)').matches){
     settings.interval=setInterval(()=>{
       if(footballCycles.get(list)!==settings||document.hidden||
          !document.body.classList.contains('ae-is-football')||settings.paused)return;
       settings.automatic=true;
       const next=settings.index+1;
       list.scrollTo({top:next*step(),behavior:'smooth'});
       settings.index=next%items.length;
       clearTimeout(settings.reset);
       settings.reset=setTimeout(()=>{
         if(next>=items.length)snapToFirst();
         settings.automatic=false;
       },740);
     },4300);
   }
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
   const mobile=window.matchMedia('(max-width:760px)').matches;
   if(mobile&&section==='NFL'){
     const feed=$('freeTakes'),ranking=$('aeSportTakeRanking');
     if(feed&&ranking?.parentElement===feed&&
        (root.parentElement!==feed||root.nextElementSibling!==ranking)){
       feed.insertBefore(root,ranking);
     }
     return;
   }
   // NFL conserva su colocación editorial original. Fuera de los deportes,
   // devolver el mismo nodo: no se duplican votos ni escuchas de eventos.
   if(section==='NFL'){
     if(root.parentElement!==sidebar||sidebar.firstElementChild!==root){
       sidebar.insertBefore(root,sidebar.firstChild);
     }
   }else if(root.parentElement!==sidebar||desktopHomeMarker.nextSibling!==root){
     desktopHomeMarker.after(root);
   }
 }
 function renderList(id,items,mode){
   const list=$(id);if(!list)return;
   clearFootballCycle(list);
   list.replaceChildren();
   const football=list.closest('#aeSportTakeLeaders')?.dataset.sport==='football';
   for(const [i,t] of items.entries()){
     const li=el('li',undefined,'ae-sport-take-item ae-sport-chef-entry');
     const number=el('span',String(i+1).padStart(2,'0'),'ae-top-take-number');
     const content=el('div',undefined,'ae-top-take-content');
     const meta=el('div',undefined,'ae-sport-take-meta');
     const author=el(football?'span':'button',(football?'':'@')+(t.author||'Aficionado'),'ae-top-take-author');
     if(!football){
       author.type='button';
       author.setAttribute('aria-label','Ver perfil de '+(t.author||'Aficionado'));
       author.addEventListener('click',()=>{
         if(t.author_id && typeof openAePublicProfile==='function')openAePublicProfile(t.author_id);
       });
     }
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
     meta.append(score,reply);
     content.append(meta,title,excerpt);
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
     list.setAttribute('aria-label',mode==='up'?'Opiniones apoyadas de NFL, desplazar hacia abajo':'Opiniones hateadas de NFL, desplazar hacia abajo');
   }else{
     list.removeAttribute('tabindex'); list.removeAttribute('role'); list.removeAttribute('aria-label');
   }
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
       .sort((a,b)=>net(b)-net(a)||Number(b.upvotes||0)-Number(a.upvotes||0)||new Date(b.created_at)-new Date(a.created_at)).slice(0,sport==='nfl'?10:3);
     const negative=data.filter(t=>net(t)<0)
       .sort((a,b)=>net(a)-net(b)||Number(b.downvotes||0)-Number(a.downvotes||0)||new Date(b.created_at)-new Date(a.created_at)).slice(0,sport==='nfl'?10:3);
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
