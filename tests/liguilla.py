"""Liguilla de la Liga MX en la Quiniela de Fútbol (Chromium + Supabase falso).

Comprueba «Tu liguilla» (armar el cuadro, reclasificación de semis, guardar,
compartir), la ficha para redes en sus 5 formatos con las zonas seguras, la
vista ronda a ronda (cuartos, semis y final), el panel de apertura del admin y
que no haya desbordes ni textos cortados a 320, 390 y 1366 px, de día y de noche.

Uso: python3 tests/liguilla.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None

USER = '{"id":"u-1","email":"liguilla@qa.camsports.invalid","user_metadata":{"username":"QA_Liguilla_Larga"}}'
TEAMS = [('218', 'Cruz Azul', 'CAZ'), ('227', 'América', 'AME'), ('219', 'Guadalajara', 'GDL'),
         ('223', 'Toluca', 'TOL'), ('15720', 'Atlético de San Luis', 'ASL'), ('225', 'Santos', 'SAN'),
         ('228', 'León', 'LEO'), ('234', 'Pachuca', 'PAC')]
# Puntos de ejemplo por equipo: [semis, final, campeón]
PTS = {'218': [1, 3, 5], '227': [1, 3, 5], '219': [1, 4, 7], '223': [1, 5, 8],
       '15720': [6, 11, 16], '225': [6, 11, 15], '228': [7, 13, 17], '234': [6, 12, 16]}

FAKE = """
try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}
(() => {
  const f = window.__fake = window.__fake || {};
  const MODE = %(mode)s;
  const TEAMS = %(teams)s, PTS = %(pts)s;
  const now = Date.now(), H = 3600e3, D = 24*H;
  const season = new Date().getUTCFullYear() - (new Date().getUTCMonth() < 6 ? 1 : 0);
  f.tables = f.tables || {};
  f.tables.cam_football_teams = TEAMS.map(([id,name,abbr]) => ({id, name, short_name: name.replace('Atlético de ','Atl. '), abbreviation: abbr, logo: null}));
  const game = (id, home, away, kickoff, extra={}) => Object.assign({
    id, competition: 'ligamx', season, matchday: 21, home_id: home, away_id: away, kickoff: new Date(kickoff).toISOString(),
    status: 'scheduled', home_score: null, away_score: null, outcome: null,
    odds_home: 190, odds_draw: 240, odds_away: 130, probability_home: .32, probability_draw: .26, probability_away: .42,
    points_home: 6, points_draw: 8, points_away: 5, odds_source: 'prueba', odds_locked_at: new Date(now - H).toISOString(),
    picks_open: true, opening_mode: 'auto'}, extra);
  const ids = TEAMS.map(t => t[0]);
  const pairs = [[0,7],[1,6],[2,5],[3,4]];
  let games = [], series = [], mine = {bracket: [], series: []}, open = true, closes = now + 2*D;
  const done = (g, hs, as) => Object.assign(g, {status:'final', home_score:hs, away_score:as, picks_open:false,
    outcome: hs>as?'home':hs<as?'away':'draw', kickoff: new Date(now - 3*D).toISOString()});
  if (MODE === 'none') {
    // Equipos reales registrados en la prueba: sin liguilla oficial también se puede armar un cuadro libre.
    pairs.forEach(([h,l], i) => games.push(game('free-000'+i, ids[l], ids[h], now + 10*D)));
  }
  if (MODE === 'open') {
    pairs.forEach(([h,l], i) => {
      const g1 = game('99000010'+i, ids[l], ids[h], now + 2*D + i*H), g2 = game('99000020'+i, ids[h], ids[l], now + 5*D + i*H, {probability_home:null,probability_draw:null,probability_away:null,points_home:6,points_draw:6,points_away:6,odds_source:'automatic_equal_v1',odds_home:null,odds_draw:null,odds_away:null});
      games.push(g1, g2);
      series.push({id: 100+i, round:'qf', slot:i, high_id: ids[h], low_id: ids[l], leg1_id: g1.id, leg2_id: g2.id,
        probability_high: .75, points_high: 3, points_low: 8, odds_source: 'tabla', status: 'open', winner_id: null, legs: [g1, g2]});
    });
  } else {
    // Liguilla en curso: cuartos jugados; MODE 'sf' = semis abiertas, 'final' = final abierta.
    open = false; closes = now - 6*D;
    const qfWin = [7, 1, 2, 4];   // Pachuca, América, Guadalajara, Atl. San Luis
    pairs.forEach(([h,l], i) => {
      const g1 = done(game('99000010'+i, ids[l], ids[h], 0), qfWin[i]===l?2:0, qfWin[i]===l?1:0);
      const g2 = done(game('99000020'+i, ids[h], ids[l], 0), 1, 1);
      series.push({id: 100+i, round:'qf', slot:i, high_id: ids[h], low_id: ids[l], leg1_id: g1.id, leg2_id: g2.id,
        probability_high:.75, points_high:3, points_low:8, odds_source:'tabla', status:'decided', winner_id: ids[qfWin[i]], legs:[g1,g2]});
    });
    // Reclasificación: 2-8 y 3-5
    const sfPairs = [[1,7],[2,4]];
    sfPairs.forEach(([h,l], i) => {
      const live = MODE === 'sf';
      const g1 = live ? game('99000030'+i, ids[l], ids[h], now + 1*D + i*H) : done(game('99000030'+i, ids[l], ids[h], 0), 0, 1);
      const g2 = live ? game('99000040'+i, ids[h], ids[l], now + 4*D + i*H) : done(game('99000040'+i, ids[h], ids[l], 0), 1, 0);
      if (live) games.push(g1, g2);
      series.push({id: 200+i, round:'sf', slot:i, high_id: ids[h], low_id: ids[l], leg1_id: g1.id, leg2_id: g2.id,
        probability_high:.62, points_high:3, points_low:5, odds_source:'cuotas', status: live?'open':'decided', winner_id: live?null:ids[h], legs:[g1,g2]});
    });
    if (MODE === 'final') {
      const g1 = game('990000501', ids[2], ids[1], now + 1*D), g2 = game('990000502', ids[1], ids[2], now + 4*D);
      games.push(g1, g2);
      series.push({id: 300, round:'final', slot:0, high_id: ids[1], low_id: ids[2], leg1_id: g1.id, leg2_id: g2.id,
        probability_high:.5, points_high:4, points_low:4, odds_source:'cuotas', status:'open', winner_id:null, legs:[g1,g2]});
    }
    mine.bracket = [
      {stage:'semis', slot:0, team_id: ids[0], points:1, awarded_points:0, settled_at: new Date(now-6*D).toISOString()},
      {stage:'semis', slot:1, team_id: ids[1], points:1, awarded_points:1, settled_at: new Date(now-6*D).toISOString()},
      {stage:'semis', slot:2, team_id: ids[2], points:1, awarded_points:1, settled_at: new Date(now-6*D).toISOString()},
      {stage:'semis', slot:3, team_id: ids[4], points:6, awarded_points:6, settled_at: new Date(now-6*D).toISOString()},
      {stage:'final', slot:0, team_id: ids[1], points:3, awarded_points: MODE==='final'?3:0, settled_at: MODE==='final'?new Date(now-D).toISOString():null},
      {stage:'final', slot:1, team_id: ids[4], points:11, awarded_points:0, settled_at: MODE==='final'?new Date(now-D).toISOString():null},
      {stage:'champion', slot:0, team_id: ids[1], points:5, awarded_points:0, settled_at:null}];
    mine.series = [{series_id: 100, team_id: ids[7], awarded_points: 8, settled_at: new Date(now-6*D).toISOString()}];
  }
  f.tables.cam_football_games = games;
  f.tables.cam_football_picks = [];
  const odds = [];
  TEAMS.forEach(([id]) => ['semis','final','champion'].forEach((stage, k) => odds.push({team_id:id, stage, probability: .5, points: PTS[id][k]})));
  const state = () => ({liguilla:{id:7, name:'Apertura '+season, season, reseed:true, starts_at:new Date(closes).toISOString(),
      closes_at:new Date(closes).toISOString(), open, server_time:new Date().toISOString()},
    seeds: TEAMS.map(([id,name,abbr], i) => ({seed:i+1, team_id:id, name, short_name:name.replace('Atlético de ','Atl. '), abbreviation:abbr, logo:null, played:17, points:30-i, goal_diff:10-i})),
    odds, series, mine: f.user ? mine : null, players: 12});
  f.rpc = f.rpc || {};
  f.rpc.cam_liguilla_state = () => ({data: MODE === 'none' ? null : state(), error: null});
  f.rpc.cam_liguilla_save_bracket = a => {
    const pts = (id, k) => PTS[id][k];
    mine.bracket = [];
    a.p_semis.forEach((id, i) => id && mine.bracket.push({stage:'semis', slot:i, team_id:id, points:pts(id,0), awarded_points:0, settled_at:null}));
    a.p_finalists.forEach((id, i) => id && mine.bracket.push({stage:'final', slot:i, team_id:id, points:pts(id,1), awarded_points:0, settled_at:null}));
    if (a.p_champion) mine.bracket.push({stage:'champion', slot:0, team_id:a.p_champion, points:pts(a.p_champion,2), awarded_points:0, settled_at:null});
    return {data: {saved: mine.bracket.length, potential: mine.bracket.reduce((s,p)=>s+p.points,0)}, error: null};
  };
  f.rpc.cam_liguilla_save_series_pick = a => { mine.series = mine.series.filter(p => p.series_id !== a.p_series);
    if (a.p_team) mine.series.push({series_id:a.p_series, team_id:a.p_team, awarded_points:0, settled_at:null}); return {data:true, error:null}; };
  f.rpc.cam_liguilla_leaderboard = () => ({data: [{rank_position:1, user_id:'u-2', username:'Un_usuario_con_nombre_muy_largo_2026', points:14, hits:3, alive:12, champion_id:'228'},
    {rank_position:2, user_id:'u-1', username:'QA_Liguilla_Larga', points:8, hits:4, alive:5, champion_id:'227'}], error: null});
  f.rpc.cam_liguilla_admin_table = () => ({data: TEAMS.map(([id,name], i) => ({team_id:id, name, rank:i+1, played:17, points:31-i, goal_diff:9-i})), error:null});
  f.rpc.cam_liguilla_admin_open = a => { f.opened = a; return {data: 7, error: null}; };
  f.rpc.cam_football_leaderboard = () => ({data: [], error: null});
  f.rpc.cam_football_save_pick = a => { f.tables.cam_football_picks.push({game_id:a.p_game_id, user_id:'u-1', pick:a.p_pick, awarded_points:0}); return {data:true, error:null}; };
})();
window.__fake.user = %(user)s;
"""


def fake(mode='open', user=True):
    return FAKE % {'mode': json.dumps(mode), 'teams': json.dumps(TEAMS), 'pts': json.dumps(PTS),
                   'user': USER if user else 'null'}


def open_liga_mx(page):
    page.evaluate("() => filterByCategory('Fútbol')")
    page.wait_for_function("() => window.camFootballQuiniela && window.camLiguilla", timeout=15000)
    page.evaluate("() => window.camFootballQuiniela.selectCompetition('ligamx')")
    page.wait_for_timeout(700)
    page.evaluate("() => window.camLiguilla.refresh()")
    page.wait_for_timeout(500)


def layout_problems(page):
    """Desborde horizontal de la página y textos cortados dentro de la liguilla."""
    return page.evaluate("""() => {
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push('la página se desliza en horizontal: ' + document.documentElement.scrollWidth);
      const root = document.getElementById('camLiguilla');
      if (!root || root.hidden) return out.concat(['la liguilla no se ve']);
      const box = root.getBoundingClientRect();
      if (box.right > innerWidth + 1) out.push('la liguilla sale de la pantalla');
      for (const n of root.querySelectorAll('button, strong, small, span, p, b, em, h3, h4, label, td')) {
        if (!n.offsetParent || n.closest('.cam-lg-table-wrap, .cam-lg-board-scroll, .cam-lg-pending-board')) continue;
        const cs = getComputedStyle(n);
        if (n.scrollWidth > n.clientWidth + 1 && cs.overflowX !== 'visible' && n.clientWidth > 0) out.push('texto cortado: ' + n.textContent.trim().slice(0, 40));
        const r = n.getBoundingClientRect();
        if (r.width && (r.right > box.right + 1 || r.left < box.left - 1)) out.push('se sale: ' + n.className + ' ' + n.textContent.trim().slice(0, 30));
      }
      return [...new Set(out)].slice(0, 8);
    }""")


def pick(page, team, round_index):
    page.locator('#camLiguilla .cam-lg-round').nth(round_index).locator('.cam-lg-team[data-team="%s"]' % team).click()
    page.wait_for_timeout(120)


def build_bracket(page):
    # Cuartos: Cruz Azul, León (sorpresa), Guadalajara, Atl. San Luis (sorpresa)
    for team in ['218', '228', '219', '15720']:
        pick(page, team, 0)
    semis = page.locator('#camLiguilla .cam-lg-round').nth(1).locator('.cam-lg-match')
    assert semis.count() == 2, 'no aparecen las semis: %d' % semis.count()
    # Reclasificación: 1 contra 7 y 3 contra 5
    first = semis.nth(0).locator('.cam-lg-team').evaluate_all('n => n.map(x => x.dataset.team)')
    second = semis.nth(1).locator('.cam-lg-team').evaluate_all('n => n.map(x => x.dataset.team)')
    assert first == ['218', '228'] and second == ['219', '15720'], 'semis mal reclasificadas: %s %s' % (first, second)
    pick(page, '228', 1)
    pick(page, '15720', 1)
    pick(page, '228', 2)
    champion = page.locator('#camLiguilla .cam-lg-champion-name').inner_text()
    assert champion == 'León', 'campeón: ' + champion
    assert '7 de 7' in page.locator('#camLiguilla .cam-lg-count').inner_text()
    # Cambiar un cuartos rehace las semis (reclasificación) y borra lo que dependía de él
    pick(page, '234', 0)
    assert page.locator('#camLiguilla .cam-lg-champion-name').inner_text() == 'Todavía sin elegir'
    pick(page, '218', 0)
    pick(page, '228', 1)
    pick(page, '228', 2)
    assert '7 de 7' in page.locator('#camLiguilla .cam-lg-count').inner_text()


def check_share(page, label):
    page.locator('#camLiguilla .cam-lg-share').click()
    page.wait_for_selector('#camPickShareDialog[open] .cam-pick-share-preview img', timeout=15000)
    sizes = {}
    for fmt, expect in [('story', (1080, 1920)), ('tiktok', (1080, 1920)), ('post', (1080, 1350)), ('card', (1200, 675)), ('photo', (1080, 1440))]:
        page.locator('#camPickShareDialog .cam-take-share-destination[data-size="%s"]' % fmt).click()
        page.wait_for_function("() => { const i = document.querySelector('#camPickShareDialog .cam-pick-share-preview img'); return i && i.complete && i.naturalWidth > 0 && i.alt.includes('%s'); }" % {'story': 'Historia', 'tiktok': 'TikTok', 'post': 'Publicación', 'card': 'X', 'photo': 'Foto'}[fmt], timeout=15000)
        size = page.evaluate("() => { const i = document.querySelector('#camPickShareDialog .cam-pick-share-preview img'); return [i.naturalWidth, i.naturalHeight]; }")
        assert tuple(size) == expect, '%s %s: %s' % (label, fmt, size)
        sizes[fmt] = size
    # Zonas seguras: nada dibujado donde cada red tapa (solo el azul de fondo).
    bad = page.evaluate("""() => {
      const m = window.camLiguilla.shareModel();
      const zones = {story: [[0,0,1080,250],[0,1670,1080,250]], tiktok: [[0,0,1080,240],[0,1260,1080,660],[900,240,180,1020]]};
      const out = [];
      for (const [size, rects] of Object.entries(zones)) {
        const c = window.CamPickShare.renderBracketCard(m, size), ctx = c.getContext('2d');
        for (const [x,y,w,h] of rects) {
          const d = ctx.getImageData(x,y,w,h).data;
          for (let i = 0; i < d.length; i += 4 * 97) {
            if (Math.abs(d[i]-11) > 6 || Math.abs(d[i+1]-34) > 6 || Math.abs(d[i+2]-51) > 6) { out.push(size + ' ' + [x,y,w,h].join(',')); break; }
          }
        }
      }
      return out;
    }""")
    assert not bad, label + ': hay contenido en zonas que tapa la red: ' + str(bad)
    if SHOTS:
        page.evaluate("""() => { const m = window.camLiguilla.shareModel();
          for (const s of ['story','card']) { const a = document.createElement('a'); a.id = 'shot-' + s;
            a.dataset.url = window.CamPickShare.renderBracketCard(m, s).toDataURL('image/png'); document.body.append(a); } }""")
        import base64
        for s in ['story', 'card']:
            data = page.evaluate("s => document.getElementById('shot-' + s).dataset.url", s)
            pathlib.Path(SHOTS, 'ficha-%s.png' % s).write_bytes(base64.b64decode(data.split(',', 1)[1]))
    page.locator('#camPickShareDialog .cam-pick-share-close').click()
    return sizes


def run():
    # 1) Teléfono de día: armar, guardar y compartir el cuadro.
    with fp.full_page(fake_js=fake('open'), width=390, height=900) as page:
        open_liga_mx(page)
        assert page.locator('#camFootballSemana #camLiguilla').is_visible(), 'la liguilla debe estar dentro de La semana'
        assert page.locator('#camLiguilla .cam-lg-round').nth(0).locator('.cam-lg-team').count() == 8
        assert page.locator('#camLiguilla .cam-lg-wait').count() >= 2
        build_bracket(page)
        assert '56' in page.locator('#camLiguilla .cam-lg-potential').inner_text(), page.locator('#camLiguilla .cam-lg-potential').inner_text()
        assert page.locator('#camLiguilla .cam-lg-share').is_disabled(), 'no se comparte sin guardar'
        page.locator('#camLiguilla .cam-lg-save').click()
        page.wait_for_timeout(400)
        call = page.evaluate("() => window.__fake.calls.filter(c => c.rpc === 'cam_liguilla_save_bracket').pop()")
        assert call and call['args']['p_semis'] == ['218', '228', '219', '15720'] and call['args']['p_champion'] == '228', call
        assert 'guardado' in page.locator('#camLiguilla .cam-lg-note').inner_text().lower()
        assert not page.locator('#camLiguilla .cam-lg-share').is_disabled(), 'tras guardar se puede compartir'
        assert not layout_problems(page), layout_problems(page)
        # Ronda a ronda (cuartos abiertos) y «¿Quién pasa?»
        assert page.locator('#camLiguilla .cam-lg-rounds .cam-lg-series').count() == 4
        page.locator('#camLiguilla .cam-lg-series').first.locator('.cam-lg-pass .cam-lg-opt').nth(1).click()
        page.wait_for_timeout(300)
        assert page.evaluate("() => window.__fake.calls.some(c => c.rpc === 'cam_liguilla_save_series_pick' && c.args.p_team === '234')")
        # 1X2 de la ida desde la serie: usa el guardado de la quiniela
        page.locator('#camLiguilla .cam-lg-series').first.locator('.cam-lg-leg').first.locator('.cam-lg-opt').nth(1).click()
        page.wait_for_timeout(500)
        assert page.evaluate("() => window.__fake.calls.some(c => c.rpc === 'cam_football_save_pick' && c.args.p_pick === 'draw')")
        assert page.evaluate("() => document.getElementById('camFootballQuiniela').classList.contains('cam-liguilla-round')"), 'la jornada normal debía ocultarse'
        if SHOTS:
            page.locator('#camLiguilla').screenshot(path=SHOTS + '/liguilla-390-dia.png')
        check_share(page, '390 día')
        assert not page.errors, page.errors

    # 2) Anchos y temas: sin desbordes ni textos cortados.
    for width, dark in [(320, True), (390, True), (1366, False), (1366, True)]:
        with fp.full_page(fake_js=fake('open'), width=width, height=900, dark=dark) as page:
            open_liga_mx(page)
            build_bracket(page)
            problems = layout_problems(page)
            assert not problems, '%d %s: %s' % (width, 'noche' if dark else 'día', problems)
            if width == 1366:
                cols = page.evaluate("() => getComputedStyle(document.querySelector('#camLiguilla .cam-lg-board')).gridTemplateColumns.split(' ').length")
                assert cols == 4, 'en escritorio el cuadro va en 4 columnas: %s' % cols
            if SHOTS:
                page.locator('#camLiguilla').screenshot(path=SHOTS + '/liguilla-%d-%s.png' % (width, 'noche' if dark else 'dia'))
            assert not page.errors, page.errors

    # 3) Liguilla en curso: semis y final, cuadro en juego, ranking.
    for mode, width, dark in [('sf', 390, False), ('final', 390, True), ('final', 1366, False), ('sf', 320, True)]:
        with fp.full_page(fake_js=fake(mode), width=width, height=900, dark=dark) as page:
            open_liga_mx(page)
            title = page.locator('#camLiguilla .cam-lg-stage h3').inner_text()
            assert title == ('Semifinales' if mode == 'sf' else 'La Final'), title
            assert page.locator('#camLiguilla .cam-lg-rounds.is-final').count() == (1 if mode == 'final' else 0)
            assert page.locator('#camLiguilla .cam-lg-bracket .cam-lg-team:not([disabled])').count() == 0, 'el cuadro cerrado no se puede tocar'
            assert page.locator('#camLiguilla .cam-lg-pts.is-hit').count() >= 1
            assert 'Llevas' in page.locator('#camLiguilla .cam-lg-potential').inner_text()
            # Volver a ver cuartos desde el carril
            page.locator('#camLiguilla .cam-lg-rail-btn').first.click(); page.wait_for_timeout(150)
            assert page.locator('#camLiguilla .cam-lg-stage h3').inner_text() == 'Cuartos de final'
            assert 'Pasa' in page.locator('#camLiguilla .cam-lg-series-foot').first.inner_text()
            page.locator('#camLiguilla .cam-lg-ranking .cam-lg-link').click(); page.wait_for_timeout(400)
            assert page.locator('#camLiguilla .cam-lg-table tbody tr').count() == 2
            problems = layout_problems(page)
            assert not problems, '%s %d: %s' % (mode, width, problems)
            if SHOTS:
                page.locator('#camLiguilla').screenshot(path=SHOTS + '/liguilla-%s-%d-%s.png' % (mode, width, 'noche' if dark else 'dia'))
            assert not page.errors, page.errors

    # 4) Administración: abrir «Tu liguilla» con la tabla de ESPN.
    with fp.full_page(fake_js=fake('none'), width=390, height=900) as page:
        open_liga_mx(page)
        assert page.locator('#camLiguilla').is_visible(), 'sin equipos oficiales debe aparecer estado pendiente'
        assert 'Cruces por confirmar' in page.locator('#camLiguilla').inner_text()
        page.evaluate("() => { currentAdmin = {id:'u-1'}; window.dispatchEvent(new Event('cam:admin-state-change')); }")
        page.wait_for_timeout(200)
        page.locator('#camLiguilla .cam-lg-admin .cam-nfl-action').first.click()
        page.wait_for_selector('#camLiguilla .cam-lg-admin-form')
        page.fill('#camLiguilla input[name="lgStart"]', '2026-11-25T19:00')
        page.locator('#camLiguilla .cam-lg-admin-form button[type="submit"]').click()
        page.wait_for_timeout(150)
        assert page.locator('#camLiguilla .cam-lg-admin-confirm').is_visible(), 'falta la confirmación'
        assert page.input_value('#camLiguilla input[name="lgStart"]') == '2026-11-25T19:00', 'la confirmación borró la fecha'
        page.locator('#camLiguilla .cam-lg-admin-form button[type="submit"]').click()
        page.wait_for_timeout(400)
        opened = page.evaluate('() => window.__fake.opened')
        assert opened and len(opened['p_teams']) == 8 and opened['p_teams'][0]['team_id'] == '218', opened
        assert opened['p_starts_at'] == '2026-11-26T00:00:00.000Z', opened['p_starts_at']
        assert opened['p_reseed'] is True
        problems = layout_problems(page)
        assert not problems, 'admin: ' + str(problems)
        assert not page.errors, page.errors

    # 5) Sin los ocho clasificados oficiales, Arma tu cuadro es solo un aviso:
    # nada se puede elegir, guardar ni compartir, aunque existan equipos en la liga.
    with fp.full_page(fake_js=fake('none', user=False), width=390, height=900) as page:
        open_liga_mx(page)
        toggle = page.locator('#camLiguilla .cam-fan-toggle')
        assert toggle.is_visible(), 'debe mantenerse visible el módulo Arma tu cuadro'
        assert toggle.is_disabled(), 'no se pueden abrir selecciones antes de los ocho clasificados'
        assert toggle.inner_text() == 'Próximamente'
        assert 'Pronto estará disponible' in page.locator('#camLiguilla .cam-fan-shell').inner_text()
        assert '8 clasificados' in page.locator('#camLiguilla .cam-fan-shell').inner_text()
        assert page.locator('#camLiguilla .cam-fan-select').count() == 0
        assert page.locator('#camLiguilla .cam-fan-actions').count() == 0
        assert not page.evaluate("() => window.CamFanBracket.shareModel()"), 'sin clasificados no existe imagen para compartir'
        assert not layout_problems(page), layout_problems(page)
        assert not page.errors, page.errors

    # 6) Cuando se confirman los ocho, el cuadro se activa: solo ellos pueden avanzar.
    with fp.full_page(fake_js=fake('open', user=False), width=390, height=900) as page:
        open_liga_mx(page)
        assert not page.locator('#camLiguilla .cam-fan-toggle').is_disabled()
        page.locator('#camLiguilla .cam-fan-toggle').click()
        page.wait_for_function("() => document.querySelectorAll('#camLiguilla .cam-fan-team-select').length === 8")
        assert page.locator('#camLiguilla .cam-fan-select').count() == 8
        assert page.locator('#camLiguilla select.cam-fan-select').count() == 0, 'los ocho puestos oficiales no se pueden cambiar por otros equipos'
        assert '8/8' in page.locator('#camLiguilla .cam-fan-count').inner_text()
        for n in [0, 2, 4, 6]:
            page.locator('#camLiguilla .cam-fan-team-select').nth(n).locator('.cam-fan-pass').click()
        page.locator('#camLiguilla .cam-fan-left-semi .cam-fan-option').first.click()
        page.locator('#camLiguilla .cam-fan-right-semi .cam-fan-option').first.click()
        page.locator('#camLiguilla .cam-fan-final-pair .cam-fan-option').first.click()
        assert '7/7' in page.locator('#camLiguilla .cam-fan-count').inner_text()
        assert 'Cruz Azul' in page.locator('#camLiguilla .cam-fan-champion').inner_text()
        mobile_columns = page.evaluate("() => getComputedStyle(document.querySelector('#camLiguilla .cam-fan-tree')).gridTemplateColumns.split(' ').length")
        assert mobile_columns == 1, 'en móvil el cuadro libre debe tener 1 columna legible: %s' % mobile_columns
        page.locator('#camLiguilla .cam-fan-actions button').filter(has_text='Guardar mi cuadro').click()
        assert page.evaluate("() => !!localStorage.getItem('cam-sports:cuadro-libre:ligamx:'+(window.camFootballQuiniela.snapshot().season)+':invitado')")
        assert 'este dispositivo' in page.locator('#camLiguilla .cam-fan-status').inner_text()
        page.locator('#camLiguilla .cam-fan-actions button').filter(has_text='Compartir en redes').click()
        page.wait_for_selector('#camPickShareDialog[open] .cam-pick-share-preview img', timeout=15000)
        page.locator('#camPickShareDialog .cam-pick-share-close').click()
        page.evaluate("() => { currentUser = {id:'u-1',username:'QA'}; window.camLiguilla.render(); }")
        page.wait_for_timeout(200)
        page.locator('#camLiguilla .cam-fan-toggle').click()
        assert 'Cruz Azul' in page.locator('#camLiguilla .cam-fan-champion').inner_text(), 'se perdió el cuadro al entrar con cuenta'
        page.locator('#camLiguilla .cam-fan-actions button').filter(has_text='Guardar mi cuadro').click()
        page.wait_for_timeout(250)
        assert page.evaluate("() => window.__fake.calls.some(c => c.table==='cam_liguilla_fan_brackets' && c.op==='upsert')"), 'no se sincronizó el cuadro'
        assert not layout_problems(page), layout_problems(page)
        assert not page.errors, page.errors

    # 7) Con sesión activa el botón guarda también en la tabla privada de Supabase.
    with fp.full_page(fake_js=fake('open', user=True), width=390, height=900) as page:
        open_liga_mx(page)
        page.locator('#camLiguilla .cam-fan-toggle').click()
        page.wait_for_function("() => document.querySelectorAll('#camLiguilla .cam-fan-team-select').length === 8")
        page.locator('#camLiguilla .cam-fan-actions button').filter(has_text='Guardar mi cuadro').click()
        page.wait_for_timeout(200)
        assert page.evaluate("() => window.__fake.calls.some(c => c.table==='cam_liguilla_fan_brackets' && c.op==='upsert')"), 'cuadro no se sincroniza'
        assert not page.errors, page.errors

    print('OK · liguilla: esperar ocho clasificados, desbloqueo oficial, guardar y compartir; 320/390/1366, día y noche')


if __name__ == '__main__':
    run()
