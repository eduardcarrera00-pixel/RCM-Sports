import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/cam-football-sync/index.ts','utf8')
 .replace(/import \{ createClient \} from "npm:[^"]+";/,''));
const kickoff=new Date(Date.now()+86400000).toISOString();
const base={competition:'laliga',status:'scheduled',odds_locked_at:null,home_id:'1',away_id:'2',kickoff};
const market=[{home_team:'Alpha',away_team:'Beta',commence_time:kickoff,bookmakers:[{key:'verified',markets:[{key:'h2h',outcomes:[{name:'Alpha',price:-200},{name:'Draw',price:300},{name:'Beta',price:500}]}]}]}];
function setup({key='',response=market,fail=false,games=[{...base,id:'900000001'}]}={}){
 const calls=[],requests=[];let handler;
 const tables={cam_football_games:structuredClone(games),cam_football_teams:[{id:'1',name:'Alpha',short_name:'Alpha'},{id:'2',name:'Beta',short_name:'Beta'}]};
 const db={from(table){
   let selected=tables[table]||[];
   const query={select(){return query},eq(k,v){selected=selected.filter(r=>r[k]===v);return query},
    is(k,v){selected=selected.filter(r=>r[k]===v);return query},
    gt(k,v){selected=selected.filter(r=>r[k]>v);return query},order(){return query},limit(){return query},
    then(resolve,reject){return Promise.resolve({data:selected,error:null}).then(resolve,reject)}};
   return query;
  },async rpc(name,args){
   calls.push({name,args});assert.equal(name,'cam_football_freeze_points');
   const game=tables.cam_football_games.find(g=>g.id===args.p_game_id);
   if(game.odds_locked_at)return {data:false,error:null};
   game.odds_locked_at=new Date().toISOString();return {data:true,error:null};
  }};
 const context=vm.createContext({createClient:()=>db,Deno:{env:{get:n=>n==='THE_ODDS_API_KEY'?key:''},serve:h=>{handler=h}},
   fetch:async url=>{requests.push(url);if(fail)throw Error('Provider offline');return {ok:true,json:async()=>response}},
   Date,Intl,Map,Set,URL,URLSearchParams,AbortController,Response,setTimeout,clearTimeout,
   console:{warn(){},error(){}}});
 vm.runInContext(source+'\nglobalThis.freeze=freezeOdds;',context);
 return {run:()=>context.freeze(['laliga']),calls,requests,tables,handler};
}
for(const options of [{},{key:'test',fail:true},{key:'test',response:{error:'quota'}},{key:'test',response:[]}]){
 const test=setup(options),result=await test.run();
 assert.equal(result.frozen,1);assert.equal(result.fallback,1);
 assert.deepEqual(structuredClone(test.calls[0].args),{p_game_id:'900000001'});
 await test.run();assert.equal(test.calls.length,1,'Never overwrite published scores');
}
const valid=setup({key:'test'}),result=await valid.run();
assert.equal(result.frozen,1);assert.equal(result.fallback,0);
assert.equal(valid.calls[0].args.p_home,-200);assert.equal(valid.calls[0].args.p_draw,300);assert.equal(valid.calls[0].args.p_away,500);
const incomplete=structuredClone(market);incomplete[0].bookmakers[0].markets[0].outcomes.pop();
assert.equal((await setup({key:'test',response:incomplete}).run()).fallback,1,'Two-way market cannot price 1X2');
assert.equal((await setup({key:'test',response:[...market,...market]}).run()).fallback,1,'Ambiguous matches use base points');
const missing=setup({key:'test',games:[{...base,id:'900000001',home_id:'unknown'}]});
assert.equal((await missing.run()).fallback,1,'Missing provider names do not block scoring');
const empty=setup({key:'test',games:[]});await empty.run();assert.equal(empty.requests.length,0,'No provider spend without pending games');
const unauthorized=setup();const denial=await unauthorized.handler(new Request('https://example.test',{method:'POST',body:'{}'}));
assert.equal(denial.status,401);assert.equal(unauthorized.calls.length,0,'Public caller cannot synchronize');
console.log('PASS: automatic sync with real 1X2 markets, missing key, provider failure, malformed/missing/ambiguous markets, retries, request budget and authentication.');
