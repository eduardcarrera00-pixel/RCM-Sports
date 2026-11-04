/* AE SPORTS · Takes libres creados por la comunidad, sin cuotas ni opciones preestablecidas. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const sports = {all:'Todos',general:'Deporte en general',football:'Fútbol',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial'};
 let items = [], filter = 'all', busy = false, request = 0, activeSection = '', viewerId = null;
 let replyCounts = null;
 let footballVisibleCount=20;
 const footballSports=new Set(['football','laliga','premier','ligamx','champions']);
 // Tarjeta rápida (3 nov 2026): votar y responder sin salir de «Últimos Takes».
 // openReply = id del Take con el cuadro de respuesta abierto; drafts guarda lo escrito
 // para que una recarga (p. ej. tras iniciar sesión) no lo borre.
 let openReply=null;
 const drafts=new Map(), notes=new Map(), pendingVotes=new Set(), posting=new Set();
 const SVG={
   up:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5.5 5 13.5h4.4V19h5.2v-5.5H19z"/></svg>',
   down:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 18.5 19 10.5h-4.4V5H9.4v5.5H5z"/></svg>',
   reply:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 11.5c0 4-3.6 7-8 7-1.2 0-2.3-.2-3.3-.6L4 19.5l1.3-3.6C4.5 14.7 4 13.2 4 11.5c0-4 3.6-7 8-7s8 3 8 7Z"/></svg>',
   share:'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 11v8.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V11"/></svg>'
 };
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;}
 function button(label,fn,cls='ae-take-button'){const n=el('button',label,cls);n.type='button';n.onclick=fn;return n;}
 // Los Takes de NFL guardan su contexto (división, equipo, tema) en la primera línea.
 function splitNflContext(t){
   const text=String(t.body||'').replace(/\r\n/g,'\n').trim();
   if(t.sport!=='nfl')return {context:'',text};
   const match=text.match(/^NFL((?: · [^\n]*)?)\n\n/);
   if(!match)return {context:'',text};
   return {context:match[1].replace(/^ · /,''),text:text.slice(match[0].length).trim()};
 }
 function kicker(t){
   if(t.sport==='nfl'){
     const {context}=splitNflContext(t);
     const competition=String(t.competition||'').trim();
     return ['NFL',competition&&competition.toUpperCase()!=='NFL'?competition:'',context].filter(Boolean).join(' · ');
   }
   return t.competition||sports[t.sport]||'Deportes';
 }
 const cssId=v=>window.CSS?.escape?window.CSS.escape(String(v)):String(v).replace(/["\\]/g,'\\$&');
 function isOwn(t){return Boolean(viewerId&&t.author_id&&String(viewerId)===String(t.author_id));}
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
 function sortedSectionTakes(){
   return items.filter(t=>activeSection==='NFL'?(t.sport==='nfl'&&(!window.aeNflTakes||window.aeNflTakes.matches(t))):footballSports.has(t.sport))
     .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||String(b.id||'').localeCompare(String(a.id||'')));
 }
 function latestTakes(){return sortedSectionTakes().slice(0,footballVisibleCount);}
 function replyCount(t){return replyCounts?.get(String(t.id))??(replyCounts?0:null);}
 function showReplyCount(reply,t){
   if(!reply)return;
   const count=replyCount(t);
   const badge=reply.querySelector('.ae-take-reply-count');
   badge.textContent=count===null?'':String(count);
   badge.hidden=!count;
   reply.setAttribute('aria-label','Responder al Take: '+t.title+'. '+(count===null?'Número de respuestas no disponible':count+' '+(count===1?'respuesta':'respuestas')));
   const link=reply.closest('article')?.querySelector('.cam-tk-quick-open');
   if(link)link.textContent=count?'Ver conversación ('+count+') ›':'Ver conversación ›';
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
       if(take)showReplyCount(card.querySelector('.cam-tk-reply'),take);
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
   if(more){
     const remaining=Math.max(0,sortedSectionTakes().length-sorted.length);
     more.hidden=!remaining;
     if(remaining)more.textContent='Ver '+Math.min(20,remaining)+' Takes anteriores →';
   }
   // Fútbol y NFL comparten la misma tarjeta: Take, extracto, votos y respuesta rápida.
   for(const t of sorted)area.append(buildCard(t));
 }
 function buildCard(t){
   const own=isOwn(t);
   const id=String(t.id);
   const card=el('article',null,'ae-free-take-card cam-tk');
   card.dataset.takeId=id;
   // Acento basado exclusivamente en el deporte real; no altera contenido ni votos.
   card.dataset.sport=Object.prototype.hasOwnProperty.call(sports,t.sport)?t.sport:'general';

   // Autor y fecha arriba, como una publicación; compartir a la derecha.
   const top=el('div',null,'cam-tk-top');
   const name=String(t.author||'Aficionado').replace(/^@+/,'');
   const avatar=el('span',name.charAt(0).toUpperCase()||'A','cam-tk-avatar');
   avatar.setAttribute('aria-hidden','true');
   const author=button('@'+name,()=>{
     if(typeof openAePublicProfile==='function'&&t.author_id)openAePublicProfile(t.author_id);
   },'ae-take-author-link cam-tk-author');
   author.setAttribute('aria-label','Ver perfil y Takes de '+name);
   const when=new Date(t.created_at);
   const date=el('time',Number.isNaN(when.getTime())?'':when.toLocaleDateString('es',{day:'numeric',month:'short'}),'ae-take-date cam-tk-date');
   date.dateTime=t.created_at||'';
   top.append(avatar,author,date);
   // Botón pequeño para compartir el Take como ficha «La cita».
   if(window.CamPickShare&&t.author_id){
     const share=button(null,()=>window.CamPickShare.open(t,{kind:'take',opener:share}),'cam-take-share-mini cam-tk-share');
     share.setAttribute('aria-label','Compartir Take: '+t.title);
     share.title='Compartir';
     share.innerHTML=SVG.share;
     top.append(share);
   }

   const label=el('p',kicker(t),'cam-tk-kicker');
   const heading=el('h3',undefined,'cam-tk-title');
   const openTake=button(t.title,()=>window.aeTakeReplies?.open(t),'cam-tk-open');
   openTake.setAttribute('aria-label','Leer Take y abrir conversación: '+t.title);
   heading.append(openTake);
   const preview=splitNflContext(t).text;
   card.append(top,label,heading);
   if(preview)card.append(el('p',preview,'cam-tk-excerpt'));

   // Acciones: votar arriba/abajo y responder, siempre visibles en la tarjeta.
   const actions=el('div',null,'cam-tk-actions');
   const votes=el('div',null,'cam-tk-vote');
   votes.setAttribute('role','group');
   votes.setAttribute('aria-label','Votar este Take');
   const pending=pendingVotes.has(id);
   for(const [val,count] of [[1,t.upvotes],[-1,t.downvotes]]){
     const n=Math.max(0,Number(count)||0);
     const b=button(null,()=>vote(t,val),'cam-football-vote cam-tk-vote-btn');
     b.dataset.vote=val===1?'up':'down';
     b.innerHTML=val===1?SVG.up:SVG.down;
     b.append(el('span',String(n),'cam-football-vote-count'));
     b.disabled=busy||own||pending;
     b.setAttribute('aria-pressed',String(Number(t.my_vote)===val));
     b.setAttribute('aria-label',(val===1?'Apoyar este Take. Votos a favor: ':'Cuestionar este Take. Votos en contra: ')+n+(own?'. No puedes votar tu propio Take.':''));
     b.title=own?'No puedes votar tu propio Take':(val===1?'Apoyar':'Cuestionar');
     votes.append(b);
   }
   const reply=button(null,()=>toggleQuick(t),'ae-take-reply-link cam-football-replies cam-tk-reply');
   reply.innerHTML=SVG.reply;
   reply.append(el('span','Responder','cam-tk-reply-label'),el('span',null,'ae-take-reply-count'));
   reply.setAttribute('aria-expanded',String(openReply===id));
   reply.setAttribute('aria-controls','camTkQuick-'+id);
   showReplyCount(reply,t);
   actions.append(votes,reply);
   if(typeof currentAdmin!=='undefined'&&currentAdmin)actions.append(button('Ocultar',async()=>{
     if(!confirm('¿Ocultar este Take?'))return;try{const r=await db.rpc('ae_hide_free_take',{p_take_id:t.id});if(r.error)throw r.error;await load();}catch(e){status(e.message||'No se pudo ocultar.');}
   },'ae-take-minor cam-tk-hide'));
   card.append(actions);

   // Respuesta rápida dentro del cuadro.
   const form=el('form',null,'cam-tk-quick');
   form.id='camTkQuick-'+id;
   form.hidden=openReply!==id;
   form.noValidate=true;
   const field=el('textarea',null,'cam-tk-quick-text');
   field.name='body';
   field.rows=2;
   field.maxLength=900;
   field.placeholder='Responde a @'+name+'…';
   field.setAttribute('aria-label','Tu respuesta al Take: '+t.title);
   field.value=drafts.get(id)||'';
   field.addEventListener('input',()=>{drafts.set(id,field.value);grow(field);});
   field.addEventListener('keydown',event=>{
     if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();form.requestSubmit?.();}
     if(event.key==='Escape'){event.preventDefault();closeQuick(t);}
   });
   const row=el('div',null,'cam-tk-quick-row');
   const full=button(null,()=>window.aeTakeReplies?.open(t),'cam-tk-quick-open');
   const cancel=button('Cancelar',()=>closeQuick(t),'cam-tk-quick-cancel');
   const send=el('button',posting.has(id)?'Publicando…':'Publicar','cam-tk-quick-send');
   send.type='submit';
   send.disabled=posting.has(id);
   row.append(full,cancel,send);
   form.append(field,row);
   form.addEventListener('submit',event=>{event.preventDefault();postQuick(t,form);});
   card.append(form);
   const note=el('p',notes.get(id)||'','cam-tk-note');
   note.setAttribute('role','status');
   note.setAttribute('aria-live','polite');
   card.append(note);
   showReplyCount(reply,t);

   // Tocar el título, el texto o el fondo de la tarjeta abre la conversación completa.
   card.addEventListener('click',event=>{
     if(event.target.closest('button,a,textarea,input,form,.cam-tk-note'))return;
     if(String(window.getSelection?.()||'').trim())return;
     window.aeTakeReplies?.open(t);
   });
   return card;
 }
 function grow(field){
   if(!field)return;
   field.style.height='auto';
   field.style.height=Math.min(field.scrollHeight+2,140)+'px';
 }
 function replaceCard(t,focusSelector){
   const area=$('freeTakesFeed');
   const old=area?.querySelector('article[data-take-id="'+cssId(String(t.id))+'"]');
   if(!old)return null;
   const fresh=buildCard(t);
   old.replaceWith(fresh);
   if(focusSelector)fresh.querySelector(focusSelector)?.focus({preventScroll:true});
   return fresh;
 }
 function note(t,text){
   const id=String(t.id);
   if(text)notes.set(id,text);else notes.delete(id);
   const n=$('freeTakesFeed')?.querySelector('article[data-take-id="'+cssId(id)+'"] .cam-tk-note');
   if(n)n.textContent=text||'';
 }
 function openQuick(t){
   const id=String(t.id);
   openReply=id;
   note(t,'');
   // Cierra cualquier otro cuadro abierto y abre este.
   $('freeTakesFeed')?.querySelectorAll('.cam-tk-quick:not([hidden])').forEach(form=>{
     const other=form.closest('article');
     if(other&&other.dataset.takeId!==id){
       form.hidden=true;
       other.querySelector('.cam-tk-reply')?.setAttribute('aria-expanded','false');
     }
   });
   const card=$('freeTakesFeed')?.querySelector('article[data-take-id="'+cssId(id)+'"]');
   if(!card)return;
   card.querySelector('.cam-tk-quick').hidden=false;
   card.querySelector('.cam-tk-reply')?.setAttribute('aria-expanded','true');
   const field=card.querySelector('.cam-tk-quick-text');
   grow(field);
   field?.focus({preventScroll:true});
   // Que se vean el cuadro y su botón «Publicar», también si la tarjeta está al fondo de la lista.
   card.querySelector('.cam-tk-quick-row')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
 }
 function closeQuick(t){
   const id=String(t.id);
   if(openReply===id)openReply=null;
   const card=$('freeTakesFeed')?.querySelector('article[data-take-id="'+cssId(id)+'"]');
   if(!card)return;
   card.querySelector('.cam-tk-quick').hidden=true;
   const reply=card.querySelector('.cam-tk-reply');
   reply?.setAttribute('aria-expanded','false');
   reply?.focus({preventScroll:true});
 }
 function toggleQuick(t){
   if(openReply===String(t.id))return closeQuick(t);
   // Para responder hace falta una cuenta; después de entrar se vuelve a este cuadro.
   if(typeof aeRequestPublication==='function')return aeRequestPublication('reply',()=>openQuick(t));
   requireLogin().then(user=>{if(user)openQuick(t);}).catch(e=>note(t,e.message||'No se pudo comprobar tu sesión.'));
 }
 async function postQuick(t,form){
   const id=String(t.id);
   if(posting.has(id))return;
   const text=form.elements.body.value.trim();
   if(text.length<2){note(t,'Escribe al menos dos caracteres.');form.elements.body.focus();return;}
   if(text.length>900){note(t,'La respuesta debe tener menos de 900 caracteres.');return;}
   try{
     if(typeof db==='undefined'||!db)throw Error('No hay conexión.');
     const session=await db.auth.getUser();
     if(!session.data?.user){
       drafts.set(id,text);
       if(typeof aeRequestPublication==='function')await aeRequestPublication('reply',()=>openQuick(t));
       else if(typeof openUserAuthModal==='function')openUserAuthModal();
       return;
     }
     posting.add(id);
     replaceCard(t);
     const r=await db.rpc('ae_post_take_reply',{p_take_id:t.id,p_body:text,p_parent_id:null});
     if(r.error)throw r.error;
     drafts.delete(id);
     if(openReply===id)openReply=null;
     if(replyCounts)replyCounts.set(id,(replyCounts.get(id)||0)+1);
     notes.set(id,'Respuesta publicada ✓');
     posting.delete(id);
     replaceCard(t,'.cam-tk-reply');
     setTimeout(()=>{if(notes.get(id)==='Respuesta publicada ✓')note(t,'');},6000);
     document.dispatchEvent(new CustomEvent('ae:takes-updated',{detail:{source:'feed',takeId:id}}));
   }catch(e){
     posting.delete(id);
     notes.set(id,'No se pudo publicar la respuesta. '+(e.message||''));
     replaceCard(t,'.cam-tk-quick-text');
   }finally{
     posting.delete(id);
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
 // Pasar de un voto a otro: quita el anterior y suma el nuevo (votar dos veces lo mismo lo retira).
 function applyVote(t,next){
   const prev=Number(t.my_vote)||0;
   if(prev===1)t.upvotes=Math.max(0,(Number(t.upvotes)||0)-1);
   if(prev===-1)t.downvotes=Math.max(0,(Number(t.downvotes)||0)-1);
   if(next===1)t.upvotes=(Number(t.upvotes)||0)+1;
   if(next===-1)t.downvotes=(Number(t.downvotes)||0)+1;
   t.my_vote=next||null;
 }
 async function vote(t,value){
   const id=String(t.id);
   if(busy||pendingVotes.has(id))return;
   const focus='[data-vote="'+(value===1?'up':'down')+'"]';
   try{
     const user=await requireLogin();if(!user)return;
     if(String(user.id)===String(t.author_id)){note(t,'No puedes votar tu propio Take.');return;}
     const prev=Number(t.my_vote)||0;
     const expected=prev===value?0:value;
     pendingVotes.add(id);
     applyVote(t,expected);
     note(t,'');
     replaceCard(t,focus);
     try{
       const r=await db.rpc('ae_vote_free_take',{p_take_id:t.id,p_value:value});
       if(r.error)throw r.error;
       // El servidor devuelve el voto que queda (1, -1 o 0); si no lo dice, vale lo esperado.
       const saved=[1,-1,0].includes(Number(r.data))&&r.data!==null?Number(r.data):expected;
       if(saved!==expected)applyVote(t,saved);
     }catch(e){
       applyVote(t,prev);
       notes.set(id,'No se pudo guardar tu voto. '+(e.message||''));
     }
     pendingVotes.delete(id);
     replaceCard(t,focus);
     document.dispatchEvent(new CustomEvent('ae:takes-updated',{detail:{source:'feed',takeId:id}}));
   }catch(e){note(t,e.message||'No se pudo votar.');}
   finally{pendingVotes.delete(id);}
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
     footballVisibleCount=20;
     openReply=null;
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
   $('freeTakesSportFilter')?.addEventListener('change',e=>{filter=e.target.value;footballVisibleCount=20;load();});
   $('freeTakesMore')?.addEventListener('click',()=>{
     if(activeSection!=='Fútbol'&&activeSection!=='NFL')return;
     const scroll=$('freeTakesFeed')?.scrollTop||0;
     footballVisibleCount+=20;
     render();
     const area=$('freeTakesFeed');
     if(area)area.scrollTop=scroll;
     void loadReplyCounts(request);
   });
   db?.auth.onAuthStateChange(()=>setTimeout(()=>{if(typeof currentCategory!=='undefined'&&(currentCategory==='Fútbol'||currentCategory==='NFL'))load();},150));
   document.addEventListener('ae:takes-updated',event=>{
     // Los votos y respuestas hechos en la propia tarjeta ya están pintados.
     if(event.detail?.source==='feed')return;
     if(activeSection==='NFL'||activeSection==='Fútbol')load();
   });
   visibility();
 });
})();
