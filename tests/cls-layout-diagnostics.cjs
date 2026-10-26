/* CAM SPORTS · Read-only first visit layout-shift diagnostic.
 * Full original HTML + local CSS and scripts + existing public data reads.
 * Captures browser layout-shift entries before any app scripts execute.
 */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 let pathname=decodeURIComponent(u.pathname);
 if(pathname==='/')pathname='/index.html';
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
   const ext=path.extname(file).slice(1),map={html:'text/html',css:'text/css',js:'text/javascript',webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',svg:'image/svg+xml',json:'application/json',woff2:'font/woff2'};
   res.setHeader('Content-Type',map[ext]||'application/octet-stream');
   res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
const init=()=>{
 const identify=node=>{
   if(!node)return '?';
   if(node.nodeType!==1)return '#text';
   if(node.id)return '#'+node.id;
   const c=typeof node.className==='string'?node.className.trim().split(/\s+/).slice(0,2).join('.'):'';
   return node.tagName.toLowerCase()+(c?'.'+c:'');
 };
 window.__camShifts=[];
 window.__camTimeline=[];
 let total=0;
 try{new PerformanceObserver(list=>{
   for(const e of list.getEntries()){
     if(e.hadRecentInput)continue;
     total+=e.value;
     const sources=(e.sources||[]).slice(0,7).map(s=>{
       const rect=r=>r?{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}:null;
       return {node:identify(s.node),previous:rect(s.previousRect),current:rect(s.currentRect)};
     });
     window.__camShifts.push({at:Math.round(e.startTime),value:Number(e.value.toFixed(4)),sources});
   }
 }).observe({type:'layout-shift',buffered:true});}catch(e){window.__camError=String(e)}
 window.__camGet=()=>({total,shifts:window.__camShifts,events:window.__camTimeline});
};
(async()=>{
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const host='http://127.0.0.1:'+server.address().port;
 for(const [width,height,theme] of [[390,844,'dark'],[390,844,'light'],[1366,900,'dark']]){
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width<500?3:1});
   // Nunca contra el Supabase real (cuota de egress y visitas falsas).
   await context.route(/^https:\/\/[a-z0-9-]+\.supabase\.co\//i,route=>route.abort());
   const page=await context.newPage();
   await page.addInitScript(init);
   await page.addInitScript(t=>localStorage.setItem('rcm_sports_theme',t),theme);
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message.slice(0,150)));
   await page.goto(host,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(11000);
   const data=await page.evaluate(()=>({
     ...window.__camGet(),
     body:document.body.className,
     welcome:document.getElementById('camWelcomeDialog')?.open,
     fonts:document.fonts.status,
     rects:Object.fromEntries(['dataStatus','mainContent','picksFeatured','articlesGrid','aeHomeSidebarFeatures','noResults'].map(id=>{
       const n=document.getElementById(id),r=n?.getBoundingClientRect();
       return [id,{visible:!!(r?.height),top:Math.round(r?.top||0),height:Math.round(r?.height||0)}];
     }))
   }));
   const title=width+'px '+theme;
   console.log('CAM_CLS '+title+' '+JSON.stringify({total:Number(data.total.toFixed(4)),shifts:data.shifts.sort((a,b)=>b.value-a.value).slice(0,16),rects:data.rects,welcome:data.welcome,fonts:data.fonts,errors:errors.slice(0,4)}));
   const dir=path.join(root,'cls-artifacts');
   fs.mkdirSync(dir,{recursive:true});
   fs.writeFileSync(path.join(dir,'cls-'+width+'-'+theme+'.json'),JSON.stringify({title,...data,errors},null,2));
   await context.close();
 }
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
