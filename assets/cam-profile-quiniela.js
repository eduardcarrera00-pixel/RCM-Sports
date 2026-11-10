/* CAM SPORTS · Jornadas personales. Solo consulta al abrir «Mi grupo» del
   perfil propio (desde el 4 nov «Mis jornadas» va al final de esa pestaña).
   Las tablas conservan RLS de propietario; nunca se leen picks de otro perfil.
   La consulta incluye el partido y sus equipos, y pagina todo el historial. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const root=$('camProfileQuiniela');
  if(!root)return;
  const LEAGUES={laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League'};
  const LABELS={nfl:'NFL',football:'Fútbol'};
  const PAGE=500;
  const state={userId:null,tab:null,sport:'nfl',revision:0,data:{},pending:{},errors:{},filters:{}};
  const el=(tag,text,cls)=>{
    const n=document.createElement(tag);
    if(text!=null)n.textContent=String(text);
    if(cls)n.className=cls;
    return n;
  };
  function button(text,action){
    const n=el('button',text,'cam-qh-button');n.type='button';n.addEventListener('click',action);return n;
  }
  function client(){try{return typeof db!=='undefined'?db:window.db;}catch{return null;}}
  function projection(sport){
    const football=sport==='football',table=football?'cam_football_teams':'nfl_teams';
    return 'game_id,'+(football?'pick':'team_id')+',awarded_points,settled_at,game:cam_'+sport+'_games('+[
      'id','season',football?'competition,matchday,outcome':'week,winner_id','kickoff','status',
      'home_id','away_id','home_score','away_score',
      'home:'+table+'!home_id(name,logo)','away:'+table+'!away_id(name,logo)'
    ].join(',')+')';
  }
  async function load(sport){
    if(state.pending[sport])return state.pending[sport];
    const finishEntrance=window.camPageLoader?.begin?.();
    const revision=state.revision,userId=state.userId;
    const task=(async()=>{
      await Promise.resolve(); // Registrar la petición antes de cualquier error síncrono.
      const rows=[];
      try{
        const c=client();if(!c)throw Error('No se pudo iniciar la conexión.');
        for(let offset=0;;offset+=PAGE){
          const result=await c.from('cam_'+sport+'_picks').select(projection(sport))
            .eq('user_id',userId).order('game_id',{ascending:false}).range(offset,offset+PAGE-1);
          if(revision!==state.revision||userId!==state.userId)return;
          if(result.error)throw Error(result.error.message||'No se pudo cargar el historial.');
          const page=result.data||[];
          if(page.some(row=>!row.game))throw Error('No se pudieron cargar los partidos del historial.');
          rows.push(...page);
          if(page.length<PAGE)break;
        }
        state.data[sport]=rows;
        delete state.errors[sport];
      }catch(error){
        if(revision===state.revision)state.errors[sport]=error.message;
      }finally{
        if(revision===state.revision){delete state.pending[sport];paint();}
        finishEntrance?.();
      }
    })();
    state.pending[sport]=task;
    return task;
  }
  const roundOf=game=>Number(game.week??game.matchday);
  const date=value=>new Date(value).toLocaleDateString('es',{timeZone:'America/Toronto',day:'numeric',month:'short'});
  const clock=value=>new Date(value).toLocaleString('es',{timeZone:'America/Toronto',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  function roundLabel(round,rows){
    if(state.sport==='nfl')return ({19:'Playoffs · Wild Card',20:'Playoffs · Divisional',21:'Playoffs · Conferencias',22:'Super Bowl'})[round]||'Jornada '+round;
    const dates=rows.filter(row=>roundOf(row.game)===round).map(row=>row.game.kickoff).sort();
    const first=date(dates[0]),last=date(dates[dates.length-1]);
    return 'Jornada · '+first+(first===last?'':'–'+last);
  }
  function filter(id,label,values,value,onChange){
    const field=el('label',null,'cam-qh-filter');
    const select=el('select');select.id=id;
    for(const [key,text] of values){const option=el('option',text);option.value=String(key);select.append(option);}
    select.value=String(value);
    select.addEventListener('change',()=>{onChange(select.value);paint();$(id)?.focus({preventScroll:true});});
    field.append(el('span',label),select);return field;
  }
  function outcome(row){
    const g=row.game;
    if(g.status==='cancelled'||g.status==='tie')return {tone:'void',text:'Anulado · 0 pts'};
    if(g.status==='final'&&row.settled_at&&(state.sport==='nfl'?g.winner_id:g.outcome)){
      const hit=state.sport==='nfl'?row.team_id===g.winner_id:row.pick===g.outcome;
      const points=Number(row.awarded_points||0);
      return {tone:hit?'won':'lost',text:(hit?'Acertado · ':'Fallado · ')+(points>0?'+':points<0?'−':'')+Math.abs(points)+' pts'};
    }
    return {tone:'pending',text:g.status==='live'?'En vivo':g.status==='postponed'?'Pospuesto':g.status==='final'?'Puntuación pendiente':Date.parse(g.kickoff)<=Date.now()?'Pendiente de resultado':'Pronóstico guardado'};
  }
  function card(row){
    const g=row.game,result=outcome(row),n=el('li',null,'cam-qh-game is-'+result.tone);
    const header=el('div',null,'cam-qh-game-head');
    const time=el('time',clock(g.kickoff));time.dateTime=g.kickoff;
    header.append(time,el('strong',result.text,'cam-qh-state'));n.append(header);
    for(const [side,fallback] of [['home',g.home_id],['away',g.away_id]]){
      const team=g[side]||{},line=el('div',null,'cam-qh-team');
      if(team.logo){const img=el('img');img.src=team.logo;img.alt='';img.width=28;img.height=28;img.loading='lazy';img.addEventListener('error',()=>img.remove());line.append(img);}
      line.append(el('span',team.name||fallback),el('b',g[side+'_score']??'—'));n.append(line);
    }
    const selected=state.sport==='nfl'?(row.team_id===g.home_id?'home':'away'):row.pick;
    n.append(el('p','Tu pronóstico: '+(selected==='draw'?'Empate':g[selected]?.name||g[selected+'_id']),'cam-qh-choice'));
    return n;
  }
  function paint(){
    root.hidden=state.tab!=='party'||!state.userId;
    if(root.hidden)return;
    root.replaceChildren();
    root.append(el('h3','Mis jornadas'),el('p','Tus pronósticos guardados y sus resultados. Horarios del Este · America/Toronto.','cam-qh-intro'));
    const sports=el('div',null,'cam-qh-sports');sports.setAttribute('role','group');sports.setAttribute('aria-label','Deporte de la quiniela');
    for(const sport of ['nfl','football']){
      const b=button(LABELS[sport],()=>{state.sport=sport;paint();ensure();});
      b.setAttribute('aria-pressed',String(state.sport===sport));b.dataset.sport=sport;sports.append(b);
    }
    root.append(sports);
    const rows=state.data[state.sport];
    if(!rows){
      const error=state.errors[state.sport];
      const status=el('p',error?'No pudimos cargar tus jornadas: '+error:'Cargando tus jornadas…','cam-qh-message');status.setAttribute('role','status');root.append(status);
      if(error)root.append(button('Reintentar',()=>{delete state.errors[state.sport];paint();load(state.sport);}));
      return;
    }
    if(!rows.length){
      root.append(el('p','Aún no has guardado pronósticos de '+LABELS[state.sport]+'.','cam-qh-message'),button('Jugar la quiniela ›',()=>window.camGoQuiniela?.(state.sport)));return;
    }
    const f=state.filters[state.sport]||(state.filters[state.sport]={});
    const filters=el('div',null,'cam-qh-filters');
    let scoped=rows;
    if(state.sport==='football'){
      const leagues=Object.entries(LEAGUES).filter(([id])=>rows.some(row=>row.game.competition===id));
      if(!leagues.some(([id])=>id===f.league))f.league=leagues[0][0];
      filters.append(filter('camQhLeague','Competición',leagues,f.league,value=>{f.league=value;f.season=null;f.round=null;}));
      scoped=rows.filter(row=>row.game.competition===f.league);
    }
    const seasons=[...new Set(scoped.map(row=>Number(row.game.season)))].sort((a,b)=>b-a);
    if(!seasons.includes(f.season))f.season=seasons[0];
    filters.append(filter('camQhSeason','Temporada',seasons.map(s=>[s,state.sport==='nfl'||f.league==='ligamx'?s:s+'–'+String(s+1).slice(-2)]),f.season,value=>{f.season=Number(value);f.round=null;}));
    scoped=scoped.filter(row=>Number(row.game.season)===f.season);
    const rounds=[...new Set(scoped.map(row=>roundOf(row.game)))].sort((a,b)=>b-a);
    if(!rounds.includes(f.round))f.round=rounds[0];
    filters.append(filter('camQhRound','Jornada',rounds.map(r=>[r,roundLabel(r,scoped)]),f.round,value=>{f.round=Number(value);}));
    root.append(filters);
    const selected=scoped.filter(row=>roundOf(row.game)===f.round).sort((a,b)=>Date.parse(a.game.kickoff)-Date.parse(b.game.kickoff));
    const settled=selected.filter(row=>['won','lost'].includes(outcome(row).tone));
    const hits=settled.filter(row=>outcome(row).tone==='won').length;
    const points=settled.reduce((total,row)=>total+Number(row.awarded_points||0),0);
    const summary=el('p',points+' pts · '+hits+'/'+settled.length+' aciertos · '+selected.length+' '+(selected.length===1?'pronóstico':'pronósticos'),'cam-qh-summary');summary.setAttribute('role','status');
    const list=el('ol',null,'cam-qh-games');list.setAttribute('aria-label','Pronósticos de '+roundLabel(f.round,scoped));
    for(const row of selected)list.append(card(row));
    root.append(summary,list,button('Jugar la jornada actual ›',()=>window.camGoQuiniela?.(state.sport)));
  }
  function ensure(){if(state.userId&&state.tab==='party'&&!state.data[state.sport]&&!state.errors[state.sport])void load(state.sport);}
  document.addEventListener('cam:profile-view',event=>{
    const d=event.detail||{},userId=d.own?d.userId:null;
    if(userId!==state.userId){state.revision++;state.data={};state.pending={};state.errors={};state.filters={};}
    state.userId=userId;state.tab=d.tab;
    if(!userId){root.replaceChildren();root.hidden=true;return;}
    paint();ensure();
  });
  // Escape y los cierres nativos también invalidan respuestas y cachés privadas.
  $('aeProfileDialog')?.addEventListener('close',()=>{
    state.revision++;state.userId=null;state.tab=null;
    state.data={};state.pending={};state.errors={};state.filters={};
    root.replaceChildren();root.hidden=true;
  });
  for(const sport of ['nfl','football'])document.addEventListener('cam:'+sport+'-picks-updated',()=>{
    state.revision++;state.pending={};delete state.data[sport];delete state.errors[sport];paint();ensure();
  });
  window.camOpenQuinielaHistory=sport=>{
    state.sport=sport==='football'?'football':'nfl';
    // Con el perfil propio abierto, Mi grupo y abajo hasta las jornadas.
    if(state.userId&&window.camProfileShowJornadas?.()){paint();ensure();return;}
    return window.openAeProfile?.('quiniela');
  };
})();
