"""Quinielas · elegir es guardar (18 nov 2026).

Pedido de Eduard: «En la parte de quinielas, cuando eligen, que se guarde al elegir y
salga guardado». Página completa en Chromium con tests/full-page.py y el Supabase falso.

  · NFL: tocar un equipo guarda (cam_nfl_save_pick) sin pulsar «Guardar picks del día»;
    la tarjeta dice «Guardando…» y después «✓ Pronóstico guardado». Dos toques seguidos
    guardan el último. Si falla, «Sin guardar» y vuelve el botón para reintentar. Un
    borrador viejo (de cuando hacía falta el botón) se guarda solo al entrar.
  · Fútbol: lo mismo, y el botón de guardar no aparece mientras se guarda un toque.
  · Liguilla · Tus 8: al elegir el 8.º se guardan solos (cam_liguilla_save_qualifiers) y
    el botón dice «✓ Tus 8 están guardados»; quitar uno no borra la lista guardada.
  · Liguilla · Tu cuadro: cada toque se guarda solo (cam_liguilla_save_bracket).
Sin desbordes ni errores, a 390 px de día y de noche.

Uso: python3 -B tests/quiniela-guardar-al-tocar.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

COMMON = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  F.user = {id: 'u1', email: 'u1@example.com', user_metadata: {username: 'probador'}};
  // Cada guardado tarda un poco, como en la red: así se ve «Guardando…».
  F.delay = 350;
  F.later = v => new Promise(r => setTimeout(() => r(typeof v === 'function' ? v() : v), F.delay));
})();
"""

NFL = COMMON + r"""
(() => {
  const F = window.__fake, T = F.tables, H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  const g = (id, away, home, hours) => ({id, season: 2026, week: 9, home_id: home, away_id: away, kickoff: iso(hours),
    status: 'scheduled', picks_open: true, odds_locked_at: iso(-200), points_home: 2, points_away: 2,
    probability_home: .5, probability_away: .5, home_score: null, away_score: null, winner_id: null});
  T.cam_nfl_games = [g('w9-1', 'JAX', 'BAL', 30), g('w9-2', 'CIN', 'ATL', 31), g('w9-3', 'ARI', 'SEA', 32), g('w9-4', 'LV', 'SF', 33)];
  T.cam_nfl_picks = [];
  T.cam_nfl_laurels = [];
  // Un pronóstico que alguien eligió antes y nunca llegó a guardar (cuando hacía falta el botón).
  try { localStorage.setItem('cam:nfl-quiniela:u1:w9-4', 'SF'); } catch (e) {}
  F.rpc.cam_nfl_save_pick = a => F.later(() => {
    if (F.failNext) { F.failNext = false; return {data: null, error: {message: 'Sin conexión'}}; }
    T.cam_nfl_picks = T.cam_nfl_picks.filter(p => p.game_id !== a.p_game_id);
    T.cam_nfl_picks.push({game_id: a.p_game_id, user_id: 'u1', team_id: a.p_team_id, awarded_points: 0, settled_at: null});
    return {data: true, error: null};
  });
  for (const name of ['cam_nfl_expert_picks', 'cam_nfl_pick_split', 'cam_nfl_expert_duel']) F.rpc[name] = () => ({data: [], error: null});
})();
"""

