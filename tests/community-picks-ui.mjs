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
let user={id:'reader'},records=[],comments=[],votes=new Map(),pickCounter=0,failPublish=false,authChanged=null;
w.currentCategory='Picks';w.currentAdmin=null;
w.notifyCommunity=()=>{};
w.openUserAuthModal=()=>{w.authOpened=true;};
w.aeRequestPublication=async(kind,continueToComposer,onAuthRequired)=>{
 const response=await w.db.auth.getUser();
 if(response.data?.user)continueToComposer();
 else{onAuthRequired?.();w.authOpened=true;w.pendingPublication=continueToComposer;}
};
w.filterByCategory=category=>{w.currentCategory=category;w.renderCommunityPicksVisibility();};
w.db={
  auth:{getUser:async()=>({data:{user},error:null}),onAuthStateChange:callback=>{authChanged=callback;}},
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
// Isolate the feed/auth interactions; real import/OCR binding is exercised by test:capture.
w.aePickCapture={mount:({getPicks})=>({hasImport:()=>true,getTotal:()=>null,proof:()=>({version:1,method:'on_device_ocr',confirmed:true,readings:getPicks().map(p=>({...p,confidence:95}))})})};
w.eval(fs.readFileSync('assets/community-picks.js','utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
await settle();
assert.match(d.getElementById('cpStatus').textContent,/Todavía/);
const form=d.getElementById('cpForm');
const field=name=>form.elements.namedItem(name);
const fill=(title,eventName)=>{
  field('event_date').value=dayOffset(2);field('explanation').value=title;
  field('sport_0').value='NFL';field('event_0').value=eventName;field('selection_0').value='Gana un equipo';field('odds_0').value='+150';
};
const modal=d.getElementById('cpComposePanel'),cta=d.getElementById('cpPublishCta');
assert.equal(modal.tagName,'DIALOG');
assert.equal(d.querySelector('#communityPicks #cpComposePanel'),null,'Composer must be outside the feed');
assert.ok(!d.body.textContent.includes('Preparar mi Pick'));
cta.click();await settle();assert.equal(modal.open,true);assert.equal(cta.getAttribute('aria-expanded'),'true');
assert.ok(d.body.classList.contains('ae-pick-composing'));
fill('Mi primer Pick','Equipo A vs B');
d.getElementById('cpComposeClose').click();await settle();assert.equal(modal.open,false);
assert.equal(field('explanation').value,'Mi primer Pick','Closing preserves the draft');
cta.click();await settle();
failPublish=true;await form.onsubmit({preventDefault(){}});await settle();
assert.equal(records.length,0);assert.equal(modal.open,true);
assert.equal(field('explanation').value,'Mi primer Pick');assert.match(form.querySelector('.cp-status').textContent,/Fallo de conexión/);
assert.equal(form.querySelector('button[type=submit]').disabled,false);
failPublish=false;
await form.onsubmit({preventDefault(){}});
await settle();
assert.equal(records.length,1,'The first Pick must be saved');
assert.equal(d.querySelectorAll('#cpFeed .cp-card').length,1,'Pending Picks must appear in public feed');
assert.equal(d.querySelector('#cpFeed .cp-upvote'),null,'Authors do not see voting controls on their own Pick');
assert.equal(d.getElementById('cpComposePanel').open,false,'Publish form closes after success');
assert.doesNotMatch(form.textContent,/Una publicación al día/);
user={id:'voter'};
authChanged();await settle();
await w.renderCommunityPicksVisibility();await settle();
assert.equal(d.querySelector('#cpFeed .cp-upvote').disabled,false,'Other readers can vote before moderation');
d.querySelector('#cpFeed .cp-upvote').click();
await settle();
assert.equal(votes.size,1,'Another account can vote while Pick is pending');
/* A capture-based combination displays each market as its own numbered item. */
records[0].legs[0].selection='Paris St-G · MONEYLINE (3-WAY) + Over 3.5 Goals · OVER/UNDER 3.5 GOALS + Yes · BOTH TEAMS TO SCORE';
d.querySelector('#cpFeed .cp-downvote').click();await settle();
assert.equal(d.querySelectorAll('#cpFeed .cp-pick-line').length,3,'Combined Picks display three individually separated markets');
assert.equal(d.querySelector('#cpFeed .cp-picks-count'),null,'No count labels appear in Picks');
assert.equal(d.querySelector('#cpFeed .cp-card-legs').tagName,'OL','Picks use one ordered, accessible list');
assert.equal(d.querySelector('#cpFeed .cp-pick-line-number'),null,'Connecting circles replace numbered boxes');
assert.equal(d.querySelector('#cpFeed .cp-feed-meta .cp-card-sport').textContent,'NFL');
assert.equal(d.querySelector('#cpFeed .cp-feed-meta .cp-odds').textContent,'Cuota +150');
assert.equal(d.querySelector('#cpFeed .cp-feed-meta .cp-card-odds').parentElement.className,'cp-feed-meta','Odds are located below the sport, within the header');

assert.match(d.querySelectorAll('#cpFeed .cp-pick-line')[1].textContent,/Más de 3.5 goles/);
assert.match(d.querySelectorAll('#cpFeed .cp-pick-line')[2].textContent,/Ambos equipos marcan/);

d.querySelector('#cpFeed .cp-card-read-link').click();await settle();
assert.equal(d.querySelector('#cpDialog .cp-card-detail')!==null,true);
assert.ok(d.querySelector('#cpDialog .cp-recipe-card'),'Chef recipe uses unified design');
assert.equal(d.querySelector('#cpDialog .cp-recipe-card .cp-card-legs').tagName,'OL');
assert.equal(d.querySelectorAll('#cpDialog .cp-recipe-card .cp-pick-line').length,3,'Combo keeps every selection when opened');
assert.match(d.querySelectorAll('#cpDialog .cp-recipe-card .cp-pick-line-choice')[1].textContent,/Más de 3.5 goles/);
assert.match(d.querySelectorAll('#cpDialog .cp-recipe-card .cp-pick-line-choice')[2].textContent,/Ambos equipos marcan/);
assert.equal(d.querySelector('#cpDialog .cp-recipe-card .cp-feed-meta .cp-odds').textContent,'Cuota +150');
assert.match(d.querySelector('#cpDialog .cp-recipe-card .cp-pick-line-market').textContent,/Ganador · 3 vías/,'Chef recipe includes a readable market label');
assert.match(d.querySelectorAll('#cpDialog .cp-recipe-card .cp-pick-line-market')[1].textContent,/Total de goles/);
assert.match(d.querySelectorAll('#cpDialog .cp-recipe-card .cp-pick-line-market')[2].textContent,/Ambos equipos marcan/);


const reply=d.querySelector('#cpDialog form');
reply.querySelector('textarea').value='Comentario antes de la aprobación';
await reply.onsubmit({preventDefault(){}});await settle();
assert.equal(comments.length,1);
assert.match(d.querySelector('#cpDialog').textContent,/Comentario antes de la aprobación/);
d.querySelector('#cpDialog button').click();await settle();
// Community plates use current net votes: restore a positive vote before
// asserting the Pick belongs in Mejores Platos (it was downvoted above).
d.querySelector('#cpFeed .cp-upvote').click();await settle();
assert.equal(votes.get(records[0].id+'|voter'),1);
// The "Mejores platos" Pick remains readable by guests; writing a reply
// requires login and then resumes at the same Pick with the reply field focused.
const bestPick=d.querySelector('#picksPopular .cp-card-read-link');
assert.ok(bestPick,'A positively voted Pick must appear in Mejores platos');
assert.equal(bestPick.parentElement.classList.contains('cam-pick-unified'),true);
assert.ok(bestPick.href.includes('pick='),'Mejores Platos has a working Pick permalink');
assert.ok(bestPick.getAttribute('aria-label').includes('Leer Pick completo'));
user=null;w.authOpened=false;bestPick.click();await settle();
assert.equal(w.authOpened,false,'Reading Mejores platos is public');
assert.ok(d.querySelector('#cpDialog .cp-login-to-reply'),'Guest has an authenticated reply action');
d.querySelector('#cpDialog .cp-login-to-reply').click();await settle();
assert.equal(w.authOpened,true,'Mejores platos requests account access');
assert.equal(d.querySelector('#cpDialog')?.open||false,false,'Guest cannot open the reply composer');
user={id:'voter'};w.pendingPublication();await settle();
assert.equal(d.querySelector('#cpDialog')?.open,true,'Reply conversation resumes after login');
assert.equal(d.activeElement,d.querySelector('#cpDialog form textarea'),'Reply field is focused');
d.querySelector('#cpDialog button').click();await settle();
// Archived Picks must enforce the same authentication requirement.
user=null;w.authOpened=false;
d.getElementById('cpViewAll').click();await settle();
const archivedReply=d.querySelector('#cpArchiveFeed .cp-replies-button');
assert.ok(archivedReply,'Archive has a replies button');
archivedReply.click();await settle();
assert.equal(w.authOpened,true,'Archive replies require account access');
assert.equal(d.querySelector('#cpDialog')?.open||false,false);
user={id:'voter'};w.pendingPublication();await settle();
assert.equal(d.querySelector('#cpDialog')?.open,true,'Login resumes archived Pick replies');
d.querySelector('#cpDialog button').click();await settle();
d.getElementById('cpArchiveClose').click();await settle();
// Reading a Pick remains public, but its reply form stays behind login.
user=null;w.authOpened=false;
d.querySelector('#cpFeed .cp-card-read-link').click();await settle();
assert.ok(d.querySelector('#cpDialog .cp-login-to-reply'),'Guests receive a sign-in CTA instead of the reply form');
assert.equal(d.querySelector('#cpDialog form'),null);
d.querySelector('#cpDialog .cp-login-to-reply').click();await settle();
assert.equal(w.authOpened,true);assert.equal(d.querySelector('#cpDialog')?.open||false,false);
user={id:'voter'};w.pendingPublication();await settle();
assert.equal(d.querySelector('#cpDialog')?.open,true,'Login resumes the original Pick');
d.querySelector('#cpDialog button').click();await settle();
user={id:'reader'};
fill('Mi segundo Pick','Equipo C vs D');
await form.onsubmit({preventDefault(){}});await settle();
assert.equal(records.length,2,'One account may publish multiple Picks on the same day');
assert.equal(d.querySelectorAll('#cpFeed .cp-card').length,2);
w.filterByCategory('NFL');
assert.equal(d.getElementById('communityPicks').hidden,true);
// Authentication can take time: an immediate second submission must be ignored.
w.filterByCategory('Picks');cta.click();await settle();fill('Tercer Pick sin duplicado','Equipo E vs F');
let releaseAuth;const authGate=new Promise(resolve=>{releaseAuth=resolve;});
const getUser=w.db.auth.getUser;w.db.auth.getUser=async()=>{await authGate;return {data:{user},error:null};};
const first=form.onsubmit({preventDefault(){}});
assert.equal(form.querySelector('button[type=submit]').disabled,true);
assert.equal(d.getElementById('cpComposeClose').disabled,true);
const cancellation=new w.Event('cancel',{cancelable:true});modal.dispatchEvent(cancellation);assert.equal(cancellation.defaultPrevented,true);
await form.onsubmit({preventDefault(){}});releaseAuth();await first;await settle();
assert.equal(records.length,3,'Double submit must only save one record');assert.equal(modal.open,false);
w.db.auth.getUser=getUser;
// "¿Eres Chef? Cocina Picks" must never navigate away before authentication.
user=null;w.authOpened=false;w.filterByCategory('Todos');cta.click();await settle();
assert.equal(w.authOpened,true);assert.equal(modal.open,false,'Guests cannot open the Pick composer');
assert.equal(w.currentCategory,'Todos','A guest remains on their original page for login');
user={id:'reader'};await w.pendingPublication();await settle();
assert.equal(w.currentCategory,'Picks','After login, return to Picks to publish');
assert.equal(modal.open,true,'Authentication resumes the Pick composer');
// If the session expires during editing, retain the draft and reopen after login.
fill('Borrador sin sesión','Equipo G vs H');user=null;w.authOpened=false;
await form.onsubmit({preventDefault(){}});await settle();assert.equal(w.authOpened,true);assert.equal(modal.open,false);
assert.equal(field('explanation').value,'Borrador sin sesión');assert.equal(records.length,3);
assert.equal(d.body.classList.contains('ae-pick-composing'),false);
// Mobile Chef recipe: review responsive structure without opening a browser viewport.
const chefMobileCss=fs.readFileSync('assets/ae-chef-parchment-mobile.css','utf8');
assert.ok(chefMobileCss.includes('@media screen and (max-width:780px)'), 'Phone-specific styles must exist');
assert.match(chefMobileCss,/height:100dvh!important/,'Mobile modal uses the dynamic viewport');
assert.match(chefMobileCss,/safe-area-inset-bottom/,'Composer stays inside the mobile safe area');
assert.match(chefMobileCss,/min-height:44px!important/,'Close and vote controls preserve touch targets');
assert.ok(chefMobileCss.includes('grid-column:1/-1!important'), 'Author and metadata can use the full phone width');
assert.match(chefMobileCss,/cp-pick-line-choice/,'Pick selections remain visible in the mobile layout');
const orderedCss=JSON.parse(fs.readFileSync('assets/style-sources.json','utf8'));
assert.ok(orderedCss.indexOf('assets/ae-chef-parchment-mobile.css')>orderedCss.indexOf('assets/ae-chef-parchment-b.css'),'Mobile overrides compile after the desktop parchment design, even if later unrelated CSS is added');
console.log('PASS: auth before Mejores platos replies, public reading, resume, publishing, voting and drafts.');
await w.happyDOM.close();
