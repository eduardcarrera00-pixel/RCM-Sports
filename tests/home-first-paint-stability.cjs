/* Validate CAM SPORTS desktop-only Home loading footprint without changing mobile. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const source=fs.readFileSync('index.html','utf8');
assert.match(source,/<body class="cam-first-feed-pending /,'Home must declare initial state before paint');
assert.match(source,/@media\(min-width:980px\)\s*\{[\s\S]*?#heroSection/,'Desktop cover reservation must be media-scoped');
assert.match(source,/height:clamp\(205px,17vw,235px\)/,'Use the exact existing hero height, not a new design');
assert.match(source,/await Promise\.allSettled\(\[[\s\S]*?loadArticlesFromStorage\(\)[\s\S]*?document\.body\.classList\.remove\('cam-first-feed-pending'\)/,'Remove placeholder state only after loading data');
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');let location=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 if(!location.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{const ext=path.extname(location),types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};res.setHeader('Content-Type',types[ext]||'application/octet-stream');res.end(fs.readFileSync(location));}
 catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const mode of ['desktop','mobile'])for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1440,height:900}});
   await context.addInitScript(({theme})=>{
    localStorage.setItem('rcm_sports_theme',theme);
    window.__camFirstPaint=[];
    let count=0;
    const interval=setInterval(()=>{
      const hero=document.querySelector('#heroSection'),body=document.body,bottom=document.querySelector('#editorialBottom');
      if(body?.classList.contains('cam-first-feed-pending')&&hero&&bottom){
       const computed=getComputedStyle(hero);window.__camFirstPaint.push({
        heroHeight:Math.round(hero.getBoundingClientRect().height),
        heroDisplay:computed.display,
        bottomVisibility:getComputedStyle(bottom).visibility,
        bodyPending:true
       });
      }
      if(++count>200||window.__camFirstPaint.length>=5)clearInterval(interval);
    },20);
   },{theme});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>!document.body.classList.contains('cam-first-feed-pending'),{timeout:30000});
   const summary=await page.evaluate(()=>({
    samples:window.__camFirstPaint,
    bottom:getComputedStyle(document.getElementById('editorialBottom')).visibility,
    ready:document.readyState,
    bottomNav:Boolean(document.querySelector('body > nav.cam-mobile-bottom-nav'))
   }));
   assert.ok(summary.samples.length,'Capture loading state on '+mode+' '+theme);
   if(mode==='desktop'){
    assert.ok(summary.samples.some(x=>x.heroHeight>=205&&x.heroHeight<=235),'Desktop reserves the approved cover footprint from the start');
    assert.ok(summary.samples.every(x=>x.bottomVisibility==='hidden'),'Desktop editorial movement is not painted during initialization');
   }else{
    assert.ok(summary.samples.every(x=>x.bottomVisibility!=='hidden'),'Mobile editorial content must not be artificially hidden');
    assert.ok(summary.samples.every(x=>x.heroHeight===0),'No desktop cover reservation on mobile');
    assert.ok(summary.bottomNav,'Mobile category navigation must still mount');
   }
   assert.equal(summary.bottom,'visible','The real editorial content is visible after loading');
   assert.deepEqual(errors,[],'No uncaught browser errors');
   console.log('PASS '+mode+' '+theme+': correct loading footprint, final content visible, navigation retained.');
   await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
