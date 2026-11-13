/* CAM SPORTS · La semana de Fútbol.
   Comparte las tarjetas y la jerarquía de NFL. Lee la misma jornada, equipos y
   elecciones de camFootballQuiniela: sin consultas, partidos ni puntos inventados.
   El selector de ligas es el componente de la quiniela. El marcador cierra la
   pestaña, detrás de la quiniela; Power Rankings permanece en Noticias.
   12 nov 2026: «Tu Take · ¿Qué crees que va a pasar?» abre la pestaña Takes
   (#camFootballTakePrompt), como en NFL; el ejemplo sale del partido destacado.
   13 nov 2026: El marcador es un menú vertical (El marcador · Clasificación ·
   Goleadores) de la liga elegida arriba; lo construye cam-sport-tables.js.
   13 nov 2026 (tarde): Champions, LaLiga y Premier usan el «¿Quién gana?» de NFL
   (los dos equipos en grande, con una franja sutil del color de cada club, y el
   empate debajo).
   13 nov 2026 (noche): la Liga MX también (sin «2 pts» en los botones); la Liguilla
   sigue arriba igual. Con el partido en juego o terminado, el marcador va dentro de
   cada tarjeta (Atlético 0 · Bayern 2) y no en una línea encima. */
(() => {
  'use strict';
  const root=document.getElementById('camFootballSemana');
  const body=document.getElementById('camFootballSemanaBody');
  const scores=document.getElementById('camFootballScoreBody');
  const promptRoot=document.getElementById('camFootballTakePrompt');
  if(!root||!body||!scores||!window.matchMedia)return;
  const mobile=window.matchMedia('(max-width: 760px), (orientation: landscape) and (max-height: 500px) and (hover: none) and (pointer: coarse)');
  const ui={scoreOpen:false,liveOpen:false,liveKey:null,saving:false,result:null,focusPick:null};
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
  const hasScore=g=>['live','final'].includes(g.status)&&g.home_score!=null&&g.away_score!=null;
  const name=(snap,id)=>snap.teams.get(id)?.short_name||snap.teams.get(id)?.name||id;
  const fullName=(snap,id)=>snap.teams.get(id)?.name||name(snap,id);
  const abbr=(snap,id)=>snap.teams.get(id)?.abbreviation||name(snap,id).split(/\s+/).map(s=>s[0]).join('').slice(0,3);
  const label=(snap,g,pick)=>pick==='draw'?'Empate':name(snap,pick==='home'?g.home_id:g.away_id);
  // Lo parejo se mide con las probabilidades: desde el 12 nov 2026 todos los aciertos valen 2.
  const even=g=>g.probability_home==null?1:Math.abs(Number(g.probability_home)-Number(g.probability_away));
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
  /* ---------- «¿Quién gana?» como en NFL (13 nov 2026) ----------
     Champions, LaLiga, Premier y (desde el 13 nov, noche) Liga MX. Mismas piezas y clases que el duelo de NFL
     (cam-ns-side…): el equipo es el botón, sin puntos a la vista; un toque guarda.
     El empate, tercer resultado del fútbol, va debajo de los dos equipos. */
  const NFL_FORMAT=new Set(['champions','laliga','premier','ligamx']);
  // Color de cada club para la franja de su tarjeta (como los acentos de NFL): tonos
  // legibles de día y de noche. Clubes blanco y negro o azul marino usan su segundo
  // color o un plateado. Un club que no esté aquí lleva el dorado de la casa.
  const CLUB_COLORS=[
    // LaLiga
    ['#febe10',['Real Madrid','Real Madrid CF']],
    ['#b3104c',['Barcelona','FC Barcelona','Barça']],
    ['#cb3524',['Atlético Madrid','Atlético de Madrid','Atletico Madrid','Atlético','Atletico']],
    ['#ee2523',['Athletic Club','Athletic Bilbao','Athletic']],
    ['#1f6fc0',['Real Sociedad']],
    ['#f2d130',['Villarreal','Villarreal CF']],
    ['#0bb363',['Real Betis','Betis']],
    ['#d71920',['Sevilla','Sevilla FC']],
    ['#f18e00',['Valencia','Valencia CF']],
    ['#8ac3ee',['Celta Vigo','Celta','RC Celta']],
    ['#c8102e',['Osasuna','CA Osasuna']],
    ['#2a6db5',['Getafe','Getafe CF']],
    ['#e53027',['Rayo Vallecano','Rayo']],
    ['#e20613',['Mallorca','RCD Mallorca']],
    ['#cd2534',['Girona','Girona FC']],
    ['#2f6cb8',['Alavés','Deportivo Alavés','Alaves']],
    ['#1f84c8',['Espanyol','RCD Espanyol']],
    ['#0f8a44',['Elche','Elche CF']],
    ['#b4053f',['Levante','Levante UD']],
    ['#2a6ab8',['Real Oviedo','Oviedo']],
    ['#f2d300',['Las Palmas','UD Las Palmas','Cádiz','Cadiz']],
    ['#8b3a9a',['Real Valladolid','Valladolid']],
    ['#2f62b8',['Leganés','Leganes','Deportivo La Coruña','Deportivo','Real Zaragoza','Zaragoza']],
    ['#0e9a4d',['Racing Santander','Racing','Córdoba','Cordoba']],
    ['#e2001a',['Almería','Almeria','Granada','Sporting Gijón','Sporting Gijon']],
    ['#3aa6e0',['Málaga','Malaga']],
    ['#a50034',['Huesca','SD Huesca','Eibar','SD Eibar']],
    // Premier League
    ['#ef0107',['Arsenal']],
    ['#9c2a5b',['Aston Villa']],
    ['#da291c',['AFC Bournemouth','Bournemouth','Manchester United','Man United','Man Utd']],
    ['#e30613',['Brentford']],
    ['#1f6fc4',['Brighton & Hove Albion','Brighton and Hove Albion','Brighton']],
    ['#99305f',['Burnley']],
    ['#2a63c4',['Chelsea','Everton']],
    ['#c4122e',['Crystal Palace']],
    ['#cc1f1f',['Fulham']],
    ['#ffcd00',['Leeds United','Leeds']],
    ['#c8102e',['Liverpool']],
    ['#6cabdd',['Manchester City','Man City']],
    ['#a5acaf',['Newcastle United','Newcastle']],
    ['#dd0000',['Nottingham Forest','Nottm Forest',"Nott'm Forest"]],
    ['#eb172b',['Sunderland']],
    ['#5f72b0',['Tottenham Hotspur','Tottenham','Spurs']],
    ['#a0384f',['West Ham United','West Ham']],
    ['#fdb913',['Wolverhampton Wanderers','Wolverhampton','Wolves']],
    ['#59cbe8',['Coventry City','Coventry']],
    ['#3a64a3',['Ipswich Town','Ipswich','Leicester City','Leicester','Millwall','West Bromwich Albion','West Brom']],
    ['#e11b22',['Middlesbrough','Southampton','Sheffield United','Stoke City','Stoke','Bristol City','Charlton Athletic','Wrexham']],
    ['#f5a12d',['Hull City','Hull']],
    ['#f2d500',['Norwich City','Norwich','Watford']],
    // Champions League
    ['#dc052d',['Bayern Munich','Bayern München','Bayern Múnich','Bayern']],
    ['#fde100',['Borussia Dortmund','Dortmund']],
    ['#e32221',['Bayer Leverkusen','Leverkusen']],
    ['#dd0741',['RB Leipzig','Leipzig']],
    ['#e1000f',['Eintracht Frankfurt','Frankfurt','VfB Stuttgart','Stuttgart']],
    ['#2f62b0',['Paris Saint-Germain','Paris Saint Germain','Paris SG','PSG']],
    ['#2faee0',['Marseille','Olympique de Marseille','Olympique Marseille']],
    ['#e51b22',['Monaco','AS Monaco','Lille','LOSC Lille']],
    ['#2b55b0',['Lyon','Olympique Lyonnais']],
    ['#ffd600',['Lens','RC Lens']],
    ['#a5acaf',['Juventus','Besiktas','Beşiktaş','Sturm Graz']],
    ['#1f78c8',['Internazionale','Inter','Inter Milan']],
    ['#fb090b',['AC Milan','Milan']],
    ['#12a0d7',['Napoli','SSC Napoli']],
    ['#1e71b8',['Atalanta']],
    ['#a6273b',['Roma','AS Roma','Bologna']],
    ['#87c8ef',['Lazio']],
    ['#2a68b8',['Como','Como 1907']],
    ['#e83030',['Benfica','SL Benfica','Braga','SC Braga']],
    ['#1f6fc4',['Porto','FC Porto','Rangers','Dinamo Zagreb','GNK Dinamo Zagreb','FC Copenhagen','Copenhagen','Pafos','Pafos FC']],
    ['#16955f',['Sporting CP','Sporting','Sporting Lisbon','Celtic','Panathinaikos']],
    ['#d2122e',['Ajax','PSV Eindhoven','PSV','Feyenoord','AZ Alkmaar','AZ','Galatasaray','Olympiacos','Slavia Prague','Red Bull Salzburg','Salzburg','Red Star Belgrade','Crvena Zvezda','FC Basel','Basel','FC Midtjylland','Midtjylland']],
    ['#a50034',['Sparta Prague']],
    ['#2a7fc8',['Club Brugge','Brugge']],
    ['#f2c300',['Union St.-Gilloise','Union Saint-Gilloise','Union SG','Fenerbahce','Fenerbahçe','Bodo/Glimt','Bodø/Glimt','FK Bodo/Glimt','Young Boys','BSC Young Boys','Kairat','Kairat Almaty']],
    ['#7b48a8',['Anderlecht']],
    ['#f37021',['Shakhtar Donetsk','Shakhtar']],
    // Liga MX (13 nov 2026, noche: la Liga MX también usa las tarjetas). Nombres de ESPN.
    ['#f6c300',['América','Club América']],
    ['#cd1f2d',['Guadalajara','Chivas','Chivas Guadalajara']],
    ['#1f4fa8',['Cruz Azul']],
    ['#c4a25c',['Pumas UNAM','UNAM','Pumas']],
    ['#fbb800',['Tigres UANL','Tigres']],
    ['#2b4f96',['Monterrey','Rayados']],
    ['#d0021b',['Toluca']],
    ['#2a6ab8',['Querétaro','Queretaro']],
    ['#0b8f4c',['Santos','Santos Laguna']],
    ['#0f7a3f',['León','Leon']],
    ['#2a5caa',['Pachuca','Puebla']],
    ['#c8102e',['Atlas','Tijuana','Xolos','Necaxa']],
    ['#d0102e',['Atlético de San Luis','Atl. San Luis','San Luis']],
    ['#2f55a4',['Atlante']]
  ];
  const clubColors=new Map(CLUB_COLORS.flatMap(([color,aliases])=>aliases.map(alias=>[normalizeClub(alias),color])));
  // ESPN escribe a veces «FC», «CF» o «AFC»: segunda vuelta sin esas siglas.
  const bareClub=value=>normalizeClub(value).split(' ').filter(w=>!['fc','cf','afc','cd','ud','rcd','sc','ac','as','ssc','club','sl'].includes(w)).join(' ');
  const clubsBare=new Map([...clubColors].map(([key,color])=>[bareClub(key),color]));
  function clubColor(snap,id){
    const team=snap.teams.get(id);
    for(const value of [team?.name,team?.short_name])if(value&&clubColors.has(normalizeClub(value)))return clubColors.get(normalizeClub(value));
    for(const value of [team?.name,team?.short_name])if(value&&clubsBare.has(bareClub(value)))return clubsBare.get(bareClub(value));
    return null;
  }
  const NS_ICONS={check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>'};
  function nsIcon(kind){
    const box=el('span',null,'cam-ns-ico',{'aria-hidden':'true'});
    box.innerHTML='<svg viewBox="0 0 24 24" focusable="false">'+NS_ICONS[kind]+'</svg>';
    return box;
  }
  const TZ='America/Toronto';
  const dayKey=value=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const clockOf=value=>new Intl.DateTimeFormat('es',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));
  const dayLongOf=value=>new Intl.DateTimeFormat('es',{timeZone:TZ,weekday:'long'}).format(new Date(value));
  function relativeDay(value){
    const key=dayKey(value);
    if(key===dayKey(Date.now()))return 'hoy';
    if(key===dayKey(Date.now()+864e5))return 'mañana';
    return null;
  }
  async function choosePick(snap,g,pick,node){
    if(ui.saving||(snap.draft.get(g.id)||snap.mine.get(g.id))===pick&&snap.mine.get(g.id)===pick)return;
    ui.saving=true;ui.result=null;
    for(const n of node.closest('.cam-ns-step')?.querySelectorAll('button')||[])n.disabled=true;
    try{
      const saved=await q().save(g.id,pick);
      if(saved){ui.result={game:g.id,ok:true};ui.focusPick=pick;}
      else if(snap.user)ui.result={game:g.id,ok:false,text:document.getElementById('camFootballStatus')?.textContent||'No se pudo guardar. Inténtalo de nuevo.'};
    }finally{ui.saving=false;schedule();}
  }
  function sideTile(snap,g,pick,open){
    const id=pick==='home'?g.home_id:g.away_id;
    const current=snap.draft.get(g.id)||snap.mine.get(g.id)||null;
    const chosen=current===pick,other=!!current&&!chosen;
    let cls='cam-ns-side'+(chosen?' is-selected':'')+(other?' is-other':'')+(open?'':' is-static');
    if(g.status==='final'&&g.outcome)cls+=g.outcome===pick?' is-winner':' is-loser';
    const tile=el(open?'button':'div',null,cls,{'data-side':pick,'data-pick':pick,'data-team':id});
    tile.style.setProperty('--duel-team-accent',clubColor(snap,id)||'var(--ns-gold)');
    const mark=el('span',null,'cam-ns-side-mark',{'aria-hidden':'true'});
    if(chosen)mark.append(nsIcon('check'));
    const text=el('span',null,'cam-ns-side-label');
    text.append(el('span',name(snap,id),'cam-ns-side-name'),el('span',pick==='home'?'Local':'Visitante','cam-ns-side-sub'));
    tile.append(mark,crest(snap,id,52),text);
    // En juego o terminado: los goles de cada equipo dentro de su tarjeta.
    const goals=hasScore(g)?(pick==='home'?g.home_score:g.away_score):null;
    if(goals!=null)tile.append(el('span',goals,'cam-ns-side-score',{'aria-hidden':'true'}));
    if(!open){
      const said=[fullName(snap,id)];
      if(goals!=null)said.push(goals+(Number(goals)===1?' gol':' goles'));
      if(g.status==='final'&&g.outcome===pick)said.push('ganó');
      if(chosen)said.push('tu pick');
      if(goals!=null||chosen)tile.setAttribute('aria-label',said.join(', '));
      return tile;
    }
    tile.type='button';tile.disabled=ui.saving;
    tile.setAttribute('aria-pressed',String(chosen));
    tile.setAttribute('aria-label',(chosen?'Tu pick: ':'Elegir a ')+fullName(snap,id));
    tile.addEventListener('click',()=>void choosePick(snap,g,pick,tile));
    return tile;
  }
  function drawTile(snap,g,open){
    const current=snap.draft.get(g.id)||snap.mine.get(g.id)||null;
    const chosen=current==='draw';
    let cls='cam-ns-draw'+(chosen?' is-selected':'')+(open?'':' is-static');
    if(g.status==='final'&&g.outcome)cls+=g.outcome==='draw'?' is-winner':' is-loser';
    const tile=el(open?'button':'div',null,cls,{'data-pick':'draw'});
    const mark=el('span',null,'cam-ns-draw-mark',{'aria-hidden':'true'});
    if(chosen)mark.append(nsIcon('check'));
    tile.append(mark,el('span','Empate','cam-ns-draw-label'));
    if(!open){if(chosen)tile.setAttribute('aria-label','Empate: tu pick');return tile;}
    tile.type='button';tile.disabled=ui.saving;
    tile.setAttribute('aria-pressed',String(chosen));
    tile.setAttribute('aria-label',chosen?'Tu pick: empate':'Elegir empate');
    tile.addEventListener('click',()=>void choosePick(snap,g,'draw',tile));
    return tile;
  }
  function hintLine(snap,g,open){
    const mine=snap.mine.get(g.id)||null,draft=snap.draft.get(g.id)||null;
    const result=ui.result?.game===g.id?ui.result:null;
    const hint=el('p',null,'cam-ns-hint',{role:'status'});
    if(result&&!result.ok){hint.classList.add('is-error');hint.textContent=result.text;}
    else if(g.status==='final'){
      if(mine&&g.outcome&&mine===g.outcome){hint.classList.add('is-saved');hint.append(nsIcon('check'),el('span','Acertaste: '+label(snap,g,mine)+'.'));}
      else hint.textContent=mine?'Elegiste '+label(snap,g,mine)+'.':'No elegiste en este partido.';
    }else if(g.status==='live')hint.textContent='En juego'+(mine?' · Tu pick: '+label(snap,g,mine):'');
    else if(started(g))hint.textContent=mine?'Tu pick: '+label(snap,g,mine)+' · pronósticos cerrados':'Pronósticos cerrados';
    else if(!open)hint.textContent='Se abre cuando lleguen las cuotas.';
    else if(draft&&draft!==mine)hint.textContent='Tu elección sin guardar: '+label(snap,g,draft);
    else if(mine){
      hint.classList.add('is-saved');
      const rel=relativeDay(g.kickoff);
      hint.append(nsIcon('check'),el('span','Guardado. Puedes cambiarlo hasta '+(rel||'el '+dayLongOf(g.kickoff))+' a las '+clockOf(g.kickoff)+'.'));
    }
    return hint;
  }
  function duelTiles(snap,g){
    // 13 nov 2026 (noche): sin la línea del marcador encima; cada tarjeta lleva sus goles.
    const scored=hasScore(g);
    const box=el('section',null,'cam-ns-block cam-ns-feature cam-ns-duelo'+(scored?' has-score':''),{'data-block':'duelo'});
    box.append(el('p',scored
      ?(g.status==='final'?'Final: ':'En juego: ')+fullName(snap,g.home_id)+' '+g.home_score+', '+fullName(snap,g.away_id)+' '+g.away_score
      :fullName(snap,g.home_id)+' contra '+fullName(snap,g.away_id),'cam-ns-sr'));
    const open=!started(g)&&!!q()?.isOpen(g);
    const step=el('div',null,'cam-ns-step cam-ns-step-pick',{role:'group','aria-labelledby':'camFsPickTitle'});
    step.append(el('h3',g.status==='final'?'¿Quién ganó?':'¿Quién gana?','cam-ns-step-title',{id:'camFsPickTitle'}));
    const sides=el('div',null,'cam-ns-sides');
    sides.append(sideTile(snap,g,'home',open),el('span',scored?'–':'VS','cam-ns-at',{'aria-hidden':'true'}),sideTile(snap,g,'away',open));
    step.append(sides,drawTile(snap,g,open));
    const hint=hintLine(snap,g,open);
    if(hint.textContent)step.append(hint);
    box.append(step);
    return box;
  }

  /* Guía al principio de Takes, con la misma maqueta que NFL
     (clases cam-ns-take*, estilos en cam-nfl-semana.css). El ejemplo de Gilberto Mora
     permanece estable. */
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
    const tag=el('p',null,'cam-ns-step-label');tag.append(icon('take'),el('span','Cómo hacer tu take'));
    box.append(tag,
      el('h2','¿Qué crees que va a pasar?','cam-ns-step-title',{id:'camFootballTakeTitle'}),
      el('p','¿Has dicho algo que no quedó para la historia? Con tu take se podrá quedar para la historia.','cam-ns-take-text'));
    const field=button(null,()=>openTake(snap),'cam-ns-take-field');
    field.setAttribute('aria-label','Escribir mi Take');field.setAttribute('aria-haspopup','dialog');field.setAttribute('aria-controls','aeTakeComposerDialog');
    const pen=el('span',null,'cam-ns-take-pen',{'aria-hidden':'true'});pen.append(icon('pen'));
    field.append(el('span','«Gilberto Mora balón de oro 2030»','cam-ns-take-placeholder',{'aria-hidden':'true'}),pen);
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
    // Las cuatro ligas: la misma cabecera que NFL (título y filete) antes de las ligas.
    const nflFormat=NFL_FORMAT.has(snap?.competition);
    root.classList.toggle('cam-fs-duelo',nflFormat);
    const head=el('header',null,'cam-ns-head');head.append(el('h2','La semana','cam-ns-title',{id:'camFootballSemanaTitle'}));
    if(nflFormat)head.append(el('span',null,'cam-ns-rule',{'aria-hidden':'true'}));
    // El selector cierra La semana, debajo del cuadro de acceso.
    const leagueFooter=document.getElementById('camFootballWeekLeagues');
    if(leagueFooter)leagueFooter.replaceChildren(...(api?[api.competitionNav()]:[]));
    // Un solo selector visible; la quiniela no repite el suyo.
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
      if(duel)fragment.append(duelTiles(snap,duel));
      else fragment.append(el('p','Todavía no hay partidos de esta competición.','cam-ns-text'));
      const score=scoreBlock(snap);scores.replaceChildren(...(score?[score]:[]));
    }
    const liveFocused=body.querySelector('.cam-ns-live-toggle')===document.activeElement;
    body.replaceChildren(fragment);
    if(liveFocused)body.querySelector('.cam-ns-live-toggle')?.focus({preventScroll:true});
    // Tras guardar, el foco vuelve a la opción elegida (el duelo se repinta entero).
    if(ui.focusPick){body.querySelector('[data-block="duelo"] [data-pick="'+ui.focusPick+'"]')?.focus({preventScroll:true});ui.focusPick=null;}
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

