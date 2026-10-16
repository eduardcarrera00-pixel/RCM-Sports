/* AE SPORTS: destacados de Takes por deporte, sin sustituir los comentarios de portada. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const footballSports=new Set(['laliga','premier','ligamx','champions']);
 let request=0,current='',lastRun=0;
 const el=(tag,text,cls)=>{
   const n=document.createElement(tag);
   if(text!==undefined)n.textContent=String(text);
   if(cls)n.className=cls;
   return n;
 };
 let desktopHomeMarker=null;
 function syncFootballDesktopPlacement(){
   const root=$('aeSportTakeLeaders');
   if(!root || window.matchMedia('(max-width:760px)').matches)return;
   const layout=document.querySelector('#mainContent .editorial-layout');
   const sidebar=layout?.querySelector('aside');
   if(!layout||!sidebar)return;
   if(!desktopHomeMarker){
     desktopHomeMarker=document.createComment('AE Sports: posición original de Takes deportivos');
     sidebar.insertBefore(desktopHomeMarker,root.parentElement===sidebar?root:null);
   }
   if(typeof currentCategory!=='undefined' && currentCategory==='Fútbol'){
     if(root.parentElement!==layout) layout.appendChild(root);
   } else if(root.parentElement!==sidebar){
     desktopHomeMarker.after(root);
   }
 }
 function renderList(id,items,mode){
   const list=$(id);if(!list)return;
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
     const takeText=football?String(t.body||t.title||'Ver Take').trim():String(t.title||'Ver Take');
     const openTake=el('button',takeText,'ae-sport-take-open');
     openTake.type='button';
     openTake.setAttribute('aria-label','Leer Take y ver su conversación: '+(t.title||'Publicación'));
     openTake.addEventListener('click',()=>window.aeTakeReplies?.open(t));
     title.append(openTake);
     const stats=el('div',undefined,'ae-sport-take-statline');
     const reply=el('button','Responder','ae-top-take-reply');
     reply.type='button';
     reply.setAttribute('aria-label','Responder al Take: '+(t.title||'Publicación'));
     reply.addEventListener('click',()=>window.aeTakeReplies?.open(t,{focusComposer:true}));
     if(football){
       meta.append(score);
       stats.append(reply);
     }else{
       stats.append(score,reply);
     }
     content.append(meta,title,stats);
     li.append(number,content);
     li.addEventListener('click',event=>{
       if(!event.target.closest('button'))window.aeTakeReplies?.open(t);
     });
     list.append(li);
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
   if(!sport){current='';request++;return;}
   // Los destacados deportivos tienen nombres propios; los de portada
   // (#aeTopTakesPositiveTitle / #aeTopTakesNegativeTitle) no se modifican.
   $('aeSportGeniosTitle').textContent=sport==='nfl'?'NFL Savant':'Respira fútbol';
   $('aeSportAnoetosTitle').textContent=sport==='nfl'?'NFL Rookie':'Vende Humos';
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
       .sort((a,b)=>net(b)-net(a)||Number(b.upvotes||0)-Number(a.upvotes||0)||new Date(b.created_at)-new Date(a.created_at)).slice(0,3);
     const negative=data.filter(t=>net(t)<0)
       .sort((a,b)=>net(a)-net(b)||Number(b.downvotes||0)-Number(a.downvotes||0)||new Date(b.created_at)-new Date(a.created_at)).slice(0,3);
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
 document.addEventListener('DOMContentLoaded',()=>refresh(true));
 window.matchMedia('(min-width:761px)').addEventListener('change',()=>{
   syncFootballDesktopPlacement();
   if(window.matchMedia('(min-width:761px)').matches)refresh(true);
 });
 document.addEventListener('ae:takes-updated',()=>refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
