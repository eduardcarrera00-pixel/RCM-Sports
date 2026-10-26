import assert from 'node:assert/strict';
import fs from 'node:fs';
const {Window}=await import(process.env.AE_HAPPY_DOM||'happy-dom');
const w=new Window({url:'https://example.test/RCM-Sports/'});
const d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<link\b[^>]*>/gi,'');
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
records.push({id:'12345678-1234-1234-1234-000000000001',user_id:'author-1',author:'sofia007',title:'Monterrey vs Tigres · Tigres gana',legs:[{sport:'Fútbol',event:'Monterrey vs Tigres',selection:'Tigres gana',odds:200}],event_date:dayOffset(1),outcome:'pending',moderation_status:'pending',american_odds:200,explanation:'Mi análisis',is_current_week:true,created_at:new Date().toISOString()});
d.dispatchEvent(new w.Event('visibilitychange'));await settle();
let openedProfile=null;w.openAePublicProfile=id=>{openedProfile=id;};
const card=d.querySelector('#cpFeed .cp-card');assert.ok(card.classList.contains('cp-feed-editorial'));
assert.equal(card.querySelector('.cp-card-title').textContent,'Monterrey vs Tigres');
assert.equal(card.querySelector('.cp-pick-line-choice').textContent,'Tigres gana');
assert.equal(card.querySelector('.cp-card-legs').tagName,'OL');
assert.equal(card.querySelector('.cp-picks-count'),null,'Single/combo labels are removed');
assert.equal(card.querySelector('.cp-feed-meta .cp-card-sport').textContent,'Fútbol');
assert.equal(card.querySelector('.cp-feed-meta .cp-odds').textContent,'Cuota +200');
assert.equal(card.querySelector('.cp-feed-meta .cp-card-odds').parentElement.className,'cp-feed-meta');

assert.equal(card.querySelector('.cp-pick-line-number'),null);
assert.equal(card.querySelector('.cp-feed-initial').textContent,'S');
card.querySelector('.cp-feed-author').click();assert.equal(openedProfile,'author-1');
const replies=card.querySelector('.cp-replies-button');assert.match(replies.textContent,/Respuestas 0/);assert.ok(replies.querySelector('svg'));
replies.click();await settle();assert.ok(d.querySelector('#cpDialog .cp-card-detail'));
assert.equal(d.querySelector('#cpDialog .cp-recipe-card .cp-card-legs').tagName,'OL','Recipe and feed use the same list');
assert.equal(d.querySelector('#cpDialog .cp-recipe-card .cp-pick-line-choice').textContent,'Tigres gana');
assert.equal(d.querySelector('#cpDialog .cp-recipe-card .cp-feed-meta .cp-card-sport').textContent,'Fútbol');
assert.equal(d.querySelector('#cpDialog .cp-recipe-card .cp-feed-meta .cp-odds').textContent,'Cuota +200');
assert.match(d.querySelector('#cpDialog .cp-card-title').textContent,/Tigres gana/,'Conversation retains original title');
d.querySelector('#cpDialog button').click();await settle();
card.querySelector('.cp-upvote').click();await settle();assert.equal(votes.size,1);
d.getElementById('cpViewAll').click();await settle();
assert.equal(Boolean(d.querySelector('#cpArchiveFeed .cam-ticket-card')),true,'Archive uses the shared ticket renderer');
assert.match(d.querySelector('#cpArchiveFeed .cp-pick-line-choice').textContent,/Tigres gana/);
records[0].moderation_status='approved';
records[0].capture_check={method:'on_device_ocr'};
d.dispatchEvent(new w.Event('visibilitychange'));await settle();
assert.equal(d.querySelector('#cpFeed .cp-card-state'),null,'Approved OCR source note is not displayed on feed');
console.log('Editorial Pick cards: readable title, profile, replies, pending votes, and original archive/detail passed.');process.exit(0);
