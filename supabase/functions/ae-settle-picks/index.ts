// AE SPORTS · Verificación automática de Picks terminados.
// Busca el partido en los marcadores públicos de ESPN, pide a la IA que compare el pronóstico
// con el resultado oficial y liquida solo lo que está claro. Lo dudoso queda para revisión.
import {createClient} from '@supabase/supabase-js';

const MODEL = Deno.env.get('AE_SETTLE_MODEL') || 'claude-sonnet-5-5';
const BATCH = 20;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const SOCCER = ['mex.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'usa.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf',
  'por.1', 'ned.1', 'arg.1', 'bra.1', 'eng.2', 'eng.fa', 'esp.copa_del_rey', 'concacaf.champions', 'conmebol.libertadores', 'fifa.friendly', 'mex.2', 'sco.1', 'tur.1', 'sau.1'];
const LEAGUES: Record<string, string[]> = {
  'Fútbol': SOCCER.map(l => `soccer/${l}`),
  'NFL': ['football/nfl', 'football/college-football'],
  'NBA': ['basketball/nba', 'basketball/wnba', 'basketball/mens-college-basketball'],
  'MLB': ['baseball/mlb'],
  'NHL': ['hockey/nhl']
};
const ALL = Object.values(LEAGUES).flat();

type Game = {id: string, path: string, name: string, date: string, completed: boolean, state: string, detail: string, teams: {names: string[], score: string, homeAway: string}[]};
type Check = {status: 'waiting' | 'needs_review' | 'settled', outcome?: 'won' | 'lost' | 'void', reason: string, evidence?: unknown};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['fc', 'cf', 'club', 'de', 'the', 'sc', 'ac', 'cd', 'afc', 'ud', 'deportivo', 'atletico', 'real', 'united', 'city']);
const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const shift = (iso: string, n: number) => {const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d;};

const scoreboards = new Map<string, Promise<Game[]>>();
function scoreboard(path: string, date: string): Promise<Game[]> {
  const key = path + date;
  if (!scoreboards.has(key)) scoreboards.set(key, (async () => {
    const r = await fetch(`${ESPN}/${path}/scoreboard?dates=${date}&limit=300`);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.events || []).map((e: any) => ({
      id: String(e.id), path, name: e.name || '', date: e.date || '',
      completed: !!e.status?.type?.completed, state: e.status?.type?.name || '', detail: e.status?.type?.detail || '',
      teams: (e.competitions?.[0]?.competitors || []).map((c: any) => ({
        names: [c.team?.displayName, c.team?.shortDisplayName, c.team?.name, c.team?.location, c.team?.abbreviation, c.athlete?.displayName].filter(Boolean).map((n: string) => norm(n)),
        score: String(c.score ?? ''), homeAway: c.homeAway || ''
      }))
    }));
  })().catch(() => []));
  return scoreboards.get(key)!;
}

function sideMatches(side: string, names: string[]) {
  const s = norm(side);
  if (!s) return false;
  if (names.some(n => n && (n === s || n.includes(s) || (n.length >= 4 && s.includes(n))))) return true;
  const words = s.split(' ').filter(w => w.length >= 4 && !STOP.has(w));
  return words.length > 0 && words.every(w => names.some(n => n.split(' ').includes(w)));
}

async function findGame(event: string, sport: string, eventDate: string): Promise<Game | null> {
  const sides = event.split(/\s+(?:vs\.?|v\.?|@|at|-|contra)\s+/i).map(s => s.trim()).filter(Boolean);
  if (sides.length !== 2) return null;
  const paths = LEAGUES[sport] || ALL;
  const dates = [0, -1, 1].map(n => day(shift(eventDate, n)));
  const found: Game[] = [];
  for (const date of dates) {
    const lists = await Promise.all(paths.map(p => scoreboard(p, date)));
    for (const g of lists.flat()) {
      if (g.teams.length !== 2) continue;
      const direct = sideMatches(sides[0], g.teams[0].names) && sideMatches(sides[1], g.teams[1].names);
      const swapped = sideMatches(sides[0], g.teams[1].names) && sideMatches(sides[1], g.teams[0].names);
      if ((direct || swapped) && !found.some(f => f.id === g.id)) found.push(g);
    }
    if (found.length) break;
  }
  return found.length === 1 ? found[0] : null;
}

