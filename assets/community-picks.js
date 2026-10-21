/* Community Picks: real persistence, server-enforced rules, no wagering/payments. */
(() => {
'use strict';
let loaded=false,request=0,limit=20,posting=false,archiveLimit=30;
let currentViewerId=null;
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

/* Feed-only readable market labels for captured multi-selection Picks. */
function splitPickSelections(input){
 const text=String(input||'').trim();
 if(!text)return [];
 return text.split(/(?:\s+\+\s+|\s+\/\s+(?=\d+[.)]\s))/)
  .map(part=>part.trim().replace(/^\d+[.)]\s*/,'')).filter(Boolean);
}
function pickSelectionDisplay(input){
 const parts=String(input||'').split(/\s*[·•]\s*/);
 const prediction=(parts.shift()||'').trim();
 const market=parts.join(' · ').trim();
 if(/MONEYLINE\s*\(?(?:3[- ]WAY|3 VIAS)\)?/i.test(market))return {choice:prediction+' gana',market:'3 vías'};
 if(/^MONEYLINE$/i.test(market))return {choice:prediction+' gana',market:''};
 if(/OVER\/UNDER/i.test(market)&&/\bOVER\s+\d+(?:[.,]\d+)?\s+GOALS?\b/i.test(prediction))return {choice:prediction.replace(/\bOver\s+(\d+(?:[.,]\d+)?)\s+Goals?\b/i,'Más de $1 goles'),market:''};
 if(/OVER\/UNDER/i.test(market)&&/\bUNDER\s+\d+(?:[.,]\d+)?\s+GOALS?\b/i.test(prediction))return {choice:prediction.replace(/\bUnder\s+(\d+(?:[.,]\d+)?)\s+Goals?\b/i,'Menos de $1 goles'),market:''};
 if(/BOTH TEAMS TO SCORE/i.test(market)&&/^(YES|SI|SÍ)$/i.test(prediction))return {choice:'Ambos equipos marcan · Sí',market:''};
 if(/BOTH TEAMS TO SCORE/i.test(market)&&/^NO$/i.test(prediction))return {choice:'Ambos equipos marcan · No',market:''};
 return {choice:prediction||market,market:prediction?market:''};
}

