// AE SPORTS · Verificación automática y gratuita de Picks terminados.
// Busca el partido en los marcadores públicos de ESPN y aplica reglas de apuestas a los
// mercados habituales (ganador, empate, hándicap, más/menos, ambos anotan, tarjetas, córners).
// Lo que no se puede decidir con seguridad queda en la lista de revisión del administrador.
import {createClient} from 'npm:@supabase/supabase-js@2.117.3';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const BATCH = 40;
const SOCCER = ['mex.1', 'eng.1', 'esp.1', 'ita.1', 'ger.1', 'fra.1', 'usa.1', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf',
  'por.1', 'ned.1', 'arg.1', 'bra.1', 'eng.2', 'eng.fa', 'eng.league_cup', 'esp.copa_del_rey', 'concacaf.champions', 'conmebol.libertadores',
  'conmebol.sudamericana', 'fifa.friendly', 'fifa.worldq.concacaf', 'mex.2', 'sco.1', 'tur.1', 'sau.1', 'bel.1', 'col.1', 'chi.1'];
const LEAGUES: Record<string, string[]> = {
  'Fútbol': SOCCER.map(l => `soccer/${l}`),
  'NFL': ['football/nfl', 'football/college-football'],
  'NBA': ['basketball/nba', 'basketball/wnba', 'basketball/mens-college-basketball'],
  'MLB': ['baseball/mlb'],
  'NHL': ['hockey/nhl']
};

type Team = {names: string[], display: string, score: number, periods: number[], homeAway: string, stats?: Record<string, number>};
type Game = {id: string, path: string, name: string, completed: boolean, state: string, detail: string, teams: Team[]};
type Verdict = {result: 'won' | 'lost' | 'void' | 'unsupported' | 'waiting', why: string, game?: Game};
type Check = {status: 'waiting' | 'needs_review' | 'settled', outcome?: 'won' | 'lost' | 'void', reason: string, evidence?: unknown};

const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.+\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['fc', 'cf', 'club', 'de', 'del', 'the', 'sc', 'ac', 'cd', 'afc', 'ud', 'deportivo', 'atletico', 'real', 'united', 'city', 'gana', 'win']);
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const shift = (iso: string, n: number) => {const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d;};

// ---------- Marcadores ----------
const boards = new Map<string, Promise<Game[]>>();
function scoreboard(path: string, date: string): Promise<Game[]> {
  const key = path + date;
  if (!boards.has(key)) boards.set(key, (async () => {
    // Avoid treating a temporary provider failure as "no game": log it and
    // retry once. Cron can retry remaining unavailable events on later runs.
    let j: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`${ESPN}/${path}/scoreboard?dates=${date}&limit=300`, {signal: AbortSignal.timeout(12000)});
        if (r.ok) {j = await r.json(); break;}
        console.warn('ESPN scoreboard unavailable', {path, date, status: r.status});
        if (r.status !== 429 && r.status < 500) break;
      } catch (error) {console.warn('ESPN scoreboard request failed', {path, date, error: String(error)});}
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!j) return [];
    return (j.events || []).map((e: any) => ({
      id: String(e.id), path, name: e.name || '',
      completed: !!e.status?.type?.completed, state: e.status?.type?.name || '', detail: e.status?.type?.detail || '',
      teams: (e.competitions?.[0]?.competitors || []).map((c: any) => ({
        names: [c.team?.displayName, c.team?.shortDisplayName, c.team?.name, c.team?.location, c.team?.abbreviation].filter(Boolean).map(norm),
        display: c.team?.displayName || '', score: Number(c.score ?? NaN), homeAway: c.homeAway || '',
        periods: (c.linescores || []).map((l: any) => Number(l.value ?? l.displayValue))
      }))
    }));
  })().catch(() => []));
  return boards.get(key)!;
}

function sideMatches(side: string, names: string[]) {
  const s = norm(side);
  if (!s) return false;
  if (names.some(n => n && (n === s || n.includes(s) || (n.length >= 4 && s.includes(n))))) return true;
  const words = s.split(' ').filter(w => w.length >= 4 && !STOP.has(w));
  return words.length > 0 && words.every(w => names.some(n => n.split(' ').includes(w)));
}
const splitEvent = (event: string) => event.split(/\s+(?:vs\.?|v\.?|@|at|-|contra)\s+/i).map(s => s.trim()).filter(Boolean);

