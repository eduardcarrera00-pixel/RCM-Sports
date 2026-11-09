/* Ranking cards preserve signed scores, aggregate counts and the real controls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const script=fs.readFileSync('assets/cam-quiniela-standings.js','utf8');
for(const prefix of ['camNfl','camFootball']){
  const w=new Window(),d=w.document;
  d.body.innerHTML=`<main id="mainContent"><div class="cam-quiniela-ranking"><section class="cam-nfl-standings"><p id="${prefix}RankingCaption">Clasificación mensual · 2026-11</p><div id="${prefix}Ranking"></div></section></div></main>`;
  let leagueMounts=0,opened=null,reads=0;
  w.CamLeagues={markAuthor(){},mountEntry(host){if(host.querySelector(':scope > .cam-league-entry'))return;leagueMounts++;const b=d.createElement('button');b.className='cam-league-entry';host.prepend(b);}};
  w.eval(script);
  const target=d.getElementById(prefix+'Ranking');
  const rows=Array.from({length:12},(_,i)=>({rank_position:i+1,user_id:'u'+i,username:i===11?'un_usuario_con_nombre_muy_largo':'usuario_'+i,points:i===11?-14:i===2?0:31-i,hits:i===11?7:12,resolved:i===11?13:14,accuracy:i===11?53.8:85.7}));
  const visibleRows=[...rows.slice(0,10),rows[11]];
  const table=d.createElement('table'),body=table.createTBody();
  const controls=[];
  for(const line of visibleRows){
    const row=body.insertRow();row.insertCell().textContent=line.rank_position;
    const cell=row.insertCell(),profile=d.createElement('button');profile.addEventListener('click',()=>{opened=line.user_id;});cell.append(profile);
    const details=d.createElement('details'),summary=d.createElement('summary'),results=d.createElement('div');
    results.className='cam-nfl-ranking-picks';details.append(summary,results);
    details.loadQuinielaResults=()=>{reads++;details.dispatchEvent(new w.CustomEvent('cam:quiniela-results',{detail:{results:[{id:'a',kickoff:'2026-11-08T20:00Z',result:'incorrect'},{id:'b',kickoff:'2026-11-09T20:00Z',result:'correct'}]}}));};
    details.addEventListener('toggle',()=>{if(details.open)details.loadQuinielaResults();});
    cell.append(details);controls.push({profile,details});
    row.insertCell().textContent=line.hits+'/'+line.resolved;row.insertCell().textContent=line.accuracy;row.insertCell().textContent=line.points;
  }
  target.append(table);
  w.CamQuinielaStandings.enhance(target,{rows,visibleRows,userId:'u11'});
  const cards=[...target.querySelectorAll('.cam-q-card')];
  assert.equal(cards.length,11,'Top 10 and the reader keep server ordering');
  assert.deepEqual(cards.map(c=>Number(c.dataset.rank)),[1,2,3,4,5,6,7,8,9,10,12]);
  assert.equal(target.querySelector('.cam-q-points strong').textContent,'+31');
  assert.equal(cards[2].querySelector('.cam-q-points strong').textContent,'0');
  const own=target.querySelector('.cam-q-own');
  assert.equal(own.querySelector('.cam-q-points strong').textContent,'-14');
  assert.equal(own.querySelector('[data-kind=hits] dd').textContent,'7');
  assert.equal(own.querySelector('[data-kind=misses] dd').textContent,'6');
  assert.equal(own.querySelector('[data-kind=accuracy] dd').textContent,'53,8 %');
  assert.equal(own.querySelector('.cam-q-you').textContent,'Tú');
  assert.equal(own.querySelector('button'),controls[10].profile,'Existing profile handler survives the new markup');
  own.querySelector('button').click();assert.equal(opened,'u11');
  assert.equal(reads,0,'Rendering cards does not fetch every participant history');
  controls[10].details.open=true;controls[10].details.dispatchEvent(new w.Event('toggle'));
  assert.ok(reads>0,'Opening predictions still loads their existing data');
  assert.equal(own.querySelector('.cam-q-streak').textContent,'1 acierto');
  assert.equal(own.querySelectorAll('.cam-q-form-result').length,2);
  controls[10].details.dispatchEvent(new w.CustomEvent('cam:quiniela-results',{detail:{error:true}}));
  assert.equal(own.querySelector('.cam-q-streak').textContent,'No disponible');
  assert.equal(d.getElementById(prefix+'RankingCaption').textContent,'noviembre de 2026');
  assert.equal(leagueMounts,1,'One league entry per ranking panel');
  let played=false;w.CamQuinielaStandings.empty(target,()=>{played=true;});
  assert.equal(target.querySelectorAll('.cam-q-card').length,0,'Empty periods show no invented participants');
  assert.equal(leagueMounts,1,'Empty periods keep the existing league entry');
  target.querySelector('.cam-nfl-action').click();assert.equal(played,true);
  await w.happyDOM.close();
}
console.log('PASS ranking cards: exact scores/counts/order, own row, profile actions, lazy predictions, errors and empty states in both sports.');
