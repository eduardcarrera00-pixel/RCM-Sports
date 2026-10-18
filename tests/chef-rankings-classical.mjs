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
const rpcCalls=[];
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
  rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:Array.from({length:10},(_,i)=>({user_id:'chef-'+i,username:'chef_'+i,points:(name.includes('worst')?-1:1)*(10-i),total_resolved:5,correct_picks:name.includes('worst')?1:4})),error:null};},
  from(table){
    let operation='select',payload={},filters=[],limit=1000,single=false;
    const q={
      select(){return q;},not(){return q;},
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
assert.equal(d.querySelectorAll('.ae-chefs-classical .ae-chefs-table-cols span').length,8);
assert.equal(d.querySelectorAll('#cpLeaderboard .ae-cp-leader').length,10);
assert.equal(d.querySelectorAll('#cpWorstLeaderboard .ae-cp-leader').length,10);
assert.equal(d.querySelector('#cpLeaderboard .ae-chef-score-points').textContent,'+10.00');
assert.equal(d.querySelector('#cpWorstLeaderboard .ae-chef-score-points').textContent,'−10.00');
assert.equal(d.querySelector('#cpLeaderboard .ae-chef-accuracy').textContent,'80%');
assert.equal(d.querySelector('#cpWorstLeaderboard .ae-chef-accuracy').textContent,'20%');
assert.equal(d.querySelectorAll('.ae-chefs-art-heading').length,2);
assert.equal(d.querySelector('.ae-worst-chefs-intro'),null);
assert.ok(!d.querySelector('.ae-chefs-art-heading').textContent.includes('Acierto'));
d.getElementById('cpWorstRankHistory').click();await settle();
assert.ok(rpcCalls.some(c=>c.name==='ae_pick_result_ranking_worst'&&c.args.p_period==='all'));
assert.equal(d.getElementById('cpRankMonth').getAttribute('aria-pressed'),'true');
assert.equal(d.getElementById('cpWorstRankHistory').getAttribute('aria-pressed'),'true');
console.log('Chef rankings: ten real rows, separate periods, numeric points/accuracy, and clean headings passed.');process.exit(0);
