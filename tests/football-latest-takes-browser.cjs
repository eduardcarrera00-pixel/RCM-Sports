/* Fútbol Últimos Takes: compact cards on desktop/mobile, day/night, and own voting stats. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd(),qa=process.env.CAM_FOOTBALL_TAKES_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-ft-'));
fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){
  const html=fs.readFileSync('index.html','utf8')
   .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
   .replace(/<link\b[^>]*https?:[^>]*>/gi,'')
   .replace('</body>','<script src="assets/free-takes.js"></script></body>');
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
 }
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const launch={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};
 if(process.env.CAM_TEST_CHROMIUM_PACKAGE){
  const vendor=require(process.env.CAM_TEST_CHROMIUM_PACKAGE),api=vendor.default||vendor;
  launch.executablePath=await api.executablePath();launch.args=[...api.args,'--disable-dev-shm-usage'];
 }
 const browser=await chromium.launch(launch);
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
  await page.addInitScript(()=>{
   window.currentCategory='Fútbol';
   window.__commentOpens=[];
   window.aeTakeReplies={open:t=>window.__commentOpens.push(t.id)};
   window.openAePublicProfile=id=>{window.__profileOpened=id;};
   const now=Date.now(),data=Array.from({length:42},(_,i)=>({
    id:'take-'+i,title:'El campeón se decide en los detalles '+i,
    author:'aficionado_'+i,author_id:i===0?'current-user':'other-'+i,
    sport:'football',competition:'LaLiga',body:'El fútbol se vive, se analiza y se debate: un partido cambia con cada decisión del entrenador.',
    created_at:new Date(now-i*60000).toISOString(),upvotes:i+2,downvotes:i,my_vote:i===1?1:0
   }));
   window.db={
    auth:{getUser:async()=>({data:{user:{id:'current-user'}}}),onAuthStateChange(){}},
    rpc:async(name,args)=>{
     if(name==='ae_public_take_feed')return {data,error:null};
     if(name==='ae_public_take_reply_counts')return {data:args.p_take_ids.map(take_id=>({take_id,reply_count:4})),error:null};
     if(name==='ae_vote_free_take')return {data:null,error:null};
     return {data:[],error:null};
    }
   };
  });
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.evaluate(()=>document.body.classList.add('ae-is-football'));
  await page.waitForSelector('#freeTakesFeed > article.ae-free-take-card:nth-child(20)');
  for(const width of [360,390,768,1024,1366])for(const dark of [false,true]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const result=await page.evaluate(()=>{
    const feed=document.querySelector('#freeTakesFeed'),cards=[...feed.querySelectorAll(':scope > article.ae-free-take-card')];
    const own=cards[0],other=cards[1],ownVotes=[...own.querySelectorAll('.cam-football-vote')];
    const css=getComputedStyle(feed),r=feed.getBoundingClientRect();
    const gridWidth=(css.gridTemplateColumns||'').split(' ').filter(Boolean).length;
    return {
     twenty:cards.length===20,
     oldestScroll:feed.scrollHeight>feed.clientHeight+4&&css.overflowY==='auto',
     visibleWithoutWholePage:feed.clientHeight<=545,
     gridColumns:gridWidth,
     firstIsLatest:own.dataset.takeId==='take-0',
     allVoteControls:cards.every(card=>card.querySelectorAll('.cam-football-vote').length===2),
     ownVotesDisabled:ownVotes.every(b=>b.disabled),
     ownCountsVisible:ownVotes.every(b=>b.querySelector('.cam-football-vote-count')?.textContent),
     otherVoteEnabled:other.querySelector('.cam-football-vote:not(:disabled)')!==null,
     repliesVisible:cards.every(card=>card.querySelector('.cam-football-replies .ae-take-reply-count').textContent==='4'),
     noOverflow:feed.scrollWidth<=feed.clientWidth+2,
     cardFits:cards.slice(0,6).every(card=>{const box=card.getBoundingClientRect();return box.width>150&&box.height>=150;}),
     feedFits:r.left>=-1&&r.right<=innerWidth+1
    };
   });
   assert(Object.entries(result).every(([k,v])=>k==='gridColumns'||Boolean(v)),JSON.stringify({width,dark,result}));
   assert.equal(result.gridColumns,width<=760?1:width<=960?2:width<=1299?3:4,JSON.stringify({width,dark,result}));
   if([390,1366].includes(width))await page.locator('#freeTakesFeed').screenshot({path:path.join(qa,'football-'+width+'-'+(dark?'night':'day')+'.png')});
  }
  await page.locator('#freeTakesFeed [data-take-id="take-1"] .cam-football-replies').click();
  assert.deepEqual(await page.evaluate(()=>window.__commentOpens),['take-1'],'Comments remain linked to the Take');
  await page.locator('#freeTakesFeed [data-take-id="take-1"] .ae-take-author-link').click();
  assert.equal(await page.evaluate(()=>window.__profileOpened),'other-1','Author profiles remain clickable');
  await page.locator('#freeTakesMore').click();
  assert.equal(await page.locator('#freeTakesFeed > article.ae-free-take-card').count(),40,'Older Takes load on request');
  assert.deepEqual(errors,[]);
  console.log('PASS: Fútbol compact Take cards, own vote totals, comments, profile navigation, older Takes and responsive layout in both themes. QA screenshots '+qa);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});