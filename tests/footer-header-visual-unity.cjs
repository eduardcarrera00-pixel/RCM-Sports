/* CAM SPORTS — footer/header visual unity regression. No production data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

const documentHTML=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/site.css','utf8');
const start=documentHTML.indexOf('<footer class="bg-slate-900 border-t');
const finish=documentHTML.indexOf('</footer>',start);
assert.ok(start>0&&finish>start,'The original public footer must exist');
const footer=documentHTML.slice(start,finish+'</footer>'.length);
assert.match(footer,/CAM SPORTS/);
assert.match(footer,/Categorías/);
assert.match(footer,/Administración/);
assert.match(footer,/Redes Sociales/);
assert.match(footer,/Recuperación de cuenta/);
assert.match(footer,/Todos los derechos reservados/);
assert.match(footer,/x\.com\/CAM_SPORTS__/);
assert.match(footer,/instagram\.com\/cam_sports_club/);
assert.match(footer,/tiktok\.com\/\@cam\.sports\.club/);
assert.match(footer,/mailto:camsports56\@gmail\.com/);
const footerRules=css.slice(css.indexOf('/* CAM SPORTS · Footer visual continuity'));
assert.ok(footerRules.includes("cam-header-terrace-night.jpg")&&footerRules.includes("cam-header-terrace-day.jpg"));
assert.ok(footerRules.includes("cam-header-terrace-night-mobile.jpg")&&footerRules.includes("cam-header-terrace-day-mobile.jpg"));
assert.doesNotMatch(footerRules,/url\(['"]?cam-footer-village/,'The old detailed city scene must no longer be used');
assert.ok(!footerRules.includes('background-attachment:fixed'),'Keep small-screen painting cheap');

(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [360,390,768,1366]){
      for(const dark of [false,true]){
        const page=await browser.newPage({viewport:{width,height:900}});
        const html='<html class="'+(dark?'dark':'')+'"><head>'+
          '<meta name="viewport" content="width=device-width,initial-scale=1">'+
          '<style>'+css+'</style></head><body>'+
          '<header class="sticky top-0 z-40"><span>CAM SPORTS</span></header>'+
          footer+'</body></html>';
        await page.setContent(html);
        const visuals=await page.evaluate(()=>{
          const top=getComputedStyle(document.querySelector('body > header'));
          const foot=getComputedStyle(document.querySelector('body > footer'));
          const legal=getComputedStyle(document.querySelector('body > footer .text-slate-500'));
          return {
            topBase:top.backgroundColor,footBase:foot.backgroundColor,
            topImage:top.backgroundImage,footImage:foot.backgroundImage,
            legal:legal.color,overflow:document.documentElement.scrollWidth-innerWidth
          };
        });
        assert.equal(visuals.footBase,visuals.topBase,'Footer matches header base at '+width+' '+dark);
        const filename=dark?'cam-header-terrace-night':'cam-header-terrace-day';
        const expected=width<=760?filename+'-mobile.jpg':filename+'.jpg';
        assert.ok(visuals.footImage.includes(expected),
          'Footer reuses actual header artwork '+width+' '+dark);
        assert.ok(!visuals.footImage.includes('cam-footer-village-'));
        assert.equal(visuals.legal,'rgb(195, 203, 209)','The small legal line must be readable');
        assert.ok(visuals.overflow<=2,'No horizontal overflow '+width+' '+dark+' '+visuals.overflow);
        assert.equal(await page.locator('body > footer h4').count(),3);
        assert.equal(await page.locator('body > footer a[aria-label*="CAM Sports en"]').count(),3);
        assert.equal(await page.locator('body > footer button#accountRecoveryButton').count(),1);
        await page.evaluate(()=>{
          window.__events=[];
          window.filterByCategory=value=>window.__events.push('category:'+value);
          window.openLoginModal=()=>window.__events.push('login');
        });
        await page.locator('body > footer a[aria-label="CAM SPORTS, ir al inicio"]').click();
        await page.locator('body > footer a[onclick*="openLoginModal()"]').click();
        const events=await page.evaluate(()=>window.__events);
        assert.deepEqual(events,['category:Todos','login'],'Footer controls retain handlers');
        await page.close();
      }
    }
  }finally{await browser.close();}
  console.log('PASS: CAM SPORTS footer/header unified navy graphics in day/night, mobile/desktop, no layout or action regressions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
