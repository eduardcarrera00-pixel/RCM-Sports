// CAM Sports · servidor MCP de consulta y administración (Edge Function `cam-mcp`).
//
// Protocolo MCP «Streamable HTTP» sin sesiones: cada POST trae un mensaje JSON-RPC
// y la respuesta vuelve como JSON. Sin dependencias externas.
//
// Acceso: solo con la clave privada del dueño. Aquí se guarda su huella SHA-256, nunca
// la clave. Se acepta en la ruta (…/functions/v1/cam-mcp/<clave>), en ?key=<clave> o en
// «Authorization: Bearer <clave>». Para cambiarla: generar otra, poner su huella en
// ACCESS_KEY_SHA256 en lugar de la anterior y volver a publicar la función (la anterior
// deja de funcionar al instante).
//
// Datos: las consultas públicas se leen con la clave publicable, así que las reglas RLS de la
// web deciden qué se ve (lo mismo que ve un visitante). Con la clave secreta solo se llama a
// cam_mcp_analytics_summary() (`visitas`) y a cam_mcp_admin() (herramientas admin_*), que
// actúa como la cuenta de administrador del dueño con las mismas funciones y reglas que la
// web y registra cada cambio (migración 20261104150000_cam_mcp_admin.sql).

const SERVER_VERSION = "2.0.0";
const SITE = "https://camsports.github.io/";
const TZ = "America/Toronto";
const ACCESS_KEY_SHA256 = [
  "c6692875cdb4d44a76511cce7baacc0a4c5c22a7f95be9c0edd78f64da8d95e1", // clave del dueño (4 nov 2026; sustituye a la del 30 oct)
];
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const PUBLIC_KEY = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
const SECRET_KEY = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id",
};

type Args = Record<string, unknown>;
type Json = Record<string, unknown>;

class ToolError extends Error {}

// ───────────────────────────── utilidades ─────────────────────────────

function envKey(modern: string, legacy: string): string {
  try {
    const all = JSON.parse(Deno.env.get(modern) ?? "{}") as Record<string, string>;
    const value = all.default ?? Object.values(all)[0];
    if (value) return value;
  } catch { /* sin claves nuevas */ }
  return Deno.env.get(legacy) ?? "";
}

