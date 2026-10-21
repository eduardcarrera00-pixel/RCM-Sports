import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {readTicketModel} from '../supabase/functions/ae-read-ticket/retry-model.ts';
let handler, answer, writes=[];
const query=()=>({select(){return this;},eq(){return this;},gte(){return this;},order(){return this;},limit(){return this;},insert(value){writes.push(value);return this;},single:async()=>({data:{id:'read-proof'}}),then(resolve){resolve({data:[],count:0});}});
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/ae-read-ticket/index.ts','utf8').replace(/^import .*;\n/gm,''));
const context={console,Response,Request,AbortSignal,readTicketModel,Date,setTimeout,
 Deno:{env:{get:key=>({GEMINI_API_KEY:'test',SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'})[key]},serve:fn=>handler=fn},
 createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'test-reader'}}})},from:query}),
 fetch:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(answer)}]}}]}))};
vm.runInNewContext(source,context);
const read=async data=>{answer=data;writes=[];const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{origin:'https://camsports.github.io',authorization:'Bearer test'},body:JSON.stringify({images:['data:image/jpeg;base64,AA==']})}));assert.equal(response.status,200);return response.json();};
const decimals=[2.05,1.95,2.25,2.15,2,2,2.05,2.05,2.25];
const legs=decimals.map((decimal_odds,i)=>({sport:'Fútbol',event:`Team ${i} vs Opponent ${i}`,selection:`Player ${i} 1+ remates a puerta + Más de 2 goles`,decimal_odds,event_date:'2026-10-21'}));
let r=await read({is_bet_slip:true,problem:'',bets:[{selections:legs}]});
assert.equal(r.ok,true);assert.equal(r.singles,undefined);assert.equal(r.readings.length,1);assert.equal(r.readings[0].selectionCount,9);
assert.equal(r.readings[0].odds,Math.round((decimals.reduce((p,d)=>p*d,1)-1)*100));
for(let i=0;i<9;i++)assert.ok(r.readings[0].selection.includes(`Player ${i}`));
assert.equal(r.eventDate,'2026-10-21');assert.equal(JSON.stringify(writes).includes('data:image'),false);
r=await read({is_bet_slip:true,problem:'',already_started:true,bets:[{selections:legs,total_decimal_odds:10.32}]});assert.equal(r.ok,false);assert.match(r.reason,/empezaron|terminaron/);
r=await read({is_bet_slip:true,problem:'',bets:[{selections:[{...legs[0],decimal_odds:null}]}]});assert.equal(r.ok,false);assert.match(r.reason,/momio/);
console.log('PASS: full reader handler combines nine priced groups as one Pick, preserves exact decimals and conditions, rejects started/unpriced tickets, retains no image.');
