// CAM SPORTS · Sincronización de la Quiniela de Fútbol.
// Calendario y resultados oficiales de ESPN (LaLiga, Premier, Liga MX, Champions)
// y cuotas 1X2 de The Odds API. Solo administradores verificados o el secreto del cron.
// Nunca se inventan partidos, escudos ni probabilidades: lo que no se confirma, no entra.
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const URL_ = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const cronSecret = Deno.env.get("CAM_NFL_CRON_SECRET") || "";
const oddsKey = Deno.env.get("THE_ODDS_API_KEY") || "";
const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

const allowedOrigins = new Set([
  "https://camsports.github.io",
  "https://eduardcarrera00-pixel.github.io",
  "https://aesportsclub.github.io",
]);

// Las cuatro competiciones de la quiniela y su equivalencia en cada proveedor.
const COMPETITIONS: Record<string, { espn: string; odds: string; label: string }> = {
  laliga:    { espn: "soccer/esp.1",          odds: "soccer_spain_la_liga",      label: "LaLiga" },
  premier:   { espn: "soccer/eng.1",          odds: "soccer_epl",                label: "Premier League" },
  ligamx:    { espn: "soccer/mex.1",          odds: "soccer_mexico_ligamx",      label: "Liga MX" },
  champions: { espn: "soccer/uefa.champions", odds: "soccer_uefa_champs_league", label: "Champions League" },
};
const DAYS_BACK = 4;
const DAYS_AHEAD = 10;

const safe = (s: unknown) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const number = (n: unknown) => n !== null && n !== undefined && typeof n !== "boolean"
  && String(n).trim() !== "" && Number.isFinite(Number(n)) ? Number(n) : null;
const validOdd = (n: unknown) => Number.isInteger(n) && Math.abs(Number(n)) >= 100 && Math.abs(Number(n)) < 100000;
const implied = (odd: number) => odd > 0 ? 100 / (odd + 100) : -odd / (-odd + 100);
const points = (p: number) => Math.max(2, Math.min(12, Math.round(2 / p)));
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
    // El token vive en Supabase Vault; ni el navegador ni GitHub lo guardan.
    const validation = await db.rpc("cam_nfl_validate_cron", { p_secret: cronHeader });
    if (!validation.error && validation.data === true) return { cron: true, userId: null };
    if (cronSecret && compare(cronHeader, cronSecret)) return { cron: true, userId: null };
  }
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw Error("Autenticación requerida");
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const auth = await client.auth.getUser(token);
  if (auth.error || !auth.data.user) throw Error("Sesión inválida");
  const who = auth.data.user.id;
  const role = await db.from("editors").select("user_id").eq("user_id", who).maybeSingle();
  if (role.error || !role.data) throw Error("Solo administradores");
  return { cron: false, userId: who };
}

// ESPN rechaza las salidas de Edge: se pide desde Postgres y solo si falla se intenta directo.
async function scoreboard(path: string, date: string) {
  const proxy = await db.rpc("ae_pick_scoreboard_proxy", { p_path: path, p_date: date });
  if (!proxy.error && proxy.data && Array.isArray(proxy.data.events)) return proxy.data;
  try {
    return await readJSON("https://site.api.espn.com/apis/site/v2/sports/" + path +
      "/scoreboard?dates=" + date + "&limit=300");
  } catch (error) {
    console.warn("ESPN no disponible", path, date, String(error));
    return null;
  }
}

const torontoYmd = (date: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date).replace(/-/g, "");

function statusOf(event: any, home: any, away: any) {
  const type = event.status?.type || event.competitions?.[0]?.status?.type || {};
  const name = String(type.name || "").toUpperCase();
  if (name.includes("CANCEL") || name.includes("ABANDON") || name.includes("FORFEIT")) return "cancelled";
  if (name.includes("POSTPONE") || name.includes("DELAY")) return "postponed";
  if (type.completed || name.includes("FULL_TIME") || name.includes("FINAL")) {
    const h = number(home.score), a = number(away.score);
    return h === null || a === null ? "live" : "final";
  }
  if (type.state === "in" || name.includes("IN_PROGRESS") || name.includes("HALFTIME")
    || name.includes("FIRST_HALF") || name.includes("SECOND_HALF") || name.includes("EXTRA_TIME")) return "live";
  return "scheduled";
}