async function findGame(event: string, sport: string, eventDate: string): Promise<Game | null> {
  const sides = splitEvent(event);
  if (sides.length !== 2) return null;
  const paths = LEAGUES[sport] || Object.values(LEAGUES).flat();
  // Calling 30 leagues in parallel overwhelms the scoreboard provider and
  // can make valid matches appear "missing". Search priority leagues first
  // (Liga MX first for Fútbol), in small batches. Stop once unambiguous.
  for (const n of [0, -1, 1]) {
    const date = ymd(shift(eventDate, n));
    for (let start = 0; start < paths.length; start += 4) {
      const found: Game[] = [];
      const lists = await Promise.all(paths.slice(start, start + 4).map(p => scoreboard(p, date)));
      for (const g of lists.flat()) {
        if (g.teams.length !== 2) continue;
        const ok = (sideMatches(sides[0], g.teams[0].names) && sideMatches(sides[1], g.teams[1].names))
          || (sideMatches(sides[0], g.teams[1].names) && sideMatches(sides[1], g.teams[0].names));
        if (ok && !found.some(f => f.id === g.id)) found.push(g);
      }
      if (found.length === 1) return found[0];
      if (found.length > 1) return null;
    }
  }
  return null;
}

// Estadísticas de equipo (tarjetas, córners) desde el resumen del partido.
async function teamStats(g: Game) {
  if (g.teams[0].stats) return;
  const r = await fetch(`${ESPN}/${g.path}/summary?event=${g.id}`);
  const j = r.ok ? await r.json() : {};
  for (const t of j.boxscore?.teams || []) {
    const team = g.teams.find(x => x.names.includes(norm(t.team?.displayName)));
    if (team) team.stats = Object.fromEntries((t.statistics || []).map((s: any) => [s.name, Number(s.displayValue)]));
  }
  for (const t of g.teams) t.stats ||= {};
}

// ---------- Reglas de mercados ----------
const isSoccer = (g: Game) => g.path.startsWith('soccer/');
const fmt = (g: Game) => `${g.teams[0].display} ${g.teams[0].score}-${g.teams[1].score} ${g.teams[1].display}`;

function teamIn(text: string, g: Game, event: string): number {
  const t = norm(text);
  if (/\b(local|home)\b/.test(t)) return g.teams.findIndex(x => x.homeAway === 'home');
  if (/\b(visitante|visita|away)\b/.test(t)) return g.teams.findIndex(x => x.homeAway === 'away');
  const hits = g.teams.map((team, i) => {
    const sides = splitEvent(event).filter(side => sideMatches(side, team.names));
    const candidates = [...team.names, ...sides.map(norm)].filter(n => n.length >= 3);
    return candidates.some(n => new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(t)) ? i : -1;
  }).filter(i => i >= 0);
  return hits.length === 1 ? hits[0] : -1;
}

function period(t: string, g: Game): {name: string, score: (i: number) => number} | null {
  const first = /(primer|1er|1a|1º|1°|first)\s*(tiempo|mitad|half)|\b1h\b|medio tiempo|halftime/.test(t);
  const second = /(segundo|2do|2a|2º|2°|second)\s*(tiempo|mitad|half)|\b2h\b/.test(t);
  if (/(cuarto|quarter|entrada|inning|periodo|period|q[1-4]\b)/.test(t)) return null;
  const halfPeriods = isSoccer(g) ? 1 : g.path.startsWith('football/') || g.path.startsWith('basketball/') ? 2 : 0;
  if ((first || second) && !halfPeriods) return null;
  if (first) return {name: 'primer tiempo', score: i => g.teams[i].periods.slice(0, halfPeriods).reduce((a, b) => a + b, 0)};
  if (second) return {name: 'segundo tiempo', score: i => g.teams[i].periods.slice(halfPeriods, halfPeriods * 2).reduce((a, b) => a + b, 0)};
  // En fútbol, los mercados del partido son a 90 minutos: con prórroga se usan los dos primeros periodos.
  if (isSoccer(g) && g.teams[0].periods.length > 2) return {name: '90 minutos', score: i => g.teams[i].periods.slice(0, 2).reduce((a, b) => a + b, 0)};
  return {name: 'partido', score: i => g.teams[i].score};
}

const compareLine = (value: number, line: number, over: boolean): Verdict['result'] =>
  value === line ? 'void' : (over ? value > line : value < line) ? 'won' : 'lost';

