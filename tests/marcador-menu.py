"""El marcador como menú vertical: El marcador · Clasificación · Mejores anotadores (13 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).
Los datos de la clasificación y los anotadores son los de ESPN del 12 nov 2026
(tests/fixtures/sport-tables.json, la forma que devuelve cam_sport_tables_get).

Cubre:
  · NFL (390 de día y 320 de noche): al final de La semana, tres filas que se
    tocan; El marcador abierto al cargar con sus resultados; una sola llamada a
    cam_sport_tables_get y solo al acercarse al marcador; los adelantos
    («Mejor récord: Bills y 49ers (7-1)», «Gibbs y Walker, 11 touchdowns»);
    abrir Clasificación cierra El marcador y deja el foco en el botón; AFC / NFC
    con sus 4 divisiones de 4 equipos y el «n.º» de los 7 de playoff; Mejores
    anotadores con 5 y «Ver el top 10» con los 10 (empates incluidos);
  · Fútbol (390): el menú sigue a la liga elegida (LaLiga): «Líder: Barcelona ·
    33 pts», «Raphinha lidera con 15 goles», la tabla con 10 equipos, la franja
    de zonas, su leyenda y «Ver los 20 equipos»; al cambiar a Liga MX, otra
    llamada y otra tabla (8 de liguilla);
  · sin la migración (la función no existe): solo El marcador, como antes, sin errores;
  · escritorio (1366): el menú en la columna derecha, sin desbordarse;
  · sin desbordamientos, sin textos recortados y botones de al menos 44 px.

Uso: python3 -B tests/marcador-menu.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
TABLES = (ROOT / 'tests/fixtures/sport-tables.json').read_text(encoding='utf8')

COMMON = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  const TABLES = %s;
  F.rpc.cam_sport_tables_get = a => F.noMigration
    ? {data: null, error: {message: 'Could not find the function public.cam_sport_tables_get(p_competition) in the schema cache', code: 'PGRST202'}}
    : {data: TABLES[a.p_competition] || null, error: null};
})();
""" % TABLES

NFL = COMMON + r"""
(() => {
  const F = window.__fake, T = F.tables, H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  if (!F.anonymous) F.user = {id: 'u1', email: 'u1@example.com', user_metadata: {username: 'probador'}};
  T.articles = [];
  T.nfl_rankings = [{id: 1, edition: 'Week 9', team_ids: ['SF','DEN','BUF','CHI','JAX','GB','KC','PIT','CIN','DET'], updated_at: '2026-11-12T21:52:24Z'}];
  T.nfl_ranking_history = [];
  const g = (id, week, away, home, hours, extra) => Object.assign({id, season: 2026, week, home_id: home, away_id: away, kickoff: iso(hours),
    status: 'scheduled', picks_open: true, odds_locked_at: iso(-30), points_home: 2, points_away: 2,
    probability_home: 0.5, probability_away: 0.5, home_score: null, away_score: null, winner_id: null}, extra || {});
  const fin = (id, away, as, home, hs, hours, pa) => g(id, 9, away, home, hours, {status: 'final', picks_open: false,
    away_score: as, home_score: hs, winner_id: as > hs ? away : home, probability_away: pa, probability_home: 1 - pa});
  T.cam_nfl_games = [
    fin('w9-1', 'JAX', 33, 'BAL', 10, -150, .43), fin('w9-2', 'CIN', 34, 'ATL', 17, -100, .6), fin('w9-3', 'DET', 19, 'MIA', 9, -99, .24),
    fin('w9-4', 'GB', 45, 'NE', 27, -98, .61), fin('w9-5', 'LV', 17, 'SF', 38, -97, .2),
    g('w10-1', 10, 'NE', 'DET', 60), g('w10-2', 10, 'TEN', 'HOU', 64), g('w10-3', 10, 'CAR', 'ATL', 66)];
  T.cam_nfl_picks = [{game_id: 'w9-3', user_id: 'u1', team_id: 'DET', awarded_points: 2, settled_at: iso(-90)}];
  T.cam_nfl_laurels = [];
  F.rpc.cam_nfl_expert_picks = () => ({data: [], error: null});
  F.rpc.cam_nfl_pick_split = () => ({data: [], error: null});
  F.rpc.cam_nfl_expert_duel = () => ({data: [], error: null});
})();
"""

