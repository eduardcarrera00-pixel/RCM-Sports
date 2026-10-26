/* Diagnostic only: attribute real layout shifts on the first Home visit.
 * No DOM edits, no database writes, no page UI changes.
 */
const {chromium}=require('playwright');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=process.cwd();
const selected=['body','body>header','#dataStatus','#mainContent','.editorial-layout','#articlesGrid','#editorialBottom','#cpWeekly','#aeHomeSidebarFeatures','#aeTrendingPortada','#communityLeaders','#camWelcomeDialog','body>footer'];
const ext={'css':'text/css','html':'text/html','js':'application/javascript','webp':'image/webp','png':'image/png','svg':'image/svg+xml','jpg':'image/jpeg','jpeg':'image/jpeg','woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
   const type=ext[path.extname(file).slice(1)]||'application/octet-stream';
   res.setHeader('Content-Type',type);res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const conf of [{name:'mobile',width:390,height:844,dpr:3},{name:'desktop',width:1440,height:900,dpr:1}]){
    const ctx=await browser.newContext({viewport:{width:conf.width,height:conf.height},deviceScaleFactor:conf.dpr});
    // Nunca contra el Supabase real (cuota de egress y visitas falsas).
    await ctx.route(/^https:\/\/[a-z0-9-]+\.supabase\.co\//i,route=>route.abort());
    const page=await ctx.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({selected})=>{
      const pathFor=node=>{
        if(!node)return '?';
        const list=[];let n=node;
        while(n&&n.nodeType===1&&list.length<5){
          let seg=n.tagName.toLowerCase();
          if(n.id){seg+='#'+n.id;list.unshift(seg);break;}
          if(n.classList?.length)seg+='.'+[...n.classList].slice(0,2).join('.');
          list.unshift(seg);n=n.parentElement;
        }
        return list.join(' > ');
      };
      window.__camShifts=[];
      window.__camSnapshots=[];
      try{
        new PerformanceObserver(list=>{
          for(const e of list.getEntries()){
            if(!e.hadRecentInput){
              window.__camShifts.push({time:Math.round(e.startTime),score:+e.value.toFixed(5),
                sources:(e.sources||[]).slice(0,6).map(s=>({
                  element:pathFor(s.node),
                  old:s.previousRect?{x:Math.round(s.previousRect.x),y:Math.round(s.previousRect.y),w:Math.round(s.previousRect.width),h:Math.round(s.previousRect.height)}:null,
                  next:s.currentRect?{x:Math.round(s.currentRect.x),y:Math.round(s.currentRect.y),w:Math.round(s.currentRect.width),h:Math.round(s.currentRect.height)}:null
                }))
              });
            }
          }
        }).observe({type:'layout-shift',buffered:true});
      }catch(e){window.__camShiftError=String(e);}
      const probe=()=>{
        const state={time:Math.round(performance.now())};
        for(const sel of selected){
          const e=document.querySelector(sel);
          if(e){const r=e.getBoundingClientRect();state[sel]=[Math.round(r.y),Math.round(r.height),e.hidden?'hidden':'visible'];}
        }
        const old=window.__camSnapshots.at(-1);
        if(!old||selected.some(s=>JSON.stringify(old[s])!==JSON.stringify(state[s]))){
          window.__camSnapshots.push(state);
          if(window.__camSnapshots.length>120)window.__camSnapshots.shift();
        }
      };
      document.addEventListener('DOMContentLoaded',()=>{
        probe();
        const id=setInterval(probe,300);
        setTimeout(()=>clearInterval(id),18000);
      },{once:true});
    },{selected});
    const base='http://127.0.0.1:'+server.address().port+'/';
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForTimeout(17000);
    const data=await page.evaluate(()=>({
      score:+window.__camShifts.reduce((s,x)=>s+x.score,0).toFixed(5),
      shifts:window.__camShifts.sort((a,b)=>b.score-a.score).slice(0,20),
      snapshots:window.__camSnapshots,
      status:document.getElementById('dataStatus')?.textContent,
      welcome:document.getElementById('camWelcomeDialog')?.open||false,
      errors:window.__camShiftError||null,
      fonts:document.fonts.status
    }));
    console.log('\nCAM CLS DIAG '+conf.name+': '+JSON.stringify({score:data.score,status:data.status,welcome:data.welcome,fonts:data.fonts,errors,observerError:data.errors}));
    console.log('TOP LAYOUT SHIFTS '+conf.name+': '+JSON.stringify(data.shifts));
    console.log('ELEMENT HEIGHT CHANGES '+conf.name+': '+JSON.stringify(data.snapshots.filter((v,i,arr)=>i<2||v.time-arr[i-1].time>100||JSON.stringify(v)!==JSON.stringify(arr[i-1])).slice(0,28)));
    await ctx.close();
  }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
