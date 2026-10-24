/* CAM SPORTS: rich article editor must not load or run on public Home. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd(),html=fs.readFileSync('index.html','utf8');
assert.match(html,/<script src="assets\/cam-admin-news-editor-loader\.js/);
assert.doesNotMatch(html,/<script src="assets\/ae-news-editor\.js/);
assert.match(html,/async function openPublishModal\(\)/);
assert.match(html,/await window\.camAdminNewsEditorLoader\?\.ensure\(\)/);
const fixture=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
 .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'')
 .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
 .replace('</body>','<script src="assets/cam-admin-news-editor-loader.js"></script></body>');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(fixture);}
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));}
 catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();
  const errors=[],origin='http://127.0.0.1:'+server.address().port;
  let attempts=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.route('**/assets/ae-news-editor.js*',route=>{
   attempts++;
   if(attempts===1)return route.abort();
   return route.continue();
  });
  await page.goto(origin,{waitUntil:'load'});
  assert.equal(attempts,0,'Guest Home must never download the rich editor');
  assert.equal(await page.locator('#aeNewsEditor').count(),0);
  assert.equal(await page.locator('#pubBody').getAttribute('required'),'');
  assert.equal(await page.evaluate(()=>window.camAdminNewsEditorLoader.ensure()),false,
   'A failed rich editor request must preserve the textarea fallback');
  assert.equal(await page.locator('#aeNewsEditor').count(),0);
  assert.equal(await page.locator('#pubBody').isHidden(),false);
  assert.equal(await page.evaluate(()=>window.camAdminNewsEditorLoader.ensure()),true,
   'A second attempt must recover after a network failure');
  assert.equal(await page.locator('#aeNewsEditor').count(),1);
  assert.equal(await page.locator('#pubBody').isHidden(),true);
  assert.equal(await page.evaluate(()=>window.camAdminNewsEditorLoader.ensure()),true);
  assert.equal(attempts,2,'Editor JS is cached once and not duplicated');
  assert.deepEqual(errors,[]);
  console.log('PASS: anonymous Home does not load editor; failed fetch keeps textarea, retry mounts once.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
