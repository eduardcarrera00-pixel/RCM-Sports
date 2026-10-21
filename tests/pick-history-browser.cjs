/* Real CSS/layout and concurrent public-history refreshes, with isolated data. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd(),qa=process.env.CAM_HISTORY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-history-'));
fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){
  const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https?:[^>]*>/gi,'').replace('</body>','<script src="assets/community-picks.js"></script><script src="assets/ae-picks-premium.js"></script></body>');
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
 }
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const launch={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};
 if(process.env.CAM_TEST_CHROMIUM_PACKAGE){const vendor=require(process.env.CAM_TEST_CHROMIUM_PACKAGE);const api=vendor.default||vendor;launch.executablePath=await api.executablePath();launch.args=[...api.args,'--disable-dev-shm-usage'];}
 const browser=await chromium.launch(launch);
 try{
 const page=await browser.newPage({viewport:{width:1366,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
 await page.addInitScript(()=>{
  window.currentCategory='Picks';window.currentAdmin=null;
  const pick={id:'00000000-0000-0000-0000-000000000001',user_id:'reader',author:'eduardcarrera00',title:'Paris St-G v Barcelona',american_odds:240,event_date:new Date().toISOString().slice(0,10),created_at:new Date().toISOString(),settled_at:new Date().toISOString(),outcome:'won',moderation_status:'approved',result_points:2.4,legs:[{sport:'Fútbol',event:'Paris St-G v Barcelona',selection:'Barcelona gana',odds:240}]};
  let requests=0;
  window.db={auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange(){}},rpc:async()=>({data:[],error:null}),from(table){
   const filters={};
   const q={select(){return q;},order(){return q;},limit(){return q;},range(){return q;},or(){return q;},eq(k,v){filters[k]=v;return q;},in(k,v){filters[k]=v;return q;},gte(){return q;},lte(){return q;},gt(){return q;},lt(){return q;},
    async then(resolve,reject){
     const history=table==='ae_pick_feed'&&Array.isArray(filters.outcome)&&filters.outcome.includes('void');
     if(history)await new Promise(r=>setTimeout(r,(++requests%4)*15));
     const data=table==='ae_pick_feed'?(history?[pick]:filters.outcome==='pending'?[{...pick,id:'00000000-0000-0000-0000-000000000002',outcome:'pending',settled_at:null,result_points:0}]:[]):[];
     return Promise.resolve({data,error:null}).then(resolve,reject);
    }};return q;
  }};
 });
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
 await page.evaluate(()=>document.getElementById('footballTakes').hidden=false);
 await page.waitForSelector('#cpSettleHistory .ae-pick-history-entry');
 for(const admin of [false,true]){
  await page.evaluate(async admin=>{window.currentAdmin=admin?{id:'editor'}:null;await Promise.all(Array.from({length:12},()=>window.updateAePicksAdmin()));},admin);
  assert.equal(await page.locator('#cpSettleHistory .ae-pick-history-entry').count(),1);
  assert.equal(await page.locator('#cpSettleHistory .ae-pick-history-summary').count(),0);
  assert.equal(await page.locator('#cpSettleHistory .cp-history-card').count(),1);
  assert.equal(await page.locator('#cpSettleHistory .cp-pick-line-choice').count(),1);
  assert.equal(await page.locator('#cpSettleHistory .cp-upvote, #cpSettleHistory .cp-downvote').count(),0);
  for(const width of [360,390,768,910,911,1366])for(const dark of [false,true]){
   await page.setViewportSize({width,height:1000});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const layout=await page.evaluate(()=>{
    const history=document.getElementById('cpSettleHistorySection'),rail=document.querySelector('#communityPicks > .ae-picks-rail'),chefs=document.querySelector('#communityPicks > .ae-chefs-dual-standings');
    const h=history.getBoundingClientRect(),r=rail.getBoundingClientRect(),c=chefs.getBoundingClientRect();
    return {separate:history.parentElement.id==='communityPicks',afterPlates:h.top>=r.bottom-1,beforeChefs:c.top>=h.bottom-1,fits:h.left>=-1&&h.right<=innerWidth+1,noOverflow:history.scrollWidth<=history.clientWidth+1};
   });
   assert.deepEqual(layout,{separate:true,afterPlates:true,beforeChefs:true,fits:true,noOverflow:true},JSON.stringify({width,dark,admin,layout}));
   if(!admin&&[390,1366].includes(width))await page.locator('#cpSettleHistorySection').screenshot({path:path.join(qa,'history-'+width+'-'+(dark?'night':'day')+'.png')});
  }
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: concurrent admin/reader refreshes render one Pick; full-width history stays between Platos and Chefs, without overlap/overflow, at 360–1366px in day/night. QA: '+qa);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