FOOTBALL = COMMON + r"""
(() => {
  const F = window.__fake, T = F.tables, H = 36e5, now = Date.now();
  const season = new Date().getUTCFullYear() - (new Date().getUTCMonth() < 6 ? 1 : 0);
  T.cam_football_teams = [['86','Real Madrid','RMA'],['83','Barcelona','BAR'],['94','Valencia','VAL'],['1068','Atlético Madrid','ATM']]
    .map(([id, name, abbreviation]) => ({id, name, short_name: name, abbreviation, logo: null}));
  const g = (id, home, away, h) => ({id, competition: 'laliga', season, matchday: 20, home_id: home, away_id: away,
    kickoff: new Date(now + h * H).toISOString(), status: 'scheduled', home_score: null, away_score: null, outcome: null,
    odds_home: 190, odds_draw: 240, odds_away: 130, probability_home: .4, probability_draw: .27, probability_away: .33,
    points_home: 2, points_draw: 2, points_away: 2, odds_source: 'prueba', odds_locked_at: new Date(now - H).toISOString(), picks_open: true});
  T.cam_football_games = [g('9000001', '83', '86', 26), g('9000002', '94', '1068', 27)];
  T.cam_football_picks = [];
  F.rpc.cam_liguilla_state = () => ({data: null, error: null});
  F.rpc.cam_football_save_pick = a => F.later(() => {
    T.cam_football_picks = T.cam_football_picks.filter(p => p.game_id !== a.p_game_id);
    T.cam_football_picks.push({game_id: a.p_game_id, user_id: 'u1', pick: a.p_pick, awarded_points: 0, settled_at: null});
    return {data: true, error: null};
  });
})();
"""

# Liguilla: 18 equipos; 1-4 ya dentro, 5-12 en juego, 13-18 fuera. MODE 'q8' = elegir tus 8; 'cuadro' = cuadro abierto.
LIGUILLA = COMMON + r"""
(() => {
  const F = window.__fake, T = F.tables, H = 36e5, D = 24 * H, now = Date.now(), MODE = %(mode)s;
  const season = new Date().getUTCFullYear() - (new Date().getUTCMonth() < 6 ? 1 : 0);
  const TEAMS = %(teams)s;
  T.cam_football_teams = TEAMS.map(([id, name, abbreviation]) => ({id, name, short_name: name, abbreviation, logo: null}));
  T.cam_football_games = []; T.cam_football_picks = [];
  const CAND = TEAMS.map(([id, name, abbreviation], i) => ({team_id: id, name, short_name: name, abbreviation, logo: null,
    rank: i + 1, played: 16, points: 36 - 2 * i, goal_diff: 14 - 2 * i, status: i < 4 ? 'in' : i < 12 ? 'alive' : 'out'}));
  F.q8 = null;
  F.rpc.cam_liguilla_candidates = () => ({data: {window: {id: 3, competition: 'ligamx', season, name: 'Apertura ' + season,
    closes_at: new Date(now + 3 * D).toISOString(), open: true, opened: false, server_time: new Date().toISOString()},
    fetched_at: new Date(now - H).toISOString(), teams: CAND, mine: F.q8 ? [...F.q8] : null, players: 5}, error: null});
  F.rpc.cam_liguilla_save_qualifiers = a => F.later(() => {
    if ((a.p_teams || []).length !== 8) return {data: null, error: {message: 'Elige exactamente 8 equipos distintos'}};
    F.q8 = [...a.p_teams]; return {data: {saved: 8}, error: null};
  });
  const ids = TEAMS.slice(0, 8).map(t => t[0]);
  let bracket = [];
  const odds = [];
  ids.forEach(id => ['semis', 'final', 'champion'].forEach((stage, k) => odds.push({team_id: id, stage, probability: .5, points: 2 + k * 3})));
  const closes = now + 2 * D;
  F.rpc.cam_liguilla_state = () => ({data: MODE !== 'cuadro' ? null : {liguilla: {id: 7, name: 'Apertura ' + season, season, reseed: true,
      starts_at: new Date(closes).toISOString(), closes_at: new Date(closes).toISOString(), open: true, server_time: new Date().toISOString()},
    seeds: TEAMS.slice(0, 8).map(([id, name, abbreviation], i) => ({seed: i + 1, team_id: id, name, short_name: name, abbreviation, logo: null, played: 17, points: 30 - i, goal_diff: 10 - i})),
    odds, series: [], mine: {bracket: [...bracket], series: [], qualifiers: ids}, players: 3}, error: null});
  F.rpc.cam_liguilla_save_bracket = a => F.later(() => {
    bracket = [];
    a.p_semis.forEach((id, i) => id && bracket.push({stage: 'semis', slot: i, team_id: id, points: 2, awarded_points: 0, settled_at: null}));
    a.p_finalists.forEach((id, i) => id && bracket.push({stage: 'final', slot: i, team_id: id, points: 5, awarded_points: 0, settled_at: null}));
    if (a.p_champion) bracket.push({stage: 'champion', slot: 0, team_id: a.p_champion, points: 8, awarded_points: 0, settled_at: null});
    return {data: {saved: bracket.length, potential: bracket.reduce((s, p) => s + p.points, 0)}, error: null};
  });
  F.rpc.cam_liguilla_leaderboard = () => ({data: [], error: null});
  F.rpc.cam_football_leaderboard = () => ({data: [], error: null});
})();
"""
TEAMS = [('218', 'Cruz Azul', 'CAZ'), ('227', 'América', 'AME'), ('219', 'Guadalajara', 'GDL'), ('223', 'Toluca', 'TOL'),
         ('15720', 'Atl. San Luis', 'ASL'), ('225', 'Santos', 'SAN'), ('228', 'León', 'LEO'), ('234', 'Pachuca', 'PAC'),
         ('220', 'Monterrey', 'MTY'), ('232', 'Tigres UANL', 'TIG'), ('233', 'Pumas UNAM', 'PUM'), ('229', 'Necaxa', 'NEC'),
         ('231', 'Puebla', 'PUE'), ('222', 'Querétaro', 'QRO'), ('20702', 'Mazatlán FC', 'MAZ'), ('17851', 'FC Juárez', 'JUA'),
         ('10125', 'Tijuana', 'TIJ'), ('216', 'Atlas', 'ATL')]