FOOTBALL = COMMON + r"""
(() => {
  const f = window.__fake; if (!f.anonymous) f.user = {id: 'u1', email: 'u1@example.com', user_metadata: {username: 'probador'}};
  const now = new Date(), season = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0), H = 36e5;
  const squads = [['86','Real Madrid'],['83','Barcelona'],['1068','Atlético'],['2922','Getafe'],['94','Valencia'],['102','Villarreal'],
                  ['218','Cruz Azul'],['232','Tigres']];
  f.tables.cam_football_teams = squads.map(([id, name]) => ({id, name, short_name: name, abbreviation: name.slice(0, 3).toUpperCase(), logo: ''}));
  const game = (id, competition, home, away, hours, hs, as) => ({id, competition, season, matchday: 13,
    kickoff: new Date(now.getTime() + hours * H).toISOString(), home_id: home, away_id: away,
    status: hs == null ? 'scheduled' : 'final', home_score: hs, away_score: as, outcome: hs == null ? null : hs > as ? 'home' : hs < as ? 'away' : 'draw',
    probability_home: .4, probability_draw: .3, probability_away: .3, points_home: 2, points_draw: 2, points_away: 2, is_bonus: false,
    odds_source: 'prueba', odds_locked_at: new Date(now.getTime() - H).toISOString(), picks_open: hs == null, opening_mode: 'auto'});
  f.tables.cam_football_games = [
    game('l1', 'laliga', '1068', '83', -30, 1, 2), game('l2', 'laliga', '102', '2922', -50, 2, 0), game('l3', 'laliga', '94', '86', -70, 0, 3),
    game('l4', 'laliga', '86', '83', 48), game('m1', 'ligamx', '232', '218', -40, 2, 3), game('m2', 'ligamx', '218', '232', 50)];
  f.tables.cam_football_picks = [];
  f.rpc.cam_football_leaderboard = () => ({data: [], error: null});
})();
"""
NO_MIGRATION = "window.__fake = window.__fake || {}; window.__fake.noMigration = true;"

STATE = """(sel) => {
  const root = document.querySelector(sel + ' .cam-st-menu');
  const text = (n, s) => [...(n || document).querySelectorAll(s)].map(e => e.textContent.replace(/\\s+/g, ' ').trim());
  if (!root) return {menu: false, calls: window.__fake.calls.filter(c => c.rpc === 'cam_sport_tables_get').map(c => c.args.p_competition)};
  const items = [...root.querySelectorAll(':scope > .cam-st-item')];
  const open = items.find(i => !i.querySelector('.cam-st-panel').hidden);
  return {
    menu: true,
    keys: items.map(i => i.dataset.key),
    titles: text(root, '.cam-st-title'), teasers: text(root, '.cam-st-teaser'),
    expanded: items.map(i => i.querySelector('.cam-st-toggle').getAttribute('aria-expanded')),
    open: open ? open.dataset.key : null,
    results: open ? open.querySelectorAll('.cam-ns-result').length : 0,
    seg: text(open, '.cam-st-seg-btn'), pressed: open ? [...open.querySelectorAll('.cam-st-seg-btn')].map(b => b.getAttribute('aria-pressed')) : [],
    groups: text(open, '.cam-st-group-name'), teams: open ? open.querySelectorAll('.cam-st-team').length : 0,
    seeds: text(open, '.cam-st-seed'), names: text(open, '.cam-st-name-text'),
    zones: open ? [...open.querySelectorAll('.cam-st-list .cam-st-zone')].map(z => (z.className.match(/is-(z\\d)/) || [])[1] || '') : [],
    legend: text(open, '.cam-st-legend-item'), intro: text(open, '.cam-st-note.is-intro')[0] || '',
    source: text(open, '.cam-st-note.is-source')[0] || '',
    players: text(open, '.cam-st-player-name'), totals: text(open, '.cam-st-total-value'), ranks: text(open, '.cam-st-player-rank'),
    subs: open ? [...open.querySelectorAll('.cam-st-player-sub')].map(e => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()) : [], more: text(open, '.cam-st-more, .cam-ns-link'),
    focus: document.activeElement?.getAttribute('data-cam-st-focus') || document.activeElement?.className || null,
    overflow: document.documentElement.scrollWidth - innerWidth,
    inner: Math.max(0, ...[...root.querySelectorAll('*')].filter(e => e.getClientRects().length).map(e => Math.round(e.getBoundingClientRect().right - root.getBoundingClientRect().right))),
    calls: window.__fake.calls.filter(c => c.rpc === 'cam_sport_tables_get').map(c => c.args.p_competition)
  };
}"""

