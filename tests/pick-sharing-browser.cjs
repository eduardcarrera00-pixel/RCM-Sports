/* Isolated local browser QA: no production data, accounts or social publications. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd(),qa=process.env.CAM_SHARE_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-pick-share-'));
fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/profile'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script src="/assets/cam-pick-share.js"></script><script src="/assets/ae-profile.js"></script></body>'));}
 if(pathname==='/') {res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/ae-editorial-bundle.css"></head><body><main id="mainContent"><section id="footballTakes" class="ae-picks-editorial"><section id="communityPicks"><div id="cpFeed"><article class="cp-card cp-feed-editorial"><h3>Barça vs PSG</h3><div class="cp-actions" id="actions"></div></article></div></section></section></main><script src="/assets/cam-pick-share.js"></script></body></html>');}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.webp')?'image/webp':'text/javascript; charset=utf-8');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let launch={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};
 if(process.env.CAM_TEST_CHROMIUM_PACKAGE){const imported=require(process.env.CAM_TEST_CHROMIUM_PACKAGE),vendor=imported.default||imported;launch.executablePath=await vendor.executablePath();launch.args=[...vendor.args,'--disable-dev-shm-usage'];}
 else if(process.env.AE_CHROMIUM_PATH)launch.executablePath=process.env.AE_CHROMIUM_PATH;
 const browser=await chromium.launch(launch);
 try{
 const context=await browser.newContext({viewport:{width:390,height:880}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
 await page.evaluate(()=>{
  window.pick={id:'00000000-0000-0000-0000-000000000931',author:'Lector',title:'Barcelona vs PSG · pronóstico de la comunidad',american_odds:175,moderation_status:'approved',outcome:'pending',event_date:'2026-11-01',legs:[{sport:'Fútbol',event:'Barcelona vs PSG',selection:'Barcelona gana'}],capture_check:{private:'NEVER_SHARE'}};
  document.getElementById('actions').append(CamPickShare.button(window.pick));
  window.shares=[];
  Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
  Object.defineProperty(navigator,'share',{configurable:true,value:data=>{window.shares.push({active:navigator.userActivation.isActive,filename:data.files?.[0]?.name,type:data.files?.[0]?.type,size:data.files?.[0]?.size});return window.cancelShare?Promise.reject(new DOMException('cancel','AbortError')):Promise.resolve();}});
 });
 await page.getByRole('button',{name:'Compartir Pick: '+await page.evaluate(()=>window.pick.title),exact:true}).click();
 const dialog=page.locator('#camPickShareDialog');await dialog.waitFor({state:'visible'});await page.locator('.cam-pick-share-preview img').waitFor({timeout:7000}).catch(async()=>{throw new Error('PNG preview unavailable: '+await page.locator('.cam-pick-share-preview').innerText()+'; page errors: '+errors.join('; '));});
 assert.equal(await page.evaluate(()=>window.shares.length),0,'Opening the panel must never publish or open the native share UI');
 assert.equal(await page.getByRole('button',{name:'Instagram',exact:true}).isEnabled(),true);
 for(const width of [360,390,768,1366])for(const dark of [false,true]){
  await page.setViewportSize({width,height:880});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  const fits=await dialog.evaluate(d=>({fit:d.scrollWidth<=d.clientWidth+1,children:[...d.querySelectorAll('button,a,textarea')].filter(e=>!e.hidden).every(e=>{const r=e.getBoundingClientRect(),b=d.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right+1;})}));
  assert.equal(fits.fit,true,'Dialog overflow at '+width);assert.equal(fits.children,true,'Controls overflow at '+width);
  if(width===390)await page.screenshot({path:path.join(qa,'sharing-mobile-'+(dark?'night':'day')+'.png')});
 }
 await page.setViewportSize({width:390,height:880});
 const x=new URL(await page.locator('.cam-pick-share-networks a').getAttribute('href'));assert.equal(x.hostname,'twitter.com');assert.ok(x.searchParams.get('url').startsWith('https://camsports.github.io/?p='));
 const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar tarjeta',exact:true}).click();const download=await downloadPromise;await download.saveAs(path.join(qa,'pick-card.png'));
 const png=fs.readFileSync(path.join(qa,'pick-card.png'));assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1350);
 await page.getByRole('button',{name:'Instagram',exact:true}).click();assert.deepEqual(await page.evaluate(()=>({active:shares[0].active,type:shares[0].type})),{active:true,type:'image/png'});
 await page.evaluate(()=>window.cancelShare=true);await page.getByRole('button',{name:'TikTok',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cam-pick-share-status').textContent.includes('cuando quieras'));
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});});await page.getByRole('button',{name:'TikTok',exact:true}).click();assert.match(await page.locator('.cam-pick-share-status').innerText(),/Descarga la tarjeta/);
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();assert.equal(await dialog.evaluate(e=>e.open),false);assert.ok(await page.locator('#actions .cam-pick-share-button').evaluate(e=>document.activeElement===e));
 // A share button remains reachable above the profile's whole-card hit target.
 await page.evaluate(()=>{const p=document.createElement('dialog');p.id='aeProfileDialog';p.innerHTML='<div id="aeProfilePicks"><article class="ae-profile-pick ae-profile-pick-recent"><h4>Mi Pick</h4><div class="ae-profile-pick-footer"></div><button class="ae-profile-pick-hit" aria-label="Ver Pick completo"></button></article></div>';p.querySelector('.ae-profile-pick-footer').append(CamPickShare.button(window.pick));document.body.append(p);p.showModal();});
 await page.locator('#aeProfilePicks .cam-pick-share-button').click();await page.locator('#camPickShareDialog[open]').waitFor();await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.evaluate(()=>document.getElementById('aeProfileDialog').close());
 await page.evaluate(()=>CamPickShare.open({...window.pick,title:'El parlay del domingo',event_name:'Toronto vs Boston',selection:'Toronto gana\nMás de 2.5 goles\nAmbos equipos anotan\nMás de 8.5 córners\nMás de 3.5 tarjetas'},{kind:'weekly'}));assert.match(await page.locator('#camPickShareTitle').innerText(),/Pick del editor/);assert.ok(new URL(new URL(await page.locator('.cam-pick-share-networks a').getAttribute('href')).searchParams.get('url')).searchParams.has('e'));
 await page.locator('.cam-pick-share-preview img').waitFor();
 const weeklyDownloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar tarjeta',exact:true}).click();
 const weeklyDownload=await weeklyDownloadPromise;await weeklyDownload.saveAs(path.join(qa,'editorial-parlay-card.png'));
 assert.match(await page.locator('.cam-pick-share-caption-label textarea').inputValue(),/Más de 3.5 tarjetas/);
 // Exercise the real profile markup/renderers, rather than only an isolated card.
 await page.addInitScript(()=>{
  const owner='00000000-0000-0000-0000-000000000951';
  window.profileTakes=Array.from({length:4},(_,i)=>({id:'00000000-0000-0000-0000-'+String(960+i).padStart(12,'0'),author_id:owner,title:i===0?'Los Bills tienen equipo para llegar a la final':'Mi opinión deportiva '+i,body:('Una defensa sólida y la capacidad de decidir los partidos igualados marcarán la diferencia. ').repeat(8),sport:'nfl',upvotes:12-i,downvotes:i,created_at:'2026-10-21T13:00:00Z'}));
  window.db={auth:{getUser:async()=>({data:{user:{id:owner,user_metadata:{username:'Lector'}}}}),onAuthStateChange(){}},rpc:async name=>({data:name==='ae_my_free_takes'?profileTakes:name==='ae_my_profile_unpopular_take'?profileTakes[2].id:[]}),from:()=>({select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit:async()=>({data:[{id:'00000000-0000-0000-0000-000000000969',author:'Lector',title:'Mi Pick de fútbol',outcome:'won',moderation_status:'approved',american_odds:150,result_points:1.5,legs:[{event:'Barcelona vs PSG',selection:'Barcelona gana'}]}]})})};
  window.openedTakes=[];window.aeTakeReplies={open:take=>openedTakes.push(take)};
  window.shares=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:data=>{shares.push({active:navigator.userActivation.isActive,filename:data.files[0].name});return Promise.resolve();}});
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/profile',{waitUntil:'load'});await page.evaluate(()=>openAeProfile());
 for(const width of [360,390,768,1366])for(const dark of [false,true]){
  await page.setViewportSize({width,height:880});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  const buttons=page.locator('#aeProfileDialog .ae-profile-take-actions .cam-pick-share-button');assert.equal(await buttons.count(),7,'Featured and recent Takes all have sharing');
  assert.equal(await buttons.evaluateAll(items=>items.every(button=>{const b=button.getBoundingClientRect(),card=button.closest('article').getBoundingClientRect();return b.left>=card.left&&b.right<=card.right+1;})),true,'Profile share buttons fit at '+width);
  if(width===390)await page.screenshot({path:path.join(qa,'profile-takes-'+(dark?'night':'day')+'.png')});
 }
 await page.setViewportSize({width:390,height:880});await page.locator('#aeProfileTakeHighlights .cam-pick-share-button').first().click();await page.locator('.cam-pick-share-preview img').waitFor();
 assert.equal(await page.evaluate(()=>openedTakes.length),0);assert.match(await page.locator('#camPickShareTitle').innerText(),/Comparte este Take/);assert.match(await page.locator('.cam-pick-share-caption-label textarea').inputValue(),/Take de @Lector/);
 const takeDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar imagen',exact:true}).click();await (await takeDownload).saveAs(path.join(qa,'take-card.png'));
 await page.getByRole('button',{name:'TikTok',exact:true}).click();assert.deepEqual(await page.evaluate(()=>({active:shares[0].active,take:shares[0].filename.includes('-take-')})),{active:true,take:true});
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();assert.ok(await page.locator('#aeProfileTakeHighlights .cam-pick-share-button').first().evaluate(e=>document.activeElement===e));
 await page.locator('#aeProfileTakes .cam-pick-share-button').last().click();await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.locator('#aeProfileTabPicks').click();assert.equal(await page.locator('#aeProfilePickHighlights .cam-pick-share-button').count(),1);await page.locator('#aeProfilePicks .cam-pick-share-button').click();assert.match(await page.locator('#camPickShareTitle').innerText(),/Comparte este Pick/);
 assert.deepEqual(errors,[]);console.log('PASS: real Pick/Take PNG, responsive day/night 360–1366px, native activation, cancellation/fallback, actual profile featured/recent sharing and weekly share. QA: '+qa);
 await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
