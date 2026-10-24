const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const html=fs.readFileSync('index.html','utf8');
 const section=html.slice(html.indexOf('<section id="camFootballQuiniela"'),html.indexOf('<section id="aeSportTakeRanking"'));
 const theme=html.match(/<style id="cam-nfl-quiniela-theme">([\s\S]*?)<\/style>/)[0];
 const code=fs.readFileSync('assets/cam-football-quiniela.js','utf8');
 const browser=await chromium.launch({headless:true,...(process.env.AE_CHROMIUM_PATH?{executablePath:process.env.AE_CHROMIUM_PATH}:{})});
 try{
 for(const width of [390,1366])for(const dark of [false,true]){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390,isMobile:width===390}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.abort());
  await page.setContent(`<html class="${dark?'dark':''}"><head>${theme}</head><body class="ae-is-football">${section}</body></html>`);
  await page.evaluate(()=>{
   window.currentAdmin=null;
   const kickoff=new Date(Date.now()+86400000).toISOString();
   const season=new Date().getUTCFullYear();
   const fixtures=[{id:'900000001',competition:'laliga',season,matchday:1,home_id:'1',away_id:'2',kickoff,status:'scheduled',picks_open:true,
    points_home:6,points_draw:6,points_away:6,odds_locked_at:new Date().toISOString(),odds_source:'automatic_equal_v1'}];
   fixtures.push({...fixtures[0],id:'900000002',kickoff:new Date(Date.now()-3600000).toISOString(),status:'live',picks_open:false});
   const teams=[{id:'1',name:'Local',short_name:'Local',abbreviation:'LOC'},{id:'2',name:'Visitante',short_name:'Visitante',abbreviation:'VIS'}];
   const picks=[];window.__calls=[];
   window.db={auth:{getUser:async()=>({data:{user:{id:'user-test'}}}),onAuthStateChange(){}},
    from(name){const data=name==='cam_football_games'?fixtures:name==='cam_football_teams'?teams:picks;
     const q=new Proxy({},{get:(_,k)=>k==='then'?(resolve,reject)=>Promise.resolve({data,error:null}).then(resolve,reject):()=>q});return q;},
    async rpc(name,args){window.__calls.push({name,args});
     if(name==='cam_football_save_pick'){picks.push({game_id:args.p_game_id,pick:args.p_pick,awarded_points:0});return{data:true,error:null};}
     return{data:[],error:null};}
   };
  });
  await page.addScriptTag({content:code});
  await page.waitForSelector('#camFootballGames .cam-nfl-game');
  assert.equal(await page.locator('#camFootballAdmin').isVisible(),false);
  assert.equal(await page.getByPlaceholder(/Cuota/).count(),0,'No per-match odds inputs');
  assert.equal(await page.getByRole('button',{name:/Congelar cuotas|Administrar puntos/}).count(),0);
  assert.equal(await page.locator('button').filter({hasText:/Resolver|Administrar|Abrir jornada/}).count(),0,'No admin action is required');
  assert.deepEqual(await page.locator('#camFootballGames .cam-nfl-team small,#camFootballGames .cam-nfl-draw small').allTextContents(),['6 pts','6 pts','6 pts']);
  assert.equal(await page.locator('#camFootballGames .cam-nfl-draw:not([disabled])').count(),1,'Default day must allow voting');
  await page.locator('#camFootballGames .cam-nfl-draw').click();
  await page.locator('#camFootballSaveDay').click();
  await page.waitForFunction(()=>document.getElementById('camFootballStatus').textContent.includes('guardado'));
  const calls=await page.evaluate(()=>window.__calls.filter(c=>c.name==='cam_football_save_pick'));
  assert.equal(calls.length,1);assert.equal(calls[0].args.p_pick,'draw');
  assert.match(await page.locator('#camFootballGames').innerText(),/Pronóstico guardado/);
  assert.equal(await page.locator('#camFootballGames .cam-nfl-draw.is-selected').count(),1);
  assert.equal(await page.locator('#camFootballGames .cam-nfl-team small').filter({hasText:'%'}).count(),0);
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>{window.currentAdmin=true;window.dispatchEvent(new CustomEvent('cam:admin-state-change'));});
  await page.waitForSelector('.cam-nfl-admin-game summary');
  if(width===390)await page.locator('.cam-nfl-admin-game summary').tap();else await page.locator('.cam-nfl-admin-game summary').click();
  assert.ok(await page.getByLabel('Puntos local',{exact:true}).evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
  await page.getByLabel('Puntos local',{exact:true}).fill('5');
  await page.getByLabel('Puntos empate',{exact:true}).fill('7');
  await page.getByLabel('Puntos visitante',{exact:true}).fill('9');
  await page.getByLabel('Puntos local',{exact:true}).focus();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(200);
  assert.equal(await page.getByLabel('Puntos local',{exact:true}).inputValue(),'5','Mobile keyboard focus must preserve the editor');
  assert.equal(await page.locator('.cam-nfl-admin-game[open]').count(),1);
  await page.getByRole('button',{name:'Guardar ajuste'}).click();
  await page.waitForFunction(()=>window.__calls.some(c=>c.name==='cam_football_admin_points'));
  const adjustment=await page.evaluate(()=>window.__calls.find(c=>c.name==='cam_football_admin_points').args);
  assert.deepEqual(adjustment,{p_game_id:'900000001',p_home:5,p_draw:7,p_away:9});
  await page.close();
 }
 }finally{await browser.close();}
 console.log('PASS: football mobile/desktop, day/night, automatic points only, no manual odds inputs, draw selection and saved pick.');
})().catch(e=>{console.error(e);process.exitCode=1});
