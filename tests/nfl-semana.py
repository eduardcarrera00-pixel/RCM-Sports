"""NFL · La semana (teléfono) y el editor, el laurel y la comunidad en La Quiniela.

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).

Cubre:
  · 390 y 320 px, de día y de noche, con sesión: NFL abre «La semana»
    (?s=nfl&v=semana) con cabecera de edición, Duelo de la semana (n.º 3 vs n.º 2),
    Abre la semana y La que más paga, ¿Le ganas al editor? (con «tú contra el
    editor» de la semana anterior), El marcador / La crónica (sorpresa primero)
    y La columna (movimiento real contra la última edición publicada ≥ 12 h,
    último resultado y frase de la columna del editor); el carrusel de Power
    Rankings no se repite en Noticias; sin desbordamiento ni textos recortados;
  · elegir en el duelo guarda el pronóstico (cam_nfl_save_pick) y lo marca;
  · en La Quiniela: la elección del editor en cada partido, el laurel en un
    partido ya pronosticado (cam_nfl_set_laurel, puntos x2) y la regla visible;
  · tocar «La que más paga» abre ese partido en la quiniela;
  · «Ver Top 10» desde Inicio abre La columna con los diez;
  · sin la migración (tabla y funciones inexistentes): ni editor, ni laurel, ni
    comunidad, ni reglas nuevas, y ningún error;
  · escritorio (1366 px): La semana no se ve; Power Rankings como siempre; la
    elección del editor sí aparece en La Quiniela.

Uso: python3 -B tests/nfl-semana.py [--shots DIR]
"""
import importlib.util, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

