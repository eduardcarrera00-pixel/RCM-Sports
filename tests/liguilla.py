"""Liguilla de la Liga MX en la Quiniela de Fútbol (Chromium + Supabase falso).

Un solo «Arma tu cuadro» en dos pasos:
  · paso 1, antes de la J17: elegir a los 8 que entran (sin eliminados, tope de
    8, invitado en el aparato, con cuenta en Supabase; cerrado = solo lectura);
  · paso 2, con los 8 reales: el cuadro hasta el campeón (reclasificación de
    semis, guardar, compartir), la ficha para redes en sus 5 formatos con las
    zonas seguras y, después, la vista ronda a ronda (cuartos, semis y final);
  · «Mi liguilla» en el perfil (mis 8 y mi cuadro) lleva a la liguilla;
  · el panel de apertura del admin;
y que no haya desbordes ni textos cortados a 320, 390 y 1366 px, de día y de noche.

Uso: python3 tests/liguilla.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
CLIPPED = (ROOT / 'tests/parties.py').read_text(encoding='utf8').split('CLIPPED = r"""', 1)[1].split('"""', 1)[0]

USER = '{"id":"u-1","email":"liguilla@qa.camsports.invalid","user_metadata":{"username":"QA_Liguilla_Larga"}}'
TEAMS = [('218', 'Cruz Azul', 'CAZ'), ('227', 'América', 'AME'), ('219', 'Guadalajara', 'GDL'),
         ('223', 'Toluca', 'TOL'), ('15720', 'Atlético de San Luis', 'ASL'), ('225', 'Santos', 'SAN'),
         ('228', 'León', 'LEO'), ('234', 'Pachuca', 'PAC')]
# El resto de la Liga MX para el paso 1 (elegir a los 8): 18 equipos en total.
EXTRA = [('220', 'Monterrey', 'MTY'), ('232', 'Tigres UANL', 'TIG'), ('233', 'Pumas UNAM', 'PUM'),
         ('229', 'Necaxa', 'NEC'), ('231', 'Puebla', 'PUE'), ('222', 'Querétaro', 'QRO'),
         ('20702', 'Mazatlán FC', 'MAZ'), ('17851', 'FC Juárez', 'JUA'), ('10125', 'Tijuana', 'TIJ'), ('216', 'Atlas', 'ATL')]
# Puntos de ejemplo por equipo: [semis, final, campeón]
PTS = {'218': [1, 3, 5], '227': [1, 3, 5], '219': [1, 4, 7], '223': [1, 5, 8],
       '15720': [6, 11, 16], '225': [6, 11, 15], '228': [7, 13, 17], '234': [6, 12, 16]}

FAKE = """
try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}
(() => {
  const f = window.__fake = window.__fake || {};
  const MODE = %(mode)s;
  const TEAMS = %(teams)s, PTS = %(pts)s, EXTRA = %(extra)s;
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
  f.rpc.cam_liguilla_state = () => ({data: (MODE === 'none' || MODE === 'q8closed') ? null : state(), error: null});
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
  // Paso 1: los 18 de la tabla. 1-4 ya clasificados, 5-12 en juego, 13-18 eliminados.
  const PRE = MODE === 'none' || MODE === 'q8closed';
  const CAND = TEAMS.concat(EXTRA).map(([id,name,abbr], i) => ({team_id:id, name, short_name:name.replace('Atlético de ','Atl. '),
    abbreviation:abbr, logo:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46"><path d="M20 2 37 8v14c0 11-7.5 18.5-17 22C10.5 40.5 3 33 3 22V8Z" fill="hsl('+(i*47%%360)+' 60%% 42%%)" stroke="#fff" stroke-width="2.5"/><path d="M14 5.6v35.6M26 5.6v35.6" stroke="#fff" stroke-width="4" opacity=".85"/><circle cx="20" cy="20" r="6" fill="hsl('+((i*47+180)%%360)+' 65%% 55%%)" stroke="#fff" stroke-width="2"/></svg>'), rank:i+1, played:16, points:36-2*i, goal_diff:14-2*i, status: i<4?'in':i<12?'alive':'out'}));
  f.q8 = MODE === 'q8closed' ? ids.slice(0,7).concat(['220']) : null;
  const win = () => ({id:3, competition:'ligamx', season, name:'Apertura '+season,
    closes_at: new Date(MODE === 'q8closed' ? now - H : now + 3*D).toISOString(),
    open: MODE === 'none', opened: !PRE, server_time: new Date().toISOString()});
  f.rpc.cam_liguilla_candidates = () => ({data: {window: win(), fetched_at: new Date(now - H).toISOString(), teams: CAND,
    mine: f.user && f.q8 ? [...f.q8] : null, players: 5}, error: null});
  f.rpc.cam_liguilla_save_qualifiers = a => {
    const t = a.p_teams || [];
    if (t.length !== 8 || new Set(t).size !== 8) return {data:null, error:{message:'Elige exactamente 8 equipos distintos.'}};
    if (t.some(id => CAND.find(c => c.team_id === id)?.status === 'out')) return {data:null, error:{message:'Estos equipos ya no pueden clasificar.'}};
    f.q8 = [...t]; return {data:{saved:8}, error:null}; };
  if (!PRE) mine.qualifiers = ids.slice(0,7).concat(['220']);
  // «Mi liguilla» en el perfil: lo que devuelve cam_liguilla_profile dentro de cam_profile_overview.
  const T = id => { const c = CAND.find(x => x.team_id === id); return {team_id:id, name:c.name, short_name:c.short_name, abbreviation:c.abbreviation, logo:null, status:c.status}; };
  const q8teams = ids.slice(0,7).concat(['220']).map(T);
  const lgProfile = PRE
    ? {name:'Apertura '+season, season, own:true, phase: MODE === 'none' ? 'qualifiers_open' : 'qualifiers_closed', closes_at: win().closes_at,
       qualifiers:{teams:q8teams, hits:4, decided:false}, bracket:null}
    : {name:'Apertura '+season, season, own:true, phase: open ? 'bracket_open' : 'bracket', closes_at: new Date(closes).toISOString(),
       qualifiers:{teams:q8teams.map((t,i) => Object.assign(t, {status: i<7?'in':'out'})), hits:7, decided:true},
       bracket:{champion:Object.assign(T('228'), {points:17, awarded:0, settled:false}),
         finalists:[Object.assign(T('228'), {points:13, awarded:0, settled:false}), Object.assign(T('15720'), {points:11, awarded:0, settled:false})],
         semis:[], picks:7, points: open ? 0 : 8, alive: open ? 0 : 3, hits: open ? 0 : 2}};
  f.rpc.cam_profile_overview = ({p_user}) => ({data: {user_id:p_user, username:'QA_Liguilla_Larga', joined_month:'2026-10',
    takes:{count:0, up:0, down:0, top:null}, picks:{count:0, won:0, lost:0, top:null},
    quiniela:{nfl:null, football:null, parties:[]}, liguilla: lgProfile}, error: null});
  f.rpc.cam_username_status = () => ({data: {username:'QA_Liguilla_Larga', can_change:true}, error: null});
  f.rpc.cam_football_save_pick = a => { f.tables.cam_football_picks.push({game_id:a.p_game_id, user_id:'u-1', pick:a.p_pick, awarded_points:0}); return {data:true, error:null}; };
})();
window.__fake.user = %(user)s;
"""


def fake(mode='open', user=True):
    return FAKE % {'mode': json.dumps(mode), 'teams': json.dumps(TEAMS), 'pts': json.dumps(PTS), 'extra': json.dumps(EXTRA),
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
        assert not page.locator('#camLiguilla .cam-lg-share').is_disabled(), 'con los 7 elegidos ya se puede compartir'
        assert 'acertaste 7 de 8' in page.locator('#camLiguilla .cam-lg-q8-hits').inner_text(), 'falta «Tus 8» en el cuadro'
        assert page.locator('#camLiguilla .cam-lg-bracket').count() == 1, 'debe haber un solo cuadro'
        assert page.locator('#camLiguilla [class*="cam-fan-"]').count() == 0 and not page.evaluate('() => !!window.CamFanBracket'), 'quedan restos del cuadro libre'
        page.locator('#camLiguilla .cam-lg-save').click()
        page.wait_for_timeout(400)
        call = page.evaluate("() => window.__fake.calls.filter(c => c.rpc === 'cam_liguilla_save_bracket').pop()")
        assert call and call['args']['p_semis'] == ['218', '228', '219', '15720'] and call['args']['p_champion'] == '228', call
        assert 'guardado' in page.locator('#camLiguilla .cam-lg-note').inner_text().lower()
        assert not page.locator('#camLiguilla .cam-lg-share').is_disabled(), 'tras guardar se sigue pudiendo compartir'
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
                cols, wide = page.evaluate("() => { const b = document.querySelector('#camLiguilla .cam-lg-board');"
                    " return [getComputedStyle(b).gridTemplateColumns.split(' ').length, document.querySelector('#camLiguilla .cam-lg-bracket').clientWidth]; }")
                # Con los atajos a la izquierda la liguilla mide ~800 px: cuartos y semis lado a lado; desde 900 px, las 4 rondas.
                assert cols == (4 if wide >= 900 else 2), 'en escritorio el cuadro va en %s columnas (ancho %s)' % (cols, wide)
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
        assert 'Paso 1 de 2' in page.locator('#camLiguilla').inner_text(), 'antes de abrir se eligen los 8'
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

    # 5) Paso 1 como invitado: elegir a los 8 (sin eliminados, tope de 8), guardar en el aparato,
    #    y al entrar con cuenta se recupera y se guarda en Supabase.
    with fp.full_page(fake_js=fake('none', user=False), width=390, height=900) as page:
        open_liga_mx(page)
        root = page.locator('#camLiguilla')
        assert root.locator('h3').first.inner_text() == 'Arma tu cuadro'
        assert 'paso 1 de 2' in root.inner_text().lower() and 'paso 2 de 2' in root.inner_text().lower()
        assert root.locator('[class*="cam-fan-"]').count() == 0 and not page.evaluate('() => !!window.CamFanBracket')
        teams = root.locator('.cam-lg-q8-team')
        assert teams.count() == 12, 'solo los que aún pueden clasificar: %d' % teams.count()
        assert 'Ya eliminados:' in root.inner_text() and 'Atlas' in root.locator('.cam-lg-hint').first.inner_text()
        assert root.locator('.cam-lg-q8-team[data-team="216"]').count() == 0, 'un eliminado no se puede elegir'
        assert root.locator('.cam-lg-q8-status.is-in').count() == 4, 'los ya clasificados llevan su etiqueta'
        # Paso 2: vista previa del cuadro con los 8 primeros de hoy, de cuartos al trofeo, y «Próximamente».
        pv = root.locator('.cam-lg-q8-next .cam-lg-pv')
        assert pv.count() == 1, 'falta la vista previa del cuadro'
        seeds = pv.locator('.cam-lg-pv-seed').evaluate_all('n => n.map(x => x.textContent)')
        assert seeds == ['1', '8', '4', '5', '2', '7', '3', '6'], seeds
        abbrs = pv.locator('.cam-lg-pv-abbr').evaluate_all('n => n.map(x => x.textContent)')
        assert abbrs == ['CAZ', 'PAC', 'TOL', 'ASL', 'AME', 'LEO', 'GDL', 'SAN'], abbrs
        assert 'Próximamente' in pv.locator('.cam-lg-pv-soon').inner_text()
        assert pv.locator('.cam-lg-pv-cup svg').count() == 1, 'falta el trofeo'
        assert '1.º Cruz Azul contra 8.º Pachuca' in pv.locator('[role="img"]').get_attribute('aria-label')
        assert 'tabla de hoy' in pv.locator('figcaption').inner_text()
        assert root.locator('.cam-lg-how li').count() == 3, 'Tu cuadro se explica en tres líneas'
        assert pv.locator('button').count() == 0, 'la vista previa no se puede tocar'
        assert pv.locator('img.cam-lg-crest').count() == 8, 'cada equipo lleva su escudo'
        # Si un escudo no carga, sale el escudo de reserva con sus siglas (nunca un hueco).
        page.evaluate("() => { const i = document.querySelector('#camLiguilla .cam-lg-pv img.cam-lg-crest'); i.src = 'data:image/png;base64,AAAA'; }")
        page.wait_for_function("() => document.querySelector('#camLiguilla .cam-lg-pv img.cam-lg-crest').dataset.fallback === '1'", timeout=3000)
        assert 'CAZ' in page.evaluate("() => decodeURIComponent(document.querySelector('#camLiguilla .cam-lg-pv img.cam-lg-crest').src)")
        save = root.locator('.cam-lg-q8-save')
        assert save.is_disabled()
        for team in ['218', '227', '219', '223', '15720', '225', '228']:
            root.locator('.cam-lg-q8-team[data-team="%s"]' % team).click()
        assert '7 de 8' in root.locator('.cam-lg-count').inner_text() and save.is_disabled()
        assert 'Te faltan 1' in root.inner_text()
        root.locator('.cam-lg-q8-team[data-team="220"]').click()
        assert '8 de 8' in root.locator('.cam-lg-count').inner_text()
        assert root.locator('.cam-lg-q8-team[data-team="234"]').is_disabled(), 'no se puede elegir un noveno'
        assert root.locator('.cam-lg-q8-team[data-team="220"]').get_attribute('aria-pressed') == 'true'
        # Quitar y volver a poner con el teclado (el foco se queda en el equipo).
        root.locator('.cam-lg-q8-team[data-team="220"]').focus(); page.keyboard.press('Enter'); page.wait_for_timeout(100)
        assert '7 de 8' in root.locator('.cam-lg-count').inner_text()
        assert page.evaluate("() => document.activeElement?.dataset?.team") == '220', 'el foco se perdió al quitar'
        page.keyboard.press('Enter'); page.wait_for_timeout(100)
        assert '8 de 8' in root.locator('.cam-lg-count').inner_text()
        assert 'Ya clasificados: 4 de 8' in root.locator('.cam-lg-potential').inner_text()
        assert not save.is_disabled()
        if SHOTS:
            root.screenshot(path=SHOTS + '/mis8-390-dia.png')
        save.click(); page.wait_for_timeout(150)
        assert 'este dispositivo' in root.locator('.cam-lg-note').inner_text()
        stored = page.evaluate("() => JSON.parse(localStorage.getItem('cam:liguilla:mis8:anon:3'))")
        assert stored and len(stored) == 8, stored
        assert not page.evaluate("() => window.__fake.calls.some(c => c.rpc === 'cam_liguilla_save_qualifiers')"), 'un invitado no llama a Supabase'
        assert not layout_problems(page), layout_problems(page)
        # Entra con su cuenta: sus 8 siguen ahí y se guardan.
        page.evaluate("() => { window.__fake.user = JSON.parse(%r); currentUser = {id:'u-1', username:'QA_Liguilla_Larga'}; window.camLiguilla.refresh(); }" % USER)
        page.wait_for_timeout(500)
        assert '8 de 8' in root.locator('.cam-lg-count').inner_text(), 'se perdieron los 8 al entrar con cuenta'
        assert root.locator('.cam-lg-q8-save').is_enabled()
        root.locator('.cam-lg-q8-save').click(); page.wait_for_timeout(400)
        call = page.evaluate("() => window.__fake.calls.filter(c => c.rpc === 'cam_liguilla_save_qualifiers').pop()")
        assert call and call['args']['p_window'] == 3 and sorted(call['args']['p_teams']) == sorted(['218', '227', '219', '223', '15720', '225', '228', '220']), call
        assert 'salen en tu perfil' in root.locator('.cam-lg-note').inner_text()
        assert root.locator('.cam-lg-q8-save').is_disabled(), 'sin cambios no hay nada que guardar'
        assert not page.evaluate("() => localStorage.getItem('cam:liguilla:mis8:anon:3')"), 'el borrador del aparato debía borrarse'
        assert not layout_problems(page), layout_problems(page)
        assert not page.errors, page.errors

    # 5b) Paso 1 en todos los anchos y temas.
    for width, dark in [(320, False), (320, True), (390, True), (1366, False), (1366, True)]:
        with fp.full_page(fake_js=fake('none'), width=width, height=900, dark=dark) as page:
            open_liga_mx(page)
            for team in ['218', '227', '219', '223', '15720', '225', '228', '220']:
                page.locator('#camLiguilla .cam-lg-q8-team[data-team="%s"]' % team).click()
            problems = layout_problems(page)
            assert not problems, 'mis 8 %d %s: %s' % (width, 'noche' if dark else 'día', problems)
            # El aviso «Próximamente» no tapa los cuartos, el trofeo ni «Campeón».
            overlap = page.evaluate("""() => {
              const q = s => document.querySelector('#camLiguilla .cam-lg-pv ' + s).getBoundingClientRect();
              const soon = q('.cam-lg-pv-soon'), hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
              return ['.cam-lg-pv-col.is-qf', '.cam-lg-pv-cup', '.cam-lg-pv-champ', '.cam-lg-pv-cell .cam-lg-pv-match'].filter(s => hit(soon, q(s)));
            }""")
            assert not overlap, 'mis 8 %d: el aviso tapa %s' % (width, overlap)
            cut = page.evaluate("() => [...document.querySelectorAll('#camLiguilla .cam-lg-pv-team:not(.is-ghost) :is(.cam-lg-pv-abbr,.cam-lg-pv-name)')].filter(n => n.offsetParent && n.scrollWidth > n.clientWidth + 1).map(n => n.textContent)")
            assert not cut, 'mis 8 %d: siglas o nombres cortados en el cuadro: %s' % (width, cut)
            if width == 1366:
                cols, wide = page.evaluate("() => [getComputedStyle(document.querySelector('#camLiguilla .cam-lg-q8-list')).gridTemplateColumns.split(' ').length,"
                    " document.querySelector('#camLiguilla .cam-lg-bracket').clientWidth]")
                assert cols >= 2 and (cols == 3) == (wide >= 900), 'en escritorio la lista va en %s columnas (ancho %s)' % (cols, wide)
            if SHOTS:
                page.locator('#camLiguilla').screenshot(path=SHOTS + '/mis8-%d-%s.png' % (width, 'noche' if dark else 'dia'))
            assert not page.errors, page.errors

    # 6) Paso 1 cerrado (empezó la J17): sus 8 se ven con su estado y ya no se tocan.
    with fp.full_page(fake_js=fake('q8closed'), width=390, height=900, dark=True) as page:
        open_liga_mx(page)
        root = page.locator('#camLiguilla')
        assert 'Paso 1 cerrado' in root.inner_text()
        assert root.locator('.cam-lg-q8-team').count() == 8
        assert root.locator('.cam-lg-q8-team:not([disabled])').count() == 0, 'cerrado: no se puede cambiar nada'
        assert root.locator('.cam-lg-q8-save').count() == 0
        assert root.locator('.cam-lg-q8-status.is-in').count() == 4 and root.locator('.cam-lg-q8-status.is-alive').count() == 4
        problems = layout_problems(page)
        assert not problems, 'cerrado: %s' % problems
        if SHOTS:
            root.screenshot(path=SHOTS + '/mis8-cerrado-390-noche.png')
        assert not page.errors, page.errors

    # 7) «Mi liguilla» en el perfil: mis 8 (antes) y mi cuadro (después); lleva a la liguilla.
    for mode, width, dark in [('none', 390, False), ('none', 320, True), ('open', 390, True), ('sf', 1366, False)]:
        with fp.full_page(fake_js=fake(mode), width=width, height=844 if width < 700 else 900, dark=dark) as page:
            page.wait_for_timeout(600)
            if width < 700:
                page.click('#camNavProfile')
            else:
                page.evaluate("document.getElementById('aeMyTakesButton').click()")
            card = page.locator('#camProfileOverview .cam-ov-card[data-kind="liguilla"]')
            card.wait_for(timeout=8000)
            text = card.inner_text()
            assert 'Mi liguilla' in text and 'Liga MX' in text, text
            if mode == 'none':
                assert card.locator('.cam-ov-l8-team').count() == 8, 'faltan los 8 en el perfil'
                assert 'mis 8 para la liguilla' in text.lower() and '4 de 8 ya clasificados' in text, text
            else:
                assert 'León' in text and 'campeón' in text.lower() and 'mis 8: 7 de 8 acertados' in text.lower(), text
                assert card.locator('.cam-ov-l8-team').count() == 0
            bad = page.evaluate(CLIPPED, '#camProfileOverview')
            assert not bad, '%s %d: %s' % (mode, width, bad)
            assert page.evaluate("() => document.getElementById('aeProfileDialog').scrollWidth - document.getElementById('aeProfileDialog').clientWidth") <= 1
            if SHOTS:
                card.screenshot(path=SHOTS + '/perfil-%s-%d-%s.png' % (mode, width, 'noche' if dark else 'dia'))
            card.locator('.cam-ov-more').click()
            page.wait_for_function("() => { const r = document.getElementById('camLiguilla'); return r && !r.hidden && r.getClientRects().length && !document.getElementById('aeProfileDialog').open; }", timeout=8000)
            page.wait_for_timeout(500)
            assert page.locator('#camLiguilla .cam-lg-q8-list' if mode == 'none' else '#camLiguilla .cam-lg-board').count() == 1
            assert not page.errors, page.errors

    print('OK · liguilla: paso 1 (mis 8), un solo cuadro, ronda a ronda, perfil y admin; 320/390/1366, día y noche')


if __name__ == '__main__':
    run()
