"""Inicio · «Quinielas» con la Liguilla como primera tarjeta del carrusel y círculo en vez de «2 pts» (13 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).

Cubre:
  · la sección se llama siempre «Quinielas» («Ver partidos ›»), sin antetítulo, sin «La Liguilla»,
    sin «Paso 1 de 3», sin «Cierra en…», sin notas: solo escudos, «?» y el botón;
  · el carrusel: la tarjeta de la Liguilla primero («¿Quiénes crees que serán el top 8?»), el
    separador «Participa en la quiniela de otras ligas» y después la próxima cita de cada liga
    (Liga MX, Champions, LaLiga, Premier, NFL), cada resultado con su círculo y sin «pts»;
  · paso 1 (Tus 8) a 320 y 390 px de día y de noche: 5 escudos + 3 «?», «Completar mis 8 ›»,
    tarjeta pequeña (236 px de ancho, como mucho ~230 de alto), nada recortado;
  · el botón (y un «?») lleva a Fútbol → Liga MX → La semana → #camLiguilla con el selector de
    «Tus 8» abierto; al volver a Inicio se relee el evento;
  · invitado con 1 elegido → «Te faltan 2»; con cuenta y 8 guardados → «Tus 8 están listos»
    y «Ver mi liguilla ›»; cerrado sin abrir → «Tu cuadro se abre pronto»;
  · paso 2 → «Arma tu cuadro» con 4 cruces y 2 propios marcados; paso 3 → «¿Quién pasa?»;
  · campeón de hace más de 4 días o sin liguilla → solo los partidos;
  · escritorio 1366: la tarjeta en la rejilla con los partidos, sin desbordes.

Uso: python3 -B tests/home-quinielas-evento.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

TEAMS = [['218', 'Cruz Azul', 'CAZ', 'in'], ['227', 'América', 'AME', 'in'], ['219', 'Guadalajara', 'GDL', 'in'],
         ['223', 'Toluca', 'TOL', 'in'], ['216', 'Atlas', 'ATS', 'in'], ['225', 'Santos', 'SAN', 'alive'],
         ['228', 'León', 'LEO', 'alive'], ['234', 'Pachuca', 'PAC', 'alive'], ['10125', 'Tijuana', 'TIJ', 'alive'],
         ['220', 'Monterrey', 'MTY', 'alive'], ['233', 'UNAM', 'UNAM', 'alive'], ['222', 'Queretaro', 'QRO', 'alive'],
         ['231', 'Puebla', 'PUE', 'alive'], ['15720', 'Atl. San Luis', 'ASL', 'alive'], ['232', 'Tigres', 'UANL', 'out'],
         ['226', 'Atlante', 'ATL', 'out'], ['229', 'Necaxa', 'NCX', 'out'], ['17851', 'Juárez', 'JUA', 'out']]
OTHERS = [['86', 'Real Madrid', 'RMA'], ['83', 'Barcelona', 'BAR'], ['364', 'Liverpool', 'LIV'], ['360', 'Manchester United', 'MUN'],
          ['160', 'PSG', 'PSG'], ['132', 'Bayern Munich', 'BAY']]

FIXTURE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {}; F.lg = [];
  const MODE = %(mode)s, TEAMS = %(teams)s, OTHERS = %(others)s;
  const H = 36e5, D = 24 * H, now = Date.now(), iso = h => new Date(now + h * H).toISOString();
  const season = new Date().getUTCFullYear() - (new Date().getUTCMonth() < 6 ? 1 : 0);
  const t = F.tables;
  t.articles = [1, 2, 3].map(n => ({id: 'a000000' + n + '-0000-4000-8000-000000000000', title: 'Nota ' + n, category: n %% 2 ? 'Fútbol' : 'NFL',
    author: 'Eduard Carrera', image: '', summary: 'Resumen ' + n, body: '<p>Texto ' + n + '.</p>', featured: false,
    created_at: new Date(now - n * D).toISOString(), is_public: true, image_focus_x: 50, image_focus_y: 50}));
  const nfl = (id, h, a, hours) => ({id, season, week: 10, home_id: h, away_id: a, kickoff: iso(hours), status: 'scheduled', picks_open: true, odds_locked_at: iso(-100), points_home: 2, points_away: 2});
  t.cam_nfl_games = [nfl('n1', 'DET', 'NE', 60)];
  const fb = (id, competition, home_id, away_id, hours) => ({id, competition, season, matchday: 20, home_id, away_id, kickoff: iso(hours), status: 'scheduled',
    picks_open: true, odds_locked_at: iso(-100), points_home: 2, points_draw: 2, points_away: 2});
  t.cam_football_games = [fb('f1', 'ligamx', '222', '220', 26), fb('f2', 'champions', '160', '132', 30), fb('f3', 'laliga', '86', '83', 40),
    fb('f4', 'premier', '364', '360', 50), fb('f5', 'ligamx', '225', '228', 70)];
  t.cam_football_teams = TEAMS.concat(OTHERS).map(([id, name, abbr]) => ({id, name, short_name: name, abbreviation: abbr, logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png'}));
  F.rpc.ae_public_take_feed = () => ({data: [], error: null});
  F.rpc.ae_public_take_reply_counts = () => ({data: [], error: null});
  const cand = TEAMS.map(([id, name, abbr, status], i) => ({team_id: id, name, short_name: name, abbreviation: abbr,
    logo: i %% 2 ? 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png' : null, rank: i + 1, played: 16, points: 32 - i, goal_diff: 0, status}));
  const closes = MODE === 'closed' ? now - 3 * H : now + 7 * D;
  const win = {id: 3, name: 'Apertura ' + season, season, closes_at: new Date(closes).toISOString(), open: MODE === 'q8', opened: ['bracket', 'rounds', 'champ'].includes(MODE), server_time: new Date().toISOString()};
  const seeds = TEAMS.slice(0, 8).map(([id, name, abbr], i) => ({seed: i + 1, team_id: id, name, short_name: name, abbreviation: abbr, logo: null, played: 17, points: 30 - i, goal_diff: 5}));
  const leg = (id, h, a, hours) => ({id, kickoff: iso(hours), status: 'scheduled', home_id: h, away_id: a});
  const series = [[1, 8], [2, 7], [3, 6], [4, 5]].map(([hi, lo], i) => ({id: 100 + i, round: 'qf', slot: i, high_id: TEAMS[hi - 1][0], low_id: TEAMS[lo - 1][0],
    status: MODE === 'champ' ? 'decided' : 'open', winner_id: MODE === 'champ' ? TEAMS[hi - 1][0] : null,
    legs: [leg('l' + i, TEAMS[lo - 1][0], TEAMS[hi - 1][0], 30 + i), leg('m' + i, TEAMS[hi - 1][0], TEAMS[lo - 1][0], 100 + i)]}));
  if (MODE === 'champ') series.push({id: 300, round: 'final', slot: 0, high_id: '218', low_id: '227', status: 'decided', winner_id: '218',
    legs: [leg('x1', '227', '218', -10 * 24), leg('x2', '218', '227', -7 * 24)]});
  const state = {liguilla: {id: 7, name: 'Apertura ' + season, season, open: MODE === 'bracket',
      closes_at: new Date(MODE === 'bracket' ? now + 2 * D : now - D).toISOString(), starts_at: iso(-30)},
    seeds, odds: [], series, players: 0,
    mine: F.user ? {bracket: [{stage: 'semis', slot: 0, team_id: '218', points: 2}, {stage: 'semis', slot: 3, team_id: '216', points: 4}],
      series: [{series_id: 100, team_id: '234'}]} : null};
  F.rpc.cam_liguilla_state = a => { F.lg.push('state'); return {data: ['bracket', 'rounds', 'champ'].includes(MODE) ? state : null, error: null}; };
  F.rpc.cam_liguilla_candidates = a => { F.lg.push('candidates');
    if (MODE === 'none') return {data: null, error: null};
    return {data: {window: win, teams: cand, players: 0, mine: F.user && F.saved ? ['218', '227', '219', '223', '216', '225', '228', '234'] : null}, error: null}; };
})();
"""

