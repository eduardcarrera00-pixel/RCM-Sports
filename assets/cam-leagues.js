/* CAM SPORTS · Ligas mensuales. Rank/award data is read-only and comes from
 * server snapshots; visiting a profile can never award a sporting achievement. */
(() => {
'use strict';
const LEVELS=['Cobre','Bronce','Plata','Oro','Platino','Diamante','Leyenda CAM'];
const KEYS=['cobre','bronce','plata','oro','platino','diamante','leyenda'];
const COMPETITIONS={picks:'Picks',nfl:'Quiniela NFL',football:'Quiniela Fútbol'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
const level=n=>Math.max(0,Math.min(6,Number(n)||0));
const btn=(text,cls,click)=>{const b=el('button',text,cls);b.type='button';b.addEventListener('click',click);return b;};
const month=value=>{const d=new Date(String(value).slice(0,10)+'T12:00:00Z');return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('es',{month:'long',year:'numeric',timeZone:'America/Toronto'}).format(d);};
const points=n=>Number(n||0).toLocaleString('es',{maximumFractionDigits:2});
/* Escudo de rango (11 nov 2026): el escudo va relleno del metal de su rango
   (cobre, bronce, plata, oro, platino, diamante, leyenda), con una cara algo
   más clara a la izquierda para que se lea como metal, y el símbolo encima.
   Los colores salen de --rank-fill / --rank-deep / --rank-ink (cam-leagues.css).
   Con letter (la foto de una persona, desde el 11 nov 2026 a petición de Eduard),
   su inicial va en el centro del escudo en lugar del símbolo del rango. */
function emblem(rank,letter=''){
  const n=level(rank),box=el('span',null,'cam-rank-emblem');box.dataset.rank=KEYS[n];box.setAttribute('aria-hidden','true');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 48 56');
  const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',n>=5?'M24 2 44 12 41 37 24 54 7 37 4 12Z':'M24 2 43 10 41 36 24 54 7 36 5 10Z');shape.setAttribute('class','cam-rank-shield');svg.append(shape);
  const facet=document.createElementNS(svg.namespaceURI,'path');facet.setAttribute('d',n>=5?'M24 3.2 24 52.6 7.9 36.6 5.1 12.6Z':'M24 3.2 24 52.6 7.9 35.6 6.1 10.7Z');facet.setAttribute('class','cam-rank-facet');svg.append(facet);
  if(letter){
    const t=document.createElementNS(svg.namespaceURI,'text');
    t.setAttribute('x','24');t.setAttribute('y','27.5');t.setAttribute('text-anchor','middle');t.setAttribute('dominant-baseline','central');
    t.setAttribute('class','cam-rank-letter');t.textContent=letter;svg.append(t);box.append(svg);return box;
  }
  const mark=document.createElementNS(svg.namespaceURI,'path');
  mark.setAttribute('d',n===6?'m13 30-3-13 9 7 5-12 5 12 9-7-3 13Zm1 7h20':n===5?'m24 12 12 14-12 17-12-17Z':n===4?'m12 20 12-8 12 8-12 22Zm0 0h24':n===3?'m24 12 4 9 10 1-8 7 2 11-8-5-8 5 2-11-8-7 10-1Z':n===2?'m13 30 11-12 11 12m-22 8 11-12 11 12':n===1?'m13 25 11-12 11 12m-22 10 11-12 11 12':'m13 30 11-12 11 12');
  mark.setAttribute('class','cam-rank-symbol');svg.append(mark);box.append(svg);return box;
}
function meter(r){
  const c=r.current;
  if(!c||!Number(c.available))return null;
  const ready=!!c.eligible,done=Math.max(0,Number(c.resolved)||0),need=Math.max(0,Number(c.required)||0);
  const count=Math.max(1,Number(c.participants)||1),place=Math.max(1,Number(c.position)||count);
  const fraction=ready?Math.max(0,1-(place-1)/count):need?Math.min(1,done/need):0;
  const box=el('span',null,'cam-league-meter');
  const label=ready?'Puesto #'+place+' de '+count+' · '+points(c.points)+' pts':
    done+' / '+need+' resultados · faltan '+Math.max(0,need-done);
  box.append(el('span',label,'cam-league-meter-label'));
  const track=el('span',null,'cam-league-meter-track'),fill=el('span',null,'cam-league-meter-fill');
  fill.style.width=Math.round(fraction*100)+'%';
  track.append(fill);box.append(track);return box;
}
function award(item,provisional=false){
  const position=Number(item.position)||0;
  const b=el('span',null,'cam-top10-badge'+(provisional?' is-provisional':''));
  b.dataset.podium=String(position<=3?position:0);
  b.append(el('span',position<=3?['','1.º','2.º','3.º'][position]:'★','cam-top10-symbol'),
    el('span',provisional?'En zona Top 10':'Top 10 · #'+position));
  const title=(COMPETITIONS[item.competition]||item.competition)+' · '+month(item.season_month);
  b.title=title+(provisional?' · Provisional':' · Puesto '+position);
  b.setAttribute('aria-label',(provisional?'En zona Top 10 provisional':'Top 10, puesto '+position)+'. '+title);
  return b;
}
function stateText(r){
  const c=r.current;
  if(!c)return r.last_month?'Sin resultados este mes':'Rango provisional · Por clasificar';
  if(!c.available)return 'Temporada en pausa';
  if(!c.eligible)return c.resolved+' / '+c.required+' resultados para clasificar';
  if(c.zone==='ascenso')return 'En zona de ascenso a '+LEVELS[level(c.rank_after)];
  if(c.zone==='descenso')return 'En zona de descenso a '+LEVELS[level(c.rank_after)];
  if(c.zone==='leyenda')return 'Primer mes en la carrera a Leyenda';
  return 'En zona de permanencia';
}

// El rango que se muestra de alguien es el más alto de sus ligas (empate: Picks, NFL, Fútbol).
function topRank(ranks){
  const order=Object.keys(COMPETITIONS);
  return [...(ranks||[])].sort((a,b)=>level(b.rank)-level(a.rank)||order.indexOf(a.competition)-order.indexOf(b.competition))[0]||null;
}
/* ===========================================================================
   Perfil (11 nov 2026). Dos sitios:
   · Pestaña «Perfil» (#camProfileLeagues): solo el escudo y «Rango: Cobre»,
     con el enlace «¿Quieres entender el sistema de rangos?» que abre «Rangos».
   · Pestaña «Rangos» (#camProfileRanks): rango actual y mejor rango, progreso
     al siguiente rango, rango por modalidad, escalera, historial y cómo
     funcionan. Todo sale de cam_league_profile (una llamada, caché de 60 s) y,
     para el progreso y los rivales, de cam_league_board de la modalidad elegida
     (también con caché de 60 s), solo con la pestaña «Rangos» abierta.
   Las reglas son las de supabase/migrations/20261108134701_cam_monthly_leagues.sql
   (cam_league_outcome y refresh_month) y los mínimos de cam_league_competitions.
   =========================================================================== */
// cam_league_competitions.minimum (comprobado en producción el 11 nov 2026).
const MINIMUM={picks:10,nfl:1,football:1};
const SHORT={picks:'Picks',nfl:'NFL',football:'Fútbol'};
const clamp01=x=>Math.max(0,Math.min(1,Number(x)||0));
let profileId=null,profileTab='perfil',profileOwn=false,profileData=null,profileTicket=0,selected=null,progressTicket=0;
const cache=new Map(),pending=new Map(),progressBoards=new Map();
async function profile(user,force=false){
  const hit=cache.get(user);
  if(!force&&hit&&Date.now()-hit.time<60000)return hit.data;
  if(pending.has(user))return pending.get(user);
  const promise=(async()=>{
    const r=await db.rpc('cam_league_profile',{p_user:user});if(r.error)throw r.error;
    if(!r.data||!Array.isArray(r.data.ranks))throw Error('Ligas no disponibles');
    cache.set(user,{time:Date.now(),data:r.data});return r.data;
  })();
  pending.set(user,promise);
  try{return await promise;}finally{pending.delete(user);}
}
function resetProfile(){
  const dialog=$('aeProfileDialog');if(dialog)delete dialog.dataset.leagueRank;
  $('camProfileRank')?.replaceChildren();$('camProfileAwards')?.replaceChildren();
  const panel=$('camProfileLeagues');if(panel){panel.replaceChildren();panel.hidden=true;}
  $('camProfileRanks')?.replaceChildren();
  progressBoards.clear();++progressTicket;
}
const rankOf=key=>profileData?.ranks?.find(r=>r.competition===key)||null;
// Modalidad que se mira primero en el progreso: la del rango más alto; en
// empate, la que ya clasifica este mes o la que lleva más resultados.
function featured(ranks){
  const order=Object.keys(COMPETITIONS);
  return [...(ranks||[])].sort((a,b)=>level(b.rank)-level(a.rank)
    ||Number(Boolean(b.current?.eligible))-Number(Boolean(a.current?.eligible))
    ||(Number(b.current?.resolved)||0)-(Number(a.current?.resolved)||0)
    ||order.indexOf(a.competition)-order.indexOf(b.competition))[0]||null;
}
// TODO(Eduard): «provisional» no es una regla guardada en la base de datos. Aquí
// significa que esa persona todavía no ha pasado ningún cierre mensual en esa
// modalidad (no tiene fila en cam_league_members): su Cobre es el de partida y
// se confirma en el primer cierre en el que tenga resultados. Confirmar.
const isProvisional=r=>!r?.last_month;
// Cabecera del perfil: el rango más alto tiñe el perfil; debajo del nombre, su
// escudo y las insignias Top 10 del mes pasado (como hasta ahora).
function paintIdentity(){
  const dialog=$('aeProfileDialog'),top=topRank(profileData?.ranks);
  if(!dialog||!top)return;
  dialog.dataset.leagueRank=KEYS[level(top.rank)];
  paintProfileFaces(level(top.rank));
  $('camProfileRank')?.replaceChildren(emblem(top.rank),el('span',LEVELS[level(top.rank)]+' · '+top.label));
  const earned=(profileData.awards||[]).filter(a=>a.active);
  $('camProfileAwards')?.replaceChildren(...earned.slice(0,3).map(a=>award(a)));
}
function openRanksTab(){
  const tab=$('aeProfileTabRanks');if(!tab)return;
  tab.click();
  try{tab.focus({preventScroll:true});}catch{}
  try{$('aeProfileTabs')?.scrollIntoView({block:'nearest'});}catch{}
}
/* ---------- Pestaña «Perfil»: el rango, fijo y sencillo ---------- */
function renderSimple(panel){
  const top=topRank(profileData.ranks);
  panel.replaceChildren();
  if(!top){panel.hidden=true;return;}
  const box=el('div',null,'cam-rank-simple');box.dataset.rank=KEYS[level(top.rank)];
  const line=el('p',null,'cam-rank-simple-line');
  const text=el('span','Rango: ','cam-rank-simple-text');text.append(el('strong',LEVELS[level(top.rank)],'cam-rank-simple-name'));
  line.append(emblem(top.rank),text);
  const link=btn('','cam-rank-simple-link',openRanksTab);
  link.setAttribute('aria-controls','camProfileRanks');
  link.append(el('span','¿Quieres entender el sistema de rangos?'),el('span','›','cam-rank-simple-chevron'));
  link.lastChild.setAttribute('aria-hidden','true');
  box.append(line,link);panel.append(box);
}
/* ---------- Pestaña «Rangos» ---------- */
function section(cls,title,id){
  const s=el('section',null,'cam-rk-block '+cls);
  if(title){const h=el('h3',title,'cam-rk-title');h.id=id;s.setAttribute('aria-labelledby',id);s.append(h);}
  return s;
}
function hero(){
  const ranks=profileData.ranks,top=topRank(ranks),lv=level(top.rank);
  const best=Math.max(lv,...ranks.map(r=>level(r.best_rank)));
  const box=el('section',null,'cam-rk-block cam-rk-hero');box.dataset.rank=KEYS[lv];box.setAttribute('aria-labelledby','camRankHeroName');
  const crest=el('div',null,'cam-rk-hero-crest');crest.append(emblem(lv));
  const copy=el('div',null,'cam-rk-hero-copy');
  copy.append(el('p','Rango actual','cam-rk-kicker'));
  const name=el('h3',LEVELS[lv],'cam-rk-hero-name');name.id='camRankHeroName';copy.append(name);
  copy.append(el('p','Mejor rango: '+LEVELS[best],'cam-rk-hero-best'));
  if(ranks.every(isProvisional)){
    const ready=ranks.some(r=>r.current?.eligible);
    copy.append(el('p','Rango provisional · '+(ready?'Se confirma al cierre del mes':'Por clasificar'),'cam-rk-chip'+(ready?'':' is-pending')));
  }
  const earned=(profileData.awards||[]).filter(a=>a.active);
  if(earned.length){const awards=el('div',null,'cam-rk-awards');awards.append(...earned.slice(0,3).map(a=>award(a)));copy.append(awards);}
  box.append(crest,copy);return box;
}
// Qué falta para el siguiente rango, con las reglas de cam_league_outcome.
function nextStep(r,board){
  const lv=level(r.rank),c=r.current,own=profileOwn,rows=Array.isArray(board?.rows)?board.rows:[];
  const say=(mine,theirs)=>own?mine:theirs;
  const info={from:lv,to:lv<5?lv+1:lv===5?6:null,fraction:0,label:'',main:'',notes:[]};
  const goal=lv<5?'Después, el 20 % mejor de los clasificados sube a '+LEVELS[lv+1]+' al cierre del mes.':
    lv===5?'Para llegar a Leyenda CAM hacen falta dos meses seguidos en el 5 % mejor.':
    'Para conservar Leyenda CAM hay que terminar el mes en el 10 % mejor.';
  const available=c?Number(c.available):rows.length?Number(rows[0].available):NaN;
  if(available===0){
    info.label='Temporada en pausa';
    info.main='Este mes todavía no hay resultados en '+r.label+'.';
    info.notes.push('Los meses en pausa no cuentan: el rango no cambia.');
    return info;
  }
  if(!c?.eligible){
    const need=Number(c?.required)||Number(rows[0]?.required)||(r.competition==='picks'?MINIMUM.picks:0);
    const done=Math.max(0,Number(c?.resolved)||0),left=Math.max(0,need-done);
    if(need){
      info.fraction=clamp01(done/need);
      info.label=done+' / '+need+' resultados · faltan '+left;
      info.main='Faltan '+left+(left===1?' resultado':' resultados')+' para clasificar este mes en '+r.label+'.';
    }else{
      info.label='Sin resultados este mes';
      info.main=say('Juega la quiniela de este mes para empezar a clasificar.','Todavía no tiene resultados este mes en '+r.label+'.');
    }
    info.notes.push(goal);
    if(c?.zone==='inactividad')info.notes.push(say('Ojo: si el mes cierra sin clasificar, bajas a ','Si el mes cierra sin clasificar, baja a ')+LEVELS[level(c.rank_after)]+' (dos meses seguidos sin clasificar).');
    return info;
  }
  const total=Math.max(1,Number(c.participants)||1),pos=Math.max(1,Number(c.position)||total);
  const share=lv<5?.2:lv===5?.05:.1,cut=Math.max(1,Math.ceil(total*share));
  const cutText=cut===1?'el primer puesto':'los '+cut+' primeros';
  const ranked=rows.filter(x=>x.eligible);
  const atCut=ranked.find(x=>Number(x.position)===cut);
  const gap=atCut?Math.max(0,Number(atCut.points||0)-Number(c.points||0)):0;
  info.label='Puesto #'+pos+' de '+total+' · '+points(c.points)+' pts';
  if(pos<=cut){
    info.fraction=lv===5&&Number(c.next_streak)<2?.5:1;
    if(lv<5)info.main=say('Si el mes cerrara hoy, subirías a ','Si el mes cerrara hoy, subiría a ')+LEVELS[lv+1]+'.';
    else if(lv===5)info.main=Number(c.next_streak)>=2?say('Si el mes cerrara hoy, llegarías a Leyenda CAM.','Si el mes cerrara hoy, llegaría a Leyenda CAM.'):
      say('Vas en el 5 % mejor: si repites el mes que viene, llegas a Leyenda CAM.','Va en el 5 % mejor: si repite el mes que viene, llega a Leyenda CAM.');
    else info.main=say('Si el mes cerrara hoy, conservarías Leyenda CAM.','Si el mes cerrara hoy, conservaría Leyenda CAM.');
    info.notes.push('Hay que seguir entre '+cutText+' hasta el cierre.');
  }else{
    const places=pos-cut;
    info.fraction=total>cut?clamp01((total-pos)/(total-cut)):0;
    if(lv===5)info.fraction/=2;
    const target=lv<5?'la zona de ascenso':lv===5?'el 5 % mejor':'el 10 % mejor';
    info.main='Faltan '+places+(places===1?' puesto':' puestos')+' para '+target+(gap?' ('+points(gap)+' pts)':'')+'.';
    info.notes.push(lv<5?'Suben '+cutText+' (el 20 % mejor).':lv===5?goal:say('Si el mes cerrara hoy, volverías a Diamante.','Si el mes cerrara hoy, volvería a Diamante.'));
  }
  if(c.zone==='descenso'&&lv<6)info.notes.push(say('Ahora mismo estás en zona de descenso: si el mes cerrara hoy, bajarías a ','Ahora mismo está en zona de descenso: si el mes cerrara hoy, bajaría a ')+LEVELS[level(c.rank_after)]+'.');
  return info;
}
function rivalList(target,me,rows){
  const ranked=orderedEligible(rows),index=ranked.findIndex(r=>r.user_id===me.user_id);
  if(!me.eligible||index<0)return;
  const list=el('div',null,'cam-rival-list');
  for(const [r,kind] of [[ranked[index-1],'Por alcanzar'],[ranked[index+1],'Le persigue']]){
    if(!r)continue;
    const delta=Math.max(0,Math.abs(Number(r.points||0)-Number(me.points||0)));
    const b=btn('','cam-rival',()=>window.openAePublicProfile?.(r.user_id));
    b.append(el('small',kind==='Le persigue'&&profileOwn?'Te persigue':kind),el('strong','@'+(r.username||'Aficionado')),
      el('span','#'+r.position+' · '+points(r.points)+' pts'),
      el('small',delta?'Diferencia: '+points(delta)+' pts':'Empate a puntos · decide el desempate'));
    list.append(b);
  }
  if(!list.children.length)return;
  target.append(el('h4','Rivales cercanos','cam-rk-subtitle'),list);
}
function paintProgress(){
  const body=$('camRankProgressBody'),r=rankOf(selected);
  if(!body||!r)return;
  const board=progressBoards.get(r.competition)||null;
  const info=nextStep(r,board);
  for(const b of document.querySelectorAll('#camRankProgressPick button'))b.setAttribute('aria-pressed',String(b.dataset.competition===r.competition));
  body.replaceChildren();body.dataset.rank=KEYS[info.from];
  const track=el('div',null,'cam-rk-track');
  const from=el('span',null,'cam-rk-track-end');from.dataset.rank=KEYS[info.from];from.append(emblem(info.from),el('span',LEVELS[info.from]));
  const bar=el('span',null,'cam-rk-bar');
  bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');
  bar.setAttribute('aria-valuenow',String(Math.round(info.fraction*100)));
  bar.setAttribute('aria-label',info.to===null?'Rango máximo · '+info.label:'Progreso hacia '+LEVELS[info.to]+' en '+r.label+' · '+info.label);
  const fill=el('span',null,'cam-rk-bar-fill');fill.style.width=Math.round(info.fraction*100)+'%';bar.append(fill);
  track.append(from,bar);
  if(info.to!==null){const to=el('span',null,'cam-rk-track-end is-next');to.dataset.rank=KEYS[info.to];to.append(emblem(info.to),el('span',LEVELS[info.to]));track.append(to);}
  else{const to=el('span',null,'cam-rk-track-end is-next is-top');to.append(el('span','Rango máximo'));track.append(to);}
  body.append(track,el('p',info.label,'cam-rk-progress-label'),el('p',info.main,'cam-rk-progress-main'));
  for(const note of info.notes)body.append(el('p',note,'cam-rk-progress-note'));
  const me=Array.isArray(board?.rows)?board.rows.find(x=>x.user_id===profileId):null;
  if(me)rivalList(body,me,board.rows);
  const actions=el('div',null,'cam-rk-actions');
  actions.append(btn('Ver clasificación mensual de '+r.label,'cam-league-link',()=>openBoard(r.competition)));
  body.append(actions);
}
async function loadProgress(){
  const comp=selected,user=profileId,ticket=++progressTicket;
  if(!COMPETITIONS[comp]||profileTab!=='rangos'||progressBoards.has(comp))return;
  try{
    const data=await getBoard(comp);
    if(ticket!==progressTicket||profileId!==user||selected!==comp||profileTab!=='rangos')return;
    progressBoards.set(comp,data);paintProgress();
  }catch{/* Sin clasificación: el progreso sigue con los datos del perfil. */}
}
function selectProgress(key){
  if(!rankOf(key)||selected===key)return;
  selected=key;paintProgress();void loadProgress();
}
function progressBlock(){
  const s=section('cam-rk-progress','Progreso al siguiente rango','camRankProgressTitle');
  const pick=el('div',null,'cam-rk-pick');pick.id='camRankProgressPick';pick.setAttribute('role','group');pick.setAttribute('aria-label','Modalidad');
  for(const key of Object.keys(COMPETITIONS)){
    if(!rankOf(key))continue;
    const b=btn(SHORT[key],'cam-rk-pick-btn',()=>selectProgress(key));
    b.dataset.competition=key;b.setAttribute('aria-label',COMPETITIONS[key]);b.setAttribute('aria-pressed',String(key===selected));
    pick.append(b);
  }
  const body=el('div',null,'cam-rk-progress-body');body.id='camRankProgressBody';body.setAttribute('aria-live','polite');
  s.append(pick,body);return s;
}
function modalities(){
  const s=section('cam-rk-modes','Rango por modalidad','camRankModesTitle');
  const cards=el('div',null,'cam-league-cards');
  for(const key of Object.keys(COMPETITIONS)){
    const r=rankOf(key);if(!r)continue;
    const card=el('article',null,'cam-league-card');card.dataset.competition=key;card.dataset.rank=KEYS[level(r.rank)];
    card.setAttribute('aria-label',r.label+': '+LEVELS[level(r.rank)]+'. '+stateText(r));
    const progress=meter(r);
    const copy=el('span',null,'cam-league-card-copy');copy.append(el('small',r.label),el('strong',LEVELS[level(r.rank)]));
    // La barra ya dice «X / N resultados · faltan M»: sin repetirlo encima.
    if(!(progress&&!r.current?.eligible))copy.append(el('span',stateText(r),'cam-league-state'));
    copy.append(el('small','Mejor rango: '+LEVELS[level(r.best_rank)]));
    card.append(emblem(r.rank),copy);
    if(progress)card.append(progress);
    if(r.current?.eligible&&r.current.position<=10)card.append(award(r.current,true));
    cards.append(card);
  }
  s.append(cards);return s;
}
function ladderList(current=null,best=null){
  const list=el('ol',null,'cam-rk-ladder');
  LEVELS.forEach((name,i)=>{
    const state=current===null?'is-reached':i<current?'is-reached':i===current?'is-current':'is-locked';
    const li=el('li',null,'cam-rk-step '+state);li.dataset.rank=KEYS[i];
    if(i===current)li.setAttribute('aria-current','step');
    const copy=el('span',null,'cam-rk-step-copy');copy.append(el('span',name,'cam-rk-step-name'));
    if(i===current)copy.append(el('small',profileOwn?'Tu rango':'Su rango','cam-rk-step-tag'));
    else if(best!==null&&i===best&&best>current)copy.append(el('small','Mejor rango','cam-rk-step-tag is-best'));
    else if(state==='is-locked')copy.append(el('small','Aún no alcanzado','cam-rk-step-hidden'));
    li.append(emblem(i),copy);list.append(li);
  });
  return list;
}
function ladderBlock(){
  const ranks=profileData.ranks,top=topRank(ranks),lv=level(top.rank);
  const best=Math.max(lv,...ranks.map(r=>level(r.best_rank)));
  const s=section('cam-rk-ladder-block','Escalera de rangos','camRankLadderTitle');
  s.append(ladderList(lv,best));return s;
}
function historyBlock(){
  const log=el('details',null,'cam-league-history cam-rk-history');log.append(el('summary','Historial de rangos e insignias'));
  const history=profileData.history||[];
  if(!history.length)log.append(el('p','La primera temporada es '+month(profileData.ranks[0]?.starts_on)+'. Los logros quedarán aquí después del cierre mensual.'));
  else{
    const list=el('ul');
    for(const h of history){
      const before=level(h.rank_before),after=level(h.rank_after);
      const outcome=after>before?'↑ Ascenso a ':after<before?'↓ Descenso a ':'';
      const li=el('li');li.append(el('span',month(h.season_month)+' · '+COMPETITIONS[h.competition]),
        el('strong',outcome+LEVELS[after]));
      if(h.eligible&&h.position<=10)li.append(award(h));
      else li.append(el('small',h.position?'Puesto #'+h.position:h.zone==='pausa'?'En pausa':'Participación insuficiente'));
      list.append(li);
    }
    log.append(list);
  }
  return log;
}
/* «¿Cómo funcionan los rangos?»: textos sacados de cam_league_outcome,
   refresh_month, close_month, el cron cam-monthly-leagues (cada 15 min) y los
   mínimos de cam_league_competitions. */
const HOW=[
  ['¿Qué es un rango provisional?',[
    'Todos empiezan en Cobre. Cada modalidad (Picks, Quiniela NFL y Quiniela Fútbol) tiene su propio rango; en el perfil se muestra el más alto.',
    'El rango es provisional hasta el primer cierre de mes en el que tienes resultados en esa modalidad. Desde ahí queda confirmado y solo cambia en cada cierre.']],
  ['¿Cuántos resultados hacen falta para clasificar?',[
    'Picks: '+MINIMUM.picks+' Picks resueltos en el mes, acertados o fallados. Los anulados no cuentan.',
    'Quinielas: pronosticar al menos la mitad de los partidos ya terminados del mes (como mínimo '+MINIMUM.nfl+'). Como cada semana terminan más partidos, la cifra crece durante el mes.',
    'Solo quien clasifica entra en la lucha por subir. La clasificación del mes se actualiza cada 15 minutos.']],
  ['¿Cómo se sube y se baja?',[
    'Cada acierto suma y cada fallo resta. Un Pick vale el momio absoluto / 100; en las quinielas cada opción enseña sus puntos. Anulados: 0. El laurel NFL duplica el acierto y el fallo resta los puntos base; los empates NFL valen 0.',
    'El mes cierra el día 1 a las 12:00 (hora de Toronto). Entre los clasificados, el 20 % mejor sube un rango y el 20 % de abajo baja uno; el resto se queda igual. Las plazas para subir se redondean hacia arriba y las de bajar, hacia abajo.',
    'En empate a puntos deciden los aciertos, el porcentaje de acierto y quién tuvo antes su primer resultado.',
    'Dos meses seguidos sin clasificar bajan un rango. Los meses sin partidos (en pausa) no cuentan. Nadie baja de Cobre.',
    'Subiendo así se llega hasta Diamante. Leyenda CAM: desde Diamante, dos meses seguidos en el 5 % mejor. Para conservarla, termina cada mes en el 10 % mejor; si no, vuelves a Diamante.']],
  ['¿Qué significa «mejor rango»?',[
    'Es el rango más alto que has tenido en algún cierre de mes. No baja nunca, aunque tu rango actual baje. En el perfil se muestra el mejor de las tres modalidades.']],
  ['¿Y las insignias Top 10?',[
    'Los 10 primeros clasificados del mes ganan una insignia con su puesto y el mes. Mientras el mes sigue abierto se ve «En zona Top 10», que es provisional. Las insignias quedan en el historial.']]
];
function howItWorks(){
  const s=section('cam-rk-how','¿Cómo funcionan los rangos?','camRankHowTitle');
  const list=el('div',null,'cam-rk-how-list');
  for(const [question,answers] of HOW){
    const d=el('details',null,'cam-rk-how-item');
    d.append(el('summary',question));
    const body=el('div',null,'cam-rk-how-body');
    for(const a of answers)body.append(el('p',a));
    d.append(body);list.append(d);
  }
  s.append(list);return s;
}
function renderRanks(panel){
  const top=topRank(profileData.ranks);
  if(!top){panel.replaceChildren(el('p','Los rangos no están disponibles ahora.','cam-league-status'));return;}
  if(!rankOf(selected))selected=featured(profileData.ranks)?.competition||top.competition;
  panel.replaceChildren(hero(),progressBlock(),modalities(),ladderBlock(),historyBlock(),howItWorks());
  paintProgress();void loadProgress();
}
function render(){
  if(!profileData)return;
  paintIdentity();
  const simple=$('camProfileLeagues');
  if(simple){simple.hidden=profileTab!=='perfil';if(profileTab==='perfil')renderSimple(simple);}
  const full=$('camProfileRanks');
  if(full&&profileTab==='rangos')renderRanks(full);
}
function loadingState(){
  const simple=$('camProfileLeagues');
  if(simple){simple.hidden=profileTab!=='perfil';simple.replaceChildren(el('p','Cargando rango…','cam-league-status'));}
  $('camProfileRanks')?.replaceChildren(el('p','Cargando rangos…','cam-league-status'));
}
async function onProfile(event){
  const detail=event.detail||{};
  if(!detail.userId){profileId=null;profileData=null;selected=null;++profileTicket;resetProfile();paintProfileFaces('none');return;}
  profileTab=detail.tab||'perfil';profileOwn=Boolean(detail.own);
  if(profileId===detail.userId&&profileData){render();return;}
  // Mientras llega, la pestaña abierta no se repinta con «Cargando» otra vez.
  if(profileId===detail.userId&&pending.has(detail.userId)){loadingState();return;}
  const user=detail.userId,ticket=++profileTicket;profileId=user;profileData=null;selected=null;resetProfile();
  // El escudo sale ya si esa persona se vio antes en una lista; si no, neutro hasta que llega.
  const seen=identityCache.get(user);paintProfileFaces(seen?levelOf(seen):null);
  if(!$('camProfileLeagues'))return;
  loadingState();
  try{
    const data=await profile(user);
    if(ticket!==profileTicket||profileId!==user||!$('aeProfileDialog')?.open)return;
    rememberProfile(user,data);
    profileData=data;render();
    if(user===headerUser)paintHeader(data);
  }catch{
    if(ticket!==profileTicket)return;
    const retry=()=>{profileId=null;onProfile({detail:{...detail,tab:profileTab}});};
    const simple=$('camProfileLeagues');
    if(simple){simple.hidden=profileTab!=='perfil';simple.replaceChildren(el('p','No se pudo cargar el rango.','cam-league-status'),btn('Reintentar','cam-league-link',retry));}
    $('camProfileRanks')?.replaceChildren(el('p','No se pudieron cargar los rangos.','cam-league-status'),btn('Reintentar','cam-league-link',retry));
  }
}

let boardTicket=0;
const boardCache=new Map();
async function getBoard(competition){
  const cached=boardCache.get(competition);
  if(cached&&Date.now()-cached.time<60000)return cached.data;
  const result=await db.rpc('cam_league_board',{p_competition:competition});
  if(result.error)throw result.error;
  const data=result.data||{};
  boardCache.set(competition,{time:Date.now(),data});return data;
}
function orderedEligible(rows){
  return rows.filter(r=>r.eligible).sort((a,b)=>Number(a.position)-Number(b.position));
}
function raceContext(target,me,rows){
  const ranked=orderedEligible(rows),index=ranked.findIndex(r=>r.user_id===me.user_id);
  if(!me.eligible){
    const missing=Math.max(0,Number(me.required||0)-Number(me.resolved||0));
    target.append(el('p','Faltan '+missing+' resultados para entrar en la lucha por el ascenso.','cam-rival-note'));
    return;
  }
  const ahead=ranked[index-1],behind=ranked[index+1];
  const intro=el('p','Puesto #'+me.position+' · '+points(me.points)+' pts · '+stateText({current:me}),'cam-rival-note');
  target.append(intro);
  const list=el('div',null,'cam-rival-list');
  for(const [r,kind] of [[ahead,'Por alcanzar'],[behind,'Te persigue']]){
    if(!r)continue;
    const delta=Math.max(0,Math.abs(Number(r.points||0)-Number(me.points||0)));
    const b=btn('','cam-rival',()=>window.openAePublicProfile?.(r.user_id));
    b.append(el('small',kind),el('strong','@'+(r.username||'Aficionado')),
      el('span','#'+r.position+' · '+points(r.points)+' pts'),
      el('small',delta?'Diferencia: '+points(delta)+' pts':'Empate a puntos · decide el desempate'));
    list.append(b);
  }
  if(list.children.length)target.append(list);
  else target.append(el('p','Eres el único participante clasificado de momento.','cam-rival-note'));
}
// Reglas dentro de la clasificación mensual: las mismas de la pestaña «Rangos».
function rulesDetails(){
  const d=el('details',null,'cam-league-rules');d.append(el('summary','¿Cómo funcionan los rangos?'));
  const body=el('div');
  for(const [question,answers] of HOW){body.append(el('h4',question,'cam-league-rules-q'));for(const a of answers)body.append(el('p',a));}
  body.append(ladderList());d.append(body);return d;
}
async function openBoard(competition='picks'){
  if(!COMPETITIONS[competition])competition='picks';
  const dialog=$('camLeagueDialog');if(!dialog)return;
  if(!dialog.open)dialog.showModal();
  $('camLeagueTitle').textContent='Liga CAM · '+COMPETITIONS[competition];
  const tabs=$('camLeagueTabs');tabs.replaceChildren();
  for(const [key,label] of Object.entries(COMPETITIONS)){
    const b=btn(label,'cam-league-tab',()=>openBoard(key));b.setAttribute('aria-pressed',String(key===competition));tabs.append(b);
  }
  const target=$('camLeagueBoard');target.replaceChildren(el('p','Cargando clasificación…','cam-league-status'));
  const ticket=++boardTicket;
  try{
    const data=await getBoard(competition);
    if(ticket!==boardTicket||!dialog.open)return;
    const rows=(Array.isArray(data.rows)?[...data.rows]:[]).sort((a,b)=>
      Number(b.eligible)-Number(a.eligible)||(a.eligible?a.position-b.position:Number(b.points)-Number(a.points)||b.correct-a.correct||b.resolved-a.resolved));
    target.replaceChildren(el('p',month(data.month)+' · '+(data.closed?'Clasificación definitiva':'Clasificación provisional'),'cam-league-status'));
    const eligible=rows.filter(x=>x.eligible);
    if(!eligible.length)target.append(el('p','Todavía no hay participantes que cumplan el mínimo de esta liga.','cam-league-status'));
    const myRow=headerUser&&rows.find(x=>x.user_id===headerUser);
    if(myRow){
      const race=el('section',null,'cam-league-my-race');
      race.append(el('h3','Tu carrera este mes'));
      raceContext(race,myRow,rows);target.append(race);
    }
    if(rows.length){
      const list=el('ol',null,'cam-league-board-list');
      for(const row of rows){
        const li=el('li');li.dataset.zone=row.zone;
        if(row.user_id===headerUser)li.classList.add('is-you');
        const name=btn('@'+row.username,'cam-league-person',()=>{dialog.close();window.openAePublicProfile?.(row.user_id);});
        li.append(el('b',row.eligible?'#'+row.position:'—'),emblem(data.closed?row.rank_after:row.rank_before),name,
          el('strong',points(row.points)+' pts'));
        const meta=el('span',row.eligible?row.correct+' aciertos · '+stateText({current:row}):row.resolved+' / '+row.required+' para clasificar','cam-league-board-meta');li.append(meta);
        if(row.eligible&&row.position<=10)li.append(award(row,!data.closed));list.append(li);
      }
      target.append(list);
    }
    target.append(rulesDetails());
  }catch{
    if(ticket!==boardTicket)return;
    target.replaceChildren(el('p','No se pudo cargar la clasificación.','cam-league-status'),btn('Reintentar','cam-league-link',()=>openBoard(competition)));
  }
}

/* ===========================================================================
   El escudo como foto (11 nov 2026). Donde antes salía la inicial de alguien
   (perfil, Takes, conversación, Picks, quinielas, grupos) sale el escudo de su
   rango, con el dibujo y el color de ese rango. Es el mismo rango que su
   perfil llama «Rango actual»: el más alto de sus ligas; quien aún no ha
   pasado ningún cierre mensual es Cobre. Mientras llega el dato se ve un
   escudo neutro del mismo tamaño (nada se mueve) y, si no hay cuenta detrás,
   se queda neutro. Los rangos se piden en tandas de hasta 50 personas con
   cam_league_identities (la llamada que ya usaban las insignias), solo para
   los escudos que están a la vista y una sola vez por persona.
   Uso: CamLeagues.avatar(nodo, idDeUsuario). Si este archivo llega después
   que la lista, basta con dejar data-rank-face="<id>" en el nodo: init() lo
   convierte al cargar.
   =========================================================================== */
const identityCache=new Map(),asking=new Set();let decorateTimer=0;
// Rango de alguien: el más alto de sus ligas (filas de cam_league_identities
// con rank_level, o de cam_league_profile con rank). Sin filas, Cobre.
const levelOf=data=>(data?.ranks||[]).reduce((top,r)=>Math.max(top,level(r.rank_level??r.rank)),0);
const watcher=typeof IntersectionObserver==='function'
  ?new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))scheduleDecorate();},{rootMargin:'240px 0px'}):null;
