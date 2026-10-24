/* Browser regression for on-demand NFL/Fútbol quinielas. No live accounts or APIs. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd();
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/cam-sport-quiniela-loader\.js/);
assert.doesNotMatch(html,/<script[^>]+src="assets\/cam-nfl-quiniela\.js/);
assert.doesNotMatch(html,/<script[^>]+src="assets\/cam-football-quiniela\.js/);
for(const file of ['cam-nfl-quiniela.js','cam-football-quiniela.js'])
 assert.match(fs.readFileSync('assets/'+file,'utf8'),/document\.readyState==='loading'/);

const transport=`<script>
window.db={
 auth:{
  getUser:async()=>({data:{user:null},error:null}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
 },
 rpc:async()=>({data:[],error:null}),
 from(){
  const q={select(){return q},order(){return q},limit(){return q},eq(){return q},
   in(){return q},gte(){return q},lt(){return q},
   then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};
  return q;
 }
};
</script><script src="assets/cam-sport-quiniela-loader.js"></script>`;
const fixture=html
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
 .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
 .replace('</body>',transport+'</body>');

const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.end(fixture);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
  res.setHeader('Content-Type','text/javascript; charset=utf-8');
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const options={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};
 if(process.env.AE_CHROMIUM_PATH)options.executablePath=process.env.AE_CHROMIUM_PATH;
 const browser=await chromium.launch(options);
 try{
  const page=await browser.newPage();
  const local='http://127.0.0.1:'+server.address().port;
  const requests=[],errors=[];
  page.on('request',r=>{if(/cam-(?:nfl|football)-quiniela\.js/.test(r.url()))requests.push(r.url());});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(local)?route.continue():route.abort());
  await page.goto(local,{waitUntil:'load'});
  assert.equal(requests.length,0,'Home must fetch no sport-only quiniela modules');
  assert.equal(await page.evaluate(()=>window.camSportQuinielaLoader.isLoaded('nfl')),false);
  await page.evaluate(()=>document.body.classList.add('ae-is-nfl'));
  await page.waitForFunction(()=>window.camSportQuinielaLoader.isLoaded('nfl'));
  await page.waitForFunction(()=>document.getElementById('camNflStatus').textContent.includes('Todavía')||
    document.getElementById('camNflStatus').textContent.includes('No se pudieron obtener'));
  assert.equal(requests.filter(r=>r.includes('cam-nfl-quiniela.js')).length,1);
  assert.equal(requests.filter(r=>r.includes('cam-football-quiniela.js')).length,0);
  assert.equal(await page.locator('#camNflQuiniela').getAttribute('hidden'),null);
  await page.evaluate(()=>{document.body.classList.remove('ae-is-nfl');document.body.classList.add('ae-is-football')});
  await page.waitForFunction(()=>window.camSportQuinielaLoader.isLoaded('football'));
  await page.waitForFunction(()=>document.getElementById('camFootballStatus').textContent.includes('Todavía')||
    document.getElementById('camFootballStatus').textContent.includes('No se pudieron obtener'));
  assert.equal(requests.filter(r=>r.includes('cam-football-quiniela.js')).length,1);
  await page.evaluate(()=>{document.body.classList.remove('ae-is-football');document.body.classList.add('ae-is-nfl')});
  await page.evaluate(()=>Promise.all([
    window.camSportQuinielaLoader.ensure('nfl'),
    window.camSportQuinielaLoader.ensure('nfl')
  ]));
  assert.equal(requests.length,2,'Back navigation and simultaneous calls must not redownload modules');
  assert.deepEqual(errors,[],'Switching sections must not cause uncaught JS errors');
  console.log('PASS: Home loads neither Quiniela; NFL and Fútbol load once on demand, hydrate and survive navigation.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
