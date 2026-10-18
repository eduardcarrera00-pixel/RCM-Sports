/* AE SPORTS · Portada: tablas Top 10 Genios y Anoetos (fuera del podio).
   Puntos de Takes combinados NFL + Fútbol, revisados por administradores. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const el=(tag,text,className)=>{
    const n=document.createElement(tag);
    if(text!==undefined&&text!==null)n.textContent=String(text);
    if(className)n.className=className;
    return n;
  };
  let period='all',loading=false,pending=false,sequence=0,lastLoad=0;

  function empty(list,text){
    if(!list)return;
    const row=el('tr');
    const cell=el('td',text,'ae-points-table-empty');
    cell.colSpan=4;
    row.append(cell);
    list.replaceChildren(row);
  }
  function movementBadge(m){
    const change=el('span',null,'ae-rank-change');
    const previous=m?.previous_position;
    const moved=Number(m?.movement);
    if(!m?.baseline_exists){
      change.dataset.move='pending';change.textContent='—';
      change.setAttribute('aria-label','Aún no hay comparación anterior');
    }else if(previous==null){
      change.dataset.move='new';change.textContent='Nuevo';
      change.setAttribute('aria-label','Nuevo en el ranking');
    }else if(moved>0){
      change.dataset.move='up';change.textContent='▲ '+moved;
      change.setAttribute('aria-label','Subió '+moved+' '+(moved===1?'posición':'posiciones'));
    }else if(moved<0){
      change.dataset.move='down';change.textContent='▼ '+Math.abs(moved);
      change.setAttribute('aria-label','Bajó '+Math.abs(moved)+' '+(moved===-1?'posición':'posiciones'));
    }else{
      change.dataset.move='same';change.textContent='–';
      change.setAttribute('aria-label','Sin cambios de posición');
    }
    change.title=change.getAttribute('aria-label');
    return change;
  }
  // Clasificaciones deportivas: posición, participante, acierto y puntos.
  // El mejor Take es un detalle de rendimiento, no otra tarjeta de comentario.
  function accurateRate(r){
    const won=Number(r.correct_takes),resolved=Number(r.total_resolved);
    if(!Number.isFinite(won)||!Number.isFinite(resolved)||resolved<=0)return '—';
    return (100*won/resolved).toLocaleString('es-ES',{maximumFractionDigits:1})+'%';
  }
  function leader(r,side,movement){
    const row=el('tr',null,'ae-points-table-row ae-sports-standing-row');
    row.dataset.side=side;
    if(Number(r.rank_number)===1)row.classList.add('ae-sports-standing-first');

    const place=el('td',null,'ae-sports-stand-pos');
    place.append(el('strong',String(r.rank_number||'').padStart(2,'0'),'ae-points-rank'));
    place.append(movementBadge(movement));

    const player=el('td',null,'ae-sports-stand-player');
    const user=el('button',null,'ae-points-user');
    user.type='button';
    const nickname=(r.username||'Aficionado').replace(/^@+/,'');
    const avatar=el('span',nickname.slice(0,1).toUpperCase()||'A','ae-points-avatar');
    avatar.setAttribute('aria-hidden','true');
    const name=el('span','@'+nickname,'ae-sports-stand-name');
    user.append(avatar,name);
    user.setAttribute('aria-label','Ver perfil y Takes de '+nickname);
    user.addEventListener('click',()=>window.openAePublicProfile?.(r.user_id));
    player.append(user);

    const best=el('div',null,'ae-sports-stand-best');
    if(r.best_take_id&&r.best_take_title){
      best.append(el('span','MEJOR TAKE','ae-sports-stand-best-label'));
      const title=el('span',r.best_take_title,'ae-sports-stand-best-title');
      title.title=r.best_take_title;
      best.append(title);
      best.append(el('small','+'+Number(r.best_take_points||0).toLocaleString('es-ES',{maximumFractionDigits:2})+' pts','ae-sports-stand-best-score'));
    }else{
      best.append(el('span','Aún sin Take acertado','ae-sports-stand-no-best'));
    }
    player.append(best);

    const accuracy=el('td',null,'ae-sports-stand-accuracy');
    const resolved=Number(r.total_resolved||0),correct=Number(r.correct_takes||0);
    const rate=el('strong',accurateRate(r),'ae-sports-stand-rate');
    rate.title=resolved>0?correct+' aciertos entre '+resolved+' Takes evaluados':'Todavía sin Takes evaluados';
    accuracy.append(rate,el('small',resolved>0?correct+'/'+resolved+' Takes':'Sin evaluar','ae-sports-stand-resolved'));

    const score=el('td',null,'ae-sports-stand-points');
    const amount=Number(r.points||0);
    score.append(el('strong',amount.toLocaleString('es-ES',{maximumFractionDigits:2}),'ae-points-total'));
    score.append(el('small','PTS','ae-sports-stand-points-label'));
    row.append(place,player,accuracy,score);
    return row;
  }
  function paint(data,movements){
    const byUser=new Map((Array.isArray(movements)?movements:[]).map(m=>[m.user_id,m]));
    const best=$('aeTopTakesPositive'),worst=$('aeTopTakesNegative');
    const rows=Array.isArray(data)?data:[];
    const top=rows.filter(x=>x?.side==='genios').sort((a,b)=>Number(a.rank_number)-Number(b.rank_number)).slice(0,10);
    const tail=rows.filter(x=>x?.side==='anoetos').sort((a,b)=>Number(a.rank_number)-Number(b.rank_number)).slice(0,10);
    if(top.length)best.replaceChildren(...top.map(r=>leader(r,'genios',byUser.get(r.user_id))));
    else empty(best,'Todavía no hay Takes puntuados en este periodo.');
    if(tail.length)worst.replaceChildren(...tail.map(r=>leader(r,'anoetos',byUser.get(r.user_id))));
    else empty(worst,'No hay participantes puntuados fuera del podio todavía.');
    const status=$('aeTopTakesStatus');
    if(status)status.textContent='';
  }
  function paintTabs(){
    const panel=$('aeHomeTopTakes');
    panel?.querySelectorAll('[data-home-take-period]').forEach(btn=>{
      const pressed=btn.dataset.homeTakePeriod===period;
      btn.setAttribute('aria-pressed',String(pressed));
    });
  }
  async function refresh(force=false){
    if(!$('aeHomeTopTakes')||typeof db==='undefined'||!db)return;
    if(typeof currentCategory!=='undefined'&&currentCategory!=='Todos')return;
    if(loading){pending=true;return;}
    if(!force&&Date.now()-lastLoad<30000)return;
    const request=++sequence,selected=period;
    loading=true;
    try{
      const [result,movementResult]=await Promise.all([
        db.rpc('ae_home_take_point_extremes',{p_period:selected}),
        db.rpc('ae_home_take_rank_movements',{p_period:selected})
      ]);
      if(result.error)throw result.error;
      if(movementResult.error)throw movementResult.error;
      if(sequence!==request||selected!==period)return;
      paint(result.data||[],movementResult.data||[]);
      lastLoad=Date.now();
    }catch(error){
      if(sequence===request){
        empty($('aeTopTakesPositive'),'No se pudo cargar la clasificación por puntos.');
        empty($('aeTopTakesNegative'),'No se pudo cargar la cola de la clasificación.');
        const status=$('aeTopTakesStatus');
        if(status)status.textContent='No se pudo cargar la clasificación. Actualiza para volver a intentarlo.';
      }
    }finally{
      loading=false;
      if(pending){pending=false;void refresh(true);}
    }
  }
  window.refreshAeHomeTopTakes=refresh;
  document.addEventListener('DOMContentLoaded',()=>{
    paintTabs();
    $('aeHomeTopTakes')?.querySelectorAll('[data-home-take-period]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const next=btn.dataset.homeTakePeriod;
        if(!['month','all'].includes(next)||next===period)return;
        period=next;
        paintTabs();
        void refresh(true);
      });
    });
    void refresh(true);
    $('aeHomeTakePublish')?.addEventListener('click',()=>window.aeOpenTakeComposer?.());
  });
  document.addEventListener('ae:takes-updated',()=>void refresh(true));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
})();