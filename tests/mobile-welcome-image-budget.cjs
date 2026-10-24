/* CAM SPORTS — Mobile welcome art network budget.
 * Real headless Chromium, real CSS and real static images. No Supabase.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');
const root=process.cwd();
const css=fs.readFileSync('assets/ae-classical-auth-buttons.css','utf8');
const script=fs.readFileSync('assets/cam-welcome-home-entry.js','utf8');
for(const theme of ['dia','noche']){
 assert.match(css,new RegExp('cam-welcome-'+theme+'-oleo-1600\\.webp'), 'Desktop high-density art must remain');
 assert.match(script,new RegExp('cam-welcome-.*oleo-960\\.webp'), 'Welcome preload should use existing images');
}
const files={};
for(const theme of ['dia','noche']){
 files[theme]=[960,1600].map(size=>{
  const file='assets/cam-welcome-'+theme+'-oleo-'+size+'.webp';
  return {file,size:fs.statSync(file).size};
 });
 assert.ok(files[theme][0].size<files[theme][1].size*.36, 'The phone rendition must be significantly lighter');
}
const makeHtml=dark=>'<!doctype html><html'+(dark?' class="dark"':'')+'><head>'+
 '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
 '<link rel="stylesheet" href="/assets/cam-perf-core-extras.css">'+
 '</head><body><dialog id="camWelcomeDialog"><div class="cam-welcome-frame"><div id="camWelcomePreviewLabel" hidden></div></div></dialog>'+
 '<script defer src="/assets/cam-welcome-home-entry.js"></script></body></html>';

const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/day'||u.pathname==='/night'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(makeHtml(u.pathname==='/night'));}
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try {
  const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':'application/octet-stream';
  res.setHeader('Content-Type',type);
  res.end(fs.readFileSync(file));
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const rootURL='http://127.0.0.1:'+server.address().port;
  for(const theme of ['dia','noche'])for(const mobile of [true,false]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:850},deviceScaleFactor:mobile?3:2});
   const page=await context.newPage();
   const requests=[],errors=[];
   page.on('request',r=>{if(/cam-welcome-.*-oleo-(?:960|1600)\.webp/.test(r.url()))requests.push(r.url());});
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(rootURL+(theme==='dia'?'/day':'/night'),{waitUntil:'load'});
   await page.waitForFunction(()=>document.getElementById('camWelcomeDialog').open);
   const chosen=mobile?'960':'1600';
   await page.waitForFunction(([theme,size])=>performance.getEntriesByType('resource').some(x=>x.name.includes('cam-welcome-'+theme+'-oleo-'+size+'.webp')),[theme,chosen]);
   const background=await page.evaluate(()=>getComputedStyle(document.querySelector('#camWelcomeDialog .cam-welcome-frame')).backgroundImage);
   assert.ok(background.includes('cam-welcome-'+theme+'-oleo-'+chosen+'.webp'), 'Wrong background for '+theme+' '+(mobile?'mobile':'desktop')+': '+background);
   if(mobile){
    assert.ok(!background.includes('1600.webp'), 'Mobile CSS must never select 1600px');
    assert.ok(!requests.some(x=>x.includes('1600.webp')),'High-density mobile must not download the 1600px background: '+requests);
    assert.equal(requests.filter(x=>x.includes('960.webp')).length,1,'The preload and CSS should reuse the same image URL');
   }else{
    assert.ok(requests.some(x=>x.includes('1600.webp')),'Desktop retains high density source');
   }
   assert.deepEqual(errors,[], 'Welcome loading should have no uncaught errors');
   console.log('PASS '+theme+' '+(mobile?'mobile 390px @3x':'desktop @2x')+': '+chosen+'px welcome artwork');
   await context.close();
  }
  console.log('Phone welcome art: day '+files.dia[1].size+' -> '+files.dia[0].size+
    ' bytes; night '+files.noche[1].size+' -> '+files.noche[0].size+' bytes. Same artwork/crop.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
