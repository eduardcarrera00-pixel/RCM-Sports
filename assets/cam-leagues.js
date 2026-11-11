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
function emblem(rank){
  const n=level(rank),box=el('span',null,'cam-rank-emblem');box.dataset.rank=KEYS[n];box.setAttribute('aria-hidden','true');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 48 56');
  const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',n>=5?'M24 2 44 12 41 37 24 54 7 37 4 12Z':'M24 2 43 10 41 36 24 54 7 36 5 10Z');shape.setAttribute('class','cam-rank-shield');svg.append(shape);
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
function impact(p){
  const n=Number(p?.american_odds);
  return Number.isFinite(n)&&Math.abs(n)>=100?(Math.abs(n)/100).toFixed(2):null;
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
let profileId=null,profileTab='perfil',profileData=null,profileTicket=0,selected=null,expandNext=false;
const cache=new Map(),pending=new Map();
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
}
function chooseRank(r){
  selected=r.competition;
  const dialog=$('aeProfileDialog');if(!dialog)return;
  dialog.dataset.leagueRank=KEYS[level(r.rank)];
  const identity=$('camProfileRank');identity.replaceChildren(emblem(r.rank),el('span',LEVELS[level(r.rank)]+' · '+r.label));
  if($('camRankFeatureName')){$('camRankFeatureLabel').textContent='RANGO ACTUAL · '+r.label;$('camRankFeatureName').textContent=LEVELS[level(r.rank)];$('camRankFeatureBest').textContent='Mejor rango · '+LEVELS[level(r.best_rank)];$('camRankFeatureCrest').replaceChildren(emblem(r.rank));}
  const situation=$('camRankFeatureSituation');
  if(situation)situation.textContent=stateText(r);
  if($('camLeagueRivals')&&!$('camLeagueRivals').hidden)void loadRivals();
  const earned=profileData.awards.filter(a=>a.active);
  const badges=$('camProfileAwards');badges.replaceChildren(...earned.slice(0,3).map(a=>award(a)));
  for(const card of $('camProfileLeagues')?.querySelectorAll('[data-competition]')||[])card.setAttribute('aria-pressed',String(card.dataset.competition===selected));
}
function rules(){
  const details=el('details',null,'cam-league-rules');details.append(el('summary','Cómo funcionan las ligas'));
  const text=el('div');
  text.append(el('p','Cada acierto suma y cada fallo resta. Un Pick vale el momio absoluto / 100; en quinielas cada opción enseña sus puntos. Anulados: 0.'));
  text.append(el('p','Al cerrar el mes, el 20 % mejor clasificado sube de rango; el 20 % de abajo baja. El resto mantiene su rango.'));
  text.append(el('p','Para clasificar necesitas 10 Picks acertados o fallados, o participar en la mitad de los partidos resueltos de tu quiniela. El Top 10 del mes gana una insignia con su puesto y mes.'));
  const advanced=el('details',null,'cam-league-fine-print');advanced.append(el('summary','Reglas completas'));
  advanced.append(el('p','El cierre es el día 1 a las 12:00 de Toronto. Las plazas de ascenso se redondean hacia arriba y las de descenso hacia abajo. Dos meses sin el mínimo bajan un rango; las pausas deportivas no penalizan.'));
  advanced.append(el('p','Desde Diamante, dos meses seguidos en el mejor 5 % dan acceso a Leyenda. Para conservarla, termina en el mejor 10 %. El laurel NFL duplica el acierto; el fallo resta los puntos base. Los empates NFL valen 0.'));
  advanced.append(el('p','En caso de empate: puntos, aciertos, porcentaje de acierto y primer resultado registrado. Los premios quedan guardados en tu historial.'));
  text.append(advanced);
  const ladder=el('ol',null,'cam-league-ladder');LEVELS.forEach((name,i)=>{const li=el('li');li.append(emblem(i),el('span',name));ladder.append(li);});
  text.append(ladder);details.append(text);return details;
}
function renderProfile(){
  const panel=$('camProfileLeagues');if(!panel||!profileData)return;
  panel.hidden=profileTab!=='perfil';panel.replaceChildren();
  const disclosure=el('details',null,'cam-rank-disclosure');
  const summary=el('summary',null,'cam-rank-summary');
  const crest=el('span',null,'cam-rank-feature-crest');crest.id='camRankFeatureCrest';
  const copy=el('span',null,'cam-rank-feature-copy');
  const label=el('small','RANGO ACTUAL');label.id='camRankFeatureLabel';copy.append(label);
  const name=el('strong');name.id='camRankFeatureName';
  const best=el('span');best.id='camRankFeatureBest';
  const situation=el('span',null,'cam-rank-situation');situation.id='camRankFeatureSituation';
  const expand=el('span','Ver detalle ↓','cam-rank-expand');
  disclosure.addEventListener('toggle',()=>{
    expand.textContent=disclosure.open?'Cerrar detalle ↑':'Ver detalle ↓';
    const rivals=$('camLeagueRivals');
    if(rivals)rivals.hidden=!disclosure.open;
    if(disclosure.open)void loadRivals();
  });
  copy.append(name,best,situation);summary.append(crest,copy,expand);
  disclosure.append(summary);panel.append(disclosure);
  const cards=el('div',null,'cam-league-cards');
  for(const key of Object.keys(COMPETITIONS)){
    const r=profileData.ranks.find(x=>x.competition===key);if(!r)continue;
    const card=btn('','cam-league-card',()=>chooseRank(r));card.dataset.competition=key;card.dataset.rank=KEYS[level(r.rank)];
    card.setAttribute('aria-label',r.label+': '+LEVELS[level(r.rank)]+'. '+stateText(r));
    const copy=el('span',null,'cam-league-card-copy');copy.append(el('small',r.label),el('strong',LEVELS[level(r.rank)]),el('span',stateText(r),'cam-league-state'));
    copy.append(el('small','Mejor rango: '+LEVELS[level(r.best_rank)]));
    card.append(emblem(r.rank),copy);
    const progress=meter(r);if(progress)card.append(progress);
    if(r.current?.eligible){card.append(el('span','#'+r.current.position+' de '+r.current.participants,'cam-league-place'));}
    if(r.current?.eligible&&r.current.position<=10)card.append(award(r.current,true));
    cards.append(card);
  }
  disclosure.append(cards);
  const rivals=el('section',null,'cam-league-rivals');rivals.id='camLeagueRivals';rivals.hidden=!disclosure.open;
  rivals.setAttribute('aria-label','Rivales cercanos en la clasificación');
  disclosure.append(rivals);
  const actions=el('div',null,'cam-league-actions');
  actions.append(btn('Ver clasificación mensual','cam-league-link',()=>openBoard(selected||'picks')));disclosure.append(actions);
  const log=el('details',null,'cam-league-history');log.append(el('summary','Historial de rangos e insignias'));
  if(!profileData.history.length)log.append(el('p','La primera temporada es '+month(profileData.ranks[0]?.starts_on)+'. Tus logros quedarán aquí después del cierre mensual.'));
  else{
    const list=el('ul');
    for(const h of profileData.history){
      const li=el('li');li.append(el('span',month(h.season_month)+' · '+COMPETITIONS[h.competition]),el('strong',LEVELS[level(h.rank_after)]));
      if(h.eligible&&h.position<=10)li.append(award(h));
      else li.append(el('small',h.position?'Puesto #'+h.position:h.zone==='pausa'?'En pausa':'Participación insuficiente'));
      list.append(li);
    }
    log.append(list);
  }
  disclosure.append(log,rules());
  const preferred=profileData.ranks.find(r=>r.competition===selected)||topRank(profileData.ranks);
  if(preferred)chooseRank(preferred);
  // Desde el icono del rango de la cabecera: el detalle llega abierto.
  if(expandNext&&profileTab==='perfil'&&profileId===headerUser){expandNext=false;disclosure.open=true;}
}
async function onProfile(event){
  const detail=event.detail||{};
  if(!detail.userId){profileId=null;profileData=null;selected=null;++profileTicket;resetProfile();return;}
  profileTab=detail.tab||'perfil';
  if(profileId===detail.userId&&profileData){if(profileTab==='picks')selected='picks';renderProfile();return;}
  const user=detail.userId,ticket=++profileTicket;profileId=user;profileData=null;selected=profileTab==='picks'?'picks':null;resetProfile();
  const panel=$('camProfileLeagues');if(!panel)return;
  panel.hidden=profileTab!=='perfil';panel.append(el('p','Cargando ligas…','cam-league-status'));
  try{
    const data=await profile(user);
    if(ticket!==profileTicket||profileId!==user||!$('aeProfileDialog')?.open)return;
    profileData=data;renderProfile();
    if(user===headerUser)paintHeader(data);
  }catch{
    if(ticket!==profileTicket)return;
    panel.replaceChildren(el('p','No se pudieron cargar las ligas.','cam-league-status'),btn('Reintentar','cam-league-link',()=>{profileId=null;onProfile({detail});}));
  }
}

let boardTicket=0,rivalTicket=0;
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
async function loadRivals(){
  const target=$('camLeagueRivals'),user=profileId,comp=selected;
  if(!target||target.hidden||!user||!COMPETITIONS[comp])return;
  const ticket=++rivalTicket;
  target.replaceChildren(el('h4','Tus rivales más cercanos'),el('p','Consultando clasificación…','cam-rival-note'));
  try{
    const data=await getBoard(comp);
    if(ticket!==rivalTicket||profileId!==user||selected!==comp||!target.isConnected||target.hidden)return;
    const rows=Array.isArray(data.rows)?data.rows:[];
    const me=rows.find(r=>r.user_id===user);
    target.replaceChildren(el('h4','Rivales cercanos · '+COMPETITIONS[comp]));
    if(me)raceContext(target,me,rows);
    else target.append(el('p','Sin resultados registrados todavía en esta liga.','cam-rival-note'));
  }catch{
    if(ticket===rivalTicket&&target.isConnected)target.replaceChildren(el('p','Los rivales no están disponibles ahora.','cam-rival-note'));
  }
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
    target.append(rules());
  }catch{
    if(ticket!==boardTicket)return;
    target.replaceChildren(el('p','No se pudo cargar la clasificación.','cam-league-status'),btn('Reintentar','cam-league-link',()=>openBoard(competition)));
  }
}

