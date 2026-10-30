// CAM Sports · servidor MCP de solo consulta (Edge Function `cam-mcp`).
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
// Datos: todo se lee con la clave publicable, así que las reglas RLS de la web deciden
// qué se ve (lo mismo que ve un visitante). La única excepción es `visitas`, que llama
// con la clave secreta a cam_mcp_analytics_summary() (solo lectura, solo service_role).
// Ninguna herramienta escribe nada.

const SERVER_VERSION = "1.0.0";
const SITE = "https://camsports.github.io/";
const TZ = "America/Toronto";
const ACCESS_KEY_SHA256 = [
  "ff80d7bc652d94c6e2f2cafe0da7a23c20442c41472194045e58ef549e7501ee", // clave del dueño (30 oct 2026)
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

const TOOLS: Tool[] = [
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
        quien_sera_campeon_abiertas: Array.isArray(questions)
          ? questions.map((q: any) => ({ id: q.id, pregunta: q.prompt, cierra: local(q.closes_at) }))
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
      if (state === "pendientes") path += "&outcome=is.null";
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

const TOOL_INDEX = new Map(TOOLS.map((t) => [t.name, t]));
const TOOL_LIST = TOOLS.map(({ name, title, description, inputSchema }) => ({
  name,
  title,
  description,
  inputSchema,
  annotations: { title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}));

const INSTRUCTIONS =
  "Datos en vivo de CAM Sports (camsports.github.io), la web deportiva de Eduard Carrera: noticias, opiniones, Takes, Picks, " +
  "Power Rankings, quinielas NFL y Fútbol, «¿Quién será campeón?» y visitas. Solo lectura: no publica ni cambia nada. " +
  "Las fechas están en hora de Toronto. Empieza por «resumen» para preguntas generales.";

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
