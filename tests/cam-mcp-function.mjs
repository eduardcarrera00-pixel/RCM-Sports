// Prueba sin red del conector MCP (supabase/functions/cam-mcp): protocolo, clave,
// las 15 herramientas con datos falsos y que nunca escribe ni usa la clave secreta
// fuera de «visitas».
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';

const KEY = 'test-key-cam-mcp';
const KEY_HASH = crypto.createHash('sha256').update(KEY).digest('hex');
let source = fs.readFileSync('supabase/functions/cam-mcp/index.ts', 'utf8');
assert.match(source, /const ACCESS_KEY_SHA256 = \[[^\]]*\];/);
source = source.replace(/const ACCESS_KEY_SHA256 = \[[^\]]*\];/, `const ACCESS_KEY_SHA256 = ["${KEY_HASH}"];`);
source = stripTypeScriptTypes(source);

const AUTHOR = 'b5b3c2ca-c2bd-418c-b9ea-6b34612b6976';
const TAKE = '7c0d7a44-72e6-45b9-be3b-4392af6b0da7';
const ARTICLE = '4ee2dc32-4a21-4e59-a513-743dff3cc879';
const PICK = 'cd962c8e-fda7-4e08-9b5d-bfb02d1b7bd2';
const take = {id: TAKE, author_id: AUTHOR, author: 'eduardcarrera00', sport: 'football', competition: 'Balón de Oro', title: 'Lamine Yamal Balón de Oro 2026', body: 'Texto del Take', created_at: '2026-10-19T00:12:21Z', upvotes: 2, downvotes: 1};
const pick = {id: PICK, author: 'eduardcarrera00', title: 'PSG v Barcelona', explanation: '', legs: [{event: 'PSG v Barcelona', selection: 'PSG', sport: 'Fútbol', odds: 240}], american_odds: 240, decimal_odds: 3.4, created_at: '2026-10-20T23:32:00Z', event_date: '2026-10-20', outcome: 'won', result_points: 2.4, moderation_status: 'approved'};
const leaderRow = {rank_position: 1, user_id: AUTHOR, username: 'eduardcarrera00', points: 6, hits: 2, resolved: 2, accuracy: 100};

