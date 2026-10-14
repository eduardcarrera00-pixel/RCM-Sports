import assert from 'node:assert/strict';
let handler;const env={AE_CRON_SECRET:'fixture-secret',SGO_API_KEY:'fixture-provider',SUPABASE_URL:'https://database.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',AE_PROVIDER_APPROVED:'true',AE_BOOK_RULES_APPROVED:'true'};
globalThis.Deno={env:{get:k=>env[k]},serve:fn=>handler=fn};
await import('../supabase/functions/ae-sync/index.ts');
const original=globalThis.fetch;let network=0,providerCalls=0,ingests=0,settles=0,usage=0,lock=true,rateLimit=false;const logs=[];
const upcoming={eventID:'fixture-upcoming',leagueID:'NFL',type:'match',status:{startsAt:new Date(Date.now()+3600000).toISOString()},teams:{home:{teamID:'H',names:{long:'Home'}},away:{teamID:'A',names:{long:'Away'}}},odds:Object.fromEntries(['home','away'].map(side=>[side,{oddID:'points-home-game-ml-'+side,statID:'points',statEntityID:'home',periodID:'game',betTypeID:'ml',sideID:side,byBookmaker:{draftkings:{available:true,odds:'+150',lastUpdatedAt:new Date().toISOString()}}}]))};
const final={...upcoming,eventID:'fixture-final',status:{startsAt:new Date(Date.now()-3600000).toISOString(),finalized:true},results:{game:{home:{points:10},away:{points:7}}}};
globalThis.fetch=async(url,opts)=>{network++;url=String(url);const data=x=>new Response(JSON.stringify(x),{status:200});
 if(url.startsWith('https://api.sportsgameodds.com/')){providerCalls++;assert.equal(opts.headers['x-api-key'],'fixture-provider');assert.ok(!url.includes('fixture-provider'));if(rateLimit)return new Response('',{status:429});return data({success:true,data:[new URL(url).searchParams.has('eventIDs')?final:upcoming]});}
 assert.ok(url.startsWith('https://database.test/'));assert.equal(opts.headers.apikey,'fixture-service');
 if(url.endsWith('ae_worker_lock'))return data(lock);if(url.endsWith('ae_worker_usage'))return data(usage);
 if(url.endsWith('ae_ingest')){ingests++;return data(null);}if(url.endsWith('ae_settle')){settles++;return data('result-id');}
 if(url.includes('/ae_recheck_queue?'))return data([]);
 if(url.includes('/ae_events?'))return data([{id:'fixture-final'}]);
 if(url.endsWith('/ae_sync_log')){logs.push(JSON.parse(opts.body));return new Response(null,{status:201});}
 throw Error('Unexpected route '+url);
};
const req=(secret='fixture-secret',method='POST')=>new Request('https://worker.test',{method,headers:{'x-ae-cron-secret':secret}});
try{
 assert.equal((await handler(req('bad'))).status,401);assert.equal(network,0);
 assert.equal((await handler(req('fixture-secret','GET'))).status,405);
 env.AE_PROVIDER_APPROVED='false';assert.equal((await handler(req())).status,503);assert.equal(network,0);env.AE_PROVIDER_APPROVED='true';
 assert.equal((await handler(req())).status,200);assert.equal(ingests,2);assert.equal(settles,1);assert.equal(providerCalls,2);assert.equal(logs.at(-1).objects,2);
 lock=false;assert.equal((await handler(req())).status,409);assert.equal(providerCalls,2);lock=true;
 usage=2000;assert.equal((await handler(req())).status,502);assert.equal(providerCalls,2);usage=0;
 rateLimit=true;assert.equal((await handler(req())).status,502);assert.equal(logs.at(-1).status,'error');assert.match(logs.at(-1).detail,/429/);
 assert.ok(!JSON.stringify(logs).includes('fixture-secret'));assert.ok(!JSON.stringify(logs).includes('fixture-provider'));
}finally{globalThis.fetch=original;delete globalThis.Deno;}
console.log('PASS worker with mocked HTTP: unauthorized/config gates, single-book ingestion and final settlement, mutual exclusion, monthly cap, 429 fail-closed, empty POST response, no credentials in logs.');