async function judge(selection: string, event: string, g: Game): Promise<Verdict> {
  const t = norm(selection);
  if (/postpon|cancel|suspend|abandon/i.test(g.state + g.detail)) return {result: 'unsupported', why: `Partido ${g.detail.toLowerCase()}: revisa si se anula.`};
  if (!g.completed) return {result: 'waiting', why: 'El partido todavía no ha terminado.'};
  if (isSoccer(g) && /pen|penal/i.test(g.detail) && /(clasifica|avanza|to qualify|advance)/.test(t)) return {result: 'unsupported', why: 'Se decidió en penales.'};
  const p = period(t, g);
  if (!p) return {result: 'unsupported', why: 'Mercado por cuarto o entrada: revísalo a mano.'};
  if (p.name !== 'partido' && g.teams.some(x => !x.periods.length)) return {result: 'unsupported', why: `No hay marcador oficial del ${p.name}.`};
  const a = p.score(0), b = p.score(1);
  if ([a, b].some(n => !Number.isFinite(n))) return {result: 'unsupported', why: 'El marcador oficial no está disponible.'};
  const team = teamIn(t, g, event);
  const tag = p.name === 'partido' ? fmt(g) : `${p.name}: ${g.teams[0].display} ${a}-${b} ${g.teams[1].display}`;
  // Jugadores, touchdowns, pases, rebotes, etc. se dejan para revisión.
  if (/(touchdown|pase|pases|passing|rushing|receiving|yardas|yards|rebote|rebound|asistencia|assist|triple|hit|strikeout|ponche|jonron|home run|anotador|goleador|scorer|marca gol|shots|tiros a puerta|remates|faltas|fouls|fuera de juego|offside)/.test(t))
    return {result: 'unsupported', why: 'Apuesta de jugador o estadística especial: revísala a mano.'};

  // Más / menos de X
  const ou = t.match(/\b(mas|over|o|menos|under|u)\s*(?:de\s*)?(\d+(?:\.\d+)?)\b/);
  if (ou) {
    const over = /^(mas|over|o)$/.test(ou[1]), line = Number(ou[2]);
    if (!Number.isInteger(line * 2)) return {result: 'unsupported', why: 'Línea asiática (.25/.75): revísala a mano.'};
    let value: number, what: string;
    if (/(tarjeta|card|booking)/.test(t)) {
      if (p.name !== 'partido' && p.name !== '90 minutos') return {result: 'unsupported', why: 'Tarjetas por tiempo: revísalas a mano.'};
      await teamStats(g);
      const cards = (i: number) => (g.teams[i].stats?.yellowCards ?? NaN) + (g.teams[i].stats?.redCards ?? NaN);
      value = team >= 0 && !/(partido|total|match)/.test(t) ? cards(team) : cards(0) + cards(1); what = 'tarjetas';
      if ((g.teams[0].stats?.redCards || 0) + (g.teams[1].stats?.redCards || 0) > 0 && Math.abs(value - line) < 2)
        return {result: 'unsupported', why: `Hubo tarjeta roja y el conteo (${value}) queda cerca de la línea ${line}: depende de la casa.`};
    } else if (/(corner|esquina)/.test(t)) {
      if (p.name !== 'partido' && p.name !== '90 minutos') return {result: 'unsupported', why: 'Córners por tiempo: revísalos a mano.'};
      await teamStats(g);
      const corners = (i: number) => g.teams[i].stats?.wonCorners ?? NaN;
      value = team >= 0 && !/(partido|total|match)/.test(t) ? corners(team) : corners(0) + corners(1); what = 'córners';
    } else if (/(gol|goal|punto|point|carrera|run|anotacion|total|^(mas|menos|over|under|o|u) )/.test(t) || /^(mas|menos|over|under|o|u)\s*(de\s*)?\d/.test(t)) {
      value = team >= 0 && !/(partido|totales|total del|match)/.test(t) ? (team === 0 ? a : b) : a + b; what = isSoccer(g) ? 'goles' : 'puntos';
    } else return {result: 'unsupported', why: 'Mercado de más/menos no reconocido.'};
    if (!Number.isFinite(value)) return {result: 'unsupported', why: `No hay datos oficiales de ${what}.`};
    const r = compareLine(value, line, over);
    return {result: r, why: `${tag} · ${value} ${what} (${over ? 'más' : 'menos'} de ${line})`, game: g};
  }

  // Ambos anotan
  if (/(ambos (equipos )?anotan|both teams to score|\bbtts\b)/.test(t)) {
    const yes = !/\b(no)\b/.test(t.replace(/^ambos/, ''));
    const both = a > 0 && b > 0;
    return {result: both === yes ? 'won' : 'lost', why: `${tag} · ambos anotan: ${both ? 'sí' : 'no'}`, game: g};
  }

  // Sin empate (draw no bet)
  if (/(sin empate|draw no bet|\bdnb\b|apuesta sin empate)/.test(t)) {
    if (team < 0) return {result: 'unsupported', why: 'No identificamos el equipo.'};
    const mine = team === 0 ? a : b, other = team === 0 ? b : a;
    return {result: mine === other ? 'void' : mine > other ? 'won' : 'lost', why: `${tag} · sin empate`, game: g};
  }

  // Doble oportunidad
  if (/(doble oportunidad|double chance|o empate|or draw|empate o)/.test(t)) {
    if (team < 0) return {result: 'unsupported', why: 'No identificamos el equipo de la doble oportunidad.'};
    const mine = team === 0 ? a : b, other = team === 0 ? b : a;
    return {result: mine >= other ? 'won' : 'lost', why: `${tag} · doble oportunidad`, game: g};
  }

  // Empate
  if (/\b(empate|draw|empatan|tie)\b/.test(t) && team < 0) return {result: a === b ? 'won' : 'lost', why: `${tag} · empate`, game: g};

  // Hándicap / spread: equipo con línea con signo
  const hc = t.match(/(?:^|\s)([+-]\d+(?:\.\d+)?)(?:\s|$)/);
  if (hc && team >= 0) {
    const line = Number(hc[1]);
    if (!Number.isInteger(line * 2)) return {result: 'unsupported', why: 'Hándicap asiático (.25/.75): revísalo a mano.'};
    const mine = (team === 0 ? a : b) + line, other = team === 0 ? b : a;
    return {result: mine === other ? 'void' : mine > other ? 'won' : 'lost', why: `${tag} · hándicap ${hc[1]}`, game: g};
  }

  // Ganador (moneyline): "Tigres gana", "Lakers ML", o solo el nombre del equipo
  const rest = team >= 0 ? t : '';
  if (team >= 0 && (/(gana|ganador|ganar|victoria|win|winner|moneyline|\bml\b|1x2|resultado final)/.test(t) || rest.split(' ').length <= 4)) {
    const mine = team === 0 ? a : b, other = team === 0 ? b : a;
    return {result: mine > other ? 'won' : 'lost', why: `${tag} · ganador`, game: g};
  }
  return {result: 'unsupported', why: 'Mercado no reconocido automáticamente.'};
}

