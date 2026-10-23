/* CAM SPORTS · La Quiniela NFL: real results, server-locked picks and independent standings. */
(() => {
  'use strict';
  const root=document.getElementById('camNflQuiniela');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{
    const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=String(text);
    if(cls)x.className=cls;return x;
  };
  const client=()=>{try{return typeof db!=='undefined'?db:window.db;}catch{return null;}};
  const editor=()=>{try{return typeof currentAdmin!=='undefined'&&!!currentAdmin;}catch{return false;}};
  const clock=value=>new Date(value).toLocaleString('es',{timeZone:'America/Toronto',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  // Calendario de partidos según el día civil de Toronto, incluso en cambios de DST.
  const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'});
  const torontoDate=value=>{
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return 'sin-fecha';
    const parts=dateParts.formatToParts(date);
    const get=key=>parts.find(part=>part.type===key)?.value||'';
    return get('year')+'-'+get('month')+'-'+get('day');
  };
  const gameDay=game=>torontoDate(game.kickoff);
  const weekGames=()=>games.filter(g=>Number(g.season)===season&&Number(g.week)===week)
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
    const todayGames=days.find(day=>day.key===today);
    if(todayGames?.games.some(g=>g.status==='live'||(g.status==='scheduled'&&Date.parse(g.kickoff)>current)))return today;
    const next=days.find(day=>day.games.some(g=>g.status==='live'||(g.status==='scheduled'&&Date.parse(g.kickoff)>current)));
    return next?.key||days[days.length-1].key;
  }
  const monthOf=g=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date(g.kickoff));const value=k=>parts.find(p=>p.type===k)?.value||'';return value('year')+'-'+value('month');};
  const seasons=()=>[...new Set(games.map(g=>Number(g.season)))].sort((a,b)=>b-a);
  const now=()=>Date.now();
  const seasonGuess=()=>{const d=new Date();return d.getUTCFullYear()-(d.getUTCMonth()<2?1:0);};
  const st=(id,message,tone)=>{
    const e=$(id);if(!e)return;
    e.textContent=message||'';
    // El tono solo pinta el aviso; el texto sigue diciendo lo mismo.
    if(tone)e.dataset.tone=tone;else delete e.dataset.tone;
  };
  let games=[],teams=new Map(),user=null,mine=new Map(),draft=new Map(),season=seasonGuess(),week=1,dayKey=null,scope='week',showAll=false,loading=false,loaded=false,saving=false,request=0;
  function draftKey(id){return 'cam:nfl-quiniela:'+user?.id+':'+id;}
  function saveDraft(){
    if(!user)return;
    for(const [id,team] of draft){try{localStorage.setItem(draftKey(id),team);}catch{}}
  }
  function recover(){
    draft.clear();
    if(!user)return;
    for(const g of games){try{
      const team=localStorage.getItem(draftKey(g.id));
      if(team&&[g.home_id,g.away_id].includes(team)&&!mine.has(g.id))draft.set(g.id,team);
    }catch{}}
  }
  function isOpen(g){return g.status==='scheduled'&&g.picks_open&&new Date(g.kickoff).getTime()>now()&&g.odds_locked_at!=null;}
  function active(g){return draft.get(g.id)||mine.get(g.id)?.team_id||null;}
  function chooseWeek(){
    // La jornada vigente se decide por sus partidos, nunca por los de la semana pasada.
    // Un partido en curso conserva su jornada hasta terminar (margen de 6 h tras el kickoff).
    const inSeason=games.filter(g=>Number(g.season)===season);
    const weeks=[...new Set(inSeason.map(g=>Number(g.week)))].sort((a,b)=>a-b);
    if(!weeks.length)return 1;
    const currentTime=now(),gameWindow=6*60*60*1000;
    return weeks.find(w=>inSeason.some(g=>Number(g.week)===w&&(
      Date.parse(g.kickoff)+gameWindow>=currentTime
    )))||weeks[weeks.length-1];
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
    st('camNflStatus','Cargando calendario oficial…','loading');
    try{
      const c=client();if(!c)throw Error('No se pudo iniciar Supabase');
      const fixtures=await run(c.from('cam_nfl_games').select('*').order('kickoff',{ascending:true}).limit(500));
      if(ticket!==request)return;
      games=fixtures||[];
      // Una sola fuente visual: el catálogo NFL existente de CAM SPORTS.
      const originals=typeof NFL_TEAMS!=='undefined'?NFL_TEAMS:[];
      teams=new Map(originals.map(team=>[team.id,team]));
      if(games.length&&!seasons().includes(season))season=seasons()[0];
      week=chooseWeek();dayKey=null;
      await loadSession();
      await loadMine();
      recover();
      loaded=true;
      paint();
      st('camNflStatus',games.length?'':'Todavía no hay partidos sincronizados. No se muestran datos ficticios.');
    }catch(error){
      st('camNflStatus','No se pudieron obtener partidos reales: '+error.message,'error');
      // Sin calendario no se puede pronosticar: se dice y se bloquea el guardado.
      $('camNflDayNav')?.replaceChildren();
      $('camNflGames')?.replaceChildren(el('p',
        'No podemos mostrar la jornada ahora mismo. Inténtalo de nuevo en unos minutos; '+
        'los pronósticos que ya guardaste siguen a salvo.','cam-nfl-empty'));
      $('camNflRanking')?.replaceChildren(el('p','Clasificación no disponible mientras falle la conexión.'));
      for(const id of ['camNflSave','camNflSaveDay']){const b=$(id);if(b)b.disabled=true;}
      renderAdmin();
    }finally{loading=false;}
  }
  async function loadMine(){
    mine.clear();
    if(!user)return;
    const ids=games.filter(g=>g.season===season).map(g=>g.id);
    if(!ids.length)return;
    const rows=await run(client().from('cam_nfl_picks').select('game_id,team_id,awarded_points,settled_at').eq('user_id',user.id).in('game_id',ids).limit(500));
    for(const row of rows||[])mine.set(row.game_id,row);
  }
  function weekName(value){
    return ({19:'Playoffs · Wild Card',20:'Playoffs · Divisional',21:'Playoffs · Conferencias',22:'Super Bowl'})[value] || 'Jornada '+value;
  }
  function pickResultFor(game, pick){
    if(!pick)return null;
    if(game.status==='tie'||game.status==='cancelled')return 'void';
    if(game.status!=='final')return null;
    return pick.team_id===game.winner_id?'correct':'incorrect';
  }
  function paintNav(){
    const nav=$('camNflNav');nav.replaceChildren();
    const seasonSelect=el('select',null,'cam-nfl-select');seasonSelect.setAttribute('aria-label','Temporada NFL');
    for(const value of seasons().length?seasons():[season]){
      const op=el('option',String(value),null);op.value=String(value);op.selected=value===season;seasonSelect.append(op);
    }
    seasonSelect.addEventListener('change',async()=>{
      season=Number(seasonSelect.value);week=chooseWeek();dayKey=null;await loadMine();recover();paint();
    });
    const weeks=[...new Set(games.filter(g=>g.season===season).map(g=>g.week))].sort((a,b)=>a-b);
    const weekSelect=el('select',null,'cam-nfl-select');weekSelect.setAttribute('aria-label','Jornada NFL');
    for(const value of weeks.length?weeks:[week]){
      const op=el('option',weekName(value));op.value=String(value);op.selected=value===week;weekSelect.append(op);
    }
    weekSelect.addEventListener('change',()=>{week=Number(weekSelect.value);dayKey=null;paint();});
    nav.append(seasonSelect,weekSelect);
  }
  function logo(id){
    const team=window.CamNFLQuinielaTeams?.getTeam(id)||teams.get(id);
    const image=el('img');image.alt='Logo de '+(team?.name||id);image.loading='lazy';image.decoding='async';
    image.width=52;image.height=52;
    if(team?.logo)image.src=team.logo;
    else image.hidden=true;
    image.addEventListener('error',()=>{image.hidden=true;image.dataset.logoError='true';});
    return image;
  }
  function side(g,id){
    const chosen=active(g)===id,disabled=!isOpen(g);
    const b=el('button',null,'cam-nfl-team'+(chosen?' is-selected':''));
    b.type='button';b.disabled=disabled;b.setAttribute('aria-pressed',String(chosen));
    const home=id===g.home_id;
    b.dataset.side=home?'home':'away';
    if(g.status==='final'&&g.winner_id)b.classList.add(g.winner_id===id?'is-winner':'is-loser');
    const summary=el('span',null,'cam-nfl-team-name');
    const team=window.CamNFLQuinielaTeams?.getTeam(id)||teams.get(id);
    summary.append(el('strong',team?.name||id),el('span',(team?.id||id)+' · '+(home?'Local':'Visitante')));
    b.append(logo(id),summary);
    const points=id===g.home_id?g.points_home:g.points_away;
    // Sin probabilidad visible: el usuario ve solo los puntos del acierto.
    b.append(el('small',points==null?'Pts pendientes':points+' pts'));
    b.addEventListener('click',()=>{if(!isOpen(g))return;if(!user){window.openUserAuthModal?.();return;}draft.set(g.id,id);saveDraft();paintGames();});
    if(disabled)b.title='Este partido está cerrado';
    return b;
  }
  // Mismo criterio que gameStatus(): el color nunca contradice al texto.
  function gameState(g){
    const pick=mine.get(g.id);
    if(g.status==='cancelled'||g.status==='tie')return 'anulado';
    if(g.status==='final')return pick?(pick.team_id===g.winner_id?'acierto':'fallo'):'sin-pronostico';
    if(g.status==='live')return 'vivo';
    if(g.status==='postponed')return 'pospuesto';
    if(new Date(g.kickoff).getTime()<=now())return 'cerrado';
    if(!g.odds_locked_at)return 'pendiente';
    if(!g.picks_open)return 'cerrado';
    return mine.has(g.id)?'guardado':draft.has(g.id)?'borrador':'abierto';
  }
  function gameStatus(g){
    const pick=mine.get(g.id);
    if(g.status==='cancelled'||g.status==='tie')return 'Anulado · 0 pts';
    if(g.status==='final'){
      if(!pick)return 'Finalizado · sin pick';
      return pick.team_id===g.winner_id?'Acertado · +'+pick.awarded_points+' pts':'Fallado · 0 pts';
    }
    if(g.status==='live')return 'En vivo';
    if(g.status==='postponed')return 'Pospuesto';
    if(new Date(g.kickoff).getTime()<=now())return 'Bloqueado';
    if(!g.odds_locked_at)return 'Pendiente de cuotas';
    if(!g.picks_open)return 'Cerrada';
    return mine.has(g.id)?'Pronóstico guardado':draft.has(g.id)?'Sin guardar':'Abierto';
  }
  function paintDayNav(fixtures){
    const target=$('camNflDayNav');if(!target)return;
    target.replaceChildren();
    const days=groupedDays(fixtures);
    if(!days.length)return;
    const nav=el('nav',null,'cam-nfl-days');
    nav.setAttribute('aria-label','Días de partido · Hora del Este');
    for(const day of days){
      const title=dayLabel(day.key);
      const activeDay=day.key===dayKey;
      const tab=el('button',null,'cam-nfl-day'+(activeDay?' is-active':''));
      tab.type='button';tab.dataset.day=day.key;tab.setAttribute('aria-pressed',String(activeDay));
      tab.setAttribute('aria-controls','camNflGames');
      tab.setAttribute('aria-label',title.name+' '+title.date+' · '+day.games.length+' partidos');
      tab.append(el('strong',title.name),el('span',title.date),el('small',
        day.games.length+' '+(day.games.length===1?'partido':'partidos')));
      tab.addEventListener('click',()=>{
        if(dayKey===day.key)return;
        dayKey=day.key;
        paintGames();
        // Restaurar el foco del teclado después de actualizar las pestañas.
        const current=$('camNflDayNav')?.querySelectorAll('button[data-day]')||[];
        for(const button of current)if(button.dataset.day===dayKey){button.focus({preventScroll:true});break;}
      });
      nav.append(tab);
    }
    target.append(nav,el('p','Fechas y horarios: Este · America/Toronto','cam-nfl-day-timezone'));
  }
  function paintGames(){
    const target=$('camNflGames');if(!target)return;
    target.replaceChildren();
    const chosen=weekGames();
    if(!chosen.length){
      dayKey=null;
      $('camNflDayNav')?.replaceChildren();
      target.append(el('p','No hay partidos oficiales cargados para esta jornada.','cam-nfl-empty'));
      st('camNflWeekInfo',weekName(week)+' · Temporada '+season);
      if($('camNflSave'))$('camNflSave').disabled=true;
      if($('camNflSaveDay'))$('camNflSaveDay').disabled=true;
      return;
    }
    if(!groupedDays(chosen).some(day=>day.key===dayKey))dayKey=chooseDay(chosen);
    paintDayNav(chosen);
    const visible=chosen.filter(g=>gameDay(g)===dayKey);
    const next=chosen.filter(g=>Date.parse(g.kickoff)>now()).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff))[0];
    const opened=chosen.filter(g=>g.odds_locked_at).sort((a,b)=>Date.parse(a.odds_locked_at)-Date.parse(b.odds_locked_at))[0];
    st('camNflWeekInfo','Temporada '+season+' · '+weekName(week)+
      (opened?' · Apertura: '+clock(opened.odds_locked_at):' · Apertura pendiente de cuotas')+
      (next?' · Próximo: '+clock(next.kickoff):' · No quedan partidos por disputar'));
    for(const g of visible){
      const box=el('article',null,'cam-nfl-game');
      box.dataset.state=gameState(g);
      const top=el('div',null,'cam-nfl-game-meta');
      top.append(el('span',clock(g.kickoff)),el('span',gameStatus(g),'cam-nfl-badge'));box.append(top);
      const sides=el('div',null,'cam-nfl-sides');
      sides.append(side(g,g.away_id),el('span','@','cam-nfl-versus'),side(g,g.home_id));
      box.append(sides);
      if(g.status==='final'||g.status==='tie')box.append(el('p',g.away_score+' — '+g.home_score,'cam-nfl-result'));
      if(editor())box.append(adminGame(g));
      target.append(box);
    }

    const save=$('camNflSave'),saveDay=$('camNflSaveDay');
    if(save){
      save.disabled=saving||(user?!chosen.some(g=>draft.has(g.id)&&isOpen(g)):false);
      save.textContent=user?'Guardar toda la jornada':'Inicia sesión para participar';
    }
    if(saveDay){
      saveDay.disabled=saving||(user?!visible.some(g=>draft.has(g.id)&&isOpen(g)):false);
      saveDay.textContent=user?'Guardar picks del día':'Inicia sesión para participar';
    }
  }
  async function persist(mode='week'){
    if(saving)return;
    if(!user){window.openUserAuthModal?.();return;}
    const pending=weekGames().filter(g=>draft.has(g.id)&&isOpen(g)&&(mode!=='day'||gameDay(g)===dayKey));
    if(!pending.length)return;
    saving=true;paintGames();
    let successes=0;const errors=[];
    try{
      for(const g of pending){
        try{
          await run(client().rpc('cam_nfl_save_pick',{p_game_id:g.id,p_team_id:draft.get(g.id)}));
          mine.set(g.id,{game_id:g.id,team_id:draft.get(g.id),awarded_points:0});
          draft.delete(g.id);
          try{localStorage.removeItem(draftKey(g.id));}catch{}
          successes++;
        }catch(error){errors.push((teams.get(g.home_id)?.name||g.id)+': '+error.message);}
      }
    }finally{saving=false;paintGames();}
    st('camNflStatus',successes+' pronóstico(s) guardado(s)'+(mode==='day'?' en este día':' en la jornada')+'.'+(errors.length?' '+errors.join(' · '):''),
      errors.length?'error':successes?'ok':undefined);
    if(successes)document.dispatchEvent(new CustomEvent('cam:nfl-picks-updated'));
  }
  function paint(){
    paintNav();paintGames();renderAdmin();paintRanking();
  }
  async function paintRanking(){
    const target=$('camNflRanking');if(!target)return;
    const ticket=++rankingRequest;
    target.replaceChildren(el('p','Cargando clasificación…'));
    const selected=games.find(g=>g.season===season&&g.week===week);
    const month=selected?monthOf(selected):new Date().toISOString().slice(0,7);
    try{
      const rows=await run(client().rpc('cam_nfl_leaderboard',{
        p_scope:scope,p_season:season,p_week:scope==='week'?week:null,p_month:scope==='month'?month:null,
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
            const picks=await run(client().rpc('cam_nfl_public_pick_breakdown',{
              p_user_id:line.user_id,p_season:season,p_week:scope==='week'?week:null
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
              row.append(el('p',weekName(game.week)+' · '+pick.awarded_points+' pts'));
              if(window.CamNFLQuinielaTeams)row.append(window.CamNFLQuinielaTeams.createMatchup(game,{
                selectedTeamId:pick.team_id,locked:true,pickResult:pickResultFor(game,pick)
              }));
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
      if(rows.length>10)target.append(button(showAll?'Ver Top 10':'Ver clasificación completa',()=>{showAll=!showAll;paintRanking();},'cam-nfl-more'));
    }catch(error){if(ticket===rankingRequest){target.replaceChildren(el('p','Ranking no disponible: '+error.message));}}
  }
  let rankingRequest=0;
  function adminGame(g){
    const details=el('details',null,'cam-nfl-admin-game');
    details.append(el('summary','Administrar partido'));
    if(!g.odds_locked_at){
      const h=el('input'),a=el('input');h.type=a.type='number';h.placeholder='Cuota local';a.placeholder='Cuota visitante';
      const save=button('Congelar cuotas',async()=>{
        try{await run(client().rpc('cam_nfl_admin_odds',{p_game_id:g.id,p_home:Number(h.value),p_away:Number(a.value),p_source:'manual'}));await hydrate();}
        catch(error){st('camNflStatus',error.message,'error');}
      });
      details.append(el('p','Cuotas moneyline americanas verificadas. Congeladas para todos.'),h,a,save);
    }
    const scoreH=el('input'),scoreA=el('input'),reason=el('input');
    scoreH.type=scoreA.type='number';scoreH.placeholder='Puntos local';scoreA.placeholder='Puntos visitante';reason.placeholder='Justificación (mínimo 8 caracteres)';
    const status=el('select');
    for(const kind of ['final','tie','cancelled']){const op=el('option',kind);op.value=kind;status.append(op);}
    const settle=button('Resolver / corregir',async()=>{
      try{await run(client().rpc('cam_nfl_admin_result',{p_game_id:g.id,p_status:status.value,p_home:Number(scoreH.value),p_away:Number(scoreA.value),p_reason:reason.value}));await hydrate();}
      catch(error){st('camNflStatus',error.message,'error');}
    });
    details.append(el('p','Corrección auditada: se recalculan los puntos, nunca se duplican.'),status,scoreH,scoreA,reason,settle);
    if(!g.odds_locked_at){
      const h=el('select'),a=el('select'),date=el('input'),why=el('input');
      for(const control of [h,a]){
        for(const id of teams.keys()){const option=el('option',teams.get(id)?.name||id);option.value=id;control.append(option);}
      }
      h.value=g.home_id;a.value=g.away_id;date.type='datetime-local';
      date.value=new Date(Date.parse(g.kickoff)-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
      why.placeholder='Motivo de corrección';
      details.append(el('p','Corregir equipos y fecha antes de congelar cuotas:'),h,a,date,why,
        button('Corregir calendario',async()=>{
          try{await run(client().rpc('cam_nfl_admin_fix_game',{p_game_id:g.id,p_home:h.value,p_away:a.value,p_kickoff:new Date(date.value).toISOString(),p_reason:why.value}));await hydrate();}
          catch(error){st('camNflStatus',error.message,'error');}
        }));
    }
    return details;
  }
  function renderAdmin(){
    const target=$('camNflAdmin');if(!target)return;
    target.hidden=!editor();
    if(target.hidden)return;
    target.replaceChildren();
    target.append(el('h3','Administración · Quiniela NFL'));
    const controls=el('div',null,'cam-nfl-admin-controls');
    const sea=el('input'),wk=el('input');sea.type=wk.type='number';sea.value=String(season);sea.min='2020';wk.value=String(week);wk.min='1';wk.max='22';
    const sync=button('Sincronizar NFL',async()=>{
      sync.disabled=true;st('camNflStatus','Consultando resultados oficiales y cuotas…');
      try{
        const {data,error}=await client().functions.invoke('cam-nfl-sync',{body:{action:'sync',season:Number(sea.value),week:Number(wk.value)}});
        if(error)throw Error(error.message||'Error de sincronización');
        if(!data?.ok)throw Error(data?.error||'Sincronización no confirmada');
        await hydrate();
        st('camNflStatus','Sincronizado: '+data.weeks.reduce((n,w)=>n+w.games,0)+' partidos; '+data.odds.frozen+' cuotas congeladas.','ok');
      }catch(e){st('camNflStatus',e.message,'error');}finally{sync.disabled=false;}
    });
    const open=button('Abrir jornada',()=>toggleWeek(true));
    const close=button('Cerrar jornada',()=>toggleWeek(false));
    controls.append(el('label','Temporada'),sea,el('label','Semana'),wk,sync,open,close);
    target.append(controls,el('p','Para abrir un partido hacen falta probabilidades verificadas. Una jornada cerrada manualmente permanece cerrada.'));
    async function toggleWeek(enabled){
      try{
        const count=await run(client().rpc('cam_nfl_admin_open',{p_season:Number(sea.value),p_week:Number(wk.value),p_open:enabled}));
        await hydrate();st('camNflStatus',count+' partido(s) actualizados.','ok');
      }catch(error){st('camNflStatus',error.message,'error');}
    }
  }
  function setup(){
    $('camNflSave')?.addEventListener('click',()=>persist('week'));
    $('camNflSaveDay')?.addEventListener('click',()=>persist('day'));
    const tabs=$('camNflRankingTabs');
    tabs?.addEventListener('click',event=>{
      const tab=event.target.closest('button[data-scope]');if(!tab)return;
      scope=tab.dataset.scope;showAll=false;
      for(const btn of tabs.querySelectorAll('button'))btn.setAttribute('aria-pressed',String(btn===tab));
      paintRanking();
    });
    $('camNflLogin')?.addEventListener('click',()=>window.openUserAuthModal?.());
    client()?.auth?.onAuthStateChange?.(()=>setTimeout(async()=>{
      const was=user?.id;await loadSession();
      if(was!==user?.id){await loadMine();recover();if(loaded)paint();}
    },150));
    let wasVisible=document.body.classList.contains('ae-is-nfl');
    const observer=new MutationObserver(()=>{
      const visible=document.body.classList.contains('ae-is-nfl');
      root.hidden=!visible;
      // Al regresar a NFL, abrir la jornada vigente; consultar el pasado sigue siendo libre.
      if(visible&&!wasVisible&&loaded){
        const latestSeason=seasons()[0]||season;
        if(latestSeason!==season){
          season=latestSeason;
          week=chooseWeek();dayKey=null;
          loadMine().then(()=>{recover();paint();})
            .catch(error=>st('camNflStatus','No se pudieron actualizar tus picks: '+error.message,'error'));
        }else{
          week=chooseWeek();dayKey=null;
          paint();
        }
      }
      wasVisible=visible;
      if(visible&&!loaded&&!loading)hydrate();
    });
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    root.hidden=!document.body.classList.contains('ae-is-nfl');
    if(!root.hidden)hydrate();
  }
  document.addEventListener('DOMContentLoaded',setup);
})();