// ESPN no publica el número de jornada en fútbol. Se agrupa por semana (lunes de Toronto)
// contada desde el primer día del calendario oficial de la competición: un número estable
// que no finge ser la jornada oficial; la web lo muestra con sus fechas reales.
function mondayIndex(anchorMs: number, kickoffMs: number) {
  const week = 7 * 24 * 3600 * 1000;
  return Math.max(1, Math.min(60, Math.floor((kickoffMs - anchorMs) / week) + 1));
}
function mondayOf(iso: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  }).formatToParts(new Date(iso));
  const get = (k: string) => parts.find(p => p.type === k)?.value || "";
  const days: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const base = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  return base - (days[get("weekday")] ?? 0) * 24 * 3600 * 1000;
}

async function syncCompetition(key: string, requestedSeason: number | null) {
  const config = COMPETITIONS[key];
  const today = new Date();
  const days: string[] = [];
  for (let offset = -DAYS_BACK; offset <= DAYS_AHEAD; offset++) {
    days.push(torontoYmd(new Date(today.getTime() + offset * 24 * 3600 * 1000)));
  }
  const teams = new Map<string, any>();
  const fixtures: any[] = [];
  let anchor: number | null = null;
  let season: number | null = requestedSeason;
  let unavailable = 0;

  for (const day of days) {
    const board = await scoreboard(config.espn, day);
    if (!board) { unavailable++; continue; }
    const league = Array.isArray(board.leagues) ? board.leagues[0] : null;
    const calendarStart = Array.isArray(league?.calendar) && league.calendar.length
      ? String(league.calendar[0]) : null;
    if (calendarStart && anchor === null) anchor = mondayOf(calendarStart);
    const leagueSeason = number(league?.season?.year);
    for (const event of Array.isArray(board.events) ? board.events : []) {
      const competitors = event.competitions?.[0]?.competitors || [];
      const home = competitors.find((c: any) => c.homeAway === "home");
      const away = competitors.find((c: any) => c.homeAway === "away");
      const homeId = String(home?.team?.id || ""), awayId = String(away?.team?.id || "");
      const id = String(event.id || "");
      const year = number(event.season?.year) ?? leagueSeason;
      if (!/^[0-9]{6,16}$/.test(id) || !/^[0-9]{1,12}$/.test(homeId) || !/^[0-9]{1,12}$/.test(awayId)
        || homeId === awayId || !Number.isFinite(Date.parse(event.date)) || year === null) {
        console.warn("Partido incompleto descartado", config.espn, id);
        continue;
      }
      if (requestedSeason !== null && year !== requestedSeason) continue;
      if (season === null) season = year;
      for (const side of [home, away]) {
        const team = side.team || {};
        teams.set(String(team.id), {
          id: String(team.id),
          name: String(team.displayName || team.name || team.shortDisplayName || team.id),
          short_name: String(team.shortDisplayName || team.displayName || team.id),
          abbreviation: String(team.abbreviation || team.shortDisplayName || team.id).slice(0, 8),
          logo: typeof team.logo === "string" && team.logo.startsWith("https://") ? team.logo : null,
          updated_at: new Date().toISOString(),
        });
      }
      const status = statusOf(event, home, away);
      const hs = number(home.score), as = number(away.score);
      const closed = status === "final";
      fixtures.push({
        id, competition: key, season: year,
        kickoff: new Date(event.date).toISOString(),
        home_id: homeId, away_id: awayId, status,
        home_score: closed ? hs : null,
        away_score: closed ? as : null,
        outcome: closed ? (hs! > as! ? "home" : hs! < as! ? "away" : "draw") : null,
        last_synced_at: new Date().toISOString(),
      });
    }
  }
  if (!fixtures.length) {
    return { competition: key, games: 0, updated: 0, season,
      note: unavailable === days.length ? "ESPN no respondió; se conserva lo ya guardado." : "" };
  }
  if (anchor === null) anchor = mondayOf(fixtures[0].kickoff);

  if (teams.size) {
    const saved = await db.from("cam_football_teams").upsert([...teams.values()], { onConflict: "id" });
    if (saved.error) throw saved.error;
  }

  let updated = 0;
  for (const fixture of fixtures) {
    const row = { ...fixture, matchday: mondayIndex(anchor, mondayOf(fixture.kickoff)) };
    const previous = await db.from("cam_football_games")
      .select("competition,season,matchday,home_id,away_id,odds_locked_at,status")
      .eq("id", row.id).maybeSingle();
    if (previous.error) throw previous.error;
    if (previous.data) {
      // Un partido con pronósticos guardados no cambia de equipos ni de jornada.
      if (previous.data.odds_locked_at && (previous.data.home_id !== row.home_id
        || previous.data.away_id !== row.away_id || previous.data.season !== row.season)) {
        throw Error("El proveedor cambió los equipos de un partido congelado: " + row.id);
      }
      if (previous.data.odds_locked_at) row.matchday = previous.data.matchday;
      // Un resultado definitivo no vuelve atrás por una caché antigua del proveedor.
      if (["final", "cancelled"].includes(previous.data.status)
        && ["scheduled", "live"].includes(row.status)) continue;
    }
    if (row.status !== "scheduled") (row as any).picks_open = false;
    const saved = await db.from("cam_football_games").upsert(row, { onConflict: "id" });
    if (saved.error) throw saved.error;
    updated++;
  }
  return { competition: key, games: fixtures.length, updated, season, note: "" };
}

