/* CAM SPORTS · La Quiniela de Fútbol: LaLiga, Premier, Liga MX y Champions.
   Misma maqueta y mismas reglas que la quiniela NFL, pero a tres resultados (1X2).
   Los escudos y los nombres salen de cam_football_teams, que llena la sincronización. */
(() => {
  'use strict';
  const root=document.getElementById('camFootballQuiniela');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{
    const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=String(text);
    if(cls)x.className=cls;return x;
  };
  const client=()=>{try{return typeof db!=='undefined'?db:window.db;}catch{return null;}};
  const editor=()=>typeof currentAdmin!=='undefined'&&!!currentAdmin;
  const clock=value=>new Date(value).toLocaleString('es',{timeZone:'America/Toronto',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});

  const COMPETITIONS=[
    {id:'laliga',label:'LaLiga',full:'LaLiga'},
    {id:'premier',label:'Premier',full:'Premier League'},
    {id:'ligamx',label:'Liga MX',full:'Liga MX'},
    {id:'champions',label:'Champions',full:'Champions League'}
  ];
  const competitionName=id=>COMPETITIONS.find(c=>c.id===id)?.full||id;
  const PICKS=['home','draw','away'];

  // Calendario por el día civil de Toronto, igual que la NFL, incluso en cambios de horario.
  const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'});
  const torontoDate=value=>{
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return 'sin-fecha';
    const parts=dateParts.formatToParts(date);
    const get=key=>parts.find(part=>part.type===key)?.value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  };
  const gameDay=game=>torontoDate(game.kickoff);
  const monthOf=g=>{
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Toronto',year:'numeric',month:'2-digit'}).formatToParts(new Date(g.kickoff));
    const value=k=>parts.find(p=>p.type===k)?.value||'';
    return value('year')+'-'+value('month');
  };
  const now=()=>Date.now();
  // La temporada europea empieza en julio; la de Liga MX se nombra por su año de inicio.
  const seasonGuess=()=>{const d=new Date();return d.getUTCFullYear()-(d.getUTCMonth()<6?1:0);};
  const inScope=()=>games.filter(g=>g.competition===competition&&Number(g.season)===season);
  const roundGames=()=>inScope().filter(g=>Number(g.matchday)===matchday)
    .sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));

  function groupedDays(fixtures){
    const groups=new Map();
    for(const game of fixtures){
      const key=gameDay(game);
      if(!groups.has(key))groups.set(key,{key,games:[]});
      groups.get(key).games.push(game);
    }
    return [...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
  }
  const dayLabel=key=>{
    if(key==='sin-fecha')return {name:'Fecha pendiente',date:'Por confirmar'};
    const date=new Date(key+'T12:00:00Z');
    return {
      name:new Intl.DateTimeFormat('es-CA',{timeZone:'America/Toronto',weekday:'long'}).format(date),
      date:new Intl.DateTimeFormat('es-CA',{timeZone:'America/Toronto',day:'numeric',month:'short'}).format(date)
    };
  };
  function chooseDay(fixtures){
    const days=groupedDays(fixtures);
    if(!days.length)return null;
    const current=now(),today=torontoDate(current);
    // Start on a day that accepts picks, even when today's remaining games are live.
    const openToday=days.find(day=>day.key===today&&day.games.some(isOpen));
    if(openToday)return openToday.key;
    const nextOpen=days.find(day=>day.games.some(isOpen));
    if(nextOpen)return nextOpen.key;
    const live=days.find(day=>day.games.some(g=>g.status==='live'));
    return live?.key||days[days.length-1].key;
  }
  const seasons=()=>[...new Set(games.filter(g=>g.competition===competition).map(g=>Number(g.season)))].sort((a,b)=>b-a);
  const st=(id,message,tone)=>{
    const e=$(id);if(!e)return;
    e.textContent=message||'';
    // El tono solo pinta el aviso; el texto sigue diciendo lo mismo.
    if(tone)e.dataset.tone=tone;else delete e.dataset.tone;
  };

  let games=[],teams=new Map(),user=null,mine=new Map(),draft=new Map();
  let competition=COMPETITIONS[0].id,season=seasonGuess(),matchday=1,dayKey=null;
  let scope='matchday',showAll=false,loading=false,loaded=false,saving=false,request=0,rankingRequest=0;

  function draftKey(id){return 'cam:football-quiniela:'+user?.id+':'+id;}
  function saveDraft(){
    if(!user)return;
    for(const [id,pick] of draft){try{localStorage.setItem(draftKey(id),pick);}catch{}}
  }
  function recover(){
    draft.clear();
    if(!user)return;
    for(const g of games){try{
      const pick=localStorage.getItem(draftKey(g.id));
      if(pick&&PICKS.includes(pick)&&!mine.has(g.id))draft.set(g.id,pick);
    }catch{}}
  }
  function isOpen(g){return g.status==='scheduled'&&g.picks_open&&new Date(g.kickoff).getTime()>now()&&g.odds_locked_at!=null;}
  const active=g=>draft.get(g.id)||mine.get(g.id)?.pick||null;

  function chooseRound(){
    // La jornada vigente se decide por sus partidos, no por el calendario.
    // Un partido en curso conserva su jornada hasta terminar (margen de 4 h).
    const list=inScope();
    const rounds=[...new Set(list.map(g=>Number(g.matchday)))].sort((a,b)=>a-b);
    if(!rounds.length)return 1;
    const currentTime=now(),gameWindow=4*60*60*1000;
    return rounds.find(r=>list.some(g=>Number(g.matchday)===r&&isOpen(g)))
      ||rounds.find(r=>list.some(g=>Number(g.matchday)===r&&Date.parse(g.kickoff)+gameWindow>=currentTime))
      ||rounds[rounds.length-1];
  }
  const button=(text,action,cls='cam-nfl-action')=>{
    const b=el('button',text,cls);b.type='button';b.addEventListener('click',action);return b;
  };
  async function run(promise){
    const result=await promise;
    if(result.error)throw Error(result.error.message||'No se pudo completar la operación');
    return result.data;
  }
  async function loadSession(){
    const c=client();if(!c)return;
    const a=await c.auth.getUser();
    user=a.error?null:a.data?.user||null;
  }
  async function hydrate(){
    if(loading)return;
    loading=true;const ticket=++request;
    st('camFootballStatus','Cargando calendario oficial…','loading');
    try{
      const c=client();if(!c)throw Error('No se pudo iniciar Supabase');
      const [fixtures,squads]=await Promise.all([
        run(c.from('cam_football_games').select('*').order('kickoff',{ascending:true}).limit(1000)),
        run(c.from('cam_football_teams').select('*').limit(500))
      ]);
      if(ticket!==request)return;
      games=fixtures||[];
      teams=new Map((squads||[]).map(team=>[team.id,team]));
      if(!games.some(g=>g.competition===competition))
        competition=COMPETITIONS.find(c2=>games.some(g=>g.competition===c2.id))?.id||competition;
      if(games.length&&!seasons().includes(season))season=seasons()[0]||season;
      matchday=chooseRound();dayKey=null;
      await loadSession();
      await loadMine();
      recover();
      loaded=true;
      paint();
      st('camFootballStatus',games.length?'':'Todavía no hay partidos sincronizados. No se muestran datos ficticios.');
    }catch(error){
      st('camFootballStatus','No se pudieron obtener partidos reales: '+error.message,'error');
      // Sin calendario no se puede pronosticar: se dice y se bloquea el guardado.
      $('camFootballDayNav')?.replaceChildren();
      $('camFootballGames')?.replaceChildren(el('p',
        'No podemos mostrar la jornada ahora mismo. Inténtalo de nuevo en unos minutos; '+
        'los pronósticos que ya guardaste siguen a salvo.','cam-nfl-empty'));
      $('camFootballRanking')?.replaceChildren(el('p','Clasificación no disponible mientras falle la conexión.'));
      for(const id of ['camFootballSave','camFootballSaveDay']){const b=$(id);if(b)b.disabled=true;}
      renderAdmin();
    }finally{loading=false;}
  }
  async function loadMine(){
    mine.clear();
    if(!user)return;
    const ids=inScope().map(g=>g.id);
    if(!ids.length)return;
    const rows=await run(client().from('cam_football_picks')
      .select('game_id,pick,awarded_points,settled_at').eq('user_id',user.id).in('game_id',ids).limit(1000));
    for(const row of rows||[])mine.set(row.game_id,row);
  }
  // ESPN no publica el número oficial de jornada en fútbol, así que la jornada se
  // nombra por sus fechas reales en vez de enseñar un número que podría no ser el suyo.
  const shortDate=value=>new Intl.DateTimeFormat('es-CA',{timeZone:'America/Toronto',day:'numeric',month:'short'})
    .format(new Date(value)).replace('.','');
  function roundName(value){
    const list=inScope().filter(g=>Number(g.matchday)===Number(value))
      .sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
    if(!list.length)return 'Jornada '+value;
    const first=shortDate(list[0].kickoff),last=shortDate(list[list.length-1].kickoff);
    return 'Jornada · '+(first===last?first:first+'–'+last);
  }
  const teamName=id=>teams.get(id)?.short_name||teams.get(id)?.name||id;
  const teamAbbr=id=>teams.get(id)?.abbreviation||id;

  function pickResultFor(game,pick){
    if(!pick)return null;
    if(game.status==='cancelled')return 'void';
    if(game.status!=='final'||!game.outcome)return null;
    return pick.pick===game.outcome?'correct':'incorrect';
  }
  function paintNav(){
    const nav=$('camFootballNav');if(!nav)return;
    nav.replaceChildren();
    const tabs=el('div',null,'cam-nfl-competitions');
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','Competiciones de la quiniela');
    for(const option of COMPETITIONS){
      const chosen=option.id===competition;
      const tab=el('button',option.label,'cam-nfl-competition'+(chosen?' is-active':''));
      tab.type='button';tab.setAttribute('aria-pressed',String(chosen));
      tab.addEventListener('click',async()=>{
        if(competition===option.id)return;
        competition=option.id;
        if(!seasons().includes(season))season=seasons()[0]||season;
        matchday=chooseRound();dayKey=null;showAll=false;
        await loadMine();recover();paint();
      });
      tabs.append(tab);
    }
    const seasonSelect=el('select',null,'cam-nfl-select');
    seasonSelect.setAttribute('aria-label','Temporada');
    for(const value of seasons().length?seasons():[season]){
      const op=el('option',value+'/'+String(value+1).slice(2));op.value=String(value);op.selected=value===season;
      seasonSelect.append(op);
    }
    seasonSelect.addEventListener('change',async()=>{
      season=Number(seasonSelect.value);matchday=chooseRound();dayKey=null;
      await loadMine();recover();paint();
    });
    const rounds=[...new Set(inScope().map(g=>Number(g.matchday)))].sort((a,b)=>a-b);
    const roundSelect=el('select',null,'cam-nfl-select');
    roundSelect.setAttribute('aria-label','Jornada');
    for(const value of rounds.length?rounds:[matchday]){
      const op=el('option',roundName(value));op.value=String(value);op.selected=value===matchday;
      roundSelect.append(op);
    }
    roundSelect.addEventListener('change',()=>{matchday=Number(roundSelect.value);dayKey=null;paint();});
    nav.append(tabs,seasonSelect,roundSelect);
  }
  function logo(id){
    const team=teams.get(id);
    const image=el('img');image.alt='Escudo de '+(team?.name||id);image.loading='lazy';image.decoding='async';
    image.width=52;image.height=52;
    // Un escudo que no carga se esconde pero conserva su hueco: la fila no se descoloca.
    if(team?.logo)image.src=team.logo;
    else image.style.visibility='hidden';
    image.addEventListener('error',()=>{image.style.visibility='hidden';image.dataset.logoError='true';});
    return image;
  }
  function choose(g,pick){
    if(!isOpen(g))return;
    if(!user){window.openUserAuthModal?.();return;}
    draft.set(g.id,pick);saveDraft();paintGames();
  }
  function side(g,pick){
    const id=pick==='home'?g.home_id:g.away_id;
    const chosen=active(g)===pick,disabled=!isOpen(g);
    const b=el('button',null,'cam-nfl-team'+(chosen?' is-selected':''));
    b.type='button';b.disabled=disabled;b.setAttribute('aria-pressed',String(chosen));
    b.dataset.side=pick==='home'?'home':'away';
    if(g.status==='final'&&g.outcome)b.classList.add(g.outcome===pick?'is-winner':'is-loser');
    const summary=el('span',null,'cam-nfl-team-name');
    summary.append(el('strong',teamName(id)),el('span',teamAbbr(id)+' · '+(pick==='home'?'Local':'Visitante')));
    b.append(logo(id),summary);
    const points=pick==='home'?g.points_home:g.points_away;
    // Sin probabilidad visible: el usuario ve solo los puntos del acierto.
    b.append(el('small',points==null?'Pts pendientes':points+' pts'));
    b.addEventListener('click',()=>choose(g,pick));
    if(disabled)b.title='Este partido está cerrado';
    return b;
  }
  // El empate ocupa el lugar de la «@» de la NFL: misma tarjeta, un resultado más.
  function drawOption(g){
    const chosen=active(g)==='draw',disabled=!isOpen(g);
    const b=el('button',null,'cam-nfl-draw'+(chosen?' is-selected':''));
    b.type='button';b.disabled=disabled;b.setAttribute('aria-pressed',String(chosen));
    if(g.status==='final'&&g.outcome)b.classList.add(g.outcome==='draw'?'is-winner':'is-loser');
    b.append(el('span','Empate','cam-nfl-draw-label'));
    b.append(el('small',g.points_draw==null?'Pts pendientes':g.points_draw+' pts'));
    b.addEventListener('click',()=>choose(g,'draw'));
    if(disabled)b.title='Este partido está cerrado';
    return b;
  }
  // Mismo criterio que gameStatus(): el color nunca contradice al texto.
  function gameState(g){
    const pick=mine.get(g.id);
    if(g.status==='cancelled')return 'anulado';
    if(g.status==='final')return pick?(pick.pick===g.outcome?'acierto':'fallo'):'sin-pronostico';
    if(g.status==='live')return 'vivo';
    if(g.status==='postponed')return 'pospuesto';
    if(new Date(g.kickoff).getTime()<=now())return 'cerrado';
    if(!g.odds_locked_at)return 'pendiente';
    if(!g.picks_open)return 'cerrado';
    return mine.has(g.id)?'guardado':draft.has(g.id)?'borrador':'abierto';
  }
  function gameStatus(g){
    const pick=mine.get(g.id);
    if(g.status==='cancelled')return 'Anulado · 0 pts';
    if(g.status==='final'){
      if(!pick)return 'Finalizado · sin pick';
      return pick.pick===g.outcome?'Acertado · +'+pick.awarded_points+' pts':'Fallado · 0 pts';
    }
    if(g.status==='live')return 'En vivo';
    if(g.status==='postponed')return 'Pospuesto';
    if(new Date(g.kickoff).getTime()<=now())return 'Bloqueado';
    if(!g.odds_locked_at)return 'Preparando puntos';
    if(!g.picks_open)return 'Cerrada';
    return mine.has(g.id)?'Pronóstico guardado':draft.has(g.id)?'Sin guardar':'Abierto';
  }
  function paintDayNav(fixtures){
    const target=$('camFootballDayNav');if(!target)return;
    target.replaceChildren();
    const days=groupedDays(fixtures);
    if(!days.length)return;
    const nav=el('nav',null,'cam-nfl-days');
    nav.setAttribute('aria-label','Días de partido · hora de Toronto');
    for(const day of days){
      const title=dayLabel(day.key);
      const activeDay=day.key===dayKey;
      const tab=el('button',null,'cam-nfl-day'+(activeDay?' is-active':''));
      tab.type='button';tab.dataset.day=day.key;tab.setAttribute('aria-pressed',String(activeDay));
      tab.setAttribute('aria-controls','camFootballGames');
      tab.setAttribute('aria-label',title.name+' '+title.date+' · '+day.games.length+' partidos');
      tab.append(el('strong',title.name),el('span',title.date),el('small',
        day.games.length+' '+(day.games.length===1?'partido':'partidos')));
      tab.addEventListener('click',()=>{
        if(dayKey===day.key)return;
        dayKey=day.key;
        paintGames();
        // Restaurar el foco del teclado después de actualizar las pestañas.
        const current=$('camFootballDayNav')?.querySelectorAll('button[data-day]')||[];
        for(const button of current)if(button.dataset.day===dayKey){button.focus({preventScroll:true});break;}
      });
      nav.append(tab);
    }
    target.append(nav,el('p','Fechas y horarios: America/Toronto','cam-nfl-day-timezone'));
  }
  function paintGames(){
    const target=$('camFootballGames');if(!target)return;
    target.replaceChildren();
    const chosen=roundGames();
    if(!chosen.length){
      dayKey=null;
      $('camFootballDayNav')?.replaceChildren();
      target.append(el('p','No hay partidos oficiales cargados para esta jornada.','cam-nfl-empty'));
      st('camFootballRoundInfo',competitionName(competition)+' · '+roundName(matchday));
      if($('camFootballSave'))$('camFootballSave').disabled=true;
      if($('camFootballSaveDay'))$('camFootballSaveDay').disabled=true;
      return;
    }
    if(!groupedDays(chosen).some(day=>day.key===dayKey))dayKey=chooseDay(chosen);
    paintDayNav(chosen);
    const visible=chosen.filter(g=>gameDay(g)===dayKey);
    const next=chosen.filter(g=>Date.parse(g.kickoff)>now()).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff))[0];
    const opened=chosen.filter(g=>g.odds_locked_at).sort((a,b)=>Date.parse(a.odds_locked_at)-Date.parse(b.odds_locked_at))[0];
    st('camFootballRoundInfo',competitionName(competition)+' · '+roundName(matchday)+
      (opened?' · Apertura: '+clock(opened.odds_locked_at):' · Preparando puntos automáticamente')+
      (next?' · Próximo: '+clock(next.kickoff):' · No quedan partidos por disputar'));
    for(const g of visible){
      const box=el('article',null,'cam-nfl-game');
      box.dataset.state=gameState(g);
      const top=el('div',null,'cam-nfl-game-meta');
      top.append(el('span',clock(g.kickoff)),el('span',gameStatus(g),'cam-nfl-badge'));box.append(top);
      const sides=el('div',null,'cam-nfl-sides');
      sides.append(side(g,'home'),drawOption(g),side(g,'away'));
      box.append(sides);
      if(typeof currentAdmin!=='undefined'&&currentAdmin&&isOpen(g))box.append(adminPoints(g));
      if(g.status==='final')box.append(el('p',g.home_score+' — '+g.away_score,'cam-nfl-result'));

      target.append(box);
    }
    const save=$('camFootballSave'),saveDay=$('camFootballSaveDay');
    if(save){
      save.disabled=saving||(user?!chosen.some(g=>draft.has(g.id)&&isOpen(g)):false);
      save.textContent=user?'Guardar toda la jornada':'Inicia sesión para participar';
    }
    if(saveDay){
      saveDay.disabled=saving||(user?!visible.some(g=>draft.has(g.id)&&isOpen(g)):false);
      saveDay.textContent=user?'Guardar picks del día':'Inicia sesión para participar';
    }
  }
  async function persist(mode='round'){
    if(saving)return;
    if(!user){window.openUserAuthModal?.();return;}
    const pending=roundGames().filter(g=>draft.has(g.id)&&isOpen(g)&&(mode!=='day'||gameDay(g)===dayKey));
    if(!pending.length)return;
    saving=true;paintGames();
    let successes=0;const errors=[];
    try{
      for(const g of pending){
        try{
          await run(client().rpc('cam_football_save_pick',{p_game_id:g.id,p_pick:draft.get(g.id)}));
          mine.set(g.id,{game_id:g.id,pick:draft.get(g.id),awarded_points:0});
          draft.delete(g.id);
          try{localStorage.removeItem(draftKey(g.id));}catch{}
          successes++;
        }catch(error){errors.push(teamName(g.home_id)+': '+error.message);}
      }
    }finally{saving=false;paintGames();}
    st('camFootballStatus',successes+' pronóstico(s) guardado(s)'+(mode==='day'?' en este día':' en la jornada')+'.'+
      (errors.length?' '+errors.join(' · '):''),errors.length?'error':successes?'ok':undefined);
    if(successes)document.dispatchEvent(new CustomEvent('cam:football-picks-updated'));
  }
  function paint(){
    paintNav();paintGames();renderAdmin();paintRanking();
  }
  function pickLabel(g,pick){
    if(pick==='draw')return 'Empate';
    return teamName(pick==='home'?g.home_id:g.away_id);
  }
  async function paintRanking(){
    const target=$('camFootballRanking');if(!target)return;
    const ticket=++rankingRequest;
    target.replaceChildren(el('p','Cargando clasificación…'));
    const selected=roundGames()[0]||inScope()[0];
    const month=selected?monthOf(selected):new Date().toISOString().slice(0,7);
    try{
      const rows=await run(client().rpc('cam_football_leaderboard',{
        p_scope:scope,p_season:season,p_competition:competition,
        p_matchday:scope==='matchday'?matchday:null,p_month:scope==='month'?month:null,
      }));
      if(ticket!==rankingRequest)return;
      target.replaceChildren();
      if(!rows?.length){target.append(el('p','Todavía no hay resultados definitivos en este periodo.','cam-nfl-empty'));return;}
      const table=el('table',null,'cam-nfl-table');
      const head=el('thead');const tr=el('tr');
      for(const cell of ['#','Usuario','Aciertos','% acierto','Pts'])tr.append(el('th',cell));
      head.append(tr);table.append(head);
      const body=el('tbody');
      for(const line of rows.slice(0,showAll?500:10)){
        const r=el('tr');
        r.append(el('td',line.rank_position));
        const c=el('td');const a=el('button','@'+line.username,'cam-nfl-link');a.type='button';
        a.addEventListener('click',()=>window.openAePublicProfile?.(line.user_id));
        c.append(a);
        const details=el('details',null,'cam-nfl-ranking-details');
        details.append(el('summary','Ver pronósticos finalizados'));
        const content=el('div',null,'cam-nfl-ranking-picks');
        details.append(content);
        details.addEventListener('toggle',async()=>{
          if(!details.open||content.dataset.loaded)return;
          content.dataset.loaded='loading';
          content.replaceChildren(el('p','Consultando resultados…'));
          try{
            const picks=await run(client().rpc('cam_football_public_pick_breakdown',{
              p_user_id:line.user_id,p_season:season,p_competition:competition,
              p_matchday:scope==='matchday'?matchday:null
            }));
            if(!details.isConnected)return;
            content.replaceChildren();
            const relevant=(picks||[]).filter(p=>{
              const game=games.find(g=>g.id===p.game_id);
              return game&&(scope!=='month'||monthOf(game)===month);
            });
            if(!relevant.length)content.append(el('p','Aún no hay pronósticos resueltos.'));
            for(const pick of relevant.slice(0,60)){
              const game=games.find(g=>g.id===pick.game_id);
              const row=el('div',null,'cam-nfl-ranking-pick');
              row.dataset.result=pickResultFor(game,pick)||'';
              row.append(el('p',roundName(game.matchday)+' · '+pick.awarded_points+' pts'));
              row.append(el('p',teamName(game.home_id)+' vs '+teamName(game.away_id)+
                ' · eligió '+pickLabel(game,pick.pick),'cam-nfl-ranking-pick-detail'));
              content.append(row);
            }
            content.dataset.loaded='yes';
          }catch(err){
            content.replaceChildren(el('p','No se pudo cargar el desglose: '+err.message));
            delete content.dataset.loaded;
          }
        });
        c.append(details);
        r.append(c,el('td',line.hits+'/'+line.resolved),el('td',line.accuracy+' %'),el('td',line.points));
        body.append(r);
      }
      table.append(body);target.append(table);
      if(rows.length>10)target.append(button(showAll?'Ver Top 10':'Ver clasificación completa',
        ()=>{showAll=!showAll;paintRanking();},'cam-nfl-more'));
    }catch(error){if(ticket===rankingRequest){target.replaceChildren(el('p','Ranking no disponible: '+error.message));}}
  }
  function adminPoints(g){
    const panel=el('details',null,'cam-nfl-admin-game');
    panel.append(el('summary','Ajustar puntos (opcional)'));
    panel.append(el('p','El cálculo es automático. Puedes ajustar de 2 a 12 puntos antes de que alguien guarde un pronóstico.'));
    const fields=el('div',null,'cam-football-point-fields');panel.append(fields);
    const inputs=['home','draw','away'].map((side,i)=>{
      const label=el('label',['Local','Empate','Visitante'][i]);
      const input=el('input');input.type='number';input.min='2';input.max='12';input.step='1';input.inputMode='numeric';
      input.value=String(g['points_'+side]);input.setAttribute('aria-label','Puntos '+['local','empate','visitante'][i]);
      label.append(input);fields.append(label);return input;
    });
    const save=button('Guardar ajuste',async()=>{
      const values=inputs.map(i=>Number(i.value));
      if(values.some(v=>!Number.isInteger(v)||v<2||v>12)){st('camFootballStatus','Usa puntos enteros de 2 a 12.','error');return;}
      save.disabled=true;
      try{
        await run(client().rpc('cam_football_admin_points',{p_game_id:g.id,p_home:values[0],p_draw:values[1],p_away:values[2]}));
        await hydrate();st('camFootballStatus','Puntos ajustados. El resto de partidos sigue en automático.','ok');
      }catch(e){st('camFootballStatus',e.message,'error');}finally{save.disabled=false;}
    });
    panel.append(save);return panel;
  }
  function renderAdmin(){
    // Football is automatic. No per-game or per-round administration is required.
    const target=$('camFootballAdmin');
    if(target){target.hidden=true;target.replaceChildren();}
  }
  function setup(){
    // Refresh a previously closed snapshot when returning to this tab.
    const refreshWhenIdle=()=>{
      // iOS keyboard/focus events must never replace a form being edited.
      if(!root.hidden&&!root.querySelector('.cam-nfl-admin-game[open]'))hydrate();
    };
    window.addEventListener('focus',refreshWhenIdle);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWhenIdle();});
    let lastAdmin=editor();
    window.addEventListener('cam:admin-state-change',()=>{
      const next=editor();if(next===lastAdmin)return;lastAdmin=next;
      if(loaded)paintGames();
    });
    $('camFootballSave')?.addEventListener('click',()=>persist('round'));
    $('camFootballSaveDay')?.addEventListener('click',()=>persist('day'));
    const tabs=$('camFootballRankingTabs');
    tabs?.addEventListener('click',event=>{
      const tab=event.target.closest('button[data-scope]');if(!tab)return;
      scope=tab.dataset.scope;showAll=false;
      for(const btn of tabs.querySelectorAll('button'))btn.setAttribute('aria-pressed',String(btn===tab));
      paintRanking();
    });
    $('camFootballLogin')?.addEventListener('click',()=>window.openUserAuthModal?.());
    client()?.auth?.onAuthStateChange?.(()=>setTimeout(async()=>{
      const was=user?.id;await loadSession();
      if(was!==user?.id){if(loaded)await hydrate();else{await loadMine();recover();}}
    },150));
    let wasVisible=document.body.classList.contains('ae-is-football');
    const observer=new MutationObserver(()=>{
      const visible=document.body.classList.contains('ae-is-football');
      root.hidden=!visible;
      // Al volver a Fútbol, abrir la jornada vigente; consultar el pasado sigue siendo libre.
      if(visible&&!wasVisible&&loaded)hydrate();
      wasVisible=visible;
      if(visible&&!loaded&&!loading)hydrate();
    });
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    root.hidden=!document.body.classList.contains('ae-is-football');
    if(!root.hidden)hydrate();
  }
  // Loaded on demand: initialize immediately when DOMContentLoaded has already fired.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
