"""Quiniela de Fútbol y nuevo orden de las secciones (Chromium + Supabase falso).

Comprueba que la quiniela de fútbol se ve como la de NFL (misma maqueta, tres
resultados), que la quiniela va donde antes estaba el pick de campeón y campeón
debajo de las clasificaciones, y que en el teléfono la lista muestra unos tres
partidos y se desliza.

Uso: python3 tests/football-quiniela.py [--shots DIR]
"""
import importlib.util, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None

USER = '{"id":"u-1","email":"quiniela@qa.aesports.invalid"}'

# Partidos de mentira con cuotas ya congeladas, todos el mismo día y en el futuro.
FAKE = """
try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}
(() => {
  const f = window.__fake = window.__fake || {};
  const now = new Date();
  const season = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  // Todos el mismo día civil de Toronto: 16:00 UTC son las 11 o 12 de la mañana allí.
  const day = new Date(now.getTime() + 2*24*3600*1000);
  day.setUTCHours(16, 0, 0, 0);
  const kickoff = i => new Date(day.getTime() + i*15*60*1000).toISOString();
  const squads = [
    ['86','Real Madrid','RMA'], ['83','Barcelona','BAR'], ['1068','Sevilla','SEV'],
    ['2922','Getafe','GET'], ['93','Athletic','ATH'], ['97','Valencia','VAL'],
    ['96','Betis','BET'], ['1050','Villarreal','VIL'], ['95','Osasuna','OSA'], ['88','Celta','CEL']
  ];
  f.tables = f.tables || {};
  f.tables.cam_football_teams = squads.map(([id,name,abbr]) => ({
    id, name, short_name: name, abbreviation: abbr,
    logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png'
  }));
  f.tables.cam_football_games = [0,1,2,3,4].map(i => ({
    id: '40188000' + i, competition: 'laliga', season, matchday: 10,
    kickoff: kickoff(i),
    home_id: squads[i*2][0], away_id: squads[i*2+1][0],
    status: 'scheduled', home_score: null, away_score: null, outcome: null,
    odds_home: -150, odds_draw: 260, odds_away: 380,
    probability_home: 0.52, probability_draw: 0.26, probability_away: 0.22,
    points_home: 4, points_draw: 8, points_away: 9,
    odds_source: 'prueba', odds_locked_at: new Date(now.getTime() - 3600*1000).toISOString(),
    picks_open: true, opening_mode: 'auto'
  }));
  f.tables.cam_football_picks = [];
  // La quiniela NFL comparte maqueta: mismos partidos de prueba con dos opciones.
  f.tables.cam_nfl_games = [0,1,2,3,4].map(i => ({
    id: '40177000' + i, season, week: 8, kickoff: kickoff(i),
    home_id: ['KC','SF','BUF','DAL','PHI'][i], away_id: ['DEN','SEA','NYJ','NYG','WAS'][i],
    status: 'scheduled', home_score: null, away_score: null, winner_id: null,
    odds_home: -200, odds_away: 170, probability_home: 0.65, probability_away: 0.35,
    points_home: 3, points_away: 6, odds_source: 'prueba',
    odds_locked_at: new Date(now.getTime() - 3600*1000).toISOString(),
    picks_open: true, opening_mode: 'auto'
  }));
  f.tables.cam_nfl_picks = [];
  f.rpc = f.rpc || {};
  f.rpc.cam_football_leaderboard = () => ({ data: [], error: null });
  f.rpc.cam_nfl_leaderboard = () => ({ data: [], error: null });
  f.rpc.cam_football_save_pick = a => {
    f.tables.cam_football_picks.push({ game_id: a.p_game_id, user_id: f.user.id, pick: a.p_pick, awarded_points: 0 });
    return { data: true, error: null };
  };
})();
window.__fake.user = %s;
""" % USER


def open_sport(page, sport):
    page.evaluate('sport => filterByCategory(sport)', sport)
    page.wait_for_timeout(900)


def order_of(page, ids):
    return page.evaluate("""ids => ids.map(id => {
        const node = document.getElementById(id);
        if (!node) return -1;
        let index = 0, walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) { index++; if (walker.currentNode === node) return index; }
        return -1;
    })""", ids)


def check_layout(page, root, games_id, label):
    assert page.locator('#' + root).is_visible(), label + ': la quiniela no se ve'
    cards = page.locator('#%s .cam-nfl-game' % games_id)
    assert cards.count() == 5, '%s: %d tarjetas' % (label, cards.count())
    # La quiniela va antes de las clasificaciones y el pick de campeón después.
    positions = order_of(page, [root, 'aeSportTakeRanking', 'aeSeasonPredictions'])
    assert positions[0] < positions[1] < positions[2], label + ': orden ' + str(positions)


