/* Browser regression: authored component CSS vs compressed delivery bundles.
 * Same markup, source order, media/layer boundaries and assets; no API calls.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=process.cwd();
const groups=[{output:'assets/ae-editorial-bundle.css',sources:JSON.parse(fs.readFileSync('assets/style-sources.json','utf8'))},
 ...JSON.parse(fs.readFileSync('assets/performance-css-packs.json','utf8')).groups];
const byOutput=new Map(groups.map(group=>[group.output,group.sources]));
const original=fs.readFileSync('index.html','utf8');
const markup=original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
 .replace(/<link\b[^>]*href="https?:\/\/[^\"]+"[^>]*>/gi,'');
const expanded=markup.replace(/<link\b(?=[^>]*rel="stylesheet")[^>]*href="([^\"]+)"[^>]*>/gi,(tag,href)=>{
 const sources=byOutput.get(href.split('?')[0]);
 return sources?sources.map(source=>'<link rel="stylesheet" href="'+source+'">').join('\n'):tag;
});
const freeze='@layer cam-header{html'+':not(#cam-css-freeze)'.repeat(12)+' body *,'+
 'html'+':not(#cam-css-freeze)'.repeat(12)+' body *::before,'+
 'html'+':not(#cam-css-freeze)'.repeat(12)+' body *::after{animation:none!important;transition:none!important}}';
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(url.searchParams.has('expanded')?expanded:markup);}
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'application/octet-stream');res.end(fs.readFileSync(file));}
 catch{res.writeHead(404);res.end();}
});
const properties=['display','visibility','position','color','background-color','background-image',
 'font-family','font-size','font-weight','line-height','letter-spacing','text-align','padding','margin',
 'border','border-radius','box-shadow','width','height','min-width','min-height','flex-direction',
 'align-items','justify-content','grid-template-columns','gap','overflow','z-index','order','object-position','opacity'];
const categories=['Todos','Picks','NFL','Fútbol','Opiniones'];
async function sample(browser,origin,width,dark,unbundled){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
 await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
 try{
  await page.goto(origin+(unbundled?'?expanded=1':''),{waitUntil:'load'});
  await page.addStyleTag({content:freeze});
  return await page.evaluate(({dark,categories,properties})=>{
   document.documentElement.classList.toggle('dark',dark);
   const nodes=[...document.body.querySelectorAll('*')].filter(node=>!['STYLE','LINK','SCRIPT'].includes(node.tagName));
   const result={};
   for(const category of categories){
    document.body.classList.remove('ae-is-home','ae-is-picks','ae-is-nfl','ae-is-football','ae-is-opinions');
    document.body.classList.add('ae-is-'+({Todos:'home',Picks:'picks',NFL:'nfl','Fútbol':'football',Opiniones:'opinions'}[category]));
    result[category]=nodes.map(node=>{const css=getComputedStyle(node);return [node.tagName,node.id,...properties.map(prop=>css.getPropertyValue(prop))];});
   }
   return result;
  },{dark,categories,properties});
 }finally{await context.close();}
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const origin='http://127.0.0.1:'+server.address().port+'/';
  for(const width of [360,390,768,1366])for(const dark of [false,true]){
   const before=await sample(browser,origin,width,dark,true),after=await sample(browser,origin,width,dark,false);
   for(const category of categories){
    assert.equal(after[category].length,before[category].length,'Keep the same content DOM');
    for(let i=0;i<before[category].length;i++)assert.deepEqual(after[category][i],before[category][i],
     `CSS mismatch at ${width}px/${dark?'night':'day'}/${category}, node ${i} (${before[category][i][0]}#${before[category][i][1]})`);
   }
   console.log(`PASS ${width}px ${dark?'night':'day'}: five sections, ${before.Todos.length} nodes, ${properties.length} CSS properties`);
  }
  console.log('PASS: all nine delivery bundles preserve the authored cascade in 40 viewport/theme/section combinations.');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