const watched=new Set();
const watch=node=>{if(watcher){watcher.observe(node);watched.add(node);}else scheduleDecorate();};
const unwatch=node=>{if(watched.delete(node))watcher.unobserve(node);};
// Inicial de la foto: la que la lista ya había escrito en el nodo (o la que pone
// el perfil en data-rank-letter). Se guarda para repintar al llegar el rango.
const firstLetter=text=>(String(text||'').match(/[\p{L}\p{N}]/u)?.[0]||'').toLocaleUpperCase('es');
function paintAvatar(node,lv,named=false){
  if(!node)return node;
  if(node.dataset.rankLetter===undefined&&!node.classList.contains('cam-rank-avatar'))node.dataset.rankLetter=firstLetter(node.textContent);
  node.classList.add('cam-rank-avatar');
  const known=lv!=null&&lv!=='none',pic=emblem(known?lv:0,node.dataset.rankLetter||'');
  if(!known)pic.dataset.rank='pending';
  node.dataset.rank=known?KEYS[level(lv)]:(lv==='none'?'none':'pending');
  const kids=[pic];
  if(named)kids.push(el('span',known?LEVELS[level(lv)]:'\u00a0','cam-rank-avatar-name'));
  node.replaceChildren(...kids);
  if(known)node.title='Rango '+LEVELS[level(lv)];else node.removeAttribute('title');
  return node;
}
function avatar(node,user){
  if(!node)return node;
  const id=UUID.test(String(user||''))?String(user):'';
  node.dataset.rankFace=id;
  if(!id){unwatch(node);return paintAvatar(node,'none');}
  const hit=identityCache.get(id);
  paintAvatar(node,hit?levelOf(hit):null);
  if(hit)unwatch(node);else watch(node);
  return node;
}
function markAuthor(node,user,competition='picks'){
  if(!node||!UUID.test(user||''))return;
  node.dataset.leagueUser=user;node.dataset.leagueCompetition=competition;
  scheduleDecorate();
}
function scheduleDecorate(){clearTimeout(decorateTimer);decorateTimer=setTimeout(decorate,80);}
async function decorate(){
  for(const n of watched)if(!n.isConnected)unwatch(n);
  const shown=n=>n.isConnected&&n.getClientRects().length>0;
  const marks=()=>[...document.querySelectorAll('[data-league-user]')].filter(n=>!n.dataset.leagueDone&&shown(n));
  const faces=()=>[...document.querySelectorAll('.cam-rank-avatar[data-rank="pending"]')].filter(n=>n.dataset.rankFace&&shown(n));
  const users=[...new Set([...marks().map(n=>n.dataset.leagueUser),...faces().map(n=>n.dataset.rankFace)])]
    .filter(id=>!identityCache.has(id)&&!asking.has(id));
  for(let i=0;i<users.length;i+=50){
    const batch=users.slice(i,i+50);batch.forEach(id=>asking.add(id));
    try{
      const r=await db.rpc('cam_league_identities',{p_users:batch});
      if(r.error)break;
      for(const id of batch)identityCache.set(id,r.data?.[id]||{ranks:[],awards:[]});
    }catch{break;}
    finally{batch.forEach(id=>asking.delete(id));}
  }
  for(const n of faces()){
    const data=identityCache.get(n.dataset.rankFace);if(!data)continue;
    paintAvatar(n,levelOf(data));unwatch(n);
  }
  for(const n of marks()){
    const data=identityCache.get(n.dataset.leagueUser);if(!data)continue;
    n.dataset.leagueDone='1';
    const comp=n.dataset.leagueCompetition,prize=data.awards.find(a=>a.competition===comp);
    // Con el escudo como foto, el rango ya está a la vista: solo se añade el Top 10.
    const face=n.querySelector('.cam-rank-avatar');
    if(face&&!prize)continue;
    const badge=el('span',null,'cam-author-rank');
    if(!face){const lv=levelOf(data);badge.append(emblem(lv));badge.title='Rango '+LEVELS[lv];badge.setAttribute('aria-label',badge.title);}
    if(prize)badge.append(award(prize));
    n.append(badge);
  }
}
/* Perfil: el escudo grande con el nombre del rango debajo (y lo mismo en
   «Editar perfil»). Se lee como «Rango: Oro». */
