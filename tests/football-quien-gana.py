"""Fútbol · «¿Quién gana?» como en NFL (13 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).
Champions, LaLiga y Premier enseñan La semana con el formato de NFL:
  · cabecera «La semana» con su filete, las ligas y «¿Quién gana?»;
  · el partido destacado en dos tarjetas grandes (local a la izquierda, visitante
    a la derecha) con escudo, nombre, «Local»/«Visitante» y la franja del color del
    club por fuera; sin puntos a la vista; «VS» en medio y el empate debajo;
  · un toque guarda (cam_football_save_pick), marca la opción con ✓ y dice hasta
    cuándo se puede cambiar; el empate también se guarda;
  · sin el panel de fondo de Fútbol, como NFL;
13 nov 2026 (noche): la Liga MX también (sin «2 pts»; la Liguilla sigue arriba).
Con el partido en juego o terminado, los goles van dentro de cada tarjeta
(Atlético 0 · Bayern 2) y no en una línea encima. «Ver mis jornadas» y «Mis grupos»
cierran La semana, debajo del marcador (en Liga MX solo «Mis grupos»).
Sin desbordes ni textos cortados a 320 y 390 px, de día y de noche; y en escritorio (1366 px).

Uso: python3 -B tests/football-quien-gana.py [--shots DIR]
"""
import importlib.util, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

FAKE = r"""
try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}
(() => {
  const f = window.__fake = window.__fake || {};
  f.user = {id:'u1', email:'u1@example.com', user_metadata:{username:'probador'}};
  const now = Date.now(), H = 36e5;
  const season = new Date().getUTCFullYear() - (new Date().getUTCMonth() < 6 ? 1 : 0);
  f.tables = f.tables || {};
  const T = [
   ['86','Real Madrid','RMA'],['83','Barcelona','BAR'],['1068','Atlético Madrid','ATM'],['94','Valencia','VAL'],['244','Real Betis','BET'],['243','Sevilla','SEV'],
   ['360','Manchester United','MUN'],['382','Manchester City','MNC'],['364','Liverpool','LIV'],['359','Arsenal','ARS'],['363','Chelsea','CHE'],['367','Tottenham Hotspur','TOT'],
   ['132','Bayern Munich','BAY'],['160','Paris Saint-Germain','PSG'],['111','Juventus','JUV'],['110','Internazionale','INT'],['124','Borussia Dortmund','BVB'],['103','AC Milan','MIL'],
   ['218','Cruz Azul','CAZ'],['227','América','AME']];
  f.tables.cam_football_teams = T.map(([id,name,abbr]) => ({id, name, short_name:name, abbreviation:abbr, logo:null}));
  const g = (id, comp, home, away, h, extra={}) => Object.assign({id, competition:comp, season, matchday:20, home_id:home, away_id:away,
    kickoff:new Date(now + h*H).toISOString(), status:'scheduled', home_score:null, away_score:null, outcome:null,
    odds_home:190, odds_draw:240, odds_away:130, probability_home:.4, probability_draw:.27, probability_away:.33,
    points_home:2, points_draw:2, points_away:2, odds_source:'prueba', odds_locked_at:new Date(now-H).toISOString(), picks_open:true}, extra);
  f.tables.cam_football_games = [
    g('9000001','laliga','83','86', 50), g('9000002','laliga','94','1068', 26), g('9000003','laliga','244','243', 74),
    g('9000011','premier','360','382', 52), g('9000012','premier','364','359', 28), g('9000013','premier','363','367', 76),
    g('9000021','champions','132','160', 120), g('9000022','champions','111','110', 120), g('9000023','champions','124','103', 144),
    g('9000031','ligamx','218','227', 30)];
  f.tables.cam_football_picks = [];
  f.rpc = f.rpc || {};
  f.rpc.cam_liguilla_state = () => ({data:null, error:null});
  f.rpc.cam_football_save_pick = a => { f.tables.cam_football_picks.push({game_id:a.p_game_id, user_id:'u1', pick:a.p_pick, awarded_points:0, settled_at:null}); return {data:true, error:null}; };
})();
"""

