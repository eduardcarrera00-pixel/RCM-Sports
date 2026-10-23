import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const w=new Window({url:'https://aesportsclub.github.io/'}),d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
w.currentCategory='';w.currentAdmin=null;
let entries=[],picks=[],fail=false;
w.db={auth:{getUser:async()=>({data:{user:{id:'reader',user_metadata:{username:'Lector'}}}}),onAuthStateChange:()=>{}},rpc:async name=>({data:name==='ae_my_free_takes'?entries:[],error:fail&&name==='ae_post_free_take'?{message:'Sin conexión'}:null}),from:()=>({select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit:async()=>({data:picks,error:null})})};
w.aeRequestPublication=async(kind,callback)=>callback();
let pickOpened=0;
w.aeOpenPickComposer=()=>{pickOpened++;};
for(const file of ['assets/free-takes.js','assets/ae-profile.js'])w.eval(fs.readFileSync(file,'utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await w.openAeProfile();
let action=d.getElementById('aeProfilePublish');
assert.equal(action.hidden,false);assert.equal(action.textContent,'Publicar mi Take');
assert.match(d.getElementById('aeProfileTakes').textContent,/Aún no/);
assert.equal(d.getElementById('aeProfileTakeAccuracy').hidden,false);
assert.match(d.getElementById('aeProfileTakeAccuracy').textContent,/PORCENTAJE DE APOYO/);
assert.match(d.getElementById('aeProfileTakeAccuracy').textContent,/Todavía no hay votos/);

// Five records still exist in each list, but the viewport is limited to three.
entries=Array.from({length:5},(_,i)=>({
  id:'take-'+i,author_id:'reader',title:'Take '+(i+1),body:'Una opinión deportiva para comprobar el historial.',
  sport:'nfl',created_at:new Date(Date.UTC(2026,9,19-i)).toISOString(),
  upvotes:i===0?3:0,downvotes:i===0?1:0
}));
picks=Array.from({length:5},(_,i)=>({
  id:'pick-'+i,user_id:'reader',title:'Pick '+(i+1),created_at:new Date(Date.UTC(2026,9,19-i)).toISOString(),
  outcome:i<3?'won':'lost',american_odds:150,result_points:i<3?1.5:-1.5
}));
await w.openAeProfile();
let takesScroll=d.querySelector('#aeProfileTakes .ae-profile-recent-scroll');
assert.equal(takesScroll.children.length,5);
assert.equal(takesScroll.tabIndex,0);
assert.match(takesScroll.firstElementChild.textContent,/Take 1/);
assert.match(d.getElementById('aeProfileTakeAccuracy').textContent,/75%/);
d.getElementById('aeProfileTabPicks').click();
let picksScroll=d.querySelector('#aeProfilePicks .ae-profile-recent-scroll');
assert.equal(picksScroll.children.length,5);
assert.equal(picksScroll.tabIndex,0);
assert.match(picksScroll.firstElementChild.textContent,/Pick 1/);
assert.equal(d.getElementById('aeProfileTakeAccuracy').hidden,true);
assert.match(d.getElementById('aeProfileAccuracy').textContent,/60%/);
entries=[];picks=[];
await w.openAeProfile();
action.click();await new Promise(r=>setTimeout(r,50));
const dialog=d.getElementById('aeTakeComposerDialog'),form=d.getElementById('freeTakesForm');
assert.equal(dialog.open,true);assert.equal(d.getElementById('aeProfileDialog').open,false);
form.elements.competition.value='NFL';form.elements.title.value='Los Bills serán campeones';form.elements.body.value='Una predicción que estoy escribiendo y quiero conservar.';form.querySelector('[value="nfl"]').checked=true;
dialog.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.equal(dialog.open,true);
const cancel=new w.Event('cancel',{cancelable:true});dialog.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);
d.dispatchEvent(new w.Event('visibilitychange'));await new Promise(r=>setTimeout(r,500));
assert.equal(dialog.open,true);assert.match(form.elements.body.value,/conservar/);
d.getElementById('aeTakeComposerClose').click();assert.equal(dialog.open,false);
await w.aeOpenTakeComposer('Fútbol');assert.equal(dialog.open,true);assert.equal(form.elements.sport.value,'nfl');assert.match(form.elements.body.value,/conservar/);
fail=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,30));assert.equal(dialog.open,true);assert.match(form.elements.body.value,/conservar/);assert.match(d.getElementById('aeTakeComposerStatus').textContent,/Sin conexión/);
fail=false;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,500));assert.equal(dialog.open,true);assert.equal(form.elements.body.value,'');assert.match(d.getElementById('aeTakeComposerStatus').textContent,/publicado/);
d.getElementById('aeTakeComposerClose').click();await w.openAeProfile();
d.getElementById('aeProfileTabPicks').click();assert.equal(action.hidden,false);assert.equal(action.textContent,'Publicar mi Pick');action.click();assert.equal(pickOpened,1);assert.equal(d.getElementById('aeProfileDialog').open,false);
await w.openAePublicProfile('12345678-1234-1234-1234-123456789abc',false);assert.equal(action.hidden,true);
console.log('PASS: empty profile publication, correct composer routing, retained draft, backdrop/Escape/focus safety, errors and success stay open, public profiles hide publishing.');
w.happyDOM.abort();