STATE = """() => {
  const sec = document.querySelector('#camHomeJornada [data-row=jornada]');
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const q = s => sec ? [...sec.querySelectorAll(s)] : [];
  const txt = s => { const e = sec && sec.querySelector(s); return e ? e.textContent.trim() : null; };
  const card = sec && sec.querySelector('.cam-hj-ev');
  const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const clipped = q('.cam-hj-ev-kicker, .cam-hj-ev-title, .cam-hj-ev-cta, .cam-hj-heading, .cam-hj-more, .cam-hj-pick-name, .cam-hj-sep-text')
    .filter(e => vis(e) && e.clientWidth > 1 && (e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight + 2)).map(e => e.className + ':' + e.textContent.trim());
  const items = q('.cam-hj-item');
  const root = document.scrollingElement;
  return {
    on: document.body.classList.contains('cam-home-jornada'), shown: vis(sec), event: sec?.dataset.event || null,
    heading: txt('.cam-hj-heading'), more: txt('.cam-hj-more'),
    order: items.map(i => i.querySelector('.cam-hj-ev') ? 'evento' : i.querySelector('.cam-hj-sep') ? 'separador' : (i.querySelector('.cam-hj-league')?.textContent || '?')),
    sep: txt('.cam-hj-sep-text'), sepBox: box(sec?.querySelector('.cam-hj-sep')), rowBox: box(sec?.querySelector('.cam-hj-row')),
    kicker: txt('.cam-hj-ev-kicker'), title: txt('.cam-hj-ev-title'), cta: txt('.cam-hj-ev-cta'),
    fixed: q('.cam-hj-ev-slot.is-fixed').length, mine: q('.cam-hj-ev-slot.is-mine').length, open: q('.cam-hj-ev-slot.is-open').length,
    openButtons: q('button.cam-hj-ev-slot.is-open').length,
    slotBoxes: [...new Set(q('.cam-hj-ev-slot').map(e => box(e).join('x')))],
    pairs: q('.cam-hj-ev-pair').length, pairMine: q('.cam-hj-ev-side.is-mine').length, champ: txt('.cam-hj-ev-champ-name'),
    cardText: card ? card.innerText : '', sectionText: sec ? sec.innerText : '',
    card: box(card), firstGame: box(sec?.querySelector('.cam-hj-game')),
    games: q('.cam-hj-game').map(g => g.querySelectorAll('.cam-hj-choice').length),
    pts: (sec ? (sec.textContent.match(/\\bpts\\b/g) || []).length : 0) + q('.cam-hj-pts').length,
    circle: (() => { const c = sec?.querySelector('.cam-hj-choice'); if (!c) return null; const s = getComputedStyle(c); return [s.width, s.height, s.borderTopLeftRadius]; })(),
    fonts: (() => { const f = s => { const e = sec?.querySelector(s); return e ? getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '') : null; };
      return [f('.cam-hj-ev-title'), f('.cam-hj-ev-cta'), f('.cam-hj-ev-kicker')]; })(),
    cta: txt('.cam-hj-ev-cta'), ctaBox: box(sec?.querySelector('.cam-hj-ev-cta')),
    crests: q('.cam-hj-ev-crest img').filter(i => i.complete && i.naturalWidth > 0).length,
    clipped, hscroll: root.scrollWidth > innerWidth + 1,
    calls: (window.__fake.lg || []).slice()
  };
}"""


