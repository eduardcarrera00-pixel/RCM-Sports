/* CAM SPORTS · La semana de Fútbol.
   Comparte las tarjetas y la jerarquía de NFL. Lee la misma jornada, equipos y
   elecciones de camFootballQuiniela: sin consultas, partidos ni puntos inventados.
   El selector de ligas es el componente de la quiniela. El marcador cierra la
   pestaña, detrás de la quiniela; Power Rankings permanece en Noticias.
   12 nov 2026: «Tu Take · ¿Qué crees que va a pasar?» abre la pestaña Takes
   (#camFootballTakePrompt), como en NFL; el ejemplo sale del partido destacado.
   13 nov 2026: El marcador es un menú vertical (El marcador · Clasificación ·
   Goleadores) de la liga elegida arriba; lo construye cam-sport-tables.js. */
(() => {
  'use strict';
  const root=document.getElementById('camFootballSemana');
  const body=document.getElementById('camFootballSemanaBody');
  const scores=document.getElementById('camFootballScoreBody');
  const promptRoot=document.getElementById('camFootballTakePrompt');
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
  // Lo parejo se mide con las probabilidades: desde el 12 nov 2026 todos los aciertos valen 2.
  const even=g=>g.probability_home==null?1:Math.abs(Number(g.probability_home)-Number(g.probability_away));
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
      appeal(b)-appeal(a)||even(a)-even(b)||Date.parse(a.kickoff)-Date.parse(b.kickoff))[0]||null;
  }
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
    const take=button('Publicar Take',()=>window.aeOpenTakeComposer?.('Fútbol'),'cam-ns-link cam-ns-link-take');
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
    box.append(play);return box;
  }

  /* «Tu Take» al principio de Takes (12 nov 2026), con la misma maqueta que NFL
     (clases cam-ns-take*, estilos en cam-nfl-semana.css). El ejemplo usa el partido
     destacado; si ya elegiste en ese partido, salen dos ideas que abren el compositor
     con el título escrito. Sin partido, un ejemplo genérico. */
  const ICONS={
    take:'<path d="M4 5h16v11H10l-6 4V5z"/>',
    pen:'<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'
  };
  function icon(kind){
    const box=el('span',null,'cam-ns-ico',{'aria-hidden':'true'});
    box.innerHTML='<svg viewBox="0 0 24 24" focusable="false">'+ICONS[kind]+'</svg>';
    return box;
  }
  function openTake(snap,title){
    if(typeof window.aeOpenTakeComposer!=='function')return;
    const preset={};
    if(snap?.competitionName)preset.competition=snap.competitionName;
    if(title)preset.title=title;
    window.aeOpenTakeComposer('Fútbol',preset);
  }
  function takeBlock(snap,duel){
    const pick=duel&&!started(duel)?(snap.draft.get(duel.id)||snap.mine.get(duel.id)||null):null;
    const box=el('div',null,'cam-ns-take'+(pick?' is-invited':''),{role:'group','aria-labelledby':'camFootballTakeTitle'});
    const tag=el('p',null,'cam-ns-step-label');tag.append(icon('take'),el('span','Tu Take'));
    box.append(tag,
      el('h2','¿Qué crees que va a pasar?','cam-ns-step-title',{id:'camFootballTakeTitle'}),
      el('p','Una predicción con tus palabras. Lo que se publica aquí no se borra.','cam-ns-take-text'));
    if(pick){
      const team=pick==='draw'?null:name(snap,pick==='home'?duel.home_id:duel.away_id);
      const ideas=team?[team+' gana por 2 goles o más',team+' remonta en la segunda parte']:['Empate con goles de los dos','Empate sin goles'];
      const wrap=el('div',null,'cam-ns-ideas'),row=el('div',null,'cam-ns-ideas-row');
      for(const idea of ideas){
        const b=button(idea,()=>openTake(snap,idea),'cam-ns-idea');
        b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-controls','aeTakeComposerDialog');row.append(b);
      }
      wrap.append(el('p','Ideas para empezar','cam-ns-ideas-label'),row);box.append(wrap);
    }
    const exampleTeam=pick&&pick!=='draw'?name(snap,pick==='home'?duel.home_id:duel.away_id):duel?name(snap,duel.home_id):null;
    const field=button(null,()=>openTake(snap),'cam-ns-take-field');
    field.setAttribute('aria-label','Escribir mi Take');field.setAttribute('aria-haspopup','dialog');field.setAttribute('aria-controls','aeTakeComposerDialog');
    const pen=el('span',null,'cam-ns-take-pen',{'aria-hidden':'true'});pen.append(icon('pen'));
    field.append(el('span',exampleTeam?'«'+exampleTeam+' gana por 2 goles o más…»':'«Este fin de semana pasa algo que nadie espera…»','cam-ns-take-placeholder',{'aria-hidden':'true'}),pen);
    const scale=el('p',null,'cam-ns-take-scale'),bars=el('span',null,'cam-ns-bars',{'aria-hidden':'true'});
    bars.append(el('span'),el('span'),el('span'));
    scale.append(bars,el('span','Cuanto más atrevido, más vale si aciertas'));
    box.append(field,scale);
    return box;
  }
  // Repintar sin perder el foco de quien lo usa con el teclado.
  function paintPrompt(snap,duel){
    if(!promptRoot)return;
    const focused=promptRoot.contains(document.activeElement)?(document.activeElement.textContent||document.activeElement.className):null;
    promptRoot.replaceChildren(takeBlock(snap,duel));
    if(focused==null)return;
    ([...promptRoot.querySelectorAll('button')].find(b=>(b.textContent||b.className)===focused)||promptRoot.querySelector('.cam-ns-take-field'))?.focus({preventScroll:true});
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
  // 13 nov 2026: el marcador es la primera fila de un menú vertical con la
  // clasificación y los goleadores de la liga elegida (cam-sport-tables.js).
  const LEAGUE_SHORT={ligamx:'Liga MX',champions:'Champions',laliga:'LaLiga',premier:'Premier'};
  function scoreBlock(snap){
    const finals=snap.results.filter(g=>g.home_score!=null&&g.away_score!=null).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff));
    let content=null,teaser='';
    if(finals.length){
      const target=finals.some(g=>Number(g.matchday)===snap.matchday)?snap.matchday:Number(finals[0].matchday);
      const results=finals.filter(g=>Number(g.matchday)===target);
      content=el('div',null,'cam-st-score');const list=el('ul',null,'cam-ns-results');
      for(const g of (ui.scoreOpen?results:results.slice(0,3))){
        const row=el('li',null,'cam-ns-result');
        const score=el('span',null,'cam-ns-result-score');
        const home=el('span',name(snap,g.home_id)+' '+g.home_score,g.home_score>g.away_score?'is-winner':null);
        const away=el('span',g.away_score+' '+name(snap,g.away_id),g.away_score>g.home_score?'is-winner':null);
        score.append(home,el('span',' – ','cam-ns-dash'),away);
        score.setAttribute('aria-label',fullName(snap,g.home_id)+' '+g.home_score+', '+fullName(snap,g.away_id)+' '+g.away_score);
        row.append(score);
        const mine=snap.mine.get(g.id);
        if(mine&&g.outcome)row.append(el('span',mine===g.outcome?'Acertaste':'Fallaste','cam-ns-result-mine '+(mine===g.outcome?'is-hit':'is-miss')));
        list.append(row);
      }
      content.append(list);
      if(results.length>3){const b=button(ui.scoreOpen?'Ver menos':'Ver los '+results.length+' resultados ›',()=>{ui.scoreOpen=!ui.scoreOpen;render();});b.setAttribute('aria-expanded',String(ui.scoreOpen));content.append(b);}
      teaser=snap.competitionName+' · '+results.length+(results.length===1?' resultado':' resultados');
    }
    const tables=window.camSportTables;
    if(!tables){
      if(!content)return null;
      const box=section('marcador','El marcador',snap.competitionName);box.append(...content.childNodes);return box;
    }
    return tables.menu({
      sport:'futbol',competition:snap.competition,league:LEAGUE_SHORT[snap.competition]||snap.competitionName,label:snap.competitionName,
      score:content?{title:'El marcador',teaser,content}:null,rebuild:schedule
    });
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
    // Un solo selector de competición: con el de La semana arriba, la quiniela no repite el suyo.
    root.classList.toggle('has-competition-nav',!!api);
    const fragment=document.createDocumentFragment();fragment.append(head);
    // El evento de Liga MX pertenece a La semana; comparte datos con la quiniela.
    const liguilla=snap?.competition==='ligamx'
      ?(window.camLiguillaNode||document.getElementById('camLiguilla')||liguillaPlaceholder())
      :document.getElementById('camLiguilla');
    if(snap?.competition==='ligamx'&&liguilla&&!liguilla.hidden&&liguilla.dataset.complete!=='true')
      fragment.append(liguilla);
    if(snap?.error){
      paintPrompt(snap,null);
      fragment.append(el('p',snap.error,'cam-ns-text'),button('Reintentar',()=>void api.refresh()));scores.replaceChildren();
    }else if(!snap?.loaded||snap.loading){
      paintPrompt(snap,null);
      fragment.append(el('p','Cargando la semana…','cam-ns-loading'));scores.replaceChildren();
    }else{
      const liveKey=snap.competition+'|'+snap.season;
      if(ui.liveKey!==liveKey){ui.liveKey=liveKey;ui.liveOpen=false;}
      const live=liveBlock(snap);if(live)fragment.append(live);
      const duel=chooseDuel(snap.games,snap.teams);
      paintPrompt(snap,duel);
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
  document.addEventListener('cam:sport-tables',event=>{if(event.detail?.competition&&event.detail.competition===q()?.snapshot()?.competition)schedule();});
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

