/* CAM SPORTS · La semana de Fútbol.
   Comparte las tarjetas y la jerarquía de NFL. Lee la misma jornada, equipos y
   elecciones de camFootballQuiniela: sin consultas, partidos ni puntos inventados.
   El selector de ligas es el componente de la quiniela. El marcador cierra la
   pestaña, detrás de la quiniela; Power Rankings permanece en Noticias. */
(() => {
  'use strict';
  const root=document.getElementById('camFootballSemana');
  const body=document.getElementById('camFootballSemanaBody');
  const scores=document.getElementById('camFootballScoreBody');
  if(!root||!body||!scores||!window.matchMedia)return;
  const mobile=window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const ui={scoreOpen:false,liveOpen:false,liveKey:null,saving:false,result:null};
  // Antes de que cargue la quiniela, window.camFootballQuiniela es la <section> con ese id.
  const q=()=>{const api=window.camFootballQuiniela;return api&&typeof api.snapshot==='function'?api:null;};
  // 8 nov 2026: también en escritorio (cam-escritorio.css la compone en columnas).
  const active=()=>document.body.classList.contains('ae-is-football');
  const el=(tag,text,cls,attrs)=>{
    const n=document.createElement(tag);
    if(text!=null)n.textContent=String(text);
    if(cls)n.className=cls;
    for(const [key,value] of Object.entries(attrs||{}))n.setAttribute(key,String(value));
    return n;
  };
  const button=(text,action,cls='cam-ns-link')=>{
    const b=el('button',text,cls);b.type='button';b.addEventListener('click',action);return b;
  };
  const started=g=>g.status!=='scheduled'||Date.parse(g.kickoff)<=Date.now();
  const name=(snap,id)=>snap.teams.get(id)?.short_name||snap.teams.get(id)?.name||id;
  const fullName=(snap,id)=>snap.teams.get(id)?.name||name(snap,id);
  const abbr=(snap,id)=>snap.teams.get(id)?.abbreviation||name(snap,id).split(/\s+/).map(s=>s[0]).join('').slice(0,3);
  const label=(snap,g,pick)=>pick==='draw'?'Empate':name(snap,pick==='home'?g.home_id:g.away_id);
  const points=(g,pick)=>g['points_'+pick];
  const pts=n=>n+(Number(n)===1?' pt':' pts');
  const when=value=>new Intl.DateTimeFormat('es',{timeZone:'America/Toronto',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace(/\./g,'');
  function crest(snap,id,size=28){
    const box=el('span',null,'cam-ns-crest');box.style.setProperty('--crest',size+'px');
    box.append(el('span',abbr(snap,id),'cam-ns-crest-text',{'aria-hidden':'true'}));
    const url=snap.teams.get(id)?.logo;
    if(/^https:\/\//i.test(String(url||''))){
      const img=el('img',null,null,{alt:'',width:size,height:size,loading:'lazy',decoding:'async'});
      img.addEventListener('load',()=>box.classList.add('is-loaded'));
      img.addEventListener('error',()=>img.remove());img.src=url;box.append(img);
    }
    return box;
  }
  function section(key,title,aside){
    const node=el('section',null,'cam-ns-block',{'data-block':key});
    const head=el('div',null,'cam-ns-block-head');head.append(el('h3',title,'cam-ns-kicker'));
    if(aside)head.append(el('span',aside,'cam-ns-aside'));
    node.append(head);return node;
  }
  // Prioridad editorial por afición, no probabilidades ni puntos de la quiniela.
  // Referencias: CIES (popularidad social, 2026) y MITOFSKY (afición MX, 2026).
  // Bandas, no un recuento de fans; los alias cubren nombres ESPN en ambos idiomas.
  const normalizeClub=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const CLUB_PRIORITY=[
    [5,['Real Madrid','Real Madrid CF','Barcelona','FC Barcelona','Barça','Manchester United','Man United','Manchester City','Man City','Liverpool','Chelsea','Arsenal','Paris Saint-Germain','Paris Saint Germain','PSG','Bayern Munich','Bayern München','Bayern Múnich','Juventus','América','Club América','Guadalajara','Chivas','Chivas Guadalajara']],
    [4,['Atlético Madrid','Atlético de Madrid','Atletico','Atlético','Cruz Azul','Pumas UNAM','UNAM','Pumas','AC Milan','Milan','Inter','Internazionale','Inter Milan','Borussia Dortmund','Tottenham Hotspur','Tottenham']],
    [3,['Tigres UANL','Tigres','Monterrey','Toluca','Athletic Club','Athletic Bilbao','Valencia','Valencia CF','Sevilla','Sevilla FC','Real Betis','Betis','Newcastle United','Newcastle','Aston Villa','Napoli','Benfica','Porto','Ajax','Bayer Leverkusen']]
  ];
  const clubPriorities=new Map(CLUB_PRIORITY.flatMap(([weight,aliases])=>aliases.map(alias=>[normalizeClub(alias),weight])));
  function popularity(teams,id){
    const team=teams.get(id);
    return Math.max(0,...[team?.name,team?.short_name].map(value=>clubPriorities.get(normalizeClub(value))||0));
  }
  function chooseDuel(games,teams=new Map()){
    const appeal=g=>popularity(teams,g.home_id)+popularity(teams,g.away_id);
    const candidates=games.filter(g=>g.status==='live'||!started(g));
    const list=candidates.length?candidates:games.filter(g=>g.status==='final');
    return list.slice().sort((a,b)=>
      appeal(b)-appeal(a)||Math.abs((a.points_home??6)-(a.points_away??6))-Math.abs((b.points_home??6)-(b.points_away??6))||Date.parse(a.kickoff)-Date.parse(b.kickoff))[0]||null;
  }
  function focusGame(id){release();window.camSectionTabs?.select?.('quiniela',{scroll:false});void q()?.focus(id);}
  function pickButton(snap,g,pick){
    const selected=(snap.draft.get(g.id)||snap.mine.get(g.id))===pick;
    const b=button(null,async()=>{
      if(ui.saving)return;
      ui.saving=true;ui.result=null;
      for(const n of b.parentElement.children)if(n.tagName==='BUTTON')n.disabled=true;
      try{
        const saved=await q().save(g.id,pick);
        if(saved)ui.result={game:g.id,text:'Quiniela guardada: '+label(snap,g,pick)+'.'};
        else if(snap.user)ui.result={game:g.id,text:document.getElementById('camFootballStatus')?.textContent||'No se pudo guardar. Inténtalo de nuevo.'};
      }finally{ui.saving=false;schedule();}
    },'cam-ns-pick'+(selected?' is-selected':''));
    b.disabled=ui.saving;
    b.setAttribute('aria-pressed',String(selected));
    b.setAttribute('aria-label','Quiniela: elegir '+label(snap,g,pick)+(points(g,pick)==null?'':', '+pts(points(g,pick))));
    b.append(el('strong',label(snap,g,pick)),el('span',points(g,pick)==null?'Pts pendientes':pts(points(g,pick)),'cam-ns-pick-points'));
    return b;
  }
  function duelBlock(snap,g){
    const box=el('section',null,'cam-ns-block',{'data-block':'duelo','aria-label':'Partido destacado'});box.classList.add('cam-ns-feature');
    const teams=el('div',null,'cam-ns-duel');
    const side=id=>{const n=el('div',null,'cam-ns-duel-team');n.append(crest(snap,id,40),el('span',name(snap,id),'cam-ns-duel-name'));return n;};
    teams.append(side(g.home_id),el('span','vs','cam-ns-at',{'aria-hidden':'true'}),side(g.away_id));box.append(teams);
    box.append(el('p',fullName(snap,g.home_id)+' contra '+fullName(snap,g.away_id),'cam-ns-sr'));
    box.append(el('p',(g.status==='live'?'En juego · ':g.status==='final'?'Finalizado · ':'')+when(g.kickoff),'cam-ns-duel-when'));
    if(['live','final'].includes(g.status)&&g.home_score!=null&&g.away_score!=null)box.append(el('p',g.home_score+' – '+g.away_score,'cam-ns-duel-score'));
    const opinion=el('div',null,'cam-ns-opinion');
    const take=button('Publicar mi take sobre este duelo',()=>window.aeOpenTakeComposer?.('Fútbol'),'cam-ns-link cam-ns-link-take');
    take.setAttribute('aria-controls','aeTakeComposerDialog');take.setAttribute('aria-haspopup','dialog');opinion.append(take);box.append(opinion);
    const play=el('div',null,'cam-ns-quiniela',{role:'group','aria-label':'Quiniela del duelo de la semana'});
    if(q().isOpen(g)){
      const picks=el('div',null,'cam-ns-picks');
      for(const pick of ['home','draw','away'])picks.append(pickButton(snap,g,pick));
      play.append(picks);
    }else if(!started(g))play.append(el('p','Puntos pendientes','cam-ns-note'));
    const mine=snap.mine.get(g.id),draft=snap.draft.get(g.id);
    if(ui.result?.game===g.id)play.append(el('p',ui.result.text,'cam-ns-note',{role:'status'}));
    else if(draft||mine)play.append(el('p',(draft?'Tu elección sin guardar: ':'Tu elección guardada: ')+label(snap,g,draft||mine),'cam-ns-note'));
    play.append(button('Ver este partido en la quiniela →',()=>focusGame(g.id)));box.append(play);return box;
  }

  function liveBlock(snap){
    const live=(snap.liveGames||snap.games).filter(g=>g.status==='live'||
      (g.status==='scheduled'&&started(g)&&Date.parse(g.kickoff)+4*36e5>Date.now()))
      .sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
    if(!live.length){ui.liveOpen=false;return null;}
    const box=el('details',null,'cam-ns-block cam-ns-live',{'data-block':'envivo'});
    box.open=ui.liveOpen;
    const toggle=el('summary',null,'cam-ns-live-toggle');
    toggle.append(el('span','En juego','cam-ns-kicker'),el('span',live.length+(live.length===1?' partido':' partidos'),'cam-ns-aside'));
    box.append(toggle);
    box.addEventListener('toggle',()=>{
      if(!box.isConnected||ui.liveOpen===box.open)return;
      ui.liveOpen=box.open;
      if(ui.liveOpen)refreshLive();
    });
    const list=el('ul',null,'cam-ns-results');
    for(const g of live){
      const row=el('li',null,'cam-ns-result');
      const score=g.home_score!=null&&g.away_score!=null
        ?name(snap,g.home_id)+' '+g.home_score+' – '+g.away_score+' '+name(snap,g.away_id)
        :name(snap,g.home_id)+' vs '+name(snap,g.away_id);
      row.append(el('span',score,'cam-ns-result-score'));list.append(row);
    }
    box.append(list);return box;
  }
  function scoreBlock(snap){
    const finals=snap.results.filter(g=>g.home_score!=null&&g.away_score!=null).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff));
    if(!finals.length)return null;
    const target=finals.some(g=>Number(g.matchday)===snap.matchday)?snap.matchday:Number(finals[0].matchday);
    const results=finals.filter(g=>Number(g.matchday)===target);
    const box=section('marcador','El marcador',snap.competitionName);const list=el('ul',null,'cam-ns-results');
    for(const g of (ui.scoreOpen?results:results.slice(0,3))){
      const row=el('li',null,'cam-ns-result');
      row.append(el('span',name(snap,g.home_id)+' '+g.home_score+' – '+g.away_score+' '+name(snap,g.away_id),'cam-ns-result-score'));
      const mine=snap.mine.get(g.id);
      if(mine&&g.outcome)row.append(el('span',mine===g.outcome?'Acertaste':'Fallaste','cam-ns-result-mine '+(mine===g.outcome?'is-hit':'is-miss')));
      list.append(row);
    }
    box.append(list);
    if(results.length>3){const b=button(ui.scoreOpen?'Ver menos':'Ver los '+results.length+' resultados ›',()=>{ui.scoreOpen=!ui.scoreOpen;render();});b.setAttribute('aria-expanded',String(ui.scoreOpen));box.append(b);}
    return box;
  }
  // Mostrar la Liguilla en La semana incluso cuando el complemento todavía carga.
  // Nunca inventar cruces, equipos ni cuotas: la versión completa sustituye este estado.
  function liguillaPlaceholder(){
    const host=el('section',null,'cam-liguilla',{id:'camLiguilla','aria-labelledby':'camLiguillaTitle'});
    window.camLiguillaNode=host;
    const panel=el('div',null,'cam-lg-bracket cam-lg-pending');
    const header=el('header',null,'cam-lg-head');
    header.append(el('p','Liga MX · La liguilla','cam-lg-eyebrow'),
      el('h3','Arma tu cuadro',null,{id:'camLiguillaTitle'}),
      el('p','Cargando…','cam-lg-sub'));
    const board=el('div',null,'cam-lg-pending-board');
    for(const stage of ['Cuartos','Semifinales','Final','Campeón']){
      const column=el('div',null,'cam-lg-pending-stage');
      column.append(el('span',stage,'cam-lg-round-head'),el('span','Pendiente','cam-lg-pending-slot'));
      board.append(column);
    }
    panel.append(header,board);host.append(panel);
    return host;
  }
  function render(){
    if(!active())return;
    const api=q(),snap=api?.snapshot();
    const head=el('header',null,'cam-ns-head');head.append(el('h2','La semana','cam-ns-title',{id:'camFootballSemanaTitle'}));
    if(api)head.append(api.competitionNav());
    const fragment=document.createDocumentFragment();fragment.append(head);
    // El evento de Liga MX pertenece a La semana; comparte datos con la quiniela.
    const liguilla=snap?.competition==='ligamx'
      ?(window.camLiguillaNode||document.getElementById('camLiguilla')||liguillaPlaceholder())
      :document.getElementById('camLiguilla');
    if(snap?.competition==='ligamx'&&liguilla&&!liguilla.hidden&&liguilla.dataset.complete!=='true')
      fragment.append(liguilla);
    if(snap?.error){
      fragment.append(el('p',snap.error,'cam-ns-text'),button('Reintentar',()=>void api.refresh()));scores.replaceChildren();
    }else if(!snap?.loaded||snap.loading){
      fragment.append(el('p','Cargando la semana…','cam-ns-loading'));scores.replaceChildren();
    }else{
      const liveKey=snap.competition+'|'+snap.season;
      if(ui.liveKey!==liveKey){ui.liveKey=liveKey;ui.liveOpen=false;}
      const live=liveBlock(snap);if(live)fragment.append(live);
      const duel=chooseDuel(snap.games,snap.teams);
      if(duel)fragment.append(duelBlock(snap,duel));
      else fragment.append(el('p','Todavía no hay partidos de esta competición.','cam-ns-text'));
      const score=scoreBlock(snap);scores.replaceChildren(...(score?[score]:[]));
    }
    const liveFocused=body.querySelector('.cam-ns-live-toggle')===document.activeElement;
    body.replaceChildren(fragment);
    if(liveFocused)body.querySelector('.cam-ns-live-toggle')?.focus({preventScroll:true});
    keepAnchor();
  }
  let anchorUntil=0;
  function release(){anchorUntil=0;}
  function keepAnchor(){if(active()&&Date.now()<anchorUntil)document.getElementById('camFootballQuiniela')?.scrollIntoView({block:'start'});}
  for(const type of ['touchmove','wheel','keydown'])window.addEventListener(type,release,{passive:true,capture:true});
  const originalGo=window.camGoQuiniela;
  window.camGoQuiniela=function camFootballWeekGo(sport){
    if(sport==='football')anchorUntil=Date.now()+6000;
    return originalGo?.apply(this,arguments);
  };
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;render();});}
  document.addEventListener('cam:football-quiniela-data',schedule);
  document.addEventListener('cam:section-tab',event=>{if(event.detail?.section==='futbol'){if(event.detail.tab!=='semana')release();schedule();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  mobile.addEventListener?.('change',schedule);
  new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
  window.camFootballSemana=Object.freeze({render,_choose:chooseDuel});schedule();
  function refreshLive(){
    if(active()&&!document.hidden&&(document.body.dataset.camTab==='semana'||document.body.dataset.camSportPage)&&ui.liveOpen)
      void q()?.refreshLive?.();
  }
  setInterval(refreshLive,60000);
  window.addEventListener('focus',refreshLive);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshLive();});
})();

