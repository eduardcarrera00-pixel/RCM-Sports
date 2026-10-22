import assert from 'node:assert/strict';
import {readTicketModel} from '../supabase/functions/ae-read-ticket/retry-model.ts';
async function scenario(statuses, expected, names=['flash-next','flash-lite']) {
 const calls=[],delays=[];let discovery=0;
 const result=await readTicketModel({preferred:'flash-primary',call:async name=>{calls.push(name);return new Response(null,{status:statuses.shift()});},listModels:async()=>{discovery++;return names;},pause:async ms=>delays.push(ms)});
 assert.deepEqual(calls,expected);return {...result,delays,discovery};
}
let r=await scenario([503,200],['flash-primary','flash-primary']);assert.equal(r.response.status,200);assert.equal(r.discovery,0);assert.ok(r.delays[0]>=1000&&r.delays[0]<1250);
r=await scenario([503,503,200],['flash-primary','flash-primary','flash-next']);assert.equal(r.model,'flash-next');assert.ok(r.delays[1]>=2000&&r.delays[1]<2250);
r=await scenario([503,503,503,200],['flash-primary','flash-primary','flash-next','flash-lite']);assert.equal(r.model,'flash-lite');assert.equal(r.discovery,1);assert.ok(r.delays[2]>=4000&&r.delays[2]<4250);
r=await scenario([503,503,503,503],['flash-primary','flash-primary','flash-next','flash-lite']);assert.equal(r.response.status,503);
r=await scenario([503,503,503,503],['flash-primary','flash-primary','flash-next','flash-next'],['flash-next']);assert.equal(r.response.status,503);
for(const status of [400,401,403]){r=await scenario([status],['flash-primary']);assert.equal(r.delays.length,0);assert.equal(r.discovery,0);}
r=await scenario([404,200],['flash-primary','flash-next']);assert.equal(r.response.status,200);
r=await scenario([429,429,429,429],['flash-primary','flash-primary','flash-next','flash-lite']);assert.equal(r.response.status,429);
console.log('PASS: provider overload retries, model failover, retired model recovery, bounded failure, no retry for invalid/auth requests.');
