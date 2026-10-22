import assert from 'node:assert/strict';
import {readTicketModel} from '../supabase/functions/ae-read-ticket/retry-model.ts';
async function scenario(statuses, names=['flash-a','flash-b','lite-a','lite-b','lite-c','lite-d','lite-e']) {
 const calls=[],delays=[];let discovery=0;
 const result=await readTicketModel({preferred:'flash-primary',call:async name=>{calls.push(name);return new Response(null,{status:statuses.shift()??503});},listModels:async()=>{discovery++;return names;},pause:async ms=>delays.push(ms)});
 return {...result,calls,delays,discovery};
}
// Overloaded preferred model: move to another model at once, never wait on the same one.
let r=await scenario([503,200]);assert.deepEqual(r.calls,['flash-primary','flash-a']);assert.equal(r.response.status,200);assert.equal(r.model,'flash-a');assert.ok(r.delays[0]<1000);
// Retired (404) and no-quota (429) models are skipped, the next working one answers.
r=await scenario([503,404,429,503,200]);assert.deepEqual(r.calls,['flash-primary','flash-a','flash-b','lite-a','lite-b']);assert.equal(r.response.status,200);assert.equal(r.discovery,1);
// Bounded: at most six different models, then the last failure is returned.
r=await scenario([]);assert.equal(r.calls.length,6);assert.equal(new Set(r.calls).size,6);assert.equal(r.response.status,503);
// Invalid or unauthorized requests are never retried.
for(const status of [400,401,403]){r=await scenario([status]);assert.deepEqual(r.calls,['flash-primary']);assert.equal(r.discovery,0);}
// Success on the first try needs no model discovery.
r=await scenario([200]);assert.deepEqual(r.calls,['flash-primary']);assert.equal(r.discovery,0);
// The preferred model is not repeated when the list also contains it.
r=await scenario([503,200],['flash-primary','flash-a']);assert.deepEqual(r.calls,['flash-primary','flash-a']);
// Time budget: stop calling once it is spent.
{let t=0;const calls=[];const res=await readTicketModel({preferred:'p',budgetMs:1000,now:()=>t,pause:async()=>{},listModels:async()=>['a','b','c'],call:async(n)=>{calls.push(n);t+=600;return new Response(null,{status:503});}});assert.deepEqual(calls,['p','a']);assert.equal(res.response.status,503);}
console.log('PASS: overload and timeout failover across different models, retired/no-quota models skipped, bounded calls and time, no retry for invalid/auth requests.');