def fixture(mode, user=False, saved=False, local=None):
    js = FIXTURE % {'mode': json.dumps(mode), 'teams': json.dumps(TEAMS), 'others': json.dumps(OTHERS)}
    if user:
        js = "window.__fake.user = {id: 'u-1', email: 'qa@example.com', user_metadata: {username: 'QA'}};" + js
    if saved:
        js = "window.__fake.saved = true;" + js
    if local:
        js += "try { localStorage.setItem('cam:liguilla:mis8:anon:3', JSON.stringify(%s)); } catch (e) {}" % json.dumps(local)
    return js


def open_home(page):
    page.wait_for_function("() => { const s = document.querySelector('#camHomeJornada [data-row=jornada]'); return s && !s.hidden; }", timeout=15000)
    page.wait_for_timeout(500)
    return page.evaluate(STATE)


def shot(page, name, full=False):
    if not SHOTS: return
    sec = page.query_selector('#camHomeJornada [data-row=jornada]')
    if full or not sec: page.screenshot(path=str(SHOTS / (name + '.png')), full_page=False)
    else:
        sec.scroll_into_view_if_needed(); page.wait_for_timeout(200)
        sec.screenshot(path=str(SHOTS / (name + '.png')))


def common(st, where):
    assert not st['clipped'], f'{where}: texto recortado {st["clipped"]}'
    assert not st['hscroll'], f'{where}: la página se sale de lado'
    assert st['pts'] == 0, f'{where}: aún se ven puntos'
    assert st['heading'] == 'Quinielas' and st['more'] == 'Ver partidos ›', f'{where}: cabecera {st["heading"]} / {st["more"]}'
    for gone in ['Evento especial', 'La Liguilla', 'Paso ', 'Cierra', 'ya están dentro', 'pelean', 'Después armas', 'También en la quiniela']:
        assert gone not in st['sectionText'], f'{where}: sigue el texto «{gone}»'
    assert all(n in (2, 3) for n in st['games']), f'{where}: círculos {st["games"]}'


