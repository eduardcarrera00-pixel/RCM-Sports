/* CAM SPORTS: the default Home class must exist before first render.
 * Chromium compares the current route CSS with the old delayed-route startup,
 * without Supabase, JS rerenders or user data. A geometry regression blocks merge.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd(),source=fs.readFileSync('index.html','utf8');
const initial=source.match(/<body\b[^>]*>/)?.[0]||'';
assert.match(initial,/\bae-is-home\b/,'Home must receive its route class in the initial HTML');
assert.match(source,/let currentCategory = 'Todos'/,'Initial selected category should remain Home');
assert.match(source,/document\.body\.classList\.toggle\('ae-is-home', isHome\)/,
 'Existing route transitions must still own the Home class after startup');

const fixture=source
 .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
 .replace(/<link\b[^>]*href="https?:\/\/[^"]+"[^>]*>/gi,'');
const orig=fixture.replace(/(<body\b[^>]*?) ae-is-home(?=[^>]*>)/,'$1');
assert.notEqual(orig,fixture,'Baseline must remove only the initial Home class');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/original'||url.pathname==='/optimized'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  return res.end(url.pathname==='/original'?orig:fixture);
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
  const ext=path.extname(file);
  res.setHeader('Content-Type',ext==='.css'?'text/css':ext==='.webp'?'image/webp':ext==='.png'?'image/png':ext==='.svg'?'image/svg+xml':'application/octet-stream');
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
const rect=async page=>page.evaluate(()=>{
 const h=document.querySelector('body>header')?.getBoundingClientRect();
 const m=document.getElementById('mainContent')?.getBoundingClientRect();
 const s=document.getElementById('dataStatus')?.getBoundingClientRect();
 return {header:Math.round(h?.height||0),mainTop:Math.round(m?.top||0),
  statusTop:Math.round(s?.top||0),home:document.body.classList.contains('ae-is-home')};
});
(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const width of [390,1366])for(const dark of [true,false]){
   const context=await browser.newContext({viewport:{width,height:850}});
   const first=await context.newPage(),stable=await context.newPage();
   for(const page of [first,stable]){
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    await page.addInitScript(theme=>localStorage.setItem('rcm_sports_theme',theme?'dark':'light'),dark);
   }
   await first.goto(base+'/original',{waitUntil:'load'});
   await stable.goto(base+'/optimized',{waitUntil:'load'});
   await Promise.all([first.evaluate(()=>document.fonts.ready),stable.evaluate(()=>document.fonts.ready)]);
   const baseline=await rect(first),initial=await rect(stable);
   assert.equal(baseline.home,false,'Old Home view lacks route class before JS');
   assert.equal(initial.home,true,'New Home view has route class immediately');
   await first.evaluate(()=>document.body.classList.add('ae-is-home'));
   const oldFinal=await rect(first);
   assert.deepEqual({header:initial.header,mainTop:initial.mainTop},
    {header:oldFinal.header,mainTop:oldFinal.mainTop},
    'New first frame must match the established final Home geometry');
   assert.ok(initial.header>0 && initial.mainTop>0,'Header and content remain visible');
   const jump=Math.abs(baseline.mainTop-oldFinal.mainTop);
   console.log('PASS '+width+'px '+(dark?'night':'day')+
    ': old late-class main jump='+jump+'px; early Home class first frame matches final (0px class-induced shift)');
   await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
