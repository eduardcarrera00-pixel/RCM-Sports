// CAM SPORTS | NFL Autopilot. Cron-only; never accept unsigned public invocations.
// Activates only when Supabase server secrets + cam_nfl_automation_control.enabled are configured.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET = Deno.env.get("CAM_NFL_CRON_SECRET") || "";
const SPORTS_KEY = Deno.env.get("SPORTSDATAIO_API_KEY") || "";
const ODDS_KEY = Deno.env.get("THE_ODDS_API_KEY") || "";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
type Phase = "PRE" | "REG" | "POST";
type Week = { season:number; phase:Phase; week:number };
type Result = { id:string; status:string; home_score:number|null; away_score:number|null; winner_id:string|null };
const aliases: Record<string,string> = {
  JAC:"JAX", WSH:"WAS", ARZ:"ARI", ARI:"ARI", LA:"LAR", STL:"LAR",
  SD:"LAC", OAK:"LV", NWE:"NE", NOS:"NO", GNB:"GB", SFO:"SF",
  TAM:"TB", KAN:"KC", LVR:"LV"
};
const normalize = (s:unknown) => String(s ?? "").normalize("NFKD")
 .replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const safeTeam=(s:unknown)=> { const t=String(s??"").toUpperCase().trim(); return aliases[t]||t; };