LEAGUES = ['LIGA MX', 'CHAMPIONS', 'LALIGA', 'PREMIER', 'NFL · SEMANA 10']

# 1 · Paso 1 sin elegir: 320/390, día y noche
for width, dark in [(390, True), (390, False), (320, True)]:
    where = f'paso1-{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fixture('q8'), dark=dark, width=width, height=900) as page:
        st = open_home(page)
        assert st['on'] and st['shown'] and st['event'] == 'liguilla', f'{where}: no se ve {st}'
        assert [o.upper() for o in st['order']] == ['EVENTO', 'SEPARADOR'] + LEAGUES, f'{where}: carrusel {st["order"]}'
        assert st['kicker'] == 'Liga MX' and st['title'] == '¿Quiénes crees que serán el top 8?', f'{where}: {st["kicker"]} / {st["title"]}'
        assert st['sep'] == 'Participa en la quiniela de otras ligas' and st['sepBox'][0] == 112, f'{where}: separador {st["sep"]} {st["sepBox"]}'
        assert (st['fixed'], st['mine'], st['open'], st['openButtons']) == (5, 0, 3, 3), f'{where}: huecos {st}'
        assert st['cta'] == 'Completar mis 8 ›', f'{where}: botón {st["cta"]}'
        assert st['slotBoxes'] == ['32x32'], f'{where}: escudos y «?» deben ser círculos iguales {st["slotBoxes"]}'
        assert st['card'][0] == 236 and st['card'][1] <= 256, f'{where}: la tarjeta no es pequeña {st["card"]}'
        assert st['fonts'] == ['Playfair Display', 'Inter', 'Inter'], f'{where}: letras {st["fonts"]}'
        assert st['ctaBox'][1] >= 40, f'{where}: botón bajo {st["ctaBox"]}'
        assert st['crests'] == 5, f'{where}: escudos sin pintar {st["crests"]}'
        assert st['calls'] == ['state', 'candidates'], f'{where}: llamadas {st["calls"]}'
        common(st, where)
        assert not page.errors, f'{where}: errores {page.errors}'
        shot(page, where)

        if width == 390 and dark:
            for target in ['.cam-hj-ev-cta', 'button.cam-hj-ev-slot.is-open']:
                page.click('#camHomeJornada ' + target)
                page.wait_for_function("() => document.querySelector('#camLiguilla details.cam-lg-qualifiers')?.open", timeout=8000)
                page.wait_for_timeout(1500)
                info = page.evaluate("""() => { const d = document.querySelector('#camLiguilla details.cam-lg-qualifiers');
                  return {cat: currentCategory, url: location.search, semana: !!document.querySelector('#camFootballSemana #camLiguilla'),
                    comp: window.camFootballQuiniela?.snapshot?.()?.competition, open: d.open, top: Math.round(d.getBoundingClientRect().top)}; }""")
                assert info['cat'] == 'Fútbol' and info['url'] == '?s=futbol&v=semana' and info['semana'] and info['comp'] == 'ligamx', f'{where} {target}: destino {info}'
                assert info['open'] and 0 <= info['top'] < 400, f'{where} {target}: el selector de «Tus 8» debe quedar abierto y a la vista {info}'
                if target == '.cam-hj-ev-cta': shot(page, where + '-liguilla', full=True)
                page.evaluate("window.__fake.lg.length = 0; document.querySelector('#camLiguilla details.cam-lg-qualifiers').open = false")
                page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Todos"]')
                page.wait_for_timeout(900)
                back = page.evaluate(STATE)
                assert back['shown'] and back['event'] == 'liguilla', f'{where}: al volver {back}'
                assert 'candidates' in back['calls'], f'{where}: al volver no se releyó {back["calls"]}'