STATE = """() => {
  const root = document.getElementById('camFootballSemana');
  const duel = root.querySelector('[data-block=duelo]');
  const text = s => [...root.querySelectorAll(s)].map(e => e.textContent.replace(/\\s+/g, ' ').trim());
  const ft = getComputedStyle(document.getElementById('freeTakes'));
  return {
    cls: root.className, rule: !!root.querySelector('.cam-ns-head .cam-ns-rule'),
    title: text('[data-block=duelo] .cam-ns-step-title')[0] || '',
    duelText: duel ? duel.textContent.replace(/\\s+/g, ' ') : '',
    oldDuel: !!root.querySelector('.cam-ns-duel'), oldPicks: root.querySelectorAll('.cam-ns-pick').length,
    sides: [...root.querySelectorAll('.cam-ns-side')].map(b => {
      const cs = getComputedStyle(b);
      return {tag: b.tagName, side: b.dataset.side, name: b.querySelector('.cam-ns-side-name')?.textContent, sub: b.querySelector('.cam-ns-side-sub')?.textContent,
        pressed: b.getAttribute('aria-pressed'), selected: b.classList.contains('is-selected'), crest: !!b.querySelector('.cam-ns-crest'),
        left: cs.borderLeftWidth + ' ' + cs.borderLeftColor, right: cs.borderRightWidth + ' ' + cs.borderRightColor,
        h: Math.round(b.getBoundingClientRect().height), x: Math.round(b.getBoundingClientRect().left)};
    }),
    draw: (() => { const d = root.querySelector('.cam-ns-draw'); return d ? {tag: d.tagName, text: d.textContent.trim(), pressed: d.getAttribute('aria-pressed'), selected: d.classList.contains('is-selected'), h: Math.round(d.getBoundingClientRect().height)} : null; })(),
    hint: text('.cam-ns-hint')[0] || '',
    vs: text('.cam-ns-sides .cam-ns-at')[0] || '',
    panel: ft.backgroundImage === 'none' && ft.backgroundColor === 'rgba(0, 0, 0, 0)',
    days: !!document.querySelector('#camFootballDayNav .cam-nfl-day'),
    overflow: document.documentElement.scrollWidth - innerWidth,
    saves: window.__fake.calls.filter(c => c.rpc === 'cam_football_save_pick').map(c => c.args && c.args.p_pick)
  };
}"""

CLIPPED = """() => {
  const out = [];
  for (const node of document.querySelectorAll('#camFootballSemana :is(.cam-ns-title,.cam-ns-step-title,.cam-ns-side-name,.cam-ns-side-sub,.cam-ns-hint,.cam-ns-draw-label)')) {
    if (!node.getClientRects().length) continue;
    if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 2) out.push(node.className + ': ' + node.textContent.trim().slice(0, 40));
  }
  for (const node of document.querySelectorAll('#camFootballSemana :is(.cam-ns-side,.cam-ns-draw)')) {
    const r = node.getBoundingClientRect();
    if (r.height < 43.5) out.push('objetivo pequeño ' + node.className + ' ' + Math.round(r.height));
    if (r.right > innerWidth + 0.5 || r.left < -0.5) out.push('fuera ' + node.className);
  }
  return out;
}"""


def open_football(page, comp):
    page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Fútbol"]')
    page.wait_for_timeout(1800)
    if comp != 'ligamx':
        page.locator(f'#camFootballSemana [data-competition="{comp}"]').click()
        page.wait_for_timeout(900)


def shot(page, name):
    if SHOTS: page.locator('#camFootballSemana').screenshot(path=str(SHOTS / f'{name}.png'))


EXPECT = {'laliga': ('BAR', 'Barcelona', 'Real Madrid'), 'premier': ('LIV', 'Liverpool', 'Arsenal'), 'champions': ('BAY', 'Bayern Munich', 'Paris Saint-Germain')}