// Batch only visible author identities. No per-row RPCs or polling timers.
const identityCache=new Map();let decorateTimer=0;
function markAuthor(node,user,competition='picks'){
  if(!node||!UUID.test(user||''))return;
  node.dataset.leagueUser=user;node.dataset.leagueCompetition=competition;
  scheduleDecorate();
}
function scheduleDecorate(){clearTimeout(decorateTimer);decorateTimer=setTimeout(decorate,80);}
async function decorate(){
  const nodes=[...document.querySelectorAll('[data-league-user]')].filter(n=>!n.querySelector('.cam-author-rank')&&n.getClientRects().length);
  const users=[...new Set(nodes.map(n=>n.dataset.leagueUser))].filter(id=>!identityCache.has(id)).slice(0,50);
  if(users.length){
    try{const r=await db.rpc('cam_league_identities',{p_users:users});if(r.error)return;for(const id of users)identityCache.set(id,r.data?.[id]||{ranks:[],awards:[]});}catch{return;}
  }
  for(const n of nodes){
    if(!n.isConnected||n.querySelector('.cam-author-rank'))continue;
    const data=identityCache.get(n.dataset.leagueUser);if(!data)continue;
    const comp=n.dataset.leagueCompetition;
    const rank=data.ranks.find(r=>r.competition===comp),prize=data.awards.find(a=>a.competition===comp);
    if(!rank&&!prize)continue;
    const badge=el('span',null,'cam-author-rank');
    if(rank){badge.append(emblem(rank.rank_level));badge.title=LEVELS[level(rank.rank_level)]+' · '+COMPETITIONS[comp];badge.setAttribute('aria-label',badge.title);}
    if(prize)badge.append(award(prize));n.append(badge);
  }
}
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
    headerAt=Date.now();paintHeader(data);
  }catch{/* Sin ligas: la cabecera sigue sin rango. */}
}
function bindHeader(){
  const b=$('camHeaderRank');if(!b)return;
  b.addEventListener('click',()=>{expandNext=true;window.openAeProfile?.();});
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
  if(overview&&!$('camProfileLeagues')){const panel=el('section',null,'cam-profile-leagues');panel.id='camProfileLeagues';panel.hidden=true;panel.setAttribute('aria-label','Ligas, rangos e insignias');overview.before(panel);}
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
  $('aeProfileDialog')?.addEventListener('close',()=>{expandNext=false;});
  document.addEventListener('ae:picks-updated',()=>{cache.clear();identityCache.clear();boardCache.clear();});
}
window.CamLeagues=Object.freeze({markAuthor,mountEntry,open:openBoard,emblem,award,levels:LEVELS,stateText,topRank,syncHeader});
// This script follows the profile markup. Bind before the profile's own
// DOMContentLoaded listener: an already-resolved session can emit its view event
// in a microtask between DOMContentLoaded listeners on a direct profile URL.
if($('aeProfileDialog'))init();else document.addEventListener('DOMContentLoaded',init,{once:true});
})();