function fake(path, body) {
  const [name, query = ''] = path.split('?');
  const rpcs = {
    ae_public_take_feed: [take],
    ae_public_take_reply_counts: [{take_id: TAKE, reply_count: 3}],
    ae_take_comment_thread: [{id: 'c1', parent_id: null, author: 'madridista234', body: 'No estoy de acuerdo', created_at: '2026-10-20T00:00:00Z'}],
    ae_take_result_ranking_details: [{user_id: AUTHOR, username: 'eduardcarrera00', points: 13, correct_takes: 1, total_resolved: 1, best_take_id: TAKE, best_take_title: take.title, best_take_points: 13}],
    ae_take_result_ranking: [{user_id: AUTHOR, username: 'eduardcarrera00', points: 13}],
    ae_home_take_showcase: [{...take, kind: 'positive', rank_number: 1, points: 13}],
    ae_pick_result_ranking: [{user_id: AUTHOR, username: 'eduardcarrera00', points: 2.4, correct_picks: 1, total_resolved: 1}],
    ae_pick_result_ranking_worst: [],
    cam_weekly_pick_result: null,
    rcm_read_article_totals: [{article_id: ARTICLE, likes: 4, top_comment: 'Gran análisis'}],
    cam_nfl_leaderboard: [leaderRow],
    cam_football_leaderboard: [leaderRow],
    cam_mcp_analytics_summary: {today_visits: 5, last7_visits: 40, last30_visits: 120, unique7: 30, unique30: 90, total_visits: 300, daily: [], sources: [], campaigns: [], sections: []},
    ae_public_take_profile: [take],
    ae_take_prestige: [{resolved: 1, risk_score: 13, risk_label: 'Atrevido', bold_attempts: 1, bold_hits: 1, bold_rate: 100, legendary_count: 0, rated_points: 13}],
    ae_take_legendary: [],
    ae_user_champion_picks: [{competition: 'laliga', season: '2026/27', team: 'FC Barcelona', points: 3, state: 'open', awarded_points: 0, winner: null, closes_at: '2026-10-30T23:59:00Z'}],
    cam_nfl_profile_summary: [{points: 6, hits: 2, resolved: 2, accuracy: 100, rank_position: 2, last_week: 8, last_week_points: 3}],
    cam_football_profile_summary: [{points: 0, hits: 0, resolved: 0, accuracy: 0, rank_position: null, last_competition: null, last_matchday: null, last_points: 0}],
  };
  if (name.startsWith('rpc/')) {
    const fn = name.slice(4);
    assert.ok(fn in rpcs, `función no prevista: ${fn}`);
    return rpcs[fn];
  }
  if (body !== undefined) throw new Error(`POST fuera de rpc: ${path}`);
  const tables = {
    articles: query.includes('body') && query.includes(`id=eq.${ARTICLE}`)
      ? [{id: ARTICLE, title: 'Power Rankings NFL Semana 7', category: 'NFL', author: 'adrianmendozac27', summary: 'Top 5', body: '<p>San&nbsp;Francisco</p><p>Sigue arriba &amp; manda.<br>Fin</p>', featured: false, created_at: '2026-10-29T18:41:04Z'}]
      : [{id: ARTICLE, title: 'Power Rankings NFL Semana 7', category: 'NFL', author: 'adrianmendozac27', summary: 'Top 5', featured: false, created_at: '2026-10-29T18:41:04Z'}],
    ae_article_views: [{article_id: ARTICLE, views: 5}],
    comments: [],
    ae_opinions: query.includes('id=eq.') ? [{id: 'a0a0a0a0-0000-4000-8000-000000000001', sport: 'nfl', title: 'Opinión', summary: 'Resumen', body: 'Párrafo uno\n\nPárrafo dos', author: 'Eduard Carrera', featured: true, created_at: '2026-10-28T00:00:00Z', edited_at: null}] : [],
    ae_opinion_views: [],
    ae_community_picks: [pick],
    ae_editorial_weekly_picks: [{id: 'b6e943cb-017f-44cf-8fd6-3b5a1d7c7d12', title: 'El Clásico', event_name: 'FC Barcelona vs Real Madrid', selection: 'Over 4.5', american_odds: 125, analysis: 'Será cine.', created_at: '2026-10-25T17:42:00Z', expires_at: '2026-10-26T17:42:00Z'}],
    nfl_rankings: [{edition: 'Week 7', team_ids: ['SF', 'MIN', 'BUF'], updated_at: '2026-10-29T18:34:20Z'}],
    nfl_ranking_history: [{edition: 'Week 7', team_ids: ['SF', 'MIN', 'BUF'], superseded_at: '2026-10-29T18:33:00Z'}, {edition: 'Week 6', team_ids: ['MIN', 'SF', 'KC'], superseded_at: '2026-10-20T00:00:00Z'}],
    nfl_teams: [{id: 'SF', name: 'San Francisco 49ers'}, {id: 'MIN', name: 'Minnesota Vikings'}, {id: 'BUF', name: 'Buffalo Bills'}, {id: 'BAL', name: 'Baltimore Ravens'}],
    champions_rankings: [{season: '2026/27', edition: 'Jornada 3', team_ids: ['52747', '50037'], published_at: '2026-10-24T04:25:38Z'}],
    champions_clubs: [{id: '52747', name: 'Paris Saint-Germain'}, {id: '50037', name: 'Bayern München'}],
    cam_nfl_games: query.startsWith('select=season') ? [{season: 2026}] : query.startsWith('select=week') ? [{week: 8}]
      : [{id: '401873026', season: 2026, week: 8, home_id: 'BUF', away_id: 'BAL', kickoff: '2026-11-01T18:00:00Z', status: 'scheduled', home_score: null, away_score: null, winner_id: null, odds_home: -174, odds_away: 144, probability_home: 0.607765, probability_away: 0.392235, points_home: 3, points_away: 5, picks_open: true}],
    cam_football_games: query.startsWith('select=season') ? [{season: 2026}] : query.startsWith('select=matchday') ? [{matchday: 18}]
      : [{id: '401882828', competition: 'laliga', season: 2026, matchday: 18, home_id: '243', away_id: '97', kickoff: '2026-10-26T20:00:00Z', status: 'final', home_score: 2, away_score: 0, outcome: 'home', odds_home: 120, odds_draw: 230, odds_away: 260, probability_home: 0.42, probability_draw: 0.28, probability_away: 0.3, points_home: 5, points_draw: 7, points_away: 7, picks_open: false}],
    cam_football_teams: [{id: '243', name: 'Sevilla'}, {id: '97', name: 'Osasuna'}],
    ae_take_questions: [{id: '41df762f-a97c-4e3d-8044-842f86470056', competition: 'laliga', season: '2026/27', period: 'season', prompt: '¿Quién será campeón de LaLiga 2026/27?', closes_at: '2026-10-30T23:59:00Z', status: 'settled', correct_option_id: 'o1', settled_at: null}],
    ae_take_options: [{id: 'o2', question_id: '41df762f-a97c-4e3d-8044-842f86470056', label: 'Real Madrid', points: 4}, {id: 'o1', question_id: '41df762f-a97c-4e3d-8044-842f86470056', label: 'FC Barcelona', points: 3}],
  };
  assert.ok(name in tables, `tabla no prevista: ${name}`);
  return tables[name];
}

