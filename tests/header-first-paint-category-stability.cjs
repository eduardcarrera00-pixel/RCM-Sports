/* CAM SPORTS — first paint navigation stability, not a redesign.
 * Compare current HTML with the previous HTML before the dormant categories
 * become hidden. Run actual application styles in Chromium on both themes.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=process.cwd();
const html=fs.readFileSync('index.html','utf8');
const categories=['Fútbol Americano Colegial','NBA','Tenis','Ciclismo'];
for(const category of categories){
  assert.match(html,new RegExp('data-category="'+category+'" hidden aria-hidden="true"'),
    category+' must start hidden so navigation does not jump');
}
const original=html.replace(/(<button[^>]*data-category="(?:Fútbol Americano Colegial|NBA|Tenis|Ciclismo)") hidden aria-hidden="true"/g,'$1');
assert.equal((html.match(/data-category="(?:Fútbol Americano Colegial|NBA|Tenis|Ciclismo)" hidden aria-hidden="true"/g)||[]).length,4);
const prep=(str,enableDb)=>{
  const scripts=enableDb?`<script>
   let currentCategory='Todos';
   window.db={
    from:()=>({select:()=>Promise.resolve({data:[{category:'NBA',visible:true}],error:null})}),
    auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}
   };
   window.filterByCategory=()=>{};
   </script><script src="/assets/ae-category-visibility.js"></script>`:'';
  return str.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace(/<link\b[^>]*href="https?:\/\/[^"]+"[^>]*>/gi,'')
    .replace('</body>',scripts+'</body>');
};
const originals=prep(original,false),optimized=prep(html,false),admin=prep(html,true);
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  if(['/before','/after','/enabled'].includes(u.pathname)){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end(u.pathname==='/before'?originals:u.pathname==='/after'?optimized:admin);
  }
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{
    const ext=path.extname(file);
    const types={'.css':'text/css','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg'};
    res.setHeader('Content-Type',types[ext]||'application/octet-stream');
    res.end(fs.readFileSync(file));
  }catch{res.writeHead(404);res.end()}
});
const inspect=()=>({
  header:Math.round(document.querySelector('body>header').getBoundingClientRect().height),
  top:Math.round(document.getElementById('mainContent').getBoundingClientRect().top),
  navHeight:Math.round(document.querySelector('nav.ae-sport-nav').getBoundingClientRect().height),
  visible:[...document.querySelectorAll('nav.ae-sport-nav .category-btn[data-category]')]
    .filter(x=>getComputedStyle(x).display!=='none' && x.getClientRects().length>0)
    .map(x=>x.dataset.category)
});
(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const origin='http://127.0.0.1:'+server.address().port;
  for(const width of [390,1366])for(const theme of ['dark','light']){
    const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:width<500?3:1});
    const before=await context.newPage(),after=await context.newPage();
    for(const page of [before,after]){
      await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      await page.addInitScript(t=>localStorage.setItem('rcm_sports_theme',t),theme);
    }
    await Promise.all([before.goto(origin+'/before',{waitUntil:'load'}),after.goto(origin+'/after',{waitUntil:'load'})]);
    const oldStart=await before.evaluate(inspect),newStart=await after.evaluate(inspect);
    await before.evaluate(cats=>cats.forEach(category=>{
      const n=document.querySelector('nav.ae-sport-nav [data-category="'+category+'"]');
      n.hidden=true;n.setAttribute('aria-hidden','true');
    }),categories);
    const oldFinal=await before.evaluate(inspect);
    console.log('DEBUG nav '+width+' '+theme+' '+JSON.stringify({oldStart,newStart,oldFinal}));
    assert.equal(newStart.header,oldFinal.header,'New first-paint header height equals previously settled height');
    assert.equal(newStart.top,oldFinal.top,'Main starts in settled position, no vertical jump');
    assert.deepEqual(newStart.visible,oldFinal.visible,'Visible navigation options unchanged');
    if(width===390){
      assert.ok(oldStart.header>=oldFinal.header+80,'Old mobile page should show extra rows before JS hides sports');
      assert.ok(oldStart.top>=oldFinal.top+80,'Previously had an avoidable vertical movement');
    }
    console.log('PASS '+width+'px '+theme+': old provisional header '+oldStart.header+
       'px -> final '+oldFinal.header+'px; optimized from first frame '+newStart.header+'px, same 4 visible sports');
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const enabled=await context.newPage();
  await enabled.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await enabled.goto(origin+'/enabled',{waitUntil:'load'});
  await enabled.waitForFunction(()=>document.querySelector('nav.ae-sport-nav [data-category="NBA"]')?.hidden===false);
  const data=await enabled.evaluate(inspect);
  assert.ok(data.visible.includes('NBA'),'Server/admin visibility enabled sport can still appear');
  assert.ok(!data.visible.includes('Tenis'),'Dormant sports remain off by default');
  console.log('PASS: admin-controlled NBA enabled via same existing category visibility loader.');
  await context.close();
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