function paintProfileFaces(lv){
  for(const id of ['camProfileAvatar','camProfileEditAvatar']){
    const n=$(id);if(!n)continue;
    if(n.dataset.rankLetter===undefined)n.dataset.rankLetter='';
    paintAvatar(n,lv,true);
    n.classList.add('is-profile');
    n.removeAttribute('aria-hidden');n.setAttribute('role','img');
    n.setAttribute('aria-label',lv==null||lv==='none'?'Rango':'Rango: '+LEVELS[level(lv)]);
  }
}
// El perfil cambia la inicial cuando cambia el nombre (ae-profile.js).
function setLetter(node,name){
  if(!node)return;
  const letter=firstLetter(name);node.dataset.rankLetter=letter;
  const pic=node.querySelector(':scope > .cam-rank-emblem');if(!pic)return;
  const waiting=pic.dataset.rank==='pending',next=emblem(waiting?0:KEYS.indexOf(pic.dataset.rank),letter);
  if(waiting)next.dataset.rank='pending';
  pic.replaceWith(next);
}
const rememberProfile=(user,data)=>{
  if(!UUID.test(user||'')||!Array.isArray(data?.ranks))return;
  identityCache.set(user,{ranks:data.ranks.map(r=>({competition:r.competition,rank_level:level(r.rank)})),awards:(data.awards||[]).filter(a=>a.active)});
};
function mountEntry(host,comp){
  if(!host||host.querySelector(':scope > .cam-league-entry'))return;
  const link=btn('Liga CAM ›','cam-league-entry',()=>openBoard(comp));
  if(host.tagName==='OL'){if(!host.previousElementSibling?.classList.contains('cam-league-entry'))host.before(link);}else host.prepend(link);
}
/* Cabecera (9 nov 2026): solo el icono del rango actual, sin texto; el dibujo
   y el color dicen el rango y el nombre va en aria-label. Sin sesión no se
   muestra. Una llamada al iniciar sesión (la misma caché de 60 s que el perfil)
   y como mucho otra cada 10 min al volver a la pestaña. */
