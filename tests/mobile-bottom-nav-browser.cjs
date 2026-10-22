/* Real browser QA for phone-only CAM SPORTS navigation; data/network isolated. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = process.cwd();

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    // Keep all real CSS and body DOM, while isolating backend/production scripts.
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<link\b[^>]*https?:[^>]*>/gi, '')
      .replace('</body>', `<script>
        window.filterByCategory = function(category) {
          document.querySelectorAll('.category-btn').forEach(button =>
            button.classList.toggle('active',button.dataset.category===category)
          );
          document.body.dataset.section=category;
        };
        document.body.insertAdjacentHTML('beforeend',
          '<div id="camQaEnd" style="height:60px;padding:10px">FINAL DE CAM SPORTS</div>');
      </script><script src="assets/cam-mobile-bottom-nav.js"></script></body>`);
    res.setHeader('content-type', 'text/html;charset=utf-8');
    return res.end(html);
  }
  const file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const type = file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.webp')?'image/webp':file.endsWith('.png')?'image/png':'application/octet-stream';
    res.setHeader('content-type',type); res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const page=await browser.newPage({viewport:{width:390,height:780}});
    await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1')?route.continue():route.abort());
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    const nav=page.locator('nav.ae-sport-nav');
    for(const width of [320,360,375,390,430,760,761,768,1024,1366]){
      for(const dark of [false,true]){
        await page.setViewportSize({width,height:780});
        await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
        await page.waitForTimeout(210); // Let the 160ms theme-color transition settle.
        const phone=width<=760;
        const layout=await nav.evaluate((element)=>{
          const r=element.getBoundingClientRect(),s=getComputedStyle(element);
          const buttons=Array.from(element.children).filter(el=>getComputedStyle(el).display!=='none');
          return {parent:element.parentElement.tagName,position:s.position,display:s.display,z:s.zIndex,
            top:r.top,bottom:r.bottom,width:r.width,height:r.height,background:s.backgroundColor,
            buttons:buttons.map(b=>({key:b.dataset.category,rect:b.getBoundingClientRect().toJSON(),label:b.innerText}))};
        });
        assert.equal(layout.parent,phone?'BODY':'DIV',JSON.stringify({width,dark,layout}));
        assert.equal(layout.position,phone?'fixed':layout.position,JSON.stringify({width,dark,layout}));
        if(phone){
          assert.equal(layout.buttons.length,4,JSON.stringify({width,dark,layout}));
          for(const key of ['Picks','NFL','Fútbol','Opiniones']){
            const icon=await page.locator('body > nav.ae-sport-nav > button[data-category="'+key+'"]').evaluate(button=>{
              const svg=button.querySelector('svg.cam-mobile-nav-symbol');
              const image=button.querySelector('img.ae-custom-sport-icon');
              return {
                svgCount:button.querySelectorAll('svg.cam-mobile-nav-symbol').length,
                svgDisplay:svg ? getComputedStyle(svg).display : null,
                svgWidth:svg ? svg.getBoundingClientRect().width : 0,
                svgStroke:svg?.getAttribute('stroke'),
                imageDisplay:image ? getComputedStyle(image).display : null,
                imageExists:!!image,
                circleSize:button.querySelector('.ae-nav-icon')?.getBoundingClientRect().width,
                circleRadius:getComputedStyle(button.querySelector('.ae-nav-icon')).borderRadius,
                caption:getComputedStyle(button.querySelector('span:last-child')).display,
                iconColor:getComputedStyle(svg).color
              };
            });
            assert.equal(icon.svgCount,1,key+' vector icon exists');
            assert.equal(icon.svgDisplay,'block',key+' vector icon is visible');
            assert.ok(icon.svgWidth>=21 && icon.svgWidth<=23,key+' vector icon is legible inside circle');
            assert.equal(icon.svgStroke,'currentColor',key+' icon follows theme/active state');
            assert.equal(icon.imageDisplay,'none',key+' old WebP is hidden only on phone');
            assert.equal(icon.imageExists,true,key+' original desktop image remains');
            assert.ok(icon.circleSize>=35 && icon.circleSize<=37,key+' same small circle frame');
            assert.equal(icon.circleRadius,'50%',key+' circular stroke');
            assert.notEqual(icon.caption,'none',key+' caption remains visible');
            assert.equal(icon.iconColor,dark?'rgb(210, 192, 166)':'rgb(24, 51, 67)',key+' inactive theme color');
          }
          assert.deepEqual(layout.buttons.map(b=>b.key),['Picks','NFL','Fútbol','Opiniones']);
          assert.ok(Math.abs(layout.bottom-780)<=1,JSON.stringify({width,dark,layout}));
          assert.ok(Math.abs(layout.width-width)<=1,JSON.stringify({width,dark,layout}));
          assert.equal(layout.display,'flex','mobile dock should use flexible icon spacing');
          assert.equal(layout.background,dark?'rgb(16, 37, 53)':'rgb(248, 242, 232)','theme-matched edge-to-edge background');
          assert.ok(layout.height>=60 && layout.height<=110,JSON.stringify({width,dark,layout}));
          for(const b of layout.buttons){
            assert.ok(b.rect.height>=44 && b.rect.width>=44,JSON.stringify({width,dark,b}));
            assert.ok(b.rect.left>=-1 && b.rect.right<=width+1,JSON.stringify({width,dark,b}));
          }
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
          assert.ok(overflow<4,'horizontal overflow '+overflow+' at '+width+' px');
          await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
          const end=await page.locator('#camQaEnd').boundingBox();
          assert.ok(end && end.y+end.height <= 780-layout.height+2,
            JSON.stringify({width,dark,end,layoutHeight:layout.height}));
        }else{
          assert.notEqual(layout.position,'fixed',JSON.stringify({width,dark,layout}));
          for(const key of ['Picks','NFL','Fútbol','Opiniones']){
            const restored=await page.locator('header nav.ae-sport-nav > button[data-category="'+key+'"]').evaluate(button=>({
              vector:getComputedStyle(button.querySelector('svg.cam-mobile-nav-symbol')).display,
              image:getComputedStyle(button.querySelector('img.ae-custom-sport-icon')).display
            }));
            assert.equal(restored.vector,'none',key+' mobile SVG is hidden on desktop');
            assert.notEqual(restored.image,'none',key+' original desktop WebP remains visible');
          }
          assert.equal(await nav.evaluate(el=>el.parentElement.closest('header')!==null),true);
        }
      }
    }
    await page.setViewportSize({width:390,height:780});
    await page.evaluate(()=>document.documentElement.classList.remove('dark'));
    await page.waitForTimeout(210);
    await page.locator('body > nav [data-category="NFL"]').click();
    await page.waitForFunction(()=>document.querySelector('body > nav [data-category="NFL"]').getAttribute('aria-current')==='page');
    assert.equal(await page.evaluate(()=>document.body.dataset.section),'NFL');
    await page.waitForTimeout(210); // Selected icon/ring transition is intentionally animated.
    const nflSelected=await nav.evaluate(el=>{
      const active=el.querySelector('[data-category="NFL"]');
      const normal=el.querySelector('[data-category="Picks"]');
      const a=active.querySelector('.ae-nav-icon');
      const b=normal.querySelector('.ae-nav-icon');
      return {
        active:el.classList.contains('cam-nav-has-active'),
        activeColor:getComputedStyle(active.querySelector('svg.cam-mobile-nav-symbol')).color,
        selectedBorder:getComputedStyle(a).borderTopColor,
        selectedFill:getComputedStyle(a).backgroundColor,
        normalFill:getComputedStyle(b).backgroundColor,
        selectedCircle:a.getBoundingClientRect().toJSON(),
        normalCircle:b.getBoundingClientRect().toJSON(),
        text:getComputedStyle(active.querySelector('span:last-child')).display,
        inactiveText:getComputedStyle(normal.querySelector('span:last-child')).display,
        accessible:normal.getAttribute('aria-label')
      };
    });
    assert.ok(nflSelected.active,JSON.stringify(nflSelected));
    assert.equal(nflSelected.activeColor,'rgb(136, 98, 55)','day selected icon is muted gold, not white');
    assert.notEqual(nflSelected.selectedBorder,'rgb(255, 255, 255)');
    assert.notEqual(nflSelected.selectedFill,nflSelected.normalFill,'active circle receives subtle fill');
    assert.equal(nflSelected.selectedCircle.width,nflSelected.normalCircle.width,'active circle does not grow');
    assert.notEqual(nflSelected.text,'none');
    assert.notEqual(nflSelected.inactiveText,'none');
    assert.equal(nflSelected.accessible,'Picks');
    await page.evaluate(()=>filterByCategory('Opiniones'));
    await page.waitForFunction(()=>document.querySelector('body > nav [data-category="Opiniones"]').getAttribute('aria-current')==='page');
    await page.waitForTimeout(210);
    const opinionSelected=await nav.evaluate(el=>{
      const button=el.querySelector('[data-category="Opiniones"]');
      const label=button.querySelector('span:last-child');
      return {
        iconColor:getComputedStyle(button.querySelector('svg.cam-mobile-nav-symbol')).color,
        circleSize:button.querySelector('.ae-nav-icon').getBoundingClientRect().width,
        labelVisible:getComputedStyle(label).display!=='none',
        fits:label.scrollWidth<=label.clientWidth+1,
        indicator:getComputedStyle(el,'::before').content
      };
    });
    assert.equal(opinionSelected.iconColor,'rgb(136, 98, 55)');
    assert.equal(opinionSelected.circleSize,nflSelected.selectedCircle.width);
    assert.ok(opinionSelected.labelVisible && opinionSelected.fits,JSON.stringify(opinionSelected));
    assert.equal(opinionSelected.indicator,'none','old moving pill is removed');
    await page.evaluate(()=>document.documentElement.classList.add('dark'));
    await page.waitForTimeout(210);
    assert.equal(await page.locator('body > nav [data-category="Opiniones"] svg.cam-mobile-nav-symbol').evaluate(svg=>getComputedStyle(svg).color),'rgb(217, 171, 112)','night selected icon is gold, never white');
    await page.evaluate(()=>filterByCategory('Todos'));
    await page.waitForFunction(()=>!document.querySelector('body > nav').classList.contains('cam-nav-has-active'));
    const input=page.locator('#mobileSearchInput');
    await input.evaluate(el=>{el.hidden=false;el.removeAttribute('aria-hidden');});
    await input.focus();
    assert.equal(await nav.evaluate(el=>getComputedStyle(el).visibility),'hidden','keyboard focus hides dock');
    await input.blur();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('body > nav.ae-sport-nav')).visibility==='visible');
    await page.evaluate(()=>document.querySelector('#aeArticlePhotoModal').classList.remove('hidden'));
    assert.equal(await nav.evaluate(el=>getComputedStyle(el).visibility),'hidden','modal hides dock');
    await page.evaluate(()=>document.querySelector('#aeArticlePhotoModal').classList.add('hidden'));
    assert.equal(await nav.evaluate(el=>getComputedStyle(el).visibility),'visible','dock returns after modal');
    await page.setViewportSize({width:1366,height:780});
    assert.equal(await nav.evaluate(el=>!!el.closest('header')),true,'tablet/desktop header must regain real nav');
    assert.equal(await page.locator('.category-btn').count(),9,'never duplicate category buttons');
    await page.close();
    console.log('PASS: CAM SPORTS Chromium layout 320–1366 px, day/night, scroll, links, modal, input and desktop.');
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
