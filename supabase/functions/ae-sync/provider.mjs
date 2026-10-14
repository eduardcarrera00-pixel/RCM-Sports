// Pure adapter; only documented bookmaker-specific fields are used.
export const BOOKMAKER='draftkings';
const MAP={NFL:{competition:'NFL',period:'game',market:'ml',sides:['home','away']},UEFA_CHAMPIONS_LEAGUE:{competition:'UCL',period:'reg',market:'ml3way',sides:['home','draw','away']}};
function required(value,label){if(typeof value!=='string'||!value.trim())throw Error('Missing '+label);return value;}
export function normalizeEvent(raw,now=Date.now()){
 const rule=MAP[raw.leagueID];if(!rule||raw.type!=='match')throw Error('Unsupported event');
 const start=required(raw.status?.startsAt,'startsAt');if(!Number.isFinite(Date.parse(start)))throw Error('Invalid startsAt');
 const event={id:required(raw.eventID,'eventID'),competition:rule.competition,home_id:required(raw.teams?.home?.teamID,'home teamID'),away_id:required(raw.teams?.away?.teamID,'away teamID'),home:required(raw.teams?.home?.names?.long,'home name'),away:required(raw.teams?.away?.names?.long,'away name'),starts_at:start,status:raw.status?.cancelled||raw.status?.delayed?'UNDER_REVIEW':raw.status?.finalized?'FINAL':raw.status?.started||Date.parse(start)<=now?'CLOSED':'OPEN'};
 const offers=[];
 for(const side of rule.sides){
 const candidates=Object.values(raw.odds||{}).filter(o=>o.statID==='points'&&o.periodID===rule.period&&o.betTypeID===rule.market&&o.sideID===side&&!o.playerID&&['home','away','all'].includes(o.statEntityID));
 if(candidates.length!==1)return {event,offers:[],issue:'Missing or ambiguous '+side+' market'};
 const odd=candidates[0],book=odd.byBookmaker?.[BOOKMAKER];
 if(!book||book.available!==true||odd.started||odd.cancelled||odd.ended)return {event,offers:[],issue:'Bookmaker market unavailable'};
 const american=Number(book.odds),stamp=Date.parse(book.lastUpdatedAt);
 if(!Number.isSafeInteger(american)||Math.abs(american)<100||Math.abs(american)>2147483647||!Number.isFinite(stamp)||stamp<now-20*60000||stamp>now+60000)return {event,offers:[],issue:'Stale or invalid bookmaker quote'};
 offers.push({selection:side,odd_id:required(odd.oddID,'oddID'),period:rule.period,market:rule.market,american,bookmaker:BOOKMAKER,provider_updated_at:new Date(stamp).toISOString(),available:true});
 }
 return {event,offers};
}
export function normalizeResult(raw){
 const rule=MAP[raw.leagueID];if(!rule||raw.type!=='match')throw Error('Unsupported result');
 const e=normalizeEvent({...raw,odds:{}}).event;
 const scores=raw.results?.[rule.period];
 // Never infer regulation scores from full game or missing segments.
 const h=scores?.home?.points,a=scores?.away?.points;
 const validScore=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isSafeInteger(Number(x))&&Number(x)>=0;
 if(raw.status?.finalized!==true||raw.status?.cancelled||raw.status?.delayed||!validScore(h)||!validScore(a))throw Error('Result requires review: no final scores for '+rule.period);
 return {event:e,period:rule.period,home:Number(h),away:Number(a),state:'FINAL',evidence:{provider:'sportsgameodds',eventID:e.id,leagueID:raw.leagueID,finalized:true,period:rule.period,home_id:e.home_id,away_id:e.away_id,home:Number(h),away:Number(a)}};
}
export async function fingerprint(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');}
