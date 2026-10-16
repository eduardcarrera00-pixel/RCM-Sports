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
 function renderList(id,items,mode) {
   const list=$(id);if(!list)return;
   list.replaceChildren();
   for(const [i,t] of items.entries()) {
     const li=el('li',undefined,'ae-sport-take-item');
     li.append(el('span',String(i+1).padStart(2,'0'),'ae-top-take-number'));
     const content=el('div',undefined,'ae-top-take-content');
     // El deporte ya se conoce por la sección. Mostramos sólo el autor,
     // clicable para consultar su perfil, sin insignia ni recuadro.
     const meta=el('div',undefined,'ae-sport-take-meta');
     const author=el('button','@'+(t.author||'Aficionado'),'ae-top-take-author');
     author.type='button';
     author.setAttribute('aria-label','Ver perfil de '+(t.author||'Aficionado'));
     author.addEventListener('click',()=>{
       if(typeof openAePublicProfile==='function')openAePublicProfile(t.author_id);
     });
     meta.append(author);
     content.append(meta);
     const title=el('strong',undefined,'ae-sport-take-title');
     const openTake=el('button',t.title,'ae-sport-take-open');
     openTake.type='button';
     openTake.setAttribute('aria-label','Leer Take y ver su conversación: '+t.title);
     openTake.addEventListener('click',()=>window.aeTakeReplies?.open(t));
     title.append(openTake);
     content.append(title);
     const excerpt=String(t.body||'').replace(/^NFL[^\n]*\n\n/,'').trim();
     if(excerpt)content.append(el('p',excerpt.length>145?excerpt.slice(0,142).trimEnd()+'…':excerpt,'ae-sport-take-summary'));
     const score=el('span',undefined,'ae-top-take-votes');
     score.append(el('span','▲ '+Number(t.upvotes||0),'ae-top-take-up'),el('span','▼ '+Number(t.downvotes||0),'ae-top-take-down'));
     const reply=el('button','Responder','ae-top-take-reply');
     reply.type='button';
     reply.setAttribute('aria-label','Responder al Take: '+t.title);
     reply.addEventListener('click',()=>window.aeTakeReplies?.open(t,{focusComposer:true}));
     score.append(reply);
     content.append(score);
     li.append(content);
     li.addEventListener('click',event=>{
       if(!event.target.closest('button'))window.aeTakeReplies?.open(t);
     });
     list.append(li);
   }
   if(!items.length)list.append(el('li',mode==='up'?'Todavía no hay Takes con votos positivos.':'Todavía no hay Takes con votos negativos.','ae-top-takes-empty'));
 }
 async function refresh(force=false) {
   const section=typeof currentCategory==='undefined'?'':currentCategory;
   const root=$('aeSportTakeLeaders'),voices=document.querySelector('.editorial-community');
   if(!root||!voices)return;
   const sport=section==='NFL'?'nfl':section==='Fútbol'?'football':'';
   root.hidden=!sport;voices.hidden=!!sport;
   root.dataset.sport=sport;
   if(!sport){current='';return;}
   // Los destacados deportivos tienen nombres propios; los de portada
   // (#aeTopTakesPositiveTitle / #aeTopTakesNegativeTitle) no se modifican.
   $('aeSportGeniosTitle').textContent=sport==='nfl'?'NFL Savant':'Respira fútbol';
   $('aeSportAnoetosTitle').textContent=sport==='nfl'?'NFL Rookie':'Vende Humos';
   $('aeSportTakeTitle').textContent='Takes históricos';
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
     const positive=data.filter(t=>Number(t.upvotes)>0).sort((a,b)=>Number(b.upvotes)-Number(a.upvotes)||Number(a.downvotes)-Number(b.downvotes)||new Date(b.created_at)-new Date(a.created_at)).slice(0,3);
     const negative=data.filter(t=>Number(t.downvotes)>0).sort((a,b)=>Number(b.downvotes)-Number(a.downvotes)||Number(a.upvotes)-Number(b.upvotes)||new Date(b.created_at)-new Date(a.created_at)).slice(0,3);
     renderList('aeSportTakePositive',positive,'up');
     renderList('aeSportTakeNegative',negative,'down');
     status.textContent='Clasificación según los votos de Takes de '+(sport==='nfl'?'NFL.':'Fútbol.');
     lastRun=Date.now();
   }catch(e){
     if(seq===request)status.textContent='No se pudieron cargar los Takes destacados.';
   }
 }
 window.refreshAeSportTopTakes=refresh;
 document.addEventListener('DOMContentLoaded',()=>refresh(true));
 document.addEventListener('ae:takes-updated',()=>refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
