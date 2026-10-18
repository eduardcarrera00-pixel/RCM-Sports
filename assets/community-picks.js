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
async function account(resumePublishing=false){
 if(!db)throw Error('Sin conexión.');
 const r=await db.auth.getUser();
 if(r.error&&r.error.name!=='AuthSessionMissingError'&&r.error.code!=='session_not_found')throw r.error;
 if(!r.data?.user){
  closeDetail();closePickComposer(true);
  if(resumePublishing&&typeof aeRequestPublication==='function')await aeRequestPublication('pick',showPickComposer);
  else openUserAuthModal();
  return null;
 }
 return r.data.user;
}
function link(id){const u=new URL(location.href);u.searchParams.delete('article');u.searchParams.delete('comment');u.searchParams.set('pick',id);u.hash='';return u.href;}
function open(id,options={}){history.pushState({},'',link(id));showDetail(id,options);}
function requestPickReply(id,parentId=null,onAuthRequired=null,replyDraft=''){
 // Keep reading public, but entering a reply requires a real account first.
 if(typeof aeRequestPublication==='function'){
  return aeRequestPublication('reply',()=>open(id,{focusComposer:true,parentId,replyDraft}),onAuthRequired);
 }
 if(typeof openUserAuthModal==='function')openUserAuthModal();
}
window.openAeCommunityPick=open;
function card(p,compact=false,detail=false){

 const n=el('article',null,detail?'cp-card cp-card-detail':'cp-card');
 const pickSports=Array.isArray(p.legs)?p.legs.map(l=>String(l?.sport||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')):[];
 const hasNfl=pickSports.some(t=>/nfl|americano|american football|gridiron/.test(t));
 const hasFootball=pickSports.some(t=>!/nfl|americano|american football|gridiron/.test(t)&&/futbol|football|soccer|champions|liga|premier|barca|madrid|uefa|bundesliga|serie a/.test(t));
 n.dataset.sport=hasNfl&&hasFootball?'mixed':hasNfl?'nfl':hasFootball?'football':'general';
 const first=Array.isArray(p.legs)&&p.legs.length?p.legs[0]:null;
 const header=el('div',null,'cp-card-header');
 if(p.user_id){
   const profileButton=button('@'+(p.author||'Aficionado'),event=>{
     event?.stopPropagation?.();
     if(typeof window.openAePublicProfile==='function')window.openAePublicProfile(p.user_id);
   });
   profileButton.className=detail?'cp-detail-author':'cp-feed-author';
   profileButton.setAttribute('aria-label','Ver perfil de '+(p.author||'Aficionado'));
   profileButton.title='Ver perfil de '+(p.author||'Aficionado');
   header.append(profileButton);
 }else{
   header.append(el('strong','@'+(p.author||'Aficionado'),'cp-feed-author-label'));
 }
 // No repetimos la fecha de publicación ni la del evento en la vista previa.
 if(first?.sport)header.append(el('span',String(first.sport),'cp-card-sport'));
 if(detail&&p.event_date)header.append(el('span','Evento '+p.event_date,'cp-event-date'));
 if(!isActive(p))header.append(el('strong',resultLabel(p),'cp-result-badge'));
 n.append(header);
 const title=el('h3',null,'cp-card-title');
 title.append(el('span',p.title));
 n.append(title);
 if(!detail){
   const readLink=el('a',null,'cp-card-read-link');
   readLink.href=link(p.id);
   readLink.setAttribute('aria-label','Leer Pick completo: '+(p.title||'Pronóstico deportivo'));
   readLink.onclick=event=>{
     if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
     event.preventDefault();
     open(p.id);
   };
   n.append(readLink);
 }
 const legs=el('div',null,'cp-card-legs');
 const simplify=text=>String(text||'').toLocaleLowerCase('es')
   .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .replace(/[^a-z0-9]+/g,' ').trim();
 const titleKey=simplify(p.title);
 for(const leg of p.legs||[]){
   const row=el('p');
   const matchup=String(leg.event||leg.sport||'Evento');
   const matchupKey=simplify(matchup);
   // Si el título ya presenta el partido, damos prioridad al pronóstico:
   // "Burnley vs Wolves" no debe aparecer dos veces en la misma tarjeta.
   if(detail||!matchupKey||!titleKey.includes(matchupKey)){
     row.append(el('span',matchup,'cp-leg-event'));
   }else{
     row.classList.add('cp-leg-no-event');
   }
   if(leg.selection)row.append(el('strong',leg.selection,'cp-leg-selection'));
   if(row.childNodes.length)legs.append(row);
 }
 if(legs.childNodes.length)n.append(legs);
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
 if(!detail){const replies=button('Respuestas · '+Number(p.comments_count||0),()=>requestPickReply(p.id));replies.classList.add('cp-replies-button');controls.append(replies);}
 n.append(controls);
 return n;
}
async function vote(p,value,b){if(!['pending','approved'].includes(p.moderation_status)||!isActive(p))return;b.disabled=true;try{const user=await account();if(!user)return;if(user.id===p.user_id)throw Error('No puedes votar tu propio Pick.');
 let q;if(Number(p.my_vote)===value)q=db.from('ae_pick_votes').delete().eq('pick_id',p.id).eq('user_id',user.id);
 else if(Number(p.my_vote))q=db.from('ae_pick_votes').update({value}).eq('pick_id',p.id).eq('user_id',user.id);
 else q=db.from('ae_pick_votes').insert({pick_id:p.id,value});
 const r=await q;if(r.error)throw r.error;await load();if($('cpDialog')?.open)await showDetail(p.id);
 }catch(e){notifyCommunity(message(e),true);}finally{b.disabled=false;}}
// Show one entire community Pick plus half of the next one. Card content
// varies by author, so measure the real card heights instead of clipping text
// with a fixed pixel height. This only changes the feed window, not the cards.
let feedWindowFrame=0;
let feedCardObserver=null;
function sizeFeedWindow(){
 const feed=$('cpFeed'),hint=$('cpFeedScrollHint');if(!feed)return;
 if(feedCardObserver){feedCardObserver.disconnect();feedCardObserver=null;}
 const cards=Array.from(feed.children).filter(node=>node.classList?.contains('cp-card'));
 const scrollable=cards.length>1;
 feed.classList.toggle('ae-picks-feed-scrollable',scrollable);
 if(hint)hint.hidden=!scrollable;
 if(!scrollable){
   feed.style.removeProperty('--ae-picks-feed-window-height');
   feed.removeAttribute('tabindex');
   return;
 }
 feed.setAttribute('tabindex','0');
 const measure=()=>{
   const first=cards[0].getBoundingClientRect().height;
   const second=cards[1].getBoundingClientRect().height;
   if(!first||!second)return;
   const gap=parseFloat(getComputedStyle(cards[0]).marginBottom)||0;
   feed.style.setProperty('--ae-picks-feed-window-height',
     Math.ceil(first+gap+second/2)+'px');
 };
 measure();
 if(typeof ResizeObserver!=='undefined'){
   feedCardObserver=new ResizeObserver(()=>{
     if(feedWindowFrame)return;
     feedWindowFrame=requestAnimationFrame(()=>{feedWindowFrame=0;measure();});
   });
   feedCardObserver.observe(cards[0]);
   feedCardObserver.observe(cards[1]);
 }
}
async function load(){
 if(!db)return;const seq=++request;
 try{
   const feed=await db.from('ae_pick_feed').select('*').gte('event_date',todayToronto()).eq('outcome','pending').order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,limit-1);
   if(seq!==request)return;if(feed.error)throw feed.error;
   const feedEl=$('cpFeed'),previousScroll=feedEl.scrollTop;
   // The archive action is the final item INSIDE the scrolling list.
   const footer=$('cpFeedFooter');
   feedEl.replaceChildren(...(feed.data||[]).map(p=>card(p)),footer);
   sizeFeedWindow();
   // Voting refreshes the feed; don't throw readers back to the top.
   feedEl.scrollTop=previousScroll;
   $('cpStatus').textContent=feed.data?.length?'':'Todavía no hay Picks. Comparte el primero.';
   loaded=true;
   await Promise.all([loadRanking(),loadWorstRanking(),loadModeration(),loadChefLists(),loadSettlement()]);
 }catch(e){if(seq!==request)return;const footer=$('cpFeedFooter');$('cpFeed').replaceChildren(footer);sizeFeedWindow();$('cpStatus').textContent='No pudimos cargar los Picks. '+message(e);}
}
let currentRank='month';
let currentWorstRank='month';
let worstRankingRequest=0;
function row(label,cls){const li=el('li',null,cls||'ae-cp-leader');li.append(el('span',label));return li;}
// Show exactly four ranking entries inside each scroll viewport, while retaining
// the full top ten. Actual row heights vary with screen width and font loading.
function sizeChefRankingWindows(){
 for(const id of ['cpLeaderboard','cpWorstLeaderboard']){
   const list=$(id);if(!list)return;
   const entries=Array.from(list.children).filter(e=>e.classList?.contains('ae-cp-leader')&&!e.classList?.contains('ae-cp-leader-empty'));
   const height=entries.slice(0,4).reduce((sum,item)=>sum+item.getBoundingClientRect().height,0);
   if(height>0)list.style.setProperty('--ae-four-chefs-height',Math.ceil(height)+'px');
   else list.style.removeProperty('--ae-four-chefs-height');
   list.tabIndex=entries.length>4?0:-1;
 }
}
const torontoMonth=date=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit'}).formatToParts(new Date(date));
 const find=type=>parts.find(p=>p.type===type)?.value||'';
 return find('year')+'-'+find('month');
};
let voidResultCache=null;
// Ranking RPCs include voided Picks in total_resolved; a void must NOT count
// as a failed prediction when calculating win percentage. The public Picks
// feed exposes settled outcomes already, so no database permissions change.
async function voidCountsForPeriod(period){
 if(!voidResultCache||Date.now()-voidResultCache.at>30000){
   const pending=(async()=>{
     const results=[];
     for(let start=0;start<10000;start+=1000){
       const {data,error}=await db.from('ae_pick_feed').select('user_id,settled_at')
         .eq('moderation_status','approved').eq('outcome','void')
         .not('settled_at','is',null).order('settled_at',{ascending:false})
         .range(start,start+999);
       if(error)throw error;
       results.push(...(data||[]));
       if((data||[]).length<1000)break;
     }
     return results;
   })();
   voidResultCache={at:Date.now(),pending};
 }
 let voids;
 try{voids=await voidResultCache.pending;}
 catch(error){voidResultCache=null;throw error;}
 const counts=new Map(),thisMonth=torontoMonth(new Date());
 for(const pick of voids){
   if(period==='month'&&torontoMonth(pick.settled_at)!==thisMonth)continue;
   counts.set(pick.user_id,(counts.get(pick.user_id)||0)+1);
 }
 return counts;
}
function chefAccuracy(record,voids){
 if(!voids)return null;
 const decided=Math.max(0,Number(record.total_resolved||0)-(voids.get(record.user_id)||0));
 const correct=Math.max(0,Number(record.correct_picks||0));
 return decided>0?Math.round(100*correct/decided):null;
}
// Both Chef rankings show only the numeric accuracy percentage.
// Above 50% is a winning rate, below 50% is a losing rate; 50% and
// unavailable data remain neutral. The points figure is unchanged.
function chefRankingScore(record,voids){
 const label=el('strong',null,'ae-chef-score');
 label.append(el('span',Number(record.points||0).toFixed(2)+' pts','ae-chef-score-points'));
 const accuracy=chefAccuracy(record,voids);
 const tone=accuracy===null?'is-unknown':accuracy>50?'is-positive':accuracy<50?'is-negative':'is-neutral';
 label.append(el('span',' · ','ae-chef-score-separator'));
 label.append(el('span',accuracy===null?'—':accuracy+'%','ae-chef-accuracy '+tone));
 return label;
}
async function loadRanking(){
 const list=$('cpLeaderboard');if(!list)return;
 const [r,voids]=await Promise.all([
   db.rpc('ae_pick_result_ranking',{p_period:currentRank}),
   voidCountsForPeriod(currentRank).catch(()=>null)
 ]);
 if(r.error){list.replaceChildren(row('No fue posible cargar el ranking de resultados.','ae-cp-leader ae-cp-leader-empty'));return;}
 list.replaceChildren();
 if(!r.data?.length)list.append(row(currentRank==='month'?'Este mes todavía no hay resultados confirmados.':'Aún no hay pronósticos con resultados confirmados.','ae-cp-leader ae-cp-leader-empty'));
 for(const [i,x] of (r.data||[]).slice(0,10).entries()){
   const li=el('li',null,'ae-cp-leader');
   li.append(el('span',String(i+1).padStart(2,'0'),'ae-take-number'),
     el('span',x.username||'Aficionado','ae-take-name'),
     chefRankingScore(x,voids));
   list.append(li);
 }
 sizeChefRankingWindows();
}
/* Worst Chefs uses its own SQL order (ASC) and period.
   Never reverse the Best Chefs top ten; that would omit real bottom scorers. */
