/* AE SPORTS · Takes libres creados por la comunidad, sin cuotas ni opciones preestablecidas. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const sports = {all:'Todos',general:'Deporte en general',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial'};
 let items = [], filter = 'all', order = 'new', busy = false, request = 0, activeSection = '';
 const footballSports=new Set(['laliga','premier','ligamx','champions']);
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n;}
 function button(label,fn,cls='ae-take-button'){const n=el('button',label,cls);n.type='button';n.onclick=fn;return n;}
 function status(msg){const n=$('freeTakesStatus');if(n)n.textContent=msg;}
 async function requireLogin(){if(!db)throw Error('No hay conexión.');const r=await db.auth.getUser();if(r.error)throw r.error;if(!r.data?.user){if(typeof openUserAuthModal==='function')openUserAuthModal();return null;}return r.data.user;}
 function render(){
   const area=$('freeTakesFeed');if(!area)return;
   area.replaceChildren();
   const sorted=items.filter(t=>activeSection==='NFL'?t.sport==='nfl':footballSports.has(t.sport));if(order==='top')sorted.sort((a,b)=>(b.upvotes-b.downvotes)-(a.upvotes-a.downvotes)||new Date(b.created_at)-new Date(a.created_at));
   if(!sorted.length){area.append(el('p','Todavía no hay Takes. Comparte una opinión para abrir la conversación.','ae-take-empty'));return;}
   for(const t of sorted){
     const card=el('article',null,'ae-take-card ae-free-take-card');
     const meta=el('div',null,'ae-take-overline');
     meta.append(el('span',(sports[t.sport]||'Deportes')+' · '));
     const author=button('@'+t.author,()=>{
       if(typeof openAePublicProfile==='function')openAePublicProfile(t.author_id);
     },'ae-take-author-link');
     author.setAttribute('aria-label','Ver perfil y Takes de '+t.author);
     meta.append(author,el('span',' · '+new Date(t.created_at).toLocaleDateString('es')));
     card.append(meta,el('h3',t.title),el('p',t.body,'ae-free-take-body'));
     const row=el('div',null,'ae-free-vote-row');
     for(const [val,label,count] of [[1,'▲ Apoyar',t.upvotes],[-1,'▼ Cuestionar',t.downvotes]]){
       const b=button(label+' '+count,()=>vote(t,val,b));b.disabled=busy;b.setAttribute('aria-pressed',String(Number(t.my_vote)===val));row.append(b);
     }
     row.append(el('span','Balance '+(t.upvotes-t.downvotes),'ae-free-take-score'));
     if(typeof currentAdmin!=='undefined'&&currentAdmin)row.append(button('Ocultar',async()=>{
       if(!confirm('¿Ocultar este Take?'))return;try{const r=await db.rpc('ae_hide_free_take',{p_take_id:t.id});if(r.error)throw r.error;await load();}catch(e){status(e.message||'No se pudo ocultar.');}
     },'ae-take-minor'));
     card.append(row);area.append(card);
   }
 }
 async function load(){
   if(!db)return status('No hay conexión.');
   const seq=++request;
   const r=await db.rpc('ae_public_take_feed',{p_sport:filter});
   if(seq!==request)return;
   if(r.error)return status('No se pudieron cargar los Takes. '+r.error.message);
   items=r.data||[];status('');render();
 }
 async function vote(t,value,b){
   if(busy)return;
   try{
     const user=await requireLogin();if(!user)return;
     busy=true;render();
     const r=await db.rpc('ae_vote_free_take',{p_take_id:t.id,p_value:value});
     if(r.error)throw r.error;
     await load();
   }catch(e){status(e.message||'No se pudo votar.');}
   finally{busy=false;render();}
 }
 async function create(e){
   e.preventDefault();if(busy)return;
   const form=e.currentTarget,send=form.querySelector('button[type="submit"]');
   try{
     if(!await requireLogin())return;
     busy=true;send.disabled=true;
     const r=await db.rpc('ae_post_free_take',{p_sport:form.elements.sport.value,p_title:form.elements.title.value.trim(),p_body:form.elements.body.value.trim()});
     if(r.error)throw r.error;
     form.reset();filter=activeSection==='NFL'?'nfl':'all';$('freeTakesSportFilter').value=filter;form.elements.sport.value=activeSection==='NFL'?'nfl':'laliga';await load();status('Tu Take se publicó correctamente.');
   }catch(err){status(err.message||'No se pudo publicar.');}
   finally{busy=false;send.disabled=false;}
 }
 function visibility(){
   const root=$('freeTakes');if(!root)return;
   const section=typeof currentCategory==='undefined'?'':currentCategory;
   root.hidden=section!=='Fútbol' && section!=='NFL';
   if(root.hidden){activeSection='';return;}
   const changed=activeSection!==section;
   activeSection=section;
   if(changed){
     filter=section==='NFL'?'nfl':'all';
     const select=$('freeTakesSportFilter');
     const sport=$('freeTakesForm')?.elements.sport;
     const nfl=section==='NFL';
     $('freeTakesTitle').textContent=nfl?'Takes de la comunidad · NFL':'Takes de la comunidad · Fútbol';
     $('freeTakeSportLabel').hidden=nfl;
     $('freeTakesFilterWrap').hidden=nfl;
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
   if(changed)load();
 }
 window.renderFreeTakesVisibility=visibility;
 document.addEventListener('DOMContentLoaded',()=>{
   $('freeTakesForm')?.addEventListener('submit',create);
   $('freeTakesSportFilter')?.addEventListener('change',e=>{filter=e.target.value;load();});
   $('freeTakesSort')?.addEventListener('change',e=>{order=e.target.value;render();});
   db?.auth.onAuthStateChange(()=>setTimeout(()=>{if(typeof currentCategory!=='undefined'&&(currentCategory==='Fútbol'||currentCategory==='NFL'))load();},150));
   visibility();
 });
})();