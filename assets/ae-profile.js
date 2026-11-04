/* AE SPORTS · Unified private profile: Perfil · Takes · Picks · Mi Party.
 * Public author profiles expose public Takes and Picks.
 * 3 nov 2026: el perfil abre en «Perfil» (resumen, cam_profile_overview: una
 * llamada). Takes y Picks se cargan al abrir su pestaña; «Mi Party» la pinta
 * cam-parties.js. ?perfil=<id>&tab=takes|picks|party abre esa pestaña.
 */
(() => {
'use strict';

const $ = id => document.getElementById(id);
const el = (tag,text,cls) => {
  const n=document.createElement(tag);
  if(text!==undefined&&text!==null)n.textContent=String(text);
  if(cls)n.className=cls;
  return n;
};
function setOverview(text=''){
  const overview=$('aeProfileOverviewText');
  if(!overview)return;
  overview.textContent=text;
  overview.hidden=!text;
}

const labels={
  football:'Fútbol',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',
  champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial',general:'Deportes'
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let request=0;
let activeAuthor=null;
let privateView=false;
let working=false;
const TABS=['perfil','takes','picks','quiniela','party'];
const validTab=tab=>TABS.includes(tab)?tab:'perfil';
let activeTab='perfil';
let ownTakes=[];
let ownPicks=[];
let publicAuthorLabel='Aficionado';
let profileName='';
let ownUnpopularTakeId=null;
let recentScrollObserver=null;
let prestigeRequest=0;
// Cada pestaña carga lo suyo la primera vez que se abre (cuota de Supabase).
let takesLoaded=false,takesLoading=null,picksLoaded=false,picksLoading=null;
// Session data is used only to paint the UI; every private query remains
// authorized by Supabase. Do not revalidate over the network on each tap/focus.
let sessionUser;
let sessionRead=null;
let sessionRevision=0;
let overview=null,overviewError='',overviewStale=false,overviewTimer=0;

/* Perfil de prestigio: aciertos medidos por dificultad (escala 1–20). */
const RISK_TEXT={
  'Conservador':'Suele ir con lo lógico.',
  'Equilibrado':'Mezcla apuestas seguras con alguna sorpresa.',
  'Atrevido':'Se la juega a menudo por sorpresas.',
  'Visionario':'Vive de las predicciones más locas.'
};
function percentText(p){const v=Number(p)*100;if(!Number.isFinite(v))return '';return (v<1?v.toFixed(1).replace('.',','):String(Math.round(v)))+'%';}
function prestigeStat(label,value,detail){
  const box=el('div',null,'ae-profile-prestige-stat');
  box.append(el('span',label),el('strong',value));
  if(detail)box.append(el('small',detail));
  return box;
}
function renderPrestige(summary,legendary,champions=[]){
  const target=$('aeProfilePrestige');
  if(!target)return;
  target.replaceChildren();
  const head=el('div',null,'ae-profile-prestige-head');
  head.append(el('span','PERFIL DE PRESTIGIO'),el('p','Cada acierto vale según lo difícil que era: lo obvio suma poco y las hazañas quedan grabadas.'));
  target.append(head);
  const resolved=numeric(summary?.resolved);
  if(!summary||!resolved){
    target.append(el('p',privateView?'Cuando se puntúen tus primeros Takes por dificultad, aquí verás tu perfil de riesgo y tus medallas.':'Este aficionado todavía no tiene Takes puntuados por dificultad.','ae-profile-empty'));
    appendChampionPicks(target,champions);
    target.hidden=activeTab!=='takes';
    return;
  }
  const stats=el('div',null,'ae-profile-prestige-stats');
  const risk=summary.risk_label||'—';
  stats.append(prestigeStat('Riesgo',risk,(summary.risk_score!=null?'Dificultad media '+String(summary.risk_score).replace('.',',')+' / 20. ':'')+(RISK_TEXT[risk]||'')));
  const attempts=numeric(summary.bold_attempts),hits=numeric(summary.bold_hits);
  const rate=summary.bold_rate!=null?String(Math.round(Number(summary.bold_rate)))+'%':'—';
  stats.append(prestigeStat('Hazañas',rate,attempts
    ?hits+' de '+attempts+' apuestas de 10+ pts'+(summary.bold_rate==null?' · se muestra desde 5 intentos':'')
    :'Aún sin apuestas de 10+ pts'));
  stats.append(prestigeStat('Legendarios',String(numeric(summary.legendary_count)),'Aciertos de 15 a 20 pts'));
  target.append(stats);
  if(legendary.length){
    const list=el('ol',null,'ae-profile-medals');
    for(const item of legendary){
      const li=el('li',null,'ae-profile-medal');
      const badge=el('span',null,'ae-profile-medal-badge');badge.setAttribute('aria-hidden','true');
      const copy=el('div',null,'ae-profile-medal-copy');
      copy.append(el('small','Epic Prediction '+(item.season_label||'')),el('strong',item.title||'Take'));
      const meta=[];
      if(item.points!=null)meta.push('+'+item.points+' pts');
      const pct=percentText(item.probability);if(pct)meta.push('probabilidad '+pct);
      if(item.competition)meta.push(item.competition);
      copy.append(el('span',meta.join(' · ')));
      li.append(badge,copy);
      list.append(li);
    }
    target.append(el('h3','Salón de la fama','ae-profile-list-heading'),list);
  }
  appendChampionPicks(target,champions);
  target.hidden=activeTab!=='takes';
}
/* Vitrina de campeones: las elecciones de «¿Quién será campeón?» (suman a Takes). */
const CHAMPION_LEAGUES={laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions',nfl:'NFL',colegial:'Colegial'};
let nflCrests=null;
function championInitials(label){return /^otro\b/i.test(label)?'Otro':String(label||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();}
function championNorm(v){return String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function championDay(v){try{return new Intl.DateTimeFormat('es',{day:'numeric',month:'short'}).format(new Date(v)).replace('.','');}catch{return '';}}
async function loadNflCrests(){
  if(nflCrests)return nflCrests;
  try{const r=await db.from('nfl_teams').select('name,logo');nflCrests=new Map((r.error?[]:r.data||[]).map(t=>[championNorm(t.name),t.logo]));}
  catch{nflCrests=new Map();}
  return nflCrests;
}
function championCrest(c){
  if(c.competition==='nfl')return nflCrests?.get(championNorm(c.team))||'';
  return window.aeSeasonPredictions?.crest?.(c.competition,c.team)||'';
}
function appendChampionPicks(target,champions){
  if(!Array.isArray(champions)||!champions.length)return;
  const box=el('section',null,'ae-champ-cabinet');
  box.setAttribute('aria-label',privateView?'Mis campeones':'Campeones elegidos');
  const head=el('header',null,'ae-champ-head');
  const won=champions.filter(c=>c.state==='won'),live=champions.filter(c=>c.state==='open'||c.state==='pending');
  const earned=won.reduce((n,c)=>n+numeric(c.awarded_points),0);
  const tally=el('p',null,'ae-champ-tally');
  if(live.length)tally.append(el('span',live.length===1?'1 en juego':live.length+' en juego'));
  if(won.length)tally.append(el('span',(won.length===1?'1 acierto':won.length+' aciertos')+', +'+earned+' pts','is-won'));
  head.append(el('h3',privateView?'Mis campeones':'Campeones elegidos'),tally);
  box.append(head);
  const list=el('ul',null,'ae-champ-shelf');
  const crests=[];
  for(const c of champions){
    const state=c.state||'open';
    const li=el('li',null,'ae-champ is-'+state);
    const medal=el('div',null,'ae-champ-medal');
    medal.append(el('span',championInitials(c.team),'ae-champ-initials'));
    if(state==='won'){const seal=el('span','✓','ae-champ-seal');seal.setAttribute('aria-hidden','true');medal.append(seal);}
    crests.push([medal,c]);
    const league=el('p',(CHAMPION_LEAGUES[c.competition]||c.competition||'')+(c.season?' '+c.season:''),'ae-champ-league');
    const team=el('strong',c.team||'—','ae-champ-team');
    const pts=numeric(state==='won'?c.awarded_points:c.points);
    const score=el('p',null,'ae-champ-score');
    score.append(el('b','+'+pts),el('span',state==='won'?'pts ganados':state==='lost'?'pts en juego':'pts si acierta'));
    const foot=el('p',
      state==='won'?'Campeón confirmado':
      state==='lost'?(c.winner?'Campeón: '+c.winner:'No fue esta vez'):
      state==='pending'?'Esperando al campeón':
      'Se cierra el '+championDay(c.closes_at),'ae-champ-foot');
    li.append(medal,league,team,score,foot);
    li.setAttribute('aria-label',(CHAMPION_LEAGUES[c.competition]||'')+': '+(c.team||'')+'. '+foot.textContent+'.');
    list.append(li);
  }
  box.append(list);
  target.append(box);
  const paint=()=>{for(const [medal,c] of crests){
    if(medal.querySelector('img'))continue;
    const src=championCrest(c);if(!src)continue;
    const img=el('img');img.src=src;img.alt='';img.width=56;img.height=56;img.loading='lazy';img.decoding='async';
    img.addEventListener('load',()=>medal.classList.add('is-loaded'));
    img.addEventListener('error',()=>img.remove());
    medal.append(img);
  }};
  paint();
  if(champions.some(c=>c.competition==='nfl')&&!nflCrests)loadNflCrests().then(paint);
}
async function loadPrestige(userId){
  const target=$('aeProfilePrestige');
  if(!target||!userId)return;
  const ticket=++prestigeRequest;
  try{
    const [summary,legendary,champions]=await Promise.all([
      db.rpc('ae_take_prestige',{p_user_id:userId}),
      db.rpc('ae_take_legendary',{p_user_id:userId}),
      Promise.resolve(db.rpc('ae_user_champion_picks',{p_user_id:userId})).catch(()=>({data:[],error:true}))
    ]);
    if(ticket!==prestigeRequest||activeAuthor!==userId)return;
    if(summary.error)throw summary.error;
    if(legendary.error)throw legendary.error;
    const row=Array.isArray(summary.data)?summary.data[0]:summary.data;
    renderPrestige(row||null,legendary.data||[],champions.error?[]:(champions.data||[]));
  }catch(e){
    if(ticket!==prestigeRequest)return;
    target.replaceChildren(el('p','El perfil de prestigio no está disponible ahora mismo.','ae-profile-empty'));
    target.hidden=activeTab!=='takes';
  }
}

function publicProfileEntry(t,owner){
  const name=String(t.author||(privateView?profileName:publicAuthorLabel)||'Aficionado')
    .replace(/^@+/,'').split(' · ')[0].trim();
  return {...t,author_id:t.author_id||owner,author:name};
}

function openProfileTake(t,owner,reply=false){
  if(t.hidden)return;
  window.aeTakeReplies?.open(publicProfileEntry(t,owner),
    reply?{focusComposer:true}:{});
}

function openSharedProfileTake(owner){
  const params=new URL(location.href).searchParams;
  const id=params.get('take');
  if(params.get('perfil')!==String(owner)||!UUID.test(id||''))return;
  const take=ownTakes.find(t=>!t.hidden&&String(t.id).toLowerCase()===id.toLowerCase());
  if(take)openProfileTake(take,owner);
  else $('aeProfileStatus').textContent='Este Take no está disponible públicamente.';
}

async function refreshProfileTakes(){
  const dialog=$('aeProfileDialog'),author=activeAuthor,isOwn=privateView,token=request;
  if(!dialog?.open||!author)return;
  markOverviewStale();
  if(!takesLoaded)return;
  try{
    const r=isOwn?await db.rpc('ae_my_free_takes'):await db.rpc('ae_public_take_profile',{p_author_id:author});
    if(r.error)throw r.error;
    if(token!==request||!dialog.open||activeAuthor!==author||privateView!==isOwn)return;
    ownTakes=r.data||[];
    if(activeTab==='takes')renderTakes(ownTakes,author,!isOwn);
    loadPrestige(author);
  }catch(e){
    if(token===request&&dialog?.open)$('aeProfileStatus').textContent='No se pudieron actualizar los Takes. '+(e.message||'');
  }
}

async function voteProfileTake(t,owner,value){
  if(working||t.hidden)return;
  try{
    const viewer=await me();
    if(!viewer){window.openUserAuthModal?.();return;}
    if(viewer.id===(t.author_id||owner))return;
    working=true;
    const r=await db.rpc('ae_vote_free_take',{p_take_id:t.id,p_value:value});
    if(r.error)throw r.error;
    document.dispatchEvent(new Event('ae:takes-updated'));
  }catch(e){
    $('aeProfileStatus').textContent=e.message||'No se pudo votar.';
  }finally{working=false;}
}

function profileTakeActions(t,owner,canVote){
  if(t.hidden)return null;
  const bar=el('div',null,'ae-profile-take-actions');
  for(const [label,reply] of [['Ver Take',false],['Responder',true]]){
    const b=el('button',label,reply?'ae-profile-take-reply':'ae-profile-take-open');
    b.type='button';
    b.setAttribute('aria-label',(reply?'Responder al Take: ':'Abrir Take: ')+(t.title||'Take'));
    b.addEventListener('click',()=>openProfileTake(t,owner,reply));
    bar.append(b);
  }
  if(canVote){
    for(const [value,label] of [[1,'▲ Apoyar'],[-1,'▼ Cuestionar']]){
      const b=el('button',label,'ae-profile-take-vote');
      b.type='button';b.disabled=working;
      b.setAttribute('aria-pressed',String(Number(t.my_vote)===value));
      b.setAttribute('aria-label',label+': '+(t.title||'Take'));
      b.addEventListener('click',()=>voteProfileTake(t,owner,value));
      bar.append(b);
    }
  }
  if(window.CamPickShare)bar.append(window.CamPickShare.button(publicProfileEntry(t,owner),{kind:'take'}));
  return bar;
}

async function me(){
  if(typeof db==='undefined'||!db)return null;
  if(sessionUser!==undefined)return sessionUser;
  if(sessionRead)return sessionRead;
  const revision=sessionRevision;
  sessionRead=Promise.resolve().then(()=>typeof db.auth.getSession==='function'
    ?db.auth.getSession():db.auth.getUser()).then(r=>{
      if(r.error)throw r.error;
      if(revision===sessionRevision)sessionUser=r.data?.session?.user||r.data?.user||null;
      return sessionUser;
    }).catch(()=>sessionUser).finally(()=>{sessionRead=null;});
  return sessionRead;
}

function updateButton(){
  const b=$('aeMyTakesButton');
  if(!b)return;
  if(sessionUser===undefined)return;
  const adminActive=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
  b.hidden=!sessionUser||adminActive;
  window.camMobileDock?.update?.();
}

function close(){
  closeEdit(false);
  document.dispatchEvent(new CustomEvent('cam:profile-view',{detail:{userId:null}}));
  if(recentScrollObserver){recentScrollObserver.disconnect();recentScrollObserver=null;}
  ++request;
  activeAuthor=null;
  privateView=false;
  activeTab='perfil';
  ownTakes=[];
  ownPicks=[];
  resetLoads();
  publicAuthorLabel='Aficionado';
  ownUnpopularTakeId=null;
  const dialog=$('aeProfileDialog');
  if(dialog?.open)dialog.close();
  if(new URL(location.href).searchParams.has('perfil')){
    const url=new URL(location.href);
    url.searchParams.delete('perfil');
    url.searchParams.delete('take');
    url.searchParams.delete('tab');
    history.replaceState(history.state,'',url);
  }
}

function dateText(value){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'':d.toLocaleDateString('es',{day:'numeric',month:'short',year:'numeric'});
}

function numeric(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function takeNet(t){return numeric(t.upvotes)-numeric(t.downvotes);}
function takeActivity(t){return numeric(t.upvotes)+numeric(t.downvotes);}

// The list remains complete, but its viewport ends after the third visible card.
function appendRecentScroll(target,entries,kind,renderItem){
  if(recentScrollObserver){recentScrollObserver.disconnect();recentScrollObserver=null;}
  const region=el('div',null,'ae-profile-recent-scroll ae-profile-recent-'+kind);
  region.setAttribute('role','region');
  region.setAttribute('aria-label',kind==='takes'?'Últimos Takes. Desplázate para ver más.':'Últimos Picks. Desplázate para ver más.');
  if(entries.length>3)region.tabIndex=0;
  for(const entry of entries)region.append(renderItem(entry));
  target.append(region);
  if(entries.length<=3){region.style.maxHeight='none';return;}
  const visible=[...region.children].slice(0,3);
  const measure=()=>{
    if(!region.isConnected)return;
    const top=visible[0].getBoundingClientRect().top;
    const bottom=visible[2].getBoundingClientRect().bottom;
    if(bottom>top)region.style.maxHeight=Math.ceil(bottom-top)+'px';
  };
  if(typeof ResizeObserver!=='undefined'){
    recentScrollObserver=new ResizeObserver(measure);
    for(const card of visible)recentScrollObserver.observe(card);
  }
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(measure);
  else measure();
}

function renderTakeSupport(entries){
  const target=$('aeProfileTakeAccuracy');
  if(!target)return;
  target.replaceChildren();
  const shown=entries.filter(t=>!t.hidden);
  const up=shown.reduce((sum,t)=>sum+Math.max(0,numeric(t.upvotes)),0);
  const down=shown.reduce((sum,t)=>sum+Math.max(0,numeric(t.downvotes)),0);
  const total=up+down;
  const percent=total?Math.round(up/total*100):null;
  const copy=el('div',null,'ae-profile-accuracy-copy');
  copy.append(el('span','PORCENTAJE DE APOYO'),el('strong',percent===null?'—':percent+'%'));
  const detail=el('p',total
    ?up+' apoyos · '+down+' cuestionamientos. Calculado con los votos de la comunidad.'
    :'Todavía no hay votos para calcular el porcentaje de apoyo.');
  target.append(copy,detail);
  target.hidden=activeTab!=='takes';
}

function uniqueChoice(sorted,used){
  return sorted.find(item=>!used.has(String(item.id)))||sorted[0]||null;
}

function featuredTakes(entries){
  const published=entries.filter(t=>!t.hidden);
  if(!published.length)return [];
  const byBest=published.slice().sort((a,b)=>takeNet(b)-takeNet(a)||numeric(b.upvotes)-numeric(a.upvotes)||new Date(b.created_at)-new Date(a.created_at));
  const byWorst=published.slice().sort((a,b)=>takeNet(a)-takeNet(b)||numeric(b.downvotes)-numeric(a.downvotes)||new Date(b.created_at)-new Date(a.created_at));
  const byPopular=published.slice().sort((a,b)=>takeActivity(b)-takeActivity(a)||Math.abs(takeNet(b))-Math.abs(takeNet(a))||new Date(b.created_at)-new Date(a.created_at));
  const used=new Set();
  const best=uniqueChoice(byBest,used);if(best)used.add(String(best.id));
  const worst=uniqueChoice(byWorst,used);if(worst)used.add(String(worst.id));
  const popular=uniqueChoice(byPopular,used);
  return [
    ['Mejor Take',best,'best'],
    ['Peor Take',worst,'worst'],
    ['Más popular',popular,'popular']
  ].filter(([,item])=>item);
}

function makeTakeFeature(label,tone,entry,owner,canVote,actionLabel,actionFn){
  const card=el('article',null,'ae-profile-feature ae-profile-feature-'+tone);
  card.append(el('span',label,'ae-profile-feature-label'));
  card.append(el('h3',entry.title||'Take'));
  const body=String(entry.body||'').trim();
  if(body)card.append(el('p',body.length>190?body.slice(0,190).trimEnd()+'…':body));
  const stats=el('div',null,'ae-profile-feature-stats');
  stats.append(el('strong','▲ '+numeric(entry.upvotes)),el('span','▼ '+numeric(entry.downvotes)));
  if(actionLabel&&actionFn){
    const action=el('button',actionLabel,'ae-profile-feature-action');
    action.type='button';
    action.addEventListener('click',actionFn);
    stats.append(action);
  }
  card.append(stats);
  const buttons=profileTakeActions(entry,owner,canVote);
  if(buttons)card.append(buttons);
  card.addEventListener('click',event=>{
    if(!entry.hidden&&!event.target.closest('button,a,input,select'))openProfileTake(entry,owner);
  });
  return card;
}

function makeUnpopularPlaceholder(entries){
  const card=el('article',null,'ae-profile-feature ae-profile-feature-unpopular is-empty');
  card.append(el('span','Unpopular Take','ae-profile-feature-label'));
  card.append(el('h3','Elige tu Take'));
  card.append(el('p','Tú decides qué opinión quieres destacar aquí. Puedes cambiarla cuando quieras.'));
  const action=el('button',entries.some(t=>!t.hidden)?'Elegir':'Sin Takes disponibles','ae-profile-feature-action');
  action.type='button';
  action.disabled=!entries.some(t=>!t.hidden);
  action.addEventListener('click',()=>openUnpopularChooser(entries));
  card.append(action);
  return card;
}

function openUnpopularChooser(entries){
  const highlights=$('aeProfileTakeHighlights');
  if(!highlights)return;
  highlights.querySelector('.ae-profile-unpopular-chooser')?.remove();

  const published=entries.filter(t=>!t.hidden);
  if(!published.length)return;

  const chooser=el('div',null,'ae-profile-unpopular-chooser');
  const copy=el('div',null,'ae-profile-unpopular-copy');
  copy.append(el('strong','Elige tu Unpopular Take'),el('span','Este Take quedará fijado como tu elección personal.'));
  const select=el('select',null,'ae-profile-unpopular-select');
  select.setAttribute('aria-label','Elegir Unpopular Take');

  for(const entry of published){
    const option=el('option',(entry.title||'Take')+' · '+dateText(entry.created_at));
    option.value=entry.id;
    if(String(entry.id)===String(ownUnpopularTakeId))option.selected=true;
    select.append(option);
  }

  const actions=el('div',null,'ae-profile-unpopular-actions');
  const save=el('button','Guardar','ae-profile-unpopular-save');
  const cancel=el('button','Cancelar','ae-profile-unpopular-cancel');
  save.type='button';cancel.type='button';

  cancel.addEventListener('click',()=>chooser.remove());
  save.addEventListener('click',async()=>{
    if(working)return;
    working=true;save.disabled=true;cancel.disabled=true;
    $('aeProfileStatus').textContent='Guardando tu Unpopular Take…';
    try{
      const result=await db.rpc('ae_set_my_profile_unpopular_take',{p_take_id:select.value});
      if(result.error)throw result.error;
      ownUnpopularTakeId=select.value;
      $('aeProfileStatus').textContent='Unpopular Take actualizado.';
      renderTakes(ownTakes,activeAuthor,false);
      window.setTimeout(()=>{
        if($('aeProfileStatus')?.textContent==='Unpopular Take actualizado.')$('aeProfileStatus').textContent='';
      },1800);
    }catch(error){
      $('aeProfileStatus').textContent=error?.message||'No se pudo guardar tu elección.';
      save.disabled=false;cancel.disabled=false;
    }finally{
      working=false;
    }
  });

  actions.append(save,cancel);
  chooser.append(copy,select,actions);
  highlights.append(chooser);
}

function renderTakeItem(entry,owner,canVote){
  const box=el('article',null,'ae-profile-item');
  const competition=entry.competition||labels[entry.sport]||'Deportes';
  const title=el('h3');
  const open=el('button',entry.title||'Take','ae-profile-take-title-link');
  open.type='button';
  open.disabled=Boolean(entry.hidden);
  open.setAttribute('aria-label','Abrir Take completo: '+(entry.title||'Take'));
  open.addEventListener('click',()=>openProfileTake(entry,owner));
  title.append(open);
  box.append(
    el('small',competition+' · '+dateText(entry.created_at)+(entry.hidden?' · Oculto por moderación':''),'ae-profile-item-meta'),
    title,
    el('p',entry.body)
  );
  const stats=el('div',null,'ae-profile-item-stats');
  stats.append(el('span','▲ '+numeric(entry.upvotes)+' apoyos'),el('span','▼ '+numeric(entry.downvotes)+' cuestionamientos'));
  if(privateView&&['nfl','football','laliga','premier','ligamx','champions'].includes(entry.sport)){
    const change=el('button','Cambiar comunidad','ae-profile-change-sport');
    change.type='button';
    change.setAttribute('aria-label','Cambiar entre NFL y Fútbol el Take: '+entry.title);
    change.addEventListener('click',()=>window.aeTakeCategoryEdit?.open({
      id:entry.id,sport:entry.sport,title:entry.title,author_id:owner
    }));
    stats.append(change);
  }
  box.append(stats);
  const bar=profileTakeActions(entry,owner,canVote);
  if(bar)box.append(bar);
  box.addEventListener('click',event=>{
    if(!entry.hidden&&!event.target.closest('button,a,input,select'))openProfileTake(entry,owner);
  });
  return box;
}

function renderTakes(entries,owner,canVote){
  const highlights=$('aeProfileTakeHighlights');
  const target=$('aeProfileTakes');
  highlights.replaceChildren();
  target.replaceChildren();
  renderTakeSupport(entries);

  const featured=featuredTakes(entries);
  if(privateView){
    for(const [label,item,tone] of featured.slice(0,2))highlights.append(makeTakeFeature(label,tone,item,owner,canVote));
    const chosen=entries.find(t=>!t.hidden&&String(t.id)===String(ownUnpopularTakeId));
    if(chosen){
      highlights.append(makeTakeFeature('Unpopular Take','unpopular',chosen,owner,canVote,'Cambiar',()=>openUnpopularChooser(entries)));
    }else if(entries.some(t=>!t.hidden)){
      highlights.append(makeUnpopularPlaceholder(entries));
    }
    highlights.hidden=!entries.some(t=>!t.hidden);
  }else if(featured.length){
    for(const [label,item,tone] of featured)highlights.append(makeTakeFeature(label,tone,item,owner,canVote));
    highlights.hidden=false;
  }else{
    highlights.hidden=true;
  }

  $('aeProfileCount').textContent=entries.length+' '+(entries.length===1?'Take':'Takes');
  setOverview(privateView?'':'Selección histórica de Takes públicos de este aficionado.');

  if(!entries.length){
    target.append(el('p',privateView?'Aún no has publicado Takes.':'Todavía no hay Takes públicos en este perfil.','ae-profile-empty'));
    return;
  }

  const heading=el('h3',privateView?'Últimos Takes':'Takes recientes','ae-profile-list-heading');
  target.append(heading);
  appendRecentScroll(target,entries,'takes',entry=>renderTakeItem(entry,owner,canVote));
}

function pickOutcomeLabel(p){
  if(p.outcome==='won')return 'Acertado';
  if(p.outcome==='lost')return 'Fallado';
  if(p.outcome==='void')return 'Anulado';
  return 'Pendiente';
}

function pickTone(p){
  return p.outcome==='won'?'won':p.outcome==='lost'?'lost':p.outcome==='void'?'void':'pending';
}

function pickOdds(p){
  if(p.american_odds===null||p.american_odds===undefined||p.american_odds==='')return '—';
  const n=Number(p.american_odds);
  return Number.isFinite(n)?(n>0?'+':'')+n:'—';
}

function pickPoints(p){
  const n=Number(p.result_points);
  if(!Number.isFinite(n))return '';
  if(n>0)return '+'+n.toFixed(2)+' pts';
  if(n<0)return '−'+Math.abs(n).toFixed(2)+' pts';
  return '0 pts';
}

function openPick(id){
  if(typeof window.openAeCommunityPick==='function'){
    window.openAeCommunityPick(id);
    return;
  }
  const u=new URL(location.href);
  u.searchParams.delete('article');
  u.searchParams.delete('comment');
  u.searchParams.set('pick',id);
  history.pushState({},'',u);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function renderPickCard(p,feature=false){
  // The same public Pick component supplies author, prediction, odds and controls.
  // Retain legacy markup solely as a safe fallback when community code is unavailable.
  if(typeof window.renderCamPickCard==='function'){
    const node=window.renderCamPickCard(p,{compact:!feature,variant:'profile',viewerId:privateView?activeAuthor:undefined});
    node.classList.add('ae-profile-pick',feature?'ae-profile-pick-feature':'ae-profile-pick-recent','is-'+pickTone(p));
    if(p.created_at)node.append(el('small',dateText(p.created_at),'cam-pick-profile-date'));
    return node;
  }
  const recent=!feature;
  const box=el('article',null,'ae-profile-pick '+(feature?'ae-profile-pick-feature ':'ae-profile-pick-recent ')+'is-'+pickTone(p));
  const meta=el('div',null,'ae-profile-pick-meta');
  meta.append(
    el('span',pickOutcomeLabel(p),'ae-profile-pick-state'),
    el('span','Cuota '+pickOdds(p),recent?'ae-profile-pick-odds ae-profile-pick-odds-highlight':'ae-profile-pick-odds')
  );
  if(p.created_at)meta.append(el('time',dateText(p.created_at)));
  box.append(meta,el('h4',p.title||'Pick'));

  // Highlights retain their current preview. Recent Picks stay concise:
  // matchups, selections and explanations remain in the full Pick detail.
  if(feature){
    const legs=Array.isArray(p.legs)?p.legs:[];
    if(legs.length){
      const list=el('div',null,'ae-profile-pick-legs');
      for(const leg of legs.slice(0,2)){
        const row=el('p');
        row.append(el('span',String(leg.event||leg.sport||'Evento')));
        if(leg.selection)row.append(el('strong',String(leg.selection)));
        list.append(row);
      }
      box.append(list);
    }
    if(p.explanation){
      const text=String(p.explanation);
      box.append(el('p',text.length>170?text.slice(0,170).trimEnd()+'…':text,'ae-profile-pick-explanation'));
    }
  }

  const foot=el('div',null,'ae-profile-pick-footer');
  const points=pickPoints(p);
  if(points)foot.append(el('strong',points));
  foot.append(el('span','▲ '+numeric(p.upvotes)),el('span','▼ '+numeric(p.downvotes)));
  if(window.CamPickShare)foot.append(window.CamPickShare.button(publicProfileEntry(p,activeAuthor)));
  if(feature){
    const open=el('button','Ver Pick','ae-profile-pick-open');
    open.type='button';
    open.addEventListener('click',()=>openPick(p.id));
    foot.append(open);
    box.append(foot);
  }else{
    foot.append(el('span','VER PICK ›','ae-profile-pick-view-hint'));
    box.append(foot);
    // One accessible hit target covers the whole summary on touch and desktop.
    const hit=el('button',null,'ae-profile-pick-hit');
    hit.type='button';
    hit.setAttribute('aria-label','Ver el Pick completo: '+(p.title||'Pick'));
    hit.addEventListener('click',()=>openPick(p.id));
    box.append(hit);
  }
  return box;
}

function renderPickGroup(title,items,tone,isPublic=false){
  const group=el('section',null,'ae-profile-pick-group ae-profile-pick-group-'+tone);
  group.append(el('h3',title));
  const grid=el('div',null,'ae-profile-pick-grid');
  if(items.length){
    for(const p of items)grid.append(renderPickCard(p,true));
  }else{
    grid.append(el('p',tone==='best'?(isPublic?'Sin Picks acertados en este perfil.':'Todavía no tienes Picks acertados.'):(isPublic?'Sin Picks fallados en este perfil.':'Todavía no tienes Picks fallados.'),'ae-profile-empty'));
  }
  group.append(grid);
  return group;
}

function renderAccuracy(entries){
  const target=$('aeProfileAccuracy');
  target.replaceChildren();
  const won=entries.filter(p=>p.outcome==='won').length;
  const lost=entries.filter(p=>p.outcome==='lost').length;
  const voids=entries.filter(p=>p.outcome==='void').length;
  const pending=entries.filter(p=>p.outcome==='pending').length;
  const decided=won+lost;
  const pct=decided?Math.round((won/decided)*100):null;

  const copy=el('div',null,'ae-profile-accuracy-copy');
  copy.append(el('span','PORCENTAJE DE ACIERTO'),el('strong',pct===null?'—':pct+'%'));
  const detail=el('p',decided
    ?won+' acertados · '+lost+' fallados'+(voids?' · '+voids+' anulados':'')+(pending?' · '+pending+' pendientes':'')
    :'Todavía no hay Picks acertados o fallados para calcular el porcentaje.');
  target.append(copy,detail);
  target.hidden=false;
}

function renderPicks(entries,isPublic=false){
  const highlights=$('aeProfilePickHighlights');
  const target=$('aeProfilePicks');
  highlights.replaceChildren();
  target.replaceChildren();

  $('aeProfileCount').textContent=entries.length+' '+(entries.length===1?'Pick':'Picks');
  setOverview(isPublic?'Resultados, Picks recientes y porcentaje de acierto de este aficionado.':'');

  const won=entries.filter(p=>p.outcome==='won').sort((a,b)=>numeric(b.result_points)-numeric(a.result_points)||numeric(b.american_odds)-numeric(a.american_odds)||new Date(b.created_at)-new Date(a.created_at));
  const lost=entries.filter(p=>p.outcome==='lost').sort((a,b)=>numeric(a.result_points)-numeric(b.result_points)||numeric(b.american_odds)-numeric(a.american_odds)||new Date(b.created_at)-new Date(a.created_at));

  highlights.append(renderPickGroup('Mejores Picks',won.slice(0,3),'best',isPublic),renderPickGroup('Peores Picks',lost.slice(0,3),'worst',isPublic));
  highlights.hidden=false;

  if(entries.length){
    target.append(el('h3','Últimos Picks','ae-profile-list-heading'));
    appendRecentScroll(target,entries,'picks',p=>renderPickCard(p,false));
  }else{
    target.append(el('p',isPublic?'Este aficionado no tiene Picks públicos disponibles.':'Aún no has publicado Picks.','ae-profile-empty'));
  }
  renderAccuracy(entries);
}

function renderPublishAction(){
  let action=$('aeProfilePublish');
  if(!action){
    action=el('button',null,'ae-participate-cta ae-take-button');
    action.id='aeProfilePublish';
    action.type='button';
    action.addEventListener('click',()=>{
      const publish=activeTab==='picks'?window.aeOpenPickComposer:window.aeOpenTakeComposer;
      if(typeof publish!=='function')return;
      close();
      publish();
    });
    $('aeProfileDialog').append(action);
  }
  action.hidden=!privateView||!(activeTab==='takes'||activeTab==='picks');
  action.textContent=activeTab==='picks'?'Publicar mi Pick':'Publicar mi Take';
  action.setAttribute('aria-controls',activeTab==='picks'?'cpComposePanel':'aeTakeComposerDialog');
}

function setPrivateTab(tab,options={}){
  if(!activeAuthor)return;
  labelTabs();
  activeTab=tab==='quiniela'&&!privateView?'perfil':validTab(tab);
  for(const [id,value] of [['aeProfileTabOverview','perfil'],['aeProfileTabTakes','takes'],['aeProfileTabPicks','picks'],['aeProfileTabQuiniela','quiniela'],['aeProfileTabParty','party']]){
    const button=$(id);
    if(!button)continue;
    button.setAttribute('aria-selected',String(activeTab===value));
    button.classList.toggle('is-active',activeTab===value);
    button.tabIndex=activeTab===value?0:-1;
  }

  renderPublishAction();
  const isTakes=activeTab==='takes',isPicks=activeTab==='picks';
  $('aeProfileTakeHighlights').hidden=!isTakes;
  $('aeProfileTakes').hidden=!isTakes;
  $('aeProfileTakeAccuracy').hidden=!isTakes||!takesLoaded;
  $('aeProfilePickHighlights').hidden=!isPicks;
  $('aeProfilePicks').hidden=!isPicks;
  $('aeProfileAccuracy').hidden=!isPicks||!picksLoaded;
  const prestige=$('aeProfilePrestige');
  if(prestige)prestige.hidden=!isTakes||!prestige.childElementCount;
  if($('camProfileOverview'))$('camProfileOverview').hidden=activeTab!=='perfil';
  if($('camProfileQuiniela'))$('camProfileQuiniela').hidden=activeTab!=='quiniela';
  if($('camProfileParties'))$('camProfileParties').hidden=activeTab!=='party';

  let loading=null;
  if(activeTab==='perfil'){
    if(overviewStale&&overview)loading=loadOverview();
    else renderOverview();
  }else if(isTakes){
    if(takesLoaded)renderTakes(ownTakes,activeAuthor,!privateView);
    else{
      // Mientras llegan, nunca parece un historial vacío.
      $('aeProfileTakeHighlights').hidden=true;
      $('aeProfileTakes').replaceChildren(el('p',privateView?'Cargando tus Takes…':'Cargando Takes…','ae-profile-empty'));
      loading=loadTakes();
    }
  }else if(isPicks){
    if(picksLoaded)renderPicks(ownPicks,!privateView);
    else{
      $('aeProfilePickHighlights').hidden=true;
      $('aeProfilePicks').replaceChildren(el('p',privateView?'Cargando tus Picks…':'Cargando Picks…','ae-profile-empty'));
      loading=loadPicks();
    }
  }
  if(options.url!==false)syncTabUrl();
  // Mi Party (cam-parties.js) se pinta al recibir la pestaña visible.
  document.dispatchEvent(new CustomEvent('cam:profile-view',{detail:{userId:activeAuthor,own:privateView,tab:activeTab}}));
  return loading;
}

/* La dirección del perfil público dice su pestaña (?perfil=<id>&tab=picks).
   Cambiar de pestaña no suma pasos al botón Atrás. */
function syncTabUrl(){
  let url;
  try{url=new URL(location.href);}catch{return;}
  if(url.searchParams.get('perfil')!==String(activeAuthor))return;
  const wanted=activeTab==='perfil'?null:activeTab;
  if((url.searchParams.get('tab')||null)===wanted)return;
  if(wanted)url.searchParams.set('tab',wanted);else url.searchParams.delete('tab');
  try{history.replaceState(history.state,'',url.href);}catch{}
}
function urlTab(){
  try{
    const params=new URL(location.href).searchParams;
    // Un Take compartido (?take=) se abre sobre su lista de Takes.
    if(UUID.test(params.get('take')||''))return 'takes';
    return validTab(params.get('tab'));
  }catch{return 'perfil';}
}

function resetLoads(){
  takesLoaded=false;takesLoading=null;picksLoaded=false;picksLoading=null;
  overview=null;overviewError='';overviewStale=false;clearTimeout(overviewTimer);
}

/* ---------- Resumen («Perfil») ---------- */
function markOverviewStale(){
  if(!overview)return;
  overviewStale=true;
  if(activeTab!=='perfil'||!$('aeProfileDialog')?.open)return;
  clearTimeout(overviewTimer);
  overviewTimer=setTimeout(()=>{if(activeTab==='perfil'&&overviewStale)loadOverview();},800);
}
async function loadOverview(){
  const author=activeAuthor,own=privateView,ticket=request;
  if(!author)return;
  overviewStale=false;overviewError='';
  if(!overview)renderOverview();
  try{
    const r=await db.rpc('cam_profile_overview',{p_user:author});
    if(r.error)throw r.error;
    if(ticket!==request||activeAuthor!==author||privateView!==own)return;
    overview=r.data||{username:profileName};
    const name=String(overview.username||'').trim();
    if(name&&(own?name!=='Aficionado':true))setIdentity(name,overview.joined_month?'Miembro desde '+monthText(overview.joined_month+'-15T12:00:00'):undefined);
    if(!own)publicAuthorLabel=name||publicAuthorLabel;
  }catch(e){
    if(ticket!==request)return;
    overviewError='El resumen no está disponible ahora mismo.';
    // Sin resumen el perfil público conserva su nombre.
    if(!own&&!profileName){
      try{
        const card=await db.rpc('cam_public_profile_card',{p_user:author});
        if(ticket===request&&card?.data?.username){publicAuthorLabel=card.data.username;setIdentity(card.data.username,card.data.joined_month?'Miembro desde '+monthText(card.data.joined_month+'-15T12:00:00'):undefined);}
      }catch{}
    }
  }
  renderOverview();
}
function renderOverview(){
  const target=$('camProfileOverview');
  if(!target||activeTab!=='perfil')return;
  const owner=activeAuthor;
  // CamProfileOverview (cam-profile-overview.js); sin él, el resumen no se pinta.
  if(typeof window.CamProfileOverview?.render!=='function')return;
  window.CamProfileOverview.render(target,overview,{
    own:privateView,name:profileName,error:overviewError,
    tab:tab=>{setPrivateTab(tab);$('aeProfileTabs')?.scrollIntoView?.({block:'nearest'});},
    openTake:t=>openProfileTake({...t,author_id:owner,hidden:false},owner),
    openPick:id=>{if(typeof window.aeOpenPickDetail==='function')window.aeOpenPickDetail(id);else openPick(id);},
    newTake:()=>{if(typeof window.aeOpenTakeComposer!=='function')return;close();window.aeOpenTakeComposer();},
    newPick:()=>{if(typeof window.aeOpenPickComposer!=='function')return;close();window.aeOpenPickComposer();},
    play:sport=>window.camGoQuiniela?.(sport)
  });
}

/* ---------- Takes y Picks: se cargan al abrir su pestaña ---------- */
function loadTakes(){
  if(takesLoading)return takesLoading;
  const author=activeAuthor,own=privateView,ticket=request;
  loadPrestige(author);
  takesLoading=(async()=>{
    const [takesResult,unpopularResult]=await Promise.allSettled([
      own?db.rpc('ae_my_free_takes'):db.rpc('ae_public_take_profile',{p_author_id:author}),
      own?db.rpc('ae_my_profile_unpopular_take'):Promise.resolve({data:null})
    ]);
    if(ticket!==request||activeAuthor!==author)return;
    const takeError=takesResult.status==='rejected'?takesResult.reason:takesResult.value.error;
    const unpopularError=unpopularResult.status==='rejected'?unpopularResult.reason:unpopularResult.value.error;
    ownTakes=takeError?[]:(takesResult.value.data||[]);
    if(own)ownUnpopularTakeId=unpopularError?null:(unpopularResult.value.data||null);
    if(!own&&ownTakes[0]?.author&&publicAuthorLabel==='Aficionado')publicAuthorLabel=String(ownTakes[0].author);
    takesLoaded=true;
    const errors=[];
    if(takeError)errors.push('Takes: '+(takeError.message||'no disponibles'));
    if(own&&unpopularError)errors.push('Unpopular Take: '+(unpopularError.message||'no disponible'));
    $('aeProfileStatus').textContent=errors.length?'No se pudo cargar todo. '+errors.join(' · '):'';
    if(activeTab==='takes'){
      $('aeProfileTakeAccuracy').hidden=false;
      renderTakes(ownTakes,author,!own);
    }
    if(!takeError)openSharedProfileTake(author);
  })().finally(()=>{if(ticket===request)takesLoading=null;});
  return takesLoading;
}
function loadPicks(){
  if(picksLoading)return picksLoading;
  const author=activeAuthor,own=privateView,ticket=request;
  picksLoading=(async()=>{
    let error=null;
    try{ownPicks=await loadOwnPicks(author);}catch(e){error=e;ownPicks=[];}
    if(ticket!==request||activeAuthor!==author)return;
    picksLoaded=true;
    $('aeProfileStatus').textContent=error?'Picks no disponibles. '+(error.message||''):'';
    if(activeTab==='picks')renderPicks(ownPicks,!own);
  })().finally(()=>{if(ticket===request)picksLoading=null;});
  return picksLoading;
}

async function loadOwnPicks(userId){
  const result=await db.from('ae_pick_feed').select('*')
    .eq('user_id',userId).in('moderation_status',['pending','approved'])
    .order('created_at',{ascending:false})
    .order('id',{ascending:false})
    .limit(200);
  if(result.error)throw result.error;
  return result.data||[];
}

// Refresh only visible Pick data when a moderation decision arrives.
async function refreshProfilePicks(){
  const dialog=$('aeProfileDialog'),author=activeAuthor,token=request,isOwn=privateView;
  // Solo con la pestaña Picks abierta: el resumen y las demás pestañas no se consultan solas.
  if(!dialog?.open||!author||document.hidden||!picksLoaded||activeTab!=='picks')return;
  try{
    const fresh=await loadOwnPicks(author);
    if(token!==request||!dialog.open||activeAuthor!==author||privateView!==isOwn)return;
    ownPicks=fresh;
    if(activeTab==='picks')renderPicks(ownPicks,!isOwn);
  }catch(error){
    // Retain the previous view during transient network problems.
    console.warn('No fue posible actualizar los Picks del perfil',error);
  }
}

function clearSections(){
  for(const id of ['aeProfileTakeHighlights','aeProfileTakes','aeProfilePickHighlights','aeProfilePicks','aeProfileAccuracy','aeProfileTakeAccuracy','camProfileOverview','camProfileQuiniela']){
    const n=$(id);if(n)n.replaceChildren();
  }
  $('aeProfileAccuracy').hidden=true;
  $('aeProfileTakeAccuracy').hidden=true;
  if($('camProfileQuiniela'))$('camProfileQuiniela').hidden=true;
  if($('aeProfilePrestige')){$('aeProfilePrestige').replaceChildren();$('aeProfilePrestige').hidden=true;}
}

async function showOwn(tab='perfil'){
  // La ventana se abre al primer toque; la sesión (ya leída) llega después.
  const ticket=++request;
  const dialog=$('aeProfileDialog');
  closeEdit(false);
  privateView=true;
  activeAuthor=null;
  ownTakes=[];ownPicks=[];ownUnpopularTakeId=null;
  resetLoads();
  if($('aeProfilePublish'))$('aeProfilePublish').hidden=true;
  publicAuthorLabel='Aficionado';
  $('aeProfileTabs').hidden=false;
  setIdentity('Tu perfil','');
  clearSections();
  for(const id of ['aeProfileTakeHighlights','aeProfileTakes','aeProfilePickHighlights','aeProfilePicks'])$(id).hidden=true;
  $('aeProfileStatus').textContent='Cargando tu perfil…';
  if(!dialog.open)dialog.showModal();

  const user=await me();
  if(ticket!==request||!dialog.open)return;
  if(user===undefined){$('aeProfileStatus').textContent='No pudimos comprobar tu sesión. Cierra el perfil y vuelve a intentarlo.';return;}
  if(!user){close();if(typeof openUserAuthModal==='function')openUserAuthModal();return;}
  activeAuthor=user.id;
  setIdentity(user.user_metadata?.username||user.user_metadata?.display_name||'Usuario',
    user.created_at?'Miembro desde '+monthText(user.created_at):'Tu historial deportivo');
  $('aeProfileStatus').textContent='';
  // El resumen trae el nombre público (no siempre está en la sesión): una llamada.
  const summary=loadOverview();
  if(ticket!==request)return;
  // Se espera a la pestaña abierta (quien llama puede usarla al terminar).
  await Promise.all([summary,setPrivateTab(validTab(typeof tab==='string'?tab:'perfil'))]);
}

async function showPublic(id,push=true,tab='perfil'){
  if(!UUID.test(id))return;
  tab=validTab(typeof tab==='string'?tab:'perfil');
  const user=await me();
  if(user?.id===id){await showOwn(tab);return;}

  privateView=false;
  if($('aeProfilePublish'))$('aeProfilePublish').hidden=true;
  activeAuthor=id;
  ownTakes=[];ownPicks=[];
  resetLoads();
  publicAuthorLabel='Aficionado';
  const ticket=++request;
  const dialog=$('aeProfileDialog');
  if(!dialog.open)dialog.showModal();

  $('aeProfileTabs').hidden=false;
  setIdentity('','Aficionado de CAM SPORTS');
  $('aeProfileStatus').textContent='';
  clearSections();

  if(push){
    const u=new URL(location.href);
    u.searchParams.set('perfil',id);
    u.searchParams.delete('take');
    if(tab==='perfil')u.searchParams.delete('tab');else u.searchParams.set('tab',tab);
    history.pushState({},'',u);
  }
  const summary=loadOverview();
  if(ticket!==request)return;
  await Promise.all([summary,setPrivateTab(tab)]);
}


/* ---------- Cabecera de perfil (3 nov 2026): identidad, cifras, compartir ----------
   Como en otras apps: inicial como foto, @usuario, «Miembro desde», botones
   Editar perfil / Compartir perfil y una fila de cifras que lleva a cada pestaña. */
function monthText(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  try{return new Intl.DateTimeFormat('es',{month:'long',year:'numeric'}).format(d);}catch{return '';}
}
function dayText(value){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  try{return new Intl.DateTimeFormat('es',{day:'numeric',month:'long'}).format(d);}catch{return dateText(value);}
}
function initialOf(name){const m=String(name||'').match(/[a-z0-9]/i);return m?m[0].toUpperCase():'·';}
function setIdentity(name,subtitle){
  const clean=String(name||'').replace(/^@+/,'').trim();
  profileName=clean;
  const title=$('aeProfileTitle');
  if(title)title.textContent=clean?'@'+clean:(privateView?'Mi perfil':'Perfil de aficionado');
  if(subtitle!==undefined&&$('aeProfileUsername'))$('aeProfileUsername').textContent=subtitle;
  for(const id of ['camProfileAvatar','camProfileEditAvatar']){const n=$(id);if(n)n.textContent=initialOf(clean);}
  if($('camProfileKicker'))$('camProfileKicker').textContent=privateView?'MI PERFIL · CAM SPORTS':'AFICIONADO · CAM SPORTS';
  if($('camProfileEditOpen'))$('camProfileEditOpen').hidden=!privateView;
}
function labelTabs(){
  const own=privateView;
  if($('aeProfileTabQuiniela'))$('aeProfileTabQuiniela').hidden=!own;
  for(const [id,mine,theirs] of [['aeProfileTabOverview','Perfil','Perfil'],['aeProfileTabTakes','Takes','Takes'],['aeProfileTabPicks','Picks','Picks'],['aeProfileTabParty','Mi Party','Party']]){
    const b=$(id);if(!b)continue;
    const label=b.querySelector('.cam-tab-label')||b;
    label.textContent=own?mine:theirs;
  }
}
let noticeTimer=0;
function notice(text){
  const n=$('camProfileNotice');if(!n)return;
  n.textContent=text;n.hidden=!text;
  clearTimeout(noticeTimer);
  if(text)noticeTimer=setTimeout(()=>{n.hidden=true;n.textContent='';},4500);
}
async function shareProfile(){
  if(!activeAuthor)return;
  const url=new URL(location.origin+location.pathname);
  url.searchParams.set('perfil',activeAuthor);
  const title=(profileName?'@'+profileName:'Perfil')+' en CAM SPORTS';
  if(navigator.share){
    try{await navigator.share({title,text:title,url:url.href});return;}
    catch(e){if(e?.name==='AbortError')return;}
  }
  try{await navigator.clipboard.writeText(url.href);notice('Enlace del perfil copiado. Pégalo donde quieras compartirlo.');}
  catch{notice('Copia este enlace: '+url.href);}
}

/* ---------- Editar perfil: nombre de usuario ----------
   La base de datos (cam_change_username) valida, evita nombres repetidos,
   aplica la espera de 30 días y actualiza Picks, comentarios y avisos.
   Mayúsculas (4 nov): se respetan como las escribe cada uno; cambiar solo
   mayúsculas y minúsculas se puede siempre y no cuenta como cambio. */
const USERNAME_RULE=/^[A-Za-z0-9_]{3,30}$/;
const sameLetters=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase();
let editStatus=null,checkTimer=0,checkTicket=0,savingName=false;
function setCheck(text,tone=''){const n=$('camUsernameCheck');if(!n)return;n.textContent=text;n.dataset.tone=tone;}
function missingFeature(e){return e?.code==='PGRST202'||/could not find the function|does not exist|schema cache/i.test(String(e?.message||''));}
function editing(){return Boolean($('aeProfileDialog')?.classList.contains('is-editing'));}
function openEdit(){
  if(!privateView||!activeAuthor)return;
  const dialog=$('aeProfileDialog');
  dialog.classList.add('is-editing');
  $('camProfileEdit').hidden=false;
  dialog.scrollTop=0;
  const input=$('camUsernameInput');
  input.value=profileName;
  $('camUsernameConfirm').hidden=true;
  $('camUsernameSave').hidden=false;
  $('camUsernameSave').disabled=true;
  $('camUsernameUndo').hidden=true;
  setCheck('');
  // Sin teclado automático en el teléfono: el foco va al título.
  $('camProfileEditTitle').focus({preventScroll:true});
  loadNameStatus();
}
function closeEdit(focus=true){
  const dialog=$('aeProfileDialog');
  if(!dialog)return;
  const was=dialog.classList.contains('is-editing');
  dialog.classList.remove('is-editing');
  if($('camProfileEdit'))$('camProfileEdit').hidden=true;
  clearTimeout(checkTimer);++checkTicket;
  if(was&&focus)$('camProfileEditOpen')?.focus({preventScroll:true});
}
function applyNameStatus(status){
  editStatus=status||{};
  const input=$('camUsernameInput'),undo=$('camUsernameUndo');
  if(editStatus.username&&!input.matches(':focus'))input.value=editStatus.username;
  undo.hidden=!editStatus.undo_username;
  if(editStatus.undo_username)undo.textContent='Volver a @'+editStatus.undo_username+(editStatus.undo_until?' (hasta el '+dayText(editStatus.undo_until)+')':'');
  // Aunque falten días para otro cambio, las mayúsculas se pueden tocar.
  const editable=Boolean(editStatus.can_change||editStatus.can_change_case);
  input.disabled=!editable;
  $('camUsernameSave').hidden=!editable;
}
// Mensaje de espera cuando ya se cambió el nombre hace poco.
function waitText(){
  return editStatus?.next_change_at?'Ya cambiaste tu nombre hace poco. Podrás cambiarlo de nuevo el '+dayText(editStatus.next_change_at)+'.':'Ahora mismo no puedes cambiar tu nombre.';
}
async function loadNameStatus(){
  const input=$('camUsernameInput');
  input.disabled=true;
  setCheck('Comprobando tu cuenta…');
  try{
    const r=await db.rpc('cam_username_status');
    if(r.error)throw r.error;
    if(!editing())return;
    applyNameStatus(r.data);
    if(editStatus.can_change)setCheck('');
    else setCheck(waitText()+(editStatus.can_change_case?' Las mayúsculas sí puedes cambiarlas.':''),'wait');
  }catch(e){
    if(!editing())return;
    editStatus=null;input.disabled=true;$('camUsernameSave').disabled=true;
    setCheck(missingFeature(e)?'El cambio de nombre se activará muy pronto.':'No se pudo comprobar tu cuenta. '+(e.message||'Inténtalo de nuevo.'),'error');
  }
}
function normalizedInput(){
  const input=$('camUsernameInput');
  const raw=input.value,clean=raw.replace(/^@+/,'').replace(/\s+/g,'_');
  if(clean!==raw){
    const pos=Math.max(0,(input.selectionStart??clean.length)-(raw.length-clean.length));
    input.value=clean;
    try{input.setSelectionRange(pos,pos);}catch{}
  }
  return clean;
}
function onNameInput(){
  const name=normalizedInput(),save=$('camUsernameSave');
  $('camUsernameConfirm').hidden=true;save.hidden=false;save.disabled=true;
  clearTimeout(checkTimer);
  const ticket=++checkTicket;
  if(!name){setCheck('');return;}
  if(name===profileName){setCheck('Es tu nombre actual.');return;}
  if(!USERNAME_RULE.test(name)){
    setCheck(name.length<3?'Escribe al menos 3 caracteres.':'Usa solo letras sin acentos, números y guion bajo (_).','error');
    return;
  }
  // Solo mayúsculas y minúsculas: es tu mismo nombre, no hace falta preguntar.
  if(sameLetters(name,profileName)){setCheck('Solo cambias mayúsculas y minúsculas.','ok');save.disabled=false;return;}
  if(editStatus&&!editStatus.can_change){setCheck(waitText()+' Las mayúsculas sí puedes cambiarlas.','wait');return;}
  setCheck('Comprobando si está libre…');
  checkTimer=setTimeout(async()=>{
    try{
      const r=await db.rpc('cam_username_available',{p_username:name});
      if(ticket!==checkTicket)return;
      if(r.error)throw r.error;
      if(r.data==='ok'){setCheck('@'+name+' está disponible.','ok');save.disabled=false;return;}
      if(r.data==='case'){setCheck('Solo cambias mayúsculas y minúsculas.','ok');save.disabled=false;return;}
      setCheck({same:'Es tu nombre actual.',taken:'@'+name+' ya lo usa otra persona.',reserved:'Ese nombre está reservado. Elige otro.',invalid:'Usa de 3 a 30 letras, números o guion bajo (_).'}[r.data]||'Ese nombre no está disponible.','error');
    }catch(e){
      if(ticket!==checkTicket)return;
      setCheck(missingFeature(e)?'El cambio de nombre se activará muy pronto.':'No se pudo comprobar el nombre. '+(e.message||''),'error');
    }
  },350);
}
function askNameConfirm(name,undo=false){
  if(!name||savingName)return;
  const caseOnly=!undo&&sameLetters(name,profileName);
  $('camUsernameConfirmTitle').textContent=undo?'¿Volver a @'+name+'?':'¿Cambiar @'+profileName+' por @'+name+'?';
  $('camUsernameConfirmLogin').textContent=caseOnly
    ?'Inicias sesión igual que siempre: con mayúsculas o sin ellas.'
    :'Desde ahora inicias sesión con @'+name+' (misma contraseña; da igual si lo escribes con mayúsculas).';
  $('camUsernameConfirmKeep').textContent=caseOnly
    ?'Cambiar solo mayúsculas no cuenta como cambio de nombre: puedes hacerlo cuando quieras.'
    :undo
    ?'Después tendrás que esperar 30 días para volver a cambiarlo.'
    :'@'+profileName+' queda guardado para ti 30 días y puedes volver a él durante 7 días. Después tendrás que esperar 30 días para otro cambio.';
  const box=$('camUsernameConfirm');
  box.dataset.name=name;
  box.hidden=false;
  $('camUsernameSave').hidden=true;
  $('camUsernameConfirmYes').focus({preventScroll:true});
  box.scrollIntoView?.({block:'nearest'});
}
async function changeName(name){
  if(savingName||!name)return;
  savingName=true;
  const yes=$('camUsernameConfirmYes'),no=$('camUsernameConfirmNo');
  yes.disabled=true;no.disabled=true;
  setCheck('Guardando tu nombre nuevo…');
  try{
    const r=await db.rpc('cam_change_username',{p_username:name});
    if(r.error)throw r.error;
    const result=r.data||{},fresh=String(result.username||name);
    // La sesión guarda el nombre: se renueva para que todo use el nuevo.
    try{await db.auth.refreshSession();}catch{}
    if(typeof currentUser!=='undefined'&&currentUser)currentUser.username=fresh;
    if(typeof renderSessionHeader==='function')renderSessionHeader();
    setIdentity(fresh);
    $('camUsernameConfirm').hidden=true;
    $('camUsernameInput').value=fresh;
    applyNameStatus(result);
    setCheck(result.case_only?'Listo: ahora eres @'+fresh+'.':result.undo?'Has vuelto a @'+fresh+'. Usa este nombre para iniciar sesión.':'Listo: ahora eres @'+fresh+'. Usa este nombre para iniciar sesión.','ok');
    document.dispatchEvent(new CustomEvent('cam:username-changed',{detail:{username:fresh,previous:result.previous_username||null}}));
    document.dispatchEvent(new Event('ae:takes-updated'));
    document.dispatchEvent(new Event('ae:picks-updated'));
  }catch(e){
    $('camUsernameConfirm').hidden=true;
    $('camUsernameSave').hidden=false;
    setCheck(missingFeature(e)?'El cambio de nombre se activará muy pronto.':(e.message||'No se pudo cambiar el nombre. Inténtalo de nuevo.'),'error');
  }finally{
    savingName=false;yes.disabled=false;no.disabled=false;
  }
}
function openRecovery(){
  const name=profileName;
  close();
  if(typeof openUserAuthModal==='function')openUserAuthModal();
  if(typeof setAuthMode==='function')setAuthMode('code');
  const field=$('userAuthUsername');
  if(field)field.value=name;
}
function logout(){
  const admin=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
  close();
  if(admin&&typeof handleAdminLogout==='function')handleAdminLogout();
  else if(typeof handleUserLogout==='function')handleUserLogout();
}
function bindProfileApp(){
  $('camProfileEditOpen')?.addEventListener('click',openEdit);
  $('camProfileEditBack')?.addEventListener('click',()=>closeEdit());
  $('camProfileShare')?.addEventListener('click',shareProfile);
  // Pestañas con flechas del teclado.
  $('aeProfileTabs')?.addEventListener('keydown',event=>{
    if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)||!activeAuthor)return;
    const available=TABS.filter(tab=>tab!=='quiniela'||privateView);
    const index=available.indexOf(activeTab);
    const next=event.key==='Home'?0:event.key==='End'?available.length-1:(index+(event.key==='ArrowRight'?1:-1)+available.length)%available.length;
    event.preventDefault();
    setPrivateTab(available[next]);
    $({perfil:'aeProfileTabOverview',takes:'aeProfileTabTakes',picks:'aeProfileTabPicks',quiniela:'aeProfileTabQuiniela',party:'aeProfileTabParty'}[available[next]])?.focus();
  });
  $('camUsernameInput')?.addEventListener('input',onNameInput);
  $('camUsernameForm')?.addEventListener('submit',event=>{
    event.preventDefault();
    const name=normalizedInput();
    if($('camUsernameSave').disabled||!USERNAME_RULE.test(name))return;
    askNameConfirm(name);
  });
  $('camUsernameConfirmNo')?.addEventListener('click',()=>{
    $('camUsernameConfirm').hidden=true;$('camUsernameSave').hidden=!(editStatus?.can_change||editStatus?.can_change_case);$('camUsernameInput').focus();
  });
  $('camUsernameConfirmYes')?.addEventListener('click',()=>changeName($('camUsernameConfirm').dataset.name));
  $('camUsernameUndo')?.addEventListener('click',()=>{if(editStatus?.undo_username)askNameConfirm(editStatus.undo_username,true);});
  $('camProfileRecovery')?.addEventListener('click',openRecovery);
  $('camProfileLogout')?.addEventListener('click',logout);
  // Escape en Editar perfil vuelve al perfil en lugar de cerrarlo.
  $('aeProfileDialog')?.addEventListener('cancel',event=>{if(editing()){event.preventDefault();closeEdit();}});
}
window.aeProfileEdit=Object.freeze({open:openEdit,close:closeEdit});

window.openAeProfile=showOwn;
window.openAePublicProfile=showPublic;
window.closeAeProfile=close;

document.addEventListener('DOMContentLoaded',()=>{
  bindProfileApp();
  void me().then(updateButton);
  if(typeof db!=='undefined'&&db)db.auth.onAuthStateChange((event,session)=>{
    ++sessionRevision;
    sessionUser=session?.user||null;
    updateButton();
    if(privateView&&(event==='SIGNED_OUT'||(activeAuthor&&sessionUser?.id!==activeAuthor)))close();
  });
  window.addEventListener('cam:admin-state-change',updateButton);

  $('aeProfileTabOverview')?.addEventListener('click',()=>setPrivateTab('perfil'));
  $('aeProfileTabTakes')?.addEventListener('click',()=>setPrivateTab('takes'));
  $('aeProfileTabPicks')?.addEventListener('click',()=>setPrivateTab('picks'));
  $('aeProfileTabQuiniela')?.addEventListener('click',()=>setPrivateTab('quiniela'));
  $('aeProfileTabParty')?.addEventListener('click',()=>setPrivateTab('party'));

  $('aeProfileDialog')?.addEventListener('click',e=>{if(e.target===$('aeProfileDialog'))close();});
  $('aeProfileDialog')?.addEventListener('close',()=>{++request;});

  document.addEventListener('ae:takes-updated',refreshProfileTakes);
  document.addEventListener('ae:picks-updated',()=>{markOverviewStale();refreshProfilePicks();});
  document.addEventListener('cam:parties-changed',markOverviewStale);
  window.addEventListener('focus',refreshProfilePicks);
  window.setInterval(refreshProfilePicks,30000);
  window.addEventListener('ae:take-category-changed',()=>{
    if($('aeProfileDialog')?.open&&privateView)showOwn(activeTab);
    else if($('aeProfileDialog')?.open&&activeAuthor)showPublic(activeAuthor,false,activeTab);
  });

  const id=new URL(location.href).searchParams.get('perfil');
  if(id&&UUID.test(id))showPublic(id,false,urlTab());

  window.addEventListener('popstate',()=>{
    const newId=new URL(location.href).searchParams.get('perfil');
    if(newId&&UUID.test(newId)){
      if(newId===activeAuthor&&$('aeProfileDialog')?.open)setPrivateTab(urlTab(),{url:false});
      else showPublic(newId,false,urlTab());
    }
    else if($('aeProfileDialog')?.open&&!privateView)close();
  });
});
})();
