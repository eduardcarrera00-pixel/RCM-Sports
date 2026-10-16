/* AE SPORTS · Human-reviewed Take scores and separate sport/home leaderboards. */
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
  async function loadRanking(where){
    const isHome=where==='home', list=$(isHome?'aeHomeTakeRankingList':'aeSportTakeRankingList');
    if(!list || !db || (!isHome&&!sport))return;
    const seq=++rankRequest[where], selectedSport=isHome?'all':sport,period=rankState[where];
    list.replaceChildren(element('li','Cargando clasificación…'));
    try{
      const result=await db.rpc('ae_take_result_ranking_details',{p_sport:selectedSport,p_period:period});
      if(result.error)throw result.error;
      if(seq!==rankRequest[where])return;
      if(!isHome&&selectedSport!==sport)return;
      const rows=(result.data||[]).slice(0,10);
      list.replaceChildren(...(rows.length?rows.map(rankRow):[element('li',period==='month'?'Este mes aún no hay Takes puntuados.':'Todavía no hay Takes puntuados.','ae-take-ranking-empty')]));
    }catch(e){if(seq===rankRequest[where])list.replaceChildren(element('li','No se pudo cargar la clasificación.','ae-take-ranking-empty'));}
  }
  function reviewEntry(t){
    const form=element('form',null,'ae-take-review-entry');
    const heading=element('div',null,'ae-take-review-heading');
    heading.append(element('strong',t.title));
    heading.append(element('span','@'+(t.author||'Aficionado')+' · '+new Date(t.created_at).toLocaleDateString('es'),'ae-take-review-meta'));
    form.append(heading);
    const fields=element('div',null,'ae-take-review-fields');
    const resultLabel=element('label','Resultado ');
    const result=element('select');result.name='outcome';
    for(const [value,label] of [['','Pendiente'],['won','Acertado'],['lost','Fallado']]){
      const option=element('option',label);option.value=value;result.append(option);
    }
    result.value=t.outcome||'';
    const pointsLabel=element('label','Puntos ');
    const points=element('input');points.name='points';points.type='number';points.min='1';points.max='100';points.step='1';points.value=t.outcome==='won'?String(t.points):'';
    const toggle=()=>{points.disabled=result.value!=='won';if(result.value==='lost')points.value='0';else if(result.value==='won'&&Number(points.value)<1)points.value='1';};
    result.addEventListener('change',toggle);toggle();
    resultLabel.append(result);pointsLabel.append(points);
    const save=element('button',t.outcome?'Corregir':'Asignar puntos');save.type='submit';
    fields.append(resultLabel,pointsLabel,save);form.append(fields);
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const outcome=result.value,value=outcome==='lost'?0:Number(points.value);
      if(!['won','lost'].includes(outcome)||!Number.isInteger(value)||value<0||value>100||(outcome==='won'&&value<1)){
        $('aeTakeReviewStatus').textContent='Elige acertado (1–100) o fallado (0).';return;
      }
      save.disabled=true;$('aeTakeReviewStatus').textContent='Guardando puntuación…';
      try{
        const response=await db.rpc('ae_score_free_take',{p_take_id:t.id,p_outcome:outcome,p_points:value});
        if(response.error)throw response.error;
        $('aeTakeReviewStatus').textContent='Puntuación guardada.';
        await Promise.all([loadRanking('sport'),loadRanking('home'),loadReview()]);
        document.dispatchEvent(new Event('ae:takes-updated'));
      }catch(e){$('aeTakeReviewStatus').textContent='No se pudo puntuar. '+(e.message||'Inténtalo de nuevo.');save.disabled=false;}
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
      if(seq!==reviewRequest||sport!==selectedSport)return;
      const rows=response.data||[];
      list.replaceChildren(...(rows.length?rows.map(reviewEntry):[element('p','No hay Takes para revisar.')]))
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
