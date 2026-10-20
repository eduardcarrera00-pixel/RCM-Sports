import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const source=fs.readFileSync('assets/cam-weekly-results.js','utf8');
const id='00000000-0000-0000-0000-000000000001';
const base={id,title:'Pick de prueba',event_name:'PSG vs Barcelona',selection:'PSG ML y over 3.5',american_odds:250,expires_at:'2026-01-01',is_published:false,social:[]};
const settled={...base,outcome:'won',image_url:'https://example.test/photo.jpg',link:'https://camsports.github.io/?weeklyResult='+id,original_x_url:'https://twitter.com/CAM_SPORTS__/status/2112625753602859163'};
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));};
async function setup(isAdmin=true,shared=false){
 const w=new Window({url:'https://example.test/'+(shared?'?weeklyResult='+id:'')});
 w.document.body.innerHTML='<section id="picksFeatured"><div><button id="aeWeeklyEditButton">Editar Pick</button></div><div id="picksFeaturedCard"><article data-cam-weekly-id="'+id+'"></article></div></section><details id="aeWeeklyPickAdmin"></details>';
 w.currentAdmin=isAdmin?{id:'editor'}:null;w.confirm=()=>true;
 let row={...base},result=shared?{...settled}:null;
 const calls=[];let throwAfterSave=false;
 w.db={auth:{onAuthStateChange(){}},rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='cam_admin_weekly_results')return {data:[row]};
   if(name==='cam_weekly_pick_result')return {data:result};
   if(name==='cam_resolve_weekly_pick'){
     result={...settled,outcome:args.p_outcome};row={...row,outcome:args.p_outcome,social:args.p_outcome==='won'?[{network:'twitter',status:'queued'},{network:'tiktok',status:'accepted'}]:[]};
     if(throwAfterSave)throw Error('Failed to fetch');
     return {data:result};
   }
   throw Error('Unexpected RPC '+name);
 }};
 w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await tick();
 return {w,calls,loseResponse(){throwAfterSave=true;}};
}
const a=await setup();
assert.equal(a.calls.filter(c=>c.name==='cam_resolve_weekly_pick').length,0,'Opening page never settles a Pick');
const quick=a.w.document.getElementById('camWeeklyQuickResult');
assert.equal(quick.hidden,false,'Admin sees result controls without opening details');
assert.ok(quick.querySelector('#camWeeklyYes').classList.contains('cam-weekly-result-green'));
assert.ok(quick.querySelector('#camWeeklyNo').classList.contains('cam-weekly-result-red'));
assert.equal(a.w.document.getElementById('aeWeeklyEditButton').parentElement.nextElementSibling,quick,'Controls sit directly under Edit Pick');
const panel=a.w.document.getElementById('camWeeklyResultsAdmin');
assert.equal(panel.hidden,false);
panel.open=true;panel.dispatchEvent(new a.w.Event('toggle'));await tick();
let approve=a.w.document.getElementById('camWeeklyYes');
assert.ok(approve,'An expired archived Pick can be settled from admin history');
a.w.confirm=()=>false;approve.click();await tick();
assert.equal(a.calls.filter(c=>c.name==='cam_resolve_weekly_pick').length,0,'Cancel confirmation must not resolve');
a.w.confirm=()=>true;a.loseResponse();approve.click();approve.click();await tick();
assert.equal(a.calls.filter(c=>c.name==='cam_resolve_weekly_pick').length,1,'Double click and lost response cannot submit twice');
assert.ok(panel.textContent.includes('✅ Pick acertado'));
assert.ok(quick.textContent.includes('✅ Pick acertado'));
assert.equal(quick.querySelectorAll('button').length,0,'Inline controls cannot repeat a confirmed result');
assert.ok(panel.textContent.includes('X: en cola'));
assert.ok(panel.textContent.includes('TikTok: procesando'));
assert.ok(![...panel.querySelectorAll('button')].some(b=>b.textContent.startsWith('Aprobar')),'Resolved Picks have no repeat controls');
const reply=[...panel.querySelectorAll('a')].find(n=>n.textContent.includes('Responder en X'));
assert.ok(reply);
assert.equal(new URL(reply.href).searchParams.get('in_reply_to'),'2112625753602859163');
assert.ok(new URL(reply.href).searchParams.get('text').startsWith('✅ Pick acertado'));
assert.equal(a.w.camWeeklyResults.replyUrl({...settled,original_x_url:'https://evil.test/status/123'}),null);
await a.w.happyDOM.close();

const loss=await setup();const lossPanel=loss.w.document.getElementById('camWeeklyResultsAdmin');
lossPanel.open=true;lossPanel.dispatchEvent(new loss.w.Event('toggle'));await tick();
loss.w.document.getElementById('camWeeklyNo').click();await tick();
assert.equal(loss.calls.find(c=>c.name==='cam_resolve_weekly_pick').args.p_outcome,'lost');
assert.ok(lossPanel.textContent.includes('No se publica un aviso en redes.'));
assert.ok(!lossPanel.querySelector('a'),'Loss has no social or reply link');
await loss.w.happyDOM.close();

const reader=await setup(false,true);
assert.equal(reader.w.document.getElementById('camWeeklyResultsAdmin').hidden,true);
assert.equal(reader.w.document.getElementById('camWeeklyQuickResult').hidden,true,'Readers cannot see inline result controls');
assert.equal(reader.calls.filter(c=>c.name==='cam_admin_weekly_results'||c.name==='cam_resolve_weekly_pick').length,0,'Readers never access admin RPCs');
assert.ok(reader.w.document.getElementById('camWeeklySharedResult').textContent.includes('✅ Pick acertado'),'Archived result has a stable public link');
assert.equal(reader.w.camWeeklyResults.socialSummary({outcome:'won',social:[{network:'twitter',status:'accepted'}]}),'X: procesando');
await reader.w.happyDOM.close();
console.log('PASS: admin-only controls, expired history, confirmation, double-click guard, lost-response recovery, denied outcomes, stable public result and prepared X replies.');
