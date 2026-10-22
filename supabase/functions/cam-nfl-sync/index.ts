// CAM SPORTS · NFL Quiniela synchronization gateway.
// Server-only API: ESPN schedule/results, optional The Odds API moneylines.
// All calls require a verified CAM SPORTS editor or a separately configured cron secret.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const secret = Deno.env.get("CAM_NFL_CRON_SECRET") || "";
const oddsKey = Deno.env.get("THE_ODDS_API_KEY") || "";
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const allowedOrigins = new Set([
  "https://camsports.github.io",
  "https://eduardcarrera00-pixel.github.io",
  "https://aesportsclub.github.io",
]);
const teamsFix: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR" };
const safe = (s: string) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const number = (n: unknown) => n !== null && n !== undefined && typeof n !== "boolean" && String(n).trim() !== "" && Number.isFinite(Number(n)) ? Number(n) : null;
const validOdd = (n: unknown) => Number.isInteger(n) && Math.abs(Number(n)) >= 100 && Math.abs(Number(n)) < 100000;
const implied = (odd: number) => odd > 0 ? 100 / (odd + 100) : -odd / (-odd + 100);
const compare = (a: string, b: string) => {
  if (!a || !b || a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
};
const reply = (data: unknown, status = 200, origin = "") => new Response(JSON.stringify(data), {
  status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://camsports.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cam-cron",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  },
});
async function readJSON(url: string, headers: HeadersInit = {}) {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15000);
  try {
    const res = await fetch(url, { headers, signal: abort.signal });
    if (!res.ok) throw Error("Proveedor devolvió HTTP " + res.status);
    return await res.json();
  } finally { clearTimeout(timeout); }
}
async function authenticate(req: Request) {
  const cronHeader = req.headers.get("x-cam-cron") || "";
  if (cronHeader) {
    // The token lives in Supabase Vault; neither the browser nor GitHub stores it.
    const validation = await db.rpc("cam_nfl_validate_cron", { p_secret: cronHeader });
    if (!validation.error && validation.data === true) return { cron: true, userId: null };
    if (secret && compare(cronHeader, secret)) return { cron: true, userId: null };
  }
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw Error("Autenticación requerida");
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const auth = await client.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Error("Sesión inválida");
  const who = auth.data.user.id;
  const role = await db.from("editors").select("user_id").eq("user_id", who).maybeSingle();
  if (role.error || !role.data) throw Error("Solo administradores");
  return { cron: false, userId: who };
}
function statusOf(e: any, home: any, away: any) {
  const type = e.status?.type || e.competitions?.[0]?.status?.type || {};
  const name = String(type.name || "").toUpperCase();
  if (name.includes("CANCEL")) return "cancelled";
  if (name.includes("POSTPONE")) return "postponed";
  if (type.completed || name.includes("FINAL")) {
    const h = number(home.score), a = number(away.score);
    if (h == null || a == null) return "live";
    return h === a ? "tie" : "final";
  }
  if (type.state === "in" || name.includes("IN_PROGRESS") || name.includes("HALFTIME") || name.includes("END_PERIOD")) return "live";
  return "scheduled";
}
// Postseason 1,2,3,5 map to CAM SPORTS 19,20,21,22; Pro Bowl excluded.
const playoffWeeks: Record<number,number> = { 1:19, 2:20, 3:21, 5:22 };
const espnPlayoffWeek: Record<number,number> = { 19:1, 20:2, 21:3, 22:5 };
async function scoreboard(season?: number, week?: number, seasonType=2) {
  const qs = season && week ? "?season="+season+"&seasontype="+seasonType+"&week="+week : "";
  return await readJSON("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard" + qs);
}
async function syncWeek(season: number, week: number, catalog: Set<string>) {
  const seasonType=week>=19?3:2;
  const apiWeek=seasonType===3?espnPlayoffWeek[week]:week;
  if(!apiWeek)throw Error("Semana NFL inválida");
  const response=await scoreboard(season,apiWeek,seasonType);
  if(Number(response.season?.year)!==season || Number(response.week?.number)!==apiWeek ||
     Number(response.season?.type)!==seasonType)
    throw Error("ESPN no confirmó la temporada, la fase ni la jornada");
  const events = Array.isArray(response.events) ? response.events : [];
  if (!events.length) return { season, week, games: 0, updated: 0 };
  const updates = [];
  for (const event of events) {
    const pair = event.competitions?.[0]?.competitors || [];
    const home = pair.find((t: any) => t.homeAway === "home");
    const away = pair.find((t: any) => t.homeAway === "away");
    const h = teamsFix[home?.team?.abbreviation] || home?.team?.abbreviation;
    const a = teamsFix[away?.team?.abbreviation] || away?.team?.abbreviation;
    if (!/^[0-9]{6,16}$/.test(String(event.id)) || !catalog.has(h) || !catalog.has(a) || h === a ||
      !Number.isFinite(Date.parse(event.date))) {
      throw Error("ESPN entregó un partido con datos incompletos. No se importan partidos inventados.");
    }
    const status = statusOf(event, home, away);
    const hs = number(home.score), as = number(away.score);
    updates.push({
      id: String(event.id), season, week, home_id: h, away_id: a, kickoff: new Date(event.date).toISOString(),
      status, home_score: status === "final" || status === "tie" ? hs : null,
      away_score: status === "final" || status === "tie" ? as : null,
      winner_id: status === "final" ? (hs! > as! ? h : a) : null,
      last_synced_at: new Date().toISOString(),
    });
  }
  // Each update preserves existing frozen odds. Results trigger idempotent points.
  let updated = 0;
  for (const row of updates) {
    const previous = await db.from("cam_nfl_games").select("id,season,week,home_id,away_id,odds_locked_at,status").eq("id",row.id).maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data) {
      if (previous.data.odds_locked_at && (previous.data.home_id !== row.home_id || previous.data.away_id !== row.away_id || previous.data.season !== row.season || previous.data.week !== row.week)) {
        throw Error("Cambio de equipos en partido congelado: requiere revisión " + row.id);
      }
      // Never roll back a final result merely because a provider cache is stale.
      if (["final","tie","cancelled"].includes(previous.data.status) && ["scheduled","live"].includes(row.status)) continue;
    }
    const result = await db.from("cam_nfl_games").upsert(row, { onConflict: "id" });
    if (result.error) throw result.error;
    updated++;
  }
  return { season, week, games: events.length, updated };
}
// nflverse maintains the season schedule, score records and independently sourced moneylines.
// Its licensed, public CSV is a server-side fallback when ESPN rejects cloud IP addresses.
type NflRow = Record<string,string>;
async function readNflverse(): Promise<NflRow[]> {
  const address = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
  const res = await fetch(address, { headers: { "Accept":"text/csv" } });
  if (!res.ok) throw Error("nflverse no disponible (HTTP " + res.status + ")");
  const raw = await res.text();
  const lines = raw.trim().split(/\r?\n/);
  const columns = lines.shift()?.replace(/^\uFEFF/, "").split(",") || [];
  for (const name of ["season","game_type","week","gameday","gametime","home_team","away_team","home_score","away_score","espn","home_moneyline","away_moneyline"]) {
    if (!columns.includes(name)) throw Error("El esquema de nflverse ha cambiado: " + name);
  }
  const current = new Date().getUTCFullYear();
  const result: NflRow[]=[];
  for (const line of lines) {
    const values=line.split(",");
    if (values[columns.indexOf("game_type")]!=="REG") continue;
    const year=Number(values[columns.indexOf("season")]);
    if (year!==current && year!==current-1 && year!==current+1) continue;
    const game: NflRow={};
    for (const name of columns.slice(0, 26)) game[name]=values[columns.indexOf(name)]||"";
    result.push(game);
  }
  if (!result.length) throw Error("nflverse no entregó partidos de temporadas recientes");
  return result;
}
function easternKickoff(date:string,time:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{1,2}:\d{2}$/.test(time)) throw Error("Horario NFL desconocido");
  const [year,month,day]=date.split("-").map(Number),[hour,minute]=time.split(":").map(Number);
  const base=Date.UTC(year,month-1,day,hour,minute);
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(base));
  const val=(name:string)=>Number(parts.find(part=>part.type===name)?.value);
  const offset=Date.UTC(val("year"),val("month")-1,val("day"),val("hour"),val("minute"))-base;
  return new Date(base-offset).toISOString();
}
function currentWeek(rows:NflRow[]) {
  const now=new Date(),year=now.getUTCFullYear()-(now.getUTCMonth()<2?1:0);
  const eligible=rows.filter(r=>Number(r.season)===year&&Number(r.week)>=1&&Number(r.week)<=18);
  if (!eligible.length) throw Error("No hay una temporada regular NFL confirmada");
  const weeks=[...new Set(eligible.map(r=>Number(r.week)))].sort((a,b)=>a-b);
  const active=weeks.find(w=>eligible.some(r=>{
    if(Number(r.week)!==w)return false;
    try{return Date.parse(easternKickoff(r.gameday,r.gametime))+36*3600000>Date.now();}catch{return false;}
  }));
  return {season:year,week:active||weeks[weeks.length-1]};
}
async function syncNflverseWeek(season:number,week:number,catalog:Set<string>,rows:NflRow[]) {
  const events=rows.filter(r=>Number(r.season)===season&&Number(r.week)===week);
  let updated=0,frozen=0;
  for(const event of events) {
    const home=teamsFix[event.home_team]||event.home_team;
    const away=teamsFix[event.away_team]||event.away_team;
    const id=event.espn||event.old_game_id;
    if(!/^[0-9]{6,16}$/.test(id)||!catalog.has(home)||!catalog.has(away)||home===away)
      throw Error("Identificadores NFL sin verificar en "+(event.game_id||"partido"));
    const kickoff=easternKickoff(event.gameday,event.gametime);
    const hs=number(event.home_score),as=number(event.away_score);
    // Only treat posted score records as final after a conservative match-duration window.
    const completed=hs!==null&&as!==null&&Date.now()>Date.parse(kickoff)+4.5*3600000;
    const status=completed?(hs===as?"tie":"final"):(Date.now()>=Date.parse(kickoff)?"live":"scheduled");
    const row:any={
      id,season,week,home_id:home,away_id:away,kickoff,status,
      home_score:completed?hs:null,away_score:completed?as:null,
      winner_id:status==="final"?(hs!>as!?home:away):null,
      last_synced_at:new Date().toISOString()
    };
    const prev=await db.from("cam_nfl_games").select("season,week,home_id,away_id,odds_locked_at,opening_mode,status")
      .eq("id",id).maybeSingle();
    if(prev.error)throw prev.error;
    if(prev.data?.odds_locked_at &&
      (prev.data.home_id!==home||prev.data.away_id!==away||prev.data.season!==season||prev.data.week!==week))
      throw Error("El proveedor cambió los equipos de un partido con pronósticos: "+id);
    if(prev.data&&["final","tie","cancelled"].includes(prev.data.status)&&["scheduled","live"].includes(status))continue;
    const ho=number(event.home_moneyline),ao=number(event.away_moneyline);
    const realOdds=validOdd(ho)&&validOdd(ao)&&Date.parse(kickoff)>Date.now()&&status==="scheduled";
    if(!prev.data?.odds_locked_at&&realOdds) {
      const impliedHome=implied(ho!),impliedAway=implied(ao!);
      const p=Math.round(impliedHome/(impliedHome+impliedAway)*1e6)/1e6, q=1-p;
      Object.assign(row,{odds_home:ho,odds_away:ao,probability_home:p,probability_away:q,
        points_home:Math.max(2,Math.min(12,Math.round(2/p))),
        points_away:Math.max(2,Math.min(12,Math.round(2/q))),
        odds_source:"nflverse: nfldata games.csv",odds_locked_at:new Date().toISOString(),
        picks_open:prev.data?.opening_mode!=="closed"});
    }
    if(status!=="scheduled")row.picks_open=false;
    const saved=await db.from("cam_nfl_games").upsert(row,{onConflict:"id"});
    if(saved.error)throw saved.error;
    updated++;
    if(!prev.data?.odds_locked_at&&realOdds){
      frozen++;
      await db.from("cam_nfl_audit").insert({game_id:id,action:"freeze_odds_auto",
       detail:{provider:"nflverse nfldata",home:ho,away:ao,at:new Date().toISOString()}});
    }
  }
  return {season,week,games:events.length,updated,frozen,source:"nflverse"};
}
async function freezeOdds() {
  if (!oddsKey) return { provider: "Sin THE_ODDS_API_KEY", frozen: 0 };
  const params = new URLSearchParams({apiKey:oddsKey,markets:"h2h",regions:"us",oddsFormat:"american"});
  const odds = await readJSON("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?" + params);
  if (!Array.isArray(odds)) throw Error("Respuesta inesperada de The Odds API");
  const games = await db.from("cam_nfl_games")
    .select("id,home_id,away_id,kickoff,odds_locked_at,status,opening_mode")
    .eq("status","scheduled").is("odds_locked_at",null)
    .gt("kickoff",new Date().toISOString()).limit(150);
  if (games.error) throw games.error;
  const allTeams = await db.from("nfl_teams").select("id,name");
  if (allTeams.error) throw allTeams.error;
  const names = new Map((allTeams.data || []).map((t: any) => [t.id,safe(t.name)]));
  let frozen = 0;
  for (const game of games.data || []) {
    const match = odds.find((o: any) => safe(o.home_team) === names.get(game.home_id)
       && safe(o.away_team) === names.get(game.away_id)
       && Math.abs(Date.parse(o.commence_time)-Date.parse(game.kickoff)) < 12*3600000);
    if (!match) continue;
    const bookmaker = (match.bookmakers || []).find((book: any) => (book.markets || []).some((m: any) =>
      m.key==="h2h" && m.outcomes?.length===2
      && m.outcomes.some((o: any) => safe(o.name)===names.get(game.home_id) && validOdd(o.price))
      && m.outcomes.some((o: any) => safe(o.name)===names.get(game.away_id) && validOdd(o.price))));
    if (!bookmaker) continue;
    const market=bookmaker.markets.find((m: any)=>m.key==="h2h");
    const ho=market.outcomes.find((o: any)=>safe(o.name)===names.get(game.home_id)).price;
    const ao=market.outcomes.find((o: any)=>safe(o.name)===names.get(game.away_id)).price;
    const hRaw=implied(ho),aRaw=implied(ao);
    const h=Math.round(hRaw/(hRaw+aRaw)*1e6)/1e6,a=1-h;
    const save=await db.from("cam_nfl_games").update({
      odds_home:ho,odds_away:ao,probability_home:h,probability_away:a,
      points_home:Math.max(2,Math.min(12,Math.round(2/h))),
      points_away:Math.max(2,Math.min(12,Math.round(2/a))),
      odds_source:"The Odds API: "+bookmaker.key,
      odds_locked_at:new Date().toISOString(),picks_open:game.opening_mode!=="closed",
    }).eq("id",game.id).is("odds_locked_at",null).eq("status","scheduled").gt("kickoff",new Date().toISOString()).select("id");
    if (save.error) throw save.error;
    if (save.data?.length) {
      frozen++;
      await db.from("cam_nfl_audit").insert({game_id:game.id,action:"freeze_odds_auto",
        detail:{provider:"The Odds API",bookmaker:bookmaker.key,home:ho,away:ao}});
    }
  }
  return { provider:"The Odds API",frozen };
}
Deno.serve(async req => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return reply({},200,origin);
  if (req.method !== "POST") return reply({error:"Método no permitido"},405,origin);
  try {
    const identity = await authenticate(req);
    const input = await req.json().catch(()=>({}));
    const year = Number(input.season), selected = Number(input.week);
    if (!identity.cron && input.action !== "sync") throw Error("Acción inválida");
    if (identity.cron && (input.action && input.action !== "sync")) throw Error("Acción inválida");
    const catalog = await db.from("nfl_teams").select("id");
    if (catalog.error) throw catalog.error;
    const ids = new Set((catalog.data || []).map((t:any)=>t.id));
    let nflverseRows: NflRow[]|null=null;
    try { nflverseRows=await readNflverse(); } catch(error){console.warn("nflverse no disponible; intentando ESPN",String(error));}
    let weeks: {season:number,week:number}[];
    let useNflverse=Boolean(nflverseRows);
    if (Number.isInteger(year) && year>=2020 && year<=2100 && Number.isInteger(selected) && selected>=1 && selected<=22 && !identity.cron) {
      weeks=[{season:year,week:selected}];
      if(selected>=19)useNflverse=false;
    } else {
      // ESPN identifies postseason; nflverse remains preferred for regular-season data.
      const observed=await scoreboard().catch(()=>null);
      const phase=Number(observed?.season?.type);
      const currentSeason=Number(observed?.season?.year);
      const apiWeek=Number(observed?.week?.number);
      if (phase===3 && Number.isInteger(currentSeason)) {
        useNflverse=false;
        const current=playoffWeeks[apiWeek];
        const sequence=[19,20,21,22];
        if(!current)weeks=[]; // Pro Bowl and other exhibition games are excluded.
        else {
          const index=sequence.indexOf(current);
          weeks=sequence.slice(Math.max(0,index-1),Math.min(4,index+2)).map(week=>({season:currentSeason,week}));
        }
      } else if(nflverseRows) {
        const latest=currentWeek(nflverseRows);
        weeks=[latest.week-1,latest.week,latest.week+1].filter(w=>w>=1&&w<=18)
          .map(week=>({season:latest.season,week}));
      } else if(phase===2 && Number.isInteger(apiWeek) && apiWeek>=1 && apiWeek<=18) {
        weeks=[apiWeek-1,apiWeek,apiWeek+1].filter(w=>w>=1&&w<=18)
          .map(week=>({season:currentSeason,week}));
      } else {
        weeks=[]; // Offseason or provider unavailable: preserve last good data.
      }
    }
    const results=[];
    for(const entry of weeks) results.push(useNflverse && entry.week<=18 && nflverseRows
      ? await syncNflverseWeek(entry.season,entry.week,ids,nflverseRows)
      : await syncWeek(entry.season,entry.week,ids));
    const freeze=await freezeOdds();
    return reply({ok:true,weeks:results,odds:freeze},200,origin);
  } catch (error) {
    const message=String(error instanceof Error?error.message:error);
    const code=/Autenticación|Sesión/.test(message)?401:/Solo administradores/.test(message)?403:400;
    return reply({ok:false,error:message},code,origin);
  }
});
