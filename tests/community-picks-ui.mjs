import assert from 'node:assert/strict';
import fs from 'node:fs';
const {Window}=await import(process.env.AE_HAPPY_DOM||'happy-dom');
const w=new Window({url:'https://example.test/RCM-Sports/'});
const d=w.document;
d.body.innerHTML=fs.readFileSync('index.html','utf8').replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi,'');
w.HTMLElement.prototype.scrollIntoView=()=>{};
w.matchMedia=()=>({matches:false});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dayOffset=n=>new Date(Date.parse(today()+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
let user={id:'reader'},records=[],comments=[],votes=new Map(),pickCounter=0;
w.currentCategory='Picks';w.currentAdmin=null;
w.notifyCommunity=()=>{};
w.openUserAuthModal=()=>{w.authOpened=true;};
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
assert.match(d.getElementById('cpStatus').textContent,/Todavía/);
const form=d.getElementById('cpForm');
const fields=()=>[...form.querySelectorAll('input:not([type=checkbox]),textarea')];
const fill=(title,eventName)=>{
  const f=fields();
  f[0].value=title;f[1].value=dayOffset(2);f[2].value='Explicación';
  f[3].value='NFL';f[4].value=eventName;f[5].value='Gana un equipo';f[6].value='+150';
  form.querySelector('[type=checkbox]').checked=true;
};
fill('Mi primer Pick','Equipo A vs B');
await form.onsubmit({preventDefault(){}});
await settle();
assert.equal(records.length,1,'The first Pick must be saved');
assert.equal(d.querySelectorAll('#cpFeed .cp-card').length,1,'Pending Picks must appear in public feed');
assert.equal(d.querySelector('#cpFeed .cp-upvote').disabled,false,'Voting is available before moderation');
assert.equal(d.getElementById('cpComposePanel').open,false,'Publish form closes after success');
assert.doesNotMatch(form.textContent,/Una publicación al día/);
user={id:'voter'};
await w.renderCommunityPicksVisibility();await settle();
d.querySelector('#cpFeed .cp-upvote').click();
await settle();
assert.equal(votes.size,1,'Another account can vote while Pick is pending');
d.querySelector('#cpFeed .cp-card-title a').click();await settle();
assert.equal(d.querySelector('#cpDialog .cp-card-detail')!==null,true);
const reply=d.querySelector('#cpDialog form');
reply.querySelector('textarea').value='Comentario antes de la aprobación';
await reply.onsubmit({preventDefault(){}});await settle();
assert.equal(comments.length,1);
assert.match(d.querySelector('#cpDialog').textContent,/Comentario antes de la aprobación/);
d.querySelector('#cpDialog button').click();await settle();
user={id:'reader'};
fill('Mi segundo Pick','Equipo C vs D');
await form.onsubmit({preventDefault(){}});await settle();
assert.equal(records.length,2,'One account may publish multiple Picks on the same day');
assert.equal(d.querySelectorAll('#cpFeed .cp-card').length,2);
w.filterByCategory('NFL');
assert.equal(d.getElementById('communityPicks').hidden,true);
console.log('PASS: unlimited Picks, pending voting, immediate comments, composer closure and category visibility.');
await w.happyDOM.close();
