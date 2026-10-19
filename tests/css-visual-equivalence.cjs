/**
 * Compare stable, static page layouts rendered from main and the CSS cleanup
 * branch. Runs only on CI, never accesses live data or production credentials.
 * This is a VISUAL SMOKE TEST, not a replacement for end-to-end community QA.
 */
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

const baselineRoot=path.resolve(__dirname,'../baseline');
const candidateRoot=path.resolve(__dirname,'..');
if(!fs.existsSync(path.join(baselineRoot,'index.html')))
  throw new Error('Check out main into ./baseline before running CSS visual equivalence.');
const media={
  '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.woff2':'font/woff2',
  '.ico':'image/x-icon',
  '.html':'text/html; charset=utf-8'
};
function serve(dir,port){
  const server=http.createServer((req,res)=>{
    let decoded;
    try{decoded=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}
    catch{res.writeHead(400);res.end();return;}
    const full=path.resolve(dir,'.'+(decoded==='/'?'/index.html':decoded));
    if(full!==path.join(dir,'index.html')&&!full.startsWith(dir+path.sep)){
      res.writeHead(403);res.end();return;
    }
    try{
      const bytes=fs.readFileSync(full);
      res.setHeader('Content-Type',media[path.extname(full)]||'application/octet-stream');
      res.setHeader('Cache-Control','no-store');
      res.end(bytes);
    }catch{res.writeHead(404);res.end();}
  });
  return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server)));
}
const ports=[18760,18761],sections=['home','picks','nfl','football'];
const themes=['dark','light'],widths=[390,760,761,768,1366];
async function main(){
  const servers=await Promise.all([serve(baselineRoot,ports[0]),serve(candidateRoot,ports[1])]);
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of widths)for(const theme of themes)for(const section of sections){
      const screenshots=[];
      for(const port of ports){
        const context=await browser.newContext({
          viewport:{width,height:900},deviceScaleFactor:1,
          reducedMotion:'reduce',javaScriptEnabled:false
        });
        const page=await context.newPage();
        // No external fonts, analytics, scripts, Supabase or real user data.
        await page.route('**/*',route=>{
          const url=route.request().url();
          return url.startsWith('http://127.0.0.1:'+port+'/')?
            route.continue():route.abort();
        });
        await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load'});
        const cssLoaded=await page.evaluate(()=>{
          document.documentElement.classList.add('dark');
          return Array.from(document.styleSheets)
            .filter(sheet=>sheet.href?.includes('/assets/')).length;
        });
        assert.ok(cssLoaded>=50,'CSS files did not load in visual comparison: '+cssLoaded);
        await page.evaluate(({section,theme})=>{
          document.documentElement.classList.toggle('dark',theme==='dark');
          document.body.classList.remove('ae-is-home','ae-is-picks','ae-is-nfl','ae-is-football');
          document.body.classList.add('ae-is-'+section);
          const visible={
            home:[],
            picks:['footballTakes'],
            nfl:['nflRankings','freeTakes','aeSportTakeLeaders'],
            football:['championsRankings','freeTakes','aeSportTakeLeaders']
          }[section]||[];
          for(const id of visible){
            const node=document.getElementById(id);
            if(!node)throw Error('Missing static section fixture: '+id);
            node.hidden=false;
            node.classList.remove('hidden');
          }
          document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.removeAttribute('open'));
        },{section,theme});
        await page.evaluate(()=>document.fonts.ready);
        // Full-page comparison includes the exposed section panels and their
        // mobile/responsive rules; avoids the earlier header-only screenshots.
        const buffer=await page.screenshot({fullPage:true,animations:'disabled',caret:'hide'});
        screenshots.push(buffer);
        await context.close();
      }
      const label=section+'-'+width+'-'+theme;
      if(!screenshots[0].equals(screenshots[1])){
        const output=path.join(candidateRoot,'css-visual-diffs');
        fs.mkdirSync(output,{recursive:true});
        fs.writeFileSync(path.join(output,label+'-before.png'),screenshots[0]);
        fs.writeFileSync(path.join(output,label+'-after.png'),screenshots[1]);
        throw Error('CSS visual mismatch: '+label+' (images saved in css-visual-diffs)');
      }
      console.log('PASS visual '+label);
    }
  }finally{
    await browser.close();
    await Promise.all(servers.map(server=>new Promise(resolve=>server.close(resolve))));
  }
  console.log('PASS: static desktop/mobile light/dark layouts identical (40 captures).');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
