import assert from 'node:assert/strict';
import fs from 'node:fs';
const {Window}=await import(process.env.AE_HAPPY_DOM||'happy-dom');
const w=new Window({url:'https://example.test/RCM-Sports/'});
const d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.matchMedia=()=>({matches:false});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dayOffset=n=>new Date(Date.parse(today()+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
let user={id:'reader'},records=[],comments=[],votes=new Map(),pickCounter=0,failPublish=false;
w.currentCategory='Picks';w.currentAdmin=null;
w.notifyCommunity=()=>{};
w.openUserAuthModal=()=>{w.authOpened=true;};
w.aeRequestPublication=async(kind,continueToComposer)=>{
 const response=await w.db.auth.getUser();
 if(response.data?.user)continueToComposer();
 else{w.authOpened=true;w.pendingPublication=continueToComposer;}
};
w.filterByCategory=category=>{w.currentCategory=category;w.renderCommunityPicksVisibility();};
w.db={
  auth:{getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>{}},
  rpc:async()=>({data:[],error:null}),
  from(table){
    let operation='select',payload={},filters=[],limit=1000,single=false;
    const q={
      select(){return q;},
      insert(v){operation='insert';payload=v;return q;},
      update(v){operation='update';payload=v;return q;},
      delete(){operation='delete';return q;},
      eq(key,value){filters.push(p=>p[key]===value);return q;},
      gte(key,value){filters.push(p=>p[key]>=value);return q;},
      lte(key,value){filters.push(p=>p[key]<=value);return q;},
      gt(key,value){filters.push(p=>p[key]>value);return q;},
      lt(key,value){filters.push(p=>p[key]<value);return q;},
      in(key,values){filters.push(p=>values.includes(p[key]));return q;},
      is(key,value){filters.push(p=>p[key]===value);return q;},
      order(){return q;},
      range(a,b){limit=b-a+1;return q;},
      limit(n){limit=n;return q;},
      single(){single=true;return q;},
      maybeSingle(){single=true;return q;},
      then(resolve,reject){
        if(operation==='insert'&&table==='ae_community_picks'){
          if(failPublish)return Promise.resolve({data:null,error:{message:'Fallo de conexión de prueba'}}).then(resolve,reject);
          pickCounter++;
          records.push({...payload,id:'12345678-1234-1234-1234-'+String(pickCounter).padStart(12,'0'),user_id:user.id,author:'Lector',moderation_status:'pending',outcome:'pending',hidden:false,created_at:new Date().toISOString(),is_current_week:true,american_odds:150});
        }
        if(operation==='insert'&&table==='ae_pick_comments'){
          comments.push({...payload,id:'comment-'+(comments.length+1),user_id:user.id,author:'Lector',hidden:false,created_at:new Date().toISOString()});
        }
        if(table==='ae_pick_votes'&&operation==='insert')votes.set(payload.pick_id+'|'+user.id,payload.value);
        const enriched=r=>({...r,upvotes:[...votes].filter(([k,v])=>k.startsWith(r.id+'|')&&v===1).length,downvotes:[...votes].filter(([k,v])=>k.startsWith(r.id+'|')&&v===-1).length,score:[...votes].filter(([k])=>k.startsWith(r.id+'|')).reduce((n,[,v])=>n+v,0),my_vote:votes.get(r.id+'|'+user?.id)||0,comments_count:comments.filter(c=>c.pick_id===r.id).length});
        let result=table==='ae_pick_comments'?comments.map(c=>({...c})):table==='ae_pick_votes'?[]:records.map(enriched);
        result=result.filter(r=>filters.every(test=>test(r))).slice(0,limit);
        return Promise.resolve({data:single?result[result.length-1]||null:result,error:null}).then(resolve,reject);
      }
    };
    return q;
  }
};
const settle=()=>new Promise(resolve=>setTimeout(resolve,40));
await settle();
w.eval(fs.readFileSync('assets/community-picks.js','utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await settle();
const form=d.getElementById('cpForm'),modal=d.getElementById('cpComposePanel');
const input=name=>form.elements.namedItem(name);
const fill=()=>{input('sport_0').value='Baloncesto';input('event_0').value='Toronto vs Boston';input('selection_0').value='Toronto gana';input('odds_0').value='+150';};
d.getElementById('cpPublishCta').click();await settle();
assert.equal(modal.open,true);
assert.equal(input('sport_0').tagName,'INPUT');assert.equal(input('event_0').tagName,'INPUT');
assert.equal(form.querySelector('select'),null);
assert.equal(input('event_date').value,today());
assert.equal(form.querySelector('details').open,false);
fill();input('odds_0').value='+50';await form.onsubmit({preventDefault(){}});assert.equal(records.length,0);
input('odds_0').value='+150';failPublish=true;await form.onsubmit({preventDefault(){}});
assert.equal(modal.open,true);assert.equal(input('event_0').value,'Toronto vs Boston');assert.match(form.querySelector('.cp-status').textContent,/Fallo/);
failPublish=false;await form.onsubmit({preventDefault(){}});await settle();
assert.equal(records.length,1);assert.equal(records[0].title,'Toronto vs Boston');assert.equal(records[0].legs[0].sport,'Baloncesto');assert.equal(modal.open,false);
d.getElementById('cpPublishCta').click();await settle();fill();
[...form.querySelectorAll('button')].find(b=>b.textContent==='Combinada').click();
assert.equal(form.querySelectorAll('fieldset').length,2);
input('sport_1').value='Fútbol';input('event_1').value='Madrid vs Barça';input('selection_1').value='Ambos anotan';input('odds_0').value='-110';input('odds_1').value='-110';
await form.onsubmit({preventDefault(){}});await settle();
assert.equal(records.length,2);assert.equal(records[1].legs.length,2);assert.match(records[1].title,/Toronto vs Boston \/ Madrid vs Barça/);
assert.equal(form.querySelectorAll('fieldset').length,1);assert.equal(input('event_date').value,today());
console.log('Direct composer: typed sport/match, validation, draft recovery, simple and combined publishing passed.');
process.exit(0);
