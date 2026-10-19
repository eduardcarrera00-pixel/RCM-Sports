const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixtures=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ae-capture-import-'));
const {chromium}=require(root+'/node_modules/playwright');
const raw=fs.readFileSync(root+'/tests/browser.cjs','utf8'),sandbox={require,__filename:root+'/tests/browser.cjs',process,console};vm.createContext(sandbox);vm.runInContext(raw.slice(0,raw.indexOf('\n(async()=>{'))+'\nglobalThis.client=mockClient;',sandbox);
const client=sandbox.client.replace('order:()=>b,range:','order:()=>b,gte:()=>b,lte:()=>b,gt:()=>b,lt:()=>b,in:()=>b,is:()=>b,limit:()=>b,range:');
let records=[],payloads=[];
async function backend(q){
 if(q.rpc)return {data:[],error:null};
 if(q.table==='ae_community_picks'&&q.op==='insert'){
  payloads.push(q.payload);const p={...q.payload,id:'pick-'+(records.length+1),user_id:'reader',author:'Lector',capture_check:{version:1,method:'on_device_ocr',checked_at:new Date().toISOString()},moderation_status:'approved',outcome:'pending',upvotes:0,downvotes:0,comments_count:0,created_at:new Date().toISOString()};
  p.american_odds=q.payload.capture_check.total?.american||p.legs[0].odds;records.push(p);return {data:p,error:null};
 }
 const data=q.table==='ae_pick_feed'?records:[];return {data:q.single?(data[0]||null):data,error:null};
}
const server=http.createServer((req,res)=>{const file=path.resolve(root,new URL(req.url,'http://localhost').pathname.slice(1)||'index.html');if(!file.startsWith(root+'/')){res.writeHead(403);return res.end();}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.gz')?'application/gzip':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}});
(async()=>{await new Promise(r=>server.listen(8767,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.AE_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
try{const context=await browser.newContext({viewport:{width:390,height:940}}),page=await context.newPage();let activeWorkers=0;const errors=[],requests=[];
page.on('pageerror',e=>errors.push(e.message));page.on('worker',worker=>{activeWorkers++;worker.on('close',()=>activeWorkers--);});page.on('request',req=>requests.push({url:req.url(),method:req.method(),body:req.postData()}));
await page.exposeFunction('mockDb',backend);await page.addInitScript(()=>localStorage.setItem('testSession',JSON.stringify({id:'reader',user_metadata:{username:'Lector'}})));
await page.route('**/*',route=>{const url=route.request().url();if(url.includes('/supabase-js@2'))return route.fulfill({contentType:'text/javascript',body:client});if(url.startsWith('http://127.0.0.1'))return route.continue();return route.abort();});
const receipt=await context.newPage();await receipt.setViewportSize({width:900,height:900});
async function fixture(file,lines){await receipt.setContent('<html><body style="margin:0;padding:32px;background:white;color:black;font:28px/1.8 Arial">'+lines.map(line=>'<div>'+line+'</div>').join('')+'</body></html>');await receipt.screenshot({path:fixtures+'/'+file});}
await fixture('simple.png',['BETSLIP','NBA','Toronto Raptors vs Boston Celtics','Toronto Raptors Moneyline +150','Stake $10.00','Potential Returns $25.00']);
await fixture('combined.png',['BETSLIP','NBA','Multi 2 Legs 4.29','Los Angeles Lakers At Philadelphia 76ers','Los Angeles Lakers','Match Betting 2.67','Washington Wizards At Detroit Pistons','Detroit Pistons','Match Betting 1.61','Total Stake $1.00']);
await receipt.close();
await page.goto('http://127.0.0.1:8767/',{waitUntil:'domcontentloaded'});await page.evaluate(()=>{filterByCategory('Picks');window.aeOpenPickComposer();});await page.locator('#cpComposePanel').waitFor({state:'visible'});
assert.equal(requests.some(r=>r.url.includes('/vendor/ocr/')),false,'Heavy OCR must not load before choosing a file');
assert.equal(await page.locator('#cpForm button[type=submit]').isDisabled(),true);
async function scan(filename){await page.locator('#cpCaptureFile').setInputFiles(fixtures+'/'+filename);await page.waitForFunction(()=>['matched','error'].includes(document.querySelector('.cp-capture')?.dataset.state),null,{timeout:90000});const state=await page.locator('.cp-capture').getAttribute('data-state'),status=await page.locator('#cpCaptureStatus').innerText();console.log(filename,state,status);if(state!=='matched')fs.writeFileSync(fixtures+'/browser-ocr-failure.json',JSON.stringify(await page.evaluate(()=>window.testOcrReadings)));assert.equal(state,'matched');await page.waitForFunction(()=>document.querySelector('#cpCaptureFile').files.length===0);}
await scan('simple.png');await page.waitForTimeout(100);assert.equal(activeWorkers,0);
assert.equal(await page.locator('[name=odds_0]').inputValue(),'+150');for(const name of ['sport','event','selection','odds'])assert.equal(await page.locator('[name='+name+'_0]').evaluate(el=>el.readOnly),true);await page.locator('[name=event_date]').fill(new Date().toISOString().slice(0,10));
assert.equal(payloads.length,0);await page.locator('#cpForm button[type=submit]').click();assert.equal(payloads.length,0,'Confirmation is mandatory');
await page.locator('#cpCaptureConfirm').check();
for(const width of [360,390,768,1366])for(const dark of [false,true]){await page.setViewportSize({width,height:940});await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);const fit=await page.locator('#cpComposePanel').evaluate(el=>el.scrollWidth<=el.clientWidth+1);assert.equal(fit,true,'Composer must fit '+width);}
await page.setViewportSize({width:390,height:940});if(process.env.AE_CAPTURE_QA_DIR)fs.mkdirSync(process.env.AE_CAPTURE_QA_DIR,{recursive:true});await page.locator('.cp-capture').screenshot({path:process.env.AE_CAPTURE_QA_DIR?process.env.AE_CAPTURE_QA_DIR+'/capture-import-mobile.png':fixtures+'/capture-import-mobile.png'});
if(process.env.AE_CAPTURE_QA_DIR)await page.screenshot({path:process.env.AE_CAPTURE_QA_DIR+'/capture-import-dialog.png'});
await page.locator('#cpForm button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('cpComposePanel').open);assert.equal(payloads.length,1);assert.equal(payloads[0].capture_check.readings[0].odds,150);assert.equal(JSON.stringify(payloads).includes('data:image'),false);assert.equal(JSON.stringify(payloads).includes('Balance'),false);
assert.match(await page.locator('#cpFeed').innerText(),/Momio cotejado con captura/);
await page.evaluate(()=>window.aeOpenPickComposer());await page.locator('#cpComposePanel').waitFor({state:'visible'});await page.evaluate(()=>{window.testOcrReadings=[];const create=window.Tesseract.createWorker;window.Tesseract.createWorker=async(...args)=>{const worker=await create(...args),recognize=worker.recognize;worker.recognize=async(...parameters)=>{const value=await recognize(...parameters);window.testOcrReadings.push(value.data);return value;};return worker;};});

await scan('combined.png');assert.match(await page.locator('[name=selection_0]').inputValue(),/Lakers/);assert.match(await page.locator('[name=selection_1]').inputValue(),/Pistons/);await page.locator('[name=event_date]').fill(new Date().toISOString().slice(0,10));assert.match(await page.locator('.cp-compose-summary').innerText(),/329/);await page.locator('#cpCaptureConfirm').check();await page.locator('#cpForm button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('cpComposePanel').open);assert.equal(payloads.length,2);assert.equal(payloads[1].capture_check.total.american,329);
assert.equal(requests.filter(r=>r.method!=='GET').length,0,'Image bytes must not produce network uploads');
assert.equal(requests.some(r=>r.url.includes('data:image')),false);assert.deepEqual(errors,[]);console.log('PASS: screenshot-first real browser OCR on generated single and two-leg receipts, per-leg/total values, confirmation and publication, cleared files/workers, only GET assets and 8 responsive/theme layouts.');await context.close();fs.rmSync(fixtures,{recursive:true,force:true});
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exit(1);});