def phone(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=1000) as page:
        for comp, (_, home, away) in EXPECT.items():
            open_football(page, comp) if comp == 'laliga' else (page.locator(f'#camFootballSemana [data-competition="{comp}"]').click(), page.wait_for_timeout(900))
            st = page.evaluate(STATE)
            w = f'{where} {comp}'
            assert 'cam-fs-duelo' in st['cls'] and st['rule'], f'{w}: sin formato NFL {st["cls"]}'
            assert st['title'] == '¿Quién gana?', f'{w}: título {st["title"]}'
            assert not st['oldDuel'] and st['oldPicks'] == 0, f'{w}: queda el duelo viejo'
            assert [s['name'] for s in st['sides']] == [home, away], f'{w}: equipos {st["sides"]}'
            assert [s['sub'] for s in st['sides']] == ['Local', 'Visitante'], f'{w}: {st["sides"]}'
            assert all(s['tag'] == 'BUTTON' and s['crest'] and s['h'] >= 110 for s in st['sides']), f'{w}: tarjetas {st["sides"]}'
            assert st['sides'][0]['left'].startswith('4px') and st['sides'][1]['right'].startswith('4px'), f'{w}: franja {st["sides"]}'
            assert st['sides'][0]['x'] < st['sides'][1]['x'], f'{w}: orden'
            assert st['vs'] == 'VS' and st['draw'] and st['draw']['tag'] == 'BUTTON' and st['draw']['text'] == 'Empate', f'{w}: empate {st["draw"]}'
            assert 'pts' not in st['duelText'] and 'puntos' not in st['duelText'], f'{w}: muestra puntos {st["duelText"]}'
            assert st['hint'] == '', f'{w}: pista antes de elegir {st["hint"]}'
            assert st['panel'], f'{w}: queda el panel de fondo'
            assert st['days'], f'{w}: faltan los días de la quiniela debajo'
            assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'{w}: recortes {page.evaluate(CLIPPED)} {st["overflow"]}'
            assert page.errors == [], f'{w}: errores {page.errors}'
            shot(page, f'{where}-{comp}-1-antes')

        # LaLiga: el colores de club son distintos (Barça granate, Madrid oro).
        page.locator('#camFootballSemana [data-competition="laliga"]').click(); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert st['sides'][0]['left'] != st['sides'][1]['right'], f'{where}: mismos colores {st["sides"]}'
        # Elegir al visitante guarda y lo marca.
        page.locator('#camFootballSemana .cam-ns-side[data-side="away"]').click(); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert st['saves'][-1:] == ['away'], f'{where}: no guardó {st["saves"]}'
        assert [s['selected'] for s in st['sides']] == [False, True] and st['sides'][1]['pressed'] == 'true', f'{where}: elegido {st["sides"]}'
        assert st['hint'].startswith('Guardado. Puedes cambiarlo hasta'), f'{where}: pista {st["hint"]}'
        assert page.evaluate("document.activeElement?.dataset?.pick") == 'away', f'{where}: foco'
        shot(page, f'{where}-laliga-2-visitante')
        # El empate también se guarda.
        page.locator('#camFootballSemana .cam-ns-draw').click(); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert st['saves'][-1:] == ['draw'] and st['draw']['selected'] and st['draw']['pressed'] == 'true', f'{where}: empate {st}'
        assert not any(s['selected'] for s in st['sides']), f'{where}: equipo sigue marcado'
        assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'{where}: recortes tras elegir {page.evaluate(CLIPPED)}'
        shot(page, f'{where}-laliga-3-empate')

        # Liga MX: el mismo formato que las otras tres (tarjetas grandes, sin puntos).
        page.locator('#camFootballSemana [data-competition="ligamx"]').click(); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert 'cam-fs-duelo' in st['cls'] and st['rule'], f'{where}: Liga MX sin formato NFL {st["cls"]}'
        assert not st['oldDuel'] and st['oldPicks'] == 0, f'{where}: Liga MX conserva el duelo viejo'
        assert [s['name'] for s in st['sides']] == ['Cruz Azul', 'América'] and st['draw'], f'{where}: Liga MX {st["sides"]}'
        assert 'pts' not in st['duelText'] and 'puntos' not in st['duelText'], f'{where}: Liga MX muestra puntos {st["duelText"]}'
        assert st['sides'][0]['left'] != st['sides'][1]['right'], f'{where}: Liga MX sin colores de club {st["sides"]}'
        assert st['panel'], f'{where}: Liga MX conserva el panel de fondo'
        assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'{where}: Liga MX recortes {page.evaluate(CLIPPED)}'
        assert page.errors == [], f'{where}: errores {page.errors}'
        shot(page, f'{where}-ligamx')
    print('ok', where)


