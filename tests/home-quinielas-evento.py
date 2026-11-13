"""Inicio · «Quinielas» con evento especial (la Liguilla) y círculo en vez de «2 pts» (13 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).

Cubre:
  · sin evento: la sección se llama «Quinielas», tarjetas de partido con un círculo por
    resultado (3 en fútbol, 2 en NFL) y ningún «pts»;
  · paso 1 (Tus 8) sin elegir, a 320 y 390 px de día y de noche: «Quinielas · Evento
    especial / La Liguilla», 5 fijos con ✓ + 3 huecos «Elige», «Completar mis 8 ›»,
    «También en la quiniela» con la próxima cita de cada deporte; nada se sale ni se
    recorta; tipografías (Playfair en títulos, Inter en botones);
  · el botón lleva a Fútbol → Liga MX → La semana → #camLiguilla con el selector de «Tus 8» abierto; al volver a Inicio se
    relee el evento;
  · invitado con 1 elegido en el aparato → «Te faltan 2»; con cuenta y 8 guardados →
    «Tus 8 están listos» + «Guardado»; cerrado sin abrir → «Tu cuadro se abre pronto»;
  · paso 2 (cuadro abierto) → «Arma tu cuadro», 4 cruces en el orden 1-8, 4-5, 2-7, 3-6;
  · paso 3 (cuartos en juego) → «¿Quién pasa?» con la elección propia marcada;
  · campeón hace más de 4 días → vuelve la sección normal;
  · escritorio 1366: evento a la izquierda y «También en la quiniela» a la derecha.

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

FIXTURE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {}; F.lg = [];
  const MODE = %(mode)s, TEAMS = %(teams)s;
  const H = 36e5, D = 24 * H, now = Date.now(), iso = h => new Date(now + h * H).toISOString();
  const season = new Date().getUTCFullYear() - (new Date().getUTCMonth() < 6 ? 1 : 0);
  const t = F.tables;
  t.articles = [1, 2, 3].map(n => ({id: 'a000000' + n + '-0000-4000-8000-000000000000', title: 'Nota ' + n, category: n %% 2 ? 'Fútbol' : 'NFL',
    author: 'Eduard Carrera', image: '', summary: 'Resumen ' + n, body: '<p>Texto ' + n + '.</p>', featured: false,
    created_at: new Date(now - n * D).toISOString(), is_public: true, image_focus_x: 50, image_focus_y: 50}));
  const nfl = (id, h, a, hours) => ({id, season, week: 10, home_id: h, away_id: a, kickoff: iso(hours), status: 'scheduled', picks_open: true, odds_locked_at: iso(-100), points_home: 2, points_away: 2});
  t.cam_nfl_games = [nfl('n1', 'DET', 'NE', 60)];
  t.cam_football_games = [{id: 'f1', competition: 'ligamx', season, matchday: 20, home_id: '222', away_id: '220', kickoff: iso(26), status: 'scheduled',
    picks_open: true, odds_locked_at: iso(-100), points_home: 2, points_draw: 2, points_away: 2}];
  t.cam_football_teams = TEAMS.map(([id, name, abbr]) => ({id, name, short_name: name, abbreviation: abbr, logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png'}));
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
  const root = document.scrollingElement;
  // Texto recortado: cualquier elemento de texto de la sección cuyo contenido no cabe.
  const clipped = q('.cam-hj-ev-title, .cam-hj-ev-note, .cam-hj-ev-cta, .cam-hj-ev-step, .cam-hj-ev-badge, .cam-hj-other-match, .cam-hj-ev-side-name, .cam-hj-ev-long, .cam-hj-heading, .cam-hj-eyebrow, .cam-hj-more')
    .filter(e => vis(e) && e.clientWidth > 1 && (e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight + 2)).map(e => e.className + ':' + e.textContent.trim());
  const out = q('*').filter(vis).filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(e => e.className);
  return {
    on: document.body.classList.contains('cam-home-jornada'), shown: vis(sec), mode: sec?.dataset.mode || null,
    heading: txt('.cam-hj-heading'), eyebrow: vis(sec?.querySelector('.cam-hj-eyebrow')), more: txt('.cam-hj-more'),
    step: txt('.cam-hj-ev-step'), badge: txt('.cam-hj-ev-badge'), title: txt('.cam-hj-ev-title'), cta: txt('.cam-hj-ev-cta'),
    note: txt('.cam-hj-ev-note'), sub: txt('.cam-hj-ev-sub'),
    fixed: q('.cam-hj-ev-slot.is-fixed').length, mine: q('.cam-hj-ev-slot.is-mine').length, open: q('.cam-hj-ev-slot.is-open').length,
    rows: q('.cam-hj-ev-row').map(r => [...r.querySelectorAll('.cam-hj-ev-side-name')].map(n => n.textContent).join('-')),
    picked: q('.cam-hj-ev-side.is-mine .cam-hj-ev-side-name').map(n => n.textContent),
    status: q('.cam-hj-ev-status').map(n => n.textContent),
    others: q('.cam-hj-other-match').map(n => n.textContent),
    games: q('.cam-hj-game').map(g => g.querySelectorAll('.cam-hj-choice').length),
    pts: q('.cam-hj-pts').length + (sec ? (sec.textContent.match(/\\bpts\\b/g) || []).length : 0),
    circle: (() => { const c = sec?.querySelector('.cam-hj-choice'); if (!c) return null; const s = getComputedStyle(c); return [s.width, s.height, s.borderTopLeftRadius, s.borderTopWidth]; })(),
    fonts: (() => { const f = s => { const e = sec?.querySelector(s); return e ? getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '') : null; };
      return [f('.cam-hj-ev-title'), f('.cam-hj-ev-cta'), f('.cam-hj-ev-note'), f('.cam-hj-heading')]; })(),
    ctaSize: (() => { const e = sec?.querySelector('.cam-hj-ev-cta'); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
    slotMin: Math.min(...q('.cam-hj-ev-slot').map(e => e.getBoundingClientRect().width)),
    crests: q('.cam-hj-ev-crest img').map(i => i.complete && i.naturalWidth > 0).filter(Boolean).length,
    clipped, out: out.slice(0, 5), hscroll: root.scrollWidth > innerWidth + 1,
    calls: (window.__fake.lg || []).slice()
  };
}"""


