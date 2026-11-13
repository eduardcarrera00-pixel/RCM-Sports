import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const w=new Window({url:'https://camsports.github.io/'}),d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
const fixture=(id,extra={})=>({game_id:id,team_id:'BUF',awarded_points:4,settled_at:'2026-10-25T22:00:00Z',
  game:{id,season:2026,week:8,kickoff:'2026-10-25T17:00:00Z',status:'final',winner_id:'BUF',home_id:'BUF',away_id:'KC',
    home:{name:'Buffalo Bills'},away:{name:'Kansas City Chiefs'},home_score:24,away_score:21,...extra}});
const nfl=[fixture('one'),{...fixture('two',{week:7,winner_id:'KC'}),awarded_points:-4},fixture('old',{season:2025,week:6}),
  {...fixture('pending',{week:9,status:'scheduled',kickoff:'2099-11-01T18:00:00Z'}),settled_at:null,awarded_points:0},
  {...fixture('void',{week:8,status:'tie'}),awarded_points:0}];
const football=[
  {...fixture('f1',{competition:'laliga',matchday:10,week:undefined,outcome:'draw',home:{name:'Barcelona'},away:{name:'Sevilla'}}),pick:'draw',awarded_points:8},
  {...fixture('f2',{competition:'premier',matchday:10,week:undefined,outcome:'away',home:{name:'Arsenal'},away:{name:'Chelsea'}}),pick:'home',awarded_points:-4}
];
const calls=[];let fail=false,delayed=null,play=null,opening=null;
w.db={from(table){
  const q={table,filters:[],offset:0,last:499};
  const chain={select(value){q.select=value;return this;},eq(key,value){q.filters.push([key,value]);return this;},order(){return this;},range(a,b){q.offset=a;q.last=b;return this;},
    then(resolve,reject){calls.push(q);return (delayed||Promise.resolve(fail?{error:{message:'Sin conexión'}}:{data:(table==='cam_nfl_picks'?nfl:football).slice(q.offset,q.last+1),error:null})).then(resolve,reject);}};
  return chain;
}};
w.openAeProfile=tab=>{opening=tab;};w.camGoQuiniela=sport=>{play=sport;};
w.eval(fs.readFileSync('assets/cam-profile-quiniela.js','utf8'));
const view=(userId='reader',own=true,tab='party')=>d.dispatchEvent(new w.CustomEvent('cam:profile-view',{detail:{userId,own,tab}}));
const root=d.getElementById('camProfileQuiniela');
view('reader',true,'perfil');await tick();assert.equal(calls.length,0,'summary does not load personal history');
view();await tick();
assert.equal(calls.length,1);
assert.deepEqual(calls[0].filters,[['user_id','reader']],'every query is scoped to the profile owner');
assert.match(calls[0].select,/game:cam_nfl_games.*home:nfl_teams!home_id/);
assert.equal(d.getElementById('camQhRound').value,'9','latest saved round opens first');
assert.match(root.textContent,/Pronóstico guardado/);
const select=(id,value)=>{const n=d.getElementById(id);n.value=value;n.dispatchEvent(new w.Event('change'));};
select('camQhRound','8');assert.match(root.textContent,/4 pts · 1\/1 aciertos · 2 pronósticos/);
assert.match(root.textContent,/Acertado · \+4 pts/);assert.match(root.textContent,/Anulado · 0 pts/);
select('camQhRound','7');assert.match(root.textContent,/Fallado · −4 pts/);assert.match(root.textContent,/-4 pts · 0\/1 aciertos/);
select('camQhSeason','2025');assert.equal(d.getElementById('camQhRound').value,'6');
root.querySelector('[data-sport="football"]').click();await tick();
assert.equal(calls.length,2);assert.match(calls[1].select,/cam_football_games.*cam_football_teams!home_id/);
assert.match(root.textContent,/Tu pronóstico: Empate/);assert.match(root.textContent,/Acertado · \+8 pts/);
select('camQhLeague','premier');assert.match(root.textContent,/Arsenal/);assert.doesNotMatch(root.textContent,/Barcelona/);
assert.match(root.textContent,/Fallado · −4 pts/);assert.match(root.textContent,/-4 pts · 0\/1 aciertos/);
root.querySelector('[data-sport="nfl"]').click();await tick();assert.equal(calls.length,2,'switching cached sports and filters does not query again');
root.lastElementChild.click();assert.equal(play,'nfl');
view(null);assert.equal(root.hidden,true);assert.equal(root.textContent,'');
view('someone-else',false);await tick();assert.equal(calls.length,2,'never reads private picks for public profiles');
w.camOpenQuinielaHistory('football');assert.equal(opening,'quiniela');
view();await tick();assert.match(root.textContent,/Arsenal|Barcelona/,'entry point selects football');
view(null);
fail=true;view();await tick();assert.match(root.textContent,/Sin conexión/);
fail=false;[...root.querySelectorAll('button')].find(n=>n.textContent==='Reintentar').click();await tick();assert.match(root.textContent,/Barcelona/);
view(null);
// More than one API page: no silent 500-row truncation.
football.splice(0,football.length,...Array.from({length:501},(_,i)=>({...fixture('f'+i,{competition:'laliga',matchday:i===500?1:10,week:undefined,outcome:'home'}),pick:'home'})));
const before=calls.length;view();await tick();await tick();
assert.equal(calls.length-before,2);assert.equal(calls.at(-1).offset,500);
assert.ok([...d.getElementById('camQhRound').options].some(n=>n.value==='1'),'oldest page remains reachable');
view(null);
let release;delayed=new Promise(resolve=>{release=resolve;});view();await tick();
const dialog=d.getElementById('aeProfileDialog');dialog.showModal();dialog.close();
release({data:football,error:null});await tick();assert.equal(root.hidden,true);assert.equal(root.textContent,'','late response cannot reopen a natively closed profile');
w.happyDOM.abort();
// La pantalla pública elige la jornada vigente y lleva el historial al perfil.
for(const sport of ['nfl','football']){
  const win=new Window({url:'https://camsports.github.io/'}),doc=win.document;
  doc.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  doc.body.classList.add('ae-is-'+sport);
  const season=new Date().getUTCFullYear(),kickoff=new Date(Date.now()+86400000).toISOString();
  const game={id:'900000001',season,week:9,matchday:9,competition:'laliga',kickoff,status:'scheduled',picks_open:true,
    odds_locked_at:kickoff,home_id:'BUF',away_id:'KC',points_home:4,points_away:6,points_draw:8};
  const old={...game,id:'900000002',week:8,matchday:8,kickoff:new Date(Date.now()-7*86400000).toISOString(),status:'final'};
  let historySport=null;
  win.camOpenQuinielaHistory=value=>{historySport=value;};
  win.db={auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange(){}},rpc:async()=>({data:[]}),from(name){
    const rows=name==='cam_'+sport+'_games'?[old,game]:name==='cam_football_teams'?[{id:'BUF',name:'Buffalo Bills'},{id:'KC',name:'Kansas City Chiefs'}]:[];
    const q=new Proxy({},{get(target,key){if(key==='then')return resolve=>Promise.resolve({data:rows}).then(resolve);return ()=>q;}});return q;
  }};
  win.eval(fs.readFileSync('assets/cam-'+sport+'-quiniela.js','utf8'));
  doc.dispatchEvent(new win.Event('DOMContentLoaded'));await tick();await tick();
  const prefix=sport==='nfl'?'camNfl':'camFootball';
  assert.equal(doc.querySelectorAll('#'+prefix+'Nav select').length,0,'no round selector in '+sport);
  assert.equal(doc.querySelectorAll('#'+prefix+'Games .cam-nfl-game').length,1,'only the current round in '+sport);
  [...doc.querySelectorAll('#'+prefix+'Nav button, #'+prefix+'History button')].find(n=>n.textContent===(sport==='nfl'?'Ver mis jornadas':'Ver mis jornadas ›')).click();
  assert.equal(historySport,sport);
  if(sport==='football')assert.equal(doc.querySelectorAll('#camFootballNav .cam-football-league').length,4,'all competition logos remain');
  win.happyDOM.abort();
}
console.log('PASS: personal round/season/league filters, saved and settled states, caching, full pagination, private ownership, retry and stale-response guard.');
