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
  // Nunca contra el Supabase real: con 19 cargas y caché vacía cada pasada bajaba ~85 MB
  // de Storage (cuota de egress del plan gratis) y apuntaba ~20 visitas falsas.
  await context.route(/^https:\/\/[a-z0-9-]+\.supabase\.co\//i,route=>route.abort());
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(String(e.message)));
  const label=name+'-'+(dark?'noche':'dia');
  try{
    await page.addInitScript({content:'window.__camAuditNav='+navInfo.toString()+';'});
    await page.addInitScript(mode=>{try{localStorage.setItem('rcm_sports_theme',mode);sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1');}catch{}},dark?'dark':'light');
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
        headerExists:!!document.querySelector('header'),
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
      assert.ok(Math.abs(status.bottom)<=2,label+': la barra debe llegar al borde inferior');
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
      const dockDebug=await page.evaluate(()=>{
        const n=window.__camAuditNav().options[0].node;
        const b=n.querySelector('[data-category="Picks"]');
        const label=b.querySelector('span:last-child');
        const cs=e=>({visibility:getComputedStyle(e).visibility,display:getComputedStyle(e).display,
          opacity:getComputedStyle(e).opacity,rect:Math.round(e.getBoundingClientRect().height)});
        return {body:document.body.className,focus:document.activeElement?.outerHTML.slice(0,140),
          dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),
          nav:cs(n),button:cs(b),label:cs(label)};
      });
      assert.notEqual(dockDebug.label.display,'none',label+': todas las etiquetas deben ser visibles: '+JSON.stringify(dockDebug));
      for(const sport of ITEMS){
        // A real touch event detects obstructed or non-interactive menu controls.
        await page.locator('[data-cam-audit-nav] [data-category="'+sport+'"]').tap({timeout:4000});
        await page.waitForTimeout(240); // Account for intentional 160ms icon/color transitions.
        const state=await page.evaluate(()=>{
          const n=window.__camAuditNav().options[0];
          const current=n.node.querySelector('[data-category="'+n.items.find(b=>b.classList.contains('active'))?.dataset.category+'"]');
          const labels=n.items.map(b=>({
            category:b.dataset.category,
            display:getComputedStyle(b.querySelector('span:last-child')).display,
            ariaLabel:b.getAttribute('aria-label')
          }));
          return {live:window.__camAuditMarker?.stable===true,
            capsule:n.node.classList.contains('cam-nav-has-active'),
            pillWidth:parseFloat(n.node.style.getPropertyValue('--cam-pill-width')),
            iconColor:getComputedStyle(current.querySelector('svg.cam-mobile-nav-symbol')).color,
            ringRadius:getComputedStyle(current.querySelector('.ae-nav-icon')).borderRadius,
            ringFill:getComputedStyle(current.querySelector('.ae-nav-icon')).backgroundColor,
            labels, selectedFits:!current||current.querySelector('span:last-child').scrollWidth<=current.querySelector('span:last-child').clientWidth+1,
            active:n.items.filter(b=>b.classList.contains('active')||
              b.getAttribute('aria-current')==='page'||b.getAttribute('aria-selected')==='true'||
              b.getAttribute('aria-pressed')==='true').map(b=>window.__camAuditNav().label(b))};
        });
        assert.ok(state.live,label+': recarga innecesaria en '+sport);
        assert.deepEqual(state.active,[sport],label+': selección activa errónea en '+sport);
        assert.ok(state.capsule && state.selectedFits,label+': selección incorrecta '+sport+' '+JSON.stringify(state));
        assert.equal(state.ringRadius,'50%',label+': falta contorno circular '+sport);
        assert.equal(state.iconColor,dark?'rgb(217, 171, 112)':'rgb(136, 98, 55)',
          label+': icono seleccionado debe ser dorado y no blanco '+sport);
        assert.notEqual(state.ringFill,dark?'rgb(16, 37, 53)':'rgb(248, 242, 232)',
          label+': el círculo activo debe tener un relleno dorado sutil');
        for(const tab of state.labels){
          assert.equal(tab.ariaLabel,tab.category,label+': botón sin nombre accesible');
          assert.notEqual(tab.display,'none',label+': etiquetas siempre visibles');
        }
      }
      await page.locator('header .cam-brand').click();
      await page.waitForTimeout(120);
      assert.ok(await page.evaluate(()=>document.querySelector('nav.ae-sport-nav [data-category="Todos"]')?.classList.contains('active')),
        label+': el logo no abre Home');
      assert.equal(await page.evaluate(()=>document.querySelector('body > nav.ae-sport-nav').classList.contains('cam-nav-has-active')),false,
        label+': Home deja la cápsula seleccionada por error');
      // Bypass the page's smooth-scroll animation before measuring the footer.
      // A fixed 125 ms wait can sample halfway through a long mobile page.
      await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
      const bottom=await page.evaluate(()=>{
        const nav=window.__camAuditNav().options[0].node.getBoundingClientRect();
        const last=[...document.querySelectorAll('footer a[href],footer button')].filter(e=>e.getBoundingClientRect().height>0).at(-1);
        const r=last?.getBoundingClientRect();
        return {navBottom:nav.bottom,footerVisible:!r||r.bottom<=nav.top+1};
      });
      assert.ok(Math.abs(bottom.navBottom-height)<=2,label+': barra se mueve al hacer scroll');
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
