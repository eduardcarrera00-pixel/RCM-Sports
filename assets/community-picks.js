/* Community Picks: real persistence, server-enforced rules, no wagering/payments. */
(() => {
'use strict';
let loaded=false,request=0,limit=20,posting=false,archiveLimit=30;
const $=id=>document.getElementById(id);
function todayToronto(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=key=>parts.find(p=>p.type===key).value;
 return v('year')+'-'+v('month')+'-'+v('day');
}
const isActive=p=>p.event_date&&p.event_date>=todayToronto()&&p.outcome==='pending';
const resultLabel=p=>p.outcome==='won'?'Acertado · +'+Math.abs(Number(p.result_points||0)).toFixed(2)+' pts':
 p.outcome==='lost'?'Fallado · −'+Math.abs(Number(p.result_points||0)).toFixed(2)+' pts':
 p.outcome==='void'?'Anulado · 0 pts':(isActive(p)?'Activo':'Archivado');
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
function message(error){return error?.message||'No pudimos completar la operación. Inténtalo de nuevo.';}
async function account(){if(!db)throw Error('Sin conexión.');const r=await db.auth.getUser();if(r.error)throw r.error;if(!r.data.user){closeDetail();openUserAuthModal();return null;}return r.data.user;}
function link(id){const u=new URL(location.href);u.searchParams.delete('article');u.searchParams.delete('comment');u.searchParams.set('pick',id);u.hash='';return u.href;}
function open(id){history.pushState({},'',link(id));showDetail(id);}
function card(p,compact=false,detail=false){

 const n=el('article',null,detail?'cp-card cp-card-detail':'cp-card');
 const pickSports=Array.isArray(p.legs)?p.legs.map(l=>String(l?.sport||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')):[];
 const hasNfl=pickSports.some(t=>/nfl|americano|american football|gridiron/.test(t));
 const hasFootball=pickSports.some(t=>!/nfl|americano|american football|gridiron/.test(t)&&/futbol|football|soccer|champions|liga|premier|barca|madrid|uefa|bundesliga|serie a/.test(t));
 n.dataset.sport=hasNfl&&hasFootball?'mixed':hasNfl?'nfl':hasFootball?'football':'general';
 const first=Array.isArray(p.legs)&&p.legs.length?p.legs[0]:null;
 const header=el('div',null,'cp-card-header');
 header.append(el('span','@'+(p.author||'Aficionado')));
 const date=new Date(p.created_at);
 if(!detail&&!Number.isNaN(date.getTime()))header.append(el('time',date.toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'})));
 if(!detail&&first?.sport)header.append(el('span',String(first.sport),'cp-card-sport'));
  if(!detail&&p.event_date)header.append(el('span','Evento '+p.event_date,'cp-event-date'));
  if(!detail&&!isActive(p))header.append(el('strong',resultLabel(p),'cp-result-badge'));
 n.append(header);
 const title=el('h3',null,'cp-card-title');
 const a=el('a',p.title);
 a.href=link(p.id);
 a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();open(p.id);};
 title.append(a);n.append(title);
 const legs=el('div',null,'cp-card-legs');
 for(const leg of p.legs||[]){
   const row=el('p');
   row.append(el('span',String(leg.event||leg.sport||'Evento'),'cp-leg-event'));
   if(leg.selection)row.append(el('strong',leg.selection,'cp-leg-selection'));
   legs.append(row);
 }
 n.append(legs);
 const odds=el('div',null,'cp-card-odds');
 odds.append(el('strong','Cuota '+(Number(p.american_odds)>0?'+':'')+p.american_odds,'cp-odds'));
 odds.append(el('small',p.moderation_status==='approved'?'Cuota aprobada':p.moderation_status==='rejected'?'Cuota rechazada':'Cuota en revisión · votos abiertos','cp-card-state'));
 n.append(odds);
 if(p.explanation)n.append(el('p',p.explanation,'cp-explanation'));
 const controls=el('div',null,'cp-actions');
 const canVote=['pending','approved'].includes(p.moderation_status)&&isActive(p);
 for(const [value,label,count] of [[1,'▲',p.upvotes],[-1,'▼',p.downvotes]]){
   const b=button(label+' '+Number(count||0),()=>vote(p,value,b));
   b.classList.add(value===1?'cp-upvote':'cp-downvote');
   b.setAttribute('aria-label',(value===1?'Voto positivo':'Voto negativo')+' para el Pick de '+(p.author||'la comunidad'));
   b.setAttribute('aria-pressed',String(Number(p.my_vote)===value));
   b.disabled=!canVote;
   if(!canVote)b.title='La votación de este Pick está cerrada';
   controls.append(b);
 }
 if(!detail){const replies=button('Respuestas · '+Number(p.comments_count||0),()=>open(p.id));replies.classList.add('cp-replies-button');controls.append(replies);}
 n.append(controls);
 return n;
}
async function vote(p,value,b){if(!['pending','approved'].includes(p.moderation_status)||!isActive(p))return;b.disabled=true;try{const user=await account();if(!user)return;if(user.id===p.user_id)throw Error('No puedes votar tu propio Pick.');
 let q;if(Number(p.my_vote)===value)q=db.from('ae_pick_votes').delete().eq('pick_id',p.id).eq('user_id',user.id);
 else if(Number(p.my_vote))q=db.from('ae_pick_votes').update({value}).eq('pick_id',p.id).eq('user_id',user.id);
 else q=db.from('ae_pick_votes').insert({pick_id:p.id,value});
 const r=await q;if(r.error)throw r.error;await load();if($('cpDialog')?.open)await showDetail(p.id);
 }catch(e){notifyCommunity(message(e),true);}finally{b.disabled=false;}}
async function load(){
 if(!db)return;const seq=++request;
 try{
   const feed=await db.from('ae_pick_feed').select('*').gte('event_date',todayToronto()).eq('outcome','pending').order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,limit-1);
   if(seq!==request)return;if(feed.error)throw feed.error;
   $('cpFeed').replaceChildren(...(feed.data||[]).map(p=>card(p)));
   $('cpStatus').textContent=feed.data?.length?'':'Todavía no hay Picks. Comparte el primero.';
   $('cpMore').hidden=(feed.data?.length||0)<limit;
   loaded=true;
   await Promise.all([loadRanking(),loadModeration(),loadChefLists(),loadSettlement()]);
 }catch(e){if(seq!==request)return;$('cpFeed').replaceChildren();$('cpMore').hidden=true;$('cpStatus').textContent='No pudimos cargar los Picks. '+message(e);}
}
let currentRank='month';
function row(label,cls){const li=el('li',null,cls||'ae-cp-leader');li.append(el('span',label));return li;}
async function loadRanking(){
 const list=$('cpLeaderboard');if(!list)return;
 const r=await db.rpc('ae_pick_result_ranking',{p_period:currentRank});
 if(r.error){list.replaceChildren(row('No fue posible cargar el ranking de resultados.'));return;}
 list.replaceChildren();
 if(!r.data?.length)list.append(row(currentRank==='month'?'Este mes todavía no hay resultados confirmados.':'Aún no hay pronósticos con resultados confirmados.'));
 for(const [i,x] of (r.data||[]).slice(0,10).entries()){
   const li=el('li',null,'ae-cp-leader');
   li.append(el('span',String(i+1).padStart(2,'0'),'ae-take-number'),
     el('span',x.username||'Aficionado','ae-take-name'),
     el('strong',Number(x.points||0).toFixed(2)+' pts · '+Number(x.correct_picks||0)+' aciertos'));
   list.append(li);
 }
}
/* Clasificación editorial basada en votos netos reales, separada de los
   puntos de la liga semanal. Sólo pronósticos aprobados de esta semana. */
let chefRequest=0;
function paintChefList(id,result,kind){
 const target=$(id);
 if(!target)return;
 target.replaceChildren();
 const good=kind==='best';
 if(result?.error){
   target.append(row('No se pudo cargar esta clasificación.','ae-chef-empty'));
   return;
 }
 const picks=Array.isArray(result?.data)?result.data:[];
 if(!picks.length){
   target.append(row(good?'Aún no hay Picks con votos netos positivos esta semana.':'Aún no hay Picks con votos netos negativos esta semana.','ae-chef-empty'));
   return;
 }
 for(const [index,p] of picks.entries()){
   const item=el('li',null,'ae-popular-item ae-chef-entry');
   const rank=el('span',String(index+1).padStart(2,'0'),'ae-popular-position');
   const info=el('div',null,'ae-popular-copy');
   const chef=el('button','@'+(p.author||'Aficionado'),'ae-chef-author');
   chef.type='button';
   chef.setAttribute('aria-label','Ver perfil de '+(p.author||'Aficionado'));
   chef.onclick=()=>{if(typeof openAePublicProfile==='function')openAePublicProfile(p.user_id);};
   const pick=el('a',p.title||'Ver pronóstico','ae-chef-pick-link');
   pick.href=link(p.id);
   pick.onclick=e=>{
     if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
     e.preventDefault();open(p.id);
   };
   const score=Number(p.score||0);
   const votes=el('span',(score>0?'+':'')+score+' votos netos','ae-chef-votes');
   info.append(chef,pick,votes);
   item.append(rank,info);
   target.append(item);
 }
}
async function loadChefLists(){
 const seq=++chefRequest;
 const cols='id,user_id,author,title,score,upvotes,downvotes,created_at';
 const query=()=>db.from('ae_pick_feed').select(cols)
   .in('moderation_status',['pending','approved']).eq('is_current_week',true).gte('event_date',todayToronto()).eq('outcome','pending');
 try{
   const [best,worst]=await Promise.all([
     query().gt('score',0).order('score',{ascending:false})
       .order('upvotes',{ascending:false}).order('created_at',{ascending:true}).order('id',{ascending:true}).limit(3),
     query().lt('score',0).order('score',{ascending:true})
       .order('downvotes',{ascending:false}).order('created_at',{ascending:true}).order('id',{ascending:true}).limit(3)
   ]);
   if(seq!==chefRequest)return;
   paintChefList('picksPopular',best,'best');
   paintChefList('picksQuestioned',worst,'worst');
 }catch(e){
   if(seq!==chefRequest)return;
   const failure={error:e};
   paintChefList('picksPopular',failure,'best');
   paintChefList('picksQuestioned',failure,'worst');
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
       $('cpAdminStatus').textContent=result.error?message(result.error):approve?'Pick aprobado. Los votos y comentarios siguen abiertos.':'Pick rechazado; el autor podrá verlo en su cuenta.';
       await load();
     });n.append(b);
   }
   target.append(n);
 }
}
async function loadSettlement(){
 const area=$('cpSettleList');if(!area)return;
 const admin=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
 area.replaceChildren();
 if(!admin)return;
 const r=await db.from('ae_pick_feed').select('*').eq('moderation_status','approved')
   .eq('outcome','pending').or('event_date.lte.'+todayToronto()+',event_date.is.null')
   .order('created_at',{ascending:true}).limit(100);
 if(r.error){area.append(el('p','No pudimos cargar los resultados pendientes. '+message(r.error)));return;}
 if(!r.data?.length){area.append(el('p','No hay eventos pendientes de verificación.'));return;}
 for(const p of r.data){
  const entry=el('article',null,'ae-pick-settle-entry');
  entry.append(el('strong',p.title),el('small',p.author+' · '+(p.event_date?'Evento '+p.event_date:'Pick antiguo sin fecha · verifica que terminó')+' · '+p.american_odds));
  for(const leg of p.legs||[])entry.append(el('p',leg.event+' · '+leg.selection));
  for(const [outcome,label] of [['won','Acertó'],['lost','Falló'],['void','Anulado']]){
   const b=button(label,async()=>{
    if(!confirm('¿Verificaste el resultado oficial '+(p.event_date?'del evento '+p.event_date:'de este Pick antiguo sin fecha')+'? Confirmar '+label+' para '+p.title+'. Los puntos afectarán el ranking del mes actual. Esta acción es definitiva.'))return;
    b.disabled=true;
    try{
     const r=await db.rpc('ae_pick_settle_result',{p_pick_id:p.id,p_outcome:outcome});
     if(r.error)throw r.error;
     $('cpAdminStatus').textContent='Resultado verificado: '+label+' · '+Number(r.data||0).toFixed(2)+' pts.';
     await load();
    }catch(e){$('cpAdminStatus').textContent=message(e);}
    finally{b.disabled=false;}
   });entry.append(b);
  }
  area.append(entry);
 }
}
window.updateAePicksAdmin=()=>{loadModeration();loadSettlement();};

function field(label,type='text'){const wrap=el('label',label);const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.required=true;wrap.append(input);return {wrap,input};}
function buildComposer(){
 const form=$('cpForm'),title=field('Título del Pick'),explanation=field('Tu explicación (opcional)','textarea'),eventDay=field('Día del evento (sin hora)','date');eventDay.input.min=todayToronto();eventDay.input.max=new Date(Date.parse(todayToronto()+'T12:00:00Z')+180*86400000).toISOString().slice(0,10);title.input.maxLength=160;title.input.minLength=3;explanation.input.required=false;explanation.input.maxLength=2000;form.append(title.wrap,eventDay.wrap,explanation.wrap);
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
 addRow();form.append(legs,add,output,el('p','Publica tantos Picks como quieras. Los votos y comentarios están abiertos desde el primer momento, mientras AE SPORTS revisa la cuota. Al finalizar el evento, el Pick seguirá disponible en el historial. No podrás editarlo.','cp-meta'));
 const confirm=el('label','He revisado las selecciones y la cuota.');const checkbox=el('input');checkbox.type='checkbox';checkbox.required=true;confirm.prepend(checkbox);form.append(confirm);
 const submit=el('button','Publicar Pick');submit.type='submit';form.append(submit,status);form.addEventListener('input',calculate);
 form.onsubmit=async e=>{e.preventDefault();if(posting)return;status.textContent='';try{const user=await account();if(!user)return;if(!calculate())throw Error('Revisa la cuota americana y las selecciones.');posting=true;submit.disabled=true;const r=await db.from('ae_community_picks').insert({title:title.input.value.trim(),explanation:explanation.input.value.trim(),legs:values(),event_date:eventDay.input.value}).select('id').single();if(r.error)throw r.error;form.reset();calculate();
 const panel=$('cpComposePanel');
 if(panel)panel.open=false;
 $('cpPublishCta')?.setAttribute('aria-expanded','false');
 if(typeof filterByCategory==='function')filterByCategory('Picks');
 await load();
 notifyCommunity('Pick publicado. Ya puedes recibir votos y comentarios mientras revisamos la cuota.');
 $('communityPicks')?.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){status.textContent=message(e);}finally{posting=false;submit.disabled=false;}};
 calculate();
}
async function loadArchive(){
 const target=$('cpArchiveFeed'),status=$('cpArchiveStatus'),more=$('cpArchiveMore');
 if(!target||!db)return;
 target.replaceChildren(el('p','Cargando historial…'));status.textContent='';
 const r=await db.from('ae_pick_feed').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,archiveLimit-1);
 if(r.error){target.replaceChildren(el('p','No se pudo cargar el historial. '+message(r.error)));more.hidden=true;return;}
 const records=r.data||[];
 target.replaceChildren(...records.map(p=>card(p,true)));
 status.textContent=records.length?'Picks publicados, incluso vencidos y con resultado verificado.':'Todavía no hay Picks disponibles.';
 more.hidden=records.length<archiveLimit;
}
function closeArchive(){const dialog=$('cpArchiveDialog');if(dialog?.open)dialog.close();}
function closeDetail(){const d=$('cpDialog');if(d)d.close();}
async function showDetail(id){
 if(!/^[0-9a-f-]{36}$/i.test(id))return;
 let dialog=$('cpDialog');if(!dialog){dialog=el('dialog',null,'rcm-dialog cp-dialog');dialog.id='cpDialog';dialog.setAttribute('aria-label','Pick y respuestas');document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();const u=new URL(location.href);u.searchParams.delete('pick');history.replaceState({},'',u);});}
 dialog.replaceChildren(button('Cerrar',closeDetail),el('p','Cargando Pick…'));if(!dialog.open)dialog.showModal();
 try{const [pick,comments]=await Promise.all([db.from('ae_pick_feed').select('*').eq('id',id).maybeSingle(),db.from('ae_pick_comments').select('*').eq('pick_id',id).eq('hidden',false).order('created_at').limit(200)]);
 if(!dialog.isConnected||new URL(location.href).searchParams.get('pick')!==id)return;
 if(pick.error||comments.error)throw pick.error||comments.error;dialog.replaceChildren(button('Cerrar',closeDetail));if(!pick.data){dialog.append(el('p','Este Pick no está disponible.'));return;}dialog.append(card(pick.data,false,true));
 const heading=el('h3','Respuestas · '+Number(pick.data.comments_count||comments.data.length),'cp-detail-replies-heading');dialog.append(heading);
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
function openPickComposer(){
 const panel=$('cpComposePanel'),button=$('cpPublishCta');
 if(!panel)return;
 panel.open=true;
 button?.setAttribute('aria-expanded','true');
 panel.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
 window.setTimeout(()=>panel.querySelector('input')?.focus({preventScroll:true}),170);
}
document.addEventListener('DOMContentLoaded',()=>{
 buildComposer();
 $('cpPublishCta')?.addEventListener('click',openPickComposer);
 $('cpComposePanel')?.addEventListener('toggle',e=>{
  $('cpPublishCta')?.setAttribute('aria-expanded',String(e.currentTarget.open));
 });
 renderCommunityPicksVisibility();load();$('cpReload')?.addEventListener('click',load);$('cpViewAll')?.addEventListener('click',()=>{const dlg=$('cpArchiveDialog');if(dlg&&!dlg.open)dlg.showModal();archiveLimit=30;loadArchive();});$('cpArchiveClose')?.addEventListener('click',closeArchive);$('cpArchiveMore')?.addEventListener('click',()=>{archiveLimit+=30;loadArchive();});for(const [id,mode] of [['cpRankMonth','month'],['cpRankHistory','all']]){$(id)?.addEventListener('click',()=>{currentRank=mode;for(const [i,m] of [['cpRankMonth','month'],['cpRankHistory','all']])$(i)?.setAttribute('aria-pressed',String(currentRank===m));loadRanking();});}const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);$('cpMore').onclick=()=>{limit+=20;load();};if(db)db.auth.onAuthStateChange(()=>setTimeout(()=>{load();const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);},0));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);else closeDetail();});
})();
