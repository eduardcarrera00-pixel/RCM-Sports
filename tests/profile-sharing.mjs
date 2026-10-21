import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const owner='00000000-0000-0000-0000-000000000951';
const takeId=i=>'00000000-0000-0000-0000-'+String(960+i).padStart(12,'0');
const takes=Array.from({length:4},(_,i)=>({id:takeId(i),title:'Opinión '+i,body:('El deporte se debate con argumentos '+i+'. ').repeat(40),sport:'nfl',created_at:'2026-10-21T13:00:00Z',upvotes:10-i,downvotes:i,hidden:i===3,email:'PRIVATE_EMAIL',draft:'PRIVATE_DRAFT'}));
const picks=[{id:takeId(8),title:'Mi Pick acertado',outcome:'won',moderation_status:'approved',american_odds:150,legs:[{event:'Barcelona vs PSG',selection:'Barcelona gana'}],created_at:'2026-10-21T13:00:00Z',result_points:1.5}];
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
async function setup({own=false,shared='',rows=takes}={}){
 const w=new Window({url:'https://example.test/'+(shared?'?perfil='+owner+'&take='+shared+'&token=PRIVATE_TOKEN':'')}),d=w.document;
 d.body.innerHTML=html;w.currentAdmin=null;
 const calls=[],opened=[],drawn=[];
 w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText:t=>drawn.push(t),measureText:t=>({width:String(t).length*17})});
 w.HTMLCanvasElement.prototype.toBlob=cb=>cb(new w.Blob(['PNG'],{type:'image/png'}));
 w.URL.createObjectURL=()=>'blob:profile-share';w.URL.revokeObjectURL=()=>{};
 w.db={auth:{getUser:async()=>({data:{user:own?{id:owner,user_metadata:{username:'Lector'}}:null}}),onAuthStateChange(){}},rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='ae_my_free_takes')return {data:rows};
  if(name==='ae_my_profile_unpopular_take')return {data:takeId(2)};
  if(name==='ae_public_take_profile')return {data:rows.filter(t=>!t.hidden).map(t=>({...t,author_id:owner,author:'Lector'}))};
  return {data:[]};
 },from:()=>({select(){return this;},eq(){return this;},order(){return this;},limit:async()=>({data:picks.map(p=>({...p,author:'Lector'}))})})};
 w.aeTakeReplies={open:(take,options)=>opened.push({take,options})};
 for(const file of ['assets/cam-pick-share.js','assets/ae-profile.js'])w.eval(fs.readFileSync(file,'utf8'));
 d.dispatchEvent(new w.Event('DOMContentLoaded'));
 const tick=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setTimeout(r,0));};
 await tick();return {w,d,calls,opened,drawn,tick};
}

const a=await setup({own:true});await a.w.openAeProfile();
for(const selector of ['#aeProfileTakeHighlights .ae-profile-feature','#aeProfileTakes .ae-profile-item']){
 const cards=[...a.d.querySelectorAll(selector)];assert.ok(cards.length);
 for(const card of cards){
  const hidden=card.textContent.includes('Oculto por moderación');
  const button=card.querySelector('.cam-pick-share-button');assert.equal(Boolean(button),!hidden,'Only public Takes are shareable');
  if(!button)continue;
  button.click();const dialog=a.d.getElementById('camPickShareDialog');assert.equal(dialog.open,true);
  assert.equal(a.opened.length,0,'Sharing must not also open the Take discussion');
  assert.match(dialog.querySelector('h2').textContent,/Comparte este Take/);
  const caption=dialog.querySelector('textarea').value;assert.match(caption,/Take de @Lector/);assert.doesNotMatch(caption,/PRIVATE|Cuota|Pendiente/);
  const href=new URL(new URL(dialog.querySelector('a').href).searchParams.get('url'));
  assert.equal(href.origin,'https://camsports.github.io');assert.equal(href.searchParams.get('perfil'),owner);assert.ok(href.searchParams.has('take'));
  const row=takes.find(t=>t.id===href.searchParams.get('take'));assert.ok(caption.includes(row.body.trim()),'Copy text retains the full published Take');
  assert.equal(dialog.querySelector('.cam-pick-share-download').download,'cam-sports-take-'+row.id+'.png');
  dialog.querySelector('.cam-pick-share-close').click();assert.equal(a.d.activeElement,button);
 }
}
assert.ok(a.drawn.includes('LA COMUNIDAD OPINA'));assert.ok(!a.drawn.includes('CUOTA TOTAL'));
a.d.getElementById('aeProfileTabPicks').click();
for(const selector of ['#aeProfilePickHighlights','#aeProfilePicks']){
 const button=a.d.querySelector(selector+' .cam-pick-share-button');assert.ok(button,'Featured and recent profile Picks stay shareable');button.click();
 assert.match(a.d.querySelector('#camPickShareDialog textarea').value,/Pick de @Lector/);a.d.querySelector('.cam-pick-share-close').click();
}
assert.equal(a.calls.some(c=>/post_|vote_/.test(c.name)),false,'Sharing must not write to the database');await a.w.happyDOM.close();

const b=await setup({shared:takeId(1)});assert.equal(b.opened.length,1,'A signed-out visitor opens the exact shared Take');assert.equal(b.opened[0].take.id,takeId(1));assert.equal(b.opened[0].take.author,'Lector');
assert.ok(b.d.querySelector('#aeProfileTakeHighlights .cam-pick-share-button'),'Public profiles have share controls');
assert.equal(b.calls.some(c=>c.name==='ae_my_free_takes'),false,'Visitors only load public Takes');
b.d.querySelector('#aeProfileTakeHighlights .cam-pick-share-button').click();assert.ok(!b.d.querySelector('#camPickShareDialog textarea').value.includes('PRIVATE_TOKEN'));
b.d.querySelector('.cam-pick-share-close').click();b.w.closeAeProfile();assert.equal(new URL(b.w.location.href).searchParams.has('take'),false);await b.w.happyDOM.close();

for(const shared of [takeId(3),takeId(9),'invalid']){
 const c=await setup({shared});assert.equal(c.opened.length,0,'Hidden, missing and invalid Takes never open');
 if(shared!=='invalid')assert.match(c.d.getElementById('aeProfileStatus').textContent,/no está disponible/);
 await c.w.happyDOM.close();
}
const ownLink=await setup({own:true,shared:takeId(0)});assert.equal(ownLink.opened[0].take.id,takeId(0),'The author can open their own shared link');await ownLink.w.happyDOM.close();
console.log('PASS: profile featured/recent Takes and Picks, attribution/full text, public permalinks, signed-out/owner access, unavailable moderation, no writes and focus return.');
