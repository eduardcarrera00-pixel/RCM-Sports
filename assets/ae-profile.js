/* AE SPORTS · Unified private profile: Takes + Picks.
 * Public author profiles expose public Takes and Picks.
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

const labels={
  football:'Fútbol',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',
  champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial',general:'Deportes'
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let request=0;
let activeAuthor=null;
let privateView=false;
let working=false;
let activeTab='takes';
let ownTakes=[];
let ownPicks=[];
let publicAuthorLabel='Aficionado';
let ownUnpopularTakeId=null;
let recentScrollObserver=null;
let prestigeRequest=0;

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
  const name=String(t.author||(privateView?$('aeProfileUsername')?.textContent:publicAuthorLabel)||'Aficionado')
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
  const r=await db.auth.getUser();
  return r.error?null:r.data?.user||null;
}

async function updateButton(){
  const b=$('aeMyTakesButton');
  if(!b)return;
  const user=await me();
  const adminActive=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
  b.hidden=!user||adminActive;
  if(!user&&privateView)close();
}

function close(){
  if(recentScrollObserver){recentScrollObserver.disconnect();recentScrollObserver=null;}
  ++request;
  activeAuthor=null;
  privateView=false;
  activeTab='takes';
  ownTakes=[];
  ownPicks=[];
  publicAuthorLabel='Aficionado';
  ownUnpopularTakeId=null;
  const dialog=$('aeProfileDialog');
  if(dialog?.open)dialog.close();
  if(new URL(location.href).searchParams.has('perfil')){
    const url=new URL(location.href);
    url.searchParams.delete('perfil');
    url.searchParams.delete('take');
    history.replaceState({},'',url);
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
  const overview=$('aeProfileOverviewText');
  if(overview)overview.textContent=privateView
    ?'Tu mejor Take, tu peor Take y el Unpopular Take que tú elijas, seguidos por tus publicaciones más recientes.'
    :'Selección histórica de Takes públicos de este aficionado.';

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
  const overview=$('aeProfileOverviewText');
  if(overview)overview.textContent=isPublic?'Resultados, Picks recientes y porcentaje de acierto de este aficionado.':'Tus mejores y peores resultados, tus Picks recientes y tu porcentaje de acierto real.';

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
  action.hidden=!privateView;
  action.textContent=activeTab==='picks'?'Publicar mi Pick':'Publicar mi Take';
  action.setAttribute('aria-controls',activeTab==='picks'?'cpComposePanel':'aeTakeComposerDialog');
}

function setPrivateTab(tab){
  if(!activeAuthor)return;
  activeTab=tab==='picks'?'picks':'takes';
  const takesButton=$('aeProfileTabTakes');
  const picksButton=$('aeProfileTabPicks');
  takesButton?.setAttribute('aria-selected',String(activeTab==='takes'));
  picksButton?.setAttribute('aria-selected',String(activeTab==='picks'));
  takesButton?.classList.toggle('is-active',activeTab==='takes');
  picksButton?.classList.toggle('is-active',activeTab==='picks');

  renderPublishAction();
  const takeHighlights=$('aeProfileTakeHighlights');
  const takeList=$('aeProfileTakes');
  const pickHighlights=$('aeProfilePickHighlights');
  const pickList=$('aeProfilePicks');
  const accuracy=$('aeProfileAccuracy');
  const takeAccuracy=$('aeProfileTakeAccuracy');
  const prestige=$('aeProfilePrestige');

  if(activeTab==='takes'){
    takeHighlights.hidden=false;
    takeList.hidden=false;
    pickHighlights.hidden=true;
    pickList.hidden=true;
    accuracy.hidden=true;
    takeAccuracy.hidden=false;
    if(prestige)prestige.hidden=!prestige.childElementCount;
    $('aeProfileTitle').textContent=privateView?'Mis Takes':publicAuthorLabel+' · Takes';
    renderTakes(ownTakes,activeAuthor,!privateView);
  }else{
    takeHighlights.hidden=true;
    takeList.hidden=true;
    pickHighlights.hidden=false;
    pickList.hidden=false;
    takeAccuracy.hidden=true;
    if(prestige)prestige.hidden=true;
    $('aeProfileTitle').textContent=privateView?'Mis Picks':publicAuthorLabel+' · Picks';
    renderPicks(ownPicks,!privateView);
  }
}

async function loadOwnPicks(userId){
  const result=await db.from('ae_pick_feed').select('*')
    .eq('user_id',userId)
    .order('created_at',{ascending:false})
    .order('id',{ascending:false})
    .limit(200);
  if(result.error)throw result.error;
  return result.data||[];
}

async function showOwn(){
  const user=await me();
  if(!user){if(typeof openUserAuthModal==='function')openUserAuthModal();return;}

  privateView=true;
  if($('aeProfileWelcomeAgain'))$('aeProfileWelcomeAgain').hidden=false;
  publicAuthorLabel='Aficionado';
  activeAuthor=user.id;
  activeTab='takes';
  const ticket=++request;
  const dialog=$('aeProfileDialog');
  if(!dialog.open)dialog.showModal();

  $('aeProfileTabs').hidden=false;
  $('aeProfileUsername').textContent='@'+(user.user_metadata?.username||user.user_metadata?.display_name||'Usuario');
  $('aeProfileStatus').textContent='Cargando tu perfil…';
  $('aeProfileTakeHighlights').replaceChildren();
  $('aeProfileTakes').replaceChildren();
  $('aeProfilePickHighlights').replaceChildren();
  $('aeProfilePicks').replaceChildren();
  $('aeProfileAccuracy').replaceChildren();
  $('aeProfileAccuracy').hidden=true;
  $('aeProfileTakeAccuracy').replaceChildren();
  $('aeProfileTakeAccuracy').hidden=true;
  if($('aeProfilePrestige')){$('aeProfilePrestige').replaceChildren();$('aeProfilePrestige').hidden=true;}
  loadPrestige(user.id);

  const [takesResult,picksResult,unpopularResult]=await Promise.allSettled([
    db.rpc('ae_my_free_takes'),
    loadOwnPicks(user.id),
    db.rpc('ae_my_profile_unpopular_take')
  ]);
  if(ticket!==request||!dialog.open)return;

  const takeError=takesResult.status==='rejected'?takesResult.reason:takesResult.value.error;
  const pickError=picksResult.status==='rejected'?picksResult.reason:null;
  const unpopularError=unpopularResult.status==='rejected'?unpopularResult.reason:unpopularResult.value.error;
  ownTakes=takeError?[]:(takesResult.value.data||[]);
  ownPicks=pickError?[]:picksResult.value;
  ownUnpopularTakeId=unpopularError?null:(unpopularResult.value.data||null);

  const errors=[];
  if(takeError)errors.push('Takes: '+(takeError.message||'no disponibles'));
  if(pickError)errors.push('Picks: '+(pickError.message||'no disponibles'));
  if(unpopularError)errors.push('Unpopular Take: '+(unpopularError.message||'no disponible'));
  $('aeProfileStatus').textContent=errors.length?'No se pudo cargar todo el perfil. '+errors.join(' · '):'';
  setPrivateTab('takes');
  if(!takeError)openSharedProfileTake(user.id);
}

async function showPublic(id,push=true,tab='takes'){
  if(!UUID.test(id))return;
  const user=await me();
  if(user?.id===id){await showOwn();if(tab==='picks')setPrivateTab('picks');return;}

  privateView=false;
  if($('aeProfilePublish'))$('aeProfilePublish').hidden=true;
  if($('aeProfileWelcomeAgain'))$('aeProfileWelcomeAgain').hidden=true;
  activeAuthor=id;
  activeTab=tab==='picks'?'picks':'takes';
  ownTakes=[];
  ownPicks=[];
  publicAuthorLabel='Aficionado';
  const ticket=++request;
  const dialog=$('aeProfileDialog');
  if(!dialog.open)dialog.showModal();

  // Public profiles include two readable tabs. No private account data.
  $('aeProfileTabs').hidden=false;
  $('aeProfileTakeHighlights').hidden=true;
  $('aeProfileTakes').hidden=true;
  $('aeProfilePickHighlights').hidden=true;
  $('aeProfilePicks').hidden=true;
  $('aeProfileAccuracy').hidden=true;
  $('aeProfileTakeAccuracy').hidden=true;
  $('aeProfileTitle').textContent='Perfil de aficionado';
  $('aeProfileUsername').textContent='Takes y Picks públicos';
  $('aeProfileStatus').textContent='Cargando perfil público…';
  $('aeProfileTakeHighlights').replaceChildren();
  $('aeProfileTakes').replaceChildren();
  $('aeProfilePickHighlights').replaceChildren();
  $('aeProfilePicks').replaceChildren();
  $('aeProfileAccuracy').replaceChildren();
  $('aeProfileTakeAccuracy').replaceChildren();
  if($('aeProfilePrestige')){$('aeProfilePrestige').replaceChildren();$('aeProfilePrestige').hidden=true;}
  loadPrestige(id);

  if(push){
    const u=new URL(location.href);
    u.searchParams.set('perfil',id);
    u.searchParams.delete('take');
    history.pushState({},'',u);
  }

  const [takesResult,picksResult]=await Promise.allSettled([
    db.rpc('ae_public_take_profile',{p_author_id:id}),
    loadOwnPicks(id) // ae_pick_feed is the existing public view.
  ]);
  if(ticket!==request||!dialog.open)return;
  const takeError=takesResult.status==='rejected'?takesResult.reason:takesResult.value.error;
  const pickError=picksResult.status==='rejected'?picksResult.reason:null;
  ownTakes=takeError?[]:(takesResult.value.data||[]);
  ownPicks=pickError?[]:picksResult.value;
  publicAuthorLabel=ownTakes[0]?.author||ownPicks[0]?.author||'Aficionado';
  $('aeProfileUsername').textContent='@'+publicAuthorLabel+' · Takes y Picks';
  const errors=[];
  if(takeError)errors.push('Takes no disponibles');
  if(pickError)errors.push('Picks no disponibles');
  $('aeProfileStatus').textContent=errors.join(' · ');
  setPrivateTab(tab);
  if(!takeError)openSharedProfileTake(id);
}

window.openAeProfile=showOwn;
window.openAePublicProfile=showPublic;
window.closeAeProfile=close;

document.addEventListener('DOMContentLoaded',()=>{
  updateButton();
  if(typeof db!=='undefined'&&db)db.auth.onAuthStateChange(()=>setTimeout(updateButton,150));

  $('aeProfileTabTakes')?.addEventListener('click',()=>setPrivateTab('takes'));
  $('aeProfileTabPicks')?.addEventListener('click',()=>setPrivateTab('picks'));

  $('aeProfileDialog')?.addEventListener('click',e=>{if(e.target===$('aeProfileDialog'))close();});
  $('aeProfileDialog')?.addEventListener('close',()=>{++request;});

  document.addEventListener('ae:takes-updated',refreshProfileTakes);
  window.addEventListener('ae:take-category-changed',()=>{
    if($('aeProfileDialog')?.open&&privateView)showOwn();
    else if($('aeProfileDialog')?.open&&activeAuthor)showPublic(activeAuthor,false);
  });

  const id=new URL(location.href).searchParams.get('perfil');
  if(id&&UUID.test(id))showPublic(id,false);

  window.addEventListener('popstate',()=>{
    const newId=new URL(location.href).searchParams.get('perfil');
    if(newId&&UUID.test(newId))showPublic(newId,false);
    else if($('aeProfileDialog')?.open&&!privateView)close();
  });
});
})();
