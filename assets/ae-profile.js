/* AE SPORTS · Private authenticated profile with the viewer's own Takes. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const el=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(cls)n.className=cls;return n;};
 const sports={laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial',general:'Deportes'};
 let sequence=0;
 async function session(){
   if(!window.db)return null;
   const {data,error}=await db.auth.getUser();
   return error?null:data?.user||null;
 }
 async function updateButton(){
   const b=$('aeMyTakesButton');if(!b)return;
   b.hidden=!(await session());
   if(b.hidden)close();
 }
 function close(){
   ++sequence;
   const dialog=$('aeProfileDialog');
   if(dialog?.open)dialog.close();
 }
 async function open(){
   const user=await session();
   if(!user){if(typeof openUserAuthModal==='function')openUserAuthModal();return;}
   const dialog=$('aeProfileDialog');
   if(!dialog)return;
   if(!dialog.open)dialog.showModal();
   $('aeProfileUsername').textContent='@'+(user.user_metadata?.username||user.user_metadata?.display_name||'Usuario');
   const target=$('aeProfileTakes'),status=$('aeProfileStatus');
   target.replaceChildren();status.textContent='Cargando tus Takes…';
   const ticket=++sequence;
   const {data,error}=await db.rpc('ae_my_free_takes');
   if(ticket!==sequence||!dialog.open)return;
   if(error){status.textContent='No se pudo cargar tu historial. '+(error.message||'Vuelve a intentarlo.');return;}
   status.textContent='';
   const entries=data||[];
   $('aeProfileCount').textContent=entries.length+' '+(entries.length===1?'Take publicado':'Takes publicados');
   if(!entries.length){target.append(el('p','Aún no has publicado Takes. Escribe tu primera opinión en Fútbol o NFL.','ae-profile-empty'));return;}
   for(const entry of entries){
     const card=el('article',undefined,'ae-profile-item');
     const date=new Date(entry.created_at);
     card.append(el('small',(sports[entry.sport]||'Deportes')+' · '+date.toLocaleDateString('es')+(entry.hidden?' · Oculto por moderación':''),'ae-profile-item-meta'),el('h3',entry.title),el('p',entry.body));
     const stats=el('div',undefined,'ae-profile-item-stats');
     stats.append(el('span','▲ '+entry.upvotes+' apoyos'),el('span','▼ '+entry.downvotes+' cuestionamientos'));
     card.append(stats);target.append(card);
   }
 }
 window.openAeProfile=open;
 window.closeAeProfile=close;
 document.addEventListener('DOMContentLoaded',()=>{
   updateButton();
   if(window.db)db.auth.onAuthStateChange(()=>setTimeout(updateButton,120));
   $('aeProfileDialog')?.addEventListener('click',e=>{if(e.target===$('aeProfileDialog'))close();});
   $('aeProfileDialog')?.addEventListener('close',()=>{++sequence;});
 });
})();