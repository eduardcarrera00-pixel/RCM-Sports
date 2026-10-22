/* La Quiniela NFL: browser regression on mobile/desktop day/night and save UX.
 * This uses test-only fixtures; none are written to Supabase.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
  const pageHtml=fs.readFileSync('index.html','utf8');
  const code=fs.readFileSync('assets/cam-nfl-quiniela.js','utf8');
  const theme=pageHtml.match(/<style id="cam-nfl-quiniela-theme">([\s\S]*?)<\/style>/)?.[0];
  const section=pageHtml.match(/<!-- La Quiniela NFL es siempre el último módulo de NFL\. -->([\s\S]*?)<!-- Se retira el listado agregado/)?.[1];
  assert.ok(theme&&section,'The published page must contain the module + the day/night styling');
  assert.ok(pageHtml.indexOf('id="camNflQuiniela"')>pageHtml.indexOf('id="freeTakes"'),'NFL must be last');
  assert.ok(pageHtml.indexOf('id="camNflQuiniela"')<pageHtml.indexOf('</main>'),'Module must stay inside main');
  assert.ok(/create policy cam_nfl_picks_own/.test(fs.readFileSync('supabase/migrations/20261022170000_cam_nfl_quiniela.sql','utf8')),'RLS is required');

  const browser=await chromium.launch({headless:true});
  try{
    for(const [width,dark] of [[1365,true],[1365,false],[375,true],[375,false]]){
      const page=await browser.newPage({viewport:{width,height:850}});
      const html='<html class="'+(dark?'dark':'')+'"><head><meta name="viewport" content="width=device-width, initial-scale=1">'+theme+'</head><body class="ae-is-nfl">'+section+'<section id="camNflProfile" hidden></section></body></html>';
      await page.setContent(html);
      // Reuse the real CAM SPORTS catalog, never fabricated logo URLs.
      await page.addScriptTag({content:fs.readFileSync('assets/nfl-teams.js','utf8')});
      await page.addScriptTag({content:fs.readFileSync('assets/cam-nfl-quiniela-logos.js','utf8')});
      await page.evaluate(()=>{
        const tomorrow=new Date(Date.now()+86400000).toISOString();
        const later=new Date(Date.now()+3*86400000).toISOString();
        const user={id:'11111111-1111-4111-8111-111111111111',user_metadata:{username:'TEST'}};
        const fixtures=[
          {id:'900000001',season:2026,week:7,home_id:'BUF',away_id:'KC',kickoff:tomorrow,status:'scheduled',odds_locked_at:tomorrow,
           picks_open:true,points_home:5,points_away:4,probability_home:.4,probability_away:.6},
          {id:'900000002',season:2026,week:7,home_id:'DAL',away_id:'SEA',kickoff:later,status:'scheduled',odds_locked_at:tomorrow,
           picks_open:true,points_home:4,points_away:4,probability_home:.5,probability_away:.5},
          {id:'900000003',season:2026,week:6,home_id:'NE',away_id:'CHI',
           // Two days ago: the old 4-day lookback incorrectly selected week 6.
           kickoff:new Date(Date.now()-2*86400000).toISOString(),status:'final',
           away_score:20,home_score:7,winner_id:'CHI',odds_locked_at:new Date(Date.now()-3*86400000).toISOString(),
           picks_open:false,points_home:4,points_away:4,probability_home:.5,probability_away:.5},
          {id:'900000004',season:2026,week:8,home_id:'BAL',away_id:'PIT',
           kickoff:new Date(Date.now()+8*86400000).toISOString(),status:'scheduled',
           odds_locked_at:tomorrow,picks_open:true,
           points_home:3,points_away:8,probability_home:.8,probability_away:.2},
          {id:'900000005',season:2026,week:7,home_id:'MIA',away_id:'NYJ',kickoff:later,status:'scheduled',
           odds_locked_at:tomorrow,picks_open:true,points_home:5,points_away:6},
          // 01:30 UTC is Saturday in Toronto; 06:30 UTC is Sunday after the DST shift.
          {id:'900000006',season:2026,week:8,home_id:'SF',away_id:'LAR',
           kickoff:'2026-11-01T01:30:00Z',status:'postponed',picks_open:false,odds_locked_at:tomorrow,
           points_home:6,points_away:3},
          {id:'900000007',season:2026,week:8,home_id:'GB',away_id:'DET',
           kickoff:'2026-11-01T06:30:00Z',status:'scheduled',picks_open:true,odds_locked_at:tomorrow,
           points_home:6,points_away:4}
        ];
        const teams=['BUF','KC','DAL','SEA'].map(id=>({id,name:'Equipo '+id,logo:'https://a.espncdn.com/i/teamlogos/nfl/500/'+id.toLowerCase()+'.png'}));
        const picks=[];
        window.db={
          auth:{getUser:async()=>({data:{user},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
          from(name){
            const rows=name==='cam_nfl_games'?fixtures:name==='nfl_teams'?teams:name==='cam_nfl_picks'?picks:[];
            const chain=new Proxy({}, {get(target,key){
              if(key==='then')return (resolve,reject)=>Promise.resolve({data:rows,error:null}).then(resolve,reject);
              return ()=>chain;
            }});
            return chain;
          },
          rpc:async (name,args)=>{
            if(name==='cam_nfl_save_pick'){
              const row={game_id:args.p_game_id,team_id:args.p_team_id,awarded_points:0};
              const old=picks.findIndex(p=>p.game_id===row.game_id);
              if(old>=0)picks[old]=row;else picks.push(row);
              return {data:true,error:null};
            }
            if(name==='cam_nfl_profile_summary')return{data:[{points:4,hits:1,resolved:1,accuracy:100,rank_position:1,last_week:7,last_week_points:4}],error:null};
            return {data:[],error:null};
          },
          functions:{invoke:async()=>({data:{ok:true,weeks:[],odds:{frozen:0}}})}
        };
        window.openUserAuthModal=()=>{window.__loginOpened=true;};
        window.openAePublicProfile=id=>{window.__publicProfile=id;};
        window.currentAdmin=null;
      });
      await page.addScriptTag({content:code});
      await page.evaluate(()=>document.dispatchEvent(new Event('DOMContentLoaded')));
      await page.waitForSelector('.cam-nfl-game');
      const weekPicker=page.locator('#camNflNav select[aria-label="Jornada NFL"]');
      assert.equal(await weekPicker.inputValue(),'7',
        'The current week is selected by default, even when last week played two days ago');
      assert.equal(await page.locator('.cam-nfl-game').count(),1,'Only the nearest day appears initially');
      assert.equal(await page.locator('#camNflDayNav .cam-nfl-day').count(),2,'Show exactly the two days with matches');
      assert.equal(await page.locator('#camNflDayNav .cam-nfl-day[aria-pressed="true"]').count(),1);
      assert.match(await page.locator('#camNflDayNav').innerText(),/Este · America\/Toronto/);
      assert.match(await page.locator('#camNflWeekSummary').innerText(),/Partidos/);
      assert.match(await page.locator('#camNflWeekSummary').innerText(),/3/);
      for(const text of await page.locator('#camNflGames .cam-nfl-team small').allTextContents()){
        assert.match(text,/^\d+ pts$/,'Show only points, never a team win probability');
        assert.doesNotMatch(text,/%/);
      }
      await weekPicker.selectOption('6');
      assert.equal(await page.locator('#camNflNav select[aria-label="Jornada NFL"]').inputValue(),'6');
      assert.equal(await page.locator('.cam-nfl-game').count(),1,
        'Previous rounds must remain accessible in the selector');
      assert.match(await page.locator('#camNflGames').innerText(),/Finalizado/);
      await page.evaluate(()=>document.body.classList.remove('ae-is-nfl'));
      await page.evaluate(()=>document.body.classList.add('ae-is-nfl'));
      await page.waitForFunction(()=>document.querySelector('#camNflNav select[aria-label="Jornada NFL"]')?.value==='7');
      assert.equal(await page.locator('.cam-nfl-game').count(),1,
        'Returning to NFL must reopen the current week and its nearest match day');
      assert.equal(await page.locator('#camNflNav select[aria-label="Jornada NFL"]').inputValue(),'7');
      assert.equal(await page.locator('#camNflGames .cam-nfl-team').count(),2);
      assert.equal(await page.locator('#camNflGames .cam-nfl-team img').count(),2);
      assert.ok((await page.locator('#camNflGames .cam-nfl-team img').first().getAttribute('src')).includes('espncdn.com'));
      await page.locator('#camNflHistory').evaluate(node=>node.open=true);
      assert.ok(await page.locator('#camNflHistory .cam-quiniela-team-logo').count()>=2,
        'Previous rounds must display both logos');
      await page.locator('.cam-nfl-game').first().locator('.cam-nfl-team').first().click();
      assert.match(await page.locator('#camNflProgress').innerText(),/1 de 3 seleccionados/);
      assert.equal(await page.locator('#camNflSummary .cam-quiniela-team-logo').count(),2,
        'The selection summary needs both logos');
      await page.locator('#camNflSaveDay').click();
      await page.waitForFunction(()=>document.querySelector('#camNflStatus')?.textContent.includes('guardado'));
      assert.match(await page.locator('#camNflGames').innerText(),/Pronóstico guardado/);
      assert.match(await page.locator('#camNflWeekSummary').innerText(),/1/);
      await page.locator('#camNflDayNav .cam-nfl-day').nth(1).click();
      assert.equal(await page.locator('.cam-nfl-game').count(),2,'A day with two fixtures shows both');
      assert.equal(await page.locator('#camNflDayNav .cam-nfl-day').count(),2,'No invented weekdays');
      assert.match(await page.locator('#camNflProgress').innerText(),/1 de 3 seleccionados/);
      await page.locator('.cam-nfl-game').first().locator('.cam-nfl-team').first().click();
      assert.match(await page.locator('#camNflProgress').innerText(),/2 de 3 seleccionados/);
      await page.locator('#camNflSave').click();
      await page.waitForFunction(()=>document.querySelector('#camNflProgress')?.textContent.includes('2 guardados'));
      assert.match(await page.locator('#camNflWeekSummary').innerText(),/2/);
      await page.locator('#camNflDayNav .cam-nfl-day').first().click();
      assert.equal(await page.locator('.cam-nfl-game').count(),1,'Switching days keeps the list compact');
      assert.match(await page.locator('#camNflGames').innerText(),/Pronóstico guardado/,'First-day pick persists');
      assert.equal(await page.locator('.cam-nfl-team.is-selected').count(),1,'Saved winner remains highlighted');
      await page.locator('#camNflNav select[aria-label="Jornada NFL"]').selectOption('8');
      const grouped=await page.locator('#camNflDayNav .cam-nfl-day').evaluateAll(nodes=>
        nodes.map(node=>({day:node.dataset.day,text:node.textContent})));
      assert.ok(grouped.some(x=>x.day==='2026-10-31'&&/sábado/i.test(x.text)),
        'International Saturday game is grouped by Toronto date, not the UTC Sunday date');
      assert.ok(grouped.some(x=>x.day==='2026-11-01'&&/domingo/i.test(x.text)),
        'DST rollover correctly yields a Sunday tab');
      await page.locator('#camNflDayNav .cam-nfl-day[data-day="2026-10-31"]').click();
      assert.match(await page.locator('#camNflGames').innerText(),/Pospuesto/);
      assert.equal(await page.locator('#camNflGames .cam-nfl-team:not([disabled])').count(),0,
        'Postponed games must remain locked');
      await page.locator('#camNflNav select[aria-label="Jornada NFL"]').selectOption('7');
      assert.equal(await page.locator('#camNflDayNav .cam-nfl-day[aria-pressed="true"]').count(),1);
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('cam:nfl-profile',{detail:{userId:'11111111-1111-4111-8111-111111111111'}})));
      await page.waitForFunction(()=>document.querySelector('#camNflProfile')?.textContent.includes('Efectividad'));
      assert.ok(await page.locator('#camNflProfile').isVisible());
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      assert.ok(overflow<4,'Horizontal overflow '+overflow+' at viewport '+width);
      assert.ok((await page.locator('#camNflQuiniela').evaluate(e=>getComputedStyle(e).backgroundColor)).startsWith('rgb('));
      await page.close();
    }
  }finally{await browser.close();}
  console.log('NFL quiniela browser smoke tests passed: desktop/mobile, day/night, save and profile.');
})().catch(error=>{console.error(error);process.exitCode=1;});
