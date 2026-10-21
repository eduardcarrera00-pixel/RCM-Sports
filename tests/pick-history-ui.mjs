import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

const w=new Window({url:'https://example.test/'}),d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,'');
w.currentAdmin=null;
const pending=[];
w.db={from(table){
 const q={select(){return q;},in(){return q;},eq(){return q;},order(){return q;},limit(){return q;},
  then(resolve,reject){return new Promise((yes,no)=>pending.push({table,resolve:yes,reject:no})).then(resolve,reject);}};
 return q;
}};
await new Promise(r=>setTimeout(r,0));
w.eval(fs.readFileSync(process.env.CAM_HISTORY_MODULE||'assets/community-picks.js','utf8'));
const area=d.getElementById('cpSettleHistory');
const fixture=(id,title='Paris St-G v Barcelona',outcome='won')=>({
 id,title,author:'eduardcero',user_id:'other',american_odds:240,event_date:'2026-10-20',
 outcome,moderation_status:'approved',settled_at:'2026-10-21T01:42:56Z',result_points:outcome==='won'?2.4:-2.4,
 legs:[{sport:'Fútbol',event:'Paris St-G v Barcelona',selection:'Barcelona gana · MONEYLINE',odds:240}]
});
const tick=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setTimeout(r,0));};
const start=()=>{w.updateAePicksAdmin();};
const next=table=>{const i=pending.findIndex(p=>p.table===table);assert.notEqual(i,-1,'Expected '+table);return pending.splice(i,1)[0];};
const success=(request,data)=>request.resolve({data,error:null});
const count=()=>area.querySelectorAll('.ae-pick-history-entry').length;

// Concurrent loads show each settled Pick once without a per-outcome summary.
start();start();await tick();
success(next('ae_pick_feed'),[fixture('same')]);
success(next('ae_pick_feed'),[fixture('same')]);await tick();
assert.equal(count(),1);
assert.equal(area.querySelectorAll('.ae-pick-history-summary').length,0);
assert.equal(area.querySelectorAll('.ae-pick-history-frame').length,1);
assert.equal(area.querySelectorAll('.cp-history-card').length,1);
assert.match(area.textContent,/Acertado/);
assert.match(area.textContent,/Barcelona gana/);
assert.match(area.textContent,/Cuota \+240/);
assert.equal(area.querySelectorAll('.cp-upvote, .cp-downvote').length,0);

// Stale results must not replace more recent request results.
start();await tick();const stale=next('ae_pick_feed');
start();await tick();const recent=next('ae_pick_feed');
success(recent,[fixture('new','Resultado actual','lost')]);await tick();
success(stale,[fixture('old','Resultado anterior')]);await tick();
assert.equal(count(),1);
assert.match(area.textContent,/Resultado actual/);
assert.doesNotMatch(area.textContent,/Resultado anterior/);
assert.match(area.textContent,/Fallado/);
assert.ok(area.querySelector('[data-outcome="lost"]'));

// Empty state and network error maintain stable snapshots.
start();start();await tick();const older=next('ae_pick_feed'),empty=next('ae_pick_feed');
success(empty,[]);await tick();older.resolve({data:null,error:{message:'Respuesta antigua'}});await tick();
assert.equal(count(),0);assert.match(area.textContent,/Todavía no hay Picks con resultado/);
assert.doesNotMatch(area.textContent,/Respuesta antigua/);
start();await tick();next('ae_pick_feed').reject(new Error('Sin conexión'));await tick();
assert.match(area.textContent,/Sin conexión/);assert.equal(area.getAttribute('aria-busy'),'false');

// Duplicate IDs collapse but separate real Picks with the same title remain.
start();await tick();success(next('ae_pick_feed'),[fixture('one'),fixture('one'),fixture('two')]);await tick();
assert.equal(count(),2);
assert.equal(area.querySelectorAll('.cp-history-card .cp-card-title').length,2);
assert.equal(area.querySelectorAll('.cp-history-card .cp-pick-line-choice').length,2);
assert.equal(area.querySelectorAll('.cp-history-card .cp-odds').length,2);
assert.equal(area.getAttribute('aria-busy'),'false');

// The section remains between best/worst plates and Chef rankings.
const history=d.getElementById('cpSettleHistorySection'),community=d.getElementById('communityPicks');
assert.equal(history.parentElement,community);
assert.ok(history.nextElementSibling.classList.contains('ae-chefs-dual-standings'));
assert.equal(d.querySelectorAll('#cpSettleHistorySection').length,1);
await w.happyDOM.close();
console.log('PASS: original Pick cards, clear result badges, latest settled Picks, unique IDs and stable history order.');