let headerUser=null,headerTicket=0,headerAt=0;
function paintHeader(data){
  const b=$('camHeaderRank');if(!b)return;
  const icon=b.querySelector('.cam-control-icon');
  const r=data&&topRank(data.ranks);
  if(!r){b.hidden=true;delete b.dataset.rank;icon?.replaceChildren();b.setAttribute('aria-label','Tu rango');b.title='Tu rango';return;}
  const name=LEVELS[level(r.rank)];
  b.dataset.rank=KEYS[level(r.rank)];
  icon?.replaceChildren(emblem(r.rank));
  b.setAttribute('aria-label','Tu rango: '+name);
  b.title='Rango '+name+' · '+r.label;
  b.hidden=false;
}
async function syncHeader(force=false){
  if(!$('camHeaderRank')||typeof db==='undefined'||!db)return;
  const ticket=++headerTicket;
  let id=null;
  try{const {data}=await db.auth.getUser();id=data?.user&&!data.user.is_anonymous?data.user.id:null;}catch{return;}
  if(ticket!==headerTicket)return;
  if(!id){headerUser=null;headerAt=0;paintHeader(null);return;}
  if(id!==headerUser){headerUser=id;headerAt=0;paintHeader(null);force=true;}
  if(!force&&Date.now()-headerAt<6e5)return;
  try{
    const data=await profile(id,force&&headerAt>0);
    if(ticket!==headerTicket||headerUser!==id)return;
    rememberProfile(id,data);
    headerAt=Date.now();paintHeader(data);
  }catch{/* Sin ligas: la cabecera sigue sin rango. */}
}
function bindHeader(){
  const b=$('camHeaderRank');if(!b)return;
  // Desde el icono del rango de la cabecera: el perfil abre en «Rangos».
  b.addEventListener('click',()=>window.openAeProfile?.('rangos'));
  if(typeof db!=='undefined'&&typeof db?.auth?.onAuthStateChange==='function')db.auth.onAuthStateChange(()=>setTimeout(()=>void syncHeader(),40));
  window.addEventListener('cam:admin-state-change',()=>void syncHeader());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncHeader();});
  void syncHeader();
}