// Resumen compacto del partido: marcador, estadísticas de equipo, jugadores y eventos clave.
async function gameFacts(g: Game) {
  const r = await fetch(`${ESPN}/${g.path}/summary?event=${g.id}`);
  if (!r.ok) return {game: g.name, status: g.detail};
  const j = await r.json();
  const comp = j.header?.competitions?.[0] || {};
  const facts: Record<string, unknown> = {
    game: g.name, league: g.path, status: comp.status?.type?.detail || g.detail, completed: g.completed,
    score: (comp.competitors || []).map((c: any) => ({team: c.team?.displayName, homeAway: c.homeAway, score: c.score, winner: c.winner, periods: (c.linescores || []).map((l: any) => l.displayValue)})),
    teamStats: (j.boxscore?.teams || []).map((t: any) => ({team: t.team?.displayName, stats: Object.fromEntries((t.statistics || []).map((s: any) => [s.label || s.name, s.displayValue]))})),
    players: (j.boxscore?.players || []).map((t: any) => ({team: t.team?.displayName, categories: (t.statistics || []).map((c: any) => ({name: c.name, labels: c.labels, athletes: (c.athletes || []).map((a: any) => [a.athlete?.displayName, ...(a.stats || [])].join(' | '))}))})),
    keyEvents: (j.keyEvents || []).map((e: any) => [e.clock?.displayValue, e.type?.text, e.team?.displayName, (e.participants || []).map((p: any) => p.athlete?.displayName).join(', ')].filter(Boolean).join(' · '))
  };
  if (JSON.stringify(facts).length > 60000) delete facts.players;
  if (JSON.stringify(facts).length > 60000) facts.keyEvents = (facts.keyEvents as string[]).slice(0, 60);
  return facts;
}

const tool = {
  name: 'settle',
  description: 'Resultado de cada condición del Pick según los datos oficiales del partido.',
  input_schema: {
    type: 'object',
    properties: {
      conditions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            condition: {type: 'string'},
            game_index: {type: ['integer', 'null'], description: 'Índice del partido en la lista de datos, o null si no corresponde a ninguno.'},
            result: {type: 'string', enum: ['won', 'lost', 'void', 'unknown']},
            confidence: {type: 'number', description: 'De 0 a 1.'},
            explanation: {type: 'string', description: 'Una frase en español con el dato que lo decide (p. ej. "Terminó 2-1: 3 goles, más de 2.5").'}
          },
          required: ['condition', 'game_index', 'result', 'confidence', 'explanation']
        }
      }
    },
    required: ['conditions']
  }
};

