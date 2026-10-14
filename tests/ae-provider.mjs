import assert from 'node:assert/strict';
import {normalizeEvent,normalizeResult,fingerprint} from '../supabase/functions/ae-sync/provider.mjs';
const now=Date.now();
function event(leagueID='NFL'){
 const period=leagueID==='NFL'?'game':'reg',market=leagueID==='NFL'?'ml':'ml3way';
 return {eventID:'official-event-fixture',leagueID,type:'match',status:{startsAt:new Date(now+3600000).toISOString(),started:false,finalized:false},teams:{home:{teamID:'HOME',names:{long:'Home fixture'}},away:{teamID:'AWAY',names:{long:'Away fixture'}}},odds:Object.fromEntries((leagueID==='NFL'?['home','away']:['home','draw','away']).map(side=>[side,{oddID:`points-${side}-${period}-${market}-${side}`,statID:'points',statEntityID:'home',periodID:period,betTypeID:market,sideID:side,byBookmaker:{draftkings:{odds:'+150',available:true,lastUpdatedAt:new Date(now).toISOString()}}}]))};
}
for(const league of ['NFL','UEFA_CHAMPIONS_LEAGUE']){const e=event(league);assert.equal(normalizeEvent(e,now).offers.length,league==='NFL'?2:3);e.odds.home.bookOdds='+900';delete e.odds.home.byBookmaker.draftkings;assert.equal(normalizeEvent(e,now).offers.length,0);}
for(const invalid of ['0','-99','abc','150.5','2147483648']){const e=event();e.odds.home.byBookmaker.draftkings.odds=invalid;assert.equal(normalizeEvent(e,now).offers.length,0);}
for(const mutate of [e=>e.odds.home.byBookmaker.draftkings.available=false,e=>e.odds.home.byBookmaker.draftkings.lastUpdatedAt=new Date(now-21*60000).toISOString(),e=>e.odds.home.periodID='reg',e=>e.odds.copy=structuredClone(e.odds.home),e=>e.odds.home.playerID='PLAYER']){const e=event();mutate(e);assert.equal(normalizeEvent(e,now).offers.length,0);}
const nfl=event();nfl.status.finalized=true;nfl.status.startsAt=new Date(now-3600000).toISOString();nfl.results={game:{home:{points:24},away:{points:21}}};assert.equal(normalizeResult(nfl).home,24);
const ucl=event('UEFA_CHAMPIONS_LEAGUE');ucl.status.finalized=true;ucl.results={game:{home:{points:3},away:{points:2}},reg:{home:{points:1},away:{points:1}}};assert.equal(normalizeResult(ucl).home,1);assert.equal(normalizeResult(ucl).period,'reg');delete ucl.results.reg;assert.throws(()=>normalizeResult(ucl),/review/);
for(const mutate of [e=>e.status.finalized=false,e=>e.status.cancelled=true,e=>e.status.delayed=true,e=>e.results.game.home.points=null,e=>e.results.game.home.points=-1]){const e=structuredClone(nfl);mutate(e);assert.throws(()=>normalizeResult(e),/review/);}
assert.equal(await fingerprint({a:1}),await fingerprint({a:1}));assert.notEqual(await fingerprint({a:1}),await fingerprint({a:2}));
console.log('PASS provider adapter: single book/no consensus fallback, NFL/UCL periods, quote freshness/validity, ambiguous/missing markets, final-only scores, no regulation fallback, cancellations pending, stable fingerprints.');