const finite=(value:unknown) => value!==null && value!==undefined && value!=="" && Number.isFinite(Number(value)) ? Number(value) : null;
const validOdd=(v:unknown)=>Number.isInteger(v) && Math.abs(Number(v))>=100 && Math.abs(Number(v))<=10000;
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const lockCompare=(a:string,b:string)=>{
  if(!a || !b || a.length!==b.length)return false;
  let out=0;for(let i=0;i<a.length;i++)out|=a.charCodeAt(i)^b.charCodeAt(i);
  return out===0;
};
const requireData=<T>(result:{data:T;error:any}):T=>{
  if(result.error)throw new Error(result.error.message||"Database operation failed");
  return result.data;
};
async function requestJSON(url:string,headers:Record<string,string>={}):Promise<any>{
  for(let retry=0;retry<3;retry++){
    const abort=new AbortController();
    const timer=setTimeout(()=>abort.abort(),12000);
    try{
      const response=await fetch(url,{signal:abort.signal,headers});
      if(!response.ok){
        if((response.status===429||response.status>=500)&&retry<2){
          await new Promise(r=>setTimeout(r,800*Math.pow(2,retry)));continue;
        }
        throw new Error("Sports feed HTTP "+response.status);
      }
      return await response.json();
    }finally{clearTimeout(timer);}
  }
  throw new Error("Provider retry budget reached");
}
const sports=(suffix:string)=>requestJSON(
  "https://api.sportsdata.io/v3/nfl/scores/json/"+suffix,
  {"Ocp-Apim-Subscription-Key":SPORTS_KEY}
);
function phaseOf(row:any):Phase|null{
  const phase=String(row?.SeasonType??row?.seasonType??row?.Type??row?.type??"").toUpperCase();
  if(["1","PRE","PRESEASON"].includes(phase))return "PRE";
  if(["2","REG","REGULAR","REGULARSEASON"].includes(phase))return "REG";
  if(["3","POST","POSTSEASON","PLAYOFFS"].includes(phase))return "POST";
  return null;
}
function dateUTC(value:unknown):string{
  const str=String(value||"");
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str))throw Error("Provider kickoff has no UTC datetime");
  const iso=/Z$|[+-]\d{2}:\d{2}$/.test(str)?str:str+"Z";
  const d=new Date(iso);if(!Number.isFinite(d.getTime()))throw Error("Invalid UTC kickoff");
  return d.toISOString();
}
function externalId(row:any):string{
  const value=String(row?.GameID??"");
  if(!/^\d{1,15}$/.test(value))throw Error("Missing valid GameID");
  // Reserved 16-digit prefix avoids collisions with existing ESPN game identifiers.
  return "9"+value.padStart(15,"0");
}
function statusOf(row:any):string {
  const raw=String(row?.Status??"").toLowerCase().replace(/[^a-z]/g,"");
  if(raw.includes("cancel")||raw.includes("nocontest"))return "cancelled";
  if(raw.includes("postpon")||raw.includes("suspend"))return "postponed";
  if(["final","f","fot","finalot","finalovertime","completed"].includes(raw))return "final";
  if(["inprogress","live","halftime","ingame","overtime"].includes(raw))return "live";
  return "scheduled";
}
function normalizeScore(row:any,home_id:string,away_id:string):Result{
  let status=statusOf(row);
  const hs=finite(row.HomeScore),as=finite(row.AwayScore);
  if(status==="final"&&(hs===null||as===null||hs<0||as<0||
    !Number.isInteger(hs)||!Number.isInteger(as)))throw Error("Final lacks confirmed integer score");
  if(status==="final"&&hs===as)status="tie";
  return {
    id:externalId(row),status,
    home_score:["final","tie"].includes(status)?hs:null,
    away_score:["final","tie"].includes(status)?as:null,
    winner_id:status==="final"?(hs!>as!?home_id:away_id):null
  };
}
async function currentWeeks():Promise<Week[]>{
  const [seasonVal,weekVal,tf]=await Promise.all([
    sports("CurrentSeason"),sports("CurrentWeek"),sports("Timeframes/current")
  ]);
  const season=Number(seasonVal),week=Number(weekVal);
  const rows=Array.isArray(tf)?tf:tf?[tf]:[];
  // Use official season, phase and week simultaneously; never infer postseason from dates.
  const matching=rows.find((row:any)=>Number(row.Season??row.season)===season &&
    Number(row.Week??row.week)===week && phaseOf(row));
  const phase=matching?phaseOf(matching):null;
  if(!Number.isInteger(season)||season<2020||season>2100||
    !Number.isInteger(week)||week<1||week>22||!phase)
    throw Error("No verified official NFL season/phase/week. Week not changed.");
  const max=phase==="REG"?18:phase==="POST"?5:4;
  const current:[Week]=[{season,phase,week}];
  const entries=[week-1,week+1].filter(w=>w>=1&&w<=max).map(w=>({season,phase,week:w}));
  return [...current,...entries].sort((a,b)=>a.week-b.week);
}
async function catalog():Promise<Map<string,{name:string}>>{
  const data=requireData(await db.from("nfl_teams").select("id,name"));
  return new Map((data||[]).map((row:any)=>[String(row.id),{name:String(row.name)}]));
}
const assertPair=(row:any,catalog:Map<string,any>)=>{
  const home=safeTeam(row.HomeTeam),away=safeTeam(row.AwayTeam);
  if(!catalog.has(home)||!catalog.has(away)||home===away)
    throw Error("Unknown/ambiguous team in official NFL fixture");
  return {home,away};
};
async function updateFixture(row:any,w:Week,teams:Map<string,any>){
  const {home,away}=assertPair(row,teams),id=externalId(row),kickoff=dateUTC(row.DateTimeUTC);
  const previous=requireData(await db.from("cam_nfl_games")
    .select("id,home_id,away_id,season,week,phase,odds_locked_at,status,kickoff,picks_open")
    .eq("id",id).maybeSingle());
  if(previous && (previous.home_id!==home||previous.away_id!==away||
    previous.season!==w.season||previous.week!==w.week||previous.phase!==w.phase))
    throw Error("Source changed team/week for existing NFL game "+id+": admin review required");
  const result=normalizeScore(row,home,away);
  if(previous && ["final","tie","cancelled"].includes(previous.status) &&
    ["scheduled","live","postponed"].includes(result.status))return;
  const record:any={
    id,season:w.season,week:w.week,phase:w.phase,
    home_id:home,away_id:away,kickoff,
    status:result.status,home_score:result.home_score,away_score:result.away_score,
    winner_id:result.winner_id,
    schedule_provider:"sportsdataio",external_game_id:String(row.GameID),
    last_synced_at:new Date().toISOString()
  };
  // A reschedule must not silently restore a locked game to an editable state.
  if(result.status!=="scheduled" ||
    (previous && (previous.status!=="scheduled" ||
    new Date(previous.kickoff).getTime()<=Date.now())))
    record.picks_open=false;
  requireData(await db.from("cam_nfl_games").upsert(record,{onConflict:"id"}));
}
async function setWeekError(w:Week,message:string){
  const record:any={season:w.season,phase:w.phase,week:w.week,
    schedule_provider:"sportsdataio",last_attempt_at:new Date().toISOString(),
    last_error:message.slice(0,450)};
  const previous=requireData(await db.from("cam_nfl_week_state")
    .select("status").eq("season",w.season).eq("phase",w.phase).eq("week",w.week).maybeSingle());
  if(!previous||!["open","in_progress","closed"].includes(previous.status))
    record.status="sync_pending";
  requireData(await db.from("cam_nfl_week_state").upsert(record,{onConflict:"season,phase,week"}));
}
async function scheduleWeek(w:Week,rows:any[],teams:Map<string,any>){
  const games=rows.filter((r:any)=>Number(r.Season)===w.season &&
    Number(r.Week)===w.week && (phaseOf(r)??w.phase)===w.phase);
  if(!games.length)return {week:w,count:0,published:false};
  const ids=new Set<string>(),teamPerGame=new Set<string>();
  for(const g of games){
    const id=externalId(g),{home,away}=assertPair(g,teams);
    if(ids.has(id)||teamPerGame.has(home+"_"+away))throw Error("Duplicate provider fixtures");
    ids.add(id);teamPerGame.add(home+"_"+away);
    dateUTC(g.DateTimeUTC);
  }
  // Preserve a known larger snapshot rather than publishing a truncated provider response.
  const old=requireData(await db.from("cam_nfl_week_state").select("expected_games,status")
   .eq("season",w.season).eq("phase",w.phase).eq("week",w.week).maybeSingle());
  if(old && Number(old.expected_games)>games.length)
    throw Error("Provider returned fewer fixtures than previous verified snapshot");
  if(old && ["open","in_progress","closed"].includes(old.status) &&
    Number(old.expected_games)!==games.length)
    throw Error("Official fixture count changed after round opened: administrator review required");
  for(const row of games)await updateFixture(row,w,teams);
  const existing=requireData(await db.from("cam_nfl_week_state").select("*")
    .eq("season",w.season).eq("phase",w.phase).eq("week",w.week).maybeSingle());
  const now=new Date().toISOString();
  const state:any={season:w.season,phase:w.phase,week:w.week,
    expected_games:games.length,schedule_provider:"sportsdataio",
    last_attempt_at:now,last_success_at:now,last_error:null,updated_at:now};
  if(!existing)state.status="pending";
  requireData(await db.from("cam_nfl_week_state").upsert(state,{onConflict:"season,phase,week"}));
  return {week:w,count:games.length,published:false};
}
async function syncSchedules(weeks:Week[],teams:Map<string,any>){
  const scheduleCache=new Map<string,any[]>();
  const report=[];
  for(const w of weeks){
    const key=w.season+w.phase;
    try{
      if(!scheduleCache.has(key)){
        const feed=await sports("Schedules/"+key);
        if(!Array.isArray(feed))throw Error("Invalid official schedule response");
        scheduleCache.set(key,feed);
      }
      report.push(await scheduleWeek(w,scheduleCache.get(key)!,teams));
    }catch(e){await setWeekError(w,String((e as Error).message||e));throw e;}
  }
  return report;
}
async function currentStoredWeeks():Promise<Week[]>{
  const rows=requireData(await db.from("cam_nfl_week_state")
    .select("season,phase,week,status,last_success_at,closed_at").in("status",["open","in_progress","sync_pending","pending","ready","closed"])
    .order("season",{ascending:false}).limit(30));
  return (rows||[]).filter((w:any)=>w.status!=="closed" ||
      (w.closed_at && Date.now()-Date.parse(w.closed_at)<14*86400000))
    .filter((w:any)=>w.last_success_at || ["open","in_progress"].includes(w.status))
    .map((w:any)=>({season:w.season,phase:w.phase,week:w.week}));
}
async function syncResults(weeks:Week[],teams:Map<string,any>){
  let updates=0;
  for(const w of weeks){
    const scores=await sports("ScoresByWeek/"+w.season+w.phase+"/"+w.week);
    if(!Array.isArray(scores))throw Error("Invalid NFL scores response");
    for(const row of scores){
      const id=externalId(row);
      const old=requireData(await db.from("cam_nfl_games").select("id,home_id,away_id,status,kickoff")
         .eq("id",id).maybeSingle());
      if(!old)continue; // Only score previously verified official fixtures.
      const {home,away}=assertPair(row,teams);
      if(old.home_id!==home||old.away_id!==away)throw Error("Result team mismatch: "+id);
      const result=normalizeScore(row,home,away);
      if(result.status==="scheduled")continue;
      if(["final","tie","cancelled"].includes(old.status)&&
        !["final","tie","cancelled"].includes(result.status))continue;
      const payload:any={...result,picks_open:false,last_synced_at:new Date().toISOString()};
      delete payload.id;
      const updated=requireData(await db.from("cam_nfl_games").update(payload)
        .eq("id",id).select("id"));
      updates+=(updated||[]).length;
    }
    const actual=requireData(await db.from("cam_nfl_games")
      .select("status").eq("season",w.season).eq("phase",w.phase).eq("week",w.week));
    if(!actual?.length)continue;
    const allClosed=actual.every((g:any)=>["final","tie","cancelled"].includes(g.status));
    const someStarted=actual.some((g:any)=>g.status!=="scheduled");
    const state=requireData(await db.from("cam_nfl_week_state")
      .select("status").eq("season",w.season).eq("phase",w.phase).eq("week",w.week).maybeSingle());
    if(state&&["open","in_progress"].includes(state.status)){
      const status=allClosed?"closed":someStarted?"in_progress":"open";
      requireData(await db.from("cam_nfl_week_state").update({
        status,last_success_at:new Date().toISOString(),last_error:null,
        ...(allClosed?{closed_at:new Date().toISOString()}:{})
      }).eq("season",w.season).eq("phase",w.phase).eq("week",w.week));
    }
  }
  return updates;
}
async function freezeMoneylines(teams:Map<string,{name:string}>){
  if(!ODDS_KEY)return {frozen:0,reason:"THE_ODDS_API_KEY missing"};
  const params=new URLSearchParams({regions:"us",markets:"h2h",oddsFormat:"american",apiKey:ODDS_KEY});
  const odds=await requestJSON("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?"+params);
  if(!Array.isArray(odds))throw Error("Invalid h2h odds feed");
  const rows=requireData(await db.from("cam_nfl_games")
    .select("id,home_id,away_id,kickoff,odds_locked_at,status")
    .eq("schedule_provider","sportsdataio").eq("status","scheduled")
    .is("odds_locked_at",null).gt("kickoff",new Date().toISOString()).limit(100));
  let frozen=0;
  for(const game of rows||[]){
    const home=normalize(teams.get(game.home_id)?.name);
    const away=normalize(teams.get(game.away_id)?.name);
    const event=odds.find((o:any)=>normalize(o.home_team)===home &&
      normalize(o.away_team)===away &&
      Math.abs(Date.parse(o.commence_time)-Date.parse(game.kickoff))<18*3600000);
    if(!event)continue;
    const books=(event.bookmakers||[]).filter((b:any)=>{
      const market=(b.markets||[]).find((m:any)=>m.key==="h2h"&&m.outcomes?.length===2);
      return market?.outcomes?.some((o:any)=>normalize(o.name)===home&&validOdd(o.price)) &&
        market?.outcomes?.some((o:any)=>normalize(o.name)===away&&validOdd(o.price));
    });
    if(!books.length)continue;
    const book=books[0],market=book.markets.find((m:any)=>m.key==="h2h");
    const h=market.outcomes.find((o:any)=>normalize(o.name)===home).price;
    const a=market.outcomes.find((o:any)=>normalize(o.name)===away).price;
    const done=requireData(await db.rpc("cam_nfl_freeze_provider_odds",{
      p_game_id:game.id,p_home:h,p_away:a,p_source:"The Odds API: "+String(book.key).slice(0,40)
    }));
    if(done)frozen++;
  }
  return {frozen,offers:odds.length};
}
async function publishWeeks(weeks:Week[]){
  const output=[];
  for(const w of weeks){
    const state=requireData(await db.from("cam_nfl_week_state").select("expected_games,status")
      .eq("season",w.season).eq("phase",w.phase).eq("week",w.week).maybeSingle());
    if(!state||!state.expected_games||!["pending","ready","sync_pending"].includes(state.status))continue;
    const ok=requireData(await db.rpc("cam_nfl_publish_complete_week",{
      p_season:w.season,p_phase:w.phase,p_week:w.week,p_expected:state.expected_games
    }));
    output.push({week:w,opened:!!ok});
  }
  return output;
}
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  if(CRON_SECRET.length<32||!lockCompare(req.headers.get("x-cam-cron")||"",CRON_SECRET))
    return json({error:"Unauthorized"},401);
  let runId:number|null=null;
  try{
    const body=await req.json().catch(()=>({}));
    const mode=body?.mode==="results"?"results":body?.mode==="hourly"?"hourly":null;
    if(!mode)return json({error:"Invalid mode"},400);
    const control=requireData(await db.from("cam_nfl_automation_control")
       .select("enabled,provider").eq("singleton",true).single());
    if(!control.enabled)return json({ok:false,state:"disabled"},503);
    if(control.provider!=="sportsdataio"||!SPORTS_KEY)throw Error("SportsDataIO subscription is not configured");
    const run=requireData(await db.from("cam_nfl_sync_runs")
      .insert({mode}).select("id").single());runId=run.id;
    const teams=await catalog();
    let schedule:any[]=[],odds:any={frozen:0},published:any[]=[];
    let weeks:Week[];
    if(mode==="hourly"){
      weeks=await currentWeeks();
      schedule=await syncSchedules(weeks,teams);
      odds=await freezeMoneylines(teams);
      published=await publishWeeks(weeks);
    }else weeks=await currentStoredWeeks();
    const results=await syncResults(weeks,teams);
    const detail={weeks, schedule, odds, published, results};
    requireData(await db.from("cam_nfl_sync_runs").update({
      finished_at:new Date().toISOString(),ok:true,detail
    }).eq("id",runId));
    return json({ok:true,...detail});
  }catch(error){
    const message=String(error instanceof Error?error.message:error).slice(0,700);
    if(runId!==null)await db.from("cam_nfl_sync_runs").update({
      finished_at:new Date().toISOString(),ok:false,error_text:message
    }).eq("id",runId);
    return json({ok:false,error:message},503);
  }
});
