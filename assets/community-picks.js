/* Community Picks: real persistence, server-enforced rules, no wagering/payments. */
(() => {
'use strict';
let loaded=false,request=0,limit=20,posting=false;
const $=id=>document.getElementById(id);
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
function message(error){return error?.code==='23505'?'Ya publicaste tu Pick de hoy. Podrás publicar otro mañana (hora de Toronto).':error?.message||'No pudimos completar la operación. Inténtalo de nuevo.';}
async function account(){if(!db)throw Error('Sin conexión.');const r=await db.auth.getUser();if(r.error)throw r.error;if(!r.data.user){closeDetail();openUserAuthModal();return null;}return r.data.user;}
function link(id){const u=new URL(location.href);u.searchParams.delete('article');u.searchParams.delete('comment');u.searchParams.set('pick',id);u.hash='';return u.href;}
function open(id){history.pushState({},'',link(id));showDetail(id);}
function card(p,compact=false){
 const n=el('article',null,'cp-card');
 const first=Array.isArray(p.legs)&&p.legs.length?p.legs[0]:null;
 const header=el('div',null,'cp-card-header');
 header.append(el('span','@'+(p.author||'Aficionado')));
 const date=new Date(p.created_at);
 if(!Number.isNaN(date.getTime()))header.append(el('time',date.toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'})));
 if(first?.sport)header.append(el('span',String(first.sport),'cp-card-sport'));
 n.append(header);
 const title=el('h3',null,'cp-card-title');
 const a=el('a',p.title);
 a.href=link(p.id);
 a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();open(p.id);};
 title.append(a);n.append(title);
 const legs=el('div',null,'cp-card-legs');
 for(const leg of p.legs||[]){
   const row=el('p');
   row.append(el('span',String(leg.event||leg.sport||'Evento')));
   if(leg.selection)row.append(el('strong',' · '+leg.selection));
   legs.append(row);
 }
 n.append(legs);
 const odds=el('div',null,'cp-card-odds');
 odds.append(el('strong','Cuota '+(Number(p.american_odds)>0?'+':'')+p.american_odds,'cp-odds'));
 odds.append(el('small',p.moderation_status==='approved'?'Cuota aprobada':p.moderation_status==='rejected'?'Cuota rechazada':'En revisión','cp-card-state'));
 n.append(odds);
 if(p.explanation)n.append(el('p',p.explanation,'cp-explanation'));
 const controls=el('div',null,'cp-actions');
 if(p.moderation_status==='approved'){
  for(const [value,label,count] of [[1,'▲',p.upvotes],[-1,'▼',p.downvotes]]){
    const b=button(label+' '+Number(count||0),()=>vote(p,value,b));
    b.setAttribute('aria-label',(value===1?'Apoyar':'Cuestionar')+' Pick de '+(p.author||'la comunidad'));
    b.setAttribute('aria-pressed',String(Number(p.my_vote)===value));
    controls.append(b);
  }
 }
 controls.append(el('span','Balance '+Number(p.score||0),'cp-vote-score'));
 controls.append(button('Respuestas · '+Number(p.comments_count||0),()=>open(p.id)));
 n.append(controls);
 if(typeof currentAdmin!=='undefined'&&currentAdmin&&!compact){
   const hide=button('Ocultar Pick',async()=>{
     const r=await db.from('ae_community_picks').update({hidden:true}).eq('id',p.id);
     if(r.error)notifyCommunity(message(r.error),true);
     else{closeDetail();load();}
   });
   hide.className='cp-card-admin';n.append(hide);
 }
 return n;
}
async function vote(p,value,b){if(p.moderation_status!=='approved')return;b.disabled=true;try{const user=await account();if(!user)return;if(user.id===p.user_id)throw Error('No puedes votar tu propio Pick.');
 let q;if(Number(p.my_vote)===value)q=db.from('ae_pick_votes').delete().eq('pick_id',p.id).eq('user_id',user.id);
 else if(Number(p.my_vote))q=db.from('ae_pick_votes').update({value}).eq('pick_id',p.id).eq('user_id',user.id);
 else q=db.from('ae_pick_votes').insert({pick_id:p.id,value});
 const r=await q;if(r.error)throw r.error;await load();if($('cpDialog')?.open)await showDetail(p.id);
 }catch(e){notifyCommunity(message(e),true);}finally{b.disabled=false;}}
async function load(){
 if(!db)return;const seq=++request;
 try{
   const feed=await db.from('ae_pick_feed').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,limit-1);
   if(seq!==request)return;if(feed.error)throw feed.error;
   $('cpFeed').replaceChildren(...(feed.data||[]).map(p=>card(p)));
   $('cpStatus').textContent=feed.data?.length?'':'Todavía no hay Picks. Comparte el primero.';
   $('cpMore').hidden=(feed.data?.length||0)<limit;
   loaded=true;
   await Promise.all([loadRanking(),loadModeration()]);
 }catch(e){if(seq!==request)return;$('cpFeed').replaceChildren();$('cpMore').hidden=true;$('cpStatus').textContent='No pudimos cargar los Picks. '+message(e);}
}
let currentRank='weekly';
function row(label,cls){const li=el('li',null,cls||'ae-cp-leader');li.append(el('span',label));return li;}
async function loadRanking(){
 const list=$('cpLeaderboard'),popular=$('picksPopular');if(!list)return;
 const r=currentRank==='weekly'?await db.rpc('ae_community_pick_week_top'):await db.rpc('ae_community_pick_totals');
 if(r.error){list.replaceChildren(row('No fue posible cargar la clasificación.'));return;}
 list.replaceChildren();
 if(!r.data?.length)list.append(row('Aún no hay posiciones con puntos.'));
 for(const [i,x] of (r.data||[]).entries()){
   const li=el('li',null,'ae-cp-leader');
   li.append(el('span',String(x.rank_position||i+1).padStart(2,'0'),'ae-take-number'),el('span',x.author||x.username||'Aficionado','ae-take-name'),el('strong',String(x.points)+' pts'));
   list.append(li);
 }
 if(popular){
   const top=await db.rpc('ae_community_pick_week_top');
   popular.replaceChildren();
   if(top.error||!top.data?.length){popular.append(row('Los 3 Picks con más votos de la semana aparecerán aquí.'));return;}
   for(const x of top.data.slice(0,3)){
     const li=el('li',null,'ae-popular-item');
     li.append(el('span',String(x.rank_position).padStart(2,'0'),'ae-popular-position'));
     const detail=el('div',null,'ae-popular-copy');detail.append(el('strong',x.title),el('small','Por '+x.author+' · '+x.score+' votos netos'),el('span',x.points+' puntos provisionales'));
     li.append(detail);popular.append(li);
   }
 }
}
async function loadModeration(){
 const area=$('cpModeration');if(!area)return;
 const admin=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
 area.hidden=!admin;if(!admin)return;
 const q=await db.from('ae_pick_feed').select('*').eq('moderation_status','pending').order('created_at',{ascending:true}).limit(100);
 const target=$('cpPending');target.replaceChildren();
 if(q.error){target.append(el('p','Error al cargar cuotas pendientes.'));return;}
 if(!q.data?.length){target.append(el('p','No hay cuotas pendientes.'));return;}
 for(const p of q.data){
   const n=el('article',null,'ae-cp-moderate');
   n.append(el('strong',p.title),el('p',p.author+' · '+(Number(p.american_odds)>0?'+':'')+p.american_odds));
   for(const leg of p.legs||[])n.append(el('p',leg.event+' · '+leg.selection+' · '+leg.odds));
   for(const [approve,text] of [[true,'Aceptar cuota'],[false,'Rechazar cuota']]){
     const b=button(text,async()=>{
       if(!confirm('¿'+text+' de este Pick?'))return;
       b.disabled=true;
       const result=await db.rpc('ae_moderate_community_pick',{p_pick_id:p.id,p_approve:approve});
       $('cpAdminStatus').textContent=result.error?message(result.error):approve?'Pick aprobado. Ya se puede votar.':'Pick rechazado; el autor podrá verlo en su cuenta.';
       await load();
     });n.append(b);
   }
   target.append(n);
 }
}
function previousWeekMonday(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=k=>parts.find(x=>x.type===k).value;
 const d=new Date(Date.UTC(+get('year'),+get('month')-1,+get('day'),12));
 const offset=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-offset-7);
 return d.toISOString().slice(0,10);
}
async function closePreviousWeek(){
 const monday=previousWeekMonday();
 if(!confirm('¿Cerrar definitivamente la semana del '+monday+' y asignar 10 a 1 puntos al Top 10?'))return;
 const r=await db.rpc('ae_finalize_community_pick_week',{p_week_start:monday});
 $('cpAdminStatus').textContent=r.error?message(r.error):'Semana cerrada: '+r.data+' Picks premiados.';
 await loadRanking();
}
window.updateAePicksAdmin=loadModeration;

function field(label,type='text'){const wrap=el('label',label);const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.required=true;wrap.append(input);return {wrap,input};}
function buildComposer(){
 const form=$('cpForm'),title=field('Título del Pick'),explanation=field('Tu explicación (opcional)','textarea');title.input.maxLength=160;title.input.minLength=3;explanation.input.required=false;explanation.input.maxLength=2000;form.append(title.wrap,explanation.wrap);
 const legs=el('div',null,'cp-legs'),rows=[];const output=el('output',''),status=el('p','', 'cp-status');status.setAttribute('role','status');
 function values(){return rows.map(r=>({sport:r.sport.input.value.trim(),event:r.event.input.value.trim(),selection:r.selection.input.value.trim(),odds:Number(r.odds.input.value)}));}
 function calculate(){
   const picks=values();
   const valid=picks.every(l=>Number.isInteger(l.odds)&&Math.abs(l.odds)>=100&&Math.abs(l.odds)<=100000);
   const decimal=picks.reduce((v,l)=>v*(l.odds>0?1+l.odds/100:1+100/Math.abs(l.odds)),1);
   const american=decimal>=2?Math.round((decimal-1)*100):-Math.round(100/(decimal-1));
   output.textContent=valid?'Cuota combinada: '+(american>0?'+':'')+american+' · '+decimal.toFixed(2)+' decimal':'Introduce cuotas americanas, por ejemplo +150 o -110.';
   return valid&&decimal>1;
 }
 const add=button('Añadir segunda selección',()=>addRow());
 function addRow(){if(rows.length>=2)return;const box=el('fieldset');box.append(el('legend','Selección '+(rows.length+1)));const row={box};for(const [key,label] of [['sport','Deporte'],['event','Partido (equipos)'],['selection','Pronóstico'],['odds','Cuota americana (+150, -110)']]){row[key]=field(label);row[key].input.maxLength=key==='odds'?7:key==='selection'?200:key==='sport'?40:160;if(key==='odds')row[key].input.pattern='[+-]?[0-9]{3,6}';box.append(row[key].wrap);}rows.push(row);if(rows.length===2)box.append(button('Quitar segunda selección',()=>{rows.pop();box.remove();add.hidden=false;calculate();}));legs.append(box);add.hidden=rows.length===2;}
 addRow();form.append(legs,add,output,el('p','Una publicación al día (Toronto). La cuota se revisará manualmente antes de habilitar los votos. No combines selecciones del mismo partido. El Pick no se puede editar después de publicarlo.','cp-meta'));
 const confirm=el('label','He revisado las selecciones y la cuota.');const checkbox=el('input');checkbox.type='checkbox';checkbox.required=true;confirm.prepend(checkbox);form.append(confirm);
 const submit=el('button','Publicar Pick');submit.type='submit';form.append(submit,status);form.addEventListener('input',calculate);
 form.onsubmit=async e=>{e.preventDefault();if(posting)return;status.textContent='';try{const user=await account();if(!user)return;if(!calculate())throw Error('Revisa la cuota americana y las selecciones.');posting=true;submit.disabled=true;const r=await db.from('ae_community_picks').insert({title:title.input.value.trim(),explanation:explanation.input.value.trim(),legs:values()}).select('id').single();if(r.error)throw r.error;form.reset();calculate();await load();status.textContent='Pick enviado. AE SPORTS revisará tu cuota antes de recibir votos.';await load();}catch(e){status.textContent=message(e);}finally{posting=false;submit.disabled=false;}};
 calculate();
}
function closeDetail(){const d=$('cpDialog');if(d)d.close();}
async function showDetail(id){
 if(!/^[0-9a-f-]{36}$/i.test(id))return;
 let dialog=$('cpDialog');if(!dialog){dialog=el('dialog',null,'rcm-dialog cp-dialog');dialog.id='cpDialog';dialog.setAttribute('aria-label','Pick y respuestas');document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();const u=new URL(location.href);u.searchParams.delete('pick');history.replaceState({},'',u);});}
 dialog.replaceChildren(button('Cerrar',closeDetail),el('p','Cargando Pick…'));if(!dialog.open)dialog.showModal();
 try{const [pick,comments]=await Promise.all([db.from('ae_pick_feed').select('*').eq('id',id).maybeSingle(),db.from('ae_pick_comments').select('*').eq('pick_id',id).eq('hidden',false).order('created_at').limit(200)]);
 if(!dialog.isConnected||new URL(location.href).searchParams.get('pick')!==id)return;
 if(pick.error||comments.error)throw pick.error||comments.error;dialog.replaceChildren(button('Cerrar',closeDetail));if(!pick.data){dialog.append(el('p','Este Pick no está disponible.'));return;}dialog.append(card(pick.data));
 const share=el('a','Enlace permanente');share.href=link(id);dialog.append(share,el('h3','Conversación'));
 const replyStatus=el('p',''),form=el('form'),body=field('Tu comentario','textarea');body.input.maxLength=2000;let parent=null;
 const cancel=button('Cancelar respuesta',()=>{parent=null;replyStatus.textContent='';cancel.hidden=true;});cancel.hidden=true;
 const names=new Map(comments.data.map(c=>[c.id,c.author]));
 for(const c of comments.data){const item=el('article',null,'cp-comment');item.append(el('strong',c.author));if(c.parent_id)item.append(el('small','En respuesta a '+(names.get(c.parent_id)||'un comentario anterior')));item.append(el('p',c.body));item.append(button('Responder',()=>{parent=c.id;replyStatus.textContent='Respondiendo a '+c.author;cancel.hidden=false;body.input.focus();}));if(currentAdmin)item.append(button('Ocultar comentario',async()=>{const r=await db.from('ae_pick_comments').update({hidden:true}).eq('id',c.id);if(r.error)notifyCommunity(message(r.error),true);else showDetail(id);}));dialog.append(item);}
 if(!comments.data.length)dialog.append(el('p','Abre la conversación.'));
 if(comments.data.length===200)dialog.append(el('p','Se muestran los primeros 200 comentarios.'));
 const send=el('button','Enviar respuesta');send.type='submit';form.append(replyStatus,cancel,body.wrap,send);form.onsubmit=async e=>{e.preventDefault();send.disabled=true;try{if(!await account())return;const r=await db.from('ae_pick_comments').insert({pick_id:id,parent_id:parent,body:body.input.value.trim()});if(r.error)throw r.error;await load();await showDetail(id);}catch(e){notifyCommunity(message(e),true);}finally{send.disabled=false;}};dialog.append(form);
 }catch(e){dialog.replaceChildren(button('Cerrar',closeDetail),el('p',message(e)));}
}
window.renderCommunityPicksVisibility=()=>{const root=$('communityPicks');if(!root)return;root.hidden=currentCategory!=='Picks';if(!root.hidden&&!loaded)load();};
document.addEventListener('DOMContentLoaded',()=>{buildComposer();renderCommunityPicksVisibility();load();$('cpReload')?.addEventListener('click',load);$('cpCloseWeek')?.addEventListener('click',closePreviousWeek);for(const [id,mode] of [['cpRankWeekly','weekly'],['cpRankOverall','overall']]){$(id)?.addEventListener('click',()=>{currentRank=mode;for(const [i,m] of [['cpRankWeekly','weekly'],['cpRankOverall','overall']])$(i).setAttribute('aria-pressed',String(currentRank===m));loadRanking();});}const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);$('cpMore').onclick=()=>{limit+=20;load();};if(db)db.auth.onAuthStateChange(()=>setTimeout(()=>{load();const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);},0));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);else closeDetail();});
})();