async function judge(apiKey: string, legs: any[], facts: unknown[]) {
  const text = `Eres el juez de resultados de AE SPORTS. Decide si cada condición de este Pick acertó según los datos OFICIALES del partido.
Reglas de apuestas habituales: "Más de/Menos de X" compara con el total exacto; hándicaps suman la línea al marcador; en fútbol los mercados son a 90 minutos más añadido salvo que digan prórroga/clasifica; en NFL/NBA/NHL/MLB incluyen prórroga salvo que digan "tiempo reglamentario". Partido suspendido o aplazado = void. Jugador que no participó en una apuesta de jugador = void.
Si el dato necesario no aparece en los datos, responde "unknown" con baja confianza. No adivines. Si el partido no ha terminado, "unknown".
Divide combinadas en sus condiciones individuales.

PICK:
${JSON.stringify(legs.map(l => ({deporte: l.sport, partido: l.event, pronostico: l.selection})))}

DATOS DE LOS PARTIDOS (índice = posición en la lista):
${JSON.stringify(facts)}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: {'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
    body: JSON.stringify({model: MODEL, max_tokens: 2000, tools: [tool], tool_choice: {type: 'tool', name: 'settle'}, messages: [{role: 'user', content: text}]})
  });
  if (!r.ok) throw Error('anthropic ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const out = await r.json();
  return out?.content?.find((c: any) => c.type === 'tool_use')?.input?.conditions || [];
}

async function evaluate(apiKey: string, pick: any, today: string): Promise<Check> {
  const legs = pick.legs || [];
  const events: {event: string, sport: string}[] = [];
  for (const leg of legs) for (const e of String(leg.event).split(/\s+\/\s+/)) events.push({event: e, sport: leg.sport});
  if (events.some(e => !LEAGUES[e.sport] && e.sport !== 'Otros')) return {status: 'needs_review', reason: 'Deporte sin marcadores automáticos: revisa el resultado a mano.'};
  const games: Game[] = [];
  for (const e of events) {
    const g = await findGame(e.event, e.sport, pick.event_date);
    if (!g) {
      const old = shift(today, -2).toISOString().slice(0, 10) >= pick.event_date;
      return old ? {status: 'needs_review', reason: `No encontramos el partido "${e.event}" en los marcadores oficiales.`} : {status: 'waiting', reason: `Buscando el partido "${e.event}".`};
    }
    if (!games.some(x => x.id === g.id)) games.push(g);
  }
  const postponed = games.find(g => /postpon|cancel|suspend|abandon/i.test(g.state + ' ' + g.detail));
  const facts = await Promise.all(games.map(gameFacts));
  const conditions = await judge(apiKey, legs, facts);
  const evidence = {games: games.map(g => ({id: g.id, league: g.path, name: g.name, status: g.detail})), conditions, model: MODEL};
  if (!conditions.length) return {status: 'needs_review', reason: 'La IA no pudo evaluar el Pick.', evidence};
  const sure = (c: any) => Number(c.confidence) >= 0.9;
  const lost = conditions.find((c: any) => c.result === 'lost' && sure(c) && games[c.game_index]?.completed);
  if (lost) return {status: 'settled', outcome: 'lost', reason: lost.explanation, evidence};
  if (!postponed && games.some(g => !g.completed)) return {status: 'waiting', reason: 'El partido todavía no ha terminado.', evidence};
  if (conditions.every((c: any) => c.result === 'won' && sure(c))) return {status: 'settled', outcome: 'won', reason: conditions.map((c: any) => c.explanation).join(' · '), evidence};
  if (conditions.every((c: any) => c.result === 'void' && sure(c))) return {status: 'settled', outcome: 'void', reason: conditions[0].explanation, evidence};
  const unclear = conditions.find((c: any) => !sure(c) || c.result === 'unknown') || conditions.find((c: any) => c.result === 'void');
  return {status: 'needs_review', reason: unclear?.explanation || 'Resultado no concluyente.', evidence};
}

Deno.serve(async req => {
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
  const secret = Deno.env.get('AE_CRON_SECRET');
  if (!secret || req.headers.get('x-ae-cron') !== secret) return respond({error: 'No autorizado.'}, 401);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return respond({error: 'Falta ANTHROPIC_API_KEY.'}, 503);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Toronto'}).format(new Date());
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;

  const {data: picks, error} = await db.from('ae_community_picks').select('id,legs,event_date,american_odds')
    .eq('outcome', 'pending').eq('moderation_status', 'approved').eq('hidden', false)
    .not('event_date', 'is', null).lte('event_date', today).order('event_date', {ascending: true}).limit(200);
  if (error) return respond({error: error.message}, 500);
  const {data: checks} = await db.from('ae_pick_settlement_checks').select('pick_id,status,last_checked_at,attempts').in('pick_id', (picks || []).map(p => p.id));
  const byPick = new Map((checks || []).map(c => [c.pick_id, c]));
  const due = (picks || []).filter(p => {
    const c = byPick.get(p.id);
    if (!c) return true;
    if (c.status === 'needs_review') return false;
    return Date.now() - new Date(c.last_checked_at).getTime() > 90 * 60 * 1000;
  }).slice(0, body?.pick_id ? 200 : BATCH).filter(p => !body?.pick_id || p.id === body.pick_id);

  const results = [];
  for (const pick of due) {
    let check: Check;
    try {check = await evaluate(apiKey, pick, today);}
    catch (e) {console.error('settle', pick.id, e); check = {status: 'waiting', reason: 'Error temporal al consultar los datos.'};}
    if (!dryRun) {
      if (check.status === 'settled' && check.outcome) {
        const r = await db.rpc('ae_pick_auto_settle', {p_pick_id: pick.id, p_outcome: check.outcome, p_reason: check.reason.slice(0, 500), p_evidence: check.evidence ?? null});
        if (r.error) {console.error('auto_settle', pick.id, r.error); check = {...check, status: 'needs_review', reason: 'No se pudo guardar el resultado: ' + r.error.message};}
      }
      if (check.status !== 'settled') {
        const prev = byPick.get(pick.id);
        await db.from('ae_pick_settlement_checks').upsert({pick_id: pick.id, status: check.status, suggested_outcome: check.outcome ?? null,
          reason: check.reason.slice(0, 500), evidence: check.evidence ?? null, attempts: (prev?.attempts || 0) + 1, last_checked_at: new Date().toISOString()});
      }
    }
    results.push({pick: pick.id, status: check.status, outcome: check.outcome ?? null, reason: check.reason});
  }
  return respond({checked: results.length, results});
});