async function loadWorstRanking(){
 const list=$('cpWorstLeaderboard');if(!list||!db)return;
 const seq=++worstRankingRequest;
 const period=currentWorstRank;
 const [r,voids]=await Promise.all([
   db.rpc('ae_pick_result_ranking_worst',{p_period:period}),
   voidCountsForPeriod(period).catch(()=>null)
 ]);
 if(seq!==worstRankingRequest)return;
 if(r.error){
   list.replaceChildren(row('No fue posible cargar la clasificación de Peores Chefs.','ae-cp-leader ae-cp-leader-empty'));
   return;
 }
 list.replaceChildren();
 if(!r.data?.length){
   list.append(row(period==='month'
     ?'Este mes todavía no hay resultados confirmados.'
     :'Aún no hay pronósticos con resultados confirmados.',
     'ae-cp-leader ae-cp-leader-empty'));
   return;
 }
 for(const [i,x] of (r.data||[]).slice(0,10).entries()){
   const li=el('li',null,'ae-cp-leader ae-worst-chef-row');
   li.append(
     el('span',String(i+1).padStart(2,'0'),'ae-take-number'),
     el('span',x.username||'Aficionado','ae-take-name'),
     chefRankingScore(x,voids)
   );
   list.append(li);
 }
 sizeChefRankingWindows();
}
/* Clasificación editorial basada en votos netos reales, separada de los
   puntos de la liga semanal. Sólo pronósticos aprobados de esta semana. */
