/* AE SPORTS · Takes libres creados por la comunidad, sin cuotas ni opciones preestablecidas. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const sports = {all:'Todos',general:'Deporte en general',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial'};
 let items = [], filter = 'all', busy = false, request = 0, activeSection = '', showAll = false;
 const footballSports=new Set(['laliga','premier','ligamx','champions']);
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;}
 function button(label,fn,cls='ae-take-button'){const n=el('button',label,cls);n.type='button';n.onclick=fn;return n;}
 function status(msg){const n=$('freeTakesStatus');if(n)n.textContent=msg;}
 async function requireLogin(){if(!db)throw Error('No hay conexión.');const r=await db.auth.getUser();if(r.error)throw r.error;if(!r.data?.user){if(typeof openUserAuthModal==='function')openUserAuthModal();return null;}return r.data.user;}
 function render(){
   const area=$('freeTakesFeed');if(!area)return;
   area.replaceChildren();
   const sorted=items.filter(t=>activeSection==='NFL'?(t.sport==='nfl'&&(!window.aeNflTakes||window.aeNflTakes.matches(t))):footballSports.has(t.sport));
   sorted.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||String(b.id||'').localeCompare(String(a.id||'')));
   const heading=$('aeTakesFeedHeading');
   if(heading)heading.textContent='Historial de Takes'+(sorted.length?' · '+sorted.length:'');
   if(!sorted.length){
     const more=$('freeTakesMore');if(more)more.hidden=true;
     const text=activeSection==='NFL'
       ? 'Todavía no hay Takes publicados en NFL. Sé el primero en abrir el debate.'
       : 'Todavía no hay Takes publicados en Fútbol.';
     area.append(el('p',text,'ae-take-empty'));
     return;
   }
   const more=$('freeTakesMore');
   if(more){more.hidden=showAll||sorted.length<=8;more.textContent='Ver todos los Takes ('+sorted.length+') →';}
   for(const t of (showAll?sorted:sorted.slice(0,8))){
     const card=el('article',null,'ae-take-card ae-free-take-card');
     // Acento basado exclusivamente en el deporte real; no altera contenido ni votos.
     card.dataset.sport=Object.prototype.hasOwnProperty.call(sports,t.sport)?t.sport:'general';
     const meta=el('div',null,'ae-take-overline');
     meta.append(el('span',sports[t.sport]||'Deportes'));
     const author=button('@'+t.author,()=>{
       if(typeof openAePublicProfile==='function')openAePublicProfile(t.author_id);
     },'ae-take-author-link');
     author.setAttribute('aria-label','Ver perfil y Takes de '+t.author);
     meta.append(author,el('span',' · '+new Date(t.created_at).toLocaleDateString('es')));
     const heading=el('h3',undefined,'ae-feed-take-title');
     const openTake=button(t.title,()=>window.aeTakeReplies?.open(t),'ae-feed-take-open');
     openTake.setAttribute('aria-label','Leer Take y abrir conversación: '+t.title);
     heading.append(openTake);
     card.append(meta,heading,el('p',t.body,'ae-free-take-body'));
     card.addEventListener('click',event=>{
       if(!event.target.closest('button'))window.aeTakeReplies?.open(t);
     });
     const row=el('div',null,'ae-free-vote-row');
     for(const [val,label,count] of [[1,'▲ Apoyar',t.upvotes],[-1,'▼ Cuestionar',t.downvotes]]){
       const b=button(label+' '+count,()=>vote(t,val,b));b.disabled=busy;b.setAttribute('aria-pressed',String(Number(t.my_vote)===val));row.append(b);
     }
     const reply=button('Responder',()=>window.aeTakeReplies?.open(t,{focusComposer:true}),'ae-take-reply-link');
     reply.setAttribute('aria-label','Responder al Take: '+t.title);
     row.append(reply);
     if(typeof currentAdmin!=='undefined'&&currentAdmin)row.append(button('Ocultar',async()=>{
       if(!confirm('¿Ocultar este Take?'))return;try{const r=await db.rpc('ae_hide_free_take',{p_take_id:t.id});if(r.error)throw r.error;await load();}catch(e){status(e.message||'No se pudo ocultar.');}
     },'ae-take-minor'));
     card.append(row);area.append(card);
   }
 }
 async function load(){
   const seq=++request;
   const area=$('freeTakesFeed');
   if(typeof db==='undefined'||!db){
     if(area)area.replaceChildren(el('p','No hay conexión con los Takes.','ae-take-empty'));
     return status('No hay conexión.');
   }
   if(area)area.replaceChildren(el('p','Cargando Takes publicados…','ae-take-empty'));
   status('');
   try {
     const r=await db.rpc('ae_public_take_feed',{p_sport:filter});
     if(seq!==request)return;
     if(r.error)throw r.error;
     items=r.data||[];
     render();
   } catch(e) {
     if(seq!==request)return;
     items=[];
     if(area)area.replaceChildren(el('p','No se pudo cargar el historial. Intenta actualizar.','ae-take-empty'));
     status('No se pudieron cargar los Takes. '+(e.message||''));
   }
 }
 async function vote(t,value,b){
   if(busy)return;
   try{
     const user=await requireLogin();if(!user)return;
     busy=true;render();
     const r=await db.rpc('ae_vote_free_take',{p_take_id:t.id,p_value:value});
     if(r.error)throw r.error;
     await load();document.dispatchEvent(new Event('ae:takes-updated'));
   }catch(e){status(e.message||'No se pudo votar.');}
   finally{busy=false;render();}
 }
 async function create(e){
   e.preventDefault();if(busy)return;
   const form=e.currentTarget,send=form.querySelector('button[type="submit"]');
   try{
     if(!await requireLogin())return;
     busy=true;send.disabled=true;
     const body=activeSection==='NFL'&&window.aeNflTakes?window.aeNflTakes.body(form.elements.body.value.trim()):form.elements.body.value.trim();
     if(body.length>1800)throw Error('El Take debe tener menos de 1800 caracteres, incluyendo el equipo y división.');
     const r=await db.rpc('ae_post_free_take',{p_sport:form.elements.sport.value,p_title:form.elements.title.value.trim(),p_body:body});
     if(r.error)throw r.error;
     form.reset();filter=activeSection==='NFL'?'nfl':'all';$('freeTakesSportFilter').value=filter;form.elements.sport.value=activeSection==='NFL'?'nfl':'laliga';await load();status('Tu Take se publicó correctamente.');document.dispatchEvent(new Event('ae:takes-updated'));
   }catch(err){status(err.message||'No se pudo publicar.');}
   finally{busy=false;send.disabled=false;}
 }
 function visibility(){
   const root=$('freeTakes');if(!root)return;
   const section=typeof currentCategory==='undefined'?'':currentCategory;
   root.hidden=section!=='Fútbol' && section!=='NFL';
   root.dataset.sport=section==='NFL'?'nfl':section==='Fútbol'?'football':'';
   if(root.hidden){activeSection='';request++;return;}
   const changed=activeSection!==section;
   activeSection=section;
   if(changed){
     filter=section==='NFL'?'nfl':'all';
     if($('freeTakesSort'))$('freeTakesSort').value='new';
     if($('aeNflFeedDivision'))$('aeNflFeedDivision').value='';
     const select=$('freeTakesSportFilter');
     const sport=$('freeTakesForm')?.elements.sport;
     const nfl=section==='NFL';
     $('freeTakesTitle').textContent=nfl?'Takes de la comunidad · NFL':'Takes de la comunidad · Fútbol';
     $('freeTakeSportLabel').hidden=nfl;
     $('freeTakesFilterWrap').hidden=nfl;
     if(window.aeNflTakes)window.aeNflTakes.visibility(nfl);
     for(const option of sport.options){
       const available=nfl?option.value==='nfl':footballSports.has(option.value);
       option.hidden=!available;option.disabled=!available;
     }
     for(const option of select.options){
       const available=nfl?option.value==='nfl':option.value==='all'||footballSports.has(option.value);
       option.hidden=!available;option.disabled=!available;
     }
     sport.value=nfl?'nfl':'laliga';
     select.value=filter;
   }
   if(changed){items=[];showAll=false;load();}
   else if(!items.length && !busy)load();
 }
 window.renderFreeTakesVisibility=visibility;
 window.aeOpenTakeComposer=(requestedSport)=>{
   const section=requestedSport==='NFL'||requestedSport==='Fútbol'
     ?requestedSport:(activeSection==='NFL'?'NFL':'Fútbol');
   if(typeof window.filterByCategory==='function')window.filterByCategory(section);
   else if(typeof filterByCategory==='function')filterByCategory(section);
   const panel=$('aeTakeComposePanel');if(!panel)return;
   panel.open=true;
   $('aeSportTakePublish')?.setAttribute('aria-expanded','true');
   panel.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
   window.setTimeout(()=>$('freeTakesForm')?.elements?.title?.focus({preventScroll:true}),170);
 };
 document.addEventListener('DOMContentLoaded',()=>{
   $('freeTakesForm')?.addEventListener('submit',create);
   $('freeTakesMore')?.addEventListener('click',()=>{showAll=true;render();});
   $('aeSportTakePublish')?.addEventListener('click',()=>window.aeOpenTakeComposer());
   $('aeTakeComposePanel')?.addEventListener('toggle',event=>{
     $('aeSportTakePublish')?.setAttribute('aria-expanded',String(event.currentTarget.open));
   });
   $('freeTakesSportFilter')?.addEventListener('change',e=>{filter=e.target.value;load();});
   // Historial cronológico: los controles ocultos no modifican el orden.
   document.addEventListener('ae:nfl-filter-updated',render);
   db?.auth.onAuthStateChange(()=>setTimeout(()=>{if(typeof currentCategory!=='undefined'&&(currentCategory==='Fútbol'||currentCategory==='NFL'))load();},150));
   visibility();
   try{window.aeNflTakes?.init();}catch(error){console.error('No se pudo inicializar el selector NFL.',error);}
 });
})();