def desktop():
    with fp.full_page(fake_js=FAKE, dark=False, width=1366, height=900) as page:
        page.evaluate("window.filterByCategory && window.filterByCategory('Fútbol')"); page.wait_for_timeout(1800)
        page.locator('#camFootballSemana [data-competition="premier"]').first.click(); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert 'cam-fs-duelo' in st['cls'] and [s['name'] for s in st['sides']] == ['Liverpool', 'Arsenal'], f'escritorio: {st}'
        assert all(s['h'] >= 110 for s in st['sides']) and st['draw'], f'escritorio: tarjetas {st["sides"]}'
        assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'escritorio: recortes {page.evaluate(CLIPPED)}'
        assert page.errors == [], f'escritorio: errores {page.errors}'
        if SHOTS: page.screenshot(path=str(SHOTS / 'escritorio-premier.png'))
    print('ok escritorio')


# 13 nov 2026 (noche): marcador dentro de las tarjetas y accesos al final.
SCORED = FAKE.replace("g('9000021','champions','132','160', 120)",
    "g('9000021','champions','1068','132', -30, {status:'final', home_score:0, away_score:2, outcome:'away', picks_open:false})").replace(
    "g('9000022','champions','111','110', 120), g('9000023','champions','124','103', 144)",
    "g('9000022','champions','111','110', -28, {status:'final', home_score:1, away_score:1, outcome:'draw', picks_open:false}), g('9000023','champions','124','103', -26, {status:'final', home_score:3, away_score:1, outcome:'home', picks_open:false})").replace(
    "g('9000001','laliga','83','86', 50)", "g('9000001','laliga','83','86', -1, {status:'live', home_score:1, away_score:1, picks_open:false})").replace(
    "f.tables.cam_football_picks = [];", "f.tables.cam_football_picks = [{game_id:'9000021', user_id:'u1', pick:'away', awarded_points:2, settled_at:new Date(now-20*H).toISOString()}];")
assert SCORED.count("status:'final'") == 3 and "status:'live'" in SCORED

SCORE_STATE = """() => {
  const root = document.getElementById('camFootballSemana'), duel = root.querySelector('[data-block=duelo]');
  const shown = n => !!n && n.getClientRects().length > 0;
  const actions = document.getElementById('camFootballWeekActions'), body = document.getElementById('camFootballScoreBody');
  const visible = [...document.querySelectorAll('#freeTakes > *')].filter(shown);
  const hist = document.querySelector('#camFootballHistory button'), groups = document.getElementById('camPartyEntryQuinielaFootball');
  return {
    title: duel?.querySelector('.cam-ns-step-title')?.textContent || '',
    line: !!root.querySelector('.cam-ns-duel-score'),
    scores: [...root.querySelectorAll('.cam-ns-side')].map(t => t.querySelector('.cam-ns-side-score')?.textContent ?? null),
    cls: [...root.querySelectorAll('.cam-ns-side')].map(t => t.classList.contains('is-winner') ? 'gana' : t.classList.contains('is-loser') ? 'pierde' : ''),
    labels: [...root.querySelectorAll('.cam-ns-side')].map(t => t.getAttribute('aria-label')),
    mid: root.querySelector('.cam-ns-sides .cam-ns-at')?.textContent || '',
    hint: root.querySelector('.cam-ns-hint')?.textContent || '',
    sr: duel?.querySelector('.cam-ns-sr')?.textContent || '',
    afterBody: !!actions && !!body && actions.parentElement === body.parentElement && !!(body.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING),
    lastVisible: visible.length ? visible[visible.length - 1].id : null,
    histShown: shown(hist), histText: hist?.textContent || null, histInActions: !!hist && actions.contains(hist),
    groupsShown: shown(groups), groupsInActions: !!groups && actions.contains(groups),
    inQuiniela: !!document.querySelector('#camFootballQuiniela :is(#camFootballHistory,#camPartyEntryQuinielaFootball)'),
    quinielaShown: shown(document.getElementById('camFootballQuiniela')),
    actionsBelowScore: shown(actions) && actions.getBoundingClientRect().top >= body.getBoundingClientRect().bottom - 1,
    overflow: document.documentElement.scrollWidth - innerWidth
  };
}"""


