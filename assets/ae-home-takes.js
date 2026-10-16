/* AE SPORTS · Portada: Genios (tres líderes) y Anoetos (cola del ranking).
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
    if(list)list.replaceChildren(el('li',text,'ae-top-takes-empty ae-points-empty'));
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
  function leader(r,side,movement){
    const item=el('li',null,'ae-top-take ae-points-take');
    item.dataset.side=side;
    const content=el('div',null,'ae-top-take-content');
    const headline=el('div',null,'ae-points-headline');
    headline.append(el('span',String(r.rank_number||'').padStart(2,'0'),'ae-points-position'));
    const user=el('button','@'+(r.username||'Aficionado'),'ae-points-user');
    user.type='button';
    user.setAttribute('aria-label','Ver perfil y Takes de '+(r.username||'Aficionado'));
    user.addEventListener('click',()=>window.openAePublicProfile?.(r.user_id));
    headline.append(user);
    const badges=el('span',null,'ae-points-badges');
    badges.append(el('strong',Number(r.points||0)+' pts','ae-points-total'));
    badges.append(movementBadge(movement));
    headline.append(badges);
    content.append(headline);

    if(r.best_take_title){
      const best=el('div',null,'ae-points-best');
      best.append(el('span','Mejor Take · +'+Number(r.best_take_points||0)+' pts','ae-points-best-kicker'));
      best.append(el('p',r.best_take_title,'ae-points-best-title'));
      if(r.best_take_excerpt)best.append(el('p',r.best_take_excerpt,'ae-points-best-excerpt'));
      content.append(best);
    }else{
      content.append(el('p','Todavía no tiene Takes acertados en este periodo.','ae-points-best-excerpt'));
    }
    const count=Number(r.correct_takes||0)+' aciertos · '+Number(r.total_resolved||0)+' resueltos';
    content.append(el('span',count,'ae-points-count'));
    item.append(content);
    return item;
  }
  function paint(data,movements){
    const byUser=new Map((Array.isArray(movements)?movements:[]).map(m=>[m.user_id,m]));
    const best=$('aeTopTakesPositive'),worst=$('aeTopTakesNegative');
    const rows=Array.isArray(data)?data:[];
    const top=rows.filter(x=>x?.side==='genios').sort((a,b)=>Number(a.rank_number)-Number(b.rank_number)).slice(0,3);
    const tail=rows.filter(x=>x?.side==='anoetos').sort((a,b)=>Number(a.rank_number)-Number(b.rank_number)).slice(0,10);
    if(top.length)best.replaceChildren(...top.map(r=>leader(r,'genios',byUser.get(r.user_id))));
    else empty(best,'Todavía no hay Takes puntuados en este periodo.');
    if(tail.length)worst.replaceChildren(...tail.map(r=>leader(r,'anoetos',byUser.get(r.user_id))));
    else empty(worst,'No hay más participantes puntuados fuera del Top 3.');
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