CLIPPED = """(sel) => {
  const out = [];
  for (const node of document.querySelectorAll(sel + ' .cam-st-menu :is(.cam-st-title,.cam-st-seg-btn,.cam-st-group-name,.cam-st-num,.cam-st-seed,.cam-st-player-rank,.cam-st-total-value,.cam-st-total-unit,.cam-st-legend-item,.cam-st-note,.cam-ns-result-score,.cam-ns-result-tag)')) {
    if (!node.getClientRects().length) continue;
    if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 2) out.push(node.className + ': ' + node.textContent.trim().slice(0, 40));
  }
  for (const node of document.querySelectorAll(sel + ' .cam-st-menu :is(.cam-st-toggle,.cam-st-seg-btn)')) {
    if (!node.getClientRects().length) continue;
    const r = node.getBoundingClientRect();
    if (r.height < 43.5) out.push('objetivo pequeño ' + node.className + ' ' + Math.round(r.height));
  }
  return out;
}"""


def go(page, category, sel):
    page.click(f'body > nav.cam-mobile-bottom-nav > button[data-category="{category}"]'); page.wait_for_timeout(1800)


def reach(page, sel):
    page.evaluate(f"document.querySelector('{sel}')?.scrollIntoView({{block: 'start'}})"); page.wait_for_timeout(900)


def toggle(page, sel, key):
    page.locator(f'{sel} .cam-st-item[data-key="{key}"] .cam-st-toggle').click(); page.wait_for_timeout(350)


def shot(page, sel, name):
    if not SHOTS: return
    page.locator(f'{sel} .cam-st-menu').screenshot(path=str(SHOTS / f'{name}.png'))


