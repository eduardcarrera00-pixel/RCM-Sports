/* CAM SPORTS: record actual layout-shift sources without modifying the UI.
 * Lab-only, on a local checkout. Never submits or modifies production content.
 */
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=process.cwd();
const pathSafe=(p)=>{const pathName=path.resolve(root,'.'+decodeURIComponent(p));return pathName.startsWith(root+path.sep)?pathName:null};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 const p=pathSafe(url.pathname==='/'?'/index.html':url.pathname);
 if(!p){res.writeHead(403);return res.end();}
 try {
  const ext=path.extname(p);
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json'};
  res.setHeader('Content-Type',types[ext]||'application/octet-stream');res.end(fs.readFileSync(p));
 }catch{res.writeHead(404);res.end();}
});
const anchorSelector=el=>{
 if(!el)return '(none)';
 if(el.id)return '#'+el.id;
 const parts=[];for(let n=el;n&&n.nodeType===1&&parts.length<4;n=n.parentElement){
  let p=n.localName;if(n.classList.length)p+='.'+[...n.classList].slice(0,2).join('.');
  parts.unshift(p);
 }return parts.join(' > ');
};
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const address='http://127.0.0.1:'+server.address().port+'/';
 try{
  for(const mode of ['mobile','desktop'])for(const theme of ['day','night']){
   const context=await browser.newContext({viewport:mode==='mobile'?{width:390,height:844}:{width:1440,height:900},deviceScaleFactor:mode==='mobile'?3:1});
   await context.addInitScript(({isDark})=>{
     localStorage.setItem('rcm_sports_theme',isDark?'dark':'light');
     window.__camShiftLog=[];
     new PerformanceObserver(entries=>{
       for(const entry of entries.getEntries()){
         const sources=(entry.sources||[]).map(source=>{
           const el=source.node;
           const node=el?.nodeType===3?el.parentElement:el;
           const descriptor=node?.id?'#'+node.id:
             node?.localName+(node?.classList?.length?'.'+[...node.classList].slice(0,3).join('.'):'');
           const rect=rect=>rect?{x:Math.round(rect.x),y:Math.round(rect.y),w:Math.round(rect.width),h:Math.round(rect.height)}:null;
           return {el:descriptor||'unknown',before:rect(source.previousRect),after:rect(source.currentRect)};
         });
         window.__camShiftLog.push({at:Math.round(entry.startTime),value:+entry.value.toFixed(5),input:entry.hadRecentInput,sources});
       }
     }).observe({type:'layout-shift',buffered:true});
   },{isDark:theme==='night'});
   const page=await context.newPage();
   const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e.message).slice(0,220)));
   try{
    await page.goto(address,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(12000);
    const summary=await page.evaluate(()=>{
      const r=el=>{if(!el)return null;const b=el.getBoundingClientRect();return {top:Math.round(b.y),height:Math.round(b.height),width:Math.round(b.width)}};
      return {events:window.__camShiftLog,bodyClass:document.body.className,fonts:document.fonts.status,
       rects:Object.fromEntries(['header','mainContent','heroSection','articlesGrid','aeHomeTopTakes','aeTrendingPortada','picksFeatured','camWelcomeDialog','footer'].map(id=>[id,r(id==='header'||id==='footer'?document.querySelector(id):document.getElementById(id))]))};
    });
    const actual=summary.events.filter(x=>!x.input),total=actual.reduce((a,x)=>a+x.value,0);
    const byNode=new Map();
    for(const e of actual)for(const source of e.sources){const o=byNode.get(source.el)||{score:0,events:0};o.score+=e.value;o.events++;byNode.set(source.el,o);}
    const list=[...byNode].sort((a,b)=>b[1].score-a[1].score).slice(0,16).map(([name,value])=>({name,...value}));
    console.log('CAM CLS '+mode+' '+theme+': '+JSON.stringify({total:+total.toFixed(5),shiftCount:actual.length,topNodes:list,events:actual.slice(0,18),rects:summary.rects,fonts:summary.fonts,errors:pageErrors.slice(0,5)}));
   }catch(e){console.error('CLS RUN ERROR '+mode+' '+theme+': '+String(e));process.exitCode=1;}
   await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