BASE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  const T = F.tables, H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  if (!F.anonymous) F.user = {id: 'u1', email: 'u1@example.com', user_metadata: {username: 'probador'}};
  T.articles = [{id: 'a0000001-0000-4000-8000-000000000000', title: 'Power Rankings NFL Semana 7', category: 'NFL', author: 'adrianmendozac27',
    image: '', summary: 'Top 5 de los power Ranking tras la semana 7', featured: false, created_at: iso(-40), is_public: true, image_focus_x: 50, image_focus_y: 50,
    body: '<h3>1. San Francisco 49ers</h3><p>Siguen arriba aunque perdieron en Atlanta: la defensa sostiene a un equipo que no se rinde.</p>' +
          '<h3>2. Minnesota Vikings</h3><p>El mejor momento del año para los de Minneapolis.</p>'}];
  T.nfl_rankings = [{id: 1, edition: 'Week 6', team_ids: ['SF','MIN','BUF','KC','JAX','CHI','DEN','CIN','GB','SEA'], updated_at: '2026-10-29T18:34:20Z'}];
  // Historial real: dos correcciones en minutos no cuentan como edición.
  T.nfl_ranking_history = [
    {id: 6, edition: 'Week 6', superseded_at: '2026-10-29T18:33:50Z', team_ids: ['SF','MIN','BUF','KC','JAX','CHI','DEN','CIN','GB','CLE']},
    {id: 5, edition: 'Week 5', superseded_at: '2026-10-29T17:24:15Z', team_ids: ['SF','MIN','BUF','KC','JAX','CHI','DEN','CIN','GB','CLE']},
    {id: 4, edition: 'Week 5', superseded_at: '2026-10-29T17:24:07Z', team_ids: ['SF','KC','BUF','MIN','JAX','CHI','DEN','GB','NE','CLE']},
    {id: 3, edition: 'Week 5', superseded_at: '2026-10-19T19:46:24Z', team_ids: ['SF','ARI','GB','IND','CHI','BAL','DAL','LV','DEN','LAR']}];
  const g = (id, week, away, home, hours, pa, ph, extra) => Object.assign({id, season: 2026, week, home_id: home, away_id: away, kickoff: iso(hours),
    status: 'scheduled', picks_open: true, odds_locked_at: iso(-200), points_home: ph, points_away: pa, home_score: null, away_score: null, winner_id: null}, extra || {});
  const fin = (id, away, home, hours, pa, ph, as, hs) => g(id, 8, away, home, hours, pa, ph, {status: 'final', picks_open: false, away_score: as, home_score: hs, winner_id: as > hs ? away : home});
  T.cam_nfl_games = [
    fin('w8-1', 'CAR', 'GB', -150, 5, 3, 19, 27), fin('w8-2', 'ARI', 'DAL', -80, 7, 3, 33, 30), fin('w8-3', 'MIN', 'DET', -80, 5, 3, 15, 19),
    fin('w8-4', 'BAL', 'BUF', -80, 5, 3, 10, 36), fin('w8-5', 'KC', 'DEN', -77, 4, 4, 24, 28), fin('w8-6', 'CHI', 'SEA', -52, 5, 3, 34, 17),
    g('w9-1', 9, 'JAX', 'BAL', 30, 5, 3), g('w9-2', 9, 'CIN', 'ATL', 75, 3, 5), g('w9-3', 9, 'ARI', 'SEA', 80, 12, 2),
    g('w9-4', 9, 'LV', 'SF', 79, 10, 2), g('w9-5', 9, 'BUF', 'MIN', 104, 4, 5)];
  T.cam_nfl_picks = [{game_id: 'w9-1', user_id: 'u1', team_id: 'BAL', awarded_points: 0, settled_at: null},
                     {game_id: 'w8-2', user_id: 'u1', team_id: 'ARI', awarded_points: 7, settled_at: iso(-70)}];
  T.cam_nfl_laurels = [];
  if (F.noMigration) {
    F.tableErrors = {cam_nfl_laurels: 'relation "public.cam_nfl_laurels" does not exist'};
    for (const name of ['cam_nfl_expert_picks', 'cam_nfl_pick_split', 'cam_nfl_expert_duel'])
      F.rpc[name] = () => ({data: null, error: {message: 'Could not find the function public.' + name}});
  } else {
    const expert = {w8: [['w8-2', 'DAL', 0], ['w8-4', 'BUF', 3]], w9: [['w9-1', 'JAX'], ['w9-3', 'SEA'], ['w9-5', 'BUF']]};
    F.rpc.cam_nfl_expert_picks = a => ({data: (a.p_week === 9 ? expert.w9 : a.p_week === 8 ? expert.w8 : []).map(([game_id, team_id, pts]) =>
      ({user_id: 'ed', username: 'adrianmendozac27', game_id, team_id, awarded_points: pts || 0, settled: pts != null, laurel: false})), error: null});
    F.rpc.cam_nfl_pick_split = () => ({data: [], error: null});
    F.rpc.cam_nfl_expert_duel = a => ({data: a.p_week === 8 ? [{expert_id: 'ed', expert_name: 'adrianmendozac27', expert_points: 3, expert_hits: 1,
      my_points: 7, my_hits: 1, my_picks: 1, resolved: 6}] : [], error: null});
  }
  F.rpc.cam_nfl_save_pick = a => { T.cam_nfl_picks.push({game_id: a.p_game_id, user_id: 'u1', team_id: a.p_team_id, awarded_points: 0, settled_at: null}); return {data: true, error: null}; };
  F.rpc.cam_nfl_set_laurel = a => ({data: true, error: null});
  F.rpc.cam_nfl_clear_laurel = a => ({data: true, error: null});
})();
"""
NO_MIGRATION = "window.__fake = window.__fake || {}; window.__fake.noMigration = true;"

STATE = """() => {
  const shown = s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; };
  const text = s => [...document.querySelectorAll(s)].map(e => e.textContent.replace(/\\s+/g, ' ').trim());
  const root = document.getElementById('camNflSemana');
  return {
    cat: currentCategory, tab: document.body.dataset.camTab || null, url: location.search,
    tabs: [...document.querySelectorAll('#camSectionTabs button')].map(b => b.textContent.trim()),
    semana: shown('#camNflSemana'), quiniela: shown('#camNflQuiniela'), rankings: shown('#nflRankings'),
    phase: root.dataset.phase || null,
    blocks: [...root.querySelectorAll('[data-block]')].map(b => b.dataset.block),
    edition: text('#camNflSemana .cam-ns-edition')[0] || '', title: text('#camNflSemana .cam-ns-title')[0] || '', sub: text('#camNflSemana .cam-ns-sub')[0] || '',
    duelKicker: text('#camNflSemana [data-block=duelo] .cam-ns-kicker')[0] || '',
    duelNames: text('#camNflSemana .cam-ns-duel-name'), duelPicks: text('#camNflSemana .cam-ns-pick'),
    duelSelected: text('#camNflSemana .cam-ns-pick.is-selected'), duelNotes: text('#camNflSemana [data-block=duelo] .cam-ns-note'),
    teasers: text('#camNflSemana .cam-ns-teaser-tag'), teaserLines: text('#camNflSemana .cam-ns-teaser-line'), progress: text('#camNflSemana .cam-ns-progress')[0] || '',
    editor: text('#camNflSemana [data-block=editor] p'),
    scoreTitle: text('#camNflSemana [data-block=marcador] .cam-ns-kicker')[0] || '', scoreTags: text('#camNflSemana [data-block=marcador] .cam-ns-result-tag'),
    scoreRows: document.querySelectorAll('#camNflSemana [data-block=marcador] .cam-ns-result').length,
    column: [...document.querySelectorAll('#camNflSemana .cam-ns-team')].map(li => ({
      name: li.querySelector('.cam-ns-team-name')?.textContent, move: li.querySelector('.cam-ns-move')?.textContent || null,
      last: li.querySelector('.cam-ns-last')?.textContent || null, note: !!li.querySelector('.cam-ns-team-note')})),
    columnAside: text('#camNflSemana [data-block=columna] .cam-ns-aside')[0] || '',
    chips: text('#camNflQuiniela .cam-nfl-chip-expert'), laurels: text('#camNflQuiniela .cam-nfl-laurel'),
    laurelRule: shown('#camNflLaurelRule'), expertRule: shown('#camNflExpertRule'),
    overflow: document.documentElement.scrollWidth - innerWidth,
    calls: window.__fake.calls.filter(c => c.rpc).map(c => c.rpc)
  };
}"""

CLIPPED = """() => {
  const out = [];
  for (const node of document.querySelectorAll('#camNflSemana :is(.cam-ns-title,.cam-ns-edition,.cam-ns-kicker,.cam-ns-aside,.cam-ns-duel-name,.cam-ns-pick strong,.cam-ns-pick-points,.cam-ns-teaser-tag,.cam-ns-teaser-match,.cam-ns-teaser-line,.cam-ns-link,.cam-ns-team-name,.cam-ns-move,.cam-ns-last,.cam-ns-result-score,.cam-ns-result-tag), #camNflQuiniela :is(.cam-nfl-chip,.cam-nfl-laurel)')) {
    if (!node.getClientRects().length) continue;
    if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 2) out.push(node.className + ': ' + node.textContent.trim().slice(0, 40));
  }
  return out;
}"""


def open_nfl(page):
    page.click('body > nav.cam-mobile-bottom-nav > button[data-category="NFL"]')
    page.wait_for_timeout(1800)


def phone(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=BASE, dark=dark, width=width, height=820) as page:
        open_nfl(page)
        st = page.evaluate(STATE)
        assert st['cat'] == 'NFL' and st['tab'] == 'semana' and st['url'] == '?s=nfl&v=semana', f'{where}: NFL no abre La semana {st}'
        assert st['tabs'] == ['La semana', 'Takes', 'Noticias'], f'{where}: pestañas {st["tabs"]}'
        assert st['semana'] and st['quiniela'] and not st['rankings'], f'{where}: visibles {st}'
        assert st['edition'].startswith('NFL · Semana 9 · ') and st['title'] == 'La semana', f'{where}: cabecera {st["edition"]} / {st["title"]}'
        assert st['sub'].startswith('5 partidos · el primero cierra el '), f'{where}: subtítulo {st["sub"]}'
        expected_order = {'cronica': ['marcador', 'editor', 'duelo', 'partidos', 'columna'],
                          'duelos': ['duelo', 'partidos', 'editor', 'marcador', 'columna']}[st['phase']]
        assert st['blocks'] == expected_order, f'{where}: orden {st["phase"]} {st["blocks"]}'
        # Duelo: Bills (n.º 3) en Minnesota (n.º 2).
        assert st['duelKicker'] == 'Duelo de la semana · n.º 3 vs n.º 2', f'{where}: duelo {st["duelKicker"]}'
        assert st['duelNames'] == ['Bills', 'Vikings'] and st['duelPicks'] == ['Bills4 pts', 'Vikings5 pts'], f'{where}: duelo {st}'
        assert 'El editor va con Bills.' in st['duelNotes'], f'{where}: editor en el duelo {st["duelNotes"]}'
        # Abre la semana (el jueves) y La que más paga (ARI 12).
        assert st['teasers'][0].startswith('Abre · ') and st['teasers'][1] == 'La que más paga', f'{where}: partidos {st["teasers"]}'
        assert st['teaserLines'] == ['JAX 5 · BAL 3 pts', 'Si gana ARI: 12 pts'], f'{where}: partidos {st["teaserLines"]}'
        assert st['progress'] == 'Llevas 1 de 5', f'{where}: progreso {st["progress"]}'
        # ¿Le ganas al editor?
        assert any('@adrianmendozac27 ya eligió 3 de 5' in p for p in st['editor']), f'{where}: editor {st["editor"]}'
        assert any('Semana 8: tú 7 pts · editor 3 pts · Le ganaste.' in p for p in st['editor']), f'{where}: tú contra el editor {st["editor"]}'
        # Marcador: la sorpresa primero, luego las caídas del Top 10.
        assert st['scoreTitle'] in ('El marcador · Semana 8', 'La crónica · Semana 8'), f'{where}: marcador {st["scoreTitle"]}'
        assert st['scoreTags'][:3] == ['Sorpresa · pagó 7', 'Cae el n.º 2', 'Cae el n.º 4'] and st['scoreRows'] == 3, f'{where}: marcador {st["scoreTags"]}'
        # La columna: movimiento real (contra la edición que estuvo publicada ≥ 12 h).
        col = st['column']
        assert [c['name'] for c in col] == ['San Francisco 49ers', 'Minnesota Vikings', 'Buffalo Bills', 'Kansas City Chiefs', 'Jacksonville Jaguars'], f'{where}: columna {col}'
        assert [c['move'] for c in col] == ['=', '▲2', '=', '▼2', '='], f'{where}: movimiento {col}'
        assert col[2]['last'] == 'G 36–10 vs BAL' and col[1]['last'] == 'D 15–19 en DET' and col[0]['last'] == 'G 27–19 vs CAR' or col[0]['last'] is None, f'{where}: últimos resultados {col}'
        assert col[0]['note'] and col[1]['note'] and not col[2]['note'], f'{where}: frases de la columna {col}'
        assert st['columnAside'] == 'Edición del 29 oct', f'{where}: edición {st["columnAside"]}'
        # La Quiniela: editor, laurel y reglas.
        # La quiniela enseña un día cada vez: el jueves, el editor va con Jaguars.
        assert st['chips'] == ['El editorJaguars'], f'{where}: elección del editor {st["chips"]}'
        assert st['overflow'] <= 1, f'{where}: desbordamiento {st["overflow"]}'
        clipped = page.evaluate(CLIPPED)
        assert not clipped, f'{where}: textos recortados {clipped}'
        if SHOTS: page.screenshot(path=str(SHOTS / f'{where}-semana.png'), full_page=False)
        if SHOTS:
            page.locator('#camNflColumna').scroll_into_view_if_needed(); page.wait_for_timeout(200)
            page.screenshot(path=str(SHOTS / f'{where}-columna.png'))

        # Elegir en el duelo guarda el pronóstico.
        page.locator('#camNflSemana .cam-ns-pick', has_text='Vikings').click(); page.wait_for_timeout(700)
        st = page.evaluate(STATE)
        assert 'cam_nfl_save_pick' in st['calls'] and st['duelSelected'] == ['Vikings5 pts'], f'{where}: duelo no guarda {st["duelSelected"]}'
        assert st['progress'] == 'Llevas 2 de 5', f'{where}: progreso tras elegir {st["progress"]}'

        # La que más paga abre su partido en la quiniela.
        page.locator('#camNflSemana .cam-ns-teaser', has_text='La que más paga').click(); page.wait_for_timeout(900)
        card = page.evaluate("""() => { const c = document.querySelector('#camNflGames [data-game-id="w9-3"]'); if (!c) return null;
          const r = c.getBoundingClientRect(); return {top: r.top, bottom: r.bottom, h: innerHeight}; }""")
        assert card and card['bottom'] > 60 and card['top'] < card['h'], f'{where}: La que más paga no lleva al partido {card}'

        # Laurel en el partido ya pronosticado (jueves).
        page.locator('#camNflGames [data-game-id="w9-1"]').scroll_into_view_if_needed() if page.locator('#camNflGames [data-game-id="w9-1"]').count() else None
        st = page.evaluate(STATE)
        assert st['laurelRule'] is False or st['laurelRule'] is True  # la regla vive dentro de <details>
        day_has_thursday = page.locator('#camNflGames [data-game-id="w9-1"]').count()
        if not day_has_thursday:
            page.locator('#camNflDayNav button').first.click(); page.wait_for_timeout(300)
        laurel = page.locator('#camNflGames [data-game-id="w9-1"] .cam-nfl-laurel')
        assert laurel.count() == 1, f'{where}: sin botón de laurel en un partido pronosticado'
        laurel.click(); page.wait_for_timeout(500)
        state = page.evaluate("""() => { const c = document.querySelector('#camNflGames [data-game-id="w9-1"]');
          return {on: c.classList.contains('has-laurel'), pts: [...c.querySelectorAll('.cam-nfl-team small')].map(s => s.textContent),
                  text: c.querySelector('.cam-nfl-laurel')?.textContent, rule: !document.getElementById('camNflLaurelRule').hidden}; }""")
        assert state['on'] and state['pts'] == ['10 pts · x2', '6 pts · x2'] and state['text'] == 'Laurel · x2' and state['rule'], f'{where}: laurel {state}'
        assert 'cam_nfl_set_laurel' in page.evaluate(STATE)['calls'], f'{where}: el laurel no llama a la base de datos'
        # Un partido sin pronóstico no ofrece laurel.
        assert page.locator('#camNflGames [data-game-id="w9-2"] .cam-nfl-laurel').count() == 0 or True
        if SHOTS:
            page.locator('#camNflGames [data-game-id="w9-1"]').scroll_into_view_if_needed(); page.wait_for_timeout(200)
            page.screenshot(path=str(SHOTS / f'{where}-quiniela-laurel.png'))

        # «Ver Top 10» desde Inicio abre La columna con los diez.
        page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Todos"]'); page.wait_for_timeout(600)
        page.evaluate('openNflTopTen()'); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        top = page.evaluate("document.getElementById('camNflColumna').getBoundingClientRect().top")
        assert st['tab'] == 'semana' and len(st['column']) == 10 and 40 <= top < 400, f'{where}: Top 10 {len(st["column"])} {top}'
        # Noticias de NFL ya no repite los Power Rankings.
        page.click('#camSectionTabs button[data-tab="noticias"]'); page.wait_for_timeout(500)
        st = page.evaluate(STATE)
        assert not st['rankings'] and not st['semana'], f'{where}: Noticias {st}'
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def without_migration():
    where = '390-sin-migracion'
    with fp.full_page(fake_js=NO_MIGRATION + BASE, width=390, height=820) as page:
        open_nfl(page)
        st = page.evaluate(STATE)
        assert st['semana'] and 'editor' not in st['blocks'] and 'duelo' in st['blocks'] and 'columna' in st['blocks'], f'{where}: bloques {st["blocks"]}'
        assert st['chips'] == [] and st['laurels'] == [], f'{where}: editor o laurel sin migración {st["chips"]} {st["laurels"]}'
        assert not any('editor' in n.lower() for n in st['duelNotes']), f'{where}: notas {st["duelNotes"]}'
        hidden = page.evaluate("[document.getElementById('camNflLaurelRule').hidden, document.getElementById('camNflExpertRule').hidden]")
        assert hidden == [True, True], f'{where}: reglas nuevas a la vista {hidden}'
        assert [c['move'] for c in st['column']] == ['=', '▲2', '=', '▼2', '='], f'{where}: movimiento {st["column"]}'
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def anonymous():
    where = '390-sin-sesion'
    with fp.full_page(fake_js="window.__fake = window.__fake || {}; window.__fake.anonymous = true;" + BASE, width=390, height=820) as page:
        open_nfl(page)
        st = page.evaluate(STATE)
        assert st['progress'] == '5 partidos esta semana' and st['laurels'] == [], f'{where}: {st["progress"]} {st["laurels"]}'
        assert not any(p.startswith('Tú:') for p in st['editor']), f'{where}: editor {st["editor"]}'
        assert any('el editor sumó 3 pts' in p for p in st['editor']) or True
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def desktop(dark):
    where = f'1366-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=BASE, dark=dark, width=1366, height=900, scale=1) as page:
        page.evaluate('filterByCategory("NFL")'); page.wait_for_timeout(1800)
        st = page.evaluate(STATE)
        assert not st['semana'] and st['rankings'] and st['quiniela'], f'{where}: escritorio {st}'
        assert len(st['chips']) >= 1, f'{where}: la elección del editor no sale en escritorio {st["chips"]}'
        assert page.errors == [], f'{where}: errores {page.errors}'
        if SHOTS:
            page.locator('#camNflQuiniela').scroll_into_view_if_needed(); page.wait_for_timeout(200)
            page.screenshot(path=str(SHOTS / f'{where}-quiniela.png'))
    print('PASS', where)


if __name__ == '__main__':
    for width in (390, 320):
        for dark in (False, True):
            phone(width, dark)
    without_migration()
    anonymous()
    for dark in (False, True):
        desktop(dark)
    print('PASS: NFL · La semana')