// ---------- Un Pick completo ----------
function conditionsOf(pick: any): {event: string, selection: string, sport: string}[] {
  const out = [];
  for (const leg of pick.legs || []) {
    const sel = String(leg.selection || '');
    if (/^\d+\.\s/.test(sel)) {
      for (const part of sel.split(/\s+\/\s+(?=\d+\.\s)/)) {
        const m = part.match(/^\d+\.\s*(.+?):\s*(.+)$/);
        if (m) out.push({event: m[1], selection: m[2], sport: leg.sport});
      }
    } else out.push({event: String(leg.event), selection: sel, sport: leg.sport});
  }
  return out;
}

async function evaluate(pick: any, today: string): Promise<Check> {
  const conditions = conditionsOf(pick);
  if (!conditions.length) return {status: 'needs_review', reason: 'No pudimos leer las condiciones del Pick.'};
  const verdicts: (Verdict & {condition: string})[] = [];
  // If the event date was yesterday and no scoreboard can verify it, expose
  // the Pick for review rather than hiding it in a never-ending waiting state.
  const old = shift(today, -1).toISOString().slice(0, 10) >= pick.event_date;
  for (const c of conditions) {
    if (!LEAGUES[c.sport] && c.sport !== 'Otros') {verdicts.push({condition: c.selection, result: 'unsupported', why: `Sin marcadores automáticos de ${c.sport}.`}); continue;}
    const g = await findGame(c.event, c.sport, pick.event_date);
    if (!g) {verdicts.push({condition: c.selection, result: old ? 'unsupported' : 'waiting', why: `No encontramos "${c.event}" en los marcadores oficiales.`}); continue;}
    verdicts.push({condition: c.selection, ...await judge(c.selection, c.event, g)});
  }
  const evidence = verdicts.map(v => ({condition: v.condition, result: v.result, why: v.why, game: v.game ? {id: v.game.id, league: v.game.path, name: v.game.name} : null}));
  const lost = verdicts.find(v => v.result === 'lost');
  if (lost) return {status: 'settled', outcome: 'lost', reason: lost.why, evidence};
  const waiting = verdicts.find(v => v.result === 'waiting');
  if (waiting) return {status: 'waiting', reason: waiting.why, evidence};
  const unsupported = verdicts.find(v => v.result === 'unsupported');
  if (unsupported) return {status: 'needs_review', reason: unsupported.why, evidence};
  if (verdicts.every(v => v.result === 'won')) return {status: 'settled', outcome: 'won', reason: verdicts.map(v => v.why).join(' · '), evidence};
  if (verdicts.every(v => v.result === 'void')) return {status: 'settled', outcome: 'void', reason: verdicts[0].why, evidence};
  // Combinada con una parte anulada: el momio cambia, así que lo decide el administrador.
  return {status: 'needs_review', outcome: 'won', reason: 'Combinada con una selección anulada (push): el momio cambia.', evidence};
}

