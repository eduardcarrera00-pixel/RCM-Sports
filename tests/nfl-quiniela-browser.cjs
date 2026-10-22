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
      await page.evaluate(()=>{
        const tomorrow=new Date(Date.now()+86400000).toISOString();
        const user={id:'11111111-1111-4111-8111-111111111111',user_metadata:{username:'TEST'}};
        const fixtures=[
          {id:'900000001',season:2026,week:7,home_id:'BUF',away_id:'KC',kickoff:tomorrow,status:'scheduled',odds_locked_at:tomorrow,
           picks_open:true,points_home:5,points_away:4,probability_home:.4,probability_away:.6},
          {id:'900000002',season:2026,week:7,home_id:'DAL',away_id:'SEA',kickoff:tomorrow,status:'scheduled',odds_locked_at:tomorrow,
           picks_open:true,points_home:4,points_away:4,probability_home:.5,probability_away:.5},
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
      assert.equal(await page.locator('.cam-nfl-game').count(),2);
      assert.equal(await page.locator('#camNflGames .cam-nfl-team').count(),4);
      await page.locator('.cam-nfl-game').first().locator('.cam-nfl-team').first().click();
      assert.match(await page.locator('#camNflProgress').innerText(),/1 de 2 seleccionados/);
      await page.locator('#camNflSave').click();
      await page.waitForFunction(()=>document.querySelector('#camNflStatus')?.textContent.includes('guardado'));
      assert.match(await page.locator('#camNflGames').innerText(),/Pronóstico guardado/);
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
