import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

const w=new Window({url:'https://camsports.github.io/'}),d=w.document;
d.body.innerHTML=`
<section id="freeTakes" hidden>
 <h2 id="freeTakesTitle"></h2><p id="freeTakesStatus"></p>
 <h3 id="aeTakesFeedHeading"></h3>
 <div id="freeTakesFeed"></div>
 <select id="freeTakesSort"><option value="new">Nuevo</option></select>
 <select id="freeTakesSportFilter"><option value="all">Todos</option><option value="nfl">NFL</option></select>
 <div id="freeTakesFilterWrap"></div><div id="aeNflFeedFilterWrap"></div>
 <select id="aeNflFeedDivision"></select>
 <button id="freeTakesMore" hidden></button>
</section>`;
const posts=Array.from({length:42},(_,i)=>({
 id:'take-'+i,author_id:i===0?'current-user':'other-'+i,
 author:i===0?'yo':'autor'+i,created_at:new Date(Date.now()-i*100000).toISOString(),
 sport:'football',competition:'LaLiga',title:'Opinión de fútbol '+i,
 body:'Un Take deportivo que debe seguir siendo legible y abrir la conversación completa.',
 upvotes:i+3,downvotes:i,my_vote:i===1?1:0
}));
const nfl={...posts[0],id:'nfl-1',sport:'nfl',author_id:'current-user'};
const replies=[];
let voteCalls=0;
w.currentCategory='Fútbol';
w.aeTakeReplies={open:(take,options)=>replies.push({id:take.id,options})};
w.openAePublicProfile=id=>{w.__openedProfile=id;};
w.db={
 auth:{getUser:async()=>({data:{user:{id:'current-user'}},error:null}),onAuthStateChange(){}},
 rpc:async(name,args)=>{
  if(name==='ae_public_take_feed')return {data:args?.p_sport==='nfl'?[nfl]:posts,error:null};
  if(name==='ae_public_take_reply_counts')
   return {data:(args.p_take_ids||[]).map(id=>({take_id:id,reply_count:3})),error:null};
  if(name==='ae_vote_free_take'){
   voteCalls++;
   const row=posts.find(p=>p.id===args.p_take_id);
   if(!row||row.author_id==='current-user')return {data:null,error:{message:'No puedes votarte'}};
   if(row.my_vote===1)row.upvotes=Math.max(0,row.upvotes-1);
   if(args.p_value===1)row.upvotes++;else row.downvotes++;
   row.my_vote=args.p_value;
   return {data:null,error:null};
  }
  return {data:[],error:null};
 }
};
w.eval(fs.readFileSync('assets/free-takes.js','utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
async function tick(){for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));}
await tick();
assert.equal(d.querySelectorAll('#freeTakesFeed .ae-free-take-card').length,20,'First batch has 20 Takes');
assert.equal(d.querySelector('#freeTakesFeed .ae-free-take-card').dataset.takeId,'take-0','Newest first');
const own=d.querySelector('[data-take-id="take-0"]'),other=d.querySelector('[data-take-id="take-1"]');
const voteButtons=card=>[...card.querySelectorAll('.cam-football-vote')];
assert.equal(voteButtons(own).length,2,'Own Takes still show both vote totals');
assert.equal(voteButtons(other).length,2,'Other users still show both vote buttons');
assert(voteButtons(own).every(button=>button.disabled),'Self-voting remains forbidden');
assert(voteButtons(other).every(button=>!button.disabled),'Other votes stay available');
assert.equal(voteButtons(own)[0].querySelector('.cam-football-vote-count').textContent,'3');
assert.equal(voteButtons(own)[1].querySelector('.cam-football-vote-count').textContent,'0');
assert.equal(voteButtons(other)[0].getAttribute('aria-pressed'),'true','Prior vote is highlighted');
assert.equal(own.querySelector('.ae-take-reply-count').textContent,'3');
assert.equal(other.querySelector('.ae-take-reply-count').textContent,'3');
assert.equal(own.querySelectorAll('.cam-football-replies').length,1);
assert.equal(other.querySelectorAll('.cam-football-replies').length,1);
own.querySelector('.cam-football-replies').click();
assert.equal(replies.at(-1).id,'take-0');
assert.equal(replies.at(-1).options.focusComposer,true);
other.querySelector('.ae-take-author-link').click();
assert.equal(w.__openedProfile,'other-1');
voteButtons(other)[1].click();
await tick();
assert.equal(voteCalls,1,'Vote follows existing authenticated RPC exactly once');
assert.equal(d.querySelectorAll('[data-take-id="take-1"] .cam-football-vote-count')[0].textContent,'3','Changing votes removes the prior upvote');
assert.equal(d.querySelectorAll('[data-take-id="take-1"] .cam-football-vote-count')[1].textContent,'2','Changing votes increases downvotes');
assert.equal(d.getElementById('freeTakesMore').hidden,false,'Older Takes can be discovered');
d.getElementById('freeTakesMore').click();
await tick();
assert.equal(d.querySelectorAll('#freeTakesFeed .ae-free-take-card').length,40,'Second batch adds 20');
d.getElementById('freeTakesMore').click();
await tick();
assert.equal(d.querySelectorAll('#freeTakesFeed .ae-free-take-card').length,42,'No take silently lost');
assert.equal(d.querySelector('#freeTakesFeed .ae-free-take-card:last-child').dataset.takeId,'take-41');
assert.equal(d.getElementById('freeTakesMore').hidden,true,'Pagination ends only when all fetched Takes are shown');
w.currentCategory='NFL';w.renderFreeTakesVisibility();await tick();
assert.equal(d.querySelectorAll('#freeTakesFeed .ae-free-take-card').length,1);
assert.equal(d.getElementById('freeTakesMore').hidden,true);
assert.equal(d.querySelectorAll('.cam-football-vote').length,0,'NFL UI remains unchanged');
assert.equal(d.querySelectorAll('#freeTakesFeed .ae-free-vote-row .ae-take-reply-link').length,1);
const style=fs.readFileSync('assets/cam-football-last-takes-feed.css','utf8');
assert(style.includes('.ae-is-football')&&!style.includes('.ae-is-nfl'),'New styles only target Football');
assert(style.includes('grid-template-columns:minmax(0,1fr)!important'),'Mobile shows one column');
assert(style.includes('html:not(.dark)')&&style.includes('--cam-ft-paper:#102c3e'),'Day and night palettes exist');
assert(style.includes('cam-football-replies'),'Compact replies are styled');
await w.happyDOM.close();
console.log('PASS: Football own/other counts, self-vote permission, selected vote, comments, profiles, 42 Takes pagination; NFL unchanged.');
