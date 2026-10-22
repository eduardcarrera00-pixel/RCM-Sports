/* Browser regression for homepage-only Power Rankings compression. */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const os=require('node:os');
const {chromium}=require('playwright');

const root=process.cwd();
const qa=process.env.CAM_HOME_RANKINGS_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-home-ranks-'));
fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){
  const html=fs.readFileSync('index.html','utf8')
   .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
   .replace(/<link\b[^>]*https?:[^>]*>/gi,'');
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
 }
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const launch={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};
 if(process.env.CAM_TEST_CHROMIUM_PACKAGE){
  const vendor=require(process.env.CAM_TEST_CHROMIUM_PACKAGE),api=vendor.default||vendor;
  launch.executablePath=await api.executablePath();
  launch.args=[...api.args,'--disable-dev-shm-usage'];
 }
 const browser=await chromium.launch(launch);
 try{
  const page=await browser.newPage({viewport:{width:1366,height:950}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.evaluate(()=>{
   document.body.classList.add('ae-is-home');
   document.getElementById('aeHomeSidebarFeatures').hidden=false;
   document.querySelectorAll('#aeHomeSidebarFeatures .editorial-ranking-list').forEach((list,index)=>{
    const clubs=index===0?['Philadelphia Eagles','Buffalo Bills','Kansas City Chiefs']:['FC Barcelona','Paris Saint-Germain','Real Madrid'];
    list.replaceChildren(...clubs.map((club,rank)=>{
     const li=document.createElement('li');li.className='rcm-team';
     const position=document.createElement('strong');position.textContent=String(rank+1);
     const emblem=document.createElement('span');emblem.className='ae-team-emblem';
     const name=document.createElement('span');name.className='ae-team-name';name.textContent=club;
     const trend=document.createElement('span');trend.className='ae-rank-trend';trend.textContent=rank===0?'—':'↑ 1';
     emblem.textContent=club.slice(0,2);
     li.append(position,emblem,name,trend);return li;
    }));
   });
   for(const id of ['homeRankingStatus','homeChampionsStatus'])document.getElementById(id).textContent='';
  });
  const ids=['homeRankingLink','homeChampionsLink'];
  for(const width of [360,390,430,768,1024,1366]){
   await page.setViewportSize({width,height:950});
   for(const dark of [false,true]){
    await page.evaluate(v=>document.documentElement.classList.toggle('dark',v),dark);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const baseline=await page.evaluate(ids=>{
     const link=document.querySelector('link[href*="cam-home-power-rankings-75.css"]');
     if(!link)throw Error('Scoped Power Rankings stylesheet not loaded');
     link.disabled=true;
     // Reading geometry forces the updated stylesheet cascade to settle.
     return Object.fromEntries(ids.map(id=>[id,document.getElementById(id).getBoundingClientRect().height]));
    },ids);
    await page.evaluate(()=>document.querySelector('link[href*="cam-home-power-rankings-75.css"]').disabled=false);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const report=await page.evaluate(ids=>{
     const results={};
     for(const id of ids){
      const card=document.getElementById(id),box=card.getBoundingClientRect(),items=card.querySelectorAll('.rcm-team');
      results[id]={
       height:box.height,width:box.width,
       visible:items.length===3&&[...items].every(item=>item.getBoundingClientRect().height>0),
       contained:[...items].every(item=>{
        const row=item.getBoundingClientRect();
        const name=item.querySelector('.ae-team-name').getBoundingClientRect();
        const logo=item.querySelector('.ae-team-emblem').getBoundingClientRect();
        return row.left>=box.left-1&&row.right<=box.right+1&&row.bottom<=box.bottom+1&&name.right<=row.right+1&&logo.right<=row.right+1;
       }),
       noClippedNames:[...items].every(item=>{
        const name=item.querySelector('.ae-team-name');
        return name.scrollHeight<=name.clientHeight+1&&name.scrollWidth<=name.clientWidth+1;
       }),
       hasLink:card.tagName==='A'&&!!card.getAttribute('onclick'),
       withinViewport:box.left>=-1&&box.right<=innerWidth+1
      };
     }
     return results;
    },ids);
    for(const id of ids){
     const prior=baseline[id],actual=report[id];
     assert(prior>0&&actual.height>0,JSON.stringify({id,width,dark,prior,actual}));
     const ratio=actual.height/prior;
     assert(ratio>=0.64&&ratio<=0.86,JSON.stringify({id,width,dark,ratio,prior,actual}));
     assert(actual.visible&&actual.contained&&actual.noClippedNames&&actual.hasLink&&actual.withinViewport,
      JSON.stringify({id,width,dark,actual}));
    }
    if([390,1366].includes(width)){
     await page.locator('#aeHomeSidebarFeatures').screenshot({path:path.join(qa,'home-ranks-'+width+'-'+(dark?'night':'day')+'.png')});
    }
   }
  }
  // Scope guard: no CSS selector in the new stylesheet names the sport pages.
  const css=fs.readFileSync('assets/cam-home-power-rankings-75.css','utf8');
  assert(!/#[a-zA-Z]*(?:nflRankings|championsRankings|footballTeams)/.test(css),'Sport ranking pages must stay unchanged');
  assert.deepEqual(errors,[]);
  console.log('PASS: both homepage Power Rankings previews about 75% height on day/night at 360–1366px, with no clipped rows. Screenshots: '+qa);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});