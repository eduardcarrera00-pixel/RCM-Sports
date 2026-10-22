/* CAM SPORTS: browser audit, read-only. This intentionally fails until mobile
 * bottom navigation has been implemented and visually refined. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const OUT=path.join(process.cwd(),'test-results/mobile-bottom-nav');
const ITEMS=['Picks','NFL','Fútbol','Opiniones'];
const SIZES=[
 ['iphone-se',375,667],['iphone-standard',390,844],['iphone-pro-max',430,932],
 ['android-compact',360,740],['android-large',412,915],['extra-compact',320,568],
 ['iphone-se-landscape',667,375],['iphone-standard-landscape',844,390],
 ['iphone-pro-max-landscape',932,430]
];
function navInfo(){
  const labels=['Picks','NFL','Fútbol','Opiniones'];
  const label=b=>(b.dataset.category||b.getAttribute('aria-label')||b.textContent||'').trim().replace(/\s+/g,' ');
  const options=[...document.querySelectorAll('nav,[role="navigation"]')]
    .filter(n=>!n.closest('header')&&!n.closest('footer'))
    .map(n=>({node:n,items:[...n.querySelectorAll('button,a,[role="button"]')]
      .filter(b=>labels.includes(label(b)))}))
    .filter(v=>v.items.length===4&&labels.every(s=>v.items.some(b=>label(b)===s)))
    .filter(v=>getComputedStyle(v.node).display!=='none'&&v.node.getBoundingClientRect().height>0);
  return {options,label};
}
function server(){
  const root=process.cwd();
  return http.createServer((req,res)=>{
    let url;
    try{url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}
    catch{res.writeHead(400).end();return;}
    const full=path.resolve(root,'.'+url);
    if(full!==root&&!full.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    const target=full===root?path.join(root,'index.html'):full;
    fs.readFile(target,(e,data)=>{
      if(e){res.writeHead(404).end();return;}
      const ext=path.extname(target);
      const types={'.html':'text/html','.js':'application/javascript','.css':'text/css',
        '.svg':'image/svg+xml','.json':'application/json','.png':'image/png',
        '.webp':'image/webp','.jpg':'image/jpeg','.woff2':'font/woff2'};
      res.writeHead(200,{'content-type':types[ext]||'application/octet-stream'});
      res.end(data);
    });
  });
}
function visible(n){return n && n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;}
async function visit(browser,name,width,height,dark,mobile){
  const context=await browser.newContext({viewport:{width,height},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(String(e.message)));
  const label=name+'-'+(dark?'noche':'dia');
  try{
    await page.addInitScript({content:'window.__camAuditNav='+navInfo.toString()+';'});
    await page.addInitScript(mode=>{try{localStorage.setItem('rcm_sports_theme',mode);}catch{}},dark?'dark':'light');
    await page.goto(global.url,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForTimeout(700);
    const status=await page.evaluate(()=>{
      const candidates=window.__camAuditNav().options;
      const header=[...document.querySelectorAll('header .category-btn')]
        .filter(el=>['Picks','NFL','Fútbol','Opiniones'].includes(el.dataset.category)&&el.getBoundingClientRect().width>0);
      const item=candidates[0];
      const rect=item?.node.getBoundingClientRect(),style=item?getComputedStyle(item.node):null;
      return {
        count:candidates.length,headerCount:header.length,
        headerExists:!!document.querySelector('header nav.ae-sport-nav'),
        brand:!!document.querySelector('header .cam-brand'),auth:!!document.getElementById('guestAdminContainer'),
        pos:style?.position,bottom:rect?innerHeight-rect.bottom:null,barTop:rect?.top,
        pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,
        buttons:item?.items.map(b=>{
          const r=b.getBoundingClientRect();
          const spans=b.querySelectorAll('span');
          const text=spans.length?spans[spans.length-1]:b;
          return {name:window.__camAuditNav().label(b),x:r.x,y:r.y,w:r.width,h:r.height,
            icon:!!b.querySelector('img,svg,i,.ae-nav-icon'),clipped:text.scrollWidth>text.clientWidth+2};
        })||[]
      };
    });
    assert.ok(status.pageWidth<=status.viewportWidth+2,label+': desbordamiento horizontal');
    assert.ok(status.headerExists&&status.brand&&status.auth,label+': falta header, marca o login');
    if(!mobile){
      assert.equal(status.count,0,label+': aparece la barra móvil en escritorio');
      assert.equal(status.headerCount,4,label+': cambió el menú de escritorio');
    }else{
      assert.equal(status.count,1,label+': la nueva barra no existe o está duplicada');
      assert.equal(status.headerCount,0,label+': botones duplicados en encabezado');
      assert.equal(status.pos,'fixed',label+': posición no es fija');
      assert.ok(Math.abs(status.bottom)<=3,label+': barra sin anclaje inferior');
      assert.deepEqual(status.buttons.map(b=>b.name),ITEMS,label+': orden o etiquetas incorrectos');
      assert.ok(Math.max(...status.buttons.map(b=>b.y))-Math.min(...status.buttons.map(b=>b.y))<=3,
        label+': accesos desalineados');
      for(const button of status.buttons){
        assert.ok(button.icon,label+': falta icono '+button.name);
        assert.ok(button.w>=40&&button.h>=40,label+': objetivo táctil menor de 40px '+button.name);
        assert.ok(!button.clipped,label+': texto truncado '+button.name);
      }
      await page.evaluate(()=>{
        window.__camAuditMarker={stable:true};
        window.__camAuditNav().options[0].node.setAttribute('data-cam-audit-nav','');
      });
      for(const sport of ITEMS){
        // A real touch event detects obstructed or non-interactive menu controls.
        await page.locator('[data-cam-audit-nav]').getByText(sport,{exact:true}).first().tap({timeout:4000});
        await page.waitForTimeout(125);
        const state=await page.evaluate(()=>{
          const n=window.__camAuditNav().options[0];
          return {live:window.__camAuditMarker?.stable===true,
            active:n.items.filter(b=>b.classList.contains('active')||
              b.getAttribute('aria-current')==='page'||b.getAttribute('aria-selected')==='true'||
              b.getAttribute('aria-pressed')==='true').map(b=>window.__camAuditNav().label(b))};
        });
        assert.ok(state.live,label+': recarga innecesaria en '+sport);
        assert.deepEqual(state.active,[sport],label+': selección activa errónea en '+sport);
      }
      await page.locator('header .cam-brand').click();
      await page.waitForTimeout(120);
      assert.ok(await page.evaluate(()=>document.querySelector('header [data-category="Todos"]')?.classList.contains('active')),
        label+': el logo no abre Home');
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      await page.waitForTimeout(125);
      const bottom=await page.evaluate(()=>{
        const nav=window.__camAuditNav().options[0].node.getBoundingClientRect();
        const last=[...document.querySelectorAll('footer a[href],footer button')].filter(e=>e.getBoundingClientRect().height>0).at(-1);
        const r=last?.getBoundingClientRect();
        return {navBottom:nav.bottom,footerVisible:!r||r.bottom<=nav.top+1};
      });
      assert.ok(Math.abs(bottom.navBottom-height)<3,label+': barra se mueve al hacer scroll');
      assert.ok(bottom.footerVisible,label+': el contenido final queda debajo de la barra');
      const layers=await page.evaluate(()=>{
        const nav=window.__camAuditNav().options[0].node.getBoundingClientRect();
        return ['userAuthModal','publishModal','articleModal'].map(id=>{
          const el=document.getElementById(id);
          if(!el)return {id,exists:false};
          el.classList.remove('hidden');
          const top=document.elementFromPoint((nav.left+nav.right)/2,(nav.top+nav.bottom)/2);
          const onTop=el===top||el.contains(top);
          el.classList.add('hidden');
          return {id,exists:true,onTop};
        });
      });
      for(const layer of layers) assert.ok(layer.exists&&layer.onTop,label+': modal tapado '+layer.id);
      const required=await page.evaluate(()=>['camNflQuiniela','camGlobalEditToggle',
        'aeMyTakesButton','mainContent','userAuthModal'].every(id=>!!document.getElementById(id)));
      assert.ok(required,label+': un módulo interactivo ha desaparecido');
      assert.deepEqual(errors.filter(e=>/filterByCategory|category-btn|navInfo|undefined.*category/i.test(e)),[],
        label+': error de navegación en consola');
    }
    await page.screenshot({path:path.join(OUT,label+'.png'),fullPage:true,animations:'disabled'});
    return {name:label,status:'PASS',runtimeErrors:errors.slice(0,8)};
  } finally {await context.close();}
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const app=server();
  await new Promise(ok=>app.listen(0,'127.0.0.1',ok));
  global.url='http://127.0.0.1:'+app.address().port+'/';
  const browser=await chromium.launch({headless:true});
  const reports=[],failures=[];
  try{
    const jobs=[
      ...SIZES.flatMap(([name,w,h],i)=>[true,false].filter(dark=>i<6||dark)
        .map(dark=>()=>visit(browser,name,w,h,dark,true))),
      ...[1024,1366].flatMap(w=>[true,false]
        .map(dark=>()=>visit(browser,'desktop-'+w,w,850,dark,false)))
    ];
    for(const job of jobs){
      try{const result=await job();reports.push(result);console.log('PASS '+result.name);}
      catch(e){failures.push(String(e.stack||e));console.error('FAIL '+e.message);}
    }
  }finally{
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({reports,failures},null,2));
    await browser.close();
    await new Promise(ok=>app.close(ok));
  }
  console.log('Navegación móvil: '+reports.length+' aprobadas, '+failures.length+' fallidas');
  if(failures.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
