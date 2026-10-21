import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const w = new Window({url:'https://camsports.github.io/'});
const d = w.document;
d.body.innerHTML = fs.readFileSync('index.html','utf8').replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,'');
w.currentCategory = 'NFL';
w.currentAdmin = null;
w.confirm = () => true;
let user = {id:'cam-member'};
const later = '2032-02-01T20:00:00Z';
const questions = [
  {id:'nfl',competition:'nfl',period:'season',prompt:'¿Quién gana el Super Bowl?',closes_at:later,points:20,status:'open',correct_option_id:null,settled_at:null},
  {id:'liga',competition:'laliga',period:'season',prompt:'¿Quién gana LaLiga?',closes_at:later,points:25,status:'open',correct_option_id:null,settled_at:null},
  {id:'premier',competition:'premier',period:'season',prompt:'¿Quién gana la Premier?',closes_at:later,points:30,status:'open',correct_option_id:null,settled_at:null}
];
const options = [
  {id:'a',question_id:'nfl',label:'Kansas City Chiefs',points:25},
  {id:'b',question_id:'nfl',label:'Buffalo Bills',points:40},
  {id:'c',question_id:'liga',label:'FC Barcelona',points:15},
  {id:'d',question_id:'liga',label:'Real Madrid',points:20},
  {id:'e',question_id:'premier',label:'Arsenal',points:15},
  {id:'f',question_id:'premier',label:'Liverpool',points:18}
];
const predictions = [];
const rows = table => table==='ae_take_questions' ? questions :
  table==='ae_take_options' ? options :
  table==='ae_take_predictions' ? predictions : [];
w.db = {
  auth:{getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from(table){
    const filters = [];
    const q = {
      select(){return q;},
      neq(field,value){filters.push(row=>row[field]!==value);return q;},
      eq(field,value){filters.push(row=>row[field]===value);return q;},
      in(field,values){filters.push(row=>values.includes(row[field]));return q;},
      order(){return q;},limit(){return q;},
      then(resolve,reject){return Promise.resolve({data:rows(table).filter(row=>filters.every(fn=>fn(row))),error:null}).then(resolve,reject);}
    };
    return q;
  },
  async rpc(name,args){
    assert.equal(name,'ae_submit_take');
    assert.ok(user);
    assert.equal(predictions.some(p=>p.user_id===user.id && p.question_id===args.p_question_id),false,'One immutable pick per user and question');
    predictions.push({user_id:user.id,question_id:args.p_question_id,option_id:args.p_option_id,awarded_points:0});
    return {data:true,error:null};
  }
};
const tick = () => new Promise(resolve=>setTimeout(resolve,45));
w.eval(fs.readFileSync('assets/ae-season-predictions.js','utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await tick();
const list = d.getElementById('aeSeasonList');
assert.equal(list.querySelectorAll('.ae-season-option').length,2,'NFL starts with all options');
assert.equal(list.querySelector('.ae-season-receipt'),null);
list.querySelector('.ae-season-option[data-team="Buffalo Bills"]').click();
await tick();
assert.equal(predictions.length,1);
assert.equal(list.querySelectorAll('.ae-season-option').length,0,'Stored NFL picks hide the full grid');
assert.match(list.querySelector('.ae-season-receipt').textContent,/Buffalo Bills/);
assert.match(list.querySelector('.ae-season-receipt-state').textContent,/Pick guardado/);
assert.equal(d.querySelectorAll('#aeSeasonTabs .has-pick').length,1);

await w.aeSeasonPredictions.refresh();
assert.equal(list.querySelectorAll('.ae-season-option').length,0,'Reload preserves the saved NFL selection');

w.aeSeasonPredictions.setSection('Fútbol');
assert.equal(d.querySelectorAll('#aeSeasonTabs button').length,2,'Both football leagues remain selectable');
assert.equal(list.querySelectorAll('.ae-season-option').length,2);
list.querySelector('.ae-season-option[data-team="FC Barcelona"]').click();
await tick();
assert.match(list.querySelector('.ae-season-receipt').textContent,/FC Barcelona/);
assert.equal(list.querySelectorAll('.ae-season-option').length,0);
assert.equal(d.querySelector('#aeSeasonTabs button.has-pick').textContent.includes('LaLiga'),true);
d.querySelectorAll('#aeSeasonTabs button')[1].click();
assert.equal(list.querySelectorAll('.ae-season-option').length,2,'Other leagues stay open');
list.querySelector('.ae-season-option[data-team="Arsenal"]').click();
await tick();
assert.match(list.querySelector('.ae-season-receipt').textContent,/Arsenal/);

questions[0].status='settled';questions[0].correct_option_id='b';questions[0].settled_at=new Date().toISOString();
predictions[0].awarded_points=40;
w.aeSeasonPredictions.setSection('NFL');
await w.aeSeasonPredictions.refresh();
assert.match(list.querySelector('.ae-season-receipt-state').textContent,/Acertaste/);
assert.match(list.querySelector('.ae-season-receipt-detail').textContent,/40 puntos/);
assert.equal(list.querySelectorAll('.ae-season-option').length,0,'Results do not reopen a saved prediction');

user={id:'another-member'};
w.aeSeasonPredictions.setSection('Fútbol');
await w.aeSeasonPredictions.refresh();
assert.equal(list.querySelector('.ae-season-receipt'),null,'One user cannot see another user\'s saved choice');
assert.equal(list.querySelectorAll('.ae-season-option').length,2,'New user sees unchosen options');
await w.happyDOM.close();
console.log('PASS: saved NFL and football champion picks, league tabs, persisted receipts, settlement and account isolation.');