def liguilla(mode):
    return LIGUILLA % {'mode': json.dumps(mode), 'teams': json.dumps(TEAMS)}


CARD = """(sel) => [...document.querySelectorAll(sel + ' .cam-nfl-game')].map(c => ({id: c.dataset.gameId, state: c.dataset.state,
  badge: c.querySelector('.cam-nfl-badge')?.textContent, sel: [...c.querySelectorAll('.is-selected')].map(b => b.dataset.side || 'draw')}))"""
SAVES = "(name) => window.__fake.calls.filter(c => c.rpc === name).map(c => c.args)"
SHOWN = "(id) => { const e = document.getElementById(id); return !!e && !e.hidden && !!e.getClientRects().length; }"


def card(page, sel, game):
    return next(c for c in page.evaluate(CARD, sel) if c['id'] == game)


def shot(page, selector, name):
    if SHOTS: page.locator(selector).screenshot(path=str(SHOTS / f'{name}.png'))


def overflow(page):
    return page.evaluate('document.documentElement.scrollWidth - innerWidth')


def nfl(dark):
    where = 'NFL ' + ('noche' if dark else 'día')
    with fp.full_page(fake_js=NFL, dark=dark, width=390, height=900) as page:
        page.click('body > nav.cam-mobile-bottom-nav > button[data-category="NFL"]')
        page.wait_for_function("() => window.camNflQuiniela && window.camNflQuiniela.snapshot().loaded", timeout=15000)
        page.wait_for_timeout(900)
        # El borrador viejo se guardó solo al entrar.
        saved = page.evaluate(SAVES, 'cam_nfl_save_pick')
        assert {'p_game_id': 'w9-4', 'p_team_id': 'SF'} in saved, f'{where}: el borrador viejo no se guardó {saved}'
        page.evaluate("() => window.camNflQuiniela.focus('w9-2')"); page.wait_for_timeout(500)
        c = card(page, '#camNflGames', 'w9-2')
        assert c['state'] == 'abierto' and c['badge'] == 'Abierto', f'{where}: antes de elegir {c}'
        assert not page.evaluate(SHOWN, 'camNflSaveDay'), f'{where}: sin nada pendiente no hay botón de guardar'

        # Un toque: «Guardando…» y luego «Pronóstico guardado», sin botón.
        page.locator('#camNflGames .cam-nfl-game[data-game-id="w9-2"] .cam-nfl-team[data-side="home"]').click()
        page.wait_for_timeout(60)
        c = card(page, '#camNflGames', 'w9-2')
        assert c['state'] == 'guardando' and c['badge'] == 'Guardando…' and c['sel'] == ['home'], f'{where}: mientras guarda {c}'
        assert not page.evaluate(SHOWN, 'camNflSaveDay'), f'{where}: el botón no aparece mientras guarda'
        shot(page, '#camNflGames .cam-nfl-game[data-game-id="w9-2"]', f'nfl-{"noche" if dark else "dia"}-1-guardando')
        page.wait_for_timeout(600)
        c = card(page, '#camNflGames', 'w9-2')
        assert c['state'] == 'guardado' and c['badge'] == 'Pronóstico guardado' and c['sel'] == ['home'], f'{where}: tras guardar {c}'
        assert page.evaluate(SAVES, 'cam_nfl_save_pick')[-1] == {'p_game_id': 'w9-2', 'p_team_id': 'ATL'}
        assert 'guardado' in page.locator('#camNflStatus').inner_text(), f'{where}: aviso {page.locator("#camNflStatus").inner_text()}'
        assert not page.evaluate(SHOWN, 'camNflSaveDay'), f'{where}: tras guardar no queda botón'
        assert page.evaluate("getComputedStyle(document.querySelector('#camNflGames .cam-nfl-game[data-game-id=\"w9-2\"] .cam-nfl-badge'),'::before').content") == '"✓"'
        shot(page, '#camNflGames .cam-nfl-game[data-game-id="w9-2"]', f'nfl-{"noche" if dark else "dia"}-2-guardado')

        # Tocar lo ya guardado no vuelve a llamar.
        before = len(page.evaluate(SAVES, 'cam_nfl_save_pick'))
        page.locator('#camNflGames .cam-nfl-game[data-game-id="w9-2"] .cam-nfl-team[data-side="home"]').click(); page.wait_for_timeout(500)
        assert len(page.evaluate(SAVES, 'cam_nfl_save_pick')) == before, f'{where}: guardó dos veces lo mismo'

        # Dos toques seguidos: gana el último.
        page.evaluate("() => window.camNflQuiniela.focus('w9-3')"); page.wait_for_timeout(300)
        page.locator('#camNflGames .cam-nfl-game[data-game-id="w9-3"] .cam-nfl-team[data-side="away"]').click()
        page.wait_for_timeout(80)
        page.locator('#camNflGames .cam-nfl-game[data-game-id="w9-3"] .cam-nfl-team[data-side="home"]').click()
        page.wait_for_timeout(1200)
        c = card(page, '#camNflGames', 'w9-3')
        assert c['state'] == 'guardado' and c['sel'] == ['home'], f'{where}: dos toques {c}'
        last = [a for a in page.evaluate(SAVES, 'cam_nfl_save_pick') if a['p_game_id'] == 'w9-3'][-1]
        assert last['p_team_id'] == 'SEA', f'{where}: no guardó el último toque {last}'
        assert page.evaluate("() => window.__fake.tables.cam_nfl_picks.find(p => p.game_id === 'w9-3').team_id") == 'SEA'

        # Si falla: «Sin guardar» y vuelve el botón; con él se reintenta.
        page.evaluate("() => { window.__fake.failNext = true; }")
        page.locator('#camNflGames .cam-nfl-game[data-game-id="w9-3"] .cam-nfl-team[data-side="away"]').click()
        page.wait_for_timeout(700)
        c = card(page, '#camNflGames', 'w9-3')
        assert c['state'] == 'borrador' and c['badge'] == 'Sin guardar', f'{where}: fallo {c}'
        assert page.evaluate(SHOWN, 'camNflSaveDay') and page.locator('#camNflSaveDay').is_enabled(), f'{where}: falta el botón para reintentar'
        page.locator('#camNflSaveDay').click(); page.wait_for_timeout(700)
        c = card(page, '#camNflGames', 'w9-3')
        assert c['state'] == 'guardado' and c['sel'] == ['away'], f'{where}: reintento {c}'
        assert not page.evaluate(SHOWN, 'camNflSaveDay'), f'{where}: tras reintentar el botón se va'
        assert overflow(page) <= 0 and page.errors == [], f'{where}: {overflow(page)} {page.errors}'


