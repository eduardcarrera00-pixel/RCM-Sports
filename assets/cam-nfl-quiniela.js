/* CAM SPORTS · La Quiniela NFL: real results, server-locked picks and independent standings. */
(() => {
  'use strict';
  const root=document.getElementById('camNflQuiniela');
  const profile=document.getElementById('camNflProfile');
  if(!root)return;
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{
    const x=document.createElement(tag);if(text!==undefined&&text!==null)x.textContent=String(text);
    if(cls)x.className=cls;return x;
  };
  const client=()=>{try{return typeof db!=='undefined'?db:window.db;}catch{return null;}};
  const editor=()=>{try{return typeof currentAdmin!=='undefined'&&!!currentAdmin;}catch{return false;}};
  const clock=value=>new Date(value).toLocaleString('es',{timeZone:'America/Toronto',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  const monthOf=g=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date(g.kickoff));const value=k=>parts.find(p=>p.type===k)?.value||'';return value('year')+'-'+value('month');};
  const seasons=()=>[...new Set(games.map(g=>Number(g.season)))].sort((a,b)=>b-a);
  const now=()=>Date.now();
  const seasonGuess=()=>{const d=new Date();return d.getUTCFullYear()-(d.getUTCMonth()<2?1:0);};
  const st=(id,message)=>{const e=$(id);if(e)e.textContent=message||'';};
  let games=[],teams=new Map(),user=null,mine=new Map(),draft=new Map(),season=seasonGuess(),week=1,phase='REG',scope='week',showAll=false,loading=false,loaded=false,request=0;
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
  function chooseRound(){
    const rounds=[...new Map(games.filter(g=>g.season===season).map(g=>[
      (g.phase||'REG')+'-'+g.week,{phase:g.phase||'REG',week:Number(g.week)}
    ])).values()].sort((a,b)=>(['PRE','REG','POST'].indexOf(a.phase)-['PRE','REG','POST'].indexOf(b.phase))||a.week-b.week);
    if(!rounds.length)return {phase:'REG',week:1};
    const visible=rounds.filter(r=>games.some(g=>g.season===season&&(g.phase||'REG')===r.phase&&Number(g.week)===r.week&&g.picks_open));
    return visible[0]||rounds.find(r=>games.some(g=>g.season===season&&(g.phase||'REG')===r.phase&&Number(g.week)===r.week&&Date.parse(g.kickoff)>now()-3*86400000))||rounds[rounds.length-1];
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
    st('camNflStatus','Cargando calendario oficial…');
    try{
      const c=client();if(!c)throw Error('No se pudo iniciar Supabase');
      const [fixtures,logos]=await Promise.all([
        run(c.from('cam_nfl_games').select('*').order('kickoff',{ascending:true}).limit(500)),
        run(c.from('nfl_teams').select('id,name,logo')),
      ]);
      if(ticket!==request)return;
      games=fixtures||[];
      teams=new Map((logos||[]).map(t=>[t.id,t]));
      if(games.length&&!seasons().includes(season))season=seasons()[0];
      ({phase,week}=chooseRound());
      await loadSession();
      await loadMine();
      recover();
      loaded=true;
      paint();
      st('camNflStatus',games.length?'Partidos y resultados consultados.':'Todavía no hay partidos sincronizados. No se muestran datos ficticios.');
    }catch(error){
      st('camNflStatus','No se pudieron obtener partidos reales: '+error.message);
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
  function paintNav(){
    const nav=$('camNflNav');nav.replaceChildren();
    const seasonSelect=el('select',null,'cam-nfl-select');seasonSelect.setAttribute('aria-label','Temporada NFL');
    for(const value of seasons().length?seasons():[season]){
      const op=el('option',String(value),null);op.value=String(value);op.selected=value===season;seasonSelect.append(op);
    }
    seasonSelect.addEventListener('change',async()=>{
      season=Number(seasonSelect.value);({phase,week}=chooseRound());await loadMine();recover();paint();
    });
    const rounds=[...new Map(games.filter(g=>g.season===season).map(g=>[
      (g.phase||'REG')+'-'+g.week,{phase:g.phase||'REG',week:Number(g.week)}
    ])).values()].sort((a,b)=>(['PRE','REG','POST'].indexOf(a.phase)-['PRE','REG','POST'].indexOf(b.phase))||a.week-b.week);
    const weekSelect=el('select',null,'cam-nfl-select');weekSelect.setAttribute('aria-label','Fase y jornada NFL');
    const titles={PRE:'Pretemporada',REG:'Temporada regular',POST:'Playoffs'};
    for(const value of rounds.length?rounds:[{phase,week}]){
      const op=el('option',titles[value.phase]+' · Jornada '+value.week);
      op.value=value.phase+'-'+value.week;op.selected=value.phase===phase&&value.week===week;
      weekSelect.append(op);
    }
    weekSelect.addEventListener('change',()=>{const p=weekSelect.value.split('-');phase=p[0];week=Number(p[1]);paint();});
    nav.append(seasonSelect,weekSelect);
  }
  function logo(id){
    const team=teams.get(id);
    const image=el('img');image.alt='';image.loading='lazy';image.decoding='async';
    image.width=52;image.height=52;
    const src=team?.logo||'';
    if(src.startsWith('https://'))image.src=src;
    else image.hidden=true;
    return image;
  }
  function side(g,id){
    const chosen=active(g)===id,disabled=!isOpen(g);
    const b=el('button',null,'cam-nfl-team'+(chosen?' is-selected':''));
    b.type='button';b.disabled=disabled;b.setAttribute('aria-pressed',String(chosen));
    const summary=el('span',null,'cam-nfl-team-name');
    summary.append(el('strong',teams.get(id)?.name||id),el('span',id));
    b.append(logo(id),summary);
    const prob=id===g.home_id?g.probability_home:g.probability_away;
    const points=id===g.home_id?g.points_home:g.points_away;
    b.append(el('small',prob==null?'Sin probabilidades':Math.round(Number(prob)*100)+' % · '+points+' pts'));
    b.addEventListener('click',()=>{if(!isOpen(g)||!user)return;draft.set(g.id,id);saveDraft();paintGames();});
    if(disabled)b.title='Este partido está cerrado';
    return b;
  }
  function gameStatus(g){
    const pick=mine.get(g.id);
    if(g.status==='cancelled'||g.status==='tie')return 'Partido anulado · 0 pts';
    if(g.status==='final'){
      if(!pick)return 'Finalizado · sin pronóstico';
      return pick.team_id===g.winner_id?'Acertado · +'+pick.awarded_points+' pts':'Fallado · 0 pts';
    }
    if(g.status==='live')return 'En vivo · resultado pendiente';
    if(g.status==='postponed')return 'Pospuesto · pronósticos suspendidos';
    if(new Date(g.kickoff).getTime()<=now())return 'Partido bloqueado';
    if(!g.odds_locked_at)return 'Pendiente de probabilidades verificadas';
    if(!g.picks_open)return 'Quiniela cerrada';
    return mine.has(g.id)?'Pronóstico guardado':draft.has(g.id)?'Selección sin guardar':'Abierto para pronosticar';
  }
  function paintGames(){
    const target=$('camNflGames');if(!target)return;
    target.replaceChildren();
    const chosen=games.filter(g=>g.season===season&&(g.phase||'REG')===phase&&Number(g.week)===week).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
    if(!chosen.length){target.append(el('p','No hay partidos oficiales cargados para esta jornada.','cam-nfl-empty'));st('camNflProgress','0 pronósticos');if($('camNflSave'))$('camNflSave').disabled=true;return;}
    let progress=0,potential=0;
    for(const g of chosen){
      const selected=active(g);
      if(selected)progress++;
      if(selected&&isOpen(g))potential+=Number(selected===g.home_id?g.points_home:g.points_away)||0;
      const box=el('article',null,'cam-nfl-game');
      const top=el('div',null,'cam-nfl-game-meta');
      top.append(el('span',clock(g.kickoff)),el('span',gameStatus(g)));box.append(top);
      const sides=el('div',null,'cam-nfl-sides');
      sides.append(side(g,g.away_id),el('span','VS','cam-nfl-versus'),side(g,g.home_id));
      box.append(sides);
      if(g.status==='final'||g.status==='tie')box.append(el('p',g.away_score+' — '+g.home_score,'cam-nfl-result'));
      if(editor())box.append(adminGame(g));
      target.append(box);
    }
    st('camNflProgress',progress+' de '+chosen.length+' seleccionados · '+potential+' pts potenciales pendientes');
    const save=$('camNflSave');
    if(save){save.disabled=user?!chosen.some(g=>draft.has(g.id)&&isOpen(g)):false;save.textContent=user?'Guardar mi quiniela':'Inicia sesión para participar';}
  }
  async function persist(){
    if(!user){window.openUserAuthModal?.();return;}
    const pending=games.filter(g=>g.season===season&&(g.phase||'REG')===phase&&Number(g.week)===week&&draft.has(g.id)&&isOpen(g));
    if(!pending.length)return;
    const btn=$('camNflSave');btn.disabled=true;let successes=0;const errors=[];
    for(const g of pending){
      try{
        await run(client().rpc('cam_nfl_save_pick',{p_game_id:g.id,p_team_id:draft.get(g.id)}));
        mine.set(g.id,{game_id:g.id,team_id:draft.get(g.id),awarded_points:0});
        draft.delete(g.id);
        try{localStorage.removeItem(draftKey(g.id));}catch{}
        successes++;
      }catch(error){errors.push((teams.get(g.home_id)?.name||g.id)+': '+error.message);}
    }
    st('camNflStatus',successes+' pronóstico(s) guardado(s).'+(errors.length?' '+errors.join(' · '):''));
    paintGames();
  }
  function paint(){
    paintNav();paintGames();renderAdmin();paintRanking();
  }
  async function paintRanking(){
    const target=$('camNflRanking');if(!target)return;
    const ticket=++rankingRequest;
    target.replaceChildren(el('p','Cargando clasificación…'));
    const selected=games.find(g=>g.season===season&&(g.phase||'REG')===phase&&Number(g.week)===week);
    const month=selected?monthOf(selected):new Date().toISOString().slice(0,7);
    try{
      const rows=await run(client().rpc('cam_nfl_leaderboard_phase',{
        p_scope:scope,p_season:season,p_week:scope==='week'?week:null,p_month:scope==='month'?month:null,p_phase:phase,
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
        c.append(a);r.append(c,el('td',line.hits+'/'+line.resolved),el('td',line.accuracy+' %'),el('td',line.points));
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
        catch(error){st('camNflStatus',error.message);}
      });
      details.append(el('p','Cuotas moneyline americanas verificadas. Congeladas para todos.'),h,a,save);
    }
    const scoreH=el('input'),scoreA=el('input'),reason=el('input');
    scoreH.type=scoreA.type='number';scoreH.placeholder='Puntos local';scoreA.placeholder='Puntos visitante';reason.placeholder='Justificación (mínimo 8 caracteres)';
    const status=el('select');
    for(const kind of ['final','tie','cancelled']){const op=el('option',kind);op.value=kind;status.append(op);}
    const settle=button('Resolver / corregir',async()=>{
      try{await run(client().rpc('cam_nfl_admin_result',{p_game_id:g.id,p_status:status.value,p_home:Number(scoreH.value),p_away:Number(scoreA.value),p_reason:reason.value}));await hydrate();}
      catch(error){st('camNflStatus',error.message);}
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
          catch(error){st('camNflStatus',error.message);}
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
    const warnings=el('div',null,'cam-nfl-admin-alerts');
    target.append(warnings);
    client().from('cam_nfl_admin_alerts').select('message,created_at')
      .is('acknowledged_at',null).order('created_at',{ascending:false}).limit(3)
      .then(({data,error})=>{
        if(error||!warnings.isConnected)return;
        warnings.replaceChildren();
        for(const alert of data||[])warnings.append(el('p','⚠ '+alert.message));
      });
    const controls=el('div',null,'cam-nfl-admin-controls');
    const sea=el('input'),wk=el('input');sea.type=wk.type='number';sea.value=String(season);sea.min='2020';wk.value=String(week);wk.min='1';wk.max='18';
    const sync=button('Sincronizar NFL',async()=>{
      sync.disabled=true;st('camNflStatus','Consultando resultados oficiales y cuotas…');
      try{
        const {data,error}=await client().functions.invoke('cam-nfl-sync',{body:{action:'sync',season:Number(sea.value),week:Number(wk.value)}});
        if(error)throw Error(error.message||'Error de sincronización');
        if(!data?.ok)throw Error(data?.error||'Sincronización no confirmada');
        await hydrate();
        st('camNflStatus','Sincronizado: '+data.weeks.reduce((n,w)=>n+w.games,0)+' partidos; '+data.odds.frozen+' cuotas congeladas.');
      }catch(e){st('camNflStatus',e.message);}finally{sync.disabled=false;}
    });
    const open=button('Abrir jornada',()=>toggleWeek(true));
    const close=button('Cerrar jornada',()=>toggleWeek(false));
    controls.append(el('label','Temporada'),sea,el('label','Semana'),wk,sync,open,close);
    target.append(controls,el('p','Para abrir un partido hacen falta probabilidades verificadas. Una jornada cerrada manualmente permanece cerrada.'));
    async function toggleWeek(enabled){
      try{
        const count=await run(client().rpc('cam_nfl_admin_open',{p_season:Number(sea.value),p_week:Number(wk.value),p_open:enabled}));
        await hydrate();st('camNflStatus',count+' partido(s) actualizados.');
      }catch(error){st('camNflStatus',error.message);}
    }
  }
  function setup(){
    $('camNflSave')?.addEventListener('click',persist);
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
    const observer=new MutationObserver(()=>{
      const visible=document.body.classList.contains('ae-is-nfl');
      root.hidden=!visible;
      if(visible&&!loaded&&!loading)hydrate();
    });
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    root.hidden=!document.body.classList.contains('ae-is-nfl');
    if(!root.hidden)hydrate();
  }
  async function showProfile(event){
    if(!profile)return;
    const targetId=event.detail?.userId;
    if(!targetId)return;
    profile.hidden=false;profile.replaceChildren(el('h3','Mi Quiniela NFL'),el('p','Cargando estadísticas…'));
    try{
      await loadSession();
      const c=client(),s=seasons()[0]||seasonGuess();
      const summary=await run(c.rpc('cam_nfl_profile_summary',{p_user_id:targetId,p_season:s}));
      if(!profile.isConnected)return;
      const value=Array.isArray(summary)?summary[0]:summary;
      profile.replaceChildren(el('h3','Mi Quiniela NFL'));
      const stats=el('div',null,'cam-nfl-profile-stats');
      for(const [label,v] of [
        ['Temporada',s],['Puntos',value?.points||0],['Aciertos',value?.hits||0],
        ['Efectividad',(value?.accuracy||0)+' %'],['Posición',value?.rank_position||'—'],
        ['Última jornada',value?.last_week?('Semana '+value.last_week+' · '+value.last_week_points+' pts'):'Pendiente']
      ]){const k=el('div');k.append(el('span',label),el('strong',v));stats.append(k);}
      profile.append(stats);
      if(user?.id===targetId){
        const rows=await run(c.from('cam_nfl_picks').select('game_id,team_id,awarded_points,settled_at').eq('user_id',targetId).limit(500));
        const names=new Map(games.map(g=>[g.id,g]));
        const history=(rows||[]).map(p=>({...p,game:names.get(p.game_id)})).filter(x=>x.game).sort((a,b)=>Date.parse(b.game.kickoff)-Date.parse(a.game.kickoff));
        const details=el('details',null,'cam-nfl-profile-history');details.append(el('summary','Ver mis pronósticos anteriores'));
        for(const p of history.slice(0,40))details.append(el('p','Jornada '+p.game.week+' · '+(teams.get(p.team_id)?.name||p.team_id)+' · '+p.awarded_points+' pts'));
        if(!history.length)details.append(el('p','Aún no hay pronósticos guardados.'));
        profile.append(details);
      }
    }catch(error){profile.replaceChildren(el('h3','Mi Quiniela NFL'),el('p','Datos no disponibles: '+error.message));}
  }
  window.addEventListener('cam:nfl-profile',showProfile);
  document.addEventListener('DOMContentLoaded',setup);
})();