function authHeaders(key: string): Record<string, string> {
  // Las claves nuevas (sb_…) van solo en apikey; las antiguas (JWT) también como Bearer.
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

async function db(path: string, opts: { body?: unknown; secret?: boolean } = {}): Promise<any> {
  const key = opts.secret ? SECRET_KEY : PUBLIC_KEY;
  if (!SUPABASE_URL || !key) throw new ToolError("La función no tiene configuradas las claves de Supabase.");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: opts.body === undefined ? "GET" : "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json", Accept: "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.message || parsed.hint || text;
    } catch { /* texto plano */ }
    throw new ToolError(`La base de datos respondió ${res.status}: ${String(message).slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

const rpc = (name: string, args: Json = {}, secret = false) => db(`rpc/${name}`, { body: args, secret });

/** Ejecuta una parte de la respuesta; si falla, deja el motivo en lugar de tumbar todo. */
async function safe<T>(promise: Promise<T>): Promise<T | { error: string }> {
  try {
    return await promise;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const dateFormat = new Intl.DateTimeFormat("es-MX", {
  timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});
function local(ts: unknown): string | null {
  if (!ts || typeof ts !== "string") return null;
  try {
    return dateFormat.format(new Date(ts));
  } catch {
    return ts;
  }
}
function torontoMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}

function clip(text: unknown, max: number): string | null {
  if (typeof text !== "string") return null;
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

/** Las noticias se guardan como HTML del editor; para leerlas basta el texto con sus párrafos. */
function htmlToText(html: unknown): string | null {
  if (typeof html !== "string") return null;
  if (!/<[a-z!/]/i.test(html)) return html;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pct(p: unknown): string | null {
  const n = Number(p);
  return p === null || p === undefined || !Number.isFinite(n) ? null : `${Math.round(n * 1000) / 10}%`;
}

/** Mismo empaquetado que la web (cam-pick-share.js): UUID → base64url de 22 caracteres. */
function pack(id: string): string {
  const bytes = id.replace(/-/g, "").match(/../g)!.map((h) => parseInt(h, 16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const takeLink = (authorId: unknown, takeId: unknown) =>
  typeof authorId === "string" && typeof takeId === "string" && UUID.test(authorId) && UUID.test(takeId)
    ? `${SITE}?t=${pack(authorId)}.${pack(takeId)}`
    : null;
const pickLink = (id: unknown) => (typeof id === "string" && UUID.test(id) ? `${SITE}?p=${pack(id)}` : null);

// Lectura de argumentos
function text(args: Args, name: string, max = 120): string | null {
  const v = args[name];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new ToolError(`«${name}» debe ser texto.`);
  return v.trim().slice(0, max) || null;
}
function choice(args: Args, name: string, allowed: string[], fallback: string): string {
  const v = text(args, name);
  if (!v) return fallback;
  const norm = v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!allowed.includes(norm)) throw new ToolError(`«${name}» debe ser uno de: ${allowed.join(", ")}.`);
  return norm;
}
function int(args: Args, name: string, fallback: number | null, min: number, max: number): number | null {
  const v = args[name];
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ToolError(`«${name}» debe ser un número entero entre ${min} y ${max}.`);
  return n;
}
function uuid(args: Args, name: string, required = true): string | null {
  const v = text(args, name, 64);
  if (!v) {
    if (required) throw new ToolError(`Falta «${name}».`);
    return null;
  }
  if (!UUID.test(v)) throw new ToolError(`«${name}» no es un identificador válido (UUID).`);
  return v.toLowerCase();
}
/** Texto seguro para filtros ilike de PostgREST. */
function likeTerm(v: string): string {
  return encodeURIComponent(v.replace(/[,()"*\\%:.]/g, " ").replace(/\s+/g, " ").trim());
}

const SPORT_TAKES: Record<string, string> = { todos: "all", futbol: "football", nfl: "nfl" };
const PICK_STATE: Record<string, string> = { won: "acertado", lost: "fallado", void: "anulado" };
const COMPETITIONS = ["laliga", "premier", "ligamx", "champions"];
const COMPETITION_NAME: Record<string, string> = {
  laliga: "LaLiga", premier: "Premier League", ligamx: "Liga MX", champions: "Champions League", nfl: "NFL",
};

// ───────────────────────────── piezas de datos ─────────────────────────────

function shapeTake(t: any, replies?: Map<string, number>, bodyMax = 600) {
  return {
    id: t.id,
    titulo: t.title,
    texto: clip(t.body, bodyMax),
    autor: t.author,
    autor_id: t.author_id,
    deporte: t.sport,
    competicion: t.competition ?? null,
    fecha: local(t.created_at),
    apoyos: Number(t.upvotes ?? 0),
    cuestionados: Number(t.downvotes ?? 0),
    ...(replies ? { comentarios: replies.get(t.id) ?? 0 } : {}),
    enlace: takeLink(t.author_id, t.id),
  };
}

async function replyCounts(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const rows = await rpc("ae_public_take_reply_counts", { p_take_ids: ids });
  for (const r of rows ?? []) map.set(r.take_id, Number(r.reply_count ?? 0));
  return map;
}

function shapePick(p: any) {
  return {
    id: p.id,
    autor: p.author,
    titulo: p.title,
    explicacion: clip(p.explanation, 500),
    selecciones: (Array.isArray(p.legs) ? p.legs : []).map((l: any) => ({
      evento: l.event ?? null, seleccion: l.selection ?? null, deporte: l.sport ?? null, momio: l.odds ?? null,
    })),
    momio_americano: p.american_odds,
    momio_decimal: p.decimal_odds === null ? null : Number(p.decimal_odds),
    fecha_partido: p.event_date,
    publicado: local(p.created_at),
    estado: PICK_STATE[p.outcome] ?? "pendiente",
    puntos: p.result_points === null ? null : Number(p.result_points),
    moderacion: p.moderation_status,
    enlace: pickLink(p.id),
  };
}

async function weeklyPicks(limit: number) {
  const rows = await db(
    `ae_editorial_weekly_picks?select=id,title,event_name,selection,american_odds,analysis,created_at,expires_at&is_published=eq.true&order=created_at.desc&limit=${limit}`,
  );
  return Promise.all((rows ?? []).map(async (w: any) => {
    const result = await safe(rpc("cam_weekly_pick_result", { p_pick_id: w.id }));
    const state = result && typeof result === "object" && !("error" in (result as Json))
      ? (result as Json).outcome ?? (result as Json).state ?? (result as Json).status ?? null
      : null;
    const pending = !state || state === "pending";
    const expired = w.expires_at && new Date(w.expires_at).getTime() < Date.now();
    return {
      id: w.id,
      titulo: w.title,
      evento: w.event_name,
      seleccion: w.selection,
      momio_americano: w.american_odds,
      analisis: clip(w.analysis, 1200),
      publicado: local(w.created_at),
      cierra: local(w.expires_at),
      estado: pending ? (expired ? "cerrado, sin resultado registrado" : "abierto") : PICK_STATE[String(state)] ?? state,
      resultado: result,
      enlace: `${SITE}?${pending ? "e" : "r"}=${pack(w.id)}`,
    };
  }));
}

async function powerRankings(league: "nfl" | "champions") {
  if (league === "nfl") {
    const [current, history, teams, articles] = await Promise.all([
      db("nfl_rankings?select=edition,team_ids,updated_at&order=updated_at.desc&limit=1"),
      db("nfl_ranking_history?select=edition,team_ids,superseded_at&order=superseded_at.desc&limit=12"),
      db("nfl_teams?select=id,name"),
      db("articles?select=id,title,created_at&is_public=eq.true&category=eq.NFL&title=ilike.*power*ranking*&order=created_at.desc&limit=1"),
    ]);
    const names = new Map<string, string>((teams ?? []).map((t: any) => [t.id, t.name]));
    // Una edición se puede volver a publicar sin cambios: se compara con la última versión con otro orden.
    const previous = (history ?? []).find((h: any) => sameOrder(h, current?.[0]) === false) ?? null;
    return rankingShape("NFL", current?.[0], previous, names, articles?.[0], "updated_at", "superseded_at");
  }
  const editions = await db("champions_rankings?select=season,edition,team_ids,published_at&order=published_at.desc&limit=12");
  const current = editions?.[0];
  if (!current) return { liga: "Champions League", aviso: "Todavía no hay Power Rankings de Champions." };
  const previous = (editions ?? []).slice(1).find((e: any) => e.season === current.season && sameOrder(e, current) === false) ?? null;
  const [clubs, articles] = await Promise.all([
    db(`champions_clubs?select=id,name&season=eq.${encodeURIComponent(current.season)}`),
    db("articles?select=id,title,created_at&is_public=eq.true&title=ilike.*power*ranking*champions*&order=created_at.desc&limit=1"),
  ]);
  const names = new Map<string, string>((clubs ?? []).map((c: any) => [c.id, c.name]));
  return { temporada: current.season, ...rankingShape("Champions League", current, previous, names, articles?.[0], "published_at", "published_at") };
}

function sameOrder(a: any, b: any): boolean | null {
  if (!a || !b) return null;
  return JSON.stringify(a.team_ids ?? []) === JSON.stringify(b.team_ids ?? []);
}

function rankingShape(liga: string, current: any, previous: any, names: Map<string, string>, article: any, dateField: string, prevDateField: string) {
  if (!current) return { liga, aviso: "Todavía no hay Power Rankings publicados." };
  const prev: string[] = previous?.team_ids ?? [];
  return {
    liga,
    edicion: current.edition,
    publicado: local(current[dateField]),
    comparado_con: previous ? `${previous.edition} (${local(previous[prevDateField])})` : null,
    equipos: (current.team_ids ?? []).map((id: string, i: number) => {
      const before = prev.indexOf(id);
      return {
        puesto: i + 1,
        equipo: names.get(id) ?? id,
        movimiento: !previous ? null : before === -1 ? "nuevo" : before - i === 0 ? "=" : before - i > 0 ? `+${before - i}` : `${before - i}`,
      };
    }),
    articulo_de_analisis: article ? { id: article.id, titulo: article.title, fecha: local(article.created_at) } : null,
  };
}

async function teamNames(table: "nfl_teams" | "cam_football_teams", ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await db(`${table}?select=id,name&id=in.(${unique.map((id) => `"${id.replace(/"/g, "")}"`).join(",")})`);
  return new Map((rows ?? []).map((t: any) => [t.id, t.name]));
}

async function latestSeason(sport: "nfl" | "futbol"): Promise<number> {
  const rows = await db(`${sport === "nfl" ? "cam_nfl_games" : "cam_football_games"}?select=season&order=season.desc&limit=1`);
  return Number(rows?.[0]?.season ?? new Date().getFullYear());
}

// ───────────────────────────── herramientas ─────────────────────────────

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  run: (args: Args) => Promise<unknown>;
};

const SPORT_PROP = { type: "string", enum: ["todos", "futbol", "nfl"], description: "Deporte. Por defecto «todos»." };
const LIMIT = (def: number, max: number) => ({ type: "integer", minimum: 1, maximum: max, description: `Cuántos resultados (por defecto ${def}, máximo ${max}).` });

const READ_TOOLS: Tool[] = [
  {
    name: "resumen",
    title: "Resumen de CAM Sports",
    description:
      "Vistazo general de la web en este momento: últimas noticias, Takes recientes, Power Rankings vigentes (NFL y Champions), " +
      "partidos abiertos en las quinielas, preguntas de «¿Quién será campeón?», Pick de la semana y líderes de Picks. " +
      "Úsala para preguntas amplias como «¿cómo va la página?» o «¿qué hay nuevo?».",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const [news, takes, nfl, champions, nflOpen, fbOpen, questions, weekly, pickLeaders] = await Promise.all([
        safe(db("articles?select=id,title,category,author,created_at&is_public=eq.true&order=created_at.desc&limit=5")),
        safe(rpc("ae_public_take_feed", { p_sport: "all" })),
        safe(powerRankings("nfl")),
        safe(powerRankings("champions")),
        safe(db("cam_nfl_games?select=id,week,home_id,away_id,kickoff&picks_open=eq.true&status=eq.scheduled&order=kickoff.asc&limit=100")),
        safe(db("cam_football_games?select=id,competition,home_id,away_id,kickoff&picks_open=eq.true&status=eq.scheduled&order=kickoff.asc&limit=200")),
        safe(db("ae_take_questions?select=id,competition,season,prompt,closes_at,status&status=eq.open&order=closes_at.asc&limit=20")),
        safe(weeklyPicks(1)),
        safe(rpc("ae_pick_result_ranking", { p_period: "all" })),
      ]);
      const top = (r: any) => ("error" in (r ?? {}) ? r : { edicion: r.edicion, top5: (r.equipos ?? []).slice(0, 5) });
      const nflGames = Array.isArray(nflOpen) ? nflOpen : [];
      const fbGames = Array.isArray(fbOpen) ? fbOpen : [];
      const [nflNames, fbNames] = await Promise.all([
        teamNames("nfl_teams", nflGames.slice(0, 1).flatMap((g: any) => [g.home_id, g.away_id])).catch(() => new Map()),
        teamNames("cam_football_teams", fbGames.slice(0, 1).flatMap((g: any) => [g.home_id, g.away_id])).catch(() => new Map()),
      ]);
      const byComp: Record<string, number> = {};
      for (const g of fbGames) byComp[COMPETITION_NAME[g.competition] ?? g.competition] = (byComp[COMPETITION_NAME[g.competition] ?? g.competition] ?? 0) + 1;
      const next = (g: any, names: Map<string, string>) =>
        g ? `${names.get(g.away_id) ?? g.away_id} @ ${names.get(g.home_id) ?? g.home_id} · ${local(g.kickoff)}` : null;
      return {
        sitio: SITE,
        ahora_en_toronto: local(new Date().toISOString()),
        noticias_recientes: Array.isArray(news)
          ? news.map((a: any) => ({ id: a.id, titulo: a.title, categoria: a.category, autor: a.author, fecha: local(a.created_at) }))
          : news,
        takes_recientes: Array.isArray(takes) ? takes.slice(0, 5).map((t: any) => shapeTake(t, undefined, 200)) : takes,
        power_rankings: { nfl: top(nfl), champions: top(champions) },
        quinielas_abiertas: {
          nfl: { partidos: nflGames.length, proximo: next(nflGames[0], nflNames) },
          futbol: { partidos: fbGames.length, por_competicion: byComp, proximo: next(fbGames[0], fbNames) },
        },
        // Siguen en «open» hasta que se valida el campeón, aunque ya no admitan elecciones.
        quien_sera_campeon: Array.isArray(questions)
          ? questions.map((q: any) => ({
            id: q.id,
            pregunta: q.prompt,
            estado: new Date(q.closes_at).getTime() < Date.now() ? "cerrada, pendiente de validar" : "abierta",
            cierra: local(q.closes_at),
          }))
          : questions,
        pick_de_la_semana: Array.isArray(weekly) ? weekly[0] ?? null : weekly,
        lideres_picks: Array.isArray(pickLeaders)
          ? pickLeaders.slice(0, 3).map((r: any) => ({ usuario: r.username, puntos: Number(r.points), aciertos: Number(r.correct_picks), resueltos: Number(r.total_resolved) }))
          : pickLeaders,
      };
    },
  },
  {
    name: "buscar_noticias",
    title: "Buscar noticias",
    description:
      "Lista las noticias publicadas, de la más reciente a la más antigua, con lecturas y «me gusta». " +
      "Filtra por texto (título, resumen o cuerpo) y por categoría. Para leer una completa usa «leer_noticia».",
    inputSchema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "Palabras a buscar (opcional)." },
        categoria: { type: "string", description: "Categoría, p. ej. «NFL» o «Fútbol» (opcional)." },
        limite: LIMIT(10, 30),
      },
      additionalProperties: false,
    },
    run: async (args) => {
      const limit = int(args, "limite", 10, 1, 30)!;
      const term = text(args, "texto");
      const cat = text(args, "categoria", 40);
      let path = `articles?select=id,title,category,author,summary,featured,created_at&is_public=eq.true&order=created_at.desc&limit=${limit}`;
      if (cat) {
        const norm = cat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        path += `&category=ilike.${norm === "futbol" ? encodeURIComponent("Fútbol") : likeTerm(cat)}`;
      }
      if (term) {
        const t = likeTerm(term);
        if (t) path += `&or=(title.ilike.*${t}*,summary.ilike.*${t}*,body.ilike.*${t}*)`;
      }
      const rows = (await db(path)) ?? [];
      const ids = rows.map((a: any) => a.id);
      const [views, totals] = await Promise.all([
        ids.length ? safe(db(`ae_article_views?select=article_id,views&article_id=in.(${ids.join(",")})`)) : Promise.resolve([]),
        ids.length ? safe(rpc("rcm_read_article_totals")) : Promise.resolve([]),
      ]);
      const viewMap = new Map(Array.isArray(views) ? views.map((v: any) => [v.article_id, Number(v.views)]) : []);
      const likeMap = new Map(Array.isArray(totals) ? totals.map((v: any) => [v.article_id, Number(v.likes)]) : []);
      return {
        total: rows.length,
        noticias: rows.map((a: any) => ({
          id: a.id,
          titulo: a.title,
          categoria: a.category,
          autor: a.author,
          resumen: clip(a.summary, 300),
          destacada: !!a.featured,
          fecha: local(a.created_at),
          lecturas: viewMap.get(a.id) ?? 0,
          me_gusta: likeMap.get(a.id) ?? 0,
        })),
      };
    },
  },
  {
    name: "leer_noticia",
    title: "Leer una noticia",
    description: "Devuelve una noticia publicada completa (texto, autor, fecha, lecturas, «me gusta») y sus comentarios.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Identificador de la noticia (de «buscar_noticias» o «resumen»)." } },
      required: ["id"],
      additionalProperties: false,
    },
    run: async (args) => {
      const id = uuid(args, "id")!;
      const [rows, views, totals, comments] = await Promise.all([
        db(`articles?select=id,title,category,author,summary,body,featured,created_at&is_public=eq.true&id=eq.${id}`),
        safe(db(`ae_article_views?select=views&article_id=eq.${id}`)),
        safe(rpc("rcm_read_article_totals")),
        safe(db(`comments?select=id,parent_id,author,body,created_at&article_id=eq.${id}&order=created_at.asc&limit=60`)),
      ]);
      const a = rows?.[0];
      if (!a) throw new ToolError("No encontré una noticia publicada con ese id.");
      const total = Array.isArray(totals) ? totals.find((t: any) => t.article_id === id) : null;
      return {
        id: a.id,
        titulo: a.title,
        categoria: a.category,
        autor: a.author,
        fecha: local(a.created_at),
        destacada: !!a.featured,
        resumen: a.summary,
        texto: clip(htmlToText(a.body), 20000),
        lecturas: Array.isArray(views) ? Number(views[0]?.views ?? 0) : null,
        me_gusta: total ? Number(total.likes) : null,
        comentario_mas_votado: total?.top_comment ?? null,
        comentarios: Array.isArray(comments)
          ? comments.map((c: any) => ({ id: c.id, respuesta_a: c.parent_id, autor: c.author, texto: clip(c.body, 800), fecha: local(c.created_at) }))
          : comments,
      };
    },
  },
  {
    name: "opiniones",
    title: "Opiniones",
    description:
      "Sección Opiniones de la web. Sin «id» lista las publicadas (más recientes primero, con lecturas); con «id» devuelve el texto completo de una.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identificador de una opinión para leerla completa (opcional)." },
        deporte: { type: "string", description: "Filtrar por deporte, p. ej. «nfl» o «futbol» (opcional)." },
        limite: LIMIT(10, 30),
      },
      additionalProperties: false,
    },
    run: async (args) => {
      const id = uuid(args, "id", false);
      if (id) {
        const [rows, views] = await Promise.all([
          db(`ae_opinions?select=id,sport,title,summary,body,author,featured,created_at,edited_at&is_published=eq.true&id=eq.${id}`),
          safe(db(`ae_opinion_views?select=views&opinion_id=eq.${id}`)),
        ]);
        const o = rows?.[0];
        if (!o) throw new ToolError("No encontré una opinión publicada con ese id.");
        return {
          id: o.id, deporte: o.sport, titulo: o.title, autor: o.author, resumen: o.summary, texto: clip(htmlToText(o.body), 20000),
          destacada: !!o.featured, fecha: local(o.created_at), editada: local(o.edited_at),
          lecturas: Array.isArray(views) ? Number(views[0]?.views ?? 0) : null, enlace: `${SITE}?opinion=${o.id}`,
        };
      }
      const limit = int(args, "limite", 10, 1, 30)!;
      const sport = text(args, "deporte", 30);
      let path = `ae_opinions?select=id,sport,title,summary,author,featured,created_at&is_published=eq.true&order=created_at.desc&limit=${limit}`;
      if (sport) path += `&sport=ilike.${likeTerm(sport.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))}`;
      const rows = (await db(path)) ?? [];
      const ids = rows.map((o: any) => o.id);
      const views = ids.length ? await safe(db(`ae_opinion_views?select=opinion_id,views&opinion_id=in.(${ids.join(",")})`)) : [];
      const viewMap = new Map(Array.isArray(views) ? views.map((v: any) => [v.opinion_id, Number(v.views)]) : []);
      return {
        total: rows.length,
        opiniones: rows.map((o: any) => ({
          id: o.id, deporte: o.sport, titulo: o.title, autor: o.author, resumen: clip(o.summary, 300),
          destacada: !!o.featured, fecha: local(o.created_at), lecturas: viewMap.get(o.id) ?? 0, enlace: `${SITE}?opinion=${o.id}`,
        })),
        ...(rows.length ? {} : { aviso: "No hay opiniones publicadas con ese filtro." }),
      };
    },
  },
  {
    name: "takes",
    title: "Takes de la comunidad",
    description:
      "Takes públicos más recientes (predicciones libres de los usuarios) con autor, competición, votos (apoyos/cuestionados), " +
      "número de comentarios y enlace para compartir. Filtra por deporte o por texto.",
    inputSchema: {
      type: "object",
      properties: { deporte: SPORT_PROP, texto: { type: "string", description: "Palabras a buscar en título o texto (opcional)." }, limite: LIMIT(15, 100) },
      additionalProperties: false,
    },
    run: async (args) => {
      const sport = SPORT_TAKES[choice(args, "deporte", Object.keys(SPORT_TAKES), "todos")];
      const limit = int(args, "limite", 15, 1, 100)!;
      const term = text(args, "texto")?.toLowerCase();
      let rows = (await rpc("ae_public_take_feed", { p_sport: sport })) ?? [];
      if (term) rows = rows.filter((t: any) => `${t.title} ${t.body} ${t.competition}`.toLowerCase().includes(term));
      rows = rows.slice(0, limit);
      const replies = await replyCounts(rows.map((t: any) => t.id)).catch(() => new Map());
      return { total: rows.length, takes: rows.map((t: any) => shapeTake(t, replies)) };
    },
  },
  {
    name: "leer_take",
    title: "Leer un Take",
    description: "Un Take completo con su conversación (comentarios y respuestas).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Identificador del Take (de «takes»)." } },
      required: ["id"],
      additionalProperties: false,
    },
    run: async (args) => {
      const id = uuid(args, "id")!;
      const [feed, thread] = await Promise.all([rpc("ae_public_take_feed", { p_sport: "all" }), safe(rpc("ae_take_comment_thread", { p_take_id: id }))]);
      const take = (feed ?? []).find((t: any) => t.id === id);
      if (!take) throw new ToolError("No encontré ese Take entre los públicos (puede estar oculto o ser muy antiguo).");
      return {
        ...shapeTake(take, undefined, 8000),
        conversacion: Array.isArray(thread)
          ? thread.map((c: any) => ({ id: c.id, respuesta_a: c.parent_id, autor: c.author, texto: clip(c.body, 1500), fecha: local(c.created_at) }))
          : thread,
      };
    },
  },
  {
    name: "clasificacion_takes",
    title: "Clasificación de Takes",
    description:
      "Ranking de Takes por puntos (aciertos según su dificultad, escala 1–20) con el mejor Take de cada usuario, " +
      "más los Takes destacados de la portada. Periodo: «mes» (mes actual) o «todo».",
    inputSchema: {
      type: "object",
      properties: { deporte: SPORT_PROP, periodo: { type: "string", enum: ["mes", "todo"], description: "Por defecto «todo»." } },
      additionalProperties: false,
    },
    run: async (args) => {
      const sport = SPORT_TAKES[choice(args, "deporte", Object.keys(SPORT_TAKES), "todos")];
      const period = choice(args, "periodo", ["mes", "todo"], "todo") === "mes" ? "month" : "all";
      const [details, showcase] = await Promise.all([
        rpc("ae_take_result_ranking_details", { p_sport: sport, p_period: period }),
        safe(rpc("ae_home_take_showcase")),
      ]);
      return {
        periodo: period === "month" ? "mes actual" : "histórico",
        clasificacion: (details ?? []).map((r: any, i: number) => ({
          puesto: i + 1, usuario: r.username, usuario_id: r.user_id, puntos: Number(r.points),
          aciertos: Number(r.correct_takes), resueltos: Number(r.total_resolved),
          mejor_take: r.best_take_id ? { id: r.best_take_id, titulo: r.best_take_title, puntos: r.best_take_points } : null,
        })),
        destacados_portada: Array.isArray(showcase)
          ? showcase.map((s: any) => ({ tipo: s.kind, puesto: s.rank_number, ...shapeTake(s, undefined, 200), puntos: s.points }))
          : showcase,
        ...((details ?? []).length ? {} : { aviso: "Todavía no hay Takes puntuados en este periodo." }),
      };
    },
  },
  {
    name: "picks",
    title: "Picks de la comunidad",
    description:
      "Picks (pronósticos con momio) publicados por la comunidad: selecciones, momio, fecha del partido, estado " +
      "(pendiente/acertado/fallado/anulado) y puntos. Incluye también el Pick de la semana editorial.",
    inputSchema: {
      type: "object",
      properties: {
        estado: { type: "string", enum: ["todos", "pendientes", "acertados", "fallados", "anulados"], description: "Por defecto «todos»." },
        usuario: { type: "string", description: "Solo los de este usuario (opcional)." },
        limite: LIMIT(10, 50),
      },
      additionalProperties: false,
    },
    run: async (args) => {
      const state = choice(args, "estado", ["todos", "pendientes", "acertados", "fallados", "anulados"], "todos");
      const limit = int(args, "limite", 10, 1, 50)!;
      const user = text(args, "usuario", 40);
      let path =
        `ae_community_picks?select=id,author,title,explanation,legs,american_odds,decimal_odds,created_at,event_date,outcome,result_points,moderation_status` +
        `&order=created_at.desc&limit=${limit}`;
      if (state === "pendientes") path += "&outcome=eq.pending";
      if (state === "acertados") path += "&outcome=eq.won";
      if (state === "fallados") path += "&outcome=eq.lost";
      if (state === "anulados") path += "&outcome=eq.void";
      if (user) path += `&author=ilike.${likeTerm(user)}`;
      const [rows, weekly] = await Promise.all([db(path), safe(weeklyPicks(2))]);
      return { total: (rows ?? []).length, picks: (rows ?? []).map(shapePick), pick_de_la_semana: weekly };
    },
  },
  {
    name: "clasificacion_picks",
    title: "Clasificación de Picks",
    description: "Ranking de Picks por puntos (mes actual o histórico). Con «peores» devuelve también el ranking de los que más puntos han perdido.",
    inputSchema: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["mes", "todo"], description: "Por defecto «todo»." },
        peores: { type: "boolean", description: "Incluir el ranking de peores (por defecto no)." },
      },
      additionalProperties: false,
    },
    run: async (args) => {
      const period = choice(args, "periodo", ["mes", "todo"], "todo") === "mes" ? "month" : "all";
      const shape = (rows: any) =>
        Array.isArray(rows)
          ? rows.map((r: any, i: number) => ({ puesto: i + 1, usuario: r.username, usuario_id: r.user_id, puntos: Number(r.points), aciertos: Number(r.correct_picks), resueltos: Number(r.total_resolved) }))
          : rows;
      const [best, worst] = await Promise.all([
        rpc("ae_pick_result_ranking", { p_period: period }),
        args.peores === true ? safe(rpc("ae_pick_result_ranking_worst", { p_period: period })) : Promise.resolve(undefined),
      ]);
      return { periodo: period === "month" ? "mes actual" : "histórico", mejores: shape(best), ...(worst !== undefined ? { peores: shape(worst) } : {}) };
    },
  },
  {
    name: "power_rankings",
    title: "Power Rankings",
    description: "Power Rankings vigentes de NFL y/o Champions League: puesto, equipo, movimiento respecto a la versión anterior y la publicación de análisis.",
    inputSchema: {
      type: "object",
      properties: { liga: { type: "string", enum: ["ambas", "nfl", "champions"], description: "Por defecto «ambas»." } },
      additionalProperties: false,
    },
    run: async (args) => {
      const league = choice(args, "liga", ["ambas", "nfl", "champions"], "ambas");
      const [nfl, champions] = await Promise.all([
        league !== "champions" ? safe(powerRankings("nfl")) : Promise.resolve(undefined),
        league !== "nfl" ? safe(powerRankings("champions")) : Promise.resolve(undefined),
      ]);
      return { ...(nfl ? { nfl } : {}), ...(champions ? { champions } : {}) };
    },
  },
  {
    name: "quiniela",
    title: "Partidos de la quiniela",
    description:
      "Partidos de la Quiniela NFL o de la Quiniela de Fútbol (LaLiga, Premier, Liga MX, Champions): equipos, hora (Toronto), " +
      "momios, probabilidades y puntos que paga cada resultado; si ya se jugó, marcador y resultado. " +
      "Estado: «abiertos» (se puede elegir), «proximos», «resultados» (ya jugados) o «todos».",
    inputSchema: {
      type: "object",
      properties: {
        deporte: { type: "string", enum: ["nfl", "futbol"] },
        competicion: { type: "string", enum: COMPETITIONS, description: "Solo fútbol (opcional)." },
        estado: { type: "string", enum: ["abiertos", "proximos", "resultados", "todos"], description: "Por defecto «abiertos»." },
        semana: { type: "integer", minimum: 1, maximum: 22, description: "Semana NFL (opcional)." },
        jornada: { type: "integer", minimum: 1, maximum: 60, description: "Jornada interna de fútbol (opcional)." },
        limite: LIMIT(20, 60),
      },
      required: ["deporte"],
      additionalProperties: false,
    },
    run: async (args) => {
      const sport = choice(args, "deporte", ["nfl", "futbol"], "");
      if (!sport) throw new ToolError("Falta «deporte» (nfl o futbol).");
      const state = choice(args, "estado", ["abiertos", "proximos", "resultados", "todos"], "abiertos");
      const limit = int(args, "limite", 20, 1, 60)!;
      const isNfl = sport === "nfl";
      const table = isNfl ? "cam_nfl_games" : "cam_football_games";
      const cols = isNfl
        ? "id,season,week,home_id,away_id,kickoff,status,home_score,away_score,winner_id,odds_home,odds_away,probability_home,probability_away,points_home,points_away,picks_open"
        : "id,competition,season,matchday,home_id,away_id,kickoff,status,home_score,away_score,outcome,odds_home,odds_draw,odds_away,probability_home,probability_draw,probability_away,points_home,points_draw,points_away,picks_open";
      let path = `${table}?select=${cols}&limit=${limit}&order=kickoff.${state === "resultados" ? "desc" : "asc"}`;
      if (state === "abiertos") path += "&picks_open=eq.true&status=eq.scheduled";
      if (state === "proximos") path += "&status=eq.scheduled";
      if (state === "resultados") path += "&status=eq.final";
      if (isNfl) {
        const week = int(args, "semana", null, 1, 22);
        if (week) path += `&week=eq.${week}&season=eq.${await latestSeason("nfl")}`;
      } else {
        const comp = text(args, "competicion", 20);
        if (comp) {
          if (!COMPETITIONS.includes(comp.toLowerCase())) throw new ToolError(`«competicion» debe ser una de: ${COMPETITIONS.join(", ")}.`);
          path += `&competition=eq.${comp.toLowerCase()}`;
        }
        const matchday = int(args, "jornada", null, 1, 60);
        if (matchday) path += `&matchday=eq.${matchday}&season=eq.${await latestSeason("futbol")}`;
      }
      const games = (await db(path)) ?? [];
      const names = await teamNames(isNfl ? "nfl_teams" : "cam_football_teams", games.flatMap((g: any) => [g.home_id, g.away_id]));
      const n = (id: string) => names.get(id) ?? id;
      return {
        quiniela: isNfl ? "NFL" : "Fútbol",
        estado: state,
        total: games.length,
        partidos: games.map((g: any) => {
          const played = g.status === "final";
          const result = !played
            ? null
            : isNfl
            ? (g.winner_id ? `gana ${n(g.winner_id)}` : "sin ganador")
            : ({ home: `gana ${n(g.home_id)}`, away: `gana ${n(g.away_id)}`, draw: "empate" } as Record<string, string>)[g.outcome] ?? null;
          return {
            id: g.id,
            ...(isNfl ? { semana: g.week } : { competicion: COMPETITION_NAME[g.competition] ?? g.competition, jornada: g.matchday }),
            local: n(g.home_id),
            visitante: n(g.away_id),
            inicio: local(g.kickoff),
            estado: g.status,
            abierto: !!g.picks_open,
            marcador: g.home_score === null || g.home_score === undefined ? null : `${n(g.home_id)} ${g.home_score} - ${g.away_score} ${n(g.away_id)}`,
            resultado: result,
            momios: isNfl ? { local: g.odds_home, visitante: g.odds_away } : { local: g.odds_home, empate: g.odds_draw, visitante: g.odds_away },
            probabilidad: isNfl
              ? { local: pct(g.probability_home), visitante: pct(g.probability_away) }
              : { local: pct(g.probability_home), empate: pct(g.probability_draw), visitante: pct(g.probability_away) },
            puntos: isNfl
              ? { local: g.points_home, visitante: g.points_away }
              : { local: g.points_home, empate: g.points_draw, visitante: g.points_away },
          };
        }),
      };
    },
  },
  {
    name: "clasificacion_quiniela",
    title: "Clasificación de la quiniela",
    description:
      "Clasificación de la Quiniela NFL o de Fútbol. Periodo: «temporada» (por defecto), «mes», «todo», «semana» (NFL) o «jornada» (fútbol, " +
      "necesita competición). Si no se indica semana/jornada se usa la última con partidos terminados.",
    inputSchema: {
      type: "object",
      properties: {
        deporte: { type: "string", enum: ["nfl", "futbol"] },
        periodo: { type: "string", enum: ["temporada", "mes", "todo", "semana", "jornada"] },
        competicion: { type: "string", enum: COMPETITIONS, description: "Solo fútbol (opcional; obligatoria con «jornada»)." },
        temporada: { type: "integer", minimum: 2020, maximum: 2100 },
        semana: { type: "integer", minimum: 1, maximum: 22 },
        jornada: { type: "integer", minimum: 1, maximum: 60 },
        mes: { type: "string", description: "Mes AAAA-MM (por defecto el actual)." },
        limite: LIMIT(20, 100),
      },
      required: ["deporte"],
      additionalProperties: false,
    },
    run: async (args) => {
      const sport = choice(args, "deporte", ["nfl", "futbol"], "");
      if (!sport) throw new ToolError("Falta «deporte» (nfl o futbol).");
      const period = choice(args, "periodo", ["temporada", "mes", "todo", "semana", "jornada"], "temporada");
      const limit = int(args, "limite", 20, 1, 100)!;
      const season = int(args, "temporada", null, 2020, 2100) ?? (await latestSeason(sport as "nfl" | "futbol"));
      const month = text(args, "mes", 7) ?? torontoMonth();
      if (period === "mes" && !/^\d{4}-\d{2}$/.test(month)) throw new ToolError("«mes» debe tener el formato AAAA-MM.");
      let rows: any[];
      let detail: Json = {};
      if (sport === "nfl") {
        if (period === "jornada") throw new ToolError("En la NFL se usa «semana», no «jornada».");
        let week: number | null = null;
        if (period === "semana") {
          week = int(args, "semana", null, 1, 22);
          if (!week) {
            const last = await db(`cam_nfl_games?select=week&season=eq.${season}&status=eq.final&order=week.desc&limit=1`);
            week = last?.[0]?.week ?? null;
            if (!week) throw new ToolError("Todavía no hay semanas terminadas en esa temporada.");
          }
          detail = { semana: week };
        }
        const scope = { temporada: "season", mes: "month", todo: "all", semana: "week" }[period]!;
        rows = await rpc("cam_nfl_leaderboard", { p_scope: scope, p_season: season, p_week: week, p_month: period === "mes" ? month : null });
      } else {
        if (period === "semana") throw new ToolError("En fútbol se usa «jornada», no «semana».");
        const comp = text(args, "competicion", 20)?.toLowerCase() ?? null;
        if (comp && !COMPETITIONS.includes(comp)) throw new ToolError(`«competicion» debe ser una de: ${COMPETITIONS.join(", ")}.`);
        let matchday: number | null = null;
        if (period === "jornada") {
          if (!comp) throw new ToolError("Para la clasificación por jornada indica la «competicion».");
          matchday = int(args, "jornada", null, 1, 60);
          if (!matchday) {
            const last = await db(`cam_football_games?select=matchday&season=eq.${season}&competition=eq.${comp}&status=eq.final&order=matchday.desc&limit=1`);
            matchday = last?.[0]?.matchday ?? null;
            if (!matchday) throw new ToolError("Todavía no hay jornadas terminadas en esa competición.");
          }
          detail = { jornada: matchday };
        }
        const scope = { temporada: "season", mes: "month", todo: "all", jornada: "matchday" }[period]!;
        rows = await rpc("cam_football_leaderboard", {
          p_scope: scope, p_season: season, p_competition: comp, p_matchday: matchday, p_month: period === "mes" ? month : null,
        });
        if (comp) detail.competicion = COMPETITION_NAME[comp];
      }
      const list = (rows ?? []).slice(0, limit);
      return {
        quiniela: sport === "nfl" ? "NFL" : "Fútbol",
        periodo: period,
        temporada: season,
        ...(period === "mes" ? { mes: month } : {}),
        ...detail,
        clasificacion: list.map((r: any) => ({
          puesto: Number(r.rank_position), usuario: r.username, usuario_id: r.user_id, puntos: Number(r.points),
          aciertos: Number(r.hits), resueltos: Number(r.resolved), acierto: r.accuracy === null ? null : `${Math.round(Number(r.accuracy) * 10) / 10}%`,
        })),
        ...(list.length ? {} : { aviso: "Todavía no hay partidos resueltos con elecciones en este periodo." }),
      };
    },
  },
  {
    name: "quien_sera_campeon",
    title: "¿Quién será campeón?",
    description:
      "Preguntas de «¿Quién será campeón?» (LaLiga, Premier, Liga MX, Champions, NFL): estado, cierre, opciones con los puntos que paga cada una " +
      "(menos puntos = más favorito) y, si ya se resolvió, el campeón.",
    inputSchema: {
      type: "object",
      properties: {
        competicion: { type: "string", enum: [...COMPETITIONS, "nfl"], description: "Opcional." },
        estado: { type: "string", enum: ["abiertas", "todas"], description: "Por defecto «todas» (sin las anuladas)." },
      },
      additionalProperties: false,
    },
    run: async (args) => {
      const comp = choice(args, "competicion", [...COMPETITIONS, "nfl"], "");
      const state = choice(args, "estado", ["abiertas", "todas"], "todas");
      let path = "ae_take_questions?select=id,competition,season,period,prompt,closes_at,status,correct_option_id,settled_at&status=neq.void&order=closes_at.desc&limit=20";
      if (comp) path += `&competition=eq.${comp}`;
      if (state === "abiertas") path += "&status=eq.open";
      const questions = (await db(path)) ?? [];
      const ids = questions.map((q: any) => q.id);
      const options = ids.length ? (await db(`ae_take_options?select=id,question_id,label,points&question_id=in.(${ids.join(",")})`)) ?? [] : [];
      const now = Date.now();
      return {
        preguntas: questions.map((q: any) => {
          const opts = options
            .filter((o: any) => o.question_id === q.id)
            .sort((a: any, b: any) => (a.points ?? 99) - (b.points ?? 99) || String(a.label).localeCompare(String(b.label)));
          return {
            id: q.id,
            competicion: COMPETITION_NAME[q.competition] ?? q.competition,
            temporada: q.season,
            pregunta: q.prompt,
            estado: q.status === "open" && new Date(q.closes_at).getTime() < now ? "cerrada, pendiente de validar" : q.status,
            cierra: local(q.closes_at),
            campeon: q.correct_option_id ? opts.find((o: any) => o.id === q.correct_option_id)?.label ?? null : null,
            opciones: opts.map((o: any) => ({ opcion: o.label, puntos: o.points })),
          };
        }),
      };
    },
  },
  {
    name: "visitas",
    title: "Visitas de la web",
    description:
      "Estadísticas de visitas de camsports.github.io (solo para el dueño): hoy, últimos 7 y 30 días, visitantes únicos, " +
      "visitas por día (últimas 2 semanas), de dónde llegan, campañas y secciones más vistas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const s = await rpc("cam_mcp_analytics_summary", {}, true);
      return {
        hoy: s.today_visits,
        ultimos_7_dias: s.last7_visits,
        ultimos_30_dias: s.last30_visits,
        visitantes_unicos_7_dias: s.unique7,
        visitantes_unicos_30_dias: s.unique30,
        total_registrado: s.total_visits,
        por_dia: s.daily,
        origen_30_dias: s.sources,
        campanas_30_dias: s.campaigns,
        secciones_30_dias: s.sections,
        nota: "Hora de Toronto. Desde el 26 oct 2026 no se registran navegadores automáticos; los días anteriores incluyen visitas de robots de pruebas.",
      };
    },
  },
  {
    name: "perfil_jugador",
    title: "Perfil de un usuario",
    description:
      "Perfil público de un usuario de CAM Sports: sus Takes, perfil de prestigio (riesgo, hazañas, legendarios), elecciones de campeón, " +
      "resumen en las quinielas NFL y Fútbol y sus Picks. Acepta el nombre de usuario o su id.",
    inputSchema: {
      type: "object",
      properties: {
        usuario: { type: "string", description: "Nombre de usuario (p. ej. el que sale en una clasificación)." },
        usuario_id: { type: "string", description: "Identificador (UUID) del usuario, si se conoce." },
      },
      additionalProperties: false,
    },
    run: async (args) => {
      let id = uuid(args, "usuario_id", false);
      const name = text(args, "usuario", 40);
      if (!id && !name) throw new ToolError("Indica «usuario» o «usuario_id».");
      const season = await latestSeason("nfl");
      if (!id) {
        const wanted = name!.toLowerCase().replace(/^@/, "");
        const sources = await Promise.all([
          safe(rpc("ae_public_take_feed", { p_sport: "all" })),
          safe(rpc("ae_pick_result_ranking", { p_period: "all" })),
          safe(rpc("ae_take_result_ranking", { p_sport: "all", p_period: "all" })),
          safe(rpc("cam_nfl_leaderboard", { p_scope: "all", p_season: season, p_week: null, p_month: null })),
          safe(rpc("cam_football_leaderboard", { p_scope: "all", p_season: season, p_competition: null, p_matchday: null, p_month: null })),
        ]);
        for (const list of sources) {
          if (!Array.isArray(list)) continue;
          const hit = list.find((r: any) => String(r.author ?? r.username ?? "").toLowerCase() === wanted);
          if (hit) {
            id = hit.author_id ?? hit.user_id;
            break;
          }
        }
        if (!id) throw new ToolError(`No encontré a «${name}» en Takes, Picks ni quinielas.`);
      }
      const [takes, prestige, legendary, champions, nfl, football, picks] = await Promise.all([
        safe(rpc("ae_public_take_profile", { p_author_id: id })),
        safe(rpc("ae_take_prestige", { p_user_id: id })),
        safe(rpc("ae_take_legendary", { p_user_id: id })),
        safe(rpc("ae_user_champion_picks", { p_user_id: id })),
        safe(rpc("cam_nfl_profile_summary", { p_user_id: id, p_season: season })),
        safe(rpc("cam_football_profile_summary", { p_user_id: id, p_season: season })),
        safe(db(
          `ae_community_picks?select=id,author,title,explanation,legs,american_odds,decimal_odds,created_at,event_date,outcome,result_points,moderation_status&user_id=eq.${id}&order=created_at.desc&limit=10`,
        )),
      ]);
      const first = (r: any) => (Array.isArray(r) ? r[0] ?? null : r);
      const p = first(prestige);
      const nflRow = first(nfl);
      const fbRow = first(football);
      const quiniela = (r: any, extra: Json) =>
        !r || "error" in r
          ? r
          : { puntos: Number(r.points ?? 0), aciertos: Number(r.hits ?? 0), resueltos: Number(r.resolved ?? 0), acierto: r.accuracy === null ? null : `${r.accuracy}%`, puesto: r.rank_position, ...extra };
      return {
        usuario_id: id,
        usuario: Array.isArray(takes) && takes[0] ? takes[0].author : name,
        temporada_quinielas: season,
        takes: Array.isArray(takes) ? takes.slice(0, 15).map((t: any) => shapeTake(t, undefined, 300)) : takes,
        prestigio: !p || "error" in p
          ? p
          : {
            takes_resueltos: Number(p.resolved ?? 0), riesgo_medio: p.risk_score, perfil: p.risk_label,
            intentos_dificiles: Number(p.bold_attempts ?? 0), hazanas: Number(p.bold_hits ?? 0), porcentaje_hazanas: p.bold_rate,
            legendarios: Number(p.legendary_count ?? 0), puntos: Number(p.rated_points ?? 0),
          },
        takes_legendarios: Array.isArray(legendary)
          ? legendary.map((l: any) => ({ id: l.take_id, titulo: l.title, competicion: l.competition, temporada: l.season_label, puntos: l.points, probabilidad: pct(l.probability), fecha: local(l.scored_at) }))
          : legendary,
        campeones_elegidos: Array.isArray(champions)
          ? champions.map((c: any) => ({
            competicion: COMPETITION_NAME[c.competition] ?? c.competition, temporada: c.season, equipo: c.team, puntos: c.points,
            estado: c.state, puntos_ganados: c.awarded_points, campeon: c.winner, cierra: local(c.closes_at),
          }))
          : champions,
        quiniela_nfl: quiniela(nflRow, nflRow && !("error" in nflRow) ? { ultima_semana: nflRow.last_week, puntos_ultima_semana: nflRow.last_week_points } : {}),
        quiniela_futbol: quiniela(fbRow, fbRow && !("error" in fbRow)
          ? { ultima_competicion: COMPETITION_NAME[fbRow.last_competition] ?? fbRow.last_competition, ultima_jornada: fbRow.last_matchday, puntos_ultima_jornada: fbRow.last_points }
          : {}),
        picks: Array.isArray(picks) ? picks.map(shapePick) : picks,
      };
    },
  },
];

// ───────────────────────────── administración ─────────────────────────────
//
// Las herramientas admin_* pasan por public.cam_mcp_admin (clave secreta, solo service_role).
// Esa función actúa como la cuenta de administrador del dueño y llama a las mismas funciones
// que usa la web, así que sus reglas (cierres, bloqueos, validaciones) valen igual aquí.
// Cada cambio queda en cam_mcp_private.admin_log («admin_consultar» → registro).

async function admin(action: string, args: Json = {}): Promise<any> {
  const out = await rpc("cam_mcp_admin", { p_action: action, p_args: args }, true);
  if (!out || typeof out !== "object") throw new ToolError("La base de datos no devolvió respuesta.");
  if (out.ok !== true) {
    const reason = String(out.error ?? "error desconocido").replace(/^(RCM|AE_[A-Z]+):\s*/, "");
    throw new ToolError(`No se hizo el cambio: ${reason}`);
  }
  return out.result;
}
const adminRpc = (fn: string, args: Json = {}) => admin("rpc", { fn, args });

const norm = (v: unknown) =>
  String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Texto obligatorio u opcional con límites (sin recortar en silencio). */
function content(args: Args, name: string, opts: { min?: number; max: number; required?: boolean }): string | null {
  const v = args[name];
  if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
    if (opts.required) throw new ToolError(`Falta «${name}».`);
    return null;
  }
  if (typeof v !== "string") throw new ToolError(`«${name}» debe ser texto.`);
  const clean = v.trim();
  if (clean.length < (opts.min ?? 1) || clean.length > opts.max) {
    throw new ToolError(`«${name}» debe tener entre ${opts.min ?? 1} y ${opts.max} caracteres (tiene ${clean.length}).`);
  }
  return clean;
}
function bool(args: Args, name: string): boolean | null {
  const v = args[name];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v;
  const n = norm(v);
  if (["true", "si", "1"].includes(n)) return true;
  if (["false", "no", "0"].includes(n)) return false;
  throw new ToolError(`«${name}» debe ser verdadero o falso.`);
}
function needInt(args: Args, name: string, min: number, max: number): number {
  const n = int(args, name, null, min, max);
  if (n === null) throw new ToolError(`Falta «${name}».`);
  return n;
}
function https(args: Args, name: string): string | null {
  const v = text(args, name, 2048);
  if (!v) return null;
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?(\/\S*)?$/.test(v)) throw new ToolError(`«${name}» debe ser un enlace que empiece por https://`);
  return v;
}