def football(dark):
    where = 'Fútbol ' + ('noche' if dark else 'día')
    with fp.full_page(fake_js=FOOTBALL, dark=dark, width=390, height=900) as page:
        page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Fútbol"]')
        page.wait_for_function("() => window.camFootballQuiniela && window.camFootballQuiniela.snapshot().loaded", timeout=15000)
        page.evaluate("() => window.camFootballQuiniela.selectCompetition('laliga')"); page.wait_for_timeout(800)
        page.evaluate("() => window.camFootballQuiniela.focus('9000002')"); page.wait_for_timeout(600)
        sel = '#camFootballGames .cam-nfl-game[data-game-id="9000002"]'
        page.locator(sel + ' .cam-nfl-draw').click(); page.wait_for_timeout(60)
        c = card(page, '#camFootballGames', '9000002')
        assert c['state'] == 'guardando' and c['badge'] == 'Guardando…', f'{where}: mientras guarda {c}'
        assert not page.evaluate(SHOWN, 'camFootballSaveDay'), f'{where}: el botón no debe asomar mientras guarda un toque'
        page.wait_for_timeout(600)
        c = card(page, '#camFootballGames', '9000002')
        assert c['state'] == 'guardado' and c['badge'] == 'Pronóstico guardado' and c['sel'] == ['draw'], f'{where}: tras guardar {c}'
        assert page.evaluate(SAVES, 'cam_football_save_pick')[-1] == {'p_game_id': '9000002', 'p_pick': 'draw'}
        assert not page.evaluate(SHOWN, 'camFootballSaveDay')
        shot(page, sel, f'futbol-{"noche" if dark else "dia"}-guardado')
        assert overflow(page) <= 0 and page.errors == [], f'{where}: {overflow(page)} {page.errors}'


