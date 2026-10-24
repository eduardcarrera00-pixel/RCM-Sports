/* CAM SPORTS — diagnose real layout shifts on a cold visit.
 * Read-only browser test; no real-user accounts and no production writes.
 * Prints largest unstable DOM nodes, not screenshots or private content.
 */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd(),MAX_WAIT=6500;
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml',
 '.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png',
 '.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 const p=path.resolve(root,'.'+name);
 if(p!==root&&!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 const file=p===root?path.join(root,'index.html'):p;
 try{
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  const contents=fs.readFileSync(file);
  if(p===root && new URL(req.url,'http://127.0.0.1').searchParams.has('cls_before')){
   const html=contents.toString('utf8').replace(' selection:text-white ae-is-home">',' selection:text-white">');
   return res.end(html);
  }
  res.end(contents);
 }catch{res.writeHead(404);res.end();}
});
const initScript=({seen})=>{
 // Keep this instrumentation installed before the first script and paint.
 window.__camShifts=[];
 if(seen)sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1');
 else sessionStorage.removeItem('cam_sports_home_welcome_seen_session_v1');
 const describe=node=>{
  if(!node||node.nodeType!==1)return 'unknown';
  const id=node.id?'#'+node.id:'';
  const classes=(node.getAttribute('class')||'').trim().split(/\s+/).slice(0,3).map(x=>'.'+x).join('');
  const parent=node.parentElement;
  const p=parent?(parent.id?'#'+parent.id:parent.localName):'';
  return node.localName+id+classes+(p?' in '+p:'');
 };
 try{
  const observer=new PerformanceObserver(list=>{
   for(const entry of list.getEntries()){
    const data={t:Math.round(entry.startTime),value:entry.value,input:entry.hadRecentInput,
      sources:(entry.sources||[]).map(s=>({node:describe(s.node),
        prev:s.previousRect&&{x:s.previousRect.x,y:s.previousRect.y,w:s.previousRect.width,h:s.previousRect.height},
        curr:s.currentRect&&{x:s.currentRect.x,y:s.currentRect.y,w:s.currentRect.width,h:s.currentRect.height}}))};
    window.__camShifts.push(data);
   }
  });
  observer.observe({type:'layout-shift',buffered:true});
 }catch(e){window.__camShiftError=e.message;}
};
function sessionMax(list){
 let max=0,sum=0,last=-1,start=-1;
 for(const x of list.filter(x=>!x.input).sort((a,b)=>a.t-b.t)){
  if(last<0||x.t-last>1000||x.t-start>5000){sum=0;start=x.t;}
  sum+=x.value;
  max=Math.max(max,sum);
  last=x.t;
 }
 return max;
}
(async()=>{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const url='http://127.0.0.1:'+server.address().port+'/';
 try{
  for(const variant of [
   {label:'mobile initial baseline',w:390,h:844,dpr:3,seen:false,before:true},
   {label:'mobile initial Home class',w:390,h:844,dpr:3,seen:false,before:false},
   {label:'mobile returning baseline',w:390,h:844,dpr:3,seen:true,before:true},
   {label:'mobile returning Home class',w:390,h:844,dpr:3,seen:true,before:false},
   {label:'desktop initial baseline',w:1366,h:900,dpr:1,seen:false,before:true},
   {label:'desktop initial Home class',w:1366,h:900,dpr:1,seen:false,before:false}
  ]){
   const context=await browser.newContext({viewport:{width:variant.w,height:variant.h},deviceScaleFactor:variant.dpr});
   const page=await context.newPage(),errors=[],failed=[];
   page.on('pageerror',e=>errors.push(e.message.slice(0,150)));
   page.on('requestfailed',request=>{if(failed.length<8)failed.push(new URL(request.url()).hostname)});
   await page.route('**/*',route=>{
    const method=route.request().method();
    return method==='GET'||method==='HEAD'||method==='OPTIONS'?route.continue():route.abort('blockedbyclient');
   });
   await page.addInitScript(initScript,{seen:variant.seen});
   await page.goto(url+(variant.before?'?cls_before=1':''),{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(MAX_WAIT);
   const d=await page.evaluate(()=>({
    shifts:window.__camShifts||[],error:window.__camShiftError||null,
    welcomeOpen:Boolean(document.getElementById('camWelcomeDialog')?.open),
    sections:[...document.querySelectorAll('main,header,footer,#mainContent,#articlesGrid,#aeHomeSidebarFeatures')]
      .slice(0,12).map(n=>({name:n.id||n.localName,rect:{y:Math.round(n.getBoundingClientRect().y),
       h:Math.round(n.getBoundingClientRect().height)}}))
   }));
   const shifts=d.shifts.filter(x=>!x.input).sort((a,b)=>b.value-a.value);
   console.log('CLS CASE '+variant.label+' | sessionMax='+sessionMax(d.shifts).toFixed(4)+
    ' | sum='+d.shifts.filter(x=>!x.input).reduce((s,x)=>s+x.value,0).toFixed(4)+
    ' | count='+shifts.length+' | welcome='+d.welcomeOpen);
   for(const x of shifts.slice(0,12)){
    console.log('SHIFT '+x.value.toFixed(4)+' at '+x.t+' ms: '+JSON.stringify(x.sources.slice(0,5)));
   }
   console.log('SECTIONS '+JSON.stringify(d.sections));
   console.log('ENV '+JSON.stringify({observer:d.error,errors:errors.slice(0,5),failedHosts:[...new Set(failed)].slice(0,7)}));
   await context.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