def fixture(mode, user=False, saved=False, local=None):
    js = FIXTURE % {'mode': json.dumps(mode), 'teams': json.dumps(TEAMS)}
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
    # Sin evento la fila es un carrusel: sus tarjetas siguen fuera de la pantalla a propósito.
    assert not st['hscroll'] and (st['mode'] != 'event' or not st['out']), f'{where}: se sale {st["out"]} hscroll={st["hscroll"]}'
    assert st['pts'] == 0, f'{where}: aún se ven puntos'


# 1 · Paso 1 sin elegir: 320/390, día y noche
for width, dark in [(390, True), (390, False), (320, True)]:
    where = f'paso1-{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fixture('q8'), dark=dark, width=width, height=900) as page:
        st = open_home(page)
        assert st['on'] and st['shown'], f'{where}: no se ve {st}'
        assert st['mode'] == 'event' and st['heading'] == 'La Liguilla' and st['eyebrow'], f'{where}: cabecera {st}'
        assert st['more'] == 'Otras quinielas ›', f'{where}: enlace {st["more"]}'
        head_h = page.evaluate("document.querySelector('#camHomeJornada [data-row=jornada] .cam-hj-eyebrow').getBoundingClientRect().height")
        assert head_h < 18, f'{where}: el antetítulo ocupa dos líneas ({head_h})'
        assert st['step'] == 'Paso 1 de 3 · Tus 8' and st['badge'] == 'Cierra en 7 días', f'{where}: arriba {st["step"]} / {st["badge"]}'
        assert st['title'] == '¿Quiénes completan los 8?', f'{where}: título {st["title"]}'
        assert (st['fixed'], st['mine'], st['open']) == (5, 0, 3), f'{where}: huecos {st["fixed"], st["mine"], st["open"]}'
        assert st['cta'] == 'Completar mis 8 ›', f'{where}: botón {st["cta"]}'
        assert st['note'] == '5 ya están dentro. 9 equipos pelean por los 3 lugares que faltan.', f'{where}: nota {st["note"]}'
        assert st['others'] == ['Queretaro vs Monterrey', 'Patriots @ Lions'], f'{where}: otras {st["others"]}'
        assert st['fonts'][0] == 'Playfair Display' and st['fonts'][1] == 'Inter' and st['fonts'][2] == 'Inter', f'{where}: letras {st["fonts"]}'
        assert st['ctaSize'][1] >= 44, f'{where}: botón bajo {st["ctaSize"]}'
        assert st['slotMin'] >= 52, f'{where}: huecos estrechos {st["slotMin"]}'
        assert st['crests'] == 5, f'{where}: escudos sin pintar {st["crests"]}'
        assert st['calls'] == ['state', 'candidates'], f'{where}: llamadas {st["calls"]}'
        common(st, where)
        assert not page.errors, f'{where}: errores {page.errors}'
        shot(page, where)

        if width == 390 and dark:
            # El botón lleva a la Liguilla (Fútbol · Liga MX · La semana).
            page.click('#camHomeJornada .cam-hj-ev-cta')
            page.wait_for_function("() => { const s = document.getElementById('camLiguilla'); return s && !s.hidden && s.getClientRects().length; }", timeout=15000)
            page.wait_for_function("() => document.querySelector('#camLiguilla details.cam-lg-qualifiers')?.open", timeout=8000)
            page.wait_for_timeout(1500)
            info = page.evaluate("""() => { const d = document.querySelector('#camLiguilla details.cam-lg-qualifiers');
              return {cat: currentCategory, url: location.search, semana: !!document.querySelector('#camFootballSemana #camLiguilla'),
                comp: window.camFootballQuiniela?.snapshot?.()?.competition, open: d.open, top: Math.round(d.getBoundingClientRect().top)}; }""")
            assert info['cat'] == 'Fútbol' and info['url'] == '?s=futbol&v=semana' and info['semana'] and info['comp'] == 'ligamx', f'{where}: destino {info}'
            assert info['open'] and 0 <= info['top'] < 400, f'{where}: el selector de «Tus 8» debe quedar abierto y a la vista {info}'
            shot(page, where + '-liguilla', full=True)
            page.evaluate("window.__fake.lg.length = 0")
            page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Todos"]')
            page.wait_for_timeout(900)
            back = page.evaluate(STATE)
            assert back['shown'] and back['mode'] == 'event', f'{where}: al volver {back}'
            assert 'candidates' in back['calls'], f'{where}: al volver no se releyó {back["calls"]}'

