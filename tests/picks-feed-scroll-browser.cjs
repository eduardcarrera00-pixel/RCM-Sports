/* 20-Pick scroll regression across desktop/mobile and day/night. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd();
const output=process.env.CAM_PICKS_SCROLL_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-picks-scroll-'));
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){
  const html=fs.readFileSync('index.html','utf8')
   .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
   .replace(/<link\b[^>]*https?:[^>]*>/gi,'')
   .replace('</body>','<script src="assets/community-picks.js"></script><script src="assets/ae-picks-premium.js"></script></body>');
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
 }
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const launch={headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};
 if(process.env.CAM_TEST_CHROMIUM_PACKAGE){
  const vendor=require(process.env.CAM_TEST_CHROMIUM_PACKAGE),api=vendor.default||vendor;
  launch.executablePath=await api.executablePath();
  launch.args=[...api.args,'--disable-dev-shm-usage'];
 }
 const browser=await chromium.launch(launch);
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
  await page.addInitScript(()=>{
   window.currentCategory='Picks';window.currentAdmin=null;
   const eventDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000));
   const active=Array.from({length:20},(_,index)=>({
    id:'00000000-0000-0000-0000-'+String(index+2).padStart(12,'0'),
    user_id:'writer-'+index,author:'writer'+index,title:'Equipo '+index+' vs Equipo rival',
    american_odds:150+index,event_date:eventDate,
    created_at:new Date(Date.now()-index*60000).toISOString(),
    moderation_status:'approved',outcome:'pending',settled_at:null,
    result_points:0,upvotes:2,downvotes:1,comments_count:3,
    legs:[{sport:'Fútbol',event:'Equipo '+index+' vs Equipo rival',selection:'Equipo '+index+' gana'}]
   }));
   const settled={...active[0],id:'00000000-0000-0000-0000-000000000099',outcome:'won',settled_at:new Date().toISOString(),result_points:1.5};
   window.__feedRange=[];
   window.CamPickShare={button:()=>{
    const button=document.createElement('button');
    button.className='qa-share';button.type='button';button.textContent='Compartir';
    return button;
   }};
   window.db={
    auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange(){}},
    rpc:async()=>({data:[],error:null}),
    from(table){
     const filters={};
     const q={
      select(){return q;},order(){return q;},limit(){return q;},or(){return q;},
      range(start,end){if(table==='ae_pick_feed')window.__feedRange.push([start,end]);return q;},
      eq(k,v){filters[k]=v;return q;},in(k,v){filters[k]=v;return q;},
      gte(){return q;},lte(){return q;},gt(){return q;},lt(){return q;},not(){return q;},
      then(resolve,reject){
       let data=[];
       if(table==='ae_pick_feed'){
        if(filters.outcome==='pending')data=active;
        else if(filters.outcome==='won'||Array.isArray(filters.outcome))data=[settled];
       }
       return Promise.resolve({data,error:null}).then(resolve,reject);
      }
     };
     return q;
    }
   };
  });
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForSelector('#cpFeed > .cp-card:nth-child(20)');
  for(const width of [360,390,768,910,911,1366]){
   await page.setViewportSize({width,height:900});
   await page.waitForFunction(()=>{
    const footer=document.getElementById('cpFeedFooter');
    return innerWidth>=911?!!footer.closest('.ae-picks-community-main'):footer.parentElement.id==='communityPicks';
   });
   for(const dark of [true,false]){
    await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result=await page.evaluate(()=>{
     const feed=document.getElementById('cpFeed'),footer=document.getElementById('cpFeedFooter');
     const cards=[...feed.querySelectorAll(':scope > .cp-card')];
     const feedBox=feed.getBoundingClientRect(),footerBox=footer.getBoundingClientRect();
     const computed=getComputedStyle(feed);
     return {
      twenty:cards.length===20,
      correctPageSize:window.__feedRange.some(([start,end])=>start===0&&end===19),
      sortedNewestFirst:cards[0].querySelector('.cp-card-read-link')?.href.includes('000000000002')
       &&cards.at(-1).querySelector('.cp-card-read-link')?.href.includes('000000000021'),
      scrollEnabled:computed.overflowY==='auto'&&feed.scrollHeight>feed.clientHeight+10,
      cappedHeight:feed.clientHeight<=innerHeight*.79+3,
      footerOutside:!feed.contains(footer),
      footerBelow:footerBox.top>=feedBox.bottom-2,
      footerVisible:footerBox.height>0&&getComputedStyle(footer).display!=='none',
      footerFits:footerBox.left>=-1&&footerBox.right<=innerWidth+1,
      noHorizontalOverflow:feed.scrollWidth<=feed.clientWidth+2,
      cardStructureUnchanged:cards.every(c=>c.querySelector('.cp-card-title')&&c.querySelector('.cp-card-read-link')&&c.querySelector('.cp-card-legs')),
      actionsPreserved:cards.every(c=>c.querySelector('.cp-feed-author')&&c.querySelector('.cp-upvote')&&c.querySelector('.cp-downvote')
       &&c.querySelector('.cp-replies-button')&&c.querySelector('.qa-share'))
     };
    });
    assert(Object.values(result).every(Boolean),JSON.stringify({width,dark,result}));
    await page.evaluate(()=>{const feed=document.getElementById('cpFeed');feed.scrollTop=feed.scrollHeight;});
    assert(await page.evaluate(()=>document.getElementById('cpFeed').scrollTop>0),'Feed must scroll with 20 items');
    await page.evaluate(()=>{document.getElementById('cpFeed').scrollTop=0;});
    if([390,1366].includes(width)){
     await page.locator('#communityPicks').screenshot({path:path.join(output,'picks-'+width+'-'+(dark?'night':'day')+'.png')});
    }
   }
  }
  await page.locator('#cpViewAll').click();
  assert(await page.locator('#cpArchiveDialog').evaluate(dialog=>dialog.open),'Outside archive button must open the original modal');
  assert.deepEqual(errors,[]);
  console.log('PASS: 20 recent Picks, preserved controls, internal scroll and outside archive button at 360–1366px in both themes. Screenshots: '+output);
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