const requests = [];
let handler;
const context = {
  console: {log() {}, error() {}}, Response, Request, URL, AbortSignal, TextEncoder, Intl, btoa, crypto: globalThis.crypto, Date,
  Deno: {
    env: {get: (k) => ({SUPABASE_URL: 'https://test.invalid', SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_test"}', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_test"}'})[k]},
    serve: (fn) => { handler = fn; },
  },
  fetch: async (url, init = {}) => {
    const u = new URL(String(url));
    assert.equal(u.origin, 'https://test.invalid');
    assert.ok(u.pathname.startsWith('/rest/v1/'), u.pathname);
    assert.ok(['GET', 'POST'].includes(init.method), init.method);
    const path = decodeURIComponent(u.pathname.slice('/rest/v1/'.length) + u.search);
    requests.push({path, key: init.headers.apikey, auth: init.headers.Authorization});
    return new Response(JSON.stringify(fake(path, init.body === undefined ? undefined : JSON.parse(init.body))), {status: 200});
  },
};
vm.runInNewContext(source, context);
assert.equal(typeof handler, 'function');

const post = async (body, {path = `/cam-mcp/${KEY}`, headers = {}} = {}) => {
  const response = await handler(new Request(`https://test.invalid${path}`, {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)}));
  const text = await response.text();
  return {status: response.status, body: text ? JSON.parse(text) : null};
};
const call = async (name, args = {}) => {
  const r = await post({jsonrpc: '2.0', id: name, method: 'tools/call', params: {name, arguments: args}});
  assert.equal(r.status, 200);
  assert.equal(r.body.error, undefined, JSON.stringify(r.body.error));
  return r.body.result;
};
const data = async (name, args) => {
  const result = await call(name, args);
  assert.notEqual(result.isError, true, `${name}: ${result.content?.[0]?.text}`);
  return JSON.parse(result.content[0].text);
};

// Clave
assert.equal((await post({jsonrpc: '2.0', id: 1, method: 'ping'}, {path: '/cam-mcp'})).status, 401);
assert.equal((await post({jsonrpc: '2.0', id: 1, method: 'ping'}, {path: '/cam-mcp/otra-clave'})).status, 401);
assert.equal((await post({jsonrpc: '2.0', id: 1, method: 'ping'}, {path: '/cam-mcp', headers: {authorization: `Bearer ${KEY}`}})).status, 200);
assert.equal((await post({jsonrpc: '2.0', id: 1, method: 'ping'}, {path: `/functions/v1/cam-mcp?key=${KEY}`})).status, 200);
const get = await handler(new Request(`https://test.invalid/cam-mcp/${KEY}`));
assert.equal(get.status, 200);
assert.match(await get.text(), /funcionando/);
assert.equal((await handler(new Request(`https://test.invalid/cam-mcp/${KEY}`, {headers: {accept: 'text/event-stream'}}))).status, 405);

// Protocolo
const init = await post({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'test', version: '1'}}});
assert.equal(init.body.result.protocolVersion, '2025-06-18');
assert.equal(init.body.result.serverInfo.name, 'cam-sports');
assert.equal((await post({jsonrpc: '2.0', method: 'notifications/initialized'})).status, 202);
const list = await post({jsonrpc: '2.0', id: 2, method: 'tools/list'});
const tools = list.body.result.tools;
assert.equal(tools.length, 15);
for (const tool of tools) {
  assert.match(tool.name, /^[a-z_]+$/);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
}
const batch = await post([{jsonrpc: '2.0', id: 3, method: 'ping'}, {jsonrpc: '2.0', method: 'notifications/x'}]);
assert.deepEqual(batch.body, [{jsonrpc: '2.0', id: 3, result: {}}]);
assert.equal((await post({jsonrpc: '2.0', id: 4, method: 'tools/call', params: {name: 'nada'}})).body.error.code, -32602);
assert.equal((await post({jsonrpc: '2.0', id: 5, method: 'resources/list'})).body.error.code, -32601);