function card(p,compact=false,detail=false,viewerId=currentViewerId,historyCard=false){

 const editorial=!compact&&!detail;
 const publication=editorial||detail;
 const n=el('article',null,detail?'cp-card cp-card-detail cp-recipe-card':editorial?'cp-card cp-feed-editorial'+(historyCard?' cp-history-card':''):'cp-card');
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
   if(publication){
     const avatar=el('span',String(p.author||'A').replace(/^@/,'').charAt(0).toLocaleUpperCase('es'),'cp-feed-initial');
     avatar.setAttribute('aria-hidden','true');
     profileButton.replaceChildren(avatar,el('span','@'+(p.author||'Aficionado'),'cp-feed-username'));
   }
   profileButton.setAttribute('aria-label','Ver perfil de '+(p.author||'Aficionado'));
   profileButton.title='Ver perfil de '+(p.author||'Aficionado');
   header.append(profileButton);
 }else{
   header.append(el('strong','@'+(p.author||'Aficionado'),'cp-feed-author-label'));
 }
 // No repetimos la fecha de publicación ni la del evento en la vista previa.
 let feedMeta=null;
 if(publication){
  feedMeta=el('div',null,'cp-feed-meta');
  if(first?.sport)feedMeta.append(el('span',String(first.sport),'cp-card-sport'));
  header.append(feedMeta);
 }else if(first?.sport){
  header.append(el('span',String(first.sport),'cp-card-sport'));
 }
 if(detail&&p.event_date)header.append(el('span','Evento '+p.event_date,'cp-event-date'));
 if(!isActive(p)){const status=el('strong',historyCard?({won:'Acertado',lost:'Fallado',void:'Anulado'}[p.outcome]||'Pendiente'):resultLabel(p),'cp-result-badge');status.dataset.outcome=p.outcome||'pending';header.append(status);}
 n.append(header);
 const title=el('h3',null,'cp-card-title');
 const normalize=value=>String(value||'').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const duplicateSelection=editorial&&p.legs?.length===1&&first?.event&&first?.selection&&normalize(p.title).includes(normalize(first.event))&&normalize(p.title).includes(normalize(first.selection));
 title.append(el('span',duplicateSelection?first.event:p.title));
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
 const legs=el(publication?'ol':'div',null,'cp-card-legs');
  const simplify=text=>String(text||'').toLocaleLowerCase('es')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ').trim();
  const titleKey=simplify(p.title);
  
  if(publication){
    // Feed and full recipe share individual ordered markets.
    const choices=[];
    for(const leg of p.legs||[]){
      const selections=splitPickSelections(leg.selection);
      for(const selection of selections)choices.push({leg,selection});
      if(!selections.length&&leg.event)choices.push({leg,selection:''});
    }
    if(choices.length){
      
      
      
      choices.forEach(({leg,selection},i)=>{
        const row=el('li',null,'cp-pick-line');
        
        const body=el('div',null,'cp-pick-line-body');
        const matchup=String(leg.event||'').trim();
        if(matchup&&!titleKey.includes(simplify(matchup)))body.append(el('span',matchup,'cp-pick-line-event'));
        const display=pickSelectionDisplay(selection);
        body.append(el('strong',display.choice||matchup||'Pronóstico','cp-pick-line-choice'));
        // On the full Chef recipe, secondary labels clarify each market without
        // making the compact public feed any taller.
        let marketLabel=display.market;
        if(detail){
          if(/MONEYLINE/i.test(selection))marketLabel=/3[- ]WAY|3 VIAS/i.test(selection)?'Ganador · 3 vías':'Ganador del partido';
          else if(/OVER\/UNDER/i.test(selection))marketLabel='Total de goles';
          else if(/BOTH TEAMS TO SCORE/i.test(selection))marketLabel='Ambos equipos marcan';
        }
        if(marketLabel)body.append(el('small',marketLabel,'cp-pick-line-market'));
        row.append(body);legs.append(row);
      });
    }
  }else{
    // Keep the compact archive cards unchanged.
    for(const leg of p.legs||[]){
      const row=el('p');
      const matchup=String(leg.event||leg.sport||'Evento');
      const matchupKey=simplify(matchup);
      if(detail||!matchupKey||!titleKey.includes(matchupKey))row.append(el('span',matchup,'cp-leg-event'));
      else row.classList.add('cp-leg-no-event');
      if(leg.selection)row.append(el('strong',leg.selection,'cp-leg-selection'));
      if(row.childNodes.length)legs.append(row);
    }
  }
  if(legs.childNodes.length)n.append(legs);
 const odds=el('div',null,'cp-card-odds');
 
 odds.append(el('strong','Cuota '+(Number(p.american_odds)>0?'+':'')+p.american_odds,'cp-odds'));
 const statusText=p.moderation_status==='approved'
   ?(publication?'':(['on_device_ocr','ai_vision'].includes(p.capture_check?.method)?'Momio cotejado con captura':'Cuota aprobada'))
   :p.moderation_status==='rejected'?'Cuota rechazada':'Cuota en revisión · votos abiertos';
 if(statusText&&!historyCard){
  const status=el('small',statusText,'cp-card-state');
  if(publication)n.append(status);else odds.append(status);
 }
 if(publication)feedMeta.append(odds);else n.append(odds);
 if(p.explanation&&!historyCard)n.append(el('p',p.explanation,'cp-explanation'));
 const controls=el('div',null,'cp-actions');
 const canVote=['pending','approved'].includes(p.moderation_status)&&isActive(p);
 const isOwnPick=Boolean(viewerId&&p.user_id&&String(viewerId)===String(p.user_id));
 if(!isOwnPick&&!historyCard){
 for(const [value,label,count] of [[1,'▲',p.upvotes],[-1,'▼',p.downvotes]]){
   const b=button((editorial?(value===1?'↑':'↓'):label)+' '+Number(count||0),()=>vote(p,value,b));
   b.classList.add(value===1?'cp-upvote':'cp-downvote');
   b.setAttribute('aria-label',(value===1?'Voto positivo':'Voto negativo')+' para el Pick de '+(p.author||'la comunidad'));
   b.setAttribute('aria-pressed',String(Number(p.my_vote)===value));
   b.disabled=!canVote;
   if(!canVote)b.title='La votación de este Pick está cerrada';
   controls.append(b);
 }
 }
 if(window.CamPickShare)controls.append(window.CamPickShare.button(p));
 if(!detail){const replies=button('Respuestas '+Number(p.comments_count||0)+(editorial?' ›':''),()=>requestPickReply(p.id));replies.classList.add('cp-replies-button');if(editorial){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M5 4h14v11H10l-5 5V4Z');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.6');icon.append(path);replies.prepend(icon);}replies.setAttribute('aria-label','Abrir respuestas del Pick: '+p.title+' ('+Number(p.comments_count||0)+')');controls.append(replies);}
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
let historicRequest=0;
async function loadHistoricPick(){
 const target=$('aeHomePickHistoricPick');
 if(!target||!db)return;
 const seq=++historicRequest;
 target.setAttribute('aria-busy','true');
 try{
  // Rank individual settled Picks across all time, independently of votes,
  // the active feed, monthly rankings and each author's accumulated score.
  const result=await db.from('ae_pick_feed').select('*')
   .eq('outcome','won').gt('result_points',0)
   .order('result_points',{ascending:false})
   .order('settled_at',{ascending:true}).order('created_at',{ascending:true})
   .order('id',{ascending:true}).limit(1);
  if(seq!==historicRequest)return;
  if(result.error)throw result.error;
  const pick=result.data?.[0];
  if(!pick){target.replaceChildren(el('p','Aún no hay un Pick acertado con puntos confirmados.','ae-discovery-empty'));return;}
  const winner=button(null,()=>open(pick.id));
  winner.className='ae-discovery-take';
  winner.setAttribute('aria-label','Leer el Pick histórico: '+(pick.title||'Publicación'));
  const sports=[...new Set((Array.isArray(pick.legs)?pick.legs:[]).map(leg=>leg.sport).filter(Boolean))];
  winner.append(el('span','RÉCORD HISTÓRICO · '+(sports.join(' / ')||'Deportes'),'ae-discovery-sport'));
  winner.append(el('strong',pick.title||'Pick de la comunidad','ae-discovery-title'));
  const excerpt=(Array.isArray(pick.legs)?pick.legs:[]).map(leg=>leg.selection).filter(Boolean).join(' + ')||String(pick.explanation||'').trim();
  if(excerpt)winner.append(el('span',excerpt.length>170?excerpt.slice(0,167).trimEnd()+'…':excerpt,'ae-discovery-excerpt'));
  const meta=el('span',null,'ae-discovery-meta');
  meta.append(el('span','@'+String(pick.author||'Aficionado').replace(/^@+/,'')),
   el('span','+'+Number(pick.result_points).toLocaleString('es-ES',{maximumFractionDigits:2})+' puntos','ae-discovery-score'));
  winner.append(meta);
  target.replaceChildren(winner);
 }catch(error){
  if(seq!==historicRequest)return;
  const retry=button('Reintentar',()=>void loadHistoricPick());
  target.replaceChildren(el('p','No se pudo cargar el Pick histórico.','ae-discovery-empty'),retry);
 }finally{if(seq===historicRequest)target.setAttribute('aria-busy','false');}
}
async function load(){
 void loadHistoricPick();
 if(!db)return;const seq=++request;
 try{
   const [feed,session]=await Promise.all([
     db.from('ae_pick_feed').select('*').gte('event_date',todayToronto()).eq('outcome','pending').order('created_at',{ascending:false}).order('id',{ascending:false}).range(0,limit-1),
     db.auth.getUser().catch(()=>({data:{user:null}}))
   ]);
   if(seq!==request)return;if(feed.error)throw feed.error;
   currentViewerId=session.data?.user?.id||null;
   const feedEl=$('cpFeed'),previousScroll=feedEl.scrollTop;
   // The archive action is the final item INSIDE the scrolling list.
   const footer=$('cpFeedFooter');
   feedEl.replaceChildren(...(feed.data||[]).map(p=>card(p)),footer);
   sizeFeedWindow();
   // Voting refreshes the feed; don't throw readers back to the top.
   feedEl.scrollTop=previousScroll;
   $('cpStatus').textContent=feed.data?.length?'':'Todavía no hay Picks. Comparte el primero.';
   loaded=true;
   await Promise.all([loadRanking(),loadWorstRanking(),loadModeration(),loadChefLists(),loadSettlement(),loadSettleHistory()]);
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
 const points=Number(record.points||0);
 label.append(el('span',(points>0?'+':'')+points.toFixed(2).replace('-','−'),'ae-chef-score-points '+(points>0?'is-positive':points<0?'is-negative':'is-neutral')));
 const accuracy=chefAccuracy(record,voids);
 const tone=accuracy===null?'is-unknown':accuracy>50?'is-positive':accuracy<50?'is-negative':'is-neutral';
 label.append(el('span',' · ','ae-chef-score-separator'));
 label.append(el('span',accuracy===null?'—':accuracy+'%','ae-chef-accuracy '+tone));
 return label;
}
// Link every Chef to a public profile and to an actual settled Pick
// from the selected period. Rankings aggregate Picks, so the Pick link
// selects a representative result without inventing a 1:1 relationship.
async function rankingRepresentativePicks(records,period,kind){
 const ids=[...new Set(records.map(x=>x.user_id).filter(Boolean))];
 const chosen=new Map();
 if(!ids.length)return chosen;
 const {data,error}=await db.from('ae_pick_feed')
   .select('id,user_id,title,outcome,result_points,settled_at,created_at')
   .in('user_id',ids).in('outcome',['won','lost'])
   .order('settled_at',{ascending:false}).limit(1000);
 if(error)return chosen;
 const month=torontoMonth(new Date());
 for(const p of data||[]){
   if(!p.id||!p.user_id||period==='month'&&(!p.settled_at||torontoMonth(p.settled_at)!==month))continue;
   const previous=chosen.get(p.user_id);
   const preferred=kind==='best'?'won':'lost';
   const relevance=q=>[
     q.outcome===preferred?1:0,
     kind==='best'?Number(q.result_points||0):-Number(q.result_points||0),
     new Date(q.settled_at||q.created_at).getTime()||0
   ];
   if(!previous){chosen.set(p.user_id,p);continue;}
   const now=relevance(p),old=relevance(previous);
   if(now[0]>old[0]||now[0]===old[0]&&
      (now[1]>old[1]||now[1]===old[1]&&now[2]>old[2]))chosen.set(p.user_id,p);
 }
 return chosen;
}
function chefRankingEntry(record,index,voids,kind,picks){
 const li=el('li',null,'ae-cp-leader'+(kind==='worst'?' ae-worst-chef-row':''));
 const name=record.username||'Aficionado';
 const person=el('div',null,'ae-chef-ranking-person');
 if(record.user_id){
   const profile=button(name,()=>{
     if(typeof window.openAePublicProfile==='function')window.openAePublicProfile(record.user_id,true,'picks');
   });
   profile.className='ae-take-name ae-chef-profile-link';
   profile.setAttribute('aria-label','Ver perfil y Picks de '+name);
   profile.title='Perfil de '+name;
   person.append(profile);
 }else{
   person.append(el('span',name,'ae-take-name'));
 }
 const selected=picks.get(record.user_id);
 if(selected){
   const pick=el('a','Ver Pick ↗','ae-chef-ranked-pick-link');
   pick.href=link(selected.id);
   pick.title=selected.title||'Abrir Pick del aficionado';
   pick.setAttribute('aria-label','Abrir Pick de '+name+': '+(selected.title||'Pronóstico'));
   pick.addEventListener('click',event=>{
     if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
     event.preventDefault();
     open(selected.id);
   });
   person.append(pick);
 }
 li.append(el('span',String(index+1),'ae-take-number'),
   person,chefRankingScore(record,voids));
 return li;
}
let bestRankingRequest=0;
async function loadRanking(){
 const list=$('cpLeaderboard');if(!list||!db)return;
 const seq=++bestRankingRequest,period=currentRank;
 const [r,voids]=await Promise.all([
   db.rpc('ae_pick_result_ranking',{p_period:period}),
   voidCountsForPeriod(period).catch(()=>null)
 ]);
 if(seq!==bestRankingRequest)return;
 if(r.error){list.replaceChildren(row('No fue posible cargar el ranking de resultados.','ae-cp-leader ae-cp-leader-empty'));return;}
 const records=(r.data||[]).slice(0,10);
 const picks=await rankingRepresentativePicks(records,period,'best').catch(()=>new Map());
 if(seq!==bestRankingRequest)return;
 list.replaceChildren();
 if(!records.length)list.append(row(period==='month'?'Este mes todavía no hay resultados confirmados.':'Aún no hay pronósticos con resultados confirmados.','ae-cp-leader ae-cp-leader-empty'));
 records.forEach((record,index)=>list.append(chefRankingEntry(record,index,voids,'best',picks)));
 sizeChefRankingWindows();
}
/* Worst Chefs uses its own SQL order (ASC) and period.
   Never reverse the Best Chefs top ten; that would omit real bottom scorers. */
async function loadWorstRanking(){
 const list=$('cpWorstLeaderboard');if(!list||!db)return;
 const seq=++worstRankingRequest,period=currentWorstRank;
 const [r,voids]=await Promise.all([
   db.rpc('ae_pick_result_ranking_worst',{p_period:period}),
   voidCountsForPeriod(period).catch(()=>null)
 ]);
 if(seq!==worstRankingRequest)return;
 if(r.error){
   list.replaceChildren(row('No fue posible cargar la clasificación de Peores Chefs.','ae-cp-leader ae-cp-leader-empty'));
   return;
 }
 const records=(r.data||[]).slice(0,10);
 const picks=await rankingRepresentativePicks(records,period,'worst').catch(()=>new Map());
 if(seq!==worstRankingRequest)return;
 list.replaceChildren();
 if(!records.length){
   list.append(row(period==='month'
     ?'Este mes todavía no hay resultados confirmados.'
     :'Aún no hay pronósticos con resultados confirmados.',
     'ae-cp-leader ae-cp-leader-empty'));
   return;
 }
 records.forEach((record,index)=>list.append(chefRankingEntry(record,index,voids,'worst',picks)));
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
 if(!r.data?.length){area.append(el('p','No hay resultados que necesiten tu revisión.'));return;}
 const checks=new Map();
 try{
  const c=await db.from('ae_pick_settlement_checks').select('pick_id,status,suggested_outcome,reason,last_checked_at').in('pick_id',r.data.map(p=>p.id));
  for(const row of c.data||[])checks.set(row.pick_id,row);
 }catch{}
 const labels={won:'Acertó',lost:'Falló',void:'Anulado'};
 // Lo que la verificación automática todavía puede confirmar no se muestra al admin.
 // Solo quedan: los que necesitan revisión, los antiguos sin fecha y, como red de
 // seguridad si la verificación se detiene, los que llevan más de 3 días esperando.
 const stale=shiftDay(todayToronto(),-3);
 const needsAdmin=p=>!p.event_date||checks.get(p.id)?.status==='needs_review'||p.event_date<=stale;
 const review=r.data.filter(needsAdmin),waiting=r.data.length-review.length;
 if(!review.length)area.append(el('p','No hay resultados que necesiten tu revisión.'));
 if(waiting)area.append(el('p',waiting===1?'1 Pick en espera: la verificación automática lo confirmará cuando termine el partido.':waiting+' Picks en espera: la verificación automática los confirmará cuando terminen los partidos.','ae-pick-settle-waiting'));
 for(const p of review){
  const entry=el('article',null,'ae-pick-settle-entry');
  const check=checks.get(p.id);
  entry.append(el('strong',p.title),el('small',p.author+' · '+(p.event_date?'Evento '+p.event_date:'Pick antiguo sin fecha · verifica que terminó')+' · '+p.american_odds));
  for(const leg of p.legs||[])entry.append(el('p',leg.event+' · '+leg.selection));
  const auto=el('p',check?.status==='needs_review'?'Necesita tu revisión: '+(check.reason||'resultado no concluyente.')+(check.suggested_outcome?' Sugerencia: '+labels[check.suggested_outcome]+'.':''):check?.status==='waiting'?'Verificación automática: '+(check.reason||'esperando el resultado oficial.'):'Verificación automática pendiente: se revisará en las próximas horas.','ae-pick-settle-auto');
  auto.dataset.state=check?.status||'queued';entry.append(auto);
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
function shiftDay(day,days){return new Date(Date.parse(day+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);}
let settleHistoryRequest=0;
async function loadSettleHistory(){
 const area=$('cpSettleHistory');if(!area)return;
 const seq=++settleHistoryRequest;
 const current=()=>seq===settleHistoryRequest&&area.isConnected&&$('cpSettleHistory')===area;
 const failure=error=>{if(current())area.replaceChildren(el('p','No pudimos cargar los últimos Picks. '+message(error),'ae-pick-history-empty'));};
 area.setAttribute('aria-busy','true');
 try{
  const r=await db.from('ae_pick_feed').select('*')
   .in('outcome',['won','lost','void']).order('settled_at',{ascending:false,nullsFirst:false}).limit(25);
  if(!current())return;
  if(r.error){failure(r.error);return;}
  const seen=new Set();
  const rows=(r.data||[]).filter(p=>{if(!p.id||seen.has(String(p.id)))return false;seen.add(String(p.id));return true;});
  if(!rows.length){area.replaceChildren(el('p','Todavía no hay Picks con resultado.','ae-pick-history-empty'));return;}
  const list=el('ol',null,'ae-pick-history-list');
  list.tabIndex=rows.length>2?0:-1;
  list.setAttribute('aria-label','Últimos Picks con resultado, del más reciente al más antiguo');
  const when=t=>new Date(t).toLocaleDateString('es-MX',{day:'numeric',month:'short',timeZone:'America/Toronto'}).replace('.','');
  for(const p of rows){
   const li=el('li',null,'ae-pick-history-entry');li.dataset.outcome=p.outcome;li.dataset.pickId=p.id;
   const pick=card(p,false,false,currentViewerId,true);
   if(p.settled_at){const footer=pick.querySelector('.cp-actions');if(footer)footer.append(el('small','Resultado · '+when(p.settled_at),'cp-history-settled'));}
   li.append(pick);list.append(li);
  }
  const frame=el('div',null,'ae-pick-history-frame');frame.append(list);
  area.replaceChildren(frame);
 }catch(error){failure(error);}
 finally{if(current())area.setAttribute('aria-busy','false');}
}
window.updateAePicksAdmin=()=>Promise.all([loadModeration(),loadSettlement(),loadSettleHistory()]);

function field(label,type='text'){const wrap=el('label',label);const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.required=true;wrap.append(input);return {wrap,input};}
function buildComposer(){
 const form=$('cpForm'),rows=[];
 let capture=null;
 const eventDay=field('Fecha del evento','text'),explanation=field('Descripción','textarea');
 eventDay.input.name='event_date';eventDay.input.defaultValue='';eventDay.input.readOnly=true;eventDay.input.setAttribute('aria-readonly','true');eventDay.input.placeholder='Se detectará al leer el boleto';
 eventDay.wrap.className='cp-compose-date';
 const dateHint=el('small','La fecha se asigna automáticamente al leer el evento. No es editable.','cp-compose-hint');dateHint.id='cpEventDateHint';eventDay.input.setAttribute('aria-describedby',dateHint.id);eventDay.wrap.append(dateHint);
 eventDay.input.max=new Date(Date.parse(todayToronto()+'T12:00:00Z')+180*86400000).toISOString().slice(0,10);
 explanation.input.name='explanation';explanation.input.required=false;explanation.input.maxLength=300;
 explanation.input.placeholder='¿Por qué te gusta este pick? (opcional)';
 explanation.wrap.className='cp-compose-description';
 explanation.wrap.firstChild.textContent='Añade un comentario (opcional)';
 const descriptionCount=el('small','0/300','cp-compose-description-count');explanation.wrap.append(descriptionCount);
 explanation.input.addEventListener('input',()=>{descriptionCount.textContent=explanation.input.value.length+'/300';});
 const legs=el('div',null,'cp-legs'),output=el('output','','cp-compose-summary');legs.hidden=true;
 const preview=el('section',null,'cp-compose-preview');preview.hidden=true;preview.setAttribute('aria-labelledby','cpPreviewTitle');
 const previewTitle=el('h3','Tu apuesta, lista para revisar');previewTitle.id='cpPreviewTitle';
 previewTitle.tabIndex=-1;
 const changeCapture=button('Cambiar captura',()=>capture?.clear());changeCapture.className='cp-compose-change-capture';
 const previewPrivacy=el('p','Captura descartada de la memoria del lector. No se envía ni guarda la imagen.','cp-compose-hint');
 const previewNote=el('p','Revisa estos datos antes de publicar.','cp-compose-hint');
 const previewLegs=el('div',null,'cp-compose-preview-legs'),previewTotal=el('p','','cp-compose-preview-total');
 // Apuestas sencillas: cada una se revisa en una línea y se publica como un Pick propio.
 const singlesList=el('ol',null,'cp-singles');
 preview.append(previewTitle,previewPrivacy,changeCapture,previewNote,singlesList,previewLegs,previewTotal);singlesList.hidden=true;
 let previewKey='',originalBeforeBoost=false,captureReadings=[],singles=null;
 const validDay=value=>{const stamp=Date.parse(value+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value&&value>=todayToronto()&&value<=eventDay.input.max;};
 const signed=n=>(n>0?'+':'')+n;
 function renderSingles(){
  singlesList.replaceChildren(...singles.map(item=>{
   const r=item.reading,li=el('li',null,'cp-single');li.dataset.state=item.done?'done':item.include?'on':'off';
   const pick=el('input');pick.type='checkbox';pick.checked=item.include;pick.disabled=item.done||r.odds<100;
   pick.setAttribute('aria-label','Publicar '+r.event+' · '+r.selection);
   pick.addEventListener('change',()=>{item.include=pick.checked;li.dataset.state=item.include?'on':'off';day.required=item.include;day.disabled=!item.include;calculate();});
   const copy=el('div',null,'cp-single-copy');
   copy.append(el('strong',r.event,'cp-single-match'),el('small',r.selection,'cp-single-choice'));
   if(item.done)copy.append(el('small','Publicado','cp-single-note'));
   else if(r.odds<100)copy.append(el('small','Momio menor a +100: no puntúa como Pick.','cp-single-note'));
   const day=el('input');day.type='date';day.className='cp-single-date';day.min=todayToronto();day.max=eventDay.input.max;day.value=item.date;day.required=item.include&&!item.done;day.disabled=item.done||r.odds<100||!item.include;
   day.setAttribute('aria-label','Fecha del partido '+r.event);
   day.addEventListener('input',()=>{item.date=day.value;calculate();});
   const when=el('label',null,'cp-single-when');when.append(el('span',r.sport||'Otros'),day);
   const label=el('label',null,'cp-single-row');label.append(pick,copy);
   li.append(label,el('span',signed(r.odds),'cp-single-odds'),when);return li;
  }));
 }
 output.setAttribute('aria-live','polite');
 const status=el('p','','cp-status');status.setAttribute('role','status');
 function values(){return rows.map(r=>({sport:r.sport.input.value.trim(),event:r.event.input.value.trim(),selection:r.selection.input.value.trim(),odds:Number(r.odds.input.value)}));}
 function validEventDate(){
  const value=eventDay.input.value,stamp=Date.parse(value+'T12:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value&&value>=todayToronto()&&value<=eventDay.input.max;
 }
 function calculate(){
  if(singles){
   preview.hidden=form.dataset.imported!=='true';previewTotal.hidden=true;
   const chosen=singles.filter(s=>s.include&&!s.done);
   const ready=chosen.length>0&&chosen.every(s=>s.reading.odds>=100&&validDay(s.date))&&!!capture?.hasImport();
   output.textContent=chosen.length===1?'1 Pick seleccionado':chosen.length+' Picks seleccionados';
   if(!posting)submit.textContent=chosen.length>1?'Publicar '+chosen.length+' Picks':'Publicar Pick';
   submit.disabled=!ready||posting;submit.dataset.ready=String(ready&&!posting);
   footerHint.textContent=ready?'Se publicará un Pick por cada apuesta marcada. Al publicar confirmas que hiciste estas apuestas.':chosen.length?'Elige la fecha del partido de cada apuesta marcada.':'Marca al menos una apuesta para publicar.';
   return ready;
  }
  const picks=values(),valid=picks.every(l=>Number.isInteger(l.odds)&&Math.abs(l.odds)>=100&&Math.abs(l.odds)<=100000);
  const decimal=picks.reduce((v,l)=>v*(l.odds>0?1+l.odds/100:1+100/Math.abs(l.odds)),1);
  const total=capture?.getTotal();
  const american=total?.american??(decimal>=2?Math.round((decimal-1)*100):-Math.round(100/(decimal-1)));
  output.textContent=valid?'Momio total · '+(american>0?'+':'')+american:'Importa una captura para leer el momio';
  preview.hidden=form.dataset.imported!=='true';
  const key=JSON.stringify({picks,american,originalBeforeBoost,captureReadings});
  if(!preview.hidden&&key!==previewKey){
   previewKey=key;
   previewNote.textContent=originalBeforeBoost?'Partido, pronóstico y momio original, sin profit boost, leídos de tu captura.':'Partido, pronóstico y momio leídos de tu captura.';
   previewLegs.replaceChildren(...picks.map((pick,index)=>{
    const entry=el('div',null,'cp-compose-preview-leg');
    if(picks.length>1)entry.append(el('h4','Selección '+(index+1)));
    const receipt=captureReadings[index];
    const glance=el('div',null,'cp-compose-ticket-head');
    glance.append(el('span',pick.sport+(receipt?.selectionCount?' · '+receipt.selectionCount+' pronósticos':''),'cp-compose-ticket-sport'),el('strong',pick.event,'cp-compose-ticket-match'));
    entry.append(glance);
    if(receipt?.selectionCount>1){
     const choices=el('ul',null,'cp-compose-ticket-choices');
     const selections=/^\d+\./.test(pick.selection)?pick.selection.split(/\s+\/\s+(?=\d+\.\s)/):pick.selection.split(' + ');
     choices.append(...selections.map(text=>el('li',text)));
     entry.append(choices);
    }
    const details=el('dl');
    for(const [label,value] of [['Deporte',pick.sport],['Partido',pick.event],['Pronóstico',pick.selection],['Momio',(pick.odds>0?'+':'')+pick.odds]]){
     const item=el('div');item.append(el('dt',label),el('dd',value));details.append(item);
    }
    if(Number.isFinite(receipt?.wager)||Number.isFinite(receipt?.payout)){
     for(const [label,value] of [['Apuesta',receipt?.wager],['Pago potencial',receipt?.payout]]){
      if(!Number.isFinite(value))continue;
      const item=el('div',null,'cp-compose-ticket-amount');item.append(el('dt',label),el('dd','$'+Number(value).toFixed(2)));details.append(item);
     }
    }
    entry.append(details);return entry;
   }));
   previewTotal.hidden=picks.length<2;
   previewTotal.textContent='Momio total de la combinada · '+(american>0?'+':'')+american;
  }
  const ready=valid&&decimal>=2&&!!capture?.hasImport()&&validEventDate();
  submit.disabled=!ready||posting;
  submit.dataset.ready=String(ready&&!posting);
  footerHint.textContent=ready?'Al publicar confirmas que hiciste esta apuesta y revisaste la fecha y el pronóstico.':form.dataset.imported==='true'?'Elige la fecha del partido para poder publicar.':'Disponible cuando termine de leerse una captura válida.';
  return valid&&decimal>=2;
 }
 function addRow(){
  if(rows.length>=2)return;
  const box=el('fieldset',null,'cp-compose-selection');box.append(el('legend','Selección '+(rows.length+1)));
  const row={box};
  for(const [key,label,placeholder] of [['sport','Deporte','Ej. NFL, fútbol, NBA…'],['event','Partido','Ej. Bengals vs Browns'],['selection','Tu pronóstico','Ej. Bengals gana'],['odds','Cuota americana','Ej. +150']]){
   row[key]=field(label);const input=row[key].input;
   input.name=key+'_'+rows.length;input.type='hidden';input.autocomplete='off';
   input.maxLength=key==='odds'?7:key==='selection'?2000:key==='sport'?40:640;
   row[key].wrap.className='cp-compose-'+key;
   input.readOnly=true;input.setAttribute('aria-readonly','true');
   box.append(row[key].wrap);
  }
  rows.push(row);legs.append(box);calculate();
 }
 const analysis=el('div',null,'cp-compose-analysis');analysis.append(explanation.wrap);
 const footer=el('footer',null,'cp-compose-footer');
 const submit=el('button','Publicar Pick');submit.type='submit';submit.disabled=true;
 const footerHint=el('small','Disponible cuando termine de leerse una captura válida.','cp-compose-hint');footerHint.id='cpPublishHint';submit.setAttribute('aria-describedby','cpPublishHint');
 footer.append(output,submit,footerHint,status);
 preview.append(eventDay.wrap,analysis);
 form.append(legs,preview,footer);addRow();
 function applyImport(imported){
  const all=imported?.readings||[];
  singles=imported?.singles?all.map((reading,index)=>({reading,index,include:reading.odds>=100,done:false,date:reading.eventDate||imported.eventDate||''})):null;
  // En modo sencillos las filas ocultas guardan solo la primera apuesta (huella de la captura).
  const data=singles?all.slice(0,1):all;
  originalBeforeBoost=data.some(reading=>reading.originalBeforeBoost);captureReadings=data;
  form.dataset.singles=String(!!singles);eventDay.wrap.hidden=!!singles;eventDay.input.required=!singles;
  previewLegs.hidden=!!singles;singlesList.hidden=!singles;if(singles)renderSingles();else singlesList.replaceChildren();
  while(rows.length>Math.max(1,data.length))rows.pop().box.remove();
  while(rows.length<data.length)addRow();
  rows.forEach((row,i)=>{for(const key of ['sport','event','selection','odds'])row[key].input.value=data[i]?(key==='sport'?(data[i][key]||'Otros'):key==='odds'?(data[i].odds>0?'+':'')+data[i].odds:data[i][key]):'';});
  // Si la captura no muestra la fecha, la persona la elige; si se detectó, queda bloqueada.
  const manualDate=!!imported&&!imported.eventDate;
  eventDay.input.readOnly=!manualDate;eventDay.input.type=manualDate?'date':'text';
  eventDay.input.min=manualDate?todayToronto():'';
  if(manualDate)eventDay.input.removeAttribute('aria-readonly');else eventDay.input.setAttribute('aria-readonly','true');
  eventDay.input.placeholder=manualDate?'Elige la fecha del partido':'Se detectará al leer el boleto';
  eventDay.wrap.dataset.manual=String(manualDate);
  eventDay.input.value=imported?.eventDate||'';
  const dateMessages={exact:'Fecha del evento detectada automáticamente en la captura.',weekday_placed:'Fecha calculada a partir del día del evento y de la apuesta. Si no coincide, sube una captura con la fecha completa.',weekday_estimated:'Fecha estimada a partir del día de la semana. Si no coincide, sube una captura que muestre el día exacto.',last_event:'Combinada: fecha del último partido detectado automáticamente.'};
  dateHint.textContent=imported?.eventDate?(dateMessages[imported.dateSource]||'Fecha del evento detectada automáticamente.'):'No pudimos leer la fecha en la captura. Elige la fecha del partido (hoy o hasta 180 días).';
  form.dataset.imported=String(!!imported);
  form.dataset.captureStep=imported?'review':'capture';
  $('cpComposeTitle').textContent=singles?'Revisa tus Picks':imported?'Revisa tu Pick':'Prepara tu Pick';
  previewTitle.textContent=singles?singles.length+' apuestas sencillas':'Tu apuesta, lista para revisar';
  if(singles)previewNote.textContent='Cada apuesta se publica como un Pick propio. Desmarca las que no quieras publicar y revisa la fecha de cada partido.';
  $('cpComposeIntro').hidden=!!imported;
  preview.hidden=!imported;
  if(!imported){previewKey='';previewLegs.replaceChildren();}
  calculate();
 }
 async function publishSingles(){
  if(!capture?.hasImport()){status.textContent='Primero sube una captura y espera a que termine la lectura.';return;}
  const chosen=singles.filter(s=>s.include&&!s.done);
  if(!chosen.length){status.textContent='Marca al menos una apuesta para publicar.';return;}
  if(chosen.some(s=>!validDay(s.date))){status.textContent='Elige la fecha de cada partido: entre hoy y los próximos 180 días.';return;}
  posting=true;submit.disabled=true;
  const closer=$('cpComposeClose');if(closer)closer.disabled=true;
  status.textContent='';let published=0;
  try{
   const user=await account(true);if(!user)return;
   for(const item of chosen){
    submit.textContent='Publicando '+(published+1)+' de '+chosen.length+'…';
    const r=item.reading,leg={sport:r.sport||'Otros',event:r.event,selection:r.selection,odds:r.odds};
    const result=await db.from('ae_community_picks').insert({title:r.event.slice(0,160),explanation:explanation.input.value.trim(),legs:[leg],event_date:item.date,capture_check:capture.proofFor(item.index)}).select('id').single();
    if(result.error)throw Object.assign(result.error,{failedOn:r.event});
    item.done=true;published++;
   }
   window.aeDraftGuard?.clear('pick');
   form.reset();explanation.input.value='';descriptionCount.textContent='0/300';
   closePickComposer(true);void load();
   notifyCommunity(published===1?'Pick publicado con el momio cotejado.':published+' Picks publicados, uno por cada apuesta sencilla.');
  }catch(e){
   renderSingles();
   status.textContent=(published?published+' publicado'+(published>1?'s':'')+'. ':'')+'No se pudo publicar '+(e.failedOn||'una apuesta')+': '+message(e);
  }finally{posting=false;if(closer)closer.disabled=false;calculate();}
 }
 capture=window.aePickCapture?.mount({form,getPicks:values,applyImport,onChange:calculate});
 form.addEventListener('input',calculate);
 form.onsubmit=async e=>{
  e.preventDefault();if(posting)return;
  if(!form.reportValidity())return;
  if(singles)return publishSingles();
  if(!validEventDate()){status.textContent='Elige una fecha de partido válida: entre hoy y los próximos 180 días.';return;}
  if(!capture?.hasImport()){status.textContent='Primero sube una captura y espera a que termine la lectura.';return;}
  if(!calculate()){status.textContent='Revisa las cuotas: la cuota total debe ser al menos +100.';return;}
  posting=true;submit.disabled=true;
  const closer=$('cpComposeClose');if(closer)closer.disabled=true;
  status.textContent='';
  try{
   const user=await account(true);if(!user)return;
   if(!capture)throw Error('No se pudo iniciar el lector de capturas. Actualiza la página e inténtalo otra vez.');
   const captureCheck=capture.proof();
   submit.textContent='Publicando…';
   const picks=values(),title=picks.map(p=>p.event).join(' / ').slice(0,160);
   const r=await db.from('ae_community_picks').insert({title,explanation:explanation.input.value.trim(),legs:picks,event_date:eventDay.input.value,capture_check:captureCheck}).select('id').single();
   if(r.error)throw r.error;
   window.aeDraftGuard?.clear('pick');
   form.reset();while(rows.length>1)rows.pop().box.remove();
   explanation.input.value='';descriptionCount.textContent='0/300';eventDay.input.defaultValue='';eventDay.input.value='';calculate();
   closePickComposer(true);void load();
   notifyCommunity('Pick publicado con el momio cotejado. Ya puedes recibir votos, comentarios y compartirlo desde su tarjeta.');
  }catch(e){status.textContent=message(e);}
  finally{posting=false;calculate();submit.textContent='Publicar Pick';if(closer)closer.disabled=false;}
 };
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
   el('span','CAM SPORTS · LA COCINA DE PICKS','ae-cp-detail-kicker'),
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
  forecast.append(el('span','EL PRONÓSTICO','ae-cp-detail-overline'),card(pick.data,false,true,session.data?.user?.id||null));
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
 document.documentElement.classList.toggle('ae-pick-composing',open);
}
function closePickComposer(force=false){
 if(posting&&!force)return;
 const dialog=$('cpComposePanel');
 if(dialog?.open)dialog.close();
 syncPickComposer();
}
async function showPickComposer(){
 const dialog=$('cpComposePanel');if(!dialog)return;
 await window.aeDraftGuard?.restore('pick');
 // A publication CTA can originate outside Picks; return to the correct
 // section only AFTER authentication has been completed.
 if(typeof currentCategory!=='undefined'&&currentCategory!=='Picks'&&typeof filterByCategory==='function')filterByCategory('Picks');
 if(!dialog.open)dialog.showModal();
 syncPickComposer();
 // Start on the heading: opening the composer must not summon the mobile keyboard.
 $('cpComposeTitle')?.focus({preventScroll:true});
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
 $('camPickBrowseLatest')?.addEventListener('click',()=>{
  closePickComposer();
  const feed=$('cpFeed');
  if(feed)feed.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 });
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

