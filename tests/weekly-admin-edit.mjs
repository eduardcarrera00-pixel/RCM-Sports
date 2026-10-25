import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

const index=fs.readFileSync('index.html','utf8');
const formHTML=index.match(/<details id="aeWeeklyPickAdmin"[\s\S]*?<\/details>/)[0];
const weekly=fs.readFileSync('assets/ae-editorial-weekly.js','utf8');
const results=fs.readFileSync('assets/cam-weekly-results.js','utf8');
const original={id:'00000000-0000-0000-0000-000000000001',title:'Pick del editor original',
  event_name:'Equipo A contra Equipo B',selection:'Equipo A gana',american_odds:150,
  analysis:'Análisis editorial de la selección original.',expires_at:new Date(Date.now()+86400000).toISOString(),
  created_at:new Date().toISOString(),edited_at:null,is_published:true,
  banner_url:'https://example.test/banner.png',image_url:'https://example.test/photo.png',
  banner_focus_x:40,banner_focus_y:50,image_focus_x:50,image_focus_y:60};
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));};
async function setup({settled=false,admin=true}={}){
  const w=new Window({url:'https://camsports.github.io/'});
  w.document.body.innerHTML='<div id="cpWeekly"></div><section id="picksFeatured"><button id="aeWeeklyEditButton" hidden>Editar</button><div id="picksFeaturedCard"></div></section>'+formHTML;
  w.currentAdmin=admin?{id:'another-editor'}:null;
  w.confirm=()=>true;
  const calls=[],uploads=[],rows=[{...original}],outcomes=new Map();
  if(settled)outcomes.set(original.id,{...original,outcome:'won'});
  let failRead=false,settleOnSave=false;
  w.aeEditorialMedia={publicUrl:()=>'',upload:async(file,folder)=>{uploads.push(folder);return null;}};
  w.aeImageFraming={setExisting(){},set(){},get:()=>({x:50,y:50}),safeUrl:u=>u};
  w.db={auth:{onAuthStateChange(){}},from(){
    const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},
      then(resolve,reject){return Promise.resolve({data:rows.filter(r=>r.is_published)}).then(resolve,reject);}};
    return q;
  },rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='cam_admin_weekly_results')return {data:rows.map(r=>({...r,...outcomes.get(r.id),social:[]}))};
    if(name==='cam_weekly_pick_result'){
      if(failRead)return {error:{message:'Failed to fetch'}};
      return {data:outcomes.get(args.p_pick_id)||null};
    }
    if(name==='ae_update_editorial_weekly_pick'){
      if(settleOnSave){outcomes.set(args.p_pick_id,{...original,outcome:'won'});return {error:{message:'El resultado de este Pick ya está confirmado. Publica un Pick nuevo para otra selección.'}};}
      assert.equal(outcomes.has(args.p_pick_id),false,'A settled Pick must never reach update');
      assert.equal(args.p_pick_id,original.id);
      assert.equal(args.p_expected_edited_at,original.edited_at);
      rows[0].title=args.p_title;rows[0].edited_at=new Date().toISOString();
      return {data:args.p_pick_id};
    }
    if(name==='ae_publish_editorial_weekly_pick_visual_v2'){
      const id='00000000-0000-0000-0000-000000000002';
      rows.forEach(r=>r.is_published=false);
      rows.unshift({...original,id,title:args.p_title,selection:args.p_selection,edited_at:null,is_published:true});
      return {data:id};
    }
    throw Error('Unexpected RPC '+name);
  }};
  w.eval(weekly);w.eval(results);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await tick();
  const form=w.document.getElementById('aeWeeklyPickForm');
  return {w,form,calls,uploads,rows,outcomes,
    settle(){outcomes.set(original.id,{...original,outcome:'won'});},
    failRead(){failRead=true;},settleOnSave(){settleOnSave=true;}};
}
function fill(form){
  for(const [key,value]of Object.entries({title:'Nuevo Pick del editor',event_name:'Equipo C contra Equipo D',
    selection:'Equipo C gana',american_odds:'+200',analysis:'Análisis completo para el nuevo Pick.',
    expires_at:new Date(Date.now()+86400000).toISOString().slice(0,16)}))form.elements[key].value=value;
}
const status=x=>x.w.document.getElementById('aeWeeklyPickAdminStatus');
const writes=x=>x.calls.filter(c=>c.name.startsWith('ae_'));
const submit=async x=>{x.form.dispatchEvent(new x.w.Event('submit',{bubbles:true,cancelable:true}));await tick();};

