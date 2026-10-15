/* AE SPORTS · Profile history for the reader and for other Take authors.
 * Only public Take text and vote totals are exposed by the public profile API.
 */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
const labels={laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial',general:'Deportes'};
let request=0,activeAuthor=null,privateView=false,working=false;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function me(){if(typeof db==='undefined'||!db)return null;const r=await db.auth.getUser();return r.error?null:r.data?.user||null;}
async function updateButton(){
 const b=$('aeMyTakesButton');if(!b)return;
 const user=await me();b.hidden=!user;
 if(!user&&privateView)close();
}
function close(){
 ++request;activeAuthor=null;privateView=false;
 const dialog=$('aeProfileDialog');if(dialog?.open)dialog.close();
 if(new URL(location.href).searchParams.has('perfil')){
  const url=new URL(location.href);url.searchParams.delete('perfil');history.replaceState({},'',url);
 }
}
function display(entries,owner,canVote){
 const target=$('aeProfileTakes');target.replaceChildren();
 $('aeProfileCount').textContent=entries.length+' '+(entries.length===1?'Take histórico':'Takes históricos');
 if(!entries.length){target.append(el('p',privateView?'Aún no has publicado Takes. Puedes escribirlos en Fútbol o NFL.':'Todavía no hay Takes públicos en este perfil.','ae-profile-empty'));return;}
 for(const entry of entries){
  const box=el('article',undefined,'ae-profile-item');
  box.append(el('small',(labels[entry.sport]||'Deportes')+' · '+new Date(entry.created_at).toLocaleDateString('es')+(entry.hidden?' · Oculto por moderación':''),'ae-profile-item-meta'),el('h3',entry.title),el('p',entry.body));
  const actions=el('div',undefined,'ae-profile-item-stats');
  actions.append(el('span','▲ '+entry.upvotes+' apoyos'),el('span','▼ '+entry.downvotes+' cuestionamientos'));
  if(canVote&&!entry.hidden){
   for(const [value,label] of [[1,'▲ Apoyar'],[-1,'▼ Cuestionar']]){
    const b=el('button',label,'ae-take-button');b.type='button';b.disabled=working;b.setAttribute('aria-pressed',String(Number(entry.my_vote)===value));
    b.addEventListener('click',async()=>{
     const viewer=await me();
     if(!viewer){if(typeof openUserAuthModal==='function')openUserAuthModal();return;}
     if(viewer.id===entry.author_id)return;
     if(working)return;working=true;b.disabled=true;
     const result=await db.rpc('ae_vote_free_take',{p_take_id:entry.id,p_value:value});
     if(result.error){$('aeProfileStatus').textContent=result.error.message;working=false;b.disabled=false;return;}
     working=false;await showPublic(owner,false);
    });actions.append(b);
   }
  }
  box.append(actions);target.append(box);
 }
}
async function showOwn(){
 const user=await me();
 if(!user){if(typeof openUserAuthModal==='function')openUserAuthModal();return;}
 privateView=true;activeAuthor=user.id;const ticket=++request;
 const dialog=$('aeProfileDialog');if(!dialog.open)dialog.showModal();
 $('aeProfileTitle').textContent='Mis Takes';
 $('aeProfileDialog').querySelector('.ae-profile-overview p').textContent='Consulta todas tus opiniones, incluidos los Takes que hayan sido ocultados por moderación.';
 $('aeProfileUsername').textContent='@'+(user.user_metadata?.username||user.user_metadata?.display_name||'Usuario');
 $('aeProfileStatus').textContent='Cargando tu historial…';$('aeProfileTakes').replaceChildren();
 const {data,error}=await db.rpc('ae_my_free_takes');
 if(ticket!==request||!dialog.open)return;
 $('aeProfileStatus').textContent=error?'No se pudo cargar tu historial: '+error.message:'';
 if(!error)display(data||[],user.id,false);
}
async function showPublic(id,push=true){
 if(!UUID.test(id))return;
 const user=await me();
 if(user?.id===id){await showOwn();return;}
 privateView=false;activeAuthor=id;const ticket=++request;
 const dialog=$('aeProfileDialog');if(!dialog.open)dialog.showModal();
 $('aeProfileTitle').textContent='Perfil de aficionado';
 $('aeProfileDialog').querySelector('.ae-profile-overview p').textContent='Historial público de Takes. Ningún usuario puede editar o borrar sus publicaciones; las personas pueden votarlas a favor o en contra.';
 $('aeProfileUsername').textContent='Takes publicados y votaciones';
 $('aeProfileStatus').textContent='Cargando historial público…';$('aeProfileTakes').replaceChildren();
 if(push){const u=new URL(location.href);u.searchParams.set('perfil',id);history.pushState({},'',u);}
 const {data,error}=await db.rpc('ae_public_take_profile',{p_author_id:id});
 if(ticket!==request||!dialog.open)return;
 $('aeProfileStatus').textContent=error?'No se pudo cargar este perfil: '+error.message:'';
 if(error)return;
 $('aeProfileTitle').textContent=(data?.[0]?.author||'Aficionado')+' · Takes';
 $('aeProfileUsername').textContent='Opiniones históricas del autor. Puedes apoyar o cuestionar sus Takes.';
 display(data||[],id,true);
}
window.openAeProfile=showOwn;
window.openAePublicProfile=showPublic;
window.closeAeProfile=close;
document.addEventListener('DOMContentLoaded',()=>{
 updateButton();
 if(typeof db!=='undefined'&&db)db.auth.onAuthStateChange(()=>setTimeout(updateButton,150));
 $('aeProfileDialog')?.addEventListener('click',e=>{if(e.target===$('aeProfileDialog'))close();});
 $('aeProfileDialog')?.addEventListener('close',()=>{++request;});
 const id=new URL(location.href).searchParams.get('perfil');if(id&&UUID.test(id))showPublic(id,false);
 window.addEventListener('popstate',()=>{
  const newId=new URL(location.href).searchParams.get('perfil');
  if(newId&&UUID.test(newId))showPublic(newId,false);
  else if($('aeProfileDialog')?.open&&!privateView)close();
 });
});
})();