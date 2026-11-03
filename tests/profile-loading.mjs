import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(r=>setTimeout(r,10));
const w=new Window({url:'https://camsports.github.io/'}),d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const user={id:'reader',user_metadata:{username:'Lector'}};
const auth=deferred();let authListener,sessionReads=0,networkChecks=0,login=0;
let takes={data:[{id:'take-1',title:'Mi Take',body:'Mi argumento deportivo.',author_id:user.id,sport:'nfl',created_at:'2026-11-01T12:00:00Z'}],error:null};
let picks=deferred(),name=deferred();
w.currentAdmin=null;
w.openUserAuthModal=()=>login++;
w.db={
  auth:{getSession:()=>{sessionReads++;return auth.promise;},getUser:()=>{networkChecks++;throw Error('Una apertura no debe validar por red');},onAuthStateChange:fn=>{authListener=fn;}},
  rpc:(rpc)=>rpc==='ae_my_free_takes'?Promise.resolve(takes):rpc==='ae_public_take_profile'?name.promise:Promise.resolve({data:[],error:null}),
  from:()=>({select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit(){return picks.promise;}})
};
w.eval(fs.readFileSync('assets/ae-profile.js','utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
const opening=w.openAeProfile();
assert.equal(d.getElementById('aeProfileDialog').open,true,'loading shell opens on the first tap, even while session initialization is pending');
assert.match(d.getElementById('aeProfileStatus').textContent,/Cargando/);
auth.resolve({data:{session:{user}},error:null});await tick();
assert.equal(sessionReads,1,'concurrent startup/click share the same session read');
assert.equal(networkChecks,0);
assert.match(d.getElementById('aeProfileTakes').textContent,/Mi Take/,'Takes render before slower Picks and public-name lookups');
d.getElementById('aeProfileTabPicks').click();
assert.match(d.getElementById('aeProfilePicks').textContent,/Cargando tus Picks/,'pending data must not look like an empty history');
picks.resolve({data:[{id:'pick-1',user_id:user.id,title:'Mi Pick',outcome:'won',american_odds:150,result_points:1.5}],error:null});await tick();
assert.match(d.getElementById('aeProfilePicks').textContent,/Mi Pick/);
name.resolve({data:[{author:'Lector público'}],error:null});await opening;
assert.equal(d.getElementById('aeProfileTabPicks').getAttribute('aria-selected'),'true','background completion keeps the chosen tab');
authListener('TOKEN_REFRESHED',{user});
assert.equal(d.getElementById('aeProfileDialog').open,true,'a token refresh never closes the open profile');

// Old requests cannot repaint a closed profile or survive a signed-out session.
const late=deferred();takes=late.promise;
const reopening=w.openAeProfile();await tick();
authListener('SIGNED_OUT',null);
assert.equal(d.getElementById('aeProfileDialog').open,false);
late.resolve({data:[{id:'old',title:'Respuesta antigua',author_id:user.id}],error:null});await reopening;
assert.equal(d.getElementById('aeProfileDialog').open,false);
assert.doesNotMatch(d.getElementById('aeProfileTakes').textContent,/Respuesta antigua/);
await w.openAeProfile();
assert.equal(login,1,'a known signed-out session goes to sign-in');
assert.equal(d.getElementById('aeProfileDialog').open,false);
assert.equal(sessionReads,1);assert.equal(networkChecks,0);
console.log('PASS: immediate profile shell, one session read, independent Takes/Picks, retained tab, refresh stability and signed-out stale-response guard.');
w.happyDOM.abort();
