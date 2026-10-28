/* Real PNG/font/layout QA. Fixtures and native-share mocks never publish data. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),crypto=require('node:crypto');
const assert=require('node:assert/strict'),{chromium,webkit,devices}=require('playwright');
const root=process.cwd(),qa=process.env.CAM_SHARE_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-take-share-'));
fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/ae-editorial-bundle.css"></head><body><main><button id="open">Compartir Take</button></main><script src="/assets/cam-pick-share.js"></script></body></html>');}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':file.endsWith('.webp')?'image/webp':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
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
  window.logos=[];CanvasRenderingContext2D.prototype.drawImage=function(source,...args){if(source instanceof HTMLImageElement)logos.push({src:source.src,args});return paint.call(this,source,...args);};
  window.draws=[];CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...rest){const width=this.measureText(text).width;draws.push({text,x,y,width,right:this.textAlign==='right',font:this.font});return native.call(this,text,x,y,...rest);};
  window.take=Object.freeze({id:'00000000-0000-0000-0000-000000000972',author_id:'00000000-0000-0000-0000-000000000951',author:'Adrianmendozac27',sport:'football',created_at:'2026-10-25T01:15:00Z',title:'LAMINE YAMAL GANARÁ EL BALÓN DE ORO EN 2026',body:'El argumento parte de su rendimiento.\nNo doy el resultado por seguro: depende de toda la temporada.\n\nSu evolución marcará la diferencia. '.repeat(8)});
  document.getElementById('open').onclick=()=>{draws=[];CamPickShare.open(take,{kind:'take'});};
  window.shares=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});Object.defineProperty(navigator,'share',{configurable:true,value:data=>{shares.push({active:navigator.userActivation.isActive,data});return Promise.resolve();}});
 });
 const dialog=page.locator('#camPickShareDialog'),preview=page.locator('.cam-pick-share-preview img');
 const ready=async()=>{await preview.waitFor({state:'visible'});await preview.evaluate(img=>img.decode()).catch(error=>{throw Error('PNG decode failed: '+error.message+'; failed requests: '+JSON.stringify(failed));});},open=async()=>{await page.locator('#open').click();await ready();};
 const select=async(index,value)=>{await dialog.locator('select').nth(index).selectOption(value);await ready();};
 // Each destination is its own canvas: Instagram story, TikTok, 4:5 feed post or X.
 const names={story:'Historia',tiktok:'TikTok',post:'Publicación',card:'X'};
 const choose=async size=>{await dialog.locator(`.cam-take-share-destination[data-size="${size}"]`).click();await page.waitForFunction(name=>document.querySelector('.cam-pick-share-preview img')?.alt.includes('('+name+','),names[size]);await ready();};
 const pressed=()=>dialog.locator('.cam-take-share-destination[aria-pressed="true"]').evaluateAll(list=>list.map(b=>b.dataset.size));
 const heights={story:1920,tiktok:1920,post:1350};
 const png=async()=>Buffer.from(await preview.evaluate(async img=>{const b=await(await fetch(img.src)).arrayBuffer();return Array.from(new Uint8Array(b));}));
 // Text never sits under a network's own interface: Instagram Stories cover
 // ~250 px top and bottom; TikTok its tabs (240), caption and sound (660) and
 // the 180 px action column; the feed grid trims a 4:5 post to 3:4 (34 px/side).
 const safe={story:{left:90,right:990,top:250,bottom:1670},tiktok:{left:174,right:900,top:240,bottom:1260},post:{left:52,right:1028,top:60,bottom:1310},card:{left:52,right:1029,top:30,bottom:745}};
 const checkBounds=async size=>{
  const s=safe[size],drawn=await page.evaluate(()=>draws);assert.ok(drawn.length>3,'Text was drawn');
  for(const t of drawn){const left=t.right?t.x-t.width:t.x,right=t.right?t.x:t.x+t.width;assert.ok(left>=s.left&&right<=s.right,`${size}: text overflows horizontally: ${JSON.stringify(t)}`);assert.ok(t.y>=s.top&&t.y+6<=s.bottom,`${size}: text outside the safe height: ${JSON.stringify(t)}`);}
  const logo=await page.evaluate(()=>logos.filter(l=>l.src.includes('cam-sports-logo')).at(-1).args);assert.ok(logo[1]>=s.top&&logo[0]>=s.left&&logo[0]+logo[2]<=s.right,`${size}: logo outside the safe area`);
 };
 await open();assert.equal(await page.evaluate(()=>document.fonts.check('600 80px "Playfair Display"')),true,'The real Playfair font is loaded before PNG generation');
 const first=await png();assert.equal(first.readUInt32BE(16),1080);assert.equal(first.readUInt32BE(20),1920,'On a phone the default is the full-screen Instagram story with the summary');await checkBounds('story');
 assert.deepEqual(await pressed(),['story'],'Exactly one destination is selected');
 assert.equal(await dialog.locator('select').count(),3,'Format is chosen by destination, not by another select');
 assert.ok(await page.evaluate(()=>draws.some(t=>t.text==='24/10/2026')),'Date matches the original Take calendar day in Toronto');
 assert.ok(await page.evaluate(()=>draws.some(t=>t.text==='Adrianmendozac27')));
 fs.writeFileSync(path.join(qa,'take-story-default.png'),first);
 assert.ok(await page.evaluate(()=>logos.length>0&&logos.every(l=>l.src.includes('/assets/cam-sports-logo-completo.webp'))),'Official header artwork is drawn without a typed substitute');
 // The downloadable bytes are exactly the preview, rather than a second render.
 const pending=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar imagen',exact:true}).click();const download=await pending;await download.saveAs(path.join(qa,'take-downloaded.png'));
 assert.match(download.suggestedFilename(),/-historia\.png$/,'The file name says which format it is');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(qa,'take-downloaded.png'))).digest('hex'),crypto.createHash('sha256').update(first).digest('hex'));
 await page.getByRole('button',{name:'Compartir imagen',exact:true}).click();assert.equal(await page.evaluate(()=>shares[0].active),true,'File share remains in the user tap');
 assert.equal(await page.evaluate(()=>shares[0].data.files[0].type),'image/png');
 assert.deepEqual(await page.evaluate(async()=>Array.from(new Uint8Array(await shares[0].data.files[0].arrayBuffer()))),Array.from(first),'Native sharing transmits the preview PNG');
 assert.deepEqual(await page.evaluate(()=>Object.keys(shares[0].data)),['files'],'Instagram and TikTok formats receive only the image');
 await choose('card');await page.getByRole('button',{name:'Compartir imagen',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>[shares[1].data.text,/\?t=/.test(shares[1].data.url)]),['LAMINE YAMAL GANARÁ EL BALÓN DE ORO EN 2026',true],'X keeps the title and the permalink with the image');
 await choose('story');
 for(const mode of ['title','summary','fragment'])for(const size of ['card','post','tiktok','story']){
  await select(0,mode);await page.evaluate(()=>draws=[]);await choose(size);await checkBounds(size);
  assert.deepEqual(await pressed(),[size]);
  const data=await png();assert.equal(data.readUInt32BE(16),1080);assert.equal(data.readUInt32BE(20),heights[size]||(mode==='title'?608:760));
  const edges=await preview.evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);const rgba=x.getImageData(0,0,c.width,c.height).data;let valid=true;for(let p=0;p<rgba.length;p+=4){const pixel=p/4,px=pixel%c.width,py=Math.floor(pixel/c.width);if(px===0||px===c.width-1||py===0||py===c.height-1){if(rgba[p]!==11||rgba[p+1]!==34||rgba[p+2]!==51||rgba[p+3]!==255)valid=false;}}return valid;});
  assert.equal(edges,true,'Every export edge is opaque CAM night blue, with no white band or transparent corners');
  fs.writeFileSync(path.join(qa,'take-'+mode+'-'+size+'.png'),data);
  if(mode==='title'&&size==='story')fs.writeFileSync(path.join(qa,'take-story.png'),data);
 }
 await choose('tiktok');
 await page.getByRole('button',{name:'Restablecer diseño',exact:true}).click();await ready();assert.equal((await png()).equals(first),true,'Reset reproduces the original exact PNG');
 assert.deepEqual(await pressed(),['story'],'Reset returns to the default destination');
 for(const title of ['Un gran Take',('Una opinión larga con todos los detalles del partido y de la temporada. ').repeat(3).slice(0,160),'W'.repeat(160)]){
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.evaluate(title=>{take={...take,title};},title);await open();
  for(const size of ['card','post','tiktok','story'])for(const mode of ['title','summary','fragment']){await choose(size);await page.evaluate(()=>draws=[]);await select(0,mode);await checkBounds(size);}
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
 const popups=[];page.on('popup',p=>popups.push(p));await choose('card');await page.getByRole('button',{name:'Compartir imagen',exact:true}).click();assert.equal(popups.length,0);assert.match(await page.locator('.cam-pick-share-status').innerText(),/Descarga/);
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.route('**/assets/cam-sports-logo-completo.webp*',r=>r.abort());
 await page.reload({waitUntil:'load'});
 await page.evaluate(()=>{document.getElementById('open').onclick=()=>CamPickShare.open({id:'00000000-0000-0000-0000-000000000972',author_id:'00000000-0000-0000-0000-000000000951',author:'Lector',title:'Un Take real',body:'Contenido original',created_at:'2026-10-24T12:00:00Z'},{kind:'take'});});
 await page.locator('#open').click();await page.getByText('No se pudo cargar el logo oficial.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Compartir imagen',exact:true}).isEnabled(),false);
 assert.equal(await page.locator('.cam-pick-share-download').isVisible(),false,'No PNG is offered if the official logo failed');
 assert.deepEqual(errors,[]);await context.close();console.log(`PASS: ${engine===webkit?'WebKit iPhone emulation':'Chromium iPhone emulation'}, real fonts and PNGs, download/preview/native bytes match, 3 modes × 4 destinations (Instagram story, TikTok, 4:5 post, X), opaque blue edges and official logo, long titles, original attribution, per-network safe areas, 320–1366px/day/night, no empty X popup. QA: ${qa}`);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