def nfl_phone(width, dark):
    where = f'nfl-{width}-{"noche" if dark else "dia"}'
    sel = '#camNflScore'
    with fp.full_page(fake_js=NFL, dark=dark, width=width, height=820) as page:
        go(page, 'NFL', sel)
        assert page.evaluate("document.body.dataset.camTab") == 'semana', f'{where}: no abre La semana'
        before = page.evaluate(STATE, sel)
        assert before['menu'] and before['calls'] == [], f'{where}: llamada antes de acercarse {before["calls"]}'
        reach(page, sel)
        st = page.evaluate(STATE, sel)
        assert st['keys'] == ['marcador', 'tabla', 'anotadores'], f'{where}: filas {st["keys"]}'
        assert st['titles'] == ['El marcador', 'Clasificación NFL', 'Mejores anotadores'], f'{where}: títulos {st["titles"]}'
        assert st['teasers'] == ['Semana 9 · 5 resultados', 'Mejor récord: Bills y 49ers (7-1)', 'Gibbs y Walker, 11 touchdowns'], f'{where}: adelantos {st["teasers"]}'
        assert st['open'] == 'marcador' and st['expanded'] == ['true', 'false', 'false'] and st['results'] == 3, f'{where}: marcador {st}'
        assert st['calls'] == ['nfl'], f'{where}: llamadas {st["calls"]}'
        assert page.evaluate(CLIPPED, sel) == [] and st['overflow'] <= 0, f'{where}: recortes {page.evaluate(CLIPPED, sel)} {st["overflow"]}'
        shot(page, sel, f'{where}-1-marcador')

        toggle(page, sel, 'tabla')
        st = page.evaluate(STATE, sel)
        assert st['open'] == 'tabla' and st['expanded'] == ['false', 'true', 'false'], f'{where}: abrir tabla {st}'
        assert st['focus'] == 'nfl:toggle:tabla', f'{where}: foco {st["focus"]}'
        assert st['seg'] == ['AFC', 'NFC'] and st['pressed'] == ['true', 'false'], f'{where}: conferencias {st["seg"]} {st["pressed"]}'
        assert st['groups'] == ['AFC Este', 'AFC Norte', 'AFC Sur', 'AFC Oeste'] and st['teams'] == 16, f'{where}: divisiones {st["groups"]} {st["teams"]}'
        assert sorted(st['seeds']) == ['n.º %d' % i for i in range(1, 8)], f'{where}: playoff {st["seeds"]}'
        assert st['names'][:4] == ['Bills', 'Patriots', 'Jets', 'Dolphins'], f'{where}: equipos {st["names"][:4]}'
        assert st['source'].startswith('Datos de ESPN'), f'{where}: fuente {st["source"]}'
        assert page.evaluate(CLIPPED, sel) == [] and st['overflow'] <= 0 and st['inner'] <= 0, f'{where}: recortes tabla {page.evaluate(CLIPPED, sel)} {st["overflow"]} {st["inner"]}'
        shot(page, sel, f'{where}-2-afc')
        page.locator(f'{sel} .cam-st-seg-btn', has_text='NFC').click(); page.wait_for_timeout(400)
        st = page.evaluate(STATE, sel)
        assert st['pressed'] == ['false', 'true'] and st['groups'][0] == 'NFC Este' and st['names'][0] == 'Giants', f'{where}: NFC {st["groups"]} {st["names"][:2]}'
        assert st['focus'] == 'nfl:conf:NFC', f'{where}: foco tras NFC {st["focus"]}'

        toggle(page, sel, 'anotadores')
        st = page.evaluate(STATE, sel)
        assert st['open'] == 'anotadores' and len(st['players']) == 5 and st['players'][0] == 'Jahmyr Gibbs', f'{where}: anotadores {st["players"]}'
        assert st['ranks'] == ['1', '1', '3', '3', '3'] and st['totals'][:2] == ['11', '11'], f'{where}: puestos {st["ranks"]} {st["totals"]}'
        assert st['subs'][0] == 'Lions · RB · 9 de carrera, 2 de recepción', f'{where}: detalle {st["subs"][0]}'
        page.locator(f'{sel} .cam-st-more', has_text='Ver el top 10').click(); page.wait_for_timeout(400)
        st = page.evaluate(STATE, sel)
        assert len(st['players']) == 10 and st['ranks'][-1] == '9', f'{where}: top 10 {st["ranks"]}'
        assert page.evaluate(CLIPPED, sel) == [] and st['overflow'] <= 0, f'{where}: recortes anotadores {page.evaluate(CLIPPED, sel)}'
        shot(page, sel, f'{where}-3-anotadores')
        toggle(page, sel, 'anotadores')
        st = page.evaluate(STATE, sel)
        assert st['open'] is None and st['expanded'] == ['false', 'false', 'false'], f'{where}: cerrar {st}'
        assert st['calls'] == ['nfl'], f'{where}: llamadas repetidas {st["calls"]}'
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def nfl_no_migration():
    where = 'nfl-sin-migracion'
    sel = '#camNflScore'
    with fp.full_page(fake_js=NO_MIGRATION + NFL, width=390, height=820) as page:
        go(page, 'NFL', sel); reach(page, sel)
        st = page.evaluate(STATE, sel)
        assert st['keys'] == ['marcador'] and st['open'] == 'marcador' and st['results'] == 3, f'{where}: {st}'
        assert page.errors == [], f'{where}: errores {page.errors}'
        shot(page, sel, where)
    print('PASS', where)