# 2 · Invitado con 1 elegido en el aparato
with fp.full_page(fixture('q8', local=['218', '227', '219', '223', '216', '228']), dark=True) as page:
    st = open_home(page)
    assert st['title'] == 'Te faltan 2' and (st['fixed'], st['mine'], st['open']) == (5, 1, 2), f'local: {st}'
    common(st, 'local'); shot(page, 'paso1-a-medias')

# 3 · Con cuenta y 8 guardados
with fp.full_page(fixture('q8', user=True, saved=True), dark=False) as page:
    st = open_home(page)
    assert st['title'] == 'Tus 8 están listos' and (st['fixed'], st['mine'], st['open']) == (5, 3, 0), f'guardado: {st}'
    assert st['cta'] == 'Ver mi liguilla ›', f'guardado: {st["cta"]}'
    common(st, 'guardado'); shot(page, 'paso1-guardado-dia')

# 4 · Cerrado, a la espera del cuadro
with fp.full_page(fixture('closed'), dark=True) as page:
    st = open_home(page)
    assert st['title'] == 'Tu cuadro se abre pronto' and st['open'] == 3 and st['openButtons'] == 0, f'cerrado: {st}'
    assert st['cta'] == 'Ver la Liguilla ›', f'cerrado: {st["cta"]}'
    common(st, 'cerrado'); shot(page, 'paso1-cerrado')

# 5 · Paso 2: el cuadro
with fp.full_page(fixture('bracket', user=True), dark=True) as page:
    st = open_home(page)
    assert st['title'] == 'Arma tu cuadro' and st['pairs'] == 4 and st['pairMine'] == 2, f'cuadro: {st}'
    assert st['cta'] == 'Seguir con mi cuadro ›' and st['card'][1] <= 256, f'cuadro: {st["cta"]} {st["card"]}'
    common(st, 'cuadro'); shot(page, 'paso2-cuadro')

# 6 · Paso 3: ronda a ronda
with fp.full_page(fixture('rounds', user=True), dark=True, width=320) as page:
    st = open_home(page)
    assert st['title'] == '¿Quién pasa?' and st['kicker'] == 'Liga MX · Cuartos', f'rondas: {st}'
    assert st['pairs'] == 4 and st['pairMine'] == 1, f'rondas: {st["pairs"]} {st["pairMine"]}'
    common(st, 'rondas'); shot(page, 'paso3-rondas')

# 7 · Campeón de hace más de 4 días o sin liguilla → solo los partidos, con círculos
for mode in ['champ', 'none']:
    with fp.full_page(fixture(mode), dark=True) as page:
        st = open_home(page)
        assert st['event'] is None and [o.upper() for o in st['order']] == LEAGUES, f'{mode}: {st["order"]}'
        w, h, radius = st['circle']
        assert w == h == '18px' and radius == '50%', f'{mode}: círculo {st["circle"]}'
        common(st, mode)
        if mode == 'none': shot(page, 'sin-evento')

# 8 · Escritorio
with fp.full_page(fixture('q8'), dark=True, width=1366, height=900, scale=1) as page:
    st = open_home(page)
    assert st['event'] == 'liguilla' and st['order'][:2] == ['evento', 'separador'], f'escritorio: {st["order"]}'
    assert abs(st['sepBox'][0] - st['rowBox'][0]) <= 6 and st['sepBox'][1] < 50, f'escritorio: el separador debe cruzar la fila {st["sepBox"]} {st["rowBox"]}'
    common(st, 'escritorio'); shot(page, 'escritorio')
    assert not page.errors, f'escritorio: errores {page.errors}'

print('home-quinielas-evento: OK')
