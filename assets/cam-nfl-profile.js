/* CAM SPORTS — Mi Quiniela: read-only profile reporting on the EXISTING NFL tables.
   A public RPC returns ONLY settled predictions; never query another user's private picks.
   No writes, no alternate ledgers, no changes to scoring or game synchronization. */
(() => {
  'use strict';
  const root=document.getElementById('camNflProfile');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{
    const x=document.createElement(tag);
    if(text!==undefined&&text!==null)x.textContent=String(text);
    if(cls)x.className=cls;
    return x;
  };
  const dbClient=()=>{try{return typeof db!=='undefined'?db:window.db;}catch{return window.db;}};
  const read=async request=>{const result=await request;if(result.error)throw Error(result.error.message||'Datos no disponibles');return result.data||[];};
  const resolved=g=>g.status==='final'||g.status==='tie'||g.status==='cancelled';
  const verdict=(g,p)=>!p?'none':g.status==='final'
    ?(g.winner_id&&p.team_id===g.winner_id?'won':'lost')
    :g.status==='tie'||g.status==='cancelled'?'void':'pending';
  const weekLabel=w=>w===19?'Comodines':w===20?'Divisionales':w===21?'Finales de conferencia':w===22?'Super Bowl':'Semana '+w;
  const num=value=>Number(value)||0;
  const percent=(won,lost)=>won+lost?Math.round(won/(won+lost)*100)+' %':'—';
  const time=g=>new Date(g.kickoff).toLocaleDateString('es-CA',{timeZone:'America/Toronto',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const seasonNow=()=>{const d=new Date();return d.getUTCFullYear()-(d.getUTCMonth()<2?1:0);};
  const teamList=()=>typeof NFL_TEAMS!=='undefined'?NFL_TEAMS:[];
  const teams=()=>new Map(teamList().map(x=>[x.id,x]));
  const defaultWeek=rows=>{
    const weeks=[...new Set(rows.map(g=>Number(g.week)))].sort((a,b)=>a-b);
    if(!weeks.length)return 1;
    const threshold=Date.now(),windowMs=6*60*60*1000;
    return weeks.find(w=>rows.some(g=>Number(g.week)===w&&Date.parse(g.kickoff)+windowMs>=threshold))||weeks[weeks.length-1];
  };
  let token=0,author=null,own=false,season=seasonNow(),allGames=[],picks=[],loadedAt=0,loadedKey='',loading=false;
  const current=()=>allGames.filter(g=>Number(g.season)===season);
  const pickMap=()=>new Map(picks.map(p=>[String(p.game_id),p]));
  const isVisible=()=>!root.hidden&&$('aeProfileDialog')?.open;
  const keys=()=>[...new Set(allGames.map(g=>Number(g.season)))].sort((a,b)=>b-a);
  const statusFrom=(g,p)=>({
    won:'Acertado',lost:'Fallado',void:'Anulado',pending:'Pendiente de resultado',none:'Sin pronóstico'
  })[verdict(g,p)];
  const isPrivate=()=>!own;

  function stat(label,value){
    const item=el('div',null,'cam-profile-quiniela-stat');
    item.append(el('strong',value),el('span',label));
    return item;
  }
  function summary(rows,entries){
    const match=new Map(rows.map(g=>[String(g.id),g]));
    const valid=entries.filter(p=>match.has(String(p.game_id)));
    const won=valid.filter(p=>verdict(match.get(String(p.game_id)),p)==='won').length;
    const lost=valid.filter(p=>verdict(match.get(String(p.game_id)),p)==='lost').length;
    const voided=valid.filter(p=>verdict(match.get(String(p.game_id)),p)==='void').length;
    const pending=valid.filter(p=>verdict(match.get(String(p.game_id)),p)==='pending').length;
    const points=valid.reduce((total,p)=>total+num(p.awarded_points),0);
    return {games:rows.length,predictions:valid.length,won,lost,voided,pending,points,accuracy:percent(won,lost)};
  }
  function statGrid(cells){
    const grid=el('div',null,'cam-profile-quiniela-stats');
    for(const [label,value] of cells)grid.append(stat(label,value));
    return grid;
  }
  function logo(teamId){
    const catalog=teams(),team=catalog.get(teamId);
    const span=el('span',null,'cam-profile-quiniela-team');
    if(team?.logo){
      const image=el('img');image.src=team.logo;image.alt='';image.width=32;image.height=32;image.loading='lazy';span.append(image);
    }
    span.append(el('span',team?.name||teamId));
    return span;
  }
  function matchup(g,p){
    const item=el('div',null,'cam-profile-quiniela-match');
    const title=el('p',time(g)+' · '+(p?statusFrom(g,p):'Sin pronóstico'),'cam-profile-quiniela-match-meta');
    const line=el('div',null,'cam-profile-quiniela-match-line');
    line.append(logo(g.away_id),el('span','@','cam-profile-quiniela-versus'),logo(g.home_id));
    item.append(title,line);
    const meta=el('p',null,'cam-profile-quiniela-match-result');
    if(p)meta.append(el('strong','Elegido: '+(teams().get(p.team_id)?.name||p.team_id)));
    if(g.status==='final'||g.status==='tie')meta.append(el('span','Marcador: '+g.away_score+' – '+g.home_score));
    if(p)meta.append(el('span',num(p.awarded_points)+' pts'));
    item.append(meta);
    return item;
  }
  function heading(title,subtitle){
    const section=el('section',null,'cam-profile-quiniela-section');
    const head=el('h3',title);
    section.append(head);
    if(subtitle)section.append(el('p',subtitle,'cam-profile-quiniela-note'));
    return section;
  }
  function render(){
    if(!isVisible())return;
    const currentGames=current();
    const currentWeek=defaultWeek(currentGames);
    const currentMatches=currentGames.filter(g=>Number(g.week)===currentWeek);
    const all=pickMap();
    const currentPicks=picks.filter(p=>currentMatches.some(g=>String(g.id)===String(p.game_id)));
    const currentStats=summary(currentMatches,currentPicks);
    const overall=summary(currentGames,picks);
    const participation=new Set(picks
      .map(p=>currentGames.find(g=>String(g.id)===String(p.game_id))?.week)
      .filter(w=>w!==undefined)).size;
    root.replaceChildren();
    const selection=el('div',null,'cam-profile-quiniela-season');
    const control=el('select');control.setAttribute('aria-label','Temporada de Mi Quiniela');
    for(const year of keys()){
      const op=el('option',String(year));op.value=String(year);op.selected=year===season;control.append(op);
    }
    control.addEventListener('change',()=>{season=Number(control.value);load(true);});
    selection.append(el('label','Temporada NFL'),control);
    root.append(selection);
    // Required order: current week, general metrics, then prior weeks.
    const currentBlock=heading('Jornada actual',weekLabel(currentWeek)+' · Temporada '+season);
    currentBlock.id='camNflProfileCurrent';
    currentBlock.append(statGrid([
      ['Partidos',currentStats.games],
      [own?'Seleccionados':'Pronósticos públicos',currentStats.predictions],
      [own?'Por elegir':'No visibles',own?Math.max(0,currentStats.games-currentStats.predictions):'—'],
      ['Aciertos',currentStats.won],['Fallos',currentStats.lost],
      ['Pendientes',own?currentStats.pending:'—']
    ]));
    const balance=el('p',(own?'Balance: ':'Balance confirmado: ')+currentStats.won+'–'+currentStats.lost+
      (own?'–'+currentStats.pending:'')+' · '+currentStats.points+' pts','cam-profile-quiniela-balance');
    currentBlock.append(balance);
    if(isPrivate())currentBlock.append(el('p','Por privacidad solo se muestran pronósticos con resultado confirmado. No se revelan selecciones futuras.','cam-profile-quiniela-note'));
    root.append(currentBlock);

    const general=heading('Estadísticas generales','Rendimiento acumulado en la temporada '+season+'.');
    general.id='camNflProfileGeneral';
    general.append(statGrid([
      ['Jornadas participadas',participation],
      ['Partidos pronosticados',overall.predictions],
      ['Aciertos',overall.won],
      ['Fallos',overall.lost],
      ['Pendientes',own?overall.pending:'—'],
      ['Porcentaje de acierto',overall.accuracy],
      ['Puntos acumulados',overall.points]
    ]));
    root.append(general);

    const history=heading('Historial de jornadas','Abre cada semana para consultar los equipos elegidos y los marcadores confirmados.');
    history.id='camNflProfileHistory';
    const weeks=[...new Set(currentGames.map(g=>Number(g.week)))].filter(w=>w<currentWeek
      ||(w===currentWeek&&currentMatches.every(g=>resolved(g)))).sort((a,b)=>b-a);
    const used=weeks.filter(w=>currentGames.some(g=>g.week===w&&all.has(String(g.id))));
    if(!used.length)history.append(el('p','Aún no hay jornadas anteriores con pronósticos visibles.','cam-profile-quiniela-note'));
    for(const week of used){
      const fixtures=currentGames.filter(g=>Number(g.week)===week).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
      const entries=fixtures.map(g=>all.get(String(g.id))).filter(Boolean);
      const stats=summary(fixtures,entries);
      const details=el('details',null,'cam-profile-quiniela-week');
      const caption=el('summary',weekLabel(week)+' · '+fixtures.length+' partidos · '+stats.predictions+' pronósticos · '+stats.points+' pts');
      details.append(caption);
      const metrics=statGrid([
        ['Aciertos',stats.won],['Fallos',stats.lost],['Pendientes',own?stats.pending:'—'],
        ['Porcentaje',stats.accuracy],['Puntos',stats.points]
      ]);
      details.append(metrics);
      const list=el('div',null,'cam-profile-quiniela-matches');
      // Only show other people's *settled* individual selections, never future selections.
      const viewable=fixtures.filter(g=>own||all.has(String(g.id)));
      for(const g of viewable)list.append(matchup(g,all.get(String(g.id))));
      details.append(list);
      history.append(details);
    }
    root.append(history);
  }

  async function load(force=false){
    if(!author||!isVisible())return;
    const c=dbClient();if(!c){root.replaceChildren(el('p','Conexión no disponible.'));return;}
    const fingerprint=author+':'+own+':'+season;
    if(!force&&fingerprint===loadedKey&&Date.now()-loadedAt<15000){render();return;}
    const ownToken=++token;
    loading=true;root.replaceChildren(el('p','Cargando Mi Quiniela…','cam-profile-quiniela-note'));
    try{
      // Project only the existing game fields; do not request unpublished other-user rows.
      if(!allGames.length||force&&season!==allGames[0]?.season){
        allGames=await read(c.from('cam_nfl_games')
          .select('id,season,week,home_id,away_id,kickoff,status,home_score,away_score,winner_id')
          .order('kickoff',{ascending:false}).limit(850));
      }
      if(ownToken!==token||!isVisible())return;
      if(!keys().includes(season))season=keys()[0]||season;
      if(own){
        const ids=current().map(g=>String(g.id));
        picks=ids.length?await read(c.from('cam_nfl_picks')
          .select('game_id,team_id,awarded_points,settled_at').eq('user_id',author)
          .in('game_id',ids).limit(500)):[];
      }else{
        picks=await read(c.rpc('cam_nfl_public_pick_breakdown',{
          p_user_id:author,p_season:season,p_week:null
        }));
        // Defense in depth: never reveal public picks for unsettled games.
        const settled=new Set(current().filter(g=>resolved(g)).map(g=>String(g.id)));
        picks=picks.filter(p=>settled.has(String(p.game_id)));
      }
      if(ownToken!==token||!isVisible())return;
      loadedKey=author+':'+own+':'+season;loadedAt=Date.now();
      render();
    }catch(error){
      if(ownToken===token&&isVisible())root.replaceChildren(el('p','No se pudieron cargar las estadísticas de NFL: '+error.message,'cam-profile-quiniela-note'));
    }finally{if(ownToken===token)loading=false;}
  }
  function open(userId,isOwn){
    if(!userId)return;
    if(author!==userId||own!==Boolean(isOwn)){
      author=userId;own=Boolean(isOwn);season=seasonNow();
      picks=[];loadedKey='';allGames=[];loadedAt=0;
    }
    root.hidden=false;
    load();
  }
  function close(){
    ++token;root.hidden=true;root.replaceChildren();author=null;picks=[];loadedKey='';allGames=[];loading=false;
  }
  document.addEventListener('cam:nfl-picks-updated',()=>{loadedKey='';if(isVisible()&&author)load(true);});
  window.camNflProfile={open,close};
})();
