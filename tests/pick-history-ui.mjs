import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

const w=new Window({url:'https://example.test/'}),d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
w.currentAdmin=null;
const pending=[];
w.db={from(table){
 const q={select(){return q;},in(){return q;},eq(){return q;},order(){return q;},limit(){return q;},
  then(resolve,reject){return new Promise((yes,no)=>pending.push({table,resolve:yes,reject:no})).then(resolve,reject);}};
 return q;
}};
// Only use the public refresh entry point; do not start unrelated feed/auth work.
await new Promise(r=>setTimeout(r,0));
w.eval(fs.readFileSync(process.env.CAM_HISTORY_MODULE||'assets/community-picks.js','utf8'));
const area=d.getElementById('cpSettleHistory');
const fixture=(id,title='Paris St-G v Barcelona',outcome='won')=>({id,title,author:'eduardcarrera00',american_odds:240,event_date:'2026-10-20',outcome,settled_at:'2026-10-21T01:42:56Z',result_points:outcome==='won'?2.4:-2.4,legs:[{sport:'Fútbol',event:'Paris St-G v Barcelona',selection:'Barcelona gana · MONEYLINE'}]});
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0));};
const start=()=>{w.updateAePicksAdmin();};
const next=table=>{const i=pending.findIndex(p=>p.table===table);assert.notEqual(i,-1,'Expected a '+table+' request');return pending.splice(i,1)[0];};
const success=(request,data)=>request.resolve({data,error:null});
const count=()=>area.querySelectorAll('.ae-pick-history-entry').length;

// Auth and initial feed loading can request the same history concurrently.
start();start();await tick();const first=next('ae_pick_feed'),second=next('ae_pick_feed');
success(first,[fixture('same')]);success(second,[fixture('same')]);await tick();
while(pending.length){success(pending.shift(),[]);await tick();}
assert.equal(count(),1,'Concurrent loads must display each Pick exactly once');
assert.equal(area.querySelectorAll('.ae-pick-history-summary').length,0,'The three result counters are removed');
assert.equal(area.querySelectorAll('.ae-pick-history-grid').length,1);
assert.equal(area.querySelectorAll('.ae-pick-history-card').length,1);
assert.match(area.textContent,/Barcelona gana/);
assert.match(area.textContent,/Cuota \+240/);
assert.match(area.textContent,/@eduardcarrera00/);
assert.match(area.querySelector('.ae-pick-history-card').getAttribute('href'),/[?&]pick=same/);
assert.equal(area.querySelectorAll('.ae-pick-history-frame').length,1);

// An overdue unresolved Pick must remain visible, clearly pending, with no invented points.
start();await tick();
success(next('ae_pick_feed'),[fixture('overdue','Santos Laguna vs Pumas','pending'),fixture('settled')]);await tick();
success(next('ae_pick_settlement_checks'),[]);await tick();
assert.equal(count(),2,'Overdue pending Picks stay in the history alongside resolved Picks');
assert.equal(area.querySelector('[data-outcome="pending"] .ae-pick-history-badge').textContent,'Pendiente de calificación');
assert.match(area.querySelector('[data-outcome="pending"]').textContent,/A la espera de verificación/);
assert.doesNotMatch(area.querySelector('[data-outcome="pending"]').textContent,/\\+2\\.40 pts/);

// An older automatic-verification response must not append to a newer snapshot.
start();await tick();success(next('ae_pick_feed'),[fixture('old','Resultado anterior')]);await tick();
const oldChecks=next('ae_pick_settlement_checks');
start();await tick();success(next('ae_pick_feed'),[fixture('new','Resultado actual','lost')]);await tick();
success(next('ae_pick_settlement_checks'),[]);await tick();
success(oldChecks,[{pick_id:'old'}]);await tick();
assert.equal(count(),1);assert.match(area.textContent,/Resultado actual/);assert.doesNotMatch(area.textContent,/Resultado anterior/);
assert.equal(area.querySelector('[data-outcome="lost"] .ae-pick-history-badge').textContent,'Fallado');

// A late error cannot overwrite the latest empty result.
start();start();await tick();const stale=next('ae_pick_feed'),empty=next('ae_pick_feed');
success(empty,[]);await tick();stale.resolve({data:null,error:{message:'Respuesta antigua'}});await tick();
assert.equal(count(),0);assert.match(area.textContent,/Todavía no hay Picks finalizados/);assert.doesNotMatch(area.textContent,/Respuesta antigua/);

// Network errors replace only the current snapshot, and a retry recovers.
start();await tick();next('ae_pick_feed').reject(new Error('Sin conexión'));await tick();
assert.match(area.textContent,/Sin conexión/);assert.equal(area.getAttribute('aria-busy'),'false');
start();await tick();success(next('ae_pick_feed'),[fixture('one'),fixture('one'),fixture('two')]);await tick();
success(next('ae_pick_settlement_checks'),[{pick_id:'one'}]);await tick();
assert.equal(count(),2,'Only duplicate IDs are collapsed; separate Picks with the same title remain');
assert.equal(area.querySelectorAll('.ae-pick-history-source').length,2);
assert.equal(area.querySelectorAll('.ae-pick-history-card').length,2);
assert.equal(new Set([...area.querySelectorAll('.ae-pick-history-card')].map(card=>card.href)).size,2);
assert.match(area.textContent,/Verificado automáticamente/);assert.match(area.textContent,/Confirmado por un admin/);
assert.equal(area.getAttribute('aria-busy'),'false');

// The history keeps its own full-width row before the Chef standings.
const history=d.getElementById('cpSettleHistorySection'),community=d.getElementById('communityPicks');
assert.equal(history.parentElement,community);assert.ok(history.nextElementSibling.classList.contains('ae-chefs-dual-standings'));
assert.equal(d.querySelectorAll('#cpSettleHistorySection').length,1);
await w.happyDOM.close();
console.log('PASS: concurrent history loads, delayed verification/errors, empty/error/retry states, unique IDs, preserved distinct Picks and stable section order.');
