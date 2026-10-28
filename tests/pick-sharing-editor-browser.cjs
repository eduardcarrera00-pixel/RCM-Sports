/* Isolated, real PNG/ZIP/browser QA. No production accounts or social posts. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium,webkit,devices}=require('playwright');
const root=process.cwd(),qa=process.env.CAM_SHARE_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'cam-picks-editor-'));fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/site.css"><link rel="stylesheet" href="/assets/ae-editorial-bundle.css"></head><body><main id="buttons"></main><script src="/assets/cam-pick-share.js"></script></body></html>');}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.woff2')?'font/woff2':file.endsWith('.webp')?'image/webp':'text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.CAM_SHARE_BROWSER==='webkit'?webkit:chromium,launch={headless:true};
 if(engine===chromium){launch.args=['--no-sandbox','--disable-dev-shm-usage'];if(process.env.AE_CHROMIUM_PATH)launch.executablePath=process.env.AE_CHROMIUM_PATH;}
 const browser=await engine.launch(launch);
 try{
 const context=await browser.newContext({...devices['iPhone 13'],timezoneId:'America/Toronto',acceptDownloads:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>(/^(?:blob:)?http:\/\/127\.0\.0\.1(?::|\/)/).test(r.request().url())?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.evaluate(()=>{
  const draw=CanvasRenderingContext2D.prototype.fillText,logo=CanvasRenderingContext2D.prototype.drawImage;
  window.draws=[];window.logos=[];
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y){const m=this.measureText(text);draws.push({text,x,y,width:m.width,align:this.textAlign,h:this.canvas.height});return draw.apply(this,arguments);};
  CanvasRenderingContext2D.prototype.drawImage=function(image){if(image instanceof HTMLImageElement&&!image.src.startsWith('blob:'))logos.push(image.src);return logo.apply(this,arguments);};
  window.pick={id:'00000000-0000-0000-0000-000000000981',author:'AutorOriginal',title:'Pronóstico registrado',publication_day:'2026-10-24',created_at:'2026-10-25T02:10:00Z',event_date:'2026-11-01',american_odds:-110,moderation_status:'approved',outcome:'pending',explanation:'Este es el análisis original, con  dos espacios.\nNo se añade información. '+('Contexto del autor sin alteraciones. ').repeat(15),legs:[{event:'Buffalo Bills vs Miami Dolphins',sport:'NFL',selection:'Buffalo Bills -3.5',market:'Hándicap',line:'-3.5'}],capture_check:{screenshot:'PRIVATE',stake:9999},email:'PRIVATE'};
  window.other={...pick,id:'00000000-0000-0000-0000-000000000982',author:'OtraAutora',american_odds:125,legs:[{event:'Barcelona vs PSG',sport:'Fútbol',selection:'Más de 2.5 goles · Total de goles'}]};
  document.getElementById('buttons').append(CamPickShare.button(pick),CamPickShare.button(other));
  window.original=JSON.stringify([pick,other]);window.shares=[];window.shareMode='all';
  Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>shareMode==='none'?false:shareMode==='single'?(data.files?.length===1):true});
  Object.defineProperty(navigator,'share',{configurable:true,value:data=>{shares.push({data,active:navigator.userActivation.isActive});return shareMode==='cancel'?Promise.reject(new DOMException('cancel','AbortError')):shareMode==='error'?Promise.reject(new DOMException('no','DataError')):Promise.resolve();}});
 });
 const dialog=page.locator('#camPickShareDialog'),preview=page.locator('.cam-pick-share-preview img');
 const ready=async()=>{await preview.waitFor();await page.waitForFunction(()=>{const img=document.querySelector('.cam-pick-share-preview img');return img?.complete&&img.naturalWidth>0;},{},{timeout:10000});await preview.evaluate(img=>img.decode());};
 const refresh=async(action)=>{await page.evaluate(()=>{draws=[];});await action();await ready();};
 await page.getByRole('button',{name:'Compartir Pick: Pronóstico registrado',exact:true}).first().click();await ready();assert.equal(await page.evaluate(()=>shares.length),0);
 const png=async()=>Buffer.from(await preview.evaluate(async img=>Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer()))));
 async function checkImage(height){
  const bytes=await png();assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),height);
  const edges=await preview.evaluate(async img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);const {data}=x.getImageData(0,0,c.width,c.height);for(let y=0;y<c.height;y++)for(let z=0;z<c.width;z++){if(y!==0&&y!==c.height-1&&z!==0&&z!==c.width-1)continue;const i=(y*c.width+z)*4;if(data[i]!==7||data[i+1]!==59||data[i+2]!==131||data[i+3]!==255)return false;}return true;});assert.equal(edges,true);
  const drawn=await page.evaluate(()=>draws);for(const d of drawn){const left=d.align==='right'?d.x-d.width:d.x;assert.ok(left>=64&&left+d.width<=1016,JSON.stringify(d));assert.ok(d.y>=(d.h===1920?280:50)&&d.y<=(d.h===1920?1630:d.h-25),JSON.stringify(d));}
  return bytes;
 }
 const first=await checkImage(1080);fs.writeFileSync(path.join(qa,'pick-square.png'),first);
 assert.ok(await page.evaluate(()=>logos.every(s=>s.includes('/assets/cam-sports-logo-completo.webp'))));assert.ok(await page.evaluate(()=>draws.some(d=>d.text==='24/10/2026')));assert.ok(await page.evaluate(()=>draws.some(d=>d.text==='Cuota -110')));
 assert.equal(await page.evaluate(()=>document.fonts.check('600 72px "Playfair Display"')),true);
 let dl=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar imagen',exact:true}).click();let download=await dl;assert.deepEqual(fs.readFileSync(await download.path()),first);
 await page.getByRole('button',{name:'Compartir imagen',exact:true}).click();assert.equal(await page.evaluate(()=>shares.at(-1).active),true);assert.deepEqual(Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await shares.at(-1).data.files[0].arrayBuffer())))),first);
 await page.getByRole('button',{name:'X',exact:true}).click();assert.equal(await page.evaluate(()=>shares.at(-1).data.files.length),1);assert.equal(context.pages().length,1,'X never opens an empty intent');
 for(const [value,height] of [['story',1920],['card',700],['square',1080]]){await refresh(()=>page.getByLabel('Formato',{exact:true}).selectOption(value));fs.writeFileSync(path.join(qa,'pick-'+value+'.png'),await checkImage(height));}
 await refresh(()=>page.getByLabel('Mostrar cuota',{exact:true}).uncheck());assert.equal(await page.evaluate(()=>draws.some(d=>/Cuota -110/.test(d.text))),false);
 await refresh(()=>page.getByLabel('Mostrar fecha',{exact:true}).uncheck());assert.equal(await page.evaluate(()=>draws.some(d=>d.text==='24/10/2026')),false);
 await refresh(()=>page.getByLabel('Mostrar análisis',{exact:true}).check());const options=await page.getByLabel('Fragmento original',{exact:true}).locator('option').count();assert.ok(options>1);await refresh(()=>page.getByLabel('Fragmento original',{exact:true}).selectOption('1'));assert.match(await page.locator('.cam-picks-share-analysis').innerText(),/Contexto/);
 await refresh(()=>page.getByRole('button',{name:'Restablecer diseño',exact:true}).click());assert.deepEqual(await png(),first,'Reset recreates the same PNG');
 await refresh(()=>page.evaluate(()=>{draws=[];CamPickShare.open({...pick,author:'漢'.repeat(80),american_odds:null,created_at:null,publication_day:null});}));await checkImage(1080);assert.equal(await page.evaluate(()=>draws.some(d=>d.text.startsWith('Cuota '))),false);
 await refresh(()=>page.evaluate(()=>CamPickShare.open(pick)));
 // Independent Picks retain separate authors, odds and original links.
 await page.locator('.cam-picks-share-picker summary').click();await refresh(()=>page.getByLabel('Incluir Pick: Pronóstico registrado · @OtraAutora',{exact:true}).check());
 assert.match(await page.locator('.cam-picks-share-pagination').innerText(),/Imagen 1 de 2/);assert.match(await page.locator('textarea').inputValue(),/@OtraAutora/);
 const primary=await png();await page.getByRole('button',{name:'Siguiente',exact:true}).click();await ready();const secondary=await png();assert.notDeepEqual(secondary,primary);
 dl=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar todas (ZIP)',exact:true}).click();download=await dl;const zip=fs.readFileSync(await download.path());fs.writeFileSync(path.join(qa,'picks.zip'),zip);
 const zipFiles=[];let offset=0;while(zip.readUInt32LE(offset)===0x04034b50){const size=zip.readUInt32LE(offset+18),nameLength=zip.readUInt16LE(offset+26),extra=zip.readUInt16LE(offset+28),start=offset+30+nameLength+extra;zipFiles.push(zip.subarray(start,start+size));offset=start+size;}assert.deepEqual(zipFiles,[primary,secondary]);assert.equal(zip.readUInt32LE(offset),0x02014b50);
 await page.getByRole('button',{name:'Compartir 2 imágenes',exact:true}).click();assert.equal(await page.evaluate(()=>shares.at(-1).data.files.length),2);
 await page.evaluate(()=>shareMode='single');await page.getByRole('button',{name:'Compartir 2 imágenes',exact:true}).click();assert.match(await page.locator('[role=status]').innerText(),/no admite enviar todas/);
 await page.getByRole('button',{name:'Compartir esta imagen',exact:true}).click();assert.equal(await page.evaluate(()=>shares.at(-1).data.files.length),1);
 await page.evaluate(()=>shareMode='cancel');await page.getByRole('button',{name:'Compartir esta imagen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('cuando quieras'));
 await page.evaluate(()=>shareMode='error');await page.getByRole('button',{name:'Compartir esta imagen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('Vuelve a pulsar'));await page.evaluate(()=>shareMode='all');await page.getByRole('button',{name:'Compartir esta imagen',exact:true}).click();assert.equal(await page.evaluate(()=>shares.at(-1).data.text),undefined);
 await page.evaluate(()=>CamPickShare.open({...pick,legs:[{event:'Paris St-G v Barcelona',selection:'Paris St-G · MONEYLINE (3-WAY)'},{event:'Paris St-G v Barcelona',selection:'Over 3.5 Goals · OVER/UNDER'},{event:'Paris St-G v Barcelona',selection:'Yes · BOTH TEAMS TO SCORE'}]}));await ready();assert.equal(await page.locator('.cam-picks-share-pagination').isVisible(),false,'Three short selections fit on one square card');
 // Long parlays and unusual text are paginated at readable sizes, without loss.
 await page.evaluate(()=>{draws=[];CamPickShare.open({...pick,legs:Array.from({length:12},(_,i)=>({sport:'Fútbol',event:'Partido '+(i+1),selection:'Equipo '+(i+1)+' gana · Ganador del partido'}))});});await ready();
 let drawn=await page.evaluate(()=>draws.map(d=>d.text).join(' '));for(let i=1;i<=12;i++)assert.ok(drawn.includes('Equipo '+i+' gana'));assert.doesNotMatch(drawn,/…/);assert.match(drawn,/COMBINADA · 12 SELECCIONES/);await checkImage(1080);
 for(const selection of ['Lamine Yamal más de 1.5 tiros a puerta · Estadísticas de jugador','A'.repeat(600),('Una selección original extensa con significado completo ').repeat(40)]){
  await page.evaluate(s=>{draws=[];CamPickShare.open({...pick,legs:[{sport:'Fútbol',event:'Equipo local contra un rival con nombre muy largo',selection:s}]});},selection);await ready();await checkImage(1080);assert.doesNotMatch(await page.evaluate(()=>draws.map(d=>d.text).join(' ')),/…/);
 }
 await page.evaluate(()=>{CamPickShare.open(other);document.querySelector('.cam-pick-share-close').click();CamPickShare.open(pick);});await ready();assert.match(await preview.getAttribute('alt'),/@AutorOriginal/);
 for(const width of [320,360,390,768,1366])for(const dark of [false,true]){
  await page.setViewportSize({width,height:880});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  assert.equal(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1),true,'No dialog overflow at '+width);
  const bar=await page.locator('.cam-picks-share-bar').boundingBox();assert.ok(bar.x>=0&&bar.x+bar.width<=width&&bar.y+bar.height<=880);
  if(width===390)await page.screenshot({path:path.join(qa,'pick-editor-'+(dark?'night':'day')+'.png')});
 }
 assert.equal(await page.evaluate(()=>JSON.stringify([pick,other])===original),true);assert.doesNotMatch(await page.locator('textarea').inputValue(),/PRIVATE|9999/);
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();assert.equal(await dialog.evaluate(d=>d.open),false);assert.deepEqual(errors,[]);
 // Artwork failures block unbranded exports, and closed requests cannot revive.
 await page.route('**/cam-sports-logo-completo.webp*',r=>r.abort());await page.reload();await page.evaluate(()=>CamPickShare.open({id:'00000000-0000-0000-0000-000000000999',title:'Original',author:'Autor',legs:[{event:'Partido',selection:'Selección'}]}));await page.waitForFunction(()=>document.querySelector('.cam-pick-share-preview').textContent.includes('logo oficial'));assert.equal(await page.getByRole('button',{name:'Compartir imagen',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('link',{name:'Descargar imagen',exact:true}).isVisible(),false);
 console.log('PASS: '+(engine===webkit?'WebKit':'Chromium')+' iPhone emulation; real blue PNGs + official logo, 3 formats, immutable original data, full parlay pagination, collection/ZIP bytes, native user activation/cancel/fallback, safe areas and themes 320–1366px. QA: '+qa);
 await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
