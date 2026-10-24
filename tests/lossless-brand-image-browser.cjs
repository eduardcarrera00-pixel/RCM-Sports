/* CAM SPORTS · pixel-identical asset replaces 724 KB brand PNG.
 * Browser test keeps the existing admin image override key and data untouched.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd();
const html=fs.readFileSync('index.html','utf8');
const manager=fs.readFileSync('assets/ae-site-images.js','utf8');
const old='/assets/cam-sports-logo-completo.png';
const modern='/assets/cam-sports-logo-completo.webp';
const matches=[...html.matchAll(/<img\b[^>]*class="cam-brand-art"[^>]*>/g)];
assert.equal(matches.length,2,'Header and footer must retain identical approved artwork');
for(const m of matches){
 assert.match(m[0],/cam-sports-logo-completo\.webp/);
 assert.doesNotMatch(m[0],/cam-sports-logo-completo\.png/);
 assert.match(m[0],/width="1760" height="894"/,'Stable layout dimensions');
}
assert.ok(manager.includes("['assets/cam-sports-logo-completo.webp', 'assets/cam-sports-logo-completo.png']"),
 'Image editor must recognize both the new WebP and original PNG as the same key');
const fixture=(custom=false)=>'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<style>header{height:90px}header img{display:block;width:165px;height:auto}footer{margin-top:900px}footer img{width:150px}</style></head><body>'+
 '<header><img class="cam-brand-art" src="'+modern+'" alt="CAM Sports" width="1760" height="894"></header>'+
 '<footer><img class="cam-brand-art" src="'+modern+'" alt="CAM Sports" loading="lazy" width="1760" height="894"></footer>'+
 (custom?'<script>localStorage.setItem("cam_site_images_v2",JSON.stringify({savedAt:Date.now(),items:[{key:"marca.logo-completo",url:"https://example.test/admin-logo.png",focus_x:43,focus_y:67,alt:"Marca original"}]}))</script>':'')+
 '<script src="/assets/ae-site-images.js"></script></body></html>';
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/normal'||pathname==='/custom'){res.setHeader('Content-Type','text/html');return res.end(fixture(pathname==='/custom'));}
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
  res.setHeader('Content-Type',file.endsWith('webp')?'image/webp':'text/javascript');
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const url='http://127.0.0.1:'+server.address().port;
  for(const custom of [false,true]){
   const context=await browser.newContext({viewport:{width:1280,height:720}});
   const page=await context.newPage();
   const reqs=[],errors=[];
   page.on('request',r=>reqs.push(r.url()));
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
     if(route.request().url().endsWith('admin-logo.png'))
       return route.fulfill({status:200,contentType:'image/png',body:fs.readFileSync('assets/cam-sports-logo-completo.png')});
     return route.request().url().startsWith(url)?route.continue():route.abort();
   });
   await page.goto(url+(custom?'/custom':'/normal'),{waitUntil:'load'});
   await page.waitForFunction(()=>document.querySelector('header img')?.dataset.siteImage==='marca.logo-completo');
   const data=await page.evaluate(()=>{
    const logo=document.querySelector('header img');
    return {source:logo.currentSrc, size:[logo.naturalWidth,logo.naturalHeight],key:logo.dataset.siteImage,
      rows:window.camSiteImages?._state?.().rows||[],focus:logo.style.objectPosition};
   });
   assert.deepEqual(data.size,[1760,894],'The exact brand art maintains both pixel dimensions');
   assert.equal(data.key,'marca.logo-completo');
   if(custom){
    assert.ok(data.source.includes('admin-logo.png'), 'Admin custom image must continue taking precedence');
    assert.deepEqual(data.rows,['marca.logo-completo']);
    assert.equal(data.focus,'43% 67%');
   }else{
    assert.ok(data.source.endsWith('cam-sports-logo-completo.webp'),'The local asset is the lossless WebP');
    assert.ok(!reqs.some(x=>x.includes(old)),'The oversized local PNG must not download on default Home');
    assert.equal(reqs.filter(x=>x.endsWith(modern)).length,1,'Header and lazy footer reuse one download');
   }
   assert.deepEqual(errors,[],'No script exceptions');
   await context.close();
  }
  console.log('PASS: exact logo dimensions; WebP reused, no local PNG on Home; admin custom logo and focus preserved.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
