const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dialog=html.match(/<dialog id="cpComposePanel"[\s\S]*?<\/dialog>/)?.[0];
assert(dialog,'Pick composer dialog exists');
const css=[
 fs.readFileSync(path.join(root,'assets/ae-editorial-bundle.css'),'utf8'),
 fs.readFileSync(path.join(root,'assets/cam-pick-points-rules.css'),'utf8')
].join('\n');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AE_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:940}});
  await page.setContent('<!doctype html><html class="dark"><head><style>'+css+'</style></head><body>'+dialog+'</body></html>');
  const captureScript=fs.readFileSync(path.join(root,'assets/ae-pick-capture.js'),'utf8')
   .replace("const scriptUrl=document.currentScript?.src||new URL('assets/ae-pick-capture.js',location.href).href;","const scriptUrl='https://example.test/assets/ae-pick-capture.js';");
  await page.addScriptTag({content:captureScript});
  await page.evaluate(()=>{
   window.aePickCapture.mount({form:document.getElementById('cpForm'),getPicks:()=>[],applyImport:()=>{},onChange:()=>{}});
   document.getElementById('cpComposePanel').showModal();
  });

  assert.equal(await page.locator('.cam-pick-hero__title').innerText(),'¡A por el #1, Pickster!');
  assert.equal(await page.locator('.cam-pick-how__title').innerText(),'Cómo funcionan los Picks');
  assert.match(await page.locator('.cam-pick-hero__flow').innerText(),/Sube captura[\s\S]*Preparamos tu Pick[\s\S]*Borramos la foto/);
  assert.equal(await page.locator('.cam-pick-how > #camPickPointsRules').count(),1);
  assert.equal(await page.locator('.cp-capture-title').innerText(),'Sube tu captura');
  assert.match(await page.locator('.cp-capture-intro').innerText(),/Lideratos en disputa[\s\S]*tablas mensuales e históricas/);
  assert.equal(await page.locator('.cp-capture-help').innerText(),'No guardamos ni publicamos la captura.');
  assert.doesNotMatch(await page.locator('.cp-capture').innerText(),/PNG|JPG|WebP|8 MB/);
  assert.equal(await page.locator('#camPickBrowseLatest').count(),0,'The composer no longer links to the latest Picks');
  assert.equal(await page.locator('.cp-capture').evaluate(el=>el.lastElementChild?.classList.contains('cp-capture-proof')),true);

  const qa=process.env.AE_CAPTURE_QA_DIR;
  if(qa)fs.mkdirSync(qa,{recursive:true});
  for(const width of [360,390,768,1366])for(const dark of [false,true]){
   await page.setViewportSize({width,height:940});
   await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await page.evaluate(()=>{
    const panel=document.getElementById('cpComposePanel');
    const title=document.querySelector('.cam-pick-hero__title').getBoundingClientRect();
    const how=document.querySelector('.cam-pick-how').getBoundingClientRect();
    const capture=document.querySelector('.cp-capture').getBoundingClientRect();
    const rect=panel.getBoundingClientRect();
    return {
     fits:rect.left>=-1&&rect.right<=innerWidth+1,
     noOverflow:panel.scrollWidth<=panel.clientWidth+1,
     ordered:title.bottom<=how.top+1&&how.bottom<=capture.top+1,
     captureFits:capture.left>=rect.left-1&&capture.right<=rect.right+1
    };
   });
   assert.deepEqual(layout,{fits:true,noOverflow:true,ordered:true,captureFits:true},JSON.stringify({width,dark,layout}));
   if(qa&&[390,1366].includes(width))await page.locator('#cpComposePanel').screenshot({path:path.join(qa,'compact-'+width+'-'+(dark?'night':'day')+'.png')});
  }
  console.log('PASS: compact Pick composer copy and order fit 360–1366px in day and night modes.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
