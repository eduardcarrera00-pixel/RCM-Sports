/* Mi Quiniela: profile-only history, statistics, secure public picks and responsive theme. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const UUID='11111111-1111-4111-8111-111111111111';
const html=fs.readFileSync('index.html','utf8');
assert.match(html, /id="aeProfileTabTakes"[\s\S]*id="aeProfileTabPicks"[\s\S]*id="aeProfileTabQuiniela"/);
assert.equal(html.includes('id="camNflWeekSummary"'),false,'Remove Mi jornada');
assert.equal(html.includes('id="camNflSummary"'),false,'Remove NFL personal preview');
assert.equal(html.includes('id="camNflHistory"'),false,'Move history to profile');
assert.ok(html.includes('id="camNflProfile"'),'Use the existing profile section');
assert.match(fs.readFileSync('assets/ae-profile.js','utf8'),/camNflProfile\?\.open\(activeAuthor,privateView\)/);
const css=fs.readFileSync('assets/cam-nfl-profile.css','utf8');
const script=fs.readFileSync('assets/cam-nfl-profile.js','utf8');
const now=Date.now(),when=days=>new Date(now+days*86400000).toISOString();
const games=[
 {id:'900000001',season:2026,week:6,home_id:'BUF',away_id:'KC',kickoff:when(-9),status:'final',home_score:24,away_score:20,winner_id:'BUF'},
 {id:'900000002',season:2026,week:6,home_id:'DAL',away_id:'SEA',kickoff:when(-8),status:'final',home_score:10,away_score:21,winner_id:'SEA'},
 {id:'900000003',season:2026,week:6,home_id:'GB',away_id:'DET',kickoff:when(-7),status:'tie',home_score:17,away_score:17,winner_id:null},
 {id:'900000004',season:2026,week:7,home_id:'SF',away_id:'LAR',kickoff:when(-1),status:'final',home_score:31,away_score:10,winner_id:'SF'},
 {id:'900000005',season:2026,week:7,home_id:'NYG',away_id:'WAS',kickoff:when(1),status:'scheduled',home_score:null,away_score:null,winner_id:null},
 {id:'900000006',season:2026,week:7,home_id:'BAL',away_id:'PIT',kickoff:when(3),status:'scheduled',home_score:null,away_score:null,winner_id:null},
 {id:'900000007',season:2026,week:8,home_id:'NE',away_id:'CHI',kickoff:when(8),status:'scheduled',home_score:null,away_score:null,winner_id:null}
];
const picks=[
 {game_id:'900000001',team_id:'BUF',awarded_points:4,settled_at:when(-8)},
 {game_id:'900000002',team_id:'DAL',awarded_points:0,settled_at:when(-7)},
 {game_id:'900000003',team_id:'GB',awarded_points:0,settled_at:when(-6)},
 {game_id:'900000004',team_id:'SF',awarded_points:5,settled_at:when(-1)},
 {game_id:'900000005',team_id:'NYG',awarded_points:0,settled_at:null}
];
async function run(){
 const browser=await chromium.launch({headless:true});
 try{
  for(const width of [320,375,1280]){
   for(const night of [false,true]){
    const page=await browser.newPage({viewport:{width,height:820}});
    const doc='<html class="'+(night?'dark':'')+'"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+
     fs.readFileSync('assets/ae-profile-tabs-picks.css','utf8')+css+'</style><style>'+
     '#camNflProfile{--nfl-ink:#eddcc5;--nfl-muted:#adabb0;--nfl-paper:#0e2434;--nfl-card:#152f40;--nfl-edge:#856e50;--nfl-accent:#c4a06d}'+
     'html:not(.dark) #camNflProfile{--nfl-ink:#233546;--nfl-muted:#4e6170;--nfl-paper:#f5f0e5;--nfl-card:#fffaf1;--nfl-edge:#b6a286;--nfl-accent:#84623a}'+
     'body{margin:0}#aeProfileDialog{box-sizing:border-box;width:min(100%,760px);border:0;padding:0;position:static;max-width:100%}</style></head><body>'+
     '<dialog id="aeProfileDialog" open><nav id="aeProfileTabs" class="ae-profile-tabs">'+
     '<button id="aeProfileTabTakes">Mis Takes</button><button id="aeProfileTabPicks">Mis Picks</button>'+
     '<button id="aeProfileTabQuiniela" class="is-active" aria-selected="true">Mi Quiniela</button></nav>'+
     '<section id="camNflProfile" role="tabpanel" aria-labelledby="aeProfileTabQuiniela"></section></dialog></body></html>';
    await page.setContent(doc);
    await page.addScriptTag({content:fs.readFileSync('assets/nfl-teams.js','utf8')});
    await page.evaluate(({games,picks})=>{
      window.__calls=[];
      const result=(data)=>Promise.resolve({data,error:null});
      window.db={
        from(table){
          const query={season:null,user:null,ids:null};
          const operations={
            select(){return this;},order(){return this;},limit(){return this;},
            eq(key,value){if(key==='user_id')query.user=value;if(key==='season')query.season=value;return this;},
            in(key,value){if(key==='game_id')query.ids=value;return this;},
            then(resolve,reject){
              window.__calls.push({table,query:{...query}});
              let rows=table==='cam_nfl_games'?games:picks;
              if(query.ids)rows=rows.filter(p=>query.ids.includes(p.game_id));
              return result(rows).then(resolve,reject);
            }
          };
          return operations;
        },
        rpc(name,args){
          window.__calls.push({name,args});
          if(name!=='cam_nfl_public_pick_breakdown')throw Error('Unexpected profile RPC: '+name);
          const visible=picks.filter(p=>p.settled_at&&games.some(g=>g.id===p.game_id&&['final','tie','cancelled'].includes(g.status)));
          return result(visible);
        }
      };
    },{games,picks});
    await page.addScriptTag({content:script});
    await page.evaluate(id=>window.camNflProfile.open(id,true),UUID);
    await page.waitForSelector('#camNflProfileHistory .cam-profile-quiniela-week');
    const order=await page.locator('#camNflProfile > section').evaluateAll(nodes=>nodes.map(n=>n.id));
    assert.deepEqual(order,['camNflProfileCurrent','camNflProfileGeneral','camNflProfileHistory']);
    const cur=await page.locator('#camNflProfileCurrent').innerText();
    assert.match(cur,/Semana 7/);assert.match(cur,/Seleccionados/);
    const currentStats=await page.locator('#camNflProfileCurrent .cam-profile-quiniela-stat strong').allTextContents();
    assert.deepEqual(currentStats,['3','2','1','1','0','1']);
    const general=await page.locator('#camNflProfileGeneral .cam-profile-quiniela-stat strong').allTextContents();
    assert.deepEqual(general,['2','5','2','1','1','67 %','9']);
    const first=page.locator('#camNflProfileHistory details').first();
    await first.locator('summary').click();
    assert.match(await first.innerText(),/Semana 6/);
    assert.equal(await first.locator('.cam-profile-quiniela-match').count(),3);
    assert.equal(await first.locator('img').count(),6,'Both original team logos appear per game');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,
      'Profile cannot overflow horizontally at '+width);
    await page.evaluate(()=>window.camNflProfile.open('22222222-2222-4222-8222-222222222222',false));
    await page.waitForFunction(()=>document.querySelector('#camNflProfileGeneral')?.textContent.includes('Pronósticos'));
    const generalPublic=await page.locator('#camNflProfileGeneral .cam-profile-quiniela-stat strong').allTextContents();
    assert.deepEqual(generalPublic,['2','4','2','1','—','67 %','9']);
    const publicCurrent=await page.locator('#camNflProfileCurrent').innerText();
    assert.match(publicCurrent,/Por privacidad/);
    assert.doesNotMatch(publicCurrent,/NYG|New York Giants/);
    const queries=await page.evaluate(()=>window.__calls);
    assert.ok(queries.some(q=>q.name==='cam_nfl_public_pick_breakdown'));
    assert.equal(queries.filter(q=>q.table==='cam_nfl_picks'&&q.query.user!=='11111111-1111-4111-8111-111111111111').length,0,
      'Never query another user directly');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    await page.close();
   }
  }
 }finally{await browser.close();}
 console.log('PASS: Mi Quiniela profile ordering, week stats, historical logos, secure public profiles, 320/375/1280, day/night.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
