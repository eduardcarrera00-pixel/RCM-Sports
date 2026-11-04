import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

const w=new Window({url:'https://camsports.github.io/'}),d=w.document;
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('<section id="freeTakes"');
const end=html.indexOf('<!-- Se retira el listado agregado',start);
d.body.innerHTML='<main id="mainContent"><div class="editorial-layout"><aside><section class="editorial-community"></section></aside></div>'+html.slice(start,end)+'</main>';
const root=d.getElementById('aeSportTakeHistoric'),target=d.getElementById('aeSportTakeHistoricTake');
assert.equal(root.parentElement.id,'freeTakes');
assert.equal(root.parentElement.lastElementChild,root,'The record closes the actual Takes markup');
const nfl={id:'nfl-record',sport:'nfl',author_id:'nfl-author',author:'nflfan',title:'NFL <récord>',
  body:'NFL · AFC\n\nEl texto original de la predicción.',points:17,created_at:'2025-10-01',upvotes:3,downvotes:1};
const football={...nfl,id:'football-record',sport:'champions',competition:'Champions League',author:'futbolfan',title:'Fútbol récord',points:12};
let mode='normal',release;
const opened=[],composers=[],calls=[];
w.currentCategory='NFL';
w.aeTakeReplies={open:t=>opened.push(t)};
w.aeOpenTakeComposer=s=>composers.push(s);
w.db={auth:{onAuthStateChange(){}},rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='ae_sport_take_historic'){
    if(mode==='delay'&&args.p_sport==='nfl')return new Promise(resolve=>{release=()=>resolve({data:[nfl]});});
    if(mode==='error')return {error:{message:'Prueba de conexión'}};
    if(mode==='empty')return {data:[]};
    return {data:[args.p_sport==='nfl'?nfl:football]};
  }
  return {data:[{...nfl,upvotes:3,downvotes:1},{...football,upvotes:3,downvotes:1}]};
}};
w.eval(fs.readFileSync('assets/ae-home-take-discoveries.js','utf8'));
w.eval(fs.readFileSync('assets/ae-sport-top-takes.js','utf8'));
await w.refreshAeSportTopTakes(true);
assert.equal(root.hidden,false);
assert.equal(root.dataset.sport,'nfl');
assert.match(d.getElementById('aeSportTakeHistoricKicker').textContent,/NFL/);
assert.match(target.textContent,/17/);
assert.match(target.textContent,/NFL <récord>/);
assert.doesNotMatch(target.textContent,/NFL · AFC/,'Preview omits repeated context');
assert.equal(target.querySelector('récord'),null,'Titles remain text');
target.querySelector('.cam-take-record').click();
assert.equal(opened.at(-1),nfl,'Open keeps the complete original object and body');
assert.equal(target.hasAttribute('aria-busy'),false);

mode='delay';
const stale=w.refreshAeSportTopTakes(true);
w.currentCategory='Fútbol';mode='normal';
await w.refreshAeSportTopTakes(true);
release();await stale;
assert.equal(root.dataset.sport,'football');
assert.match(target.textContent,/Fútbol récord/);
assert.doesNotMatch(target.textContent,/NFL <récord>/,'A late NFL response cannot overwrite Fútbol');
target.querySelector('.cam-take-record').click();
assert.equal(opened.at(-1),football);

mode='empty';await w.refreshAeSportTopTakes(true);
assert.match(target.textContent,/El récord está libre/);
target.querySelector('.cam-take-record-cta').click();
assert.equal(composers.at(-1),'Fútbol','Empty state opens the correct sport composer');
mode='error';await w.refreshAeSportTopTakes(true);
assert.match(target.textContent,/No se pudo cargar/);
assert.equal(d.querySelectorAll('#aeSportTakePositive .ae-sport-take-item').length,1,'Record failure leaves the opinions working');
mode='normal';target.querySelector('.cam-take-record-cta').click();
for(let i=0;i<4;i++)await new Promise(resolve=>setTimeout(resolve,0));
assert.match(target.textContent,/Fútbol récord/,'Retry recovers the record');
w.currentCategory='Todos';await w.refreshAeSportTopTakes(true);
assert.equal(root.hidden,true,'Sport record does not appear on Home');
assert(calls.filter(c=>c.name==='ae_sport_take_historic').every(c=>['nfl','football'].includes(c.args.p_sport)));
console.log('PASS: actual bottom placement, shared record card, sport isolation, delayed responses, full discussion, empty/error states and retry.');
await w.happyDOM.close();