const settled=await setup({settled:true});
assert.equal(settled.w.document.getElementById('aeWeeklyEditButton').textContent,'Publicar nuevo Pick del editor');
settled.w.document.getElementById('aeWeeklyEditButton').click();await tick();
assert.equal(settled.form.elements.title.value,'','A resolved Pick opens a blank new publication');
assert.equal(writes(settled).length,0,'Opening the editor never publishes');
fill(settled.form);await submit(settled);
assert.equal(writes(settled).length,1);
assert.equal(writes(settled)[0].name,'ae_publish_editorial_weekly_pick_visual_v2');
assert.equal('p_pick_id' in writes(settled)[0].args,false,'A new Pick has its own identity');
assert.equal(settled.rows[1].title,original.title,'The confirmed Pick remains unchanged');
assert.equal(settled.outcomes.get(original.id).outcome,'won','The old result remains available');
assert.match(status(settled).textContent,/publicado correctamente/);
await settled.w.happyDOM.close();

const pending=await setup();
pending.w.document.getElementById('aeWeeklyEditButton').click();
assert.equal(pending.form.elements.title.value,original.title);
assert.equal(pending.form.elements.banner_url.value,'','Existing assets are retained rather than reuploaded');
pending.form.elements.title.value='Pick actualizado por otro admin';await submit(pending);
assert.equal(writes(pending).length,1);
assert.equal(writes(pending)[0].name,'ae_update_editorial_weekly_pick');
assert.match(status(pending).textContent,/Cambios guardados/);
await pending.w.happyDOM.close();

const race=await setup();
race.w.document.getElementById('aeWeeklyEditButton').click();
race.form.elements.title.value='Borrador que debe conservarse';race.settle();await submit(race);
assert.equal(writes(race).length,0,'A newly confirmed result is checked before uploads and writes');
assert.equal(race.uploads.length,0);
assert.equal(race.form.elements.title.value,'Borrador que debe conservarse');
assert.match(status(race).textContent,/resultado.*confirmado/);
assert.equal(race.w.document.getElementById('aeWeeklyNewPick').hidden,false);
race.w.confirm=()=>false;race.w.document.getElementById('aeWeeklyNewPick').click();
assert.equal(race.form.elements.title.value,'Borrador que debe conservarse','Cancelling preserves the draft');
race.w.confirm=()=>true;race.w.document.getElementById('aeWeeklyNewPick').click();await tick();
assert.equal(race.form.elements.title.value,'');
assert.equal(race.w.document.getElementById('aeWeeklySaveButton').textContent,'Publicar Pick del editor');
await race.w.happyDOM.close();

const late=await setup();late.w.document.getElementById('aeWeeklyEditButton').click();
late.form.elements.title.value='Borrador después del cierre';late.settleOnSave();await submit(late);
assert.match(status(late).textContent,/resultado.*confirmado/);
assert.equal(late.form.elements.title.value,'Borrador después del cierre');
assert.equal(late.w.document.getElementById('aeWeeklyNewPick').hidden,false,'A result confirmed during save still has a new-Pick action');
await late.w.happyDOM.close();

const network=await setup();network.w.document.getElementById('aeWeeklyEditButton').click();
network.form.elements.title.value='Borrador sin conexión';network.failRead();await submit(network);
assert.equal(writes(network).length,0);assert.equal(network.uploads.length,0);
assert.equal(network.form.elements.title.value,'Borrador sin conexión');
assert.equal(network.w.document.getElementById('aeWeeklySaveButton').disabled,false);
await network.w.happyDOM.close();

const reader=await setup({admin:false,settled:true});
assert.equal(reader.w.document.getElementById('aeWeeklyPickAdmin').hidden,true);
assert.equal(reader.w.document.getElementById('aeWeeklyEditButton').hidden,true);
fill(reader.form);await submit(reader);assert.equal(writes(reader).length,0);
await reader.w.happyDOM.close();
console.log('PASS: resolved Pick replacement, pending editing by another admin, unchanged history, race/connection failures, retained drafts and reader denial.');