/** Desfase de Toronto (minutos) en un instante dado. */
function torontoOffset(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - utcMs) / 60000;
}
/** Fecha y hora: con zona horaria se respeta; sin ella se entiende hora de Toronto. */
function when(args: Args, name: string, opts: { required?: boolean; defaultTime?: string } = {}): string | null {
  const v = text(args, name, 40);
  if (!v) {
    if (opts.required) throw new ToolError(`Falta «${name}» (fecha y hora, p. ej. 2026-11-09 20:00, hora de Toronto).`);
    return null;
  }
  if (/(z|[+-]\d{2}:?\d{2})$/i.test(v)) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new ToolError(`«${name}» no es una fecha válida.`);
    return d.toISOString();
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (!m) throw new ToolError(`«${name}» debe tener el formato AAAA-MM-DD HH:MM (hora de Toronto).`);
  const [hh, mm] = m[4] ? [m[4], m[5]] : (opts.defaultTime ?? "23:59").split(":");
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +hh, +mm);
  let utc = guess - torontoOffset(guess) * 60000;
  utc = guess - torontoOffset(utc) * 60000; // ajuste en los cambios de horario
  return new Date(utc).toISOString();
}
function day(args: Args, name: string, required = true): string | null {
  const v = text(args, name, 10);
  if (!v) {
    if (required) throw new ToolError(`Falta «${name}» (AAAA-MM-DD).`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T12:00:00Z`))) throw new ToolError(`«${name}» debe ser una fecha AAAA-MM-DD.`);
  return v;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** Texto plano → el HTML que guarda el editor de noticias (un párrafo por línea, ## subtítulo, **negrita**). */
function textToHtml(value: string): string {
  const inline = (s: string) => escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return value.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const h = line.match(/^(#{2,3})\s+(.+)$/);
    if (h) return h[1].length === 2 ? `<h2>${inline(h[2])}</h2>` : `<h3>${inline(h[2])}</h3>`;
    return `<p>${inline(line)}</p>`;
  }).join("");
}

const NEWS_CATEGORIES: Record<string, string> = {
  futbol: "Fútbol", nfl: "NFL", picks: "Picks", colegial: "Fútbol Americano Colegial", "futbol americano colegial": "Fútbol Americano Colegial",
  nba: "Básquetbol", basquetbol: "Básquetbol", baloncesto: "Básquetbol", tenis: "Tenis", ciclismo: "Ciclismo",
};
// Las mismas imágenes por defecto que usa la web (index.html → categoryFallbackImages).
const NEWS_FALLBACK: Record<string, string> = {
  "Fútbol": "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&auto=format&fit=crop&q=80",
  "Fútbol Americano Colegial": "https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=800&auto=format&fit=crop&q=80",
  "NFL": "https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=800&auto=format&fit=crop&q=80",
  "Básquetbol": "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&auto=format&fit=crop&q=80",
  "Tenis": "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=800&auto=format&fit=crop&q=80",
  "Ciclismo": "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800&auto=format&fit=crop&q=80",
};
function newsCategory(args: Args, required: boolean): string | null {
  const v = text(args, "categoria", 40);
  if (!v) {
    if (required) throw new ToolError("Falta «categoria» (Fútbol, NFL, Picks, Fútbol Americano Colegial, NBA, Tenis o Ciclismo).");
    return null;
  }
  const c = NEWS_CATEGORIES[norm(v)];
  if (!c) throw new ToolError("«categoria» debe ser Fútbol, NFL, Picks, Fútbol Americano Colegial, NBA, Tenis o Ciclismo.");
  return c;
}

const TEAM_ALIASES: Record<string, string> = {
  psg: "paris saint germain", atleti: "atletico", barca: "barcelona", niners: "49ers", "man city": "manchester city",
  "man united": "manchester united", "man utd": "manchester united", "inter de milan": "inter", spurs: "tottenham",
};
type Team = { id: string; name: string };
function findTeam(rows: Team[], wanted: string): Team {
  const w0 = norm(wanted);
  const w = TEAM_ALIASES[w0] ?? w0;
  const byId = rows.find((r) => norm(r.id) === w0);
  if (byId) return byId;
  const exact = rows.filter((r) => norm(r.name) === w);
  if (exact.length === 1) return exact[0];
  const partial = rows.filter((r) => ` ${norm(r.name)} `.includes(` ${w} `));
  if (partial.length === 1) return partial[0];
  const options = (partial.length ? partial : rows).slice(0, 40).map((r) => r.name).join(", ");
  throw new ToolError(partial.length ? `«${wanted}» es ambiguo: ${options}.` : `No reconozco el equipo «${wanted}». Opciones: ${options}.`);
}
function teamList(args: Args, name: string, count: number): string[] {
  const v = args[name];
  if (!Array.isArray(v) || v.length !== count || v.some((x) => typeof x !== "string" || !x.trim())) {
    throw new ToolError(`«${name}» debe ser una lista de ${count} equipos en orden (del 1 al ${count}).`);
  }
  return v.map((x) => String(x).trim());
}

const OUTCOME: Record<string, string> = { acertado: "won", fallado: "lost", anulado: "void" };
const outcome = (args: Args, allowed: string[]) => OUTCOME[choice(args, "resultado", allowed, "")] ?? (() => {
  throw new ToolError(`Falta «resultado» (${allowed.join(", ")}).`);
})();

function accion(args: Args, allowed: string[]): string {
  const a = choice(args, "accion", allowed, "");
  if (!a) throw new ToolError(`Falta «accion» (${allowed.join(", ")}).`);
  return a;
}
const ACTION = (allowed: string[], description: string) => ({ type: "string", enum: allowed, description });

async function takesQueue(sport: "nfl" | "football", state: string, limit: number) {
  const rows = (await adminRpc("ae_take_review_queue", { p_sport: sport })) ?? [];
  const filtered = rows.filter((r: any) => (state === "pendientes" ? !r.outcome : state === "puntuados" ? !!r.outcome : true));
  return {
    sin_puntuar: rows.filter((r: any) => !r.outcome).length,
    takes: filtered.slice(0, limit).map((r: any) => ({
      id: r.id, titulo: r.title, autor: r.author, deporte: r.sport, publicado: local(r.created_at),
      resultado: r.outcome ? PICK_STATE[r.outcome] ?? r.outcome : "sin puntuar", puntos: r.points, puntuado: local(r.scored_at),
    })),
  };
}

function shapeAdminPick(p: any) {
  return {
    id: p.id, autor: p.author, titulo: p.title, momio_americano: p.american_odds, fecha_partido: p.event_date, publicado: local(p.created_at),
    selecciones: (Array.isArray(p.legs) ? p.legs : []).map((l: any) => ({ evento: l.event ?? null, seleccion: l.selection ?? null, momio: l.odds ?? null })),
    enlace: pickLink(p.id),
  };
}

async function weeklyAdmin(page = 0) {
  const rows = (await adminRpc("cam_admin_weekly_results", { p_offset: page * 20 })) ?? [];
  return rows.map((w: any) => ({
    id: w.id, titulo: w.title, evento: w.event_name, seleccion: w.selection, momio_americano: w.american_odds,
    publicado: local(w.created_at), cierra: local(w.expires_at), publicado_en_web: w.is_published,
    resultado: w.outcome ? PICK_STATE[w.outcome] ?? w.outcome : (w.expires_at && Date.parse(w.expires_at) < Date.now() ? "pendiente de resultado" : "en juego"),
    resuelto: local(w.resolved_at), redes: w.social,
  }));
}

async function outlookSnapshot(args: Args) {
  const id = uuid(args, "matriz_id", false);
  if (id) return id;
  const comp = choice(args, "competicion", ["laliga", "premier", "ligamx"], "");
  if (!comp) throw new ToolError("Indica «matriz_id» o la «competicion» (laliga, premier o ligamx).");
  let path = `ae_outlook_snapshots?select=id&competition=eq.${comp}&order=as_of.desc&limit=1`;
  const season = text(args, "temporada", 20);
  if (season) path += `&season=eq.${encodeURIComponent(season)}`;
  const rows = await db(path);
  if (!rows?.[0]) throw new ToolError("No hay matrices publicadas para esa competición.");
  return rows[0].id as string;
}

const ADMIN_READ_TOOLS: Tool[] = [
  {
    name: "admin_pendientes",
    title: "Pendientes de administración",
    description:
      "Lo que espera una acción del administrador ahora mismo: Takes sin puntuar (NFL y Fútbol), Picks por moderar y por resolver, " +
      "Pick del editor sin resultado, preguntas de «¿Quién será campeón?» cerradas sin validar y partidos de quiniela empezados hace más de 4 h " +
      "sin resultado final. Solo consulta. Úsala para «¿qué tengo pendiente?».",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => {
      const lateIso = new Date(Date.now() - 4 * 3600_000).toISOString();
      const [nfl, football, picks, weekly, questions, nflGames, fbGames] = await Promise.all([
        safe(takesQueue("nfl", "pendientes", 10)),
        safe(takesQueue("football", "pendientes", 10)),
        safe(admin("picks_pendientes", { limit: 15 })),
        safe(weeklyAdmin()),
        safe(db("ae_take_questions?select=id,competition,season,period,prompt,closes_at&status=eq.open&order=closes_at.asc&limit=40")),
        safe(db(`cam_nfl_games?select=id,week,home_id,away_id,kickoff,status&status=not.in.(final,tie,cancelled)&kickoff=lt.${lateIso}&order=kickoff.asc&limit=30`)),
        safe(db(`cam_football_games?select=id,competition,matchday,home_id,away_id,kickoff,status&status=not.in.(final,cancelled)&kickoff=lt.${lateIso}&order=kickoff.asc&limit=30`)),
      ]);
      const games = async (rows: any, table: "nfl_teams" | "cam_football_teams") => {
        if (!Array.isArray(rows)) return rows;
        const names = await teamNames(table, rows.flatMap((g: any) => [g.home_id, g.away_id])).catch(() => new Map());
        return rows.map((g: any) => ({
          id: g.id, ...(g.week ? { semana: g.week } : { competicion: COMPETITION_NAME[g.competition] ?? g.competition, jornada: g.matchday }),
          partido: `${names.get(g.away_id) ?? g.away_id} @ ${names.get(g.home_id) ?? g.home_id}`, inicio: local(g.kickoff), estado: g.status,
        }));
      };
      const now = Date.now();
      const closed = Array.isArray(questions) ? questions.filter((q: any) => Date.parse(q.closes_at) < now) : [];
      return {
        takes_sin_puntuar: { nfl, futbol: football },
        picks: picks && !("error" in picks)
          ? {
            por_moderar: (picks.por_moderar ?? []).map(shapeAdminPick),
            por_resolver: (picks.por_resolver ?? []).map(shapeAdminPick),
            aprobados_por_jugarse: picks.por_jugarse,
          }
          : picks,
        pick_del_editor_sin_resultado: Array.isArray(weekly) ? weekly.filter((w: any) => w.resultado === "pendiente de resultado") : weekly,
        quien_sera_campeon: Array.isArray(questions)
          ? {
            preguntas_semanales_por_resolver: closed.filter((q: any) => q.period !== "season")
              .map((q: any) => ({ id: q.id, pregunta: q.prompt, cerro: local(q.closes_at) })),
            temporada_en_juego: closed.filter((q: any) => q.period === "season")
              .map((q: any) => ({ id: q.id, pregunta: q.prompt, nota: "Se valida cuando haya campeón." })),
          }
          : questions,
        quiniela_sin_resultado: { nfl: await games(nflGames, "nfl_teams"), futbol: await games(fbGames, "cam_football_teams") },
        nota: "Los resultados de las quinielas se cargan solos cada 10 minutos; aquí salen los que llevan más de 4 h sin cerrarse.",
      };
    },
  },
  {
    name: "admin_consultar",
    title: "Consultar (administración)",
    description:
      "Consultas que solo ve el administrador. «tipo»: takes_por_puntuar (deporte, estado), picks_pendientes, pick_editor (historial con resultados), " +
      "noticias (sin id: lista con las ocultas; con id: completa), opiniones (incluye borradores), redes (estado de las publicaciones automáticas), " +
      "mensajes_redes (mensajes promocionales; filtro «tema»), textos_sitio (textos personalizados), parties (todos), " +
      "matriz (puntos por posición de una matriz de LaLiga/Premier/Liga MX) y registro (últimos cambios hechos desde Claude).",
    inputSchema: {
      type: "object",
      properties: {
        tipo: {
          type: "string",
          enum: ["takes_por_puntuar", "picks_pendientes", "pick_editor", "noticias", "opiniones", "redes", "mensajes_redes", "textos_sitio", "parties", "matriz", "registro"],
        },
        id: { type: "string", description: "Noticia u opinión concreta (opcional)." },
        deporte: { type: "string", enum: ["nfl", "futbol"], description: "takes_por_puntuar (por defecto los dos)." },
        estado: { type: "string", enum: ["pendientes", "puntuados", "todos"], description: "takes_por_puntuar (por defecto «pendientes»)." },
        tema: { type: "string", enum: ["picks", "takes", "campeon", "noticias", "opiniones", "rankings", "prestigio", "comunidad"], description: "mensajes_redes." },
        competicion: { type: "string", enum: ["laliga", "premier", "ligamx"], description: "matriz: la más reciente de esa competición." },
        temporada: { type: "string", description: "matriz (p. ej. 2026/27)." },
        matriz_id: { type: "string", description: "matriz concreta (opcional)." },
        pagina: { type: "integer", minimum: 0, maximum: 50, description: "pick_editor (de 20 en 20)." },
        limite: LIMIT(20, 100),
      },
      required: ["tipo"],
      additionalProperties: false,
    },
    run: async (args) => {
      const tipo = choice(args, "tipo", ["takes_por_puntuar", "picks_pendientes", "pick_editor", "noticias", "opiniones", "redes", "mensajes_redes", "textos_sitio", "parties", "matriz", "registro"], "");
      const limit = int(args, "limite", 20, 1, 100)!;
      switch (tipo) {
        case "takes_por_puntuar": {
          const state = choice(args, "estado", ["pendientes", "puntuados", "todos"], "pendientes");
          const sport = choice(args, "deporte", ["nfl", "futbol"], "");
          const [nfl, futbol] = await Promise.all([
            sport !== "futbol" ? takesQueue("nfl", state, limit) : Promise.resolve(undefined),
            sport !== "nfl" ? takesQueue("football", state, limit) : Promise.resolve(undefined),
          ]);
          return { ...(nfl ? { nfl } : {}), ...(futbol ? { futbol } : {}), siguiente_paso: "admin_takes: accion «dificultad» y después «resultado»." };
        }
        case "picks_pendientes": {
          const r = await admin("picks_pendientes", { limit });
          return { por_moderar: r.por_moderar.map(shapeAdminPick), por_resolver: r.por_resolver.map(shapeAdminPick), aprobados_por_jugarse: r.por_jugarse };
        }
        case "pick_editor":
          return { picks_del_editor: await weeklyAdmin(int(args, "pagina", 0, 0, 50)!) };
        case "noticias": {
          const id = uuid(args, "id", false);
          if (id) {
            const a = await admin("noticia_ver", { id });
            return { ...a, body: undefined, texto: clip(htmlToText(a.body), 20000), html: clip(a.body, 20000), visible: a.is_public };
          }
          return { noticias: await admin("noticia_ver", { limit }) };
        }
        case "opiniones": {
          const id = uuid(args, "id", false);
          return id ? await admin("opinion_ver", { id }) : { opiniones: await admin("opinion_ver", { limit }) };
        }
        case "redes": {
          const r = await admin("redes_estado");
          if (r?.general?.recent) r.general.recent = r.general.recent.slice(0, 10);
          return r;
        }
        case "mensajes_redes":
          return { mensajes: await admin("redes_mensajes", text(args, "tema", 20) ? { theme: text(args, "tema", 20) } : {}) };
        case "textos_sitio":
          return {
            textos_personalizados: await admin("sitio_textos"),
            nota: "Solo salen los textos ya cambiados. Las claves de los demás están en assets/cam-site-texts.js (o en el modo Textos del editor del sitio).",
          };
        case "parties":
          return { parties: await adminRpc("cam_party_admin_list") };
        case "matriz": {
          const id = await outlookSnapshot(args);
          const [meta, rows] = await Promise.all([
            db(`ae_outlook_snapshots?select=id,competition,season,as_of,table_size,note&id=eq.${id}`),
            adminRpc("ae_outlook_points_matrix", { p_snapshot_id: id }),
          ]);
          return { matriz: meta?.[0] ?? { id }, filas: rows };
        }
        case "registro":
          return { cambios: await admin("registro", { limit }) };
        default:
          throw new ToolError("Falta «tipo».");
      }
    },
  },
];

const ADMIN_TOOLS: Tool[] = [
  {
    name: "admin_takes",
    title: "Administrar Takes",
    description:
      "Puntúa y modera Takes, en dos pasos como en la web. " +
      "«dificultad»: calcula la probabilidad y los puntos (escala 1–20) con «metodo» = tabla (competicion laliga/premier/ligamx, temporada, equipo, " +
      "condicion exacta/o_mejor/o_peor y posicion; usa la matriz vigente cuando se publicó el Take), cuota (momio americano) o nivel " +
      "(casi_seguro 92 %, muy_probable 75 %, probable 55 %, parejo 40 %, sorpresa 20 %, bombazo 7 %, locura 2 %, historica 0,8 %). " +
      "Con un Take ya puntuado hay que poner recalcular = true. «resultado»: acertado o fallado (los triviales ≥ 90 % no puntúan). " +
      "«ocultar»: oculta un Take para todos. «ocultar_respuesta»: oculta una respuesta de su conversación (respuesta_id).",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(["dificultad", "resultado", "ocultar", "ocultar_respuesta"], "Qué hacer."),
        take_id: { type: "string" },
        metodo: { type: "string", enum: ["tabla", "cuota", "nivel"] },
        nivel: { type: "string", enum: ["casi_seguro", "muy_probable", "probable", "parejo", "sorpresa", "bombazo", "locura", "historica"] },
        momio: { type: "integer", description: "Momio americano (p. ej. +350 o -150)." },
        competicion: { type: "string", enum: ["laliga", "premier", "ligamx"] },
        temporada: { type: "string", description: "Temporada de la matriz, p. ej. 2026/27." },
        equipo: { type: "string" },
        condicion: { type: "string", enum: ["exacta", "o_mejor", "o_peor"], description: "o_mejor = termina en esa posición o más arriba." },
        posicion: { type: "integer", minimum: 1, maximum: 30 },
        recalcular: { type: "boolean" },
        resultado: { type: "string", enum: ["acertado", "fallado"] },
        respuesta_id: { type: "string" },
      },
      required: ["accion"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["dificultad", "resultado", "ocultar", "ocultar_respuesta"]);
      if (a === "ocultar_respuesta") {
        const hidden = await adminRpc("ae_hide_take_reply", { p_reply_id: uuid(args, "respuesta_id") });
        return { hecho: true, oculta: hidden, nota: hidden ? "Respuesta oculta." : "Ya estaba oculta." };
      }
      const take = uuid(args, "take_id")!;
      if (a === "ocultar") {
        const hidden = await adminRpc("ae_hide_free_take", { p_take_id: take });
        return { hecho: true, oculto: hidden, nota: hidden ? "Take oculto para todos." : "Ya estaba oculto." };
      }
      if (a === "resultado") {
        const points = await adminRpc("ae_score_free_take_auto", { p_take_id: take, p_outcome: outcome(args, ["acertado", "fallado"]) });
        return { hecho: true, take_id: take, resultado: choice(args, "resultado", ["acertado", "fallado"], ""), puntos: points };
      }
      const method = choice(args, "metodo", ["tabla", "cuota", "nivel"], "");
      if (!method) throw new ToolError("Falta «metodo» (tabla, cuota o nivel).");
      const call: Json = { p_take_id: take, p_rescore: bool(args, "recalcular") ?? false };
      if (method === "nivel") {
        call.p_method = "tier";
        call.p_tier = choice(args, "nivel", ["casi_seguro", "muy_probable", "probable", "parejo", "sorpresa", "bombazo", "locura", "historica"], "");
        if (!call.p_tier) throw new ToolError("Falta «nivel».");
      } else if (method === "cuota") {
        call.p_method = "odds";
        call.p_american_odds = needInt(args, "momio", -100000, 100000);
      } else {
        call.p_method = "table";
        call.p_competition = choice(args, "competicion", ["laliga", "premier", "ligamx"], "");
        call.p_season = text(args, "temporada", 20);
        call.p_team = text(args, "equipo", 60);
        call.p_condition = ({ exacta: "exact", o_mejor: "at_or_above", o_peor: "at_or_below" } as Record<string, string>)[
          choice(args, "condicion", ["exacta", "o_mejor", "o_peor"], "")
        ];
        call.p_position = int(args, "posicion", null, 1, 30);
        if (!call.p_competition || !call.p_season || !call.p_team || !call.p_condition || !call.p_position) {
          throw new ToolError("Con «tabla» indica competicion, temporada, equipo, condicion y posicion.");
        }
      }
      const r = (await adminRpc("ae_classify_free_take", call))?.[0] ?? {};
      return {
        hecho: true, take_id: take, probabilidad: pct(r.probability), puntos_si_acierta: r.points, trivial: r.trivial,
        siguiente_paso: r.trivial ? "Take trivial (≥ 90 %): no puntúa, déjalo sin resultado." : "Cuando se sepa, accion «resultado».",
      };
    },
  },
  {
    name: "admin_campeon",
    title: "Administrar «¿Quién será campeón?»",
    description:
      "Preguntas de «¿Quién será campeón?» (los id salen en «quien_sera_campeon»). «crear»: competicion, periodo (temporada o semanal), pregunta " +
      "(10–220 caracteres), cierra (hora de Toronto), opciones (2–32) y puntos base (1–100). «puntos»: puntos_por_opcion {opción: puntos} " +
      "(solo mientras nadie haya elegido). «validar»: con la pregunta ya cerrada, campeon = la opción ganadora; reparte los puntos. " +
      "«anular»: anula la pregunta para todos.",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(["crear", "puntos", "validar", "anular"], "Qué hacer."),
        pregunta_id: { type: "string" },
        competicion: { type: "string", enum: ["laliga", "premier", "ligamx", "champions", "nfl", "colegial"] },
        periodo: { type: "string", enum: ["temporada", "semanal"] },
        pregunta: { type: "string" },
        cierra: { type: "string", description: "AAAA-MM-DD HH:MM, hora de Toronto." },
        opciones: { type: "array", items: { type: "string" } },
        puntos: { type: "integer", minimum: 1, maximum: 100, description: "Puntos base (por defecto 10)." },
        puntos_por_opcion: { type: "object", additionalProperties: { type: ["integer", "null"] }, description: "{\"Real Madrid\": 7, \"Otro club\": 12}" },
        campeon: { type: "string", description: "Opción ganadora (texto tal como aparece)." },
      },
      required: ["accion"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["crear", "puntos", "validar", "anular"]);
      const optionsOf = async (q: string) => ((await db(`ae_take_options?select=id,label,points&question_id=eq.${q}`)) ?? []) as any[];
      const optionId = (opts: any[], label: string) => {
        const hit = opts.filter((o) => norm(o.label) === norm(label));
        if (hit.length !== 1) throw new ToolError(`No hay una opción «${label}». Opciones: ${opts.map((o) => o.label).join(", ")}.`);
        return hit[0].id;
      };
      if (a === "crear") {
        const options = args.opciones;
        if (!Array.isArray(options) || options.length < 2 || options.length > 32 || options.some((o) => typeof o !== "string" || !o.trim())) {
          throw new ToolError("«opciones» debe ser una lista de 2 a 32 textos.");
        }
        const id = await adminRpc("ae_create_take", {
          p_competition: choice(args, "competicion", ["laliga", "premier", "ligamx", "champions", "nfl", "colegial"], "") || null,
          p_period: choice(args, "periodo", ["temporada", "semanal"], "temporada") === "semanal" ? "weekly" : "season",
          p_prompt: content(args, "pregunta", { min: 10, max: 220, required: true }),
          p_closes_at: when(args, "cierra", { required: true }),
          p_points: int(args, "puntos", 10, 1, 100),
          p_options: options.map((o) => String(o).trim()),
        });
        let points = null;
        if (args.puntos_por_opcion && typeof args.puntos_por_opcion === "object") {
          const opts = await optionsOf(id);
          const map: Json = {};
          for (const [label, value] of Object.entries(args.puntos_por_opcion as Json)) map[optionId(opts, label)] = value;
          points = await adminRpc("ae_set_take_option_points", { p_question_id: id, p_points: map });
        }
        return { hecho: true, pregunta_id: id, opciones_con_puntos: points };
      }
      const q = uuid(args, "pregunta_id")!;
      if (a === "anular") return { hecho: await adminRpc("ae_void_take", { p_question_id: q }), nota: "Pregunta anulada para todos." };
      const opts = await optionsOf(q);
      if (!opts.length) throw new ToolError("No encuentro esa pregunta o no tiene opciones.");
      if (a === "puntos") {
        const given = args.puntos_por_opcion;
        if (!given || typeof given !== "object" || Array.isArray(given)) throw new ToolError("Falta «puntos_por_opcion» ({opción: puntos}).");
        const map: Json = {};
        for (const [label, value] of Object.entries(given as Json)) {
          if (value !== null && (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100)) {
            throw new ToolError(`Los puntos de «${label}» deben ser un entero de 1 a 100 (o null para usar los de la pregunta).`);
          }
          map[optionId(opts, label)] = value;
        }
        const changed = await adminRpc("ae_set_take_option_points", { p_question_id: q, p_points: map });
        return { hecho: true, opciones_cambiadas: changed };
      }
      const winner = text(args, "campeon", 100);
      if (!winner) throw new ToolError("Falta «campeon».");
      const paid = await adminRpc("ae_settle_take", { p_question_id: q, p_option_id: optionId(opts, winner) });
      return { hecho: true, campeon: winner, ganadores_o_puntos: paid };
    },
  },
  {
    name: "admin_matriz",
    title: "Publicar matriz de posiciones",
    description:
      "Publica una matriz de posiciones (LaLiga, Premier o Liga MX, fase regular) para puntuar Takes de tabla y las opciones de campeón. " +
      "«equipos»: 10–24 objetos {equipo, historico (grandeza 0–100), ultimas (posiciones de las últimas 5 temporadas, la más reciente primero; " +
      "fuera de la liga = tamaño + 3), actual (posición ahora), jugados, total}. Se simula la temporada con esos datos. Para verla: admin_consultar → matriz.",
    inputSchema: {
      type: "object",
      properties: {
        competicion: { type: "string", enum: ["laliga", "premier", "ligamx"] },
        temporada: { type: "string", description: "p. ej. 2026/27 o Apertura 2026." },
        equipos: {
          type: "array",
          minItems: 10,
          maxItems: 24,
          items: {
            type: "object",
            properties: {
              equipo: { type: "string" }, historico: { type: "number" }, ultimas: { type: "array", items: { type: "integer" } },
              actual: { type: "integer" }, jugados: { type: "integer" }, total: { type: "integer" },
            },
            required: ["equipo", "historico"],
          },
        },
        nota: { type: "string" },
      },
      required: ["competicion", "temporada", "equipos"],
      additionalProperties: false,
    },
    run: async (args) => {
      const comp = choice(args, "competicion", ["laliga", "premier", "ligamx"], "");
      if (!comp) throw new ToolError("Falta «competicion».");
      const teams = args.equipos;
      if (!Array.isArray(teams) || teams.length < 10 || teams.length > 24) throw new ToolError("«equipos» debe tener entre 10 y 24 equipos.");
      const payload = teams.map((t: any, i: number) => {
        if (!t || typeof t !== "object" || typeof t.equipo !== "string" || !Number.isFinite(Number(t.historico))) {
          throw new ToolError(`El equipo n.º ${i + 1} necesita «equipo» e «historico».`);
        }
        return { team: t.equipo.trim(), hist: Number(t.historico), recent: Array.isArray(t.ultimas) ? t.ultimas : [], current: t.actual ?? null, played: t.jugados ?? 0, total: t.total ?? 0 };
      });
      const id = await adminRpc("ae_publish_outlook", {
        p_competition: comp, p_season: content(args, "temporada", { min: 4, max: 20, required: true }), p_teams: payload,
        p_note: text(args, "nota", 300), p_as_of: null,
      });
      return { hecho: true, matriz_id: id, nota: "Para ver los puntos por posición: admin_consultar → matriz." };
    },
  },
  {
    name: "admin_quiniela",
    title: "Administrar quinielas",
    description:
      "Quiniela NFL y de Fútbol (los id de partido salen en «quiniela»). «cuotas»: momios americanos (local, visitante y, en fútbol, empate) de un partido " +
      "futuro sin elecciones; congela probabilidades y puntos. «puntos» (solo fútbol): ajusta a mano los puntos (2–12) de un partido con cuotas y sin elecciones. " +
      "«resultado»: estado final, empate (solo NFL) o cancelado, con marcador y un motivo de al menos 8 caracteres (corrige o fuerza el resultado y liquida). " +
      "«corregir»: cambia equipos u hora de un partido aún sin cuotas ni elecciones (motivo obligatorio). " +
      "«abrir»/«cerrar»: abre o cierra una semana NFL (semana) o una jornada de fútbol (competicion + jornada); solo se abren partidos con cuotas.",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(["cuotas", "puntos", "resultado", "corregir", "abrir", "cerrar"], "Qué hacer."),
        deporte: { type: "string", enum: ["nfl", "futbol"] },
        partido_id: { type: "string" },
        momio_local: { type: "integer" }, momio_visitante: { type: "integer" }, momio_empate: { type: "integer" },
        puntos_local: { type: "integer", minimum: 2, maximum: 12 }, puntos_empate: { type: "integer", minimum: 2, maximum: 12 },
        puntos_visitante: { type: "integer", minimum: 2, maximum: 12 },
        estado: { type: "string", enum: ["final", "empate", "cancelado"] },
        marcador_local: { type: "integer", minimum: 0 }, marcador_visitante: { type: "integer", minimum: 0 },
        motivo: { type: "string", description: "Obligatorio en resultado y corregir (8+ caracteres)." },
        local: { type: "string", description: "corregir: equipo local (nombre o id)." },
        visitante: { type: "string", description: "corregir: equipo visitante (nombre o id)." },
        inicio: { type: "string", description: "corregir: AAAA-MM-DD HH:MM, hora de Toronto." },
        temporada: { type: "integer", minimum: 2020, maximum: 2100 },
        semana: { type: "integer", minimum: 1, maximum: 22 },
        competicion: { type: "string", enum: COMPETITIONS },
        jornada: { type: "integer", minimum: 1, maximum: 60 },
      },
      required: ["accion", "deporte"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["cuotas", "puntos", "resultado", "corregir", "abrir", "cerrar"]);
      const sport = choice(args, "deporte", ["nfl", "futbol"], "");
      if (!sport) throw new ToolError("Falta «deporte» (nfl o futbol).");
      const nfl = sport === "nfl";
      const pre = nfl ? "cam_nfl_admin_" : "cam_football_admin_";
      if (a === "abrir" || a === "cerrar") {
        const season = int(args, "temporada", null, 2020, 2100) ?? (await latestSeason(nfl ? "nfl" : "futbol"));
        const open = a === "abrir";
        const changed = nfl
          ? await adminRpc(`${pre}open`, { p_season: season, p_week: needInt(args, "semana", 1, 22), p_open: open })
          : await adminRpc(`${pre}open`, {
            p_competition: choice(args, "competicion", COMPETITIONS, "") || (() => { throw new ToolError("Falta «competicion»."); })(),
            p_season: season, p_matchday: needInt(args, "jornada", 1, 60), p_open: open,
          });
        return {
          hecho: true, partidos_cambiados: changed,
          nota: open && !changed ? "No se abrió ninguno: solo se abren partidos futuros con cuotas congeladas." : undefined,
        };
      }
      const game = text(args, "partido_id", 40);
      if (!game) throw new ToolError("Falta «partido_id».");
      if (a === "cuotas") {
        const call: Json = { p_game_id: game, p_home: needInt(args, "momio_local", -100000, 100000), p_away: needInt(args, "momio_visitante", -100000, 100000), p_source: "manual" };
        if (!nfl) call.p_draw = needInt(args, "momio_empate", -100000, 100000);
        await adminRpc(`${pre}odds`, call);
        const fresh = await db(`${nfl ? "cam_nfl_games" : "cam_football_games"}?select=probability_home,probability_away${nfl ? "" : ",probability_draw,points_draw"},points_home,points_away&id=eq.${encodeURIComponent(game)}`);
        const g = fresh?.[0] ?? {};
        return {
          hecho: true, partido_id: game,
          probabilidad: nfl ? { local: pct(g.probability_home), visitante: pct(g.probability_away) } : { local: pct(g.probability_home), empate: pct(g.probability_draw), visitante: pct(g.probability_away) },
          puntos: nfl ? { local: g.points_home, visitante: g.points_away } : { local: g.points_home, empate: g.points_draw, visitante: g.points_away },
        };
      }
      if (a === "puntos") {
        if (nfl) throw new ToolError("En la NFL los puntos salen solos de las cuotas.");
        await adminRpc(`${pre}points`, {
          p_game_id: game, p_home: needInt(args, "puntos_local", 2, 12), p_draw: needInt(args, "puntos_empate", 2, 12), p_away: needInt(args, "puntos_visitante", 2, 12),
        });
        return { hecho: true, partido_id: game };
      }
      const reason = content(args, "motivo", { min: 8, max: 300, required: true });
      if (a === "resultado") {
        const state = choice(args, "estado", ["final", "empate", "cancelado"], "");
        if (!state) throw new ToolError("Falta «estado» (final, empate o cancelado).");
        if (state === "empate" && !nfl) throw new ToolError("En fútbol un empate es «final» con el mismo marcador.");
        const cancelled = state === "cancelado";
        await adminRpc(`${pre}result`, {
          p_game_id: game, p_status: cancelled ? "cancelled" : state === "empate" ? "tie" : "final",
          p_home: cancelled ? null : needInt(args, "marcador_local", 0, 200), p_away: cancelled ? null : needInt(args, "marcador_visitante", 0, 200),
          p_reason: reason,
        });
        return { hecho: true, partido_id: game, nota: "Resultado guardado; los pronósticos se liquidan solos." };
      }
      // corregir
      const teams = (await db(`${nfl ? "nfl_teams" : "cam_football_teams"}?select=id,name`)) ?? [];
      const home = findTeam(teams, text(args, "local", 60) ?? (() => { throw new ToolError("Falta «local»."); })());
      const away = findTeam(teams, text(args, "visitante", 60) ?? (() => { throw new ToolError("Falta «visitante»."); })());
      await adminRpc(`${pre}fix_game`, { p_game_id: game, p_home: home.id, p_away: away.id, p_kickoff: when(args, "inicio", { required: true }), p_reason: reason });
      return { hecho: true, partido_id: game, partido: `${away.name} @ ${home.name}` };
    },
  },
  {
    name: "admin_picks",
    title: "Administrar Picks",
    description:
      "Picks de la comunidad (los pendientes salen en «admin_pendientes»). «aprobar» / «rechazar» (moderación), «ocultar» (lo quita de la web), " +
      "«resultado»: acertado, fallado o anulado de un Pick aprobado cuyo partido ya llegó (suma los puntos), «ocultar_comentario» (comentario_id), " +
      "«fecha»: pone la fecha del partido a un Pick antiguo sin fecha, «cerrar_semana»: cierra una semana completa (lunes) y reparte sus premios.",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(["aprobar", "rechazar", "ocultar", "resultado", "ocultar_comentario", "fecha", "cerrar_semana"], "Qué hacer."),
        pick_id: { type: "string" },
        resultado: { type: "string", enum: ["acertado", "fallado", "anulado"] },
        comentario_id: { type: "string" },
        fecha: { type: "string", description: "AAAA-MM-DD (fecha del partido o lunes de la semana a cerrar)." },
      },
      required: ["accion"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["aprobar", "rechazar", "ocultar", "resultado", "ocultar_comentario", "fecha", "cerrar_semana"]);
      if (a === "ocultar_comentario") return { hecho: true, comentario: await admin("comentario_pick_ocultar", { id: uuid(args, "comentario_id") }) };
      if (a === "cerrar_semana") return { hecho: true, premios: await adminRpc("ae_finalize_community_pick_week", { p_week_start: day(args, "fecha") }) };
      const pick = uuid(args, "pick_id")!;
      if (a === "aprobar" || a === "rechazar") {
        const status = await adminRpc("ae_moderate_community_pick", { p_pick_id: pick, p_approve: a === "aprobar" });
        return { hecho: true, pick_id: pick, moderacion: status === "approved" ? "aprobado" : "rechazado", enlace: pickLink(pick) };
      }
      if (a === "ocultar") return { hecho: true, pick: await admin("pick_ocultar", { id: pick }) };
      if (a === "fecha") return { hecho: true, fecha_partido: await adminRpc("ae_pick_set_legacy_event_date", { p_pick_id: pick, p_event_date: day(args, "fecha") }) };
      const points = await adminRpc("ae_pick_settle_result", { p_pick_id: pick, p_outcome: outcome(args, ["acertado", "fallado", "anulado"]) });
      return { hecho: true, pick_id: pick, resultado: choice(args, "resultado", ["acertado", "fallado", "anulado"], ""), puntos: points, enlace: pickLink(pick) };
    },
  },
  {
    name: "admin_pick_editor",
    title: "Administrar el Pick del editor",
    description:
      "Pick de la semana del editor. «publicar»: titulo (5–160), partido, seleccion, momio (americano), analisis (12–2400), cierra (hora de Toronto) " +
      "e imagen_url / banner_url opcionales (https). «editar»: pick_id y solo lo que cambia. «resultado»: acertado o fallado; no se puede cambiar después " +
      "y, si acertó, se comparte solo en redes. Historial: admin_consultar → pick_editor.",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(["publicar", "editar", "resultado"], "Qué hacer."),
        pick_id: { type: "string" },
        titulo: { type: "string" }, partido: { type: "string" }, seleccion: { type: "string" },
        momio: { type: "integer" }, analisis: { type: "string" },
        cierra: { type: "string", description: "AAAA-MM-DD HH:MM, hora de Toronto." },
        imagen_url: { type: "string" }, banner_url: { type: "string" },
        resultado: { type: "string", enum: ["acertado", "fallado"] },
      },
      required: ["accion"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["publicar", "editar", "resultado"]);
      if (a === "resultado") {
        const pick = uuid(args, "pick_id")!;
        const r = await adminRpc("cam_resolve_weekly_pick", { p_pick_id: pick, p_outcome: outcome(args, ["acertado", "fallado"]) });
        return { hecho: true, pick_id: pick, resultado: r, enlace: `${SITE}?r=${pack(pick)}` };
      }
      const odds = int(args, "momio", null, -100000, 100000);
      if (odds !== null && Math.abs(odds) < 100) throw new ToolError("«momio» debe ser un momio americano (≥ +100 o ≤ -100).");
      if (a === "publicar") {
        const id = await adminRpc("ae_publish_editorial_weekly_pick_visual_v2", {
          p_title: content(args, "titulo", { min: 5, max: 160, required: true }),
          p_event_name: content(args, "partido", { min: 3, max: 160, required: true }),
          p_selection: content(args, "seleccion", { min: 2, max: 180, required: true }),
          p_american_odds: odds ?? (() => { throw new ToolError("Falta «momio»."); })(),
          p_analysis: content(args, "analisis", { min: 12, max: 2400, required: true }),
          p_expires_at: when(args, "cierra", { required: true }),
          p_banner_path: null, p_image_path: null, p_banner_url: https(args, "banner_url"), p_image_url: https(args, "imagen_url"),
          p_banner_focus_x: 50, p_banner_focus_y: 50, p_image_focus_x: 50, p_image_focus_y: 50,
        });
        return { hecho: true, pick_id: id, enlace: `${SITE}?e=${pack(id)}` };
      }
      const pick = uuid(args, "pick_id")!;
      const rows = await db(`ae_editorial_weekly_picks?select=*&id=eq.${pick}`);
      const cur = rows?.[0];
      if (!cur) throw new ToolError("No encuentro ese Pick del editor (debe estar publicado).");
      const id = await adminRpc("ae_update_editorial_weekly_pick", {
        p_pick_id: pick, p_expected_edited_at: cur.edited_at ?? null,
        p_title: content(args, "titulo", { min: 5, max: 160 }) ?? cur.title,
        p_event_name: content(args, "partido", { min: 3, max: 160 }) ?? cur.event_name,
        p_selection: content(args, "seleccion", { min: 2, max: 180 }) ?? cur.selection,
        p_american_odds: odds ?? cur.american_odds,
        p_analysis: content(args, "analisis", { min: 12, max: 2400 }) ?? cur.analysis,
        p_expires_at: when(args, "cierra") ?? cur.expires_at,
        p_banner_path: cur.banner_path, p_image_path: cur.image_path,
        p_banner_url: https(args, "banner_url") ?? cur.banner_url, p_image_url: https(args, "imagen_url") ?? cur.image_url,
        p_banner_focus_x: cur.banner_focus_x ?? 50, p_banner_focus_y: cur.banner_focus_y ?? 50,
        p_image_focus_x: cur.image_focus_x ?? 50, p_image_focus_y: cur.image_focus_y ?? 50,
      });
      return { hecho: true, pick_id: id ?? pick, enlace: `${SITE}?e=${pack(pick)}` };
    },
  },
  {
    name: "admin_noticia",
    title: "Administrar noticias",
    description:
      "Noticias de la web. «publicar»: titulo, categoria (Fútbol, NFL, Picks, Fútbol Americano Colegial, NBA, Tenis, Ciclismo), texto " +
      "(texto plano: cada línea es un párrafo, «## » subtítulo, **negrita**), resumen, autor (por defecto Eduard Carrera), imagen (https; si no, la de la categoría), " +
      "equipo (solo Fútbol: barcelona, real-madrid, manchester-united) y visible (por defecto sí). Al publicarse puede salir sola en redes, como desde la web. " +
      "«editar»: id y solo lo que cambia (visible = false la oculta). «borrar»: la elimina para todos. «borrar_comentario»: comentario_id.",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(["publicar", "editar", "borrar", "borrar_comentario"], "Qué hacer."),
        id: { type: "string" },
        titulo: { type: "string" }, categoria: { type: "string" }, texto: { type: "string" }, resumen: { type: "string" },
        autor: { type: "string" }, imagen: { type: "string" },
        equipo: { type: "string", enum: ["barcelona", "real-madrid", "manchester-united", ""] },
        visible: { type: "boolean" }, destacada: { type: "boolean" },
        comentario_id: { type: "string" },
      },
      required: ["accion"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["publicar", "editar", "borrar", "borrar_comentario"]);
      if (a === "borrar_comentario") return { hecho: true, comentario_borrado: await admin("comentario_noticia_borrar", { id: uuid(args, "comentario_id") }) };
      if (a === "borrar") return { hecho: true, noticia_borrada: await admin("noticia_borrar", { id: uuid(args, "id") }) };
      const team = text(args, "equipo", 30);
      if (team && !["barcelona", "real-madrid", "manchester-united"].includes(team)) throw new ToolError("«equipo» debe ser barcelona, real-madrid o manchester-united.");
      const payload: Json = {};
      const set = (key: string, value: unknown) => { if (value !== null && value !== undefined) payload[key] = value; };
      set("title", content(args, "titulo", { max: 200, required: a === "publicar" }));
      const category = newsCategory(args, a === "publicar");
      set("category", category);
      const body = content(args, "texto", { min: 20, max: 60000, required: a === "publicar" });
      if (body) payload.body = textToHtml(body);
      if (args.resumen !== undefined) payload.summary = content(args, "resumen", { max: 400 }) ?? "";
      set("author", content(args, "autor", { max: 80 }));
      set("image", https(args, "imagen") ?? (a === "publicar" ? NEWS_FALLBACK[category!] ?? NEWS_FALLBACK["Fútbol"] : null));
      if (args.equipo !== undefined) payload.football_team = team || null;
      set("is_public", bool(args, "visible"));
      set("featured", bool(args, "destacada"));
      if (a === "publicar") {
        const r = await admin("noticia_publicar", payload);
        return { hecho: true, noticia: r, visible: r.is_public, nota: r.is_public ? "Publicada en la web." : "Guardada oculta." };
      }
      const id = uuid(args, "id")!;
      if (!Object.keys(payload).length) throw new ToolError("No indicaste nada que cambiar.");
      return { hecho: true, noticia: await admin("noticia_editar", { id, ...payload }) };
    },
  },
  {
    name: "admin_opinion",
    title: "Administrar opiniones",
    description:
      "Sección Opiniones. «publicar»: deporte (nfl, futbol, colegial, ciclismo, tenis), titulo (5–160), texto (20–8000; línea en blanco = párrafo), " +
      "resumen (≤ 300), autor (por defecto Eduard Carrera), imagen (https), destacada y borrador (por defecto se publica). " +
      "«editar»: id y solo lo que cambia (borrador = false la publica). «borrar»: la elimina. Para leer borradores: admin_consultar → opiniones.",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(["publicar", "editar", "borrar"], "Qué hacer."),
        id: { type: "string" },
        deporte: { type: "string", enum: ["nfl", "futbol", "colegial", "ciclismo", "tenis"] },
        titulo: { type: "string" }, texto: { type: "string" }, resumen: { type: "string" }, autor: { type: "string" },
        imagen: { type: "string" }, destacada: { type: "boolean" }, borrador: { type: "boolean" },
      },
      required: ["accion"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["publicar", "editar", "borrar"]);
      const sports = ["nfl", "futbol", "colegial", "ciclismo", "tenis"];
      if (a === "borrar") {
        const id = uuid(args, "id")!;
        await adminRpc("ae_delete_opinion", { p_opinion_id: id });
        return { hecho: true, opinion_borrada: id };
      }
      const draft = bool(args, "borrador");
      if (a === "publicar") {
        const sport = choice(args, "deporte", sports, "");
        if (!sport) throw new ToolError("Falta «deporte».");
        const id = await adminRpc("ae_publish_opinion", {
          p_sport: sport, p_title: content(args, "titulo", { min: 5, max: 160, required: true }), p_summary: content(args, "resumen", { max: 300 }),
          p_body: content(args, "texto", { min: 20, max: 8000, required: true }), p_author: content(args, "autor", { max: 80 }) ?? "Eduard Carrera",
          p_image: https(args, "imagen"), p_image_focus_x: 50, p_image_focus_y: 50, p_featured: bool(args, "destacada") ?? false, p_is_published: !(draft ?? false),
        });
        return { hecho: true, opinion_id: id, publicada: !(draft ?? false), enlace: draft ? null : `${SITE}?opinion=${id}` };
      }
      const id = uuid(args, "id")!;
      const cur = await admin("opinion_ver", { id });
      const sport = choice(args, "deporte", sports, "") || cur.sport;
      await adminRpc("ae_update_opinion", {
        p_opinion_id: id, p_sport: sport,
        p_title: content(args, "titulo", { min: 5, max: 160 }) ?? cur.title,
        p_summary: args.resumen !== undefined ? content(args, "resumen", { max: 300 }) : cur.summary,
        p_body: content(args, "texto", { min: 20, max: 8000 }) ?? cur.body,
        p_author: content(args, "autor", { max: 80 }) ?? cur.author,
        p_image: args.imagen !== undefined ? https(args, "imagen") : cur.image,
        p_image_focus_x: cur.image_focus_x ?? 50, p_image_focus_y: cur.image_focus_y ?? 50,
        p_featured: bool(args, "destacada") ?? cur.featured ?? false,
        p_is_published: draft === null ? cur.is_published : !draft,
      });
      const published = draft === null ? cur.is_published : !draft;
      return { hecho: true, opinion_id: id, publicada: published, enlace: published ? `${SITE}?opinion=${id}` : null };
    },
  },
  {
    name: "admin_power_rankings",
    title: "Publicar Power Rankings",
    description:
      "Publica una nueva edición de los Power Rankings de la NFL o de la Champions League: «edicion» (p. ej. «Semana 9» o «Jornada 4») y «equipos», " +
      "los 10 del 1 al 10 (nombre, ciudad, apodo o id). El movimiento ▲▼ se calcula solo. El análisis se escribe aparte como noticia " +
      "(título con «Power Rankings», y «Champions» si es de Champions).",
    inputSchema: {
      type: "object",
      properties: {
        liga: { type: "string", enum: ["nfl", "champions"] },
        edicion: { type: "string" },
        equipos: { type: "array", items: { type: "string" }, minItems: 10, maxItems: 10 },
      },
      required: ["liga", "edicion", "equipos"],
      additionalProperties: false,
    },
    run: async (args) => {
      const league = choice(args, "liga", ["nfl", "champions"], "");
      if (!league) throw new ToolError("Falta «liga» (nfl o champions).");
      const edition = content(args, "edicion", { max: 100, required: true });
      const wanted = teamList(args, "equipos", 10);
      if (league === "nfl") {
        const [teams, current] = await Promise.all([db("nfl_teams?select=id,name"), db("nfl_rankings?select=updated_at&order=updated_at.desc&limit=1")]);
        const ids = wanted.map((w) => findTeam(teams ?? [], w).id);
        if (new Set(ids).size !== 10) throw new ToolError("Hay equipos repetidos.");
        await adminRpc("rcm_publish_ranking", { p_edition: edition, p_team_ids: ids, p_expected_updated_at: current?.[0]?.updated_at ?? null });
      } else {
        const latest = (await db("champions_rankings?select=id,season&order=published_at.desc,id.desc&limit=1"))?.[0];
        const season = latest?.season ?? "2026/27";
        const clubs = await db(`champions_clubs?select=id,name&season=eq.${encodeURIComponent(season)}&participating=eq.true`);
        const ids = wanted.map((w) => findTeam(clubs ?? [], w).id);
        if (new Set(ids).size !== 10) throw new ToolError("Hay clubes repetidos.");
        await adminRpc("ae_publish_champions_ranking", { p_season: season, p_edition: edition, p_team_ids: ids, p_expected_latest_id: latest?.id ?? null });
      }
      return { hecho: true, ranking: await powerRankings(league as "nfl" | "champions") };
    },
  },
  {
    name: "admin_redes",
    title: "Administrar redes sociales",
    description:
      "Publicaciones automáticas en X, TikTok e Instagram. «pausar_promos» / «reanudar_promos»: los mensajes promocionales de las 9:00, 13:00 y 18:00 " +
      "(al pausar se cancela lo que ya estaba en cola). «pausar_todo» / «reanudar_todo»: TODAS las publicaciones automáticas (noticias, Picks…). " +
      "«nuevo_mensaje» / «editar_mensaje» / «activar_mensaje» / «desactivar_mensaje»: mensajes promocionales (mensaje_id; los ve admin_consultar → mensajes_redes). " +
      "Límites: texto_x 20–230 (con {noticia} se pone el titular de la última noticia), titular 8–110, antetitulo 3–40, texto_redes 20–1500, " +
      "enlace dentro de https://camsports.github.io/.",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(
          ["pausar_promos", "reanudar_promos", "pausar_todo", "reanudar_todo", "nuevo_mensaje", "editar_mensaje", "activar_mensaje", "desactivar_mensaje"],
          "Qué hacer.",
        ),
        mensaje_id: { type: "string", description: "Minúsculas, números y guiones (3–60)." },
        tema: { type: "string", enum: ["picks", "takes", "campeon", "noticias", "opiniones", "rankings", "prestigio", "comunidad"] },
        antetitulo: { type: "string" }, titular: { type: "string" }, texto_x: { type: "string" }, texto_redes: { type: "string" },
        hashtags: { type: "string" }, enlace: { type: "string" },
        hasta: { type: "string", description: "Dejar de usarlo a partir de esta fecha (AAAA-MM-DD, hora de Toronto)." },
      },
      required: ["accion"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["pausar_promos", "reanudar_promos", "pausar_todo", "reanudar_todo", "nuevo_mensaje", "editar_mensaje", "activar_mensaje", "desactivar_mensaje"]);
      if (a === "pausar_promos" || a === "reanudar_promos") return { hecho: true, ...(await admin("redes_promos", { active: a === "reanudar_promos" })) };
      if (a === "pausar_todo" || a === "reanudar_todo") return { hecho: true, ...(await admin("redes_todo", { active: a === "reanudar_todo" })) };
      const id = text(args, "mensaje_id", 60);
      if (!id || !/^[a-z0-9-]{3,60}$/.test(id)) throw new ToolError("«mensaje_id» debe tener 3–60 minúsculas, números o guiones.");
      if (a === "activar_mensaje" || a === "desactivar_mensaje") {
        return { hecho: true, mensaje: await admin("redes_mensaje", { id, active: a === "activar_mensaje" }) };
      }
      const link = text(args, "enlace", 300);
      if (link && !link.startsWith("https://camsports.github.io/")) throw new ToolError("«enlace» debe empezar por https://camsports.github.io/");
      const fields: Json = {};
      const put = (key: string, value: unknown) => { if (value !== null && value !== undefined) fields[key] = value; };
      const required = a === "nuevo_mensaje";
      if (required && !text(args, "tema", 20)) throw new ToolError("Falta «tema».");
      put("theme", text(args, "tema", 20));
      put("kicker", content(args, "antetitulo", { min: 3, max: 40, required }));
      put("headline", content(args, "titular", { min: 8, max: 110, required }));
      const x = content(args, "texto_x", { min: 20, max: 230, required });
      if (x && x.includes("{noticia}") && x.replace("{noticia}", "").length + 110 + 25 > 280) {
        throw new ToolError("Con {noticia} el texto de X no cabe en 280 caracteres con una noticia larga y el enlace: acórtalo.");
      }
      put("x_text", x);
      put("caption", content(args, "texto_redes", { min: 20, max: 1500, required }));
      put("hashtags", content(args, "hashtags", { max: 300 }));
      put("link", link);
      put("active_until", when(args, "hasta", { defaultTime: "00:00" }));
      if (!required && !Object.keys(fields).length) throw new ToolError("No indicaste nada que cambiar.");
      return { hecho: true, mensaje: await admin("redes_mensaje", { id, ...(required ? { new: true } : {}), ...fields }) };
    },
  },
  {
    name: "admin_sitio",
    title: "Administrar el sitio",
    description:
      "Textos, imágenes y secciones de la web. «texto»: clave (p. ej. profile.title) y contenido (≤ 600), con «ajustes» opcionales del editor " +
      "(tipo de letra, tamaño, color…). «restaurar_texto»: vuelve al texto original. «imagen»: clave de imagen editable (las de fondo van por tema, " +
      "p. ej. cabecera.fondo-noche), url https, encuadre_x/encuadre_y (0–100) y texto_alternativo. «restaurar_imagen»: vuelve a la del diseño. " +
      "«categoria»: muestra u oculta NBA, Tenis, Ciclismo o Fútbol Americano Colegial en el menú «Deportes».",
    inputSchema: {
      type: "object",
      properties: {
        accion: ACTION(["texto", "restaurar_texto", "imagen", "restaurar_imagen", "categoria"], "Qué hacer."),
        clave: { type: "string" }, contenido: { type: "string" }, ajustes: { type: "object" },
        url: { type: "string" }, encuadre_x: { type: "integer", minimum: 0, maximum: 100 }, encuadre_y: { type: "integer", minimum: 0, maximum: 100 },
        texto_alternativo: { type: "string" },
        categoria: { type: "string", enum: ["NBA", "Tenis", "Ciclismo", "Fútbol Americano Colegial"] },
        visible: { type: "boolean" },
      },
      required: ["accion"],
      additionalProperties: false,
    },
    run: async (args) => {
      const a = accion(args, ["texto", "restaurar_texto", "imagen", "restaurar_imagen", "categoria"]);
      if (a === "categoria") {
        const cat = text(args, "categoria", 40);
        const visible = bool(args, "visible");
        if (!cat || visible === null) throw new ToolError("Indica «categoria» y «visible».");
        return { hecho: await adminRpc("ae_set_category_visibility", { p_category: cat, p_visible: visible }), categoria: cat, visible };
      }
      const key = text(args, "clave", 80);
      if (!key || !/^[a-z0-9][a-z0-9.-]{1,79}$/.test(key)) throw new ToolError("«clave» no es válida (minúsculas, números, puntos y guiones).");
      if (a === "restaurar_texto") { await adminRpc("cam_reset_site_text", { p_key: key }); return { hecho: true, clave: key, nota: "Texto original restaurado." }; }
      if (a === "restaurar_imagen") { await adminRpc("ae_reset_site_image", { p_key: key }); return { hecho: true, clave: key, nota: "Imagen original restaurada." }; }
      if (a === "texto") {
        const settings = args.ajustes && typeof args.ajustes === "object" && !Array.isArray(args.ajustes) ? args.ajustes : {};
        const r = await adminRpc("cam_set_site_text", { p_key: key, p_content: content(args, "contenido", { max: 600, required: true }), p_settings: settings });
        return { hecho: true, texto: r };
      }
      const x = int(args, "encuadre_x", null, 0, 100);
      const y = int(args, "encuadre_y", null, 0, 100);
      if ((x === null) !== (y === null)) throw new ToolError("Indica los dos encuadres (x e y) o ninguno.");
      const url = https(args, "url");
      if (!url) throw new ToolError("Falta «url» (https).");
      const r = await adminRpc("ae_set_site_image", { p_key: key, p_url: url, p_focus_x: x, p_focus_y: y, p_alt: text(args, "texto_alternativo", 200) });
      return { hecho: true, imagen: r, nota: "Se ve al recargar la página." };
    },
  },
  {
    name: "admin_parties",
    title: "Moderar parties",
    description: "Borra un party (moderación); los miembros pierden esa clasificación. Para verlos todos: admin_consultar → parties.",
    inputSchema: {
      type: "object",
      properties: { accion: ACTION(["borrar"], "Qué hacer."), party_id: { type: "string" } },
      required: ["accion", "party_id"],
      additionalProperties: false,
    },
    run: async (args) => {
      accion(args, ["borrar"]);
      return { hecho: true, ...(await adminRpc("cam_party_delete", { p_party: uuid(args, "party_id") })) };
    },
  },
];

const TOOLS: (Tool & { kind: "read" | "admin-read" | "write" })[] = [
  ...READ_TOOLS.map((t) => ({ ...t, kind: "read" as const })),
  ...ADMIN_READ_TOOLS.map((t) => ({ ...t, kind: "admin-read" as const })),
  ...ADMIN_TOOLS.map((t) => ({ ...t, kind: "write" as const })),
];

const TOOL_INDEX = new Map(TOOLS.map((t) => [t.name, t]));
const TOOL_LIST = TOOLS.map(({ name, title, description, inputSchema, kind }) => ({
  name,
  title,
  description,
  inputSchema,
  annotations: kind === "write"
    ? { title, readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    : { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));

const INSTRUCTIONS =
  "Datos en vivo y administración de CAM Sports (camsports.github.io), la web deportiva de Eduard Carrera: noticias, opiniones, Takes, Picks, " +
  "Power Rankings, quinielas NFL y Fútbol, «¿Quién será campeón?», redes y visitas. Las fechas están en hora de Toronto. " +
  "Empieza por «resumen» para preguntas generales y por «admin_pendientes» para ver qué espera una acción del administrador. " +
  "Las herramientas admin_* (salvo admin_pendientes y admin_consultar) cambian la web en nombre de Eduard con las mismas reglas que la web: " +
  "antes de publicar, borrar, ocultar, anular o poner un resultado, confirma con él exactamente qué se va a hacer. Cada cambio queda registrado.";

// ───────────────────────────── JSON-RPC / HTTP ─────────────────────────────

const ok = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handleMessage(msg: any): Promise<Json | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0") return fail(null, -32600, "Invalid Request");
  if (typeof msg.method !== "string") return null; // respuesta del cliente: nada que contestar
  if (!("id" in msg) || msg.id === null) return null; // notificación (p. ej. notifications/initialized)
  const id = msg.id;
  const params = msg.params ?? {};
  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "cam-sports", title: "CAM Sports", version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOL_LIST });
    case "tools/call": {
      const tool = TOOL_INDEX.get(params.name);
      if (!tool) return fail(id, -32602, `Herramienta desconocida: ${params.name}`);
      const args = params.arguments && typeof params.arguments === "object" ? (params.arguments as Args) : {};
      const started = Date.now();
      try {
        const data = await tool.run(args);
        console.log(JSON.stringify({ tool: tool.name, ms: Date.now() - started, ok: true }));
        return ok(id, { content: [{ type: "text", text: JSON.stringify(data, null, 1) }] });
      } catch (error) {
        const message = error instanceof ToolError ? error.message : "Error interno al consultar los datos.";
        console.error(JSON.stringify({ tool: tool.name, ms: Date.now() - started, error: String(error) }));
        return ok(id, { content: [{ type: "text", text: message }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Método no disponible: ${msg.method}`);
  }
}