def scored(width, dark):
    where = f'{width}-{"noche" if dark else "dia"} marcador'
    with fp.full_page(fake_js=SCORED, dark=dark, width=width, height=1000) as page:
        open_football(page, 'champions')
        st = page.evaluate(SCORE_STATE)
        assert st['title'] == '¿Quién ganó?' and not st['line'], f'{where}: línea del marcador encima {st}'
        assert st['scores'] == ['0', '2'] and st['cls'] == ['pierde', 'gana'] and st['mid'] == '–', f'{where}: marcador {st}'
        assert st['labels'] == ['Atlético Madrid, 0 goles', 'Bayern Munich, 2 goles, ganó, tu pick'], f'{where}: lectores {st["labels"]}'
        assert st['sr'] == 'Final: Atlético Madrid 0, Bayern Munich 2' and st['hint'] == 'Acertaste: Bayern Munich.', f'{where}: {st}'
        assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'{where}: recortes {page.evaluate(CLIPPED)}'
        # «Ver mis jornadas» y «Mis grupos»: al final de todo, debajo del marcador.
        assert st['afterBody'] and st['actionsBelowScore'] and st['lastVisible'] == 'camFootballScore', f'{where}: orden {st}'
        assert st['histShown'] and st['histText'] == 'Ver mis jornadas ›' and st['histInActions'], f'{where}: jornadas {st}'
        assert st['groupsShown'] and st['groupsInActions'] and not st['inQuiniela'], f'{where}: grupos {st}'
        shot(page, f'{where}-champions')
        # En juego: el marcador de ahora dentro de las tarjetas.
        page.locator('#camFootballSemana [data-competition="laliga"]').click(); page.wait_for_timeout(900)
        st = page.evaluate(SCORE_STATE)
        assert st['title'] == '¿Quién gana?' and not st['line'] and st['scores'] == ['1', '1'] and st['cls'] == ['', ''], f'{where}: en juego {st}'
        assert st['hint'] == 'En juego' and st['sr'].startswith('En juego: Barcelona 1'), f'{where}: en juego {st}'
        # Sin partido empezado: sin goles en las tarjetas.
        page.locator('#camFootballSemana [data-competition="premier"]').click(); page.wait_for_timeout(900)
        st = page.evaluate(SCORE_STATE)
        assert st['scores'] == [None, None] and st['mid'] == 'VS', f'{where}: premier {st}'
        # Liga MX: solo «Mis grupos» al final (sin jornadas regulares) y sin la tarjeta vacía de la quiniela en pausa.
        page.locator('#camFootballSemana [data-competition="ligamx"]').click(); page.wait_for_timeout(900)
        st = page.evaluate(SCORE_STATE)
        assert not st['histShown'] and st['groupsShown'] and st['groupsInActions'], f'{where}: Liga MX accesos {st}'
        assert not st['quinielaShown'] and st['lastVisible'] == 'camFootballScore', f'{where}: Liga MX orden {st}'
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('ok', where)


for width in (390, 320):
    for dark in (False, True):
        phone(width, dark)
        scored(width, dark)
desktop()
print('football-quien-gana: todo bien')
