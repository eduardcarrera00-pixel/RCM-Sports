/* AE SPORTS · Take scores by difficulty (1–20, admin classifies + marks result) and separate sport/home leaderboards. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const element=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;return n;};
  const rankState={home:'month',sport:'month'};
  let sport='',reviewRequest=0;
  const rankRequest={home:0,sport:0};

  function rankRow(r,i){
    const item=element('li',null,'ae-take-ranking-row');
    item.append(element('span',String(i+1).padStart(2,'0'),'ae-take-ranking-position'));
    const author=element('button','@'+(r.username||'Aficionado'),'ae-take-ranking-author');
    author.type='button';
    author.onclick=()=>window.openAePublicProfile?.(r.user_id);
    item.append(author,element('strong',Number(r.points||0)+' pts','ae-take-ranking-points'));

    // Un único mejor Take por usuario, calculado dentro del periodo seleccionado.
    const best=element('div',null,'ae-take-ranking-best');
    if(r.best_take_id){
      const earned=Number(r.best_take_points||0);
      best.append(element('span','Mejor Take · +'+earned+' pts','ae-take-ranking-best-label'));
      best.append(element('strong',r.best_take_title||'Take acertado','ae-take-ranking-best-title'));
      if(r.best_take_excerpt)best.append(element('p',r.best_take_excerpt,'ae-take-ranking-best-excerpt'));
    }else{
      best.append(element('span','Sin Takes acertados en este periodo','ae-take-ranking-best-label'));
    }
    item.append(best);
    item.append(element('small',Number(r.correct_takes||0)+' aciertos · '+Number(r.total_resolved||0)+' resueltos','ae-take-ranking-count'));
    return item;
  }
  // Tabla semántica sólo en páginas deportivas. La portada mantiene su formato.
  function standingRow(r,i){
    const row=element('tr',null,'ae-take-standing-row');
    const position=element('td',null,'ae-take-standing-position');
    position.append(element('strong',String(i+1).padStart(2,'0')));
    const user=element('td',null,'ae-take-standing-user');
    const author=element('button','@'+(r.username||'Aficionado'),'ae-take-ranking-author');
    author.type='button';
    author.onclick=()=>window.openAePublicProfile?.(r.user_id);
    user.append(author);
    const bestName=r.best_take_id?(r.best_take_title||'Take acertado'):'Sin Takes acertados';
    const bestPoints=r.best_take_id?(' · +'+Number(r.best_take_points||0)+' pts'):'';
    user.append(element('small',bestName+bestPoints,'ae-take-standing-mobile-best'));
    const best=element('td',null,'ae-take-standing-best');
    best.append(element('strong',bestName,'ae-take-standing-best-title'));
    if(r.best_take_id)best.append(element('small','+'+Number(r.best_take_points||0)+' pts','ae-take-standing-best-score'));
    const record=element('td',null,'ae-take-standing-record');
    record.append(element('span',Number(r.correct_takes||0)+' / '+Number(r.total_resolved||0)));
    const points=element('td',null,'ae-take-standing-points');
    points.append(element('strong',Number(r.points||0).toLocaleString('es-ES',{maximumFractionDigits:2})+' pts'));
    row.append(position,user,best,record,points);
    return row;
  }
  function standingMessage(message){
    const tr=element('tr',null,'ae-take-standing-message');
    const cell=element('td',message);cell.colSpan=5;tr.append(cell);
    return tr;
  }

  // The same real, confirmed-result statistics power NFL and Fútbol.
  // A missing denominator must never be presented as a 0% performance.
  function takeAccuracy(record){
    const won=Number(record.correct_takes),resolved=Number(record.total_resolved);
    if(!Number.isFinite(won)||!Number.isFinite(resolved)||resolved<=0)return '—';
    return (100*won/resolved).toLocaleString('es-ES',{maximumFractionDigits:1})+'%';
  }
  // Comparar sólo posiciones previamente vistas del mismo deporte y periodo.
  // La primera visita no inventa ascensos ni descensos.
  const previousPositions=new Map();
  function sportStandingRow(r,i,rookie,previous){
    const row=element('tr',null,'ae-nfl-ranking-row');
    const position=element('td',null,'ae-nfl-ranking-place');
    position.append(element('strong',String(i+1).padStart(2,'0')));
    const key=String(r.user_id||r.username||'');
    const last=key?previous.get(key):undefined;
    if(Number.isInteger(last)){
      const difference=last-(i+1);
      const change=element('span',difference>0?'▲'+difference:difference<0?'▼'+Math.abs(difference):'—',
        'ae-esport-rank-change '+(difference>0?'is-up':difference<0?'is-down':'is-flat'));
      change.title=difference>0?'Subió '+difference+' puestos':difference<0?'Bajó '+Math.abs(difference)+' puestos':'Sin cambios';
      position.append(change);
    }else{
      const change=element('span','·','ae-esport-rank-change is-new');
      change.title='Sin comparación anterior';
      position.append(change);
    }
    const details=element('td',null,'ae-nfl-ranking-details');
    const username=element('button','@'+(r.username||'Aficionado'),'ae-nfl-ranking-user');
    username.type='button';
    username.setAttribute('aria-label','Ver perfil de '+(r.username||'Aficionado'));
    username.onclick=()=>window.openAePublicProfile?.(r.user_id);
    details.append(username);
    const value=rookie?Number(r.lost_takes||0):Number(r.points||0);
    const scoreText=rookie?(value===1?'1 fallo':value+' fallos'):
      value.toLocaleString('es-ES',{maximumFractionDigits:2})+' pts';
    const takeName=rookie?r.worst_take_title:r.best_take_title;
    const takeLabel=rookie?'Último fallo':'Mejor Take';
    // Compact NFL rankings show the accuracy immediately to the left of
    // points/fallos. Football retains its existing summary.
    const accuracy=takeAccuracy(r);
    if(sport==='nfl'){
      const mobileMetrics=element('div',null,'ae-nfl-ranking-mobile-metrics');
      mobileMetrics.append(
        element('span',accuracy,'ae-nfl-ranking-mobile-percent'),
        element('strong',scoreText,'ae-nfl-ranking-score-mobile')
      );
      details.append(mobileMetrics);
    }else{
      details.append(element('strong',scoreText,'ae-nfl-ranking-score-mobile'));
    }
    details.append(element('small',takeName?takeLabel+' · '+takeName:
      (rookie?'Sin Take fallado':'Sin Takes acertados'),'ae-nfl-ranking-take'));
    if(sport!=='nfl'){
      const record=element('small',
        accuracy+' de aciertos · '+Number(r.correct_takes||0)+' / '+Number(r.total_resolved||0)+' evaluados',
        'ae-nfl-ranking-record');
      details.append(record);
    }
    const takeCell=element('td',null,'ae-nfl-ranking-best');
    takeCell.append(element('span',takeLabel,'ae-nfl-ranking-best-label'));
    const takeTitle=element('strong',takeName||'—','ae-nfl-ranking-best-title');
    takeTitle.title=takeName||'No hay Take registrado';
    takeCell.append(takeTitle);
    const accuracyCell=element('td',null,'ae-nfl-ranking-percent');
    const percentage=element('strong',accuracy,'ae-nfl-ranking-percentage');
    percentage.title=Number(r.correct_takes||0)+' acertados de '+Number(r.total_resolved||0)+' evaluados';
    accuracyCell.append(percentage);
    const score=element('td',null,'ae-nfl-ranking-value');
    score.append(element('strong',scoreText,'ae-nfl-ranking-score'));
    row.append(position,details,takeCell,accuracyCell,score);
    return row;
  }
  function sportStandingMessage(message){
    const row=element('tr',null,'ae-nfl-ranking-message');
    const cell=element('td',message);cell.colSpan=5;row.append(cell);
    return row;
  }
  async function loadSportTwinRankings(seq,period,selectedSport){
    const best=$('aeNflSavantList'),worst=$('aeNflRookieList');
    if(!best||!worst)return;
    best.replaceChildren(sportStandingMessage('Cargando clasificación…'));
    worst.replaceChildren(sportStandingMessage('Cargando clasificación…'));
    const args={p_sport:selectedSport,p_period:period};
    // Both independent public RPCs already support NFL and Fútbol.
    const [winners,losers]=await Promise.allSettled([
      db.rpc('ae_take_result_ranking_details',args),
      db.rpc('ae_take_result_ranking_rookies',args)
    ]);
    if(seq!==rankRequest.sport||sport!==selectedSport||rankState.sport!==period)return;
    for(const [outcome,list,isRookie] of [[winners,best,false],[losers,worst,true]]){
      if(outcome.status!=='fulfilled'||outcome.value.error){
        list.replaceChildren(sportStandingMessage('No se pudo cargar la clasificación.'));
        continue;
      }
      const rows=(outcome.value.data||[]).slice(0,10);
      const empty=isRookie?
        (period==='month'?'Este mes aún no hay Takes fallados.':'Todavía no hay Takes fallados.'):
        (period==='month'?'Este mes aún no hay Takes puntuados.':'Todavía no hay Takes puntuados.');
      const snapshotKey=selectedSport+':'+period+':'+(isRookie?'rookie':'savant');
      const previous=previousPositions.get(snapshotKey)||new Map();
      list.replaceChildren(...(rows.length?
        rows.map((r,i)=>sportStandingRow(r,i,isRookie,previous)):
        [sportStandingMessage(empty)]));
      // Guardar la posición sólo tras una respuesta válida.
      previousPositions.set(snapshotKey,new Map(rows.map((r,i)=>[String(r.user_id||r.username||''),i+1])));
    }
  }
  async function loadRanking(where){
    const isHome=where==='home', list=$(isHome?'aeHomeTakeRankingList':'aeSportTakeRankingList');
    if(!list || !db || (!isHome&&!sport))return;
    const seq=++rankRequest[where], selectedSport=isHome?'all':sport,period=rankState[where];
    if(!isHome&&(selectedSport==='nfl'||selectedSport==='football')){
      await loadSportTwinRankings(seq,period,selectedSport);
      return;
    }
    list.replaceChildren(isHome ? element('li','Cargando clasificación…') : standingMessage('Cargando clasificación…'));
    try{
      const result=await db.rpc('ae_take_result_ranking_details',{p_sport:selectedSport,p_period:period});
      if(result.error)throw result.error;
      if(seq!==rankRequest[where])return;
      if(!isHome&&selectedSport!==sport)return;
      const rows=(result.data||[]).slice(0,10);
      const emptyMessage=period==='month'?'Este mes aún no hay Takes puntuados.':'Todavía no hay Takes puntuados.';
      list.replaceChildren(...(rows.length?rows.map(isHome?rankRow:standingRow):[isHome?element('li',emptyMessage,'ae-take-ranking-empty'):standingMessage(emptyMessage)]));
    }catch(e){if(seq===rankRequest[where])list.replaceChildren(isHome?element('li','No se pudo cargar la clasificación.','ae-take-ranking-empty'):standingMessage('No se pudo cargar la clasificación.'));}
  }
  /* Revisión admin: dificultad por probabilidad (motor 1–20) y resultado. */
  const TIERS=[['casi_seguro','Casi seguro · no puntúa'],['muy_probable','Muy probable · 1 pt'],['probable','Probable · 3 pts'],
    ['parejo','Parejo · 4 pts'],['sorpresa','Sorpresa · 7 pts'],['bombazo','Bombazo · 12 pts'],['locura','Locura · 17 pts'],['historica','Histórica · 20 pts']];
  const LEAGUES=[['laliga','LaLiga'],['premier','Premier League'],['ligamx','Liga MX']];
  const CONDITIONS=[['at_or_above','Ese puesto o mejor'],['exact','Exactamente ese puesto'],['at_or_below','Ese puesto o peor']];
  let outlookTeams=null;
  const seasonOf=date=>{const d=new Date(date),y=d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1;return y+'/'+String((y+1)%100).padStart(2,'0');};
  const percent=p=>{const v=Number(p)*100;return (v<1?v.toFixed(1).replace('.',','):String(Math.round(v)))+'%';};
  const status=text=>{const node=$('aeTakeReviewStatus');if(node)node.textContent=text;};
  function selectOf(name,options,value){
    const select=element('select');select.name=name;
    for(const [v,label] of options){const o=element('option',label);o.value=v;select.append(o);}
    if(value!=null)select.value=value;return select;
  }
  function field(label,control){const l=element('label',label+' ');l.append(control);return l;}
  async function loadOutlookTeams(){
    if(outlookTeams)return outlookTeams;
    const [snaps,teams]=await Promise.all([
      db.from('ae_outlook_snapshots').select('id,competition,season'),
      db.from('ae_outlook_teams').select('snapshot_id,team')
    ]);
    if(snaps.error)throw snaps.error;if(teams.error)throw teams.error;
    const bySnap=new Map((snaps.data||[]).map(s=>[s.id,s.competition+'|'+s.season]));
    const map={};
    for(const row of teams.data||[]){const key=bySnap.get(row.snapshot_id);if(!key)continue;(map[key]||=new Set()).add(row.team);}
    outlookTeams=Object.fromEntries(Object.entries(map).map(([k,v])=>[k,[...v].sort((a,b)=>a.localeCompare(b,'es'))]));
    return outlookTeams;
  }
  function describe(c){
    if(!c)return 'Sin clasificar';
    if(c.trivial)return 'Trivial ('+percent(c.probability)+'): no puntúa';
    return c.difficulty_points+' pts · probabilidad '+percent(c.probability);
  }
  function reviewEntry(t,classification,teams){
    const form=element('form',null,'ae-take-review-entry');
    let current=classification||null;
    const heading=element('div',null,'ae-take-review-heading');
    heading.append(element('strong',t.title));
    heading.append(element('span','@'+(t.author||'Aficionado')+' · '+new Date(t.created_at).toLocaleDateString('es'),'ae-take-review-meta'));
    const badge=element('span',describe(current),'ae-take-review-difficulty');badge.dataset.state=current?(current.trivial?'trivial':'ready'):'pending';
    heading.append(badge);
    form.append(heading);

    const football=t.sport!=='nfl';
    const methods=[...(football?[['table','Tabla de la liga']]:[]),['tier','Nivel de sorpresa'],['odds','Cuota de apuesta']];
    const method=selectOf('method',methods,current?.method&&methods.some(([v])=>v===current.method)?current.method:(football?'table':'tier'));
    const season=seasonOf(t.created_at);
    const league=selectOf('competition',LEAGUES,current?.competition||'laliga');
    const team=element('select');team.name='team';
    const condition=selectOf('condition',CONDITIONS,current?.condition||'at_or_above');
    const position=element('input');position.name='position';position.type='number';position.min='1';position.max='24';position.step='1';position.value=String(current?.target_position||1);
    const tier=selectOf('tier',TIERS,current?.tier||'sorpresa');
    const odds=element('input');odds.name='odds';odds.type='number';odds.step='1';odds.placeholder='+600 o -150';if(current?.american_odds)odds.value=String(current.american_odds);
    const fillTeams=()=>{
      const list=teams?.[league.value+'|'+season]||[];
      team.replaceChildren(...(list.length?list:['Sin matriz para '+season]).map(name=>{const o=element('option',name);o.value=list.length?name:'';return o;}));
      if(current?.team&&list.includes(current.team))team.value=current.team;
    };
    league.addEventListener('change',fillTeams);fillTeams();

    const difficulty=element('fieldset',null,'ae-take-review-fields ae-take-review-step');
    difficulty.append(element('legend','1 · Dificultad'));
    const tableFields=[field('Liga',league),field('Equipo',team),field('Condición',condition),field('Puesto',position)];
    const tierField=field('Nivel',tier),oddsField=field('Cuota',odds);
    const classify=element('button','Calcular dificultad');classify.type='button';classify.name='classify';
    difficulty.append(field('Método',method),...tableFields,tierField,oddsField,classify);
    const showMethod=()=>{
      for(const node of tableFields)node.hidden=method.value!=='table';
      tierField.hidden=method.value!=='tier';oddsField.hidden=method.value!=='odds';
    };
    method.addEventListener('change',showMethod);showMethod();

    const resultStep=element('fieldset',null,'ae-take-review-fields ae-take-review-step');
    resultStep.append(element('legend','2 · Resultado'));
    const result=selectOf('outcome',[['','Pendiente'],['won','Acertado'],['lost','Fallado']],t.outcome||'');
    const preview=element('span','','ae-take-review-preview');
    const save=element('button',t.outcome?'Corregir resultado':'Guardar resultado');save.type='submit';
    resultStep.append(field('Resultado',result),preview,save);
    const sync=()=>{
      const ready=Boolean(current)&&!current.trivial;
      save.disabled=!ready||!result.value;
      preview.textContent=!current?'Primero calcula la dificultad.':current.trivial?'Take trivial: no se puntúa.':
        result.value==='won'?'+'+current.difficulty_points+' pts':result.value==='lost'?'0 pts':'';
    };
    result.addEventListener('change',sync);sync();
    form.append(difficulty,resultStep);

    classify.addEventListener('click',async()=>{
      const args={p_take_id:t.id,p_method:method.value,p_rescore:Boolean(t.outcome)};
      if(method.value==='table'){
        if(!team.value){status('No hay matriz cargada para '+season+' en esa liga.');return;}
        Object.assign(args,{p_competition:league.value,p_season:season,p_team:team.value,p_condition:condition.value,p_position:Number(position.value)});
      }else if(method.value==='tier')args.p_tier=tier.value;
      else{
        const value=Number(odds.value);
        if(!Number.isInteger(value)||Math.abs(value)<100){status('Escribe una cuota americana válida (por ejemplo +600 o -150).');return;}
        args.p_american_odds=value;
      }
      classify.disabled=true;status('Calculando dificultad…');
      try{
        const response=await db.rpc('ae_classify_free_take',args);
        if(response.error)throw response.error;
        const row=Array.isArray(response.data)?response.data[0]:response.data;
        current={method:method.value,probability:row.probability,difficulty_points:row.points,trivial:row.trivial,
          competition:args.p_competition,team:args.p_team,condition:args.p_condition,target_position:args.p_position,tier:args.p_tier,american_odds:args.p_american_odds};
        badge.textContent=describe(current);badge.dataset.state=current.trivial?'trivial':'ready';
        status(t.outcome?'Dificultad recalculada; la puntuación se actualizó.':'Dificultad guardada: '+describe(current)+'.');
        sync();
        if(t.outcome){await Promise.all([loadRanking('sport'),loadRanking('home')]);document.dispatchEvent(new Event('ae:takes-updated'));}
      }catch(e){status('No se pudo calcular. '+(e.message||'Inténtalo de nuevo.'));}
      finally{classify.disabled=false;}
    });

    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(!current||current.trivial||!['won','lost'].includes(result.value))return;
      save.disabled=true;status('Guardando resultado…');
      try{
        const response=await db.rpc('ae_score_free_take_auto',{p_take_id:t.id,p_outcome:result.value});
        if(response.error)throw response.error;
        status(result.value==='won'?'Acierto guardado: +'+response.data+' pts.':'Fallo guardado.');
        await Promise.all([loadRanking('sport'),loadRanking('home'),loadReview()]);
        document.dispatchEvent(new Event('ae:takes-updated'));
      }catch(e){status('No se pudo guardar. '+(e.message||'Inténtalo de nuevo.'));save.disabled=false;}
    });
    return form;
  }
  async function loadReview(){
    const panel=$('aeTakeReview');if(!panel)return;
    const isAdmin=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
    panel.hidden=!isAdmin||!sport;
    if(panel.hidden){reviewRequest++;return;}
    const seq=++reviewRequest,selectedSport=sport;
    const list=$('aeTakeReviewList');
    list.replaceChildren(element('p','Cargando Takes…'));
    try{
      const response=await db.rpc('ae_take_review_queue',{p_sport:selectedSport});
      if(response.error)throw response.error;
      const rows=response.data||[];
      let classes=new Map(),teams={};
      if(rows.length){
        const [found,loadedTeams]=await Promise.all([
          db.from('ae_take_classifications').select('take_id,method,competition,season,team,condition,target_position,tier,american_odds,probability,difficulty_points,trivial').in('take_id',rows.map(r=>r.id)),
          loadOutlookTeams().catch(()=>({}))
        ]);
        if(found.error)throw found.error;
        classes=new Map((found.data||[]).map(c=>[c.take_id,c]));teams=loadedTeams;
      }
      if(seq!==reviewRequest||sport!==selectedSport)return;
      list.replaceChildren(...(rows.length?rows.map(r=>reviewEntry(r,classes.get(r.id),teams)):[element('p','No hay Takes para revisar.')]));
    }catch(e){if(seq===reviewRequest)list.replaceChildren(element('p','No se pudo cargar la revisión. '+(e.message||'')));}
  }
  function refresh(){
    if($('aeHomeTakeRanking')&&!$('editorialBottom')?.hidden)loadRanking('home');
    if(sport){loadRanking('sport');loadReview();}
  }
  window.aeTakeRankings={setSport(section){
    const next=section==='NFL'?'nfl':section==='Fútbol'?'football':'';
    if(next===sport)return;
    sport=next;
    if(next)$('aeSportTakeRankingTitle').textContent='Top 10 · '+(next==='nfl'?'NFL':'Fútbol');
    const twin=$('aeNflTwinRankings'),solo=$('aeSportTakeRankingSolo');
    if(twin)twin.hidden=!next;
    if(solo)solo.hidden=!!next;
    const bestHeading=$('aeNflSavantHeading'),worstHeading=$('aeNflRookieHeading');
    if(bestHeading)bestHeading.textContent=next==='football'?'Respira Fútbol':'SAVANT';
    if(worstHeading)worstHeading.textContent=next==='football'?'Vende Humos':'ROOKIE';
    const bestOverline=bestHeading?.parentElement?.querySelector('.ae-nfl-ranking-overline');
    const worstOverline=worstHeading?.parentElement?.querySelector('.ae-nfl-ranking-overline');
    if(bestOverline)bestOverline.textContent=next==='football'?'LOS MEJORES · FÚTBOL':'LOS MEJORES · ACIERTOS';
    if(worstOverline)worstOverline.textContent=next==='football'?'LOS PEORES · FÚTBOL':'LOS PEORES · FALLOS';
    const description=$('aeSportTakeRankingDescription');
    if(description)description.textContent='';
    refresh();
  },refresh};
  document.addEventListener('DOMContentLoaded',()=>{
    for(const [where,id] of [['home','aeHomeTakeRanking'],['sport','aeSportTakeRanking']]){
      $(id)?.querySelectorAll('[data-take-rank]').forEach(button=>button.addEventListener('click',()=>{
        rankState[where]=button.dataset.takeRank;
        $(id).querySelectorAll('[data-take-rank]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
        loadRanking(where);
      }));
    }
    refresh();
  });
  document.addEventListener('ae:takes-updated',refresh);
  window.addEventListener('ae:take-category-changed',refresh);
})();