def football_phone(dark):
    where = f'futbol-390-{"noche" if dark else "dia"}'
    sel = '#camFootballScore'
    with fp.full_page(fake_js=FOOTBALL, dark=dark, width=390, height=820) as page:
        go(page, 'Fútbol', sel); page.wait_for_timeout(600)
        page.evaluate("window.camFootballQuiniela.selectCompetition('laliga')"); page.wait_for_timeout(1200)
        early = page.evaluate(STATE, sel)['calls']
        reach(page, sel)
        st = page.evaluate(STATE, sel)
        assert st['keys'] == ['marcador', 'tabla', 'anotadores'], f'{where}: filas {st["keys"]}'
        assert st['titles'] == ['El marcador', 'Clasificación · LaLiga', 'Goleadores'], f'{where}: títulos {st["titles"]}'
        assert st['teasers'] == ['LaLiga · 3 resultados', 'Líder: Barcelona · 33 pts', 'Raphinha lidera con 15 goles'], f'{where}: adelantos {st["teasers"]}'
        assert st['calls'].count('laliga') == 1 and 'laliga' not in early, f'{where}: llamadas {early} {st["calls"]}'
        toggle(page, sel, 'tabla')
        st = page.evaluate(STATE, sel)
        assert st['open'] == 'tabla' and st['teams'] == 10 and st['names'][0] == 'Barcelona', f'{where}: tabla {st["teams"]} {st["names"][:2]}'
        assert st['intro'] == 'Temporada 2026-27 · jornada 12', f'{where}: intro {st["intro"]}'
        assert st['zones'][:7] == ['z1', 'z1', 'z1', 'z1', 'z1', 'z2', 'z3'], f'{where}: zonas {st["zones"]}'
        assert st['legend'] == ['Champions', 'Europa League', 'Conference', 'Descenso'], f'{where}: leyenda {st["legend"]}'
        assert page.evaluate(CLIPPED, sel) == [] and st['overflow'] <= 0 and st['inner'] <= 0, f'{where}: recortes {page.evaluate(CLIPPED, sel)}'
        shot(page, sel, f'{where}-1-laliga')
        page.locator(f'{sel} .cam-st-more', has_text='Ver los 20 equipos').click(); page.wait_for_timeout(400)
        st = page.evaluate(STATE, sel)
        assert st['teams'] == 20 and st['zones'][-3:] == ['z4', 'z4', 'z4'], f'{where}: 20 equipos {st["teams"]} {st["zones"][-3:]}'
        assert st['focus'] == 'futbol:more:tabla', f'{where}: foco {st["focus"]}'
        toggle(page, sel, 'anotadores')
        st = page.evaluate(STATE, sel)
        assert st['players'][:2] == ['Raphinha', 'Kylian Mbappé'] and st['subs'][0] == 'Barcelona · 11 partidos', f'{where}: goleadores {st["players"][:2]} {st["subs"][:1]}'
        shot(page, sel, f'{where}-2-goleadores')

        # Otra liga arriba: el menú la sigue (otra llamada, otra tabla).
        page.evaluate("window.camFootballQuiniela.selectCompetition('ligamx')"); page.wait_for_timeout(1200)
        reach(page, sel)
        st = page.evaluate(STATE, sel)
        assert st['titles'][1] == 'Clasificación · Liga MX' and st['calls'].count('ligamx') == 1 and st['calls'].count('laliga') == 1, f'{where}: Liga MX {st["titles"]} {st["calls"]}'
        toggle(page, sel, 'tabla')
        st = page.evaluate(STATE, sel)
        assert st['teams'] == 10 and st['zones'].count('z1') == 8 and st['legend'] == ['Liguilla (1.º al 8.º)'], f'{where}: liguilla {st["zones"]} {st["legend"]}'
        assert st['intro'] == 'Apertura 2026 · jornada 16 de 17', f'{where}: intro {st["intro"]}'
        assert page.evaluate(CLIPPED, sel) == [] and st['overflow'] <= 0, f'{where}: recortes Liga MX {page.evaluate(CLIPPED, sel)}'
        shot(page, sel, f'{where}-3-ligamx')
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def desktop():
    where = 'escritorio-1366'
    sel = '#camNflScore'
    with fp.full_page(fake_js=NFL, width=1366, height=900, scale=1) as page:
        page.evaluate("window.filterByCategory('NFL')"); page.wait_for_timeout(1800)
        reach(page, sel)
        st = page.evaluate(STATE, sel)
        assert st['menu'] and st['keys'] == ['marcador', 'tabla', 'anotadores'], f'{where}: {st}'
        toggle(page, sel, 'tabla')
        st = page.evaluate(STATE, sel)
        assert st['teams'] == 16 and st['inner'] <= 0 and st['overflow'] <= 0, f'{where}: tabla {st["teams"]} {st["inner"]}'
        assert page.evaluate(CLIPPED, sel) == [], f'{where}: recortes {page.evaluate(CLIPPED, sel)}'
        shot(page, sel, where)
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


if __name__ == '__main__':
    nfl_phone(390, False)
    nfl_phone(320, True)
    nfl_no_migration()
    football_phone(False)
    football_phone(True)
    desktop()
    print('OK marcador-menu')
