/* CAM SPORTS CSS cascade equivalence: original 94-source bundle vs 87-source bundle.
 * Same markup, same remaining linked stylesheets, same assets.
 * Real Chromium at mobile/desktop, day/night, five body routes.
 * No production API calls or writes: scripts are removed from this fixture.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');

const root=process.cwd();
const repoBase='6e1e46752f4f96c03a99cc70cdf5e2fbf4fef28c';
const baseline=execFileSync('git',['show',repoBase+':assets/ae-editorial-bundle.css'],{encoding:'utf8',maxBuffer:5e6});
const optimized=fs.readFileSync('assets/ae-editorial-bundle.css','utf8');
const before=JSON.parse(execFileSync('git',['show',repoBase+':assets/style-sources.json'],{encoding:'utf8'}));
const after=JSON.parse(fs.readFileSync('assets/style-sources.json','utf8'));
const packs=JSON.parse(fs.readFileSync('assets/performance-css-packs.json','utf8')).groups.flatMap(x=>x.sources);
const removed=before.filter(p=>!after.includes(p));
assert.equal(removed.length,7,'Only the seven later-duplicated CSS sources are removed');
assert.deepEqual(after,before.filter(p=>!removed.includes(p)),'Preserve every other editorial source and its order');
assert(removed.every(p=>packs.includes(p)),'Each removed source must remain in a later CSS pack');
assert(optimized.length<baseline.length-50000,'Bundle should save at least 50 KB uncompressed');
assert(!/@import\b|@layer\b/.test(removed.map(p=>fs.readFileSync(p,'utf8')).join('')),
 'Cascade-sensitive CSS imports/layers cannot be deleted without separate analysis');

let html=fs.readFileSync('index.html','utf8');
html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
 .replace(/<link\b[^>]*href="https?:\/\/[^"]+"[^>]*>/gi,'');
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
  const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':
   file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':
   file.endsWith('.webp')?'image/webp':file.endsWith('.jpg')?'image/jpeg':'application/octet-stream';
  res.setHeader('Content-Type',type);res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
const properties=[
 'display','visibility','position','color','background-color','background-image',
 'font-family','font-size','font-weight','line-height','letter-spacing','text-align',
 'padding-top','padding-right','padding-bottom','padding-left','margin-top','margin-left',
 'border-top-width','border-top-color','border-radius','box-shadow',
 'flex-direction','align-items','justify-content','grid-template-columns','gap',
 'overflow','overflow-x','overflow-y','z-index','order','object-position','opacity'
];
const pages=[
 {label:'mobile day',w:390,h:844,dpr:3,dark:false},
 {label:'mobile night',w:390,h:844,dpr:3,dark:true},
 {label:'desktop day',w:1440,h:900,dpr:1,dark:false},
 {label:'desktop night',w:1440,h:900,dpr:1,dark:true}
];
const categories=['Todos','Picks','NFL','Fútbol','Opiniones'];
async function sample(browser,origin,test,old){
 const context=await browser.newContext({viewport:{width:test.w,height:test.h},deviceScaleFactor:test.dpr});
 const page=await context.newPage();
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 if(old)await page.route('**/assets/ae-editorial-bundle.css*',route=>
  route.fulfill({status:200,contentType:'text/css; charset=utf-8',body:baseline}));
 try{
  await page.goto(origin,{waitUntil:'load'});
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  return await page.evaluate(({dark,categories,props})=>{
   document.documentElement.classList.toggle('dark',dark);
   const all=[...document.body.querySelectorAll('*')].slice(0,3000);
   const result={};
   for(const category of categories){
    document.body.classList.remove('ae-is-picks','ae-is-nfl','ae-is-football','ae-is-opinions');
    if(category==='Picks')document.body.classList.add('ae-is-picks');
    else if(category==='NFL')document.body.classList.add('ae-is-nfl');
    else if(category==='Fútbol')document.body.classList.add('ae-is-football');
    else if(category==='Opiniones')document.body.classList.add('ae-is-opinions');
    result[category]=all.map((element,index)=>{
      const style=getComputedStyle(element);
      const id=element.id?'#'+element.id:'';
      const cls=(element.getAttribute('class')||'').slice(0,100).replace(/\\s+/g,'.');
      return [index, element.localName+id+(cls?'.'+cls:''), ...props.map(prop=>style.getPropertyValue(prop))];
    });
   }
   return result;
  },{dark:test.dark,categories,props:properties});
 }finally{await context.close();}
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const origin='http://127.0.0.1:'+server.address().port+'/';
  for(const conf of pages){
   const old=await sample(browser,origin,conf,true);
   const next=await sample(browser,origin,conf,false);
   for(const cat of categories){
    assert.equal(next[cat].length,old[cat].length,'Same DOM for '+conf.label+' '+cat);
    for(let i=0;i<old[cat].length;i++){
     for(let p=0;p<properties.length;p++){
      const a=old[cat][i][p+2],b=next[cat][i][p+2];
      if(a!==b)throw Error('CSS mismatch '+conf.label+'/'+cat+
       ', element '+i+' ('+old[cat][i][1]+'), property '+properties[p]+' (before='+a+', after='+b+')');
     }
    }
   }
   console.log('PASS '+conf.label+': '+next.Todos.length+' DOM nodes, '+categories.length+' sections, '+properties.length+' CSS properties, identical computed styles');
  }
  console.log('PASS source list: 7 truly repeated stylesheet files removed from earlier bundle; '+(baseline.length-optimized.length)+' CSS bytes avoided.');
 }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);server.close();process.exitCode=1;});