let chefRequest=0;
// The old Platos viewport was 255px tall with 85px rows. It cropped longer
// predictions and their votes. Fit precisely two COMPLETE variable-height rows.
const plateWindowObservers=new Map();
function sizePlateWindow(target){
 if(!target)return;
 plateWindowObservers.get(target)?.disconnect();
 plateWindowObservers.delete(target);
 const cards=Array.from(target.children).filter(card=>card.classList?.contains('ae-chef-entry'));
 target.style.removeProperty('--ae-plates-window-height');
 if(cards.length<=2)return;
 const measure=()=>{
   const height=cards.slice(0,2).reduce((sum,card)=>sum+card.getBoundingClientRect().height,0);
   if(height>0)target.style.setProperty('--ae-plates-window-height',Math.ceil(height)+'px');
 };
 measure();
 if(typeof ResizeObserver!=='undefined'){
   const observer=new ResizeObserver(()=>requestAnimationFrame(measure));
   cards.slice(0,2).forEach(card=>observer.observe(card));
   plateWindowObservers.set(target,observer);
 }
}
function paintChefList(id,result,kind){
 const target=$(id);
 if(!target)return;
 plateWindowObservers.get(target)?.disconnect();
 plateWindowObservers.delete(target);
 target.style.removeProperty('--ae-plates-window-height');
 target.replaceChildren();
 // Reset de carrusel si la lista queda vacía o falla la carga.
 target.classList.remove('ae-chef-scroll');
 target.removeAttribute('tabindex');
 target.onscroll=null;
 const oldHint=target.closest('.ae-chef-board')?.querySelector('.ae-chef-scroll-note');
 if(oldHint)oldHint.hidden=true;
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
 const scrollable=picks.length>2;
 // Mantiene el mismo diseño fotográfico con una o varias posiciones.
 // Solo habilitamos interacción de desplazamiento cuando hay más de un Pick.
 target.classList.add('ae-chef-scroll');
 target.setAttribute('aria-label',(good?'Mejores platos':'Peores platos')+', '+picks.length+' Picks. Desliza verticalmente para recorrer la clasificación.');
 target.tabIndex=scrollable?0:-1;
 target.scrollTop=0;
 const heading=target.closest('.ae-chef-board')?.querySelector('.ae-picks-rail-heading');
 let hint=heading?.querySelector('.ae-chef-scroll-note');
 if(heading&&!hint){hint=el('p',null,'ae-chef-scroll-note');heading.append(hint);}
 const updateHint=()=>{
   if(!hint)return;
   hint.hidden=!scrollable;
   hint.textContent='Desliza para ver más ↓';
 };
 target.onscroll=updateHint;
 for(const [index,p] of picks.entries()){
   const item=el('li',null,'ae-popular-item ae-chef-entry ae-chef-plate');
   item.dataset.rank=String(index+1);
   item.dataset.plate=good?'best':'worst';
   // Full-plate click target; preserve the existing li grid and its direct children.
   const entryLink=el('a',null,'ae-chef-entry-link');
   item.style.position='relative';
   entryLink.style.position='absolute';
   entryLink.style.inset='0';
   entryLink.style.zIndex='2';
   entryLink.style.display='block';
   entryLink.style.cursor='pointer';
   entryLink.style.outlineOffset='-2px';
   entryLink.href=link(p.id);
   entryLink.setAttribute('aria-label','Abrir Pick '+(index+1)+' de '+(p.author||'Aficionado')+': '+(p.title||'Ver pronóstico'));
   entryLink.onclick=e=>{
     if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
     e.preventDefault();
     open(p.id);
   };
   const info=el('div',null,'ae-popular-copy');
   // Aquí el nombre es informativo; el acceso al perfil queda dentro del detalle.
   const chef=el('span','@'+(p.author||'Aficionado'),'ae-chef-author');
   const pick=el('span',p.title||'Ver pronóstico','ae-chef-pick-link');
   const score=Number(p.score||0);
   const votes=el('span',(score>0?'+':'')+score+' votos netos','ae-chef-votes');
   const authorRow=el('div',null,'ae-chef-author-row');
   authorRow.append(chef);
   const americanOdds=Number(p.american_odds);
   if(p.american_odds!==null && p.american_odds!==undefined &&
      p.american_odds!=='' && Number.isFinite(americanOdds) && americanOdds!==0){
     authorRow.append(el('span','Cuota '+(americanOdds>0?'+':'')+americanOdds,'ae-chef-odds'));
   }
   const meta=el('div',null,'ae-chef-card-footer');
   meta.append(votes,el('span','Ver Pick ↗','ae-chef-card-open'));
   info.append(authorRow,pick,meta);
   item.append(info,entryLink);
   target.append(item);
   updateHint();
 }
 sizePlateWindow(target);
}
async function loadChefLists(){
 const seq=++chefRequest;
 const cols='id,user_id,author,title,american_odds,score,upvotes,downvotes,created_at';
 const query=()=>db.from('ae_pick_feed').select(cols)
   .in('moderation_status',['pending','approved']).eq('is_current_week',true).gte('event_date',todayToronto()).eq('outcome','pending');
 try{
   const [best,worst]=await Promise.all([
     query().gt('score',0).order('score',{ascending:false})
       .order('upvotes',{ascending:false}).order('created_at',{ascending:true}).order('id',{ascending:true}).limit(15),
     query().lt('score',0).order('score',{ascending:true})
       .order('downvotes',{ascending:false}).order('created_at',{ascending:true}).order('id',{ascending:true}).limit(15)
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
 const submit=el('button','Guardar Pick');submit.type='submit';form.append(submit,status);form.addEventListener('input',calculate);
 form.onsubmit=async e=>{
  e.preventDefault();if(posting)return;
  posting=true;submit.disabled=true;
  const closer=$('cpComposeClose');if(closer)closer.disabled=true;
  status.textContent='';
  try{
   const user=await account(true);if(!user)return;
   if(!calculate())throw Error('Revisa la cuota americana y las selecciones.');
   submit.textContent='Guardando…';
   const r=await db.from('ae_community_picks').insert({title:title.input.value.trim(),explanation:explanation.input.value.trim(),legs:values(),event_date:eventDay.input.value}).select('id').single();
   if(r.error)throw r.error;
   form.reset();
   while(rows.length>1){rows.pop().box.remove();}
   add.hidden=false;calculate();
   closePickComposer(true);
   void load();
   notifyCommunity('Pick guardado. Ya puedes recibir votos y comentarios mientras revisamos la cuota.');
  }catch(e){status.textContent=message(e);}
  finally{posting=false;submit.disabled=false;submit.textContent='Guardar Pick';if(closer)closer.disabled=false;}
 };
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
function closeDetail(){const d=$('cpDialog');if(d?.open)d.close();}
function pickDetailClose(){
 const close=button('×',closeDetail);
 close.className='ae-cp-detail-close';
 close.setAttribute('aria-label','Cerrar Pick');
 close.setAttribute('title','Cerrar publicación');
 return close;
}
function pickDetailHero(p){
 const hero=el('header',null,'ae-cp-detail-hero');
 hero.dataset.pickSport=(p.legs||[]).some(l=>/nfl|americano/i.test(l.sport||''))?'nfl':'football';
 const copy=el('div',null,'ae-cp-detail-hero-copy');
 copy.append(
   el('span','AE SPORTS · LA COCINA DE PICKS','ae-cp-detail-kicker'),
   el('h2','La receta del Chef','ae-cp-detail-hero-title')
 );
 hero.append(copy);
 return hero;
}
async function showDetail(id,options={}){
 if(!/^[0-9a-f-]{36}$/i.test(id))return;
 let dialog=$('cpDialog');
 if(!dialog){
  dialog=el('dialog',null,'rcm-dialog cp-dialog ae-cp-detail-dialog');
  dialog.id='cpDialog';
  dialog.setAttribute('aria-label','Pick y respuestas');
  document.body.append(dialog);
  dialog.addEventListener('close',()=>{
   dialog.remove();
   const u=new URL(location.href);
   u.searchParams.delete('pick');
   history.replaceState({},'',u);
  });
 }
 dialog.classList.add('ae-cp-detail-dialog');
 dialog.replaceChildren(pickDetailClose(),el('p','Cargando Pick…','ae-cp-detail-loading'));
 if(!dialog.open)dialog.showModal();
 try{
  const [pick,comments,session,votes]=await Promise.all([
   db.from('ae_pick_feed').select('*').eq('id',id).maybeSingle(),
   db.from('ae_pick_comments').select('*').eq('pick_id',id).eq('hidden',false).order('created_at').limit(200),
   db.auth.getUser().catch(()=>({data:{user:null}})),
   db.rpc('ae_pick_comment_vote_totals',{p_pick_id:id})
  ]);
  if(!dialog.isConnected||new URL(location.href).searchParams.get('pick')!==id)return;
  if(pick.error||comments.error||votes.error)throw pick.error||comments.error||votes.error;
  dialog.replaceChildren(pickDetailClose());
  if(!pick.data){
   dialog.append(el('p','Este Pick no está disponible.','ae-cp-detail-loading'));
   return;
  }
  const hero=pickDetailHero(pick.data);
  const content=el('div',null,'ae-cp-detail-content');
  const forecast=el('section',null,'ae-cp-detail-forecast');
  forecast.setAttribute('aria-label','Pronóstico del chef');
  forecast.append(el('span','EL PRONÓSTICO','ae-cp-detail-overline'),card(pick.data,false,true));
  content.append(forecast);
  const conversation=el('section',null,'ae-cp-detail-conversation');
  conversation.setAttribute('aria-label','Conversación del Pick');
  const heading=el('h3','La conversación · '+Number(pick.data.comments_count||comments.data.length),'cp-detail-replies-heading');
  conversation.append(heading);
  content.append(conversation);
  dialog.append(hero,content);
  const names=new Map(comments.data.map(c=>[c.id,c.author]));
  const voteStats=new Map((votes.data||[]).map(v=>[v.comment_id,v]));
  const voteControls=new Map();
  const viewer=session.data?.user||null;
  const replyStatus=el('span','', 'ae-cp-reply-status');
  const form=el('form',null,'ae-cp-comment-composer');
  form.id='aeCpCommentComposer';
  const body=field('Tu comentario','textarea');
  body.input.maxLength=2000;
  let parent=null;
  const resetReply=button('×',()=>{
   parent=null;
   replyStatus.textContent='';
   resetReply.hidden=true;
  });
  resetReply.className='ae-cp-reply-reset';
  resetReply.setAttribute('aria-label','Dejar de responder a este comentario');
  resetReply.title='Escribir comentario general';
  resetReply.hidden=true;
  const replyContext=el('div',null,'ae-cp-reply-context');
  replyContext.append(replyStatus,resetReply);
  const send=el('button','Enviar comentario');
  send.type='submit';
  form.append(replyContext,body.wrap,send);
  // El compositor va ARRIBA de la conversación; no hay botón grande
  // «Cancelar respuesta» al final de todos los comentarios.
  if(viewer)conversation.append(form);
  function replyTo(comment){
   if(!viewer){
    void requestPickReply(id,comment.id,closeDetail);
    return;
   }
   parent=comment.id;
   replyStatus.textContent='Respondiendo a @'+(comment.author||'usuario');
   resetReply.hidden=false;
   body.input.focus({preventScroll:true});
   form.scrollIntoView({block:'nearest',behavior:'smooth'});
  }
  function updateVotes(commentId){
   const controls=voteControls.get(commentId);
   if(!controls)return;
   const data=voteStats.get(commentId)||{};
   const up=Number(data.upvotes||0),down=Number(data.downvotes||0);
   const mine=Number(data.my_vote||0);
   controls.up.textContent='▲ '+up;
   controls.down.textContent='▼ '+down;
   controls.up.setAttribute('aria-pressed',String(mine===1));
   controls.down.setAttribute('aria-pressed',String(mine===-1));
   const people=Number(data.reply_people||0),replies=Number(data.reply_count||0);
   controls.replies.textContent=people===1?'1 persona respondió':people>1?people+' personas respondieron':'0 respuestas';
   controls.replies.title=replies+' '+(replies===1?'respuesta':'respuestas');
  }
  let voteBusy=false;
  async function voteComment(comment,value){
   if(voteBusy)return;
   if(!viewer){
    if(typeof openUserAuthModal==='function')openUserAuthModal();
    else notifyCommunity('Inicia sesión para votar comentarios.',true);
    return;
   }
   if(viewer.id===comment.user_id){
    notifyCommunity('No puedes votar tu propio comentario.',true);
    return;
   }
   const prev=Number(voteStats.get(comment.id)?.my_vote||0);
   const next=prev===value?0:value;
   voteBusy=true;
   const controls=voteControls.get(comment.id);
   if(controls){controls.up.disabled=true;controls.down.disabled=true;}
   try{
    const result=await db.rpc('ae_set_pick_comment_vote',{p_comment_id:comment.id,p_vote:next});
    if(result.error)throw result.error;
    const fresh=await db.rpc('ae_pick_comment_vote_totals',{p_pick_id:id});
    if(fresh.error)throw fresh.error;
    if(!dialog.isConnected)return;
    voteStats.clear();
    for(const v of fresh.data||[])voteStats.set(v.comment_id,v);
    for(const key of voteControls.keys())updateVotes(key);
   }catch(error){
    notifyCommunity(message(error),true);
   }finally{
    voteBusy=false;
    if(controls){controls.up.disabled=false;controls.down.disabled=false;}
   }
  }
  for(const c of comments.data){
   const item=el('article',null,'cp-comment');
   item.append(el('strong',c.author));
   if(c.parent_id)item.append(el('small','En respuesta a '+(names.get(c.parent_id)||'un comentario anterior')));
   item.append(el('p',c.body));
   const actions=el('div',null,'ae-cp-comment-actions');
   const up=button('▲ 0',()=>void voteComment(c,1));
   const down=button('▼ 0',()=>void voteComment(c,-1));
   up.className='ae-cp-comment-vote ae-cp-comment-upvote';
   down.className='ae-cp-comment-vote ae-cp-comment-downvote';
   up.setAttribute('aria-label','Apoyar comentario de '+c.author);
   down.setAttribute('aria-label','Cuestionar comentario de '+c.author);
   const replyAction=button('Responder',()=>replyTo(c));
   replyAction.className='ae-cp-comment-reply';
   const replies=el('span','', 'ae-cp-comment-replies-count');
   replies.setAttribute('aria-label','Cantidad de personas que respondieron a este comentario');
   actions.append(up,down,replyAction,replies);
   item.append(actions);
   conversation.append(item);
   voteControls.set(c.id,{up,down,replies});
   updateVotes(c.id);
  }
  if(!comments.data.length)conversation.append(el('p','Todavía no hay respuestas. Puedes abrir la conversación.','ae-cp-detail-empty'));
  if(comments.data.length===200)conversation.append(el('p','Se muestran los primeros 200 comentarios.'));
  form.onsubmit=async e=>{
   e.preventDefault();
   if(send.disabled)return;
   const text=body.input.value.trim();
   if(!text)return;
   send.disabled=true;
   try{
    const response=await db.auth.getUser();
    if(response.error&&response.error.name!=='AuthSessionMissingError'&&response.error.code!=='session_not_found')throw response.error;
    if(!response.data?.user){
     await requestPickReply(id,parent,closeDetail,text);
     return;
    }
    const result=await db.from('ae_pick_comments').insert({pick_id:id,parent_id:parent,body:text});
    if(result.error)throw result.error;
    await load();
    await showDetail(id);
   }catch(error){
    notifyCommunity(message(error),true);
   }finally{send.disabled=false;}
  };
  if(viewer){
   if(options.focusComposer){
    if(options.parentId&&names.has(options.parentId)){
     parent=options.parentId;
     replyStatus.textContent='Respondiendo a @'+names.get(parent);
     resetReply.hidden=false;
    }
    if(options.replyDraft)body.input.value=options.replyDraft;
    body.input.focus({preventScroll:true});
   }
  }else{
   const reply=button('Escribir comentario',()=>{void requestPickReply(id,null,closeDetail);});
   reply.className='cp-login-to-reply';
   reply.setAttribute('aria-label','Iniciar sesión para comentar este Pick');
   conversation.insertBefore(reply,conversation.children[1]||null);
  }
 }catch(e){dialog.replaceChildren(pickDetailClose(),el('p',message(e),'ae-cp-detail-loading'));}
}
// Route an alert directly into its Pick without reloading or creating another dialog.
window.aeOpenPickDetail=(id)=>{
  if(!/^[0-9a-f-]{36}$/i.test(String(id)))return;
  const url=new URL(location.href);
  url.searchParams.delete('article');
  url.searchParams.set('pick',String(id));
  history.pushState({pick:id},'',url.toString());
  void showDetail(String(id));
};
window.renderCommunityPicksVisibility=()=>{const root=$('communityPicks');if(!root)return;root.hidden=currentCategory!=='Picks';if(!root.hidden){if(!loaded)load();else requestAnimationFrame(()=>{sizeFeedWindow();sizeChefRankingWindows();sizePlateWindow($('picksPopular'));sizePlateWindow($('picksQuestioned'));});}};
function syncPickComposer(){
 const open=Boolean($('cpComposePanel')?.open);
 $('cpPublishCta')?.setAttribute('aria-expanded',String(open));
 document.body.classList.toggle('ae-pick-composing',open);
}
function closePickComposer(force=false){
 if(posting&&!force)return;
 const dialog=$('cpComposePanel');
 if(dialog?.open)dialog.close();
 syncPickComposer();
}
function showPickComposer(){
 const dialog=$('cpComposePanel');if(!dialog)return;
 // A publication CTA can originate outside Picks; return to the correct
 // section only AFTER authentication has been completed.
 if(typeof currentCategory!=='undefined'&&currentCategory!=='Picks'&&typeof filterByCategory==='function')filterByCategory('Picks');
 if(!dialog.open)dialog.showModal();
 syncPickComposer();
 dialog.querySelector('input')?.focus({preventScroll:true});
}
function openPickComposer(){
 if(typeof aeRequestPublication==='function')return aeRequestPublication('pick',showPickComposer);
}
// Public entry point for "¿Eres Chef? Cocina Picks" from any section.
window.aeOpenPickComposer=openPickComposer;
document.addEventListener('DOMContentLoaded',()=>{
 buildComposer();
 $('cpPublishCta')?.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void openPickComposer();});
 $('cpComposeClose')?.addEventListener('click',()=>closePickComposer());
 $('cpComposePanel')?.addEventListener('close',syncPickComposer);
 $('cpComposePanel')?.addEventListener('cancel',e=>{if(posting)e.preventDefault();});
 renderCommunityPicksVisibility();load();window.addEventListener('resize',()=>{sizeFeedWindow();sizeChefRankingWindows();sizePlateWindow($('picksPopular'));sizePlateWindow($('picksQuestioned'));},{passive:true});if(document.fonts?.ready)document.fonts.ready.then(()=>{sizeChefRankingWindows();sizePlateWindow($('picksPopular'));sizePlateWindow($('picksQuestioned'));});$('cpReload')?.addEventListener('click',load);$('cpWorstReload')?.addEventListener('click',loadWorstRanking);$('cpViewAll')?.addEventListener('click',()=>{const dlg=$('cpArchiveDialog');if(dlg&&!dlg.open)dlg.showModal();archiveLimit=30;loadArchive();});$('cpArchiveClose')?.addEventListener('click',closeArchive);$('cpArchiveMore')?.addEventListener('click',()=>{archiveLimit+=30;loadArchive();});for(const [id,mode] of [['cpRankMonth','month'],['cpRankHistory','all']]){$(id)?.addEventListener('click',()=>{currentRank=mode;for(const [i,m] of [['cpRankMonth','month'],['cpRankHistory','all']])$(i)?.setAttribute('aria-pressed',String(currentRank===m));loadRanking();});}for(const [id,mode] of [['cpWorstRankMonth','month'],['cpWorstRankHistory','all']]){
 $(id)?.addEventListener('click',()=>{
   currentWorstRank=mode;
   for(const [buttonId,buttonMode] of [['cpWorstRankMonth','month'],['cpWorstRankHistory','all']]){
     $(buttonId)?.setAttribute('aria-pressed',String(currentWorstRank===buttonMode));
   }
   void loadWorstRanking();
 });
}
const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);if(db)db.auth.onAuthStateChange(()=>setTimeout(()=>{load();const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);},0));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);else closeDetail();});
})();
