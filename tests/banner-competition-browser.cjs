/* Real stylesheet cascade + both quiniela controllers; synthetic transport only. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const root=process.env.CAM_QA_URL||'http://127.0.0.1:8769/';
const html=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const screenshots=process.env.CAM_QA_SCREENSHOTS;
(async()=>{
  const server=require('node:http').createServer((request,response)=>{
    const file=require('node:path').resolve('.',decodeURIComponent(new URL(request.url,root).pathname.slice(1))||'index.html');
    if(!file.startsWith(process.cwd()+'/')){response.writeHead(403);response.end();return;}
    try{
      const bytes=fs.readFileSync(file);
      response.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webp')?'image/webp':'text/html');
      response.end(bytes);
    }catch{response.writeHead(404);response.end();}
  });
  await new Promise(resolve=>server.listen(new URL(root).port,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,executablePath:process.env.AE_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const width of [360,390,768,1366])for(const dark of [false,true]){
      const page=await browser.newPage({viewport:{width,height:960}});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const url=route.request().url();
        if(url===root)return route.fulfill({contentType:'text/html',body:html});
        return url.startsWith(root)?route.continue():route.abort();
      });
      await page.goto(root);
      await page.evaluate(({dark})=>{
        document.documentElement.classList.toggle('dark',dark);
        window.db={from:()=>({select:async()=>({data:[]})})};
      },{dark});
      await page.addScriptTag({path:'assets/ae-site-images.js'});
      await page.evaluate(()=>window.camSiteImages.reload());
      let reference;
      for(const sport of ['home','picks','nfl','football','opinions']){
        await page.evaluate(sport=>{
          document.body.className='ae-is-'+sport;
          const ids=['aeHomeTakesPopular','aeHomeTakesUnpopular','aeHomeTopTakes','communityPicks','aeSportTakeLeaders','aeNflTwinRankings','camNflQuiniela','camFootballQuiniela','aeTakesFeedHeading','aeOpinions','nflRankings','championsRankings'];
          for(const id of ids){
            const node=document.getElementById(id);if(!node)continue;
            for(let p=node;p&&p!==document.body;p=p.parentElement){p.hidden=false;p.classList.remove('hidden');}
          }
        },sport);
        await page.evaluate(()=>window.camSiteImages.reload());
        const sizes=await page.evaluate(()=>{
          const titles=[...document.querySelectorAll('[data-cam-banner] > h2,[data-cam-banner] > h3,[data-cam-banner] .ae-weekly-heading-inline h3,[data-cam-banner] .ae-rank-title-wrap h3,[data-cam-banner] > .ae-picks-nudge,#aeTakesFeedHeading')];
          const ref=document.querySelector('#aeHomeTakesPopular .ae-vote-column-heading');
          const rt=ref.querySelector('h2,h3');
          const signature=node=>{const s=getComputedStyle(node);return [s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight,s.letterSpacing,s.textAlign];};
          return {reference:signature(rt),titles:titles.filter(x=>x.getClientRects().length).map(x=>({text:x.textContent,style:signature(x)})),art:[...document.querySelectorAll('[data-cam-banner-key]')].filter(x=>x.getClientRects().length).map(x=>({key:x.dataset.camBannerKey,size:[getComputedStyle(x,'::after').width,getComputedStyle(x,'::after').height]}))};
        });
        reference??=sizes.reference;
        for(const title of sizes.titles)assert.deepEqual(title.style,reference,width+'/'+dark+'/'+sport+': '+title.text);
        for(const art of sizes.art)assert.deepEqual(art.size,[width<=760?'44px':'56px',width<=760?'44px':'56px'],art.key);
      }
      const power=await page.evaluate(()=>['rankingTitle','championsTitle'].map(id=>{
        const title=document.getElementById(id),s=getComputedStyle(title);
        return {text:title.textContent.trim(),style:[s.fontFamily,s.fontSize,s.fontWeight,s.lineHeight],before:getComputedStyle(title,'::before').content,overline:getComputedStyle(title.previousElementSibling).display};
      }));
      assert.equal(power[0].text,'Power Rankings');assert.equal(power[1].text,'Power Rankings');
      assert.deepEqual(power[0].style,power[1].style);assert.equal(power[0].before,'none');assert.equal(power[0].overline,'none');
      for(const sport of ['nfl','football']){
        await page.evaluate(sport=>{
          document.body.className='ae-is-'+sport;
          const prefix=sport==='nfl'?'camNfl':'camFootball';
          const panel=document.getElementById(prefix+'Quiniela');
          for(let p=panel;p&&p!==document.body;p=p.parentElement){p.hidden=false;p.classList.remove('hidden');p.style.setProperty('display','block','important');}
          const board=document.getElementById(prefix+'QuinielaStandings');
          board.hidden=true;
          const season=new Date().getUTCFullYear();
          const games=Array.from({length:5},(_,i)=>({id:'g'+i,season,week:7,matchday:7,competition:'laliga',home_id:'BUF',away_id:'KC',kickoff:new Date(Date.now()-(i+1)*86400000).toISOString(),status:'final',winner_id:'BUF',outcome:i===0?'draw':'home',points_home:4,points_away:5,points_draw:6,picks_open:false,odds_locked_at:'2026-10-01'}));
          games.push({...games[0],id:'void',status:sport==='nfl'?'tie':'cancelled',kickoff:new Date().toISOString()});
          const rows=Array.from({length:12},(_,i)=>({rank_position:i+1,user_id:'u'+i,username:i===0?'Leader':'Usuario'+i,points:44-i,hits:4,resolved:5,accuracy:80}));
          window.requests=[];window.concurrent=0;window.maximum=0;window.emptyLeaderboard=false;
          window.openAePublicProfile=id=>{window.openedProfile=id;};
          window.db={auth:{getUser:async()=>({data:{user:{id:'u11'}}}),onAuthStateChange(){}},
            rpc:async(name,args)=>{
              window.requests.push({name,args});
              if(name.endsWith('_leaderboard'))return {data:window.emptyLeaderboard?[]:rows};
              if(name.endsWith('_public_pick_breakdown')){
                window.maximum=Math.max(window.maximum,++window.concurrent);
                await new Promise(resolve=>setTimeout(resolve,20));window.concurrent--;
                return {data:games.map((g,i)=>({game_id:g.id,team_id:i===2?'KC':'BUF',pick:i===2?'away':i===0?'draw':'home',awarded_points:i===2?0:4,status:g.status}))};
              }
              return {data:[]};
            },
            from:table=>{
              const q={select(){return q},order(){return q},eq(){return q},in(){return q},limit:async()=>({data:table.endsWith('_games')?games:[]})};return q;
            }};
        },sport);
        if(!(await page.evaluate(()=>!!window.CamQuinielaStandings)))await page.addScriptTag({path:'assets/cam-quiniela-standings.js'});
        await page.addScriptTag({path:'assets/cam-'+sport+'-quiniela.js'});
        const prefix=sport==='nfl'?'camNfl':'camFootball';
        await page.waitForFunction(prefix=>document.querySelector('#'+prefix+'Ranking .cam-q-board'),prefix);
        assert.equal(await page.evaluate(()=>window.requests.filter(x=>x.name.endsWith('_public_pick_breakdown')).length),0,'Hidden standings do not prefetch results');
        await page.locator('#'+prefix+'ViewTabs [data-view="all"]').click();
        await page.waitForFunction(prefix=>document.querySelector('#'+prefix+'Ranking .cam-q-own'),prefix);
        const board=page.locator('#'+prefix+'Ranking');
        await board.scrollIntoViewIfNeeded();
        assert.equal(await board.locator('tbody tr').count(),11,'Top ten plus the current user');
        assert.match(await board.locator('.cam-q-chase').textContent(),/11 puntos del líder/);
        assert.equal(await board.locator('.cam-q-own td').last().textContent(),'33');
        const own=board.locator('.cam-q-own');
        await own.locator('summary').click();
        await page.waitForFunction(prefix=>document.querySelector('#'+prefix+'Ranking .cam-q-own .cam-q-streak')?.textContent==='2 aciertos',prefix);
        assert.equal(await own.locator('.cam-q-form-result').count(),5,'Void picks are omitted; football draw counts as a hit');
        await own.locator('button.cam-nfl-link').click();
        assert.equal(await page.evaluate(()=>window.openedProfile),'u11');
        assert.ok(await page.evaluate(()=>window.maximum<=4),'Automatic detail loading is bounded; one manual expansion can run alongside it');
        const bounds=await board.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
        assert.ok(bounds.scroll<=bounds.width+1,'No horizontal overflow: '+JSON.stringify(bounds));
        assert.ok(await board.locator('.cam-q-position').first().evaluate(el=>el.getBoundingClientRect().width>=32),'Position badge remains legible on mobile');
        const calls=await page.evaluate(()=>window.requests.filter(x=>x.name.endsWith('_public_pick_breakdown')));
        assert.ok(calls.every(x=>x.args.p_season===null),'Historical detail crosses seasons');
        if(screenshots&&(width===390||width===1366)){
          fs.mkdirSync(screenshots,{recursive:true});
          await board.screenshot({path:screenshots+'/'+sport+'-'+width+'-'+(dark?'night':'day')+'.png'});
        }
        await page.evaluate(()=>{window.emptyLeaderboard=true;});
        await page.locator('#'+prefix+'ViewTabs [data-view="month"]').click();
        await board.locator('.cam-q-empty').waitFor();
        assert.equal(await board.locator('tbody tr').count(),0,'An empty period contains no fake participants');
        await board.getByRole('button',{name:'Ir a la jornada'}).click();
        assert.equal(await page.locator('#'+prefix+'MatchPanel').getAttribute('hidden'),null);
      }
      assert.deepEqual(errors,[]);await page.close();
      console.log('PASS',width,dark?'night':'day','banner typography/art, Power Rankings, NFL + football standings');
    }
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})();