Deno.serve(async req => {
  const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
  const allowed = await db.rpc('ae_settle_cron_ok', {p_secret: req.headers.get('x-ae-cron') || ''});
  if (allowed.error || allowed.data !== true) return respond({error: 'No autorizado.'}, 401);
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Toronto'}).format(new Date());
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dry_run === true;

  // Authorized dry-run diagnostics can re-check a known, already-resolved Pick
  // without changing its outcome. Scheduled runs still process only pending.
  const query = db.from('ae_community_picks').select('id,legs,event_date')
    .eq('moderation_status', 'approved').eq('hidden', false)
    .not('event_date', 'is', null).lte('event_date', today)
    .order('event_date', {ascending: true}).limit(300);
  if (!(dryRun && typeof body?.pick_id === 'string')) query.eq('outcome', 'pending');
  const {data: picks, error} = await query;
  if (error) return respond({error: error.message}, 500);
  const {data: checks} = await db.from('ae_pick_settlement_checks').select('pick_id,status,last_checked_at,attempts').in('pick_id', (picks || []).map(p => p.id));
  const byPick = new Map((checks || []).map(c => [c.pick_id, c]));
  const due = (picks || []).filter(p => {
    if (body?.pick_id) return p.id === body.pick_id;
    const c = byPick.get(p.id);
    if (!c) return true;
    // Continue looking for official results after escalation: data can arrive
    // late. Manual verification stays possible without blocking future retries.
    const retryMs = c.status === 'needs_review' ? 6 * 60 * 60 * 1000 : 50 * 60 * 1000;
    return Date.now() - new Date(c.last_checked_at).getTime() > retryMs;
  }).slice(0, BATCH);

  const results = [];
  for (const pick of due) {
    let check: Check;
    try {check = await evaluate(pick, today);}
    catch (e) {console.error('settle', pick.id, e); check = {status: 'waiting', reason: 'Error temporal al consultar los marcadores.'};}
    if (!dryRun) {
      if (check.status === 'settled' && check.outcome) {
        const r = await db.rpc('ae_pick_auto_settle', {p_pick_id: pick.id, p_outcome: check.outcome, p_reason: check.reason.slice(0, 500), p_evidence: check.evidence ?? null});
        if (r.error) {console.error('auto_settle', pick.id, r.error); check = {...check, status: 'needs_review', reason: 'No se pudo guardar el resultado: ' + r.error.message};}
      }
      if (check.status !== 'settled') {
        await db.from('ae_pick_settlement_checks').upsert({pick_id: pick.id, status: check.status, suggested_outcome: check.outcome ?? null,
          reason: check.reason.slice(0, 500), evidence: check.evidence ?? null, attempts: (byPick.get(pick.id)?.attempts || 0) + 1, last_checked_at: new Date().toISOString()});
      }
    }
    results.push({pick: pick.id, status: check.status, outcome: check.outcome ?? null, reason: check.reason});
  }
  return respond({checked: results.length, results});
});