def run():
    # 1) Fútbol en el teléfono: tarjeta a tres resultados y lista que se desliza.
    with fp.full_page(fake_js=FAKE, width=390, height=900) as page:
        open_sport(page, 'Fútbol')
        check_layout(page, 'camFootballQuiniela', 'camFootballGames', 'fútbol móvil')
        first = page.locator('#camFootballGames .cam-nfl-game').first
        assert first.locator('.cam-nfl-team').count() == 2, 'faltan los dos equipos'
        assert first.locator('.cam-nfl-draw').count() == 1, 'falta el empate'
        assert 'pts' in first.locator('.cam-nfl-draw small').inner_text()

        box = page.evaluate("""() => {
            const list = document.getElementById('camFootballGames');
            const card = list.querySelector('.cam-nfl-game');
            return { client: list.clientHeight, scroll: list.scrollHeight, card: card.offsetHeight };
        }""")
        assert box['scroll'] > box['client'] + 20, 'la lista no se desliza en el teléfono: ' + str(box)
        visible = box['client'] / box['card']
        assert 2.5 <= visible <= 4.2, 'se ven %.2f partidos, no unos tres' % visible

        # Elegir: primero el empate, después el local; solo queda uno marcado.
        first.locator('.cam-nfl-draw').click()
        page.wait_for_timeout(250)
        assert page.locator('#camFootballGames .cam-nfl-game').first.locator('.cam-nfl-draw.is-selected').count() == 1
        page.locator('#camFootballGames .cam-nfl-game').first.locator('.cam-nfl-team').first.click()
        page.wait_for_timeout(250)
        card = page.locator('#camFootballGames .cam-nfl-game').first
        assert card.locator('.cam-nfl-draw.is-selected').count() == 0, 'el empate sigue marcado'
        assert card.locator('.cam-nfl-team.is-selected').count() == 1, 'no se marcó el equipo'
        assert not page.locator('#camFootballSaveDay').is_disabled(), 'no deja guardar'

        # Guardar llama al RPC de fútbol, nunca al de Takes ni al de NFL.
        page.locator('#camFootballSaveDay').click()
        page.wait_for_timeout(600)
        saved = page.evaluate("() => window.__fake.calls.filter(c => c.rpc === 'cam_football_save_pick').length")
        assert saved == 1, 'guardó %d pronósticos' % saved

        if SHOTS:
            page.screenshot(path=SHOTS + '/futbol-390-dia.png', full_page=False)
        assert not page.errors, page.errors

    # 2) NFL en el teléfono: misma maqueta, mismo orden, misma lista que se desliza.
    with fp.full_page(fake_js=FAKE, width=390, height=900) as page:
        open_sport(page, 'NFL')
        check_layout(page, 'camNflQuiniela', 'camNflGames', 'NFL móvil')
        assert not page.locator('#camFootballQuiniela').is_visible(), 'la quiniela de fútbol se cuela en NFL'
        box = page.evaluate("""() => {
            const list = document.getElementById('camNflGames');
            return { client: list.clientHeight, scroll: list.scrollHeight,
                     card: list.querySelector('.cam-nfl-game').offsetHeight };
        }""")
        assert box['scroll'] > box['client'] + 20, 'la lista NFL no se desliza: ' + str(box)
        visible = box['client'] / box['card']
        assert 2.5 <= visible <= 4.2, 'NFL: se ven %.2f partidos' % visible
        if SHOTS:
            page.screenshot(path=SHOTS + '/nfl-390-dia.png')
        assert not page.errors, page.errors

    # 3) Escritorio de noche: sin recorte y con la rejilla de siempre.
    with fp.full_page(fake_js=FAKE, width=1366, height=1000, dark=True) as page:
        open_sport(page, 'Fútbol')
        check_layout(page, 'camFootballQuiniela', 'camFootballGames', 'fútbol escritorio')
        clipped = page.evaluate("""() => {
            const list = document.getElementById('camFootballGames');
            return getComputedStyle(list).maxHeight;
        }""")
        assert clipped == 'none', 'en escritorio no debe recortarse: ' + clipped
        if SHOTS:
            page.screenshot(path=SHOTS + '/futbol-1366-noche.png')
        assert not page.errors, page.errors

    with fp.full_page(fake_js=FAKE, width=1366, height=1000, dark=True) as page:
        open_sport(page, 'NFL')
        check_layout(page, 'camNflQuiniela', 'camNflGames', 'NFL escritorio')
        if SHOTS:
            page.screenshot(path=SHOTS + '/nfl-1366-noche.png')
        assert not page.errors, page.errors

    print('OK · quiniela de fútbol, orden de secciones y scroll de la jornada')


if __name__ == '__main__':
    run()
