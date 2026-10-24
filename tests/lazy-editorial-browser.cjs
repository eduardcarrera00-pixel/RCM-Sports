/* CAM SPORTS - lazy editorial loading under actual Chromium.
 * Uses a synthetic page with no account and no production data writes.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd(),html=fs.readFileSync('index.html','utf8');

assert.match(html,/<script src="assets\/cam-lazy-editorial-loader\.js/);
assert.doesNotMatch(html,/<script src="assets\/ae-opinions\.js/);
assert.doesNotMatch(html,/<script src="assets\/ae-news-archive\.js/);
for(const file of ['assets/ae-opinions.js','assets/ae-news-archive.js'])
 assert.match(fs.readFileSync(file,'utf8'),/document\.readyState==='loading'/);

const stub=`<script>
window.articles=[{id:'00000000-0000-0000-0000-000000000099',
  title:'CAM News Test',summary:'Noticia de prueba',category:'NFL',author:'CAM',
  image:'',createdAt:'2026-10-23T00:00:00.000Z'}];
window.categoryKey=x=>x;
window.db={auth:{getUser:async()=>({data:{user:null},error:null}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from(){const q={select(){return q},order(){return q},limit(){return q},
    eq(){return q},in(){return q},gte(){return q},lt(){return q},
    then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};
    return q;},
  rpc:async()=>({data:[],error:null})
};
window.filterByCategory=category=>{
 document.getElementById('aeOpinions').hidden=category!=='Opiniones';
 if(category==='Opiniones')window.aeOpinions.show();
};
</script><script src="assets/cam-lazy-editorial-loader.js"></script>`;
const fixture=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'')
  .replace('</body>',stub+'</body>');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(fs.readFileSync(file));}
 catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  const context=await browser.newContext();
  const page=await context.newPage(),errors=[],downloads=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/assets\/(ae-opinions|ae-news-archive)\.js/.test(r.url()))downloads.push(r.url());});
  await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin,{waitUntil:'load'});
  assert.equal(downloads.length,0,'Home must not download either editorial module');
  assert.equal(await page.evaluate(()=>window.camLazyEditorial.isLoaded('opinions')),false);
  await page.evaluate(()=>window.filterByCategory('Opiniones'));
  await page.waitForFunction(()=>window.camLazyEditorial.isLoaded('opinions'));
  await page.waitForFunction(()=>document.querySelector('#aeOpinionsList')?.childNodes.length>0);
  assert.equal(downloads.filter(x=>x.includes('ae-opinions.js')).length,1);
  assert.equal(downloads.filter(x=>x.includes('ae-news-archive.js')).length,0);
  await page.evaluate(()=>{
    document.getElementById('aeOpinions').hidden=true;
    window.aeOpinions.rerender();
    document.querySelector('[data-ae-news-category="Todas"]').click();
  });
  await page.waitForFunction(()=>window.camLazyEditorial.isLoaded('archive'));
  await page.waitForFunction(()=>document.getElementById('aeNewsArchiveDialog').open);
  assert.equal(downloads.filter(x=>x.includes('ae-news-archive.js')).length,1);
  assert.ok((await page.locator('#aeNewsArchiveGrid').innerText()).includes('CAM News Test'));
  await page.locator('#aeNewsArchiveSearch').fill('inexistente');
  assert.ok((await page.locator('#aeNewsArchiveGrid').innerText()).includes('No encontramos noticias'));
  await page.evaluate(()=>window.aeOpenNewsArchive('NFL'));
  assert.equal(downloads.length,2,'Archive reopening must reuse loaded module');
  assert.deepEqual(errors,[],'No uncaught errors on Opiniones or archive loading');

  const deep=await context.newPage();
  deep.on('pageerror',e=>errors.push('deep-link: '+e.message));
  await deep.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await deep.goto(origin+'/?opinion=00000000-0000-0000-0000-000000000099',{waitUntil:'load'});
  await deep.waitForFunction(()=>window.camLazyEditorial.isLoaded('opinions'));
  assert.equal(await deep.evaluate(()=>document.getElementById('aeOpinions').hidden),false);
  assert.deepEqual(errors,[],'Deep-link routing should not throw');
  console.log('PASS: Home saves editorial JS; Opiniones and archive load once on demand; deep links work.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