function init(){
  bindHeader();
  const names=document.querySelector('#aeProfileDialog .cam-profile-names');
  if(names&&!$('camProfileRank')){const rank=el('div',null,'cam-profile-rank');rank.id='camProfileRank';const awards=el('div',null,'cam-profile-awards');awards.id='camProfileAwards';names.append(rank,awards);}
  const overview=$('camProfileOverview');
  // Pestaña «Perfil»: el rango sencillo va encima de «Primeros pasos».
  if(overview&&!$('camProfileLeagues')){const panel=el('section',null,'cam-profile-leagues');panel.id='camProfileLeagues';panel.hidden=true;panel.setAttribute('aria-label','Rango');overview.before(panel);}
  // Pestaña «Rangos» (está en index.html; por si una página antigua no la trae).
  if(overview&&!$('camProfileRanks')){const ranks=el('section',null,'cam-profile-ranks');ranks.id='camProfileRanks';ranks.hidden=true;ranks.setAttribute('role','tabpanel');ranks.setAttribute('aria-label','Rangos');($('camProfileParties')||overview).before(ranks);}
  const dialog=el('dialog',null,'cam-league-dialog');dialog.id='camLeagueDialog';dialog.setAttribute('aria-labelledby','camLeagueTitle');
  const header=el('header');const title=el('h2','Ligas CAM');title.id='camLeagueTitle';
  const close=btn('×','cam-league-close',()=>dialog.close());close.setAttribute('aria-label','Cerrar clasificación');header.append(title,close);
  const tabs=el('nav');tabs.id='camLeagueTabs';tabs.setAttribute('aria-label','Ligas');
  const board=el('div');board.id='camLeagueBoard';board.setAttribute('aria-live','polite');dialog.append(header,tabs,board);document.body.append(dialog);
  dialog.addEventListener('close',()=>++boardTicket);
  // Existing sport layouts keep their content and controls.
  for(const [id,comp] of [['cpLeaderboard','picks'],['camNflQuinielaStandings','nfl'],['camFootballQuinielaStandings','football']]){
    const host=$(id);if(!host)continue;
    mountEntry(host,comp);
  }
  document.addEventListener('cam:profile-view',onProfile);
  document.addEventListener('ae:picks-updated',()=>{cache.clear();identityCache.clear();boardCache.clear();progressBoards.clear();});
  // Fotos que se pintaron antes de que llegara este archivo (con su inicial): pasan a escudo.
  for(const n of document.querySelectorAll('[data-rank-face]:not(.cam-rank-avatar)'))avatar(n,n.dataset.rankFace);
  if(!$('camProfileAvatar')?.classList.contains('cam-rank-avatar'))paintProfileFaces('none');
}
window.CamLeagues=Object.freeze({markAuthor,mountEntry,open:openBoard,emblem,avatar,setLetter,award,levels:LEVELS,stateText,topRank,syncHeader,nextStep});
// This script follows the profile markup. Bind before the profile's own
// DOMContentLoaded listener: an already-resolved session can emit its view event
// in a microtask between DOMContentLoaded listeners on a direct profile URL.
if($('aeProfileDialog'))init();else document.addEventListener('DOMContentLoaded',init,{once:true});
})();
