/* Shared presentation for NFL and football. Scores and ranking order stay on
 * the server. Extra statistics use only the existing final-only breakdown. */
(() => {
  'use strict';
  const el=(tag,text,cls)=>{
    const node=document.createElement(tag);
    if(text!=null)node.textContent=String(text);
    if(cls)node.className=cls;
    return node;
  };
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const format=value=>number(value).toLocaleString('es');
  function streak(results,total){
    const settled=results.filter(r=>r.result==='correct'||r.result==='incorrect')
      .sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff)||String(b.id).localeCompare(String(a.id)));
    if(!settled.length)return null;
    let count=0;
    for(const item of settled){if(item.result!=='correct')break;count++;}
    return {count,partial:count===settled.length&&settled.length<number(total),recent:settled.slice(0,5)};
  }
  function enhance(target,{rows,visibleRows,userId}){
    const table=target.querySelector('table');if(!table)return;
    table.classList.add('cam-q-board');
    table.setAttribute('aria-label','Clasificación de la quiniela');
    table.querySelectorAll('th').forEach(th=>th.scope='col');
    const leader=rows[0],mine=rows.find(row=>row.user_id===userId);
    const gap=line=>Math.max(0,number(leader.points)-number(line.points));
    const race=el('div',null,'cam-q-race');
    race.append(el('span','LA CARRERA POR EL #1','cam-q-eyebrow'));
    race.append(el('strong','Cada acierto te acerca a la cima.','cam-q-race-title'));
    race.append(el('p',format(rows.length)+' participantes · Lidera @'+leader.username+' con '+format(leader.points)+' pts','cam-q-race-meta'));
    if(mine){
      const message=number(mine.rank_position)===1?'Estás en el primer puesto. ¡Defiende tu posición!'
        :gap(mine)===0?'Estás igualado a puntos con el líder. El desempate decide tu posición.'
        :'Estás a '+format(gap(mine))+' puntos del líder.';
      race.append(el('p','#'+format(mine.rank_position)+' · '+message,'cam-q-chase'));
    }else if(userId)race.append(el('p','Tu posición aparecerá cuando tengas pronósticos resueltos en este periodo.','cam-q-chase'));
    target.prepend(race);
    const queue=[];let active=0;
    const drain=()=>{
      while(active<3&&queue.length){
        const task=queue.shift();
        if(!task.details.isConnected)continue;
        active++;
        Promise.resolve().then(()=>task.details.loadQuinielaResults?.()).catch(()=>{})
          .finally(()=>{active--;drain();});
      }
    };
    const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{
      for(const entry of entries)if(entry.isIntersecting){
        observer.unobserve(entry.target);
        queue.push({details:entry.target.querySelector('details')});
      }
      drain();
    },{rootMargin:'80px'}):null;
    const rowNodes=[...table.tBodies[0].rows];
    rowNodes.forEach((row,index)=>{
      const line=visibleRows[index];if(!line)return;
      const own=line.user_id===userId;
      row.dataset.rank=String(line.rank_position);
      if(own){row.classList.add('cam-q-own');row.setAttribute('aria-label','Tu posición: '+line.rank_position);}
      const badge=el('span','#'+format(line.rank_position),'cam-q-position');
      if(number(line.rank_position)<=3)badge.title=['Primer puesto','Segundo puesto','Tercer puesto'][number(line.rank_position)-1];
      row.cells[0].replaceChildren(badge);
      const identity=row.cells[1].querySelector('button');
      const initial=el('span',String(line.username||'A').replace(/^@/,'').charAt(0).toLocaleUpperCase('es'),'cam-q-avatar');
      initial.setAttribute('aria-hidden','true');
      identity.replaceChildren(initial,el('span','@'+line.username,'cam-q-username'));
      if(own)identity.append(el('span','Tú','cam-q-you'));
      row.cells[1].insertBefore(el('span',format(line.hits)+' aciertos de '+format(line.resolved)+' · '+format(line.accuracy)+' %','cam-q-mobile-stats'),row.cells[1].querySelector('details'));
      const details=row.querySelector('details');
      details.querySelector('summary').textContent='Estadísticas y pronósticos';
      const stats=el('dl',null,'cam-q-stats');
      const stat=(label,value)=>{
        const pair=el('div');pair.append(el('dt',label));
        const output=el('dd',value);pair.append(output);stats.append(pair);return output;
      };
      stat('Aciertos / resueltos',format(line.hits)+' / '+format(line.resolved));
      stat('Porcentaje de acierto',format(line.accuracy)+' %');
      stat('Distancia al líder',format(gap(line))+' pts');
      const current=stat('Racha de aciertos','Consultando…');
      current.className='cam-q-streak';
      current.title='Aciertos consecutivos en este periodo, ordenados por inicio del partido. Los anulados no cuentan.';
      const form=el('div',null,'cam-q-form');
      details.insertBefore(stats,details.querySelector('.cam-nfl-ranking-picks'));
      details.insertBefore(form,details.querySelector('.cam-nfl-ranking-picks'));
      details.addEventListener('cam:quiniela-results',event=>{
        const value=event.detail.error?null:streak(event.detail.results,line.resolved);
        current.textContent=value?(value.partial?'≥ ':'')+format(value.count)+(value.count===1?' acierto':' aciertos'):'No disponible';
        current.dataset.positive=String(!!value?.count);
        form.replaceChildren();
        if(value){
          form.append(el('span','Últimos resultados:','cam-q-form-label'));
          for(const item of value.recent){
            const mark=el('span',item.result==='correct'?'✓':'×','cam-q-form-result');
            mark.dataset.result=item.result;
            mark.setAttribute('aria-label',item.result==='correct'?'Acierto':'Fallo');
            form.append(mark);
          }
        }
      });
      if(observer)observer.observe(row);
      else details.addEventListener('toggle',()=>{if(details.open)drain();});
    });
    // The observer must not keep removed rankings alive after a period switch.
    if(observer){
      const cleanup=new MutationObserver(()=>{
        if(!table.isConnected){observer.disconnect();cleanup.disconnect();queue.length=0;}
      });
      cleanup.observe(target,{childList:true});
    }
  }
  function empty(target,onPlay){
    const card=el('div',null,'cam-q-race cam-q-empty');
    card.append(el('span','LA CARRERA POR EL #1','cam-q-eyebrow'),
      el('strong','La carrera empieza contigo.','cam-q-race-title'),
      el('p','Todavía no hay resultados definitivos en este periodo. Guarda tus pronósticos y vuelve cuando terminen los partidos.','cam-q-race-meta'));
    const play=el('button','Ir a la jornada','cam-nfl-action');play.type='button';
    play.addEventListener('click',onPlay);card.append(play);target.replaceChildren(card);
  }
  window.CamQuinielaStandings=Object.freeze({enhance,streak,empty});
})();
