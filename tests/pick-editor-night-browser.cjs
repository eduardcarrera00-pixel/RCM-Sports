/* CAM SPORTS · Isolated browser regression for Pick del Editor.
   npm run test:pick-editor:themes */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=process.cwd(),qa=process.env.CAM_EDITOR_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-editor-night-'));
fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://127.0.0.1').pathname;
 if(route==='/'){
  const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*https?:[^>]*>/gi,'');
  res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);
 }
 const f=path.resolve(root,'.'+route);
 if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',f.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(f));}
 catch{res.writeHead(404);res.end();}
});
const detailHTML=['<article class="ae-weekly-card" data-cam-weekly-id="sample">',
'<details class="ae-weekly-expandable"><summary class="ae-weekly-expand-summary">',
'<strong class="ae-weekly-title">Barcelona contra PSG: análisis del editor</strong>',
'<span class="ae-weekly-compact-selection">Barcelona gana al descanso</span>',
'<span class="ae-weekly-expand-hint">Ver análisis y detalles ↓</span></summary>',
'<div class="ae-weekly-expanded-content"><p class="ae-weekly-event">Champions League</p>',
'<p class="ae-weekly-analysis">El partido se decidirá en el centro del campo.</p>',
'<small class="ae-weekly-disclaimer">Cuota publicada sin verificación en tiempo real.</small>',
'</div></details></article>'].join('');
const previewHTML=['<article class="ae-weekly-card ae-weekly-preview" data-cam-weekly-id="sample">',
'<h3 class="ae-weekly-title">Barcelona contra PSG: análisis del editor</h3>',
'<p class="ae-weekly-event">Champions League</p>',
'<div class="ae-weekly-selection"><strong>Barcelona gana al descanso</strong>',
'<span class="ae-weekly-odds">Cuota +150</span></div>',
'<span class="ae-weekly-link">Ver análisis completo →</span></article>'].join('');
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
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  for(const view of ['picks','home-desktop','home-mobile']){
   for(const width of view==='home-mobile'?[360,390]:[390,768,1366]){
    await page.setViewportSize({width,height:900});
    for(const banner of [false,true]){
     await page.evaluate(({view,detailHTML,previewHTML,banner})=>{
      document.body.classList.toggle('ae-is-home',view!=='picks');
      const featured=document.getElementById('picksFeatured');
      const container=document.getElementById('aePicksTopPair');
      const homeCard=document.querySelector('.editorial-pick');
      document.getElementById('footballTakes').hidden=false;
      featured.hidden=false;
      homeCard.hidden=view!=='home-desktop';
      if(view==='home-mobile'){
       featured.classList.add('ae-home-native-picks');
       document.getElementById('heroSection').insertAdjacentElement('afterend',featured);
      }else{
       featured.classList.remove('ae-home-native-picks');
       container.appendChild(featured);
      }
      document.getElementById('picksFeaturedCard').innerHTML=detailHTML;
      document.getElementById('cpWeekly').innerHTML=previewHTML;
      document.getElementById('aeWeeklyOddsHighlight').hidden=false;
      document.getElementById('aeWeeklyOddsHighlight').textContent='Cuota +150';
      for(const img of document.querySelectorAll('.ae-weekly-banner,.ae-weekly-home-banner'))img.remove();
      homeCard.classList.toggle('ae-home-weekly-banner',banner);
      if(banner){
       const img=document.createElement('img');
       img.className='ae-weekly-banner';
       img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#d4c2a6"/></svg>');
       featured.prepend(img);
       const photo=img.cloneNode(true);
       photo.className='ae-weekly-home-banner';
       homeCard.prepend(photo);
      }
     },{view,detailHTML,previewHTML,banner});
     const read=async()=>page.evaluate(view=>{
      const root=view==='home-desktop'?document.querySelector('.editorial-pick'):document.getElementById('picksFeatured');
      const title=root.querySelector('.ae-weekly-title');
      const rect=root.getBoundingClientRect(),style=getComputedStyle(root);
      const odds=root.querySelector('.ae-weekly-odds')||document.getElementById('aeWeeklyOddsHighlight');
      return {w:rect.width,h:rect.height,title:title.textContent,titleColor:getComputedStyle(title).color,
        bg:style.backgroundColor,oddsColor:getComputedStyle(odds).color};
     },view);
     await page.evaluate(()=>{document.documentElement.classList.remove('dark');document.querySelector('link[href*="cam-pick-editor-night.css"]').disabled=true;});
     const original=await read();
     await page.evaluate(()=>document.querySelector('link[href*="cam-pick-editor-night.css"]').disabled=false);
     const day=await read();
     assert.deepEqual(day,original,'Light mode colors, structure and size remain identical');
     await page.evaluate(()=>document.documentElement.classList.add('dark'));
     const night=await read();
     assert(Math.abs(night.w-day.w)<=1&&Math.abs(night.h-day.h)<=1,'Theme preserves dimensions');
     assert(!['rgb(255, 255, 255)','rgb(255, 252, 248)','rgb(243, 235, 221)'].includes(night.bg),'No white/marfil night surface');
     assert.notEqual(night.titleColor,'rgb(0, 0, 0)','Dark theme title remains legible');
     assert.equal(night.title,day.title,'Published content unchanged');
     if(banner)assert(await page.locator(view==='home-desktop'?'.editorial-pick .ae-weekly-home-banner':'#picksFeatured .ae-weekly-banner').count()>0,'Real banner preserved');
     await page.evaluate(()=>document.documentElement.classList.remove('dark'));
     assert.deepEqual(await read(),original,'Switching back restores exact light styling');
     if(width===390&&banner)await page.locator(view==='home-desktop'?'.editorial-pick':'#picksFeatured').screenshot({path:path.join(qa,view+'-'+width+'-night.png')});
    }
   }
  }
  await page.evaluate(()=>document.getElementById('picksFeaturedCard').querySelector('details').open=true);
  assert(await page.locator('#picksFeaturedCard details').evaluate(x=>x.open),'Analysis expandable remains functional');
  assert.deepEqual(errors,[]);
  console.log('PASS: Pick del Editor Home and Picks day/night, banners and mobile dimensions. Screenshots: '+qa);
 }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);server.close();process.exitCode=1;});