function presentedKey(req: Request, url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  const at = segments.indexOf("cam-mcp");
  const fromPath = at >= 0 ? segments[at + 1] : undefined;
  if (fromPath && fromPath !== "mcp") return decodeURIComponent(fromPath);
  const fromQuery = url.searchParams.get("key");
  if (fromQuery) return fromQuery;
  const auth = req.headers.get("authorization") ?? "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

async function validKey(candidate: string): Promise<boolean> {
  if (!candidate || candidate.length > 200) return false;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(candidate)));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  let match = false;
  for (const expected of ACCESS_KEY_SHA256) {
    let diff = hex.length ^ expected.length;
    for (let i = 0; i < Math.min(hex.length, expected.length); i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
    match = match || diff === 0;
  }
  return match;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!(await validKey(presentedKey(req, url)))) {
    return json({ error: "Acceso no autorizado: falta la clave del conector o no es correcta." }, 401);
  }
  if (req.method === "GET") {
    if ((req.headers.get("accept") ?? "").includes("text/event-stream")) {
      return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } });
    }
    return new Response(
      "Servidor MCP de CAM Sports: funcionando.\nAñade esta misma dirección en Claude como conector personalizado.\n",
      { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } },
    );
  }
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } });

  let payload: unknown;
  try {
    const raw = await req.text();
    if (raw.length > 200_000) return json(fail(null, -32600, "Mensaje demasiado grande"), 413);
    payload = JSON.parse(raw);
  } catch {
    return json(fail(null, -32700, "Parse error"), 400);
  }
  const batch = Array.isArray(payload);
  const messages = batch ? (payload as unknown[]) : [payload];
  if (!messages.length) return json(fail(null, -32600, "Invalid Request"), 400);
  const responses = (await Promise.all(messages.map(handleMessage))).filter(Boolean);
  if (!responses.length) return new Response(null, { status: 202, headers: CORS });
  return json(batch ? responses : responses[0]);
});