// Herramientas
const resumen = await data('resumen');
assert.equal(resumen.takes_recientes[0].enlace, 'https://camsports.github.io/?t=tbPCysK9QYy56ms0YStpdg.fA16RHLmRbm-O0OSr2sNpw');
assert.equal(resumen.quinielas_abiertas.nfl.proximo.startsWith('Baltimore Ravens @ Buffalo Bills'), true);
assert.equal((await data('buscar_noticias', {texto: 'power', categoria: 'Fútbol'})).noticias[0].lecturas, 5);
const noticia = await data('leer_noticia', {id: ARTICLE});
assert.equal(noticia.texto, 'San Francisco\nSigue arriba & manda.\nFin');
assert.equal(noticia.me_gusta, 4);
assert.equal((await data('opiniones')).total, 0);
assert.equal((await data('opiniones', {id: 'a0a0a0a0-0000-4000-8000-000000000001'})).enlace, 'https://camsports.github.io/?opinion=a0a0a0a0-0000-4000-8000-000000000001');
assert.equal((await data('takes', {deporte: 'Fútbol'})).takes[0].comentarios, 3);
assert.equal((await data('leer_take', {id: TAKE})).conversacion.length, 1);
assert.equal((await data('clasificacion_takes')).clasificacion[0].mejor_take.puntos, 13);
const picks = await data('picks', {estado: 'acertados'});
assert.equal(picks.picks[0].estado, 'acertado');
assert.equal(picks.pick_de_la_semana[0].estado, 'cerrado, sin resultado registrado');
assert.ok((await data('clasificacion_picks', {peores: true})).peores);
const ranking = await data('power_rankings', {liga: 'nfl'});
assert.equal(ranking.nfl.comparado_con.startsWith('Week 6'), true, 'compara con la última versión con otro orden');
assert.deepEqual(ranking.nfl.equipos.map((e) => e.movimiento), ['+1', '-1', 'nuevo']);
const nfl = await data('quiniela', {deporte: 'nfl'});
assert.equal(nfl.partidos[0].probabilidad.local, '60.8%');
const futbol = await data('quiniela', {deporte: 'futbol', competicion: 'laliga', estado: 'resultados'});
assert.equal(futbol.partidos[0].resultado, 'gana Sevilla');
assert.equal((await data('clasificacion_quiniela', {deporte: 'nfl', periodo: 'semana'})).semana, 8);
assert.equal((await data('clasificacion_quiniela', {deporte: 'futbol', periodo: 'jornada', competicion: 'laliga'})).jornada, 18);
assert.equal((await data('quien_sera_campeon')).preguntas[0].campeon, 'FC Barcelona');
assert.equal((await data('visitas')).hoy, 5);
const perfil = await data('perfil_jugador', {usuario: '@EduardCarrera00'});
assert.equal(perfil.usuario_id, AUTHOR);
assert.equal(perfil.prestigio.perfil, 'Atrevido');

// Errores de argumentos: respuesta normal con isError, nunca una excepción
for (const [name, args] of [['takes', {deporte: 'golf'}], ['leer_noticia', {id: 'x'}], ['quiniela', {}], ['clasificacion_quiniela', {deporte: 'futbol', periodo: 'jornada'}]]) {
  const result = await call(name, args);
  assert.equal(result.isError, true, name);
}

// Solo lectura y la clave secreta solo para las visitas
for (const r of requests) {
  if (r.path === 'rpc/cam_mcp_analytics_summary') assert.equal(r.key, 'sb_secret_test');
  else assert.equal(r.key, 'sb_publishable_test', r.path);
  assert.equal(r.auth, undefined, 'las claves nuevas no van como Bearer');
}
console.log(`PASS: cam-mcp responde solo con clave, habla MCP (initialize, notificaciones, lotes) y sus 15 herramientas devuelven datos de solo lectura (${requests.length} consultas, clave secreta solo en «visitas»).`);
