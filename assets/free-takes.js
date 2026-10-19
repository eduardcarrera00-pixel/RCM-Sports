/* AE SPORTS · Takes libres creados por la comunidad, sin cuotas ni opciones preestablecidas. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const sports = {all:'Todos',general:'Deporte en general',football:'Fútbol',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial'};
 let items = [], filter = 'all', busy = false, request = 0, activeSection = '', viewerId = null;
 let replyCounts = null;
 const footballSports=new Set(['football','laliga','premier','ligamx','champions']);
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;}
 function button(label,fn,cls='ae-take-button'){const n=el('button',label,cls);n.type='button';n.onclick=fn;return n;}
 function status(msg){
   const n=$('freeTakesStatus');if(n)n.textContent=msg;
   const modal=$('aeTakeComposerStatus');if(modal)modal.textContent=msg;
 }
 async function requireLogin(resumeComposer=false){
  if(!db)throw Error('No hay conexión.');
  const r=await db.auth.getUser();
  if(r.error&&r.error.name!=='AuthSessionMissingError'&&r.error.code!=='session_not_found')throw r.error;
  if(!r.data?.user){
    if(resumeComposer&&typeof aeRequestPublication==='function'){
      const dialog=$('aeTakeComposerDialog');
      if(dialog?.open)dialog.close();
      await aeRequestPublication('take',()=>{if(dialog&&!dialog.open)dialog.showModal();});
    }else if(typeof openUserAuthModal==='function')openUserAuthModal();
    return null;
  }
  return r.data.user;
}
 function latestTakes(){
   return items.filter(t=>activeSection==='NFL'?(t.sport==='nfl'&&(!window.aeNflTakes||window.aeNflTakes.matches(t))):footballSports.has(t.sport))
     .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||String(b.id||'').localeCompare(String(a.id||'')))
     .slice(0,20);
 }
 function showReplyCount(reply,t){
   const count=replyCounts?.get(String(t.id))??(replyCounts?0:null);
   const badge=reply.querySelector('.ae-take-reply-count');
   badge.textContent=count===null?'—':String(count);
   reply.setAttribute('aria-label','Responder al Take: '+t.title+'. '+(count===null?'Número de respuestas no disponible':count+' '+(count===1?'respuesta':'respuestas')));
 }
 async function loadReplyCounts(seq){
   const takes=latestTakes();
   if(!takes.length)return;
   try{
     const result=await db.rpc('ae_public_take_reply_counts',{p_take_ids:takes.map(t=>t.id)});
     if(seq!==request)return;
     if(result.error)throw result.error;
     replyCounts=new Map((result.data||[]).map(r=>[String(r.take_id),Math.max(0,Number(r.reply_count)||0)]));
     const byId=new Map(takes.map(t=>[String(t.id),t]));
     $('freeTakesFeed')?.querySelectorAll('article[data-take-id]').forEach(card=>{
       const take=byId.get(card.dataset.takeId);
       if(take)showReplyCount(card.querySelector('.ae-take-reply-link'),take);
     });
   }catch(_){
     // El fallo de los contadores no debe ocultar los Takes ni inventar ceros.
   }
 }
 function render(){
   const area=$('freeTakesFeed');if(!area)return;
   area.replaceChildren();
   const sorted=latestTakes();
   area.setAttribute('aria-label','Últimos Takes de '+(activeSection==='NFL'?'NFL':'Fútbol')+'. Desplázate hacia abajo para leer más.');
   const heading=$('aeTakesFeedHeading');
   if(heading)heading.textContent='Últimos Takes';
   if(!sorted.length){
     const more=$('freeTakesMore');if(more)more.hidden=true;
     const text=activeSection==='NFL'
       ? 'Todavía no hay Takes publicados en NFL. Sé el primero en abrir el debate.'
       : 'Todavía no hay Takes publicados en Fútbol.';
     area.append(el('p',text,'ae-take-empty'));
     return;
   }
   const more=$('freeTakesMore');
   if(more)more.hidden=true;
   // Both sports keep their 20 latest posts in a two-card scroll viewport.
   for(const t of sorted){
     const card=el('article',null,'ae-take-card ae-free-take-card');
     card.dataset.takeId=String(t.id);
     // Acento basado exclusivamente en el deporte real; no altera contenido ni votos.
     card.dataset.sport=Object.prototype.hasOwnProperty.call(sports,t.sport)?t.sport:'general';
     const meta=el('div',null,'ae-take-overline');
     meta.append(el('span',t.competition||sports[t.sport]||'Deportes'));
     const author=button('@'+t.author,()=>{
       if(typeof openAePublicProfile==='function')openAePublicProfile(t.author_id);
     },'ae-take-author-link');
     author.setAttribute('aria-label','Ver perfil y Takes de '+t.author);
     const date=el('time',new Date(t.created_at).toLocaleDateString('es',{day:'numeric',month:'short'}),'ae-take-date');
     date.dateTime=t.created_at;
     meta.append(author,date);
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
     reply.append(el('span',null,'ae-take-reply-count'));
     showReplyCount(reply,t);
     row.append(reply);
     if(typeof currentAdmin!=='undefined'&&currentAdmin)row.append(button('Ocultar',async()=>{
       if(!confirm('¿Ocultar este Take?'))return;try{const r=await db.rpc('ae_hide_free_take',{p_take_id:t.id});if(r.error)throw r.error;await load();}catch(e){status(e.message||'No se pudo ocultar.');}
     },'ae-take-minor'));
     card.append(row);area.append(card);
   }
 }
 async function load(){
   const seq=++request;
   replyCounts=null;
   const area=$('freeTakesFeed');
   if(typeof db==='undefined'||!db){
     if(area)area.replaceChildren(el('p','No hay conexión con los Takes.','ae-take-empty'));
     return status('No hay conexión.');
   }
   if(area)area.replaceChildren(el('p','Cargando Takes publicados…','ae-take-empty'));
   status('');
   try {
     const [r, viewer] = await Promise.all([
       db.rpc('ae_public_take_feed',{p_sport:filter}),
       db.auth.getUser().catch(()=>({data:{user:null}}))
     ]);
     if(seq!==request)return;
     if(r.error)throw r.error;
     viewerId=viewer.data?.user?.id||null;
     items=r.data||[];
     render();
     await loadReplyCounts(seq);
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
     if(!await requireLogin(true))return;
     const selected=form.elements.sport.value;
     const competition=form.elements.competition.value.trim();
     const title=form.elements.title.value.trim();
     const body=form.elements.body.value.trim();
     if(!['football','nfl'].includes(selected))throw Error('Elige Fútbol o NFL.');
     if(competition.length<2||competition.length>80)throw Error('Escribe el deporte o competición.');
     if(body.length>1800)throw Error('El Take debe tener menos de 1800 caracteres.');
     busy=true;send.disabled=true;status('');
     const r=await db.rpc('ae_post_free_take',{
       p_sport:selected,
       p_competition:competition,
       p_title:title,
       p_body:body
     });
     if(r.error)throw r.error;
     window.aeDraftGuard?.clear('take');
     form.reset();
     if(activeSection)await load();
     document.dispatchEvent(new Event('ae:takes-updated'));
     send.textContent='Publicado ✓';
     status('Take publicado. Puedes escribir otro o cerrar con la cruz.');
   }catch(err){status(err.message||'No se pudo publicar.');}
   finally{busy=false;send.disabled=false;}
 }
 function visibility(){
   const root=$('freeTakes');if(!root)return;
   const section=typeof currentCategory==='undefined'?'':currentCategory;
   root.hidden=section!=='Fútbol' && section!=='NFL';
   root.dataset.sport=section==='NFL'?'nfl':section==='Fútbol'?'football':'';
   if(root.hidden){activeSection='';request++;window.aeTakeRankings?.setSport('');return;}
   const changed=activeSection!==section;
   activeSection=section;
   window.aeTakeRankings?.setSport(section);
   if(changed){
     filter=section==='NFL'?'nfl':'all';
     if($('freeTakesSort'))$('freeTakesSort').value='new';
     if($('aeNflFeedDivision'))$('aeNflFeedDivision').value='';
     if($('aeNflFeedFilterWrap'))$('aeNflFeedFilterWrap').hidden=true;
     if($('freeTakesFilterWrap'))$('freeTakesFilterWrap').hidden=true;
     if($('freeTakesSportFilter'))$('freeTakesSportFilter').value=filter;
     $('freeTakesTitle').textContent='Demuestra tu conocimiento';
   }
   if(changed){items=[];load();}
   else if(!items.length && !busy)load();
 }
 window.renderFreeTakesVisibility=visibility;
 window.aeOpenTakeComposer=(requestedSport)=>{
  if(typeof aeRequestPublication!=='function')return;
  return aeRequestPublication('take',async()=>{
   await window.aeDraftGuard?.restore('take');
   const dialog=$('aeTakeComposerDialog');
   const form=$('freeTakesForm');
   if(!dialog||!form)return;
   if(dialog.open)return;
   status('');
   form.querySelector('button[type="submit"]').textContent='Publicar mi Take';
   const hasDraft=Boolean(form.elements.competition.value||form.elements.title.value||form.elements.body.value);
   const section=requestedSport==='NFL'||requestedSport==='Fútbol'
     ?requestedSport:(activeSection==='NFL'||activeSection==='Fútbol'?activeSection:'');
   const value=section==='NFL'?'nfl':section==='Fútbol'?'football':'';
   if(value&&!hasDraft){
     const radio=form.querySelector('input[name="sport"][value="'+value+'"]');
     if(radio)radio.checked=true;
   }
   if(!dialog.open)dialog.showModal();
   window.setTimeout(()=>{
     const focusTarget=value?form.elements.competition:form.querySelector('input[name="sport"]');
     focusTarget?.focus();
   },40);
  });
 };
 document.addEventListener('DOMContentLoaded',()=>{
   $('freeTakesForm')?.addEventListener('submit',create);
   $('freeTakesForm')?.addEventListener('input',()=>{
     if(!busy)$('freeTakesForm').querySelector('button[type="submit"]').textContent='Publicar mi Take';
   });
   $('aeSportTakePublish')?.addEventListener('click',()=>window.aeOpenTakeComposer());
   $('aeTakeComposerClose')?.addEventListener('click',()=>$('aeTakeComposerDialog')?.close());
   // Keep drafts open during backdrop taps, Escape and mobile back gestures.
   $('aeTakeComposerDialog')?.addEventListener('cancel',event=>event.preventDefault());
   $('freeTakesSportFilter')?.addEventListener('change',e=>{filter=e.target.value;load();});
   db?.auth.onAuthStateChange(()=>setTimeout(()=>{if(typeof currentCategory!=='undefined'&&(currentCategory==='Fútbol'||currentCategory==='NFL'))load();},150));
   document.addEventListener('ae:takes-updated',()=>{
     if(activeSection==='NFL'||activeSection==='Fútbol')load();
   });
   visibility();
 });
})();
