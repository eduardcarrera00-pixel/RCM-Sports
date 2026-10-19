/* Regression checks: local Take/Pick drafts, explicit safe close, separate accounts.
   Runs without production Supabase access and does not publish anything. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const w=new Window({url:'https://aesportsclub.github.io/'});
const d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
let user={id:'draft-reader-A'};
w.db={auth:{getUser:async()=>({data:{user},error:null})}};
let approve=false;
w.confirm=()=>approve;

const pickForm=d.getElementById('cpForm');
const leg=i=>'<fieldset class="cp-compose-selection">'+
 ['sport','event','selection','odds'].map(name=>'<label>'+name+
 '<input name="'+name+'_'+i+'"></label>').join('')+'</fieldset>';
pickForm.innerHTML='<button type="button" id="testCombined">Combinada</button>'+
 '<div class="cp-legs">'+leg(0)+'</div>'+
 '<input name="event_date" type="date">'+
 '<details class="cp-compose-analysis"><summary>Analysis</summary><textarea name="explanation"></textarea></details>';
const combined=d.getElementById('testCombined');
combined.addEventListener('click',()=>{
 if(!pickForm.elements.namedItem('sport_1')){
  const wrapper=d.createElement('div');wrapper.innerHTML=leg(1);
  wrapper.firstElementChild.insertAdjacentHTML('beforeend','<button type="button" class="cp-compose-remove">Quitar segunda selección</button>');
  pickForm.querySelector('.cp-legs').append(wrapper.firstElementChild);
 }
});
pickForm.addEventListener('click',e=>{
 if(e.target.classList.contains('cp-compose-remove'))e.target.closest('fieldset')?.remove();
});
w.eval(fs.readFileSync('assets/ae-draft-guard.js','utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
const guard=w.aeDraftGuard;
assert.ok(guard,'Draft module loaded');

const take=d.getElementById('freeTakesForm'),takeDialog=d.getElementById('aeTakeComposerDialog');
d.getElementById('aeTakeComposerClose').addEventListener('click',()=>takeDialog.close());
await guard.restore('take');
take.elements.namedItem('competition').value='NFL';
take.elements.namedItem('title').value='Los Bills serán campeones';
take.elements.namedItem('body').value='Es un argumento largo que no quiero perder accidentalmente.';
take.querySelector('input[value="nfl"]').checked=true;
take.dispatchEvent(new w.Event('input',{bubbles:true}));
assert.equal(guard.save('take'),true);
assert.match(w.localStorage.getItem('ae-sports-draft-v1:take:draft-reader-A'),/Bills/);
takeDialog.showModal();
d.getElementById('aeTakeComposerClose').click();
assert.equal(takeDialog.open,true,'Cancel preserves the open composer');
approve=true;
d.getElementById('aeTakeComposerClose').click();
assert.equal(takeDialog.open,false,'Confirmed X closes composer');
take.reset();
await guard.restore('take');
assert.match(take.elements.namedItem('body').value,/no quiero perder/,'Restores Take after closing');
user={id:'draft-reader-B'};
await guard.restore('take');
assert.equal(take.elements.namedItem('body').value,'','Other account cannot view A draft');
user={id:'draft-reader-A'};
await guard.restore('take');
assert.match(take.elements.namedItem('body').value,/no quiero perder/,'Original account recovers draft');

await guard.restore('pick');
const f=name=>pickForm.elements.namedItem(name);
f('sport_0').value='NFL';f('event_0').value='Eagles vs Cowboys';
f('selection_0').value='Eagles';f('odds_0').value='+150';
combined.click();
f('sport_1').value='Fútbol';f('event_1').value='Madrid vs Barça';
f('selection_1').value='Ambos anotan';f('odds_1').value='-110';
f('event_date').value='2026-10-22';f('explanation').value='La combinada está razonada.';
pickForm.querySelector('.cp-compose-analysis').open=true;
pickForm.dispatchEvent(new w.Event('input',{bubbles:true}));
assert.equal(guard.save('pick'),true);
pickForm.reset();pickForm.querySelector('.cp-compose-remove').click();
await guard.restore('pick');
assert.equal(f('event_1').value,'Madrid vs Barça','Recovers second combined leg');
assert.equal(f('odds_1').value,'-110','Recovers combined odds');
assert.equal(f('event_date').value,'2026-10-22','Recovers event date');
assert.equal(f('explanation').value,'La combinada está razonada.','Recovers analysis');
guard.clear('pick');
assert.equal(w.localStorage.getItem('ae-sports-draft-v1:pick:draft-reader-A'),null,'Success deletes only published draft');
assert.ok(w.localStorage.getItem('ae-sports-draft-v1:take:draft-reader-A'),'Other draft still exists');
guard.clear('take');
assert.equal(w.localStorage.getItem('ae-sports-draft-v1:take:draft-reader-A'),null);
console.log('PASS: Take/Pick draft persistence, confirmed close, combined selections, account isolation and publication cleanup.');
await w.happyDOM.close();