def open_liga_mx(page):
    page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Fútbol"]')
    page.wait_for_function("() => window.camFootballQuiniela && window.camLiguilla", timeout=15000)
    page.evaluate("() => window.camSectionTabs?.select?.('semana')"); page.wait_for_timeout(300)
    page.evaluate("() => window.camFootballQuiniela.selectCompetition('ligamx')"); page.wait_for_timeout(800)
    page.evaluate("() => window.camLiguilla.refresh()"); page.wait_for_timeout(600)


def q8(dark):
    where = 'Tus 8 ' + ('noche' if dark else 'día')
    with fp.full_page(fake_js=liguilla('q8'), dark=dark, width=390, height=900) as page:
        open_liga_mx(page)
        root = page.locator('#camLiguilla')
        assert root.is_visible(), f'{where}: no se ve la liguilla'
        if not root.locator('details.cam-lg-qualifiers').evaluate('d => d.open'):
            root.locator('.cam-lg-qualifiers-summary').click(); page.wait_for_timeout(150)
        save = root.locator('.cam-lg-q8-save')
        for team in ['15720', '225', '228']:
            root.locator(f'.cam-lg-q8-team[data-team="{team}"]').click(); page.wait_for_timeout(80)
        assert page.evaluate(SAVES, 'cam_liguilla_save_qualifiers') == [], f'{where}: guardó antes de tener los 8'
        assert save.is_disabled() and save.inner_text() == 'Guardar mis 8', f'{where}: {save.inner_text()}'
        assert 'Se guardan solos' in root.inner_text(), f'{where}: falta la pista de guardado automático'
        root.locator('.cam-lg-q8-team[data-team="220"]').click(); page.wait_for_timeout(60)
        assert save.inner_text() == 'Guardando…', f'{where}: mientras guarda {save.inner_text()}'
        page.wait_for_timeout(600)
        calls = page.evaluate(SAVES, 'cam_liguilla_save_qualifiers')
        assert len(calls) == 1 and sorted(calls[0]['p_teams']) == sorted(['218', '227', '219', '223', '15720', '225', '228', '220']), f'{where}: {calls}'
        assert save.is_disabled() and save.inner_text() == '✓ Tus 8 están guardados', f'{where}: {save.inner_text()}'
        assert 'Guardado' in root.locator('.cam-lg-note').inner_text(), f'{where}: falta «Guardado»'
        assert 'is-saved' in save.get_attribute('class')
        shot(page, '#camLiguilla .cam-lg-qualifiers-body', f'tus8-{"noche" if dark else "dia"}-guardado')
        # Quitar uno: la lista anterior sigue guardada; al elegir otro, se guarda el cambio.
        root.locator('.cam-lg-q8-team[data-team="220"]').click(); page.wait_for_timeout(150)
        assert len(page.evaluate(SAVES, 'cam_liguilla_save_qualifiers')) == 1, f'{where}: quitar uno no debe guardar'
        assert 'sigue guardada tu lista anterior' in root.inner_text(), f'{where}: falta la pista al quitar'
        root.locator('.cam-lg-q8-team[data-team="232"]').click(); page.wait_for_timeout(700)
        calls = page.evaluate(SAVES, 'cam_liguilla_save_qualifiers')
        assert len(calls) == 2 and '232' in calls[-1]['p_teams'] and '220' not in calls[-1]['p_teams'], f'{where}: cambio {calls}'
        assert save.inner_text() == '✓ Tus 8 están guardados'
        assert overflow(page) <= 0 and page.errors == [], f'{where}: {overflow(page)} {page.errors}'