// Dos nombres son el mismo club solo si no queda duda; ante la duda, no se congela nada.
const STOP = new Set(["fc", "cf", "club", "de", "del", "la", "el", "los", "real", "deportivo",
  "atletico", "athletic", "united", "city", "sc", "ac", "cd", "ud", "afc", "sv", "fk", "futbol", "football"]);
function sameTeam(a: string, b: string) {
  const left = safe(a), right = safe(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const tokens = (value: string) => new Set(value.split(" ").filter(t => t.length >= 5 && !STOP.has(t)));
  const shared = [...tokens(left)].filter(t => tokens(right).has(t));
  return shared.length > 0;
}

async function freezeOdds(keys: string[]) {
  if (!oddsKey) return { provider: "Sin THE_ODDS_API_KEY", frozen: 0, note: "Sin clave de cuotas: los partidos quedan cerrados hasta que un administrador las introduzca." };
  let frozen = 0;
  for (const key of keys) {
    const config = COMPETITIONS[key];
    const params = new URLSearchParams({ apiKey: oddsKey, markets: "h2h", regions: "eu,us", oddsFormat: "american" });
    let market: any[] = [];
    try {
      market = await readJSON("https://api.the-odds-api.com/v4/sports/" + config.odds + "/odds/?" + params);
    } catch (error) { console.warn("The Odds API no disponible", config.odds, String(error)); continue; }
    if (!Array.isArray(market)) continue;
    const games = await db.from("cam_football_games")
      .select("id,home_id,away_id,kickoff,opening_mode")
      .eq("competition", key).eq("status", "scheduled").is("odds_locked_at", null)
      .gt("kickoff", new Date().toISOString()).limit(200);
    if (games.error) throw games.error;
    if (!games.data?.length) continue;
    const squad = await db.from("cam_football_teams").select("id,name,short_name");
    if (squad.error) throw squad.error;
    const names = new Map((squad.data || []).map((t: any) => [t.id, [t.name, t.short_name]]));
    for (const game of games.data) {
      const [homeName] = names.get(game.home_id) || [];
      const [awayName] = names.get(game.away_id) || [];
      if (!homeName || !awayName) continue;
      const candidates = market.filter((o: any) =>
        Math.abs(Date.parse(o.commence_time) - Date.parse(game.kickoff)) < 12 * 3600000
        && sameTeam(o.home_team, homeName) && sameTeam(o.away_team, awayName));
      if (candidates.length !== 1) continue;   // Ambiguo o ausente: no se congela.
      const match = candidates[0];
      const price = (outcomes: any[], label: string) =>
        outcomes.find((o: any) => label === "draw" ? safe(o.name) === "draw" || safe(o.name) === "empate"
          : sameTeam(o.name, label === "home" ? match.home_team : match.away_team))?.price;
      const bookmaker = (match.bookmakers || []).find((book: any) => (book.markets || []).some((m: any) =>
        m.key === "h2h" && m.outcomes?.length === 3
        && validOdd(price(m.outcomes, "home")) && validOdd(price(m.outcomes, "draw")) && validOdd(price(m.outcomes, "away"))));
      if (!bookmaker) continue;
      const outcomes = bookmaker.markets.find((m: any) => m.key === "h2h").outcomes;
      const ho = price(outcomes, "home"), dr = price(outcomes, "draw"), ao = price(outcomes, "away");
      const rawH = implied(ho), rawD = implied(dr), rawA = implied(ao);
      const total = rawH + rawD + rawA;
      const h = Math.round(rawH / total * 1e6) / 1e6;
      const d = Math.round(rawD / total * 1e6) / 1e6;
      const a = Math.round((1 - h - d) * 1e6) / 1e6;
      if (!(h > 0 && d > 0 && a > 0)) continue;
      const save = await db.from("cam_football_games").update({
        odds_home: ho, odds_draw: dr, odds_away: ao,
        probability_home: h, probability_draw: d, probability_away: a,
        points_home: points(h), points_draw: points(d), points_away: points(a),
        odds_source: "The Odds API: " + bookmaker.key,
        odds_locked_at: new Date().toISOString(),
        picks_open: game.opening_mode !== "closed",
      }).eq("id", game.id).is("odds_locked_at", null).eq("status", "scheduled")
        .gt("kickoff", new Date().toISOString()).select("id");
      if (save.error) throw save.error;
      if (save.data?.length) {
        frozen++;
        await db.from("cam_football_audit").insert({
          game_id: game.id, action: "freeze_odds_auto",
          detail: { provider: "The Odds API", bookmaker: bookmaker.key, home: ho, draw: dr, away: ao },
        });
      }
    }
  }
  return { provider: "The Odds API", frozen, note: "" };
}

Deno.serve(async req => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return reply({}, 200, origin);
  if (req.method !== "POST") return reply({ error: "Método no permitido" }, 405, origin);
  try {
    const identity = await authenticate(req);
    const input = await req.json().catch(() => ({}));
    if (input.action && input.action !== "sync") throw Error("Acción inválida");
    const requested = typeof input.competition === "string" ? input.competition : "";
    if (requested && !COMPETITIONS[requested]) throw Error("Competición inválida");
    const year = Number(input.season);
    const season = !identity.cron && Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : null;
    const keys = requested && !identity.cron ? [requested] : Object.keys(COMPETITIONS);

    const results = [];
    for (const key of keys) results.push(await syncCompetition(key, season));
    const freeze = await freezeOdds(keys);
    const games = results.reduce((n, r) => n + r.games, 0);
    const notes = [...results.map(r => r.note), freeze.note].filter(Boolean).join(" ");
    return reply({ ok: true, games, frozen: freeze.frozen, competitions: results, odds: freeze, note: notes }, 200, origin);
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    const code = /Autenticación|Sesión/.test(message) ? 401 : /Solo administradores/.test(message) ? 403 : 400;
    return reply({ ok: false, error: message }, code, origin);
  }
});
