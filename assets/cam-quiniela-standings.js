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
  function mountLeague(target){
    window.CamLeagues?.mountEntry(target.closest('.cam-nfl-standings')||target,
      target.id.includes('Football')?'football':'nfl');
  }
  function enhance(target,{rows,visibleRows,userId}){
    const table=target.querySelector('table');if(!table)return;
    const leader=rows[0],mine=rows.find(row=>row.user_id===userId);
    const gap=line=>Math.max(0,number(leader?.points)-number(line.points));
    const overview=el('div',null,'cam-q-overview');
    overview.append(el('span',format(rows.length)+(rows.length===1?' participante':' participantes'),'cam-q-count'));
    if(mine){
      const message=number(mine.rank_position)===1?'Lideras la clasificación.'
        :gap(mine)===0?'Empatado a puntos con el líder.'
        :'Estás a '+format(gap(mine))+' puntos del líder.';
      const chase=el('span','Tu puesto #'+format(mine.rank_position),'cam-q-chase');
      chase.title=message;chase.setAttribute('aria-label',chase.textContent+'. '+message);
      overview.append(chase);
    }
    target.prepend(overview);
    const caption=document.getElementById(target.id+'Caption');
    const month=caption?.textContent.match(/(\d{4})-(\d{2})$/);
    if(month)caption.textContent=new Intl.DateTimeFormat('es',{month:'long',year:'numeric',timeZone:'UTC'})
      .format(new Date(Date.UTC(Number(month[1]),Number(month[2])-1,15)));
    else if(caption?.textContent.startsWith('Histórico'))caption.textContent='Todas las temporadas';
    const board=el('ol',null,'cam-q-board');
    board.setAttribute('aria-label','Clasificación de la quiniela');
    board.setAttribute('role','list');
    const rowNodes=[...table.querySelectorAll('tbody > tr')];
    rowNodes.forEach((row,index)=>{
      const line=visibleRows[index];if(!line)return;
      const own=line.user_id===userId;
      const card=el('li',null,'cam-q-card'+(own?' cam-q-own':''));
      card.dataset.rank=String(line.rank_position);card.value=number(line.rank_position);
      const head=el('div',null,'cam-q-card-head');
      const badge=el('span',format(line.rank_position),'cam-q-position');
      badge.setAttribute('aria-label','Puesto '+format(line.rank_position));
      if(number(line.rank_position)<=3)badge.title=['Primer puesto','Segundo puesto','Tercer puesto'][number(line.rank_position)-1];
      const identity=row.querySelector('td:nth-child(2) button');
      identity.classList.add('cam-q-identity');
      identity.title='Ver perfil de @'+line.username;
      const initial=el('span',String(line.username||'A').replace(/^@/,'').charAt(0).toLocaleUpperCase('es'),'cam-q-avatar');
      initial.setAttribute('aria-hidden','true');
      const name=el('span',null,'cam-q-name');
      name.append(el('span','@'+line.username,'cam-q-username'));
      if(own)name.append(el('span','Tú','cam-q-you'));
      identity.replaceChildren(initial,name);
      window.CamLeagues?.markAuthor(identity,line.user_id,target.id.includes('Football')?'football':'nfl');
      const points=el('div',null,'cam-q-points');
      points.dataset.tone=number(line.points)<0?'negative':number(line.points)>0?'positive':'neutral';
      points.append(el('strong',(number(line.points)>0?'+':'')+format(line.points)),el('span','pts'));
      points.setAttribute('aria-label',format(line.points)+(Math.abs(number(line.points))===1?' punto':' puntos'));
      head.append(badge,identity,points);card.append(head);
      const metrics=el('dl',null,'cam-q-metrics');
      const metric=(label,value,kind)=>{
        const cell=el('div');cell.dataset.kind=kind;
        cell.append(el('dt',label),el('dd',value));metrics.append(cell);
      };
      metric('Aciertos',format(line.hits),'hits');
      metric('Fallos',format(Math.max(0,number(line.resolved)-number(line.hits))),'misses');
      metric('Efectividad',format(line.accuracy)+' %','accuracy');
      card.append(metrics);
      const details=row.querySelector('details');
      details.querySelector('summary').textContent='Ver pronósticos';
      const stats=el('dl',null,'cam-q-stats');
      const stat=(label,value)=>{
        const pair=el('div');pair.append(el('dt',label));
        const output=el('dd',value);pair.append(output);stats.append(pair);return output;
      };
      stat('Resueltos',format(line.resolved));
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
      // Move the existing controls so profile clicks and lazy result loading stay intact.
      card.append(details);board.append(card);
    });
    table.replaceWith(board);
    mountLeague(target);
  }
  function empty(target,onPlay){
    const card=el('div',null,'cam-q-race cam-q-empty');
    card.append(el('strong','Aún no hay clasificación','cam-q-race-title'),
      el('p','Aparecerá cuando terminen los primeros partidos.','cam-q-race-meta'));
    const play=el('button','Ir a la jornada','cam-nfl-action');play.type='button';
    play.addEventListener('click',onPlay);card.append(play);target.replaceChildren(card);
    mountLeague(target);
  }
  window.CamQuinielaStandings=Object.freeze({enhance,streak,empty});
})();