def cuadro(dark):
    where = 'Cuadro ' + ('noche' if dark else 'día')
    with fp.full_page(fake_js=liguilla('cuadro'), dark=dark, width=390, height=900) as page:
        open_liga_mx(page)
        root = page.locator('#camLiguilla')
        save = root.locator('.cam-lg-save')
        assert save.is_disabled() and save.inner_text() == 'Guardar mi cuadro', f'{where}: antes {save.inner_text()}'
        root.locator('.cam-lg-round').nth(0).locator('.cam-lg-team[data-team="218"]').click(); page.wait_for_timeout(60)
        assert save.inner_text() == 'Guardando…', f'{where}: mientras guarda {save.inner_text()}'
        page.wait_for_timeout(600)
        calls = page.evaluate(SAVES, 'cam_liguilla_save_bracket')
        assert len(calls) == 1 and calls[0]['p_semis'] == ['218', None, None, None], f'{where}: {calls}'
        assert save.is_disabled() and save.inner_text() == '✓ Guardado', f'{where}: {save.inner_text()}'
        assert 'Guardado' in root.locator('.cam-lg-note').inner_text()
        # Toques seguidos: se guarda el último cuadro.
        for team in ['227', '219', '15720']:
            root.locator('.cam-lg-round').nth(0).locator(f'.cam-lg-team[data-team="{team}"]').click(); page.wait_for_timeout(40)
        page.wait_for_timeout(1300)
        calls = page.evaluate(SAVES, 'cam_liguilla_save_bracket')
        assert calls[-1]['p_semis'] == ['218', '227', '219', '15720'], f'{where}: último cuadro {calls[-1]}'
        assert save.inner_text() == '✓ Guardado' and 'Cada toque se guarda solo' in root.inner_text(), f'{where}: {save.inner_text()}'
        shot(page, '#camLiguilla .cam-lg-actions', f'cuadro-{"noche" if dark else "dia"}-guardado')
        assert overflow(page) <= 0 and page.errors == [], f'{where}: {overflow(page)} {page.errors}'


if __name__ == '__main__':
    for dark in (False, True):
        nfl(dark); football(dark); q8(dark); cuadro(dark)
    print('Quinielas: elegir es guardar · NFL, Fútbol, Tus 8 y Tu cuadro, de día y de noche: OK')
