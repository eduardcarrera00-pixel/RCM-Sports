/* Verifica que CAM SPORTS carga los iconos editoriales reales en ambas paletas.
 * No toca la pagina ni los fondos del header/footer. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = process.cwd();
const OUT = path.join(root, 'test-results', 'cam-section-icons');
const titles = [
 'picksPopularTitle','picksQuestionedTitle','picksRankingTitle','cpWorstRankingTitle',
 'aeHomeTakesPositiveTitle','aeHomeTakesNegativeTitle',
 'aeOpinionsDistinguishedHeading','aeOpinionsDebatedHeading',
 'aeTopTakesPositiveTitle','aeTopTakesNegativeTitle',
 'aeNflSavantHeading','aeNflRookieHeading',
 'freeTakesTitle','aeSportTakeRankingTitle','aeSeasonTitle','aeTakesFeedHeading',
 'homeRankingTitle','homeChampionsTitle','rankingTitle','championsTitle'
];
const index = fs.readFileSync('index.html','utf8');
assert.match(index,/ae-editorial-bundle\.css\?v=20261023-cam-section-icons-visible-v2/, 'La pagina no invalida la cache antigua');
const png = fs.readFileSync('assets/cam-section-icons.png');
assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10], 'PNG de iconos corrupto');
assert.equal(png.readUInt32BE(16),256);
assert.equal(png.readUInt32BE(20),192);
const css = fs.readFileSync('assets/ae-editorial-bundle.css','utf8');
assert.match(css,/cam-section-icons\.png\?v=20261023-visible-v2/);
const server = http.createServer((req,res) => {
 let url;
 try { url = decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
 catch { res.writeHead(400).end(); return; }
 const resolved = path.resolve(root,'.'+url);
 if(resolved!==root && !resolved.startsWith(root+path.sep)) { res.writeHead(403).end(); return; }
 const target=resolved===root?path.join(root,'index.html'):resolved;
 fs.readFile(target,(err,data)=>{
  if(err){res.writeHead(404).end();return;}
  const typ={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.json':'application/json','.jpg':'image/jpeg'};
  res.writeHead(200,{'content-type':typ[path.extname(target)]||'application/octet-stream'}).end(data);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 fs.mkdirSync(OUT,{recursive:true});
 try {
  for(const [name,width,height,dark] of [['desktop-dia',1440,900,false],['movil-noche',390,844,true]]){
   const context=await browser.newContext({viewport:{width,height}});
   const page=await context.newPage();
   await page.addInitScript(mode=>{try{localStorage.setItem('rcm_sports_theme',mode);sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1');}catch{}},dark?'dark':'light');
   await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForTimeout(500);
   await page.evaluate(mode => { document.documentElement.classList.toggle('dark',mode); },dark);
   const inspect=await page.evaluate(ids=>ids.map(id=>{
    const el=document.getElementById(id);
    if(!el) return {id,exists:false};
    const s=getComputedStyle(el,'::before');
    return {id,exists:true,content:s.content,display:s.display,width:parseFloat(s.width),image:s.backgroundImage};
   }),titles);
   console.log('SECTION_ICON_DIAGNOSTICS',name,JSON.stringify(inspect));
   for(const item of inspect){
    assert.ok(item.exists,name+': titulo inexistente '+item.id);
    assert.equal(item.display,'inline-block',name+': icono oculto '+item.id);
    assert.ok(item.width>=25,name+': icono demasiado pequeño '+item.id);
    assert.ok(item.image.includes('cam-section-icons.png'),name+': imagen no aplicada '+item.id);
    assert.notEqual(item.content,'none',name+': pseudoelemento no creado '+item.id);
   }
   const response=await page.request.get(base+'/assets/cam-section-icons.png?v=20261023-visible-v2');
   assert.equal(response.status(),200,name+': el icono devuelve HTTP incorrecto');
   const body=await response.body(); assert.deepEqual([...body.subarray(0,8)],[137,80,78,71,13,10,26,10]);
   await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:false});
   console.log('PASS:',name,inspect.length,'cabeceras con sprite visible, recurso PNG 200.');
   await context.close();
  }
 }finally{await browser.close(); await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);process.exitCode=1;});
