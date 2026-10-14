import {normalizeEvent,normalizeResult,fingerprint} from './provider.mjs';
// No frontend-accessible provider proxy. Cron uses a separate random secret.
const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return response(405,{error:'POST required'});
 const secret=Deno.env.get('AE_CRON_SECRET');
 if(!secret||req.headers.get('x-ae-cron-secret')!==secret)return response(401,{error:'Unauthorized'});
 const key=Deno.env.get('SGO_API_KEY'),url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!key||!url||!service||Deno.env.get('AE_PROVIDER_APPROVED')!=='true'||Deno.env.get('AE_BOOK_RULES_APPROVED')!=='true')return response(503,{error:'Provider key, license or bookmaker rules not configured'});
 const monthlyBudget=Number(Deno.env.get('AE_MONTHLY_OBJECT_BUDGET')||'2000');
 if(!Number.isSafeInteger(monthlyBudget)||monthlyBudget<1)return response(503,{error:'Invalid monthly object budget'});
 let remaining=0,objects=0,calls=0;const deadline=Date.now()+100000;
 const budget=()=>{if(Date.now()>deadline)throw Error('Sync time budget exceeded');};
 const api=async(route:string,body?:unknown,methodOverride?:string)=>{
 if(route!=='ae_sync_log')budget();const r=await fetch(url+'/rest/v1/'+route,{method:methodOverride||(body===undefined?'GET':'POST'),headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Database request failed '+r.status);const bodyText=await r.text();return bodyText?JSON.parse(bodyText):null;};
 const rpc=(name:string,body:unknown={})=>api('rpc/'+name,body);
 const log=async(status:string,detail:string)=>{await api('ae_sync_log',{status,objects:status==='review'?0:objects,detail:detail.slice(0,500)}).catch(()=>{});};
 const provider=async(params:Record<string,string>)=>{
 if(remaining<=objects)throw Error('Monthly object budget reached');
 params.limit=String(Math.min(Number(params.limit||100),remaining-objects));
 if(++calls>12||Date.now()>deadline)throw Error('Bounded sync budget exceeded');
 const endpoint=new URL('https://api.sportsgameodds.com/v2/events');Object.entries(params).forEach(([k,v])=>endpoint.searchParams.set(k,v));
 const r=await fetch(endpoint,{headers:{'x-api-key':key},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Provider HTTP '+r.status);const j=await r.json();if(j.success!==true||!Array.isArray(j.data))throw Error('Invalid provider response');objects+=j.data.length;return j;};
 try{
 if(!await rpc('ae_worker_lock'))return response(409,{error:'Sync already running'});
 remaining=monthlyBudget-Number(await rpc('ae_worker_usage'));
 // Recheck recent finals as well as all unresolved events, so corrections compensate points.
 const queue=await api('ae_recheck_queue?select=event_id,requested_at&order=requested_at.asc&limit=50');
 const recent=await api('ae_events?select=id,status&starts_at=lte.'+encodeURIComponent(new Date().toISOString())+'&or='+encodeURIComponent('(status.neq.FINAL,starts_at.gte.'+new Date(Date.now()-7*86400000).toISOString()+')')+'&order=verified_at.asc&limit=500');
 const events=[...new Map([...queue.map((q:{event_id:string})=>({id:q.event_id})),...recent].map((e:{id:string})=>[e.id,e])).values()] as {id:string}[];
 for(let i=0;i<events.length;i+=100){const j=await provider({eventIDs:events.slice(i,i+100).map((e:{id:string})=>e.id).join(','),limit:'100',expandResults:'true'});
 for(const raw of j.data){try{
 const normalized=normalizeEvent(raw);await rpc('ae_ingest',{p_event:normalized.event,p_offers:[],p_version:await fingerprint(normalized.event)});
 const r=normalizeResult(raw);await rpc('ae_settle',{p_event:r.event.id,p_version:await fingerprint(r.evidence),p_period:r.period,p_home_id:r.event.home_id,p_away_id:r.event.away_id,p_home:r.home,p_away:r.away,p_state:r.state,p_evidence:r.evidence});
 const queued=queue.find((q:{event_id:string})=>q.event_id===r.event.id);if(queued)await api('ae_recheck_queue?event_id=eq.'+encodeURIComponent(r.event.id)+'&requested_at=eq.'+encodeURIComponent(queued.requested_at),undefined,'DELETE');
 }catch(e){await log('review',raw.eventID+': '+(e as Error).message);}}
 }
 // Upcoming games: pagination is bounded; missing events become stale automatically.
 let cursor:string|undefined;
 for(let page=0;page<4;page++){
 const j=await provider({leagueID:'NFL,UEFA_CHAMPIONS_LEAGUE',bookmakerID:'draftkings',type:'match',startsAfter:new Date().toISOString(),startsBefore:new Date(Date.now()+48*3600000).toISOString(),limit:'100',...(cursor?{cursor}:{})});
 for(const raw of j.data){try{const parsed=normalizeEvent(raw);await rpc('ae_ingest',{p_event:parsed.event,p_offers:parsed.offers,p_version:await fingerprint({event:parsed.event,offers:parsed.offers})});if(parsed.issue)await log('review',raw.eventID+': '+parsed.issue);}catch(e){await log('review',String((e as Error).message));}}
 cursor=j.nextCursor;if(!cursor)break;
 }
 await log('ok',`requests=${calls}; returned objects=${objects}`);return response(200,{ok:true,objects,calls});
 }catch(e){await log('error',(e as Error).message);return response(502,{error:(e as Error).message,objects,calls});}
});
