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
    const originalRows=[...table.querySelectorAll('tbody > tr')];
    const board=el('table',null,'cam-nfl-table cam-q-board cam-q-league');
    board.setAttribute('aria-label','Clasificación de la quiniela');
    const thead=el('thead'),header=el('tr');
    for(const [text,title,kind] of [
      ['#','Posición','position'],['Usuario','Usuario','user'],
      ['PJ','Pronósticos resueltos','played'],['A','Aciertos','hits'],
      ['F','Fallos','misses'],['%','Porcentaje de acierto','accuracy'],
      ['Pts','Puntos','points'],['','Estadísticas','expand']
    ]){
      const th=el('th',text);th.scope='col';th.dataset.kind=kind;th.title=title;
      th.setAttribute('aria-label',title);header.append(th);
    }
    thead.append(header);board.append(thead);
    const tbody=el('tbody');board.append(tbody);
    originalRows.forEach((row,index)=>{
      const line=visibleRows[index];if(!line)return;
      const own=line.user_id===userId;
      const standing=el('tr',null,'cam-q-league-row'+(own?' cam-q-own':''));
      standing.dataset.rank=String(line.rank_position);
      const cell=(value,kind)=>{const td=el('td',value);td.dataset.kind=kind;standing.append(td);return td;};
      const badge=el('span',format(line.rank_position),'cam-q-position');
      badge.setAttribute('aria-label','Puesto '+format(line.rank_position));
      if(number(line.rank_position)<=3)badge.title=['Primer puesto','Segundo puesto','Tercer puesto'][number(line.rank_position)-1];
      cell(null,'position').append(badge);
      const identity=row.querySelector('td:nth-child(2) button');
      identity.classList.add('cam-q-identity');
      identity.title='Ver perfil de @'+line.username;
      const initial=el('span',String(line.username||'A').replace(/^@/,'').charAt(0).toLocaleUpperCase('es'),'cam-q-avatar');
      initial.setAttribute('aria-hidden','true');
      // Foto = escudo de su rango (cam-leagues.js).
      initial.dataset.rankFace=String(line.user_id||'');window.CamLeagues?.avatar?.(initial,line.user_id);
      const name=el('span',null,'cam-q-name');
      name.append(el('span','@'+line.username,'cam-q-username'));
      if(own)name.append(el('span','Tú','cam-q-you'));
      identity.replaceChildren(initial,name);
      window.CamLeagues?.markAuthor(identity,line.user_id,target.id.includes('Football')?'football':'nfl');
      cell(null,'user').append(identity);
      cell(format(line.resolved),'played');
      cell(format(line.hits),'hits');
      cell(format(Math.max(0,number(line.resolved)-number(line.hits))),'misses');
      cell(format(line.accuracy),'accuracy').setAttribute('aria-label',format(line.accuracy)+' % de acierto');
      const points=cell(null,'points');points.className='cam-q-points';
      points.dataset.tone=number(line.points)<0?'negative':number(line.points)>0?'positive':'neutral';
      points.append(el('strong',format(line.points)));
      points.setAttribute('aria-label',format(line.points)+(Math.abs(number(line.points))===1?' punto':' puntos'));
      const details=row.querySelector('details');
      const panelRow=el('tr',null,'cam-q-detail-row');
      panelRow.hidden=true;panelRow.id=target.id+'Detail'+index;
      // La ficha ocupa solo las columnas visibles: en el teléfono se ocultan % (y PJ
      // en pantallas mínimas) y un colspan mayor creaba una columna vacía que
      // estrechaba la tabla y cortaba los nombres.
      const panel=el('td');panel.colSpan=8;panelRow.append(panel);panel.append(details);
      const expand=el('button',null,'cam-q-expand');expand.type='button';
      const arrow=el('span','⌄');arrow.setAttribute('aria-hidden','true');expand.append(arrow);
      expand.setAttribute('aria-label','Ver estadísticas de @'+line.username);
      expand.setAttribute('aria-controls',panelRow.id);expand.setAttribute('aria-expanded','false');
      const sync=()=>{
        if(details.open)fitPanels(board);
        panelRow.hidden=!details.open;expand.setAttribute('aria-expanded',String(details.open));
      };
      expand.addEventListener('click',()=>{details.open=!details.open;sync();});
      details.addEventListener('toggle',sync);
      cell(null,'expand').append(expand);
      standing.addEventListener('click',event=>{if(!event.target.closest('button'))expand.click();});
      details.querySelector('summary').textContent='Estadísticas';
      // Ficha corta: PJ, aciertos, fallos y puntos ya están en la fila; aquí solo
      // tres cifras en una línea y los últimos resultados (sin los partidos elegidos).
      const stats=el('dl',null,'cam-q-stats');
      const stat=(label,value,title)=>{
        const pair=el('div');const term=el('dt',label);if(title)term.title=title;pair.append(term);
        const output=el('dd',value);pair.append(output);stats.append(pair);return output;
      };
      stat('Efectividad',format(line.accuracy)+' %');
      stat('Al líder',number(line.rank_position)===1?'Líder':format(gap(line))+' pts','Distancia al líder');
      const current=stat('Racha','Consultando…','Racha de aciertos');
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
          form.append(el('span','Últimos resultados','cam-q-form-label'));
          for(const item of value.recent){
            const mark=el('span',item.result==='correct'?'✓':'×','cam-q-form-result');
            mark.dataset.result=item.result;
            mark.setAttribute('aria-label',item.result==='correct'?'Acierto':'Fallo');
            form.append(mark);
          }
        }
      });
      tbody.append(standing,panelRow);
    });
    const wrap=el('div',null,'cam-q-table-wrap');wrap.append(board);
    const legend=el('p','PJ: resueltos · A: aciertos · F: fallos','cam-q-legend');
    table.replaceWith(wrap,legend);
    if(!fitting){
      fitting=true;
      let frame=0;
      window.addEventListener('resize',()=>{
        cancelAnimationFrame(frame);
        frame=requestAnimationFrame(()=>document.querySelectorAll('table.cam-q-board').forEach(fitPanels));
      },{passive:true});
    }
    mountLeague(target);
  }
  let fitting=false;
  function fitPanels(board){
    const visible=[...board.querySelectorAll('thead th')]
      .filter(th=>getComputedStyle(th).display!=='none').length||8;
    board.querySelectorAll('.cam-q-detail-row > td').forEach(td=>{if(td.colSpan!==visible)td.colSpan=visible;});
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
