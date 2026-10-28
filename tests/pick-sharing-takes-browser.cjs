/* Real PNG/font/layout QA. Fixtures and native-share mocks never publish data. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{chromium,webkit,devices}=require('playwright');
const root=process.cwd(),qa=process.env.CAM_SHARE_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-take-share-'));
fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/ae-editorial-bundle.css"></head><body><main><button id="open">Compartir Take</button></main><script src="/assets/cam-pick-share.js"></script></body></html>');}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const engine=process.env.CAM_SHARE_BROWSER==='webkit'?webkit:chromium;
 const launch={headless:true};if(engine===chromium){launch.args=['--no-sandbox','--disable-dev-shm-usage'];if(process.env.AE_CHROMIUM_PATH)launch.executablePath=process.env.AE_CHROMIUM_PATH;}
 const browser=await engine.launch(launch);
 try{
 const context=await browser.newContext({...devices['iPhone 13'],timezoneId:'America/Toronto',acceptDownloads:true}),page=await context.newPage(),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 await page.route('**/*',r=>/^(?:blob:)?http:\/\/127\.0\.0\.1(?::|\/)/.test(r.request().url())?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
 await page.evaluate(()=>{
  const native=CanvasRenderingContext2D.prototype.fillText;
  const paint=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(source,x,y,width,height){if(source instanceof HTMLCanvasElement&&source.width===1080){const scale=width/source.width;draws=draws.map(t=>({...t,x:x+t.x*scale,y:y+t.y*scale,width:t.width*scale}));}return paint.call(this,source,x,y,width,height);};
  window.draws=[];CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){const width=this.measureText(text).width;draws.push({text,x,y,width,right:this.textAlign==='right',font:this.font});return native.call(this,text,x,y,...rest);};
  window.take=Object.freeze({id:'00000000-0000-0000-0000-000000000972',author_id:'00000000-0000-0000-0000-000000000951',author:'Adrianmendozac27',sport:'football',created_at:'2026-10-25T01:15:00Z',title:'LAMINE YAMAL GANARÁ EL BALÓN DE ORO EN 2026',body:'El argumento parte de su rendimiento.\nNo doy el resultado por seguro: depende de toda la temporada.\n\nSu evolución marcará la diferencia. '.repeat(8)});
  document.getElementById('open').onclick=()=>{draws=[];CamPickShare.open(take,{kind:'take'});};
  window.shares=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:data=>{shares.push({active:navigator.userActivation.isActive,data});return Promise.resolve();}});
 });
 const dialog=page.locator('#camPickShareDialog'),preview=page.locator('.cam-pick-share-preview img');
 const ready=async()=>{await preview.waitFor({state:'visible'});await preview.evaluate(img=>img.decode()).catch(error=>{throw Error('PNG decode failed: '+error.message+'; failed requests: '+JSON.stringify(failed));});},open=async()=>{await page.locator('#open').click();await ready();};
 const select=async(index,value)=>{await dialog.locator('select').nth(index).selectOption(value);await ready();};
 const png=async()=>Buffer.from(await preview.evaluate(async img=>{const b=await(await fetch(img.src)).arrayBuffer();return Array.from(new Uint8Array(b));}));
 const checkBounds=async story=>{
  const drawn=await page.evaluate(()=>draws);for(const t of drawn){const left=t.right?t.x-t.width:t.x,right=t.right?t.x:t.x+t.width;assert.ok(left>=(story?140:85)&&right<=(story?935:995),`Text overflows horizontally: ${JSON.stringify(t)}`);assert.ok(t.y>=(story?280:240)&&t.y<=(story?1500:1045),`Text overflows safe height: ${JSON.stringify(t)}`);}
 };
 await open();assert.equal(await page.evaluate(()=>document.fonts.check('600 80px "Playfair Display"')),true,'The real Playfair font is loaded before PNG generation');
 const first=await png();assert.equal(first.readUInt32BE(16),1080);assert.equal(first.readUInt32BE(20),1080);await checkBounds(false);
 assert.ok(await page.evaluate(()=>draws.some(t=>t.text==='24/10/2026')),'Date matches the original Take calendar day in Toronto');
 assert.ok(await page.evaluate(()=>draws.some(t=>t.text==='Adrianmendozac27')));
 fs.writeFileSync(path.join(qa,'take-square.png'),first);
 // The downloadable bytes are exactly the preview, rather than a second render.
 const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar imagen',exact:true}).click();const download=await pending;await download.saveAs(path.join(qa,'take-downloaded.png'));
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(qa,'take-downloaded.png'))).digest('hex'),crypto.createHash('sha256').update(first).digest('hex'));
 await page.getByRole('button',{name:'Compartir imagen',exact:true}).click();assert.equal(await page.evaluate(()=>shares[0].active),true,'File share remains in the user tap');
 assert.equal(await page.evaluate(()=>shares[0].data.files[0].type),'image/png');
 assert.deepEqual(await page.evaluate(async()=>Array.from(new Uint8Array(await shares[0].data.files[0].arrayBuffer()))),Array.from(first),'Native sharing transmits the preview PNG');
 for(const mode of ['title','summary','fragment'])for(const size of ['square','story']){
  await page.evaluate(()=>draws=[]);await select(0,mode);await page.evaluate(()=>draws=[]);await select(2,size);await checkBounds(size==='story');
  const data=await png();assert.equal(data.readUInt32BE(16),1080);assert.equal(data.readUInt32BE(20),size==='story'?1920:1080);
  if(mode==='title'&&size==='story')fs.writeFileSync(path.join(qa,'take-story.png'),data);
 }
 await page.getByRole('button',{name:'Restablecer diseño',exact:true}).click();await ready();assert.equal((await png()).equals(first),true,'Reset reproduces the original exact PNG');
 for(const title of ['Un gran Take',('Una opinión larga con todos los detalles del partido y de la temporada. ').repeat(3).slice(0,160),'W'.repeat(160)]){
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.evaluate(title=>{take={...take,title};},title);await open();
  for(const size of ['square','story'])for(const mode of ['title','summary','fragment']){await select(0,mode);await page.evaluate(()=>draws=[]);await select(2,size);await checkBounds(size==='story');}
 }
 // Mobile layout, both themes, scrolling, and persistent primary controls.
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.evaluate(()=>take={...take,title:'LAMINE YAMAL GANARÁ EL BALÓN DE ORO EN 2026'});await open();
 assert.equal((await png()).equals(first),true,'Reopening the same original Take reproduces the same PNG');
 for(const width of [320,375,390,430,768,1366])for(const dark of [false,true]){
  await page.setViewportSize({width,height:844});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await dialog.evaluate(d=>d.scrollTop=0);
  const fits=await dialog.evaluate(d=>{const b=d.getBoundingClientRect(),primary=d.querySelector('.cam-take-share-primary').getBoundingClientRect();return {overflow:d.scrollWidth>d.clientWidth+1,primary:primary.top>=b.top&&primary.bottom<=b.bottom,preview:d.querySelector('.cam-pick-share-preview').getBoundingClientRect().top>d.querySelector('.cam-pick-share-heading').getBoundingClientRect().top,controls:[...d.querySelectorAll('button,a,select')].filter(e=>e.getClientRects().length).every(e=>{const r=e.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right+1;})};});
  assert.equal(fits.overflow,false,`Dialog overflows at ${width}`);assert.equal(fits.controls,true,`Controls overflow at ${width}`);assert.equal(fits.primary,true,`Primary action is hidden at ${width}`);
  if(width===390)await page.screenshot({path:path.join(qa,'take-editor-'+(dark?'night':'day')+'.png')});
  const lightBytes=await png();await page.evaluate(()=>document.documentElement.classList.toggle('dark'));assert.equal((await png()).equals(lightBytes),true,'The PNG is identical in day and night modes');
 }
 await page.evaluate(()=>{Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});});
 const popups=[];page.on('popup',p=>popups.push(p));await page.getByRole('link',{name:'Compartir imagen en X',exact:true}).click();assert.equal(popups.length,0);assert.match(await page.locator('.cam-pick-share-status').innerText(),/Descarga/);
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS: ${engine===webkit?'WebKit iPhone emulation':'Chromium iPhone emulation'}, real fonts and PNGs, download/preview/native bytes match, 3 modes × 2 formats, long titles, original attribution, safe areas, 320–1366px/day/night, no empty X popup. QA: ${qa}`);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