# 2 · Invitado con 1 elegido en el aparato
with fp.full_page(fixture('q8', local=['218', '227', '219', '223', '216', '228']), dark=True) as page:
    st = open_home(page)
    assert st['title'] == 'Te faltan 2' and (st['fixed'], st['mine'], st['open']) == (5, 1, 2), f'local: {st}'
    common(st, 'local'); shot(page, 'paso1-a-medias')

# 3 · Con cuenta y 8 guardados
with fp.full_page(fixture('q8', user=True, saved=True), dark=True) as page:
    st = open_home(page)
    assert st['title'] == 'Tus 8 están listos' and st['badge'] == 'Guardado', f'guardado: {st}'
    assert (st['fixed'], st['mine'], st['open']) == (5, 3, 0) and st['cta'] == 'Ver mi liguilla ›', f'guardado: {st}'
    assert st['note'].startswith('Puedes cambiarlos hasta el '), f'guardado: {st["note"]}'
    common(st, 'guardado'); shot(page, 'paso1-guardado')

# 4 · Cerrado, a la espera del cuadro
with fp.full_page(fixture('closed'), dark=False) as page:
    st = open_home(page)
    assert st['title'] == 'Tu cuadro se abre pronto' and st['step'] == 'Paso 2 de 3 · Tu cuadro' and st['badge'].startswith('Se abre '), f'cerrado: {st}'
    assert st['open'] == 0 and st['cta'] == 'Ver la Liguilla ›', f'cerrado: {st}'
    common(st, 'cerrado'); shot(page, 'paso1-cerrado')

# 5 · Paso 2: el cuadro
with fp.full_page(fixture('bracket', user=True), dark=True) as page:
    st = open_home(page)
    assert st['title'] == 'Arma tu cuadro' and st['step'] == 'Paso 2 de 3 · Tu cuadro', f'cuadro: {st}'
    assert st['rows'] == ['Cruz Azul-Pachuca', 'Toluca-Atlas', 'América-León', 'Guadalajara-Santos'], f'cuadro: {st["rows"]}'
    assert st['picked'] == ['Cruz Azul', 'Atlas'] and st['note'].startswith('2 de 7'), f'cuadro: {st["picked"]} {st["note"]}'
    assert st['cta'] == 'Seguir con mi cuadro ›', f'cuadro: {st["cta"]}'
    common(st, 'cuadro'); shot(page, 'paso2-cuadro')

# 6 · Paso 3: ronda a ronda
with fp.full_page(fixture('rounds', user=True), dark=True, width=320) as page:
    st = open_home(page)
    assert st['title'] == '¿Quién pasa?' and st['badge'] == 'Cuartos de final', f'rondas: {st}'
    assert len(st['rows']) == 4 and st['picked'] == ['Pachuca'], f'rondas: {st["rows"]} {st["picked"]}'
    assert all(s.startswith('Ida · ') for s in st['status']), f'rondas: {st["status"]}'
    common(st, 'rondas'); shot(page, 'paso3-rondas')

# 7 · Campeón de hace más de 4 días y sin «Tus 8» nuevo → sección normal con círculos
for mode in ['champ', 'none']:
    with fp.full_page(fixture(mode), dark=True) as page:
        st = open_home(page)
        assert st['mode'] is None and st['heading'] == 'Quinielas' and not st['eyebrow'], f'{mode}: {st}'
        assert st['more'] == 'Ver partidos ›', f'{mode}: {st["more"]}'
        assert sorted(st['games']) == [2, 3], f'{mode}: círculos {st["games"]}'
        w, h, radius, border = st['circle']
        assert w == h == '18px' and radius == '50%' and border in ('1px', '1.5px'), f'{mode}: círculo {st["circle"]}'
        common(st, mode)
        if mode == 'none': shot(page, 'sin-evento')

# 8 · Escritorio
with fp.full_page(fixture('q8'), dark=True, width=1366, height=900, scale=1) as page:
    st = open_home(page)
    assert st['mode'] == 'event' and st['title'] == '¿Quiénes completan los 8?', f'escritorio: {st}'
    pos = page.evaluate("""() => [...document.querySelectorAll('#camHomeJornada [data-row=jornada] .cam-hj-item')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; })""")
    assert len(pos) == 2 and pos[1][0] > pos[0][0] and abs(pos[0][1] - pos[1][1]) < 4, f'escritorio: posiciones {pos}'
    common(st, 'escritorio'); shot(page, 'escritorio')
    assert not page.errors, f'escritorio: errores {page.errors}'

print('home-quinielas-evento: OK')
