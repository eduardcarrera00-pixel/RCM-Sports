/* Isolated visual/interaction checks. All accounts, fixtures and requests stay local. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd(),qa=process.env.CAM_TICKET_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-ticket-refresh-'));
fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){
  const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https?:[^>]*>/gi,'');
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
 }
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.png')?'image/png':file.endsWith('.jpg')||file.endsWith('.jpeg')?'image/jpeg':file.endsWith('.webp')?'image/webp':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.AE_CHROMIUM_PATH?{executablePath:process.env.AE_CHROMIUM_PATH}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
 await page.evaluate(()=>{
  window.currentCategory='Picks';window.currentAdmin=null;window.notifyCommunity=()=>{};
  window.openUserAuthModal=()=>{};window.__writes=[];window.__rpc=[];
  const date=delta=>new Date(Date.now()+delta*86400000).toISOString().slice(0,10);
  const base={id:'00000000-0000-0000-0000-000000000101',user_id:'author',author:'Eduard',title:'Santos Laguna vs Pumas · Pumas gana',american_odds:150,event_date:date(-1),created_at:new Date().toISOString(),settled_at:new Date().toISOString(),outcome:'won',moderation_status:'approved',result_points:1.5,score:8,upvotes:10,downvotes:2,comments_count:3,is_current_week:true,legs:[{sport:'Fútbol',event:'Santos Laguna vs Pumas',selection:'Pumas · MONEYLINE',outcome:'won',official_result:'1–2'}]};
  window.ticketFixtures=[base,{...base,id:'00000000-0000-0000-0000-000000000102',title:'La visita impone condiciones',outcome:'lost',result_points:-1.8,score:-5,legs:[{sport:'Fútbol',event:'Santos Laguna vs Pumas',selection:'Santos Laguna gana',outcome:'lost',official_result:'1–2'}]},
   {...base,id:'00000000-0000-0000-0000-000000000103',title:'El parlay del domingo',american_odds:850,outcome:'pending',event_date:date(1),score:4,settled_at:null,legs:[{sport:'Fútbol',event:'Santos Laguna vs Pumas',selection:'Pumas gana',outcome:'won',official_result:'1–2'},{sport:'Fútbol',event:'FC Barcelona vs Real Madrid',selection:'Más de 2.5 goles',outcome:'pending'},{sport:'Fútbol',event:'Liverpool vs Manchester United',selection:'Ambos equipos anotan'},{sport:'NFL',event:'Buffalo Bills vs Kansas City Chiefs',selection:'Buffalo Bills gana'}]},
   {...base,id:'00000000-0000-0000-0000-000000000104',title:'Un encuentro con nombres largos',outcome:'pending',event_date:date(1),score:0,settled_at:null,legs:[{sport:'Fútbol',event:'Club Universidad Nacional Pumas de la Universidad Nacional Autónoma de México vs Club Santos Laguna',selection:'Club Universidad Nacional Pumas gana o empata y más de 1.5 goles'}]},
   {...base,id:'00000000-0000-0000-0000-000000000105',title:'Pick anulado',outcome:'void',score:0,result_points:0}];
  window.nflFixtures=Array.from({length:5},(_,i)=>({id:String(i+1),season:new Date().getUTCFullYear(),week:7,home_id:'BUF',away_id:'KC',kickoff:new Date(Date.now()+2*86400000).toISOString(),status:'scheduled',picks_open:true,points_home:4,points_away:5,odds_locked_at:new Date().toISOString()}));
  window.footballFixtures=window.nflFixtures.map(g=>({...g,competition:'laliga',matchday:7,points_draw:6,home_id:'real-madrid',away_id:'barcelona'}));
  window.footballTeams=[{id:'real-madrid',name:'Real Madrid',short_name:'Real Madrid',abbreviation:'RMA'},{id:'barcelona',name:'FC Barcelona',short_name:'Barcelona',abbreviation:'BAR'}];
  window.db={auth:{getUser:async()=>({data:{user:{id:'local-viewer'}}}),onAuthStateChange(){}},rpc:async(name,args)=>{window.__rpc.push({name,args});return {data:name.endsWith('_leaderboard')?[{rank_position:1,user_id:'public-author',username:'Eduard',points:31,hits:4,resolved:5,accuracy:80}]:[]};},from(table){
   let filters=[],limit=1000,single=false;
   const q={select(){return q;},order(){return q;},range(a,b){limit=b-a+1;return q;},limit(n){limit=n;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},gte(k,v){filters.push(r=>r[k]>=v);return q;},lte(k,v){filters.push(r=>r[k]<=v);return q;},gt(k,v){filters.push(r=>r[k]>v);return q;},lt(k,v){filters.push(r=>r[k]<v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},or(){filters.push(r=>r.outcome!=='pending');return q;},is(){return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},insert(v){window.__writes.push({table,v});return q;},update(v){window.__writes.push({table,v});return q;},delete(){window.__writes.push({table});return q;},then(resolve,reject){const data=table==='ae_pick_feed'?window.ticketFixtures:table==='cam_nfl_games'?window.nflFixtures:table==='cam_football_games'?window.footballFixtures:table==='cam_football_teams'?window.footballTeams:[];const result=data.filter(r=>filters.every(f=>f(r))).slice(0,limit);return Promise.resolve({data:single?result[0]||null:result}).then(resolve,reject);}};return q;
  }};
  document.body.className='ae-is-picks';document.getElementById('mainContent').hidden=false;document.getElementById('footballTakes').hidden=false;
 });
 for(const file of ['assets/ae-picks-premium.js','assets/ae-sport-top-takes.js','assets/cam-banner-artwork.js','assets/ae-site-images.js','assets/cam-nfl-quiniela-logos.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.addScriptTag({content:fs.readFileSync('assets/cam-pick-share.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('assets/community-picks.js','utf8')});
 await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
 await page.addScriptTag({content:fs.readFileSync('assets/cam-nfl-quiniela.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('assets/cam-football-quiniela.js','utf8')});
 await page.locator('#cpFeed .cam-ticket-card').first().waitFor();
 await page.locator('#picksPopular .cam-ticket-card').first().waitFor();
 const card=page.locator('#cpFeed .cam-ticket-card').filter({hasText:'El parlay del domingo'});
 assert.equal(await card.locator('.cam-ticket-more').getAttribute('open'),null);
 assert.equal(await card.locator('.cp-pick-line').count(),4);
 await card.locator('.cam-ticket-more summary').click();
 assert.equal(await card.locator('.cam-ticket-more').getAttribute('open'),'');
 assert.match(await card.innerText(),/Buffalo Bills gana/);
 assert.match(await card.innerText(),/Cuota total/i);
 assert.equal(await card.locator('.cp-actions button').count(),4);
 for(const width of [360,390,768,1366])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1000});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
  const fits=await page.locator('.cam-ticket-card').evaluateAll(cards=>cards.every(card=>card.scrollWidth<=card.clientWidth+2));

  assert.ok(fits,'Pick content overflow '+width+' '+dark);
  assert.ok(await card.locator('.cp-pick-line-body').first().evaluate(e=>e.getBoundingClientRect().width>180),'The selection must retain readable column width');
  assert.ok((await card.boundingBox()).height<1000,'Expanded four-leg parlay must not become a narrow vertical column');
  assert.ok((await page.locator('#picksPopular').boundingBox()).height>200,'Platos panel must not collapse on desktop');
  if(width===1366)await page.locator('#communityPicks .ae-picks-community-main').screenshot({path:path.join(qa,'picks-escritorio-'+(dark?'noche':'dia')+'.png')});
  if(width===390){
   await page.locator('#picksPopular .cam-ticket-card').first().screenshot({path:path.join(qa,'mejores-platos-'+(dark?'noche':'dia')+'.png')});
   await card.screenshot({path:path.join(qa,'parlay-'+(dark?'noche':'dia')+'.png')});
   await page.locator('#aeHomePickHistoricPick .cam-historic-record').screenshot({path:path.join(qa,'pick-historico-'+(dark?'noche':'dia')+'.png')});
   await page.locator('#cpSettleHistory .ae-pick-history-card').first().screenshot({path:path.join(qa,'recetario-'+(dark?'noche':'dia')+'.png')});
  }
 }
 await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';document.body.style.scrollBehavior='auto';document.querySelector('#picksPopular .cam-ticket-card').scrollIntoView({behavior:'instant',block:'center'});});
 await page.locator('#picksPopular .cp-card-read-link').first().click({timeout:3000});
 await page.locator('#cpDialog .cp-recipe-card').waitFor();
 for(const width of [390,1366])for(const dark of [false,true]){
  await page.setViewportSize({width,height:1000});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  assert.ok(await page.locator('#cpDialog .cp-pick-line-body').first().evaluate(e=>e.getBoundingClientRect().width>150));
  if(width===390)await page.locator('#cpDialog .cp-recipe-card').screenshot({path:path.join(qa,'receta-abierta-'+(dark?'noche':'dia')+'.png')});
 }
 await page.locator('#cpDialog button').first().click();
 await page.evaluate(()=>document.activeElement?.blur());
 for(const sport of ['nfl','football']){
  const prefix=sport==='nfl'?'camNfl':'camFootball';
  await page.evaluate(async sport=>{window.currentCategory=sport==='nfl'?'NFL':'Fútbol';document.body.className='ae-is-'+sport;document.getElementById('communityPicks').hidden=true;document.getElementById('freeTakes').hidden=false;await window.refreshAeSportTopTakes(true);},sport);
  assert.equal(await page.locator('#camTakeInvitation').evaluate(e=>e.previousElementSibling?.classList.contains('ae-takes-head')),true,'The invitation stays immediately below its action, ahead of the Takes rankings');
  await page.locator('#'+prefix+'Games>.cam-nfl-game').nth(4).waitFor();
  assert.equal(await page.locator('#camTakeInvitation').isVisible(),true);
  assert.match(await page.locator('#camTakeInvitation').innerText(),/Aquí, lo que se publica no se borra/);
  for(const width of [390,1366])for(const dark of [false,true]){
   await page.setViewportSize({width,height:1000});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
   await page.locator('#'+prefix+'ViewTabs [data-view="jornada"]').click();
   await page.locator('#'+prefix+'Games .cam-nfl-team').first().click();
   const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
   const selected=await page.locator('#'+prefix+'Games .is-selected').count();assert.ok(selected>0);
   if(width===390){const sizes=await page.locator('#'+prefix+'Games').evaluate(list=>{const cards=[...list.querySelectorAll('.cam-nfl-game')];return {height:list.clientHeight,two:cards[1].getBoundingClientRect().bottom-cards[0].getBoundingClientRect().top};});assert.ok(Math.abs(sizes.height-sizes.two)<=2,JSON.stringify(sizes));}
   if(width===390)await page.locator('#'+prefix+'Quiniela').screenshot({path:path.join(qa,'quiniela-'+sport+'-jornada-'+(dark?'noche':'dia')+'.png')});
   for(const view of ['month','all']){
    await page.locator('#'+prefix+'ViewTabs [data-view="'+view+'"]').click();
    assert.equal(await page.locator('#'+prefix+'MatchPanel').isVisible(),false);
    assert.equal(await page.locator('#'+prefix+'QuinielaStandings').isVisible(),true);
    assert.match(await page.locator('#'+prefix+'Ranking').innerText(),/Eduard/);
    assert.ok(await page.evaluate(({sport,view})=>__rpc.some(r=>r.name==='cam_'+sport+'_leaderboard'&&r.args.p_scope===view),{sport,view}));
    await page.locator('#'+prefix+'Quiniela').screenshot({path:path.join(qa,'quiniela-'+sport+'-'+view+'-'+(width===1366?'escritorio-':'')+(dark?'noche':'dia')+'.png')});
   }
   await page.locator('#'+prefix+'ViewTabs [data-view="jornada"]').click();
   assert.equal(await page.locator('#'+prefix+'Games .is-selected').count(),selected);
   assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before,'Changing views must preserve drafts exactly');
  }
  if(sport==='football'){
   const before=await page.evaluate(()=>JSON.stringify({...localStorage}));
   await page.locator('#camFootballViewTabs [data-view=month]').click();
   await page.locator('#camFootballNav .cam-football-league[data-competition="premier"]').click();
   await page.waitForFunction(()=>__rpc.at(-1)?.args?.p_competition==='premier');
   assert.equal(await page.locator('#camFootballMatchPanel').isVisible(),false);
   await page.locator('#camFootballViewTabs [data-view=all]').click();
   await page.waitForFunction(()=>__rpc.at(-1)?.args?.p_scope==='all'&&__rpc.at(-1)?.args?.p_competition==='premier');
   await page.locator('#camFootballNav .cam-football-league[data-competition="laliga"]').click();
   await page.waitForFunction(()=>__rpc.at(-1)?.args?.p_competition==='laliga');
   await page.locator('#camFootballViewTabs [data-view=jornada]').click();
   assert.ok(await page.locator('#camFootballGames .is-selected').count()>0);
   assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})),before);
  }
 }
 await page.evaluate(()=>{document.body.className='ae-is-home';document.getElementById('aeHomeTakeHighlights').hidden=false;});
 for(const dark of [false,true]){
  await page.setViewportSize({width:390,height:900});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  const size=await page.locator('#aeHomeTakePublish').boundingBox();assert.equal(Math.round(size.height),44);
  await page.locator('#aeHomeTakePublish').screenshot({path:path.join(qa,'home-conocimiento-'+(dark?'noche':'dia')+'.png')});
 }
 assert.equal(await page.evaluate(()=>__writes.length),0,'Presentation changes do not write picks or change results');
 assert.deepEqual(errors,[]);
 console.log('PASS: shared simple/parlay cards; compact disclosures; responsive day/night screenshots; real all/month RPC scopes; unchanged drafts; exactly two mobile fixtures; 44px Home CTA; no database writes. QA: '+qa);
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>server.close());
