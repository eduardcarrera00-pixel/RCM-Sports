"""Perfil con resumen («Perfil») y pestaña «Mi Party» (con «Mis jornadas»).

Página completa en Chromium con tests/full-page.py y el Supabase falso de
tests/fake-supabase.js (sin red). Las reglas reales de los datos
(cam_profile_overview y cam_profile_party) se prueban en SQL con
tests/parties-sql.sh; aquí se imitan para probar la interfaz.

Cubre, a 320, 390 y 1366 px, de día y de noche:
  · el perfil abre en «Perfil» desde la barra inferior (o el botón de la
    cabecera en ordenador), desde el @autor de un Take y desde ?perfil=<id>;
  · ?perfil=<id>&tab=takes|picks|party abre esa pestaña; cambiar de pestaña
    actualiza la dirección sin sumar pasos al botón Atrás;
  · una sola llamada por pestaña: el resumen no carga Takes ni Picks;
  · tarjetas: mejor Take y mejor Pick, y sus alternativas («Take más
    apoyado», «Último Pick»); mercado traducido, nunca en bruto;
  · líneas de quiniela y de party; la tarjeta lleva a «Mi Party», con «Mis
    jornadas» al final (?tab=quiniela y «Ver mis jornadas» también);
  · cabecera: lo que destaca de cada uno, «Invitar a mi party» en un perfil
    ajeno (compartir como icono) y el foco en el nombre, no en cerrar;
  · el Take con sus primeras líneas y votos; «Su Take» si nadie lo apoyó;
    campeones elegidos; la quiniela primero si va en el podio;
  · «Primeros pasos» en el perfil propio en lugar de tarjetas vacías; del
    público no se muestran (si no hay nada, «@usuario todavía no ha
    participado»);
  · Mi Party: invitación a una party de quiniela, «Tus parties de quiniela»,
    Mi quiniela compacta, Otros parties y la línea del perfil público;
  · cabecera + resumen ≤ 1,5 pantallas y Mi Party ≤ 2 pantallas a 390×844;
  · sin errores de consola ni textos cortados.

Uso: python3 -B tests/profile-overview.py [--shots DIR] [--only 390-dia]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

U = {'ana': 'a0000000-0000-4000-8000-000000000001', 'beto': 'b0000000-0000-4000-8000-000000000002',
     'carla': 'c0000000-0000-4000-8000-000000000003', 'dani': 'd0000000-0000-4000-8000-000000000004',
     'eva': 'e0000000-0000-4000-8000-000000000005'}

MODEL = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
const F = window.__fake; F.rpc = F.rpc || {}; F.tables = F.tables || {};
const U = %(users)s;
const NAMES = {[U.ana]: 'ana_futbolera', [U.beto]: 'beto_crack', [U.carla]: 'carla', [U.dani]: 'dani', [U.eva]: 'eva_nfl'};
const D = d => new Date(Date.now() - d * 864e5).toISOString();
const ok = data => ({data, error: null});
const me = () => F.user?.id || null;
F.user = F.start ? {id: U[F.start], is_anonymous: false, created_at: '2026-10-12T15:00:00Z', user_metadata: {username: NAMES[U[F.start]]}} : null;
const take = (id, title, extra) => Object.assign({id, title, sport: 'champions', competition: 'Champions League',
  body: 'Con Mbappé en este nivel no hay rival en Europa.', created_at: D(18), upvotes: 9, downvotes: 2, my_vote: null}, extra || {});
const OVERVIEW = {
  // Ana: con datos (mejor Take y mejor Pick).
  [U.ana]: {user_id: U.ana, username: 'ana_futbolera', joined_month: '2026-10',
    takes: {count: 12, up: 40, down: 10, top: take('d1000000-0000-4000-8000-000000000001',
      'El Madrid gana la Champions con Mbappé de figura y Vinícius de socio de lujo en cada partido', {kind: 'best', type: 'take', points: 13})},
    picks: {count: 8, won: 5, lost: 3, top: {kind: 'best', id: 'c1000000-0000-4000-8000-000000000001', title: 'Barça gana',
      legs: [{event: 'Barcelona vs Sevilla', selection: 'Barcelona · MONEYLINE (3-WAY)', sport: 'Fútbol'}],
      american_odds: 240, result_points: 2.4, outcome: 'won', created_at: D(5)}},
    quiniela: {nfl: {position: 4, of: 12, points: 28, hits: 7, resolved: 12}, football: {position: 2, of: 7, points: 10, hits: 3, resolved: 5},
      parties: [{id: 'f1000000-0000-4000-8000-000000000001', name: 'Los Compas', sport: 'all', position: 1, member_count: 5}]}},
  // Beto: sin aciertos (Take más apoyado, Último Pick), solo NFL.
  [U.beto]: {user_id: U.beto, username: 'beto_crack', joined_month: '2026-09',
    takes: {count: 3, up: 6, down: 1, top: take('d1000000-0000-4000-8000-000000000002', 'Los Chiefs vuelven al Super Bowl',
      {kind: 'supported', type: 'take', net: 5, sport: 'nfl', competition: null, upvotes: 6, downvotes: 1})},
    picks: {count: 1, won: 0, lost: 0, top: {kind: 'last', id: 'c1000000-0000-4000-8000-000000000002', title: 'Chiefs',
      legs: [{event: 'Chiefs vs Bills', selection: 'Chiefs · MONEYLINE', sport: 'NFL'}, {event: 'Eagles vs Giants', selection: 'Eagles', sport: 'NFL'}],
      american_odds: 120, result_points: 0, outcome: 'pending', created_at: D(1)}},
    quiniela: {nfl: {position: 9, of: 12, points: 6, hits: 2, resolved: 9}, football: null, parties: []}},
  // Carla y Dani: no han participado.
  [U.carla]: {user_id: U.carla, username: 'carla', joined_month: '2026-11', takes: {count: 0, up: 0, down: 0, top: null},
    picks: {count: 0, won: 0, lost: 0, top: null}, quiniela: {nfl: null, football: null, parties: []}},
  [U.dani]: {user_id: U.dani, username: 'dani', joined_month: '2026-11', takes: {count: 0, up: 0, down: 0, top: null},
    picks: {count: 0, won: 0, lost: 0, top: null}, quiniela: {nfl: null, football: null, parties: []}},
  // Eva: un Take de la NFL sin votos (con la línea de contexto) y dos campeones.
  [U.eva]: {user_id: U.eva, username: 'eva_nfl', joined_month: '2026-11',
    takes: {count: 1, up: 0, down: 0, top: take('d1000000-0000-4000-8000-000000000005', 'Campeón NFL',
      {kind: 'supported', type: 'take', net: 0, sport: 'nfl', competition: null, upvotes: 0, downvotes: 0,
       body: 'NFL · NFC · NFC North\n\nBears, Caleb y su lesión llevarán a Chicago a su superbowl'})},
    picks: {count: 0, won: 0, lost: 0, top: null}, quiniela: {nfl: null, football: null, parties: []}}
};
const CHAMPIONS = {[U.eva]: [
  {competition: 'laliga', season: '2026/27', team: 'FC Barcelona', points: 3, state: 'pending', awarded_points: 0},
  {competition: 'nfl', season: '2026/27', team: 'Kansas City Chiefs', points: 5, state: 'pending', awarded_points: 0}]};
const PARTY = {
  [U.ana]: {parties: [
      {id: 'f1000000-0000-4000-8000-000000000001', name: 'Los Compas', kind: 'quiniela', sport: 'all', member_count: 5, position: 1, week_position: 1, show_on_profile: true, is_owner: true},
      {id: 'f2000000-0000-4000-8000-000000000002', name: 'Domingos de NFL con los del trabajo 🏈', kind: 'quiniela', sport: 'nfl', member_count: 8, position: 3, week_position: 2, show_on_profile: false, is_owner: false},
      {id: 'f3000000-0000-4000-8000-000000000003', name: 'Los del barrio ⚽', kind: 'picks', sport: 'football', member_count: 3, position: 1, show_on_profile: true},
      {id: 'f4000000-0000-4000-8000-000000000004', name: 'Takes de la oficina', kind: 'takes', sport: 'all', member_count: 2, position: 2, show_on_profile: true}],
    quiniela: {nfl: {position: 4, of: 12, points: 28, hits: 7, resolved: 12}, football: {position: 2, of: 7, points: 10, hits: 3, resolved: 5}},
    recent: [
      {sport: 'nfl', competition: 'nfl', home_name: 'Bills', away_name: 'Chiefs', pick_label: 'Bills', state: 'won', points: 4, kickoff: D(2)},
      {sport: 'football', competition: 'laliga', home_name: 'Barcelona', away_name: 'Real Madrid', pick_label: 'Empate', state: 'lost', points: 0, kickoff: D(3)},
      {sport: 'nfl', competition: 'nfl', home_name: 'Jacksonville Jaguars', away_name: 'Tampa Bay Buccaneers', pick_label: 'Jaguars', state: 'won', points: 6, kickoff: D(9)}],
    last_sport: 'nfl'},
  [U.beto]: {parties: [{id: null, name: 'Los Compas', kind: 'quiniela', sport: 'all', member_count: 5, position: 4},
      {id: null, name: 'Picks de los martes', kind: 'picks', sport: 'all', member_count: 6, position: 2}],
    quiniela: {nfl: {position: 9, of: 12, points: 6, hits: 2, resolved: 9}, football: null},
    recent: [{sport: 'nfl', competition: 'nfl', home_name: '49ers', away_name: 'Cowboys', pick_label: '49ers', state: 'lost', points: 0, kickoff: D(4)}],
    last_sport: null},
  [U.carla]: {parties: [], quiniela: {nfl: null, football: null}, recent: [], last_sport: null},
  [U.dani]: {parties: [], quiniela: {nfl: null, football: null}, recent: [], last_sport: null}
};
F.rpc.cam_profile_overview = ({p_user}) => ok(OVERVIEW[p_user] || null);
F.rpc.cam_profile_party = ({p_user}) => ok(Object.assign({own: p_user === me()}, PARTY[p_user] || PARTY[U.carla]));
// Lo que cargan las pestañas Takes y Picks (solo al abrirlas).
const takes = [take('d1000000-0000-4000-8000-000000000001', 'El Madrid gana la Champions', {author_id: U.ana, author: 'ana_futbolera', hidden: false})];
// Primeros pasos: lo que falta se cuenta sin traer filas (count + head).
F.tables.cam_nfl_picks = []; F.tables.cam_football_picks = []; F.tables.cam_party_members = [];
F.rpc.ae_my_free_takes = () => ok(takes);
F.rpc.ae_public_take_profile = ({p_author_id}) => ok(p_author_id === U.ana ? takes : []);
F.rpc.ae_my_profile_unpopular_take = () => ok(null);
F.rpc.ae_take_prestige = () => ok([]);
F.rpc.ae_take_legendary = () => ok([]);
F.rpc.ae_user_champion_picks = ({p_user_id}) => ok(CHAMPIONS[p_user_id] || []);
F.tables.ae_pick_feed = [{id: 'c1000000-0000-4000-8000-000000000001', user_id: U.ana, author: 'ana_futbolera', title: 'Barça gana',
  legs: [{event: 'Barcelona vs Sevilla', selection: 'Barcelona · MONEYLINE (3-WAY)', sport: 'Fútbol'}], american_odds: 240,
  created_at: D(5), outcome: 'won', result_points: 2.4, moderation_status: 'approved', hidden: false, upvotes: 1, downvotes: 0}];
F.rpc.cam_party_mine = () => ok([]);
F.rpc.cam_username_status = () => ok({username: NAMES[me()], can_change: true});
})();
""" % {'users': json.dumps(U)}

CLIPPED = (ROOT / 'tests/parties.py').read_text(encoding='utf8').split('CLIPPED = r"""', 1)[1].split('"""', 1)[0]
SELECTOR = '#aeProfileTabs, #camProfileOverview, #camProfileParties, #camProfileQuiniela, .cam-profile-head'

STATE = """() => {
  const $ = id => document.getElementById(id);
  const vis = n => Boolean(n && n.getClientRects().length && !n.closest('[hidden]'));
  const tab = [...document.querySelectorAll('#aeProfileTabs button')].find(b => b.getAttribute('aria-selected') === 'true');
  // Texto tal cual está escrito (sin las mayúsculas del CSS), solo lo visible.
  const txt = n => { if (!n) return ''; const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT); const out = [];
    while (w.nextNode()) { const t = w.currentNode.textContent.trim(); if (t && w.currentNode.parentElement.getClientRects().length) out.push(t); }
    return out.join(' ').replace(/\\s+/g, ' '); };
  const calls = window.__fake.calls.filter(c => c.rpc || c.table).map(c => c.rpc || ('from:' + c.table));
  return {open: $('aeProfileDialog').open, tab: tab ? tab.id : null,
    tabs: [...document.querySelectorAll('#aeProfileTabs button')].filter(b => !b.hidden).map(b => b.textContent.trim()),
    title: $('aeProfileTitle').textContent, url: location.search, history: history.length,
    overview: vis($('camProfileOverview')), party: vis($('camProfileParties')), takes: vis($('aeProfileTakes')),
    cards: [...document.querySelectorAll('#camProfileOverview .cam-ov-card')].map(txt),
    kinds: [...document.querySelectorAll('#camProfileOverview .cam-ov-card')].map(n => n.dataset.kind),
    highlights: [...document.querySelectorAll('#camProfileHighlights li')].filter(vis).map(n => n.textContent.trim()),
    strong: [...document.querySelectorAll('#camProfileHighlights li.is-strong')].map(n => n.textContent.trim()),
    edit: vis($('camProfileEditOpen')), invite: vis($('camProfileInvite')),
    shareIcon: $('camProfileShare').classList.contains('is-icon'), shareText: txt($('camProfileShare')),
    kicker: vis($('camProfileKicker')), focus: document.activeElement ? document.activeElement.id || document.activeElement.className : '',
    jornadas: vis($('camProfileQuiniela')),
    partyText: txt($('camProfileParties')),
    calls, overflow: $('aeProfileDialog').scrollWidth - $('aeProfileDialog').clientWidth};
}"""

ERRORS_JS = "window.__consoleErrors || []"


def open_page(start, dark, width, query=''):
    height = 844 if width < 700 else 900
    fake = ("window.__fake=window.__fake||{};" + (f"window.__fake.start={start!r};" if start else '') + MODEL)
    ctx = fp.full_page(fake_js=fake, dark=dark, width=width, height=height, scale=2 if width < 700 else 1)
    page = ctx.__enter__()
    page._ctx = ctx
    page.console_errors = []
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and page.console_errors.append(m.text))
    if query:
        page.goto(page.url.split('?')[0] + query, wait_until='load')
        page.wait_for_timeout(1500)
    return page


def close(page):
    page._ctx.__exit__(None, None, None)


def state(page):
    return page.evaluate(STATE)


def check_clean(page, where):
    bad = page.evaluate(CLIPPED, SELECTOR)
    assert not bad, (where, bad)
    assert not page.errors, (where, page.errors)
    assert not page.console_errors, (where, page.console_errors)
    assert state(page)['overflow'] <= 1, (where, 'desbordamiento horizontal')


def shot(page, name):
    if SHOTS:
        page.screenshot(path=str(SHOTS / f'{name}.png'), full_page=False)


def shot_full(page, name, panel):
    """Captura toda la ventana del perfil hasta el final de la pestaña (para revisar)."""
    if not SHOTS:
        return
    page.evaluate("document.getElementById('aeProfileDialog').scrollTop = 0")
    h = page.evaluate(f"""(() => {{ const d = document.getElementById('aeProfileDialog');
      const p = document.getElementById({panel!r}); return Math.ceil(p.getBoundingClientRect().bottom - d.getBoundingClientRect().top + d.scrollTop) + 8; }})()""")
    vp = page.viewport_size
    page.set_viewport_size({'width': vp['width'], 'height': max(vp['height'], h)})
    page.wait_for_timeout(250)
    page.screenshot(path=str(SHOTS / f'{name}.png'))
    page.set_viewport_size(vp)
    page.wait_for_timeout(150)


def bottom_of(page, panel):
    """Altura (en px de pantalla) desde arriba del perfil hasta el final de un panel."""
    return page.evaluate(f"""(() => {{ const d = document.getElementById('aeProfileDialog');
      d.scrollTop = 0; const p = document.getElementById({panel!r});
      return p.getBoundingClientRect().bottom - d.getBoundingClientRect().top; }})()""")


def open_own(page, width):
    if width < 700:
        page.click('#camNavProfile')           # barra inferior del teléfono
    else:
        page.evaluate("document.getElementById('aeMyTakesButton').click()")
    page.wait_for_selector('#camProfileOverview .cam-ov-card', timeout=8000)
    page.wait_for_timeout(250)


def scenario_own(dark, width, tag):
    page = open_page('ana', dark, width)
    try:
        open_own(page, width)
        st = state(page)
        assert st['tab'] == 'aeProfileTabOverview' and st['overview'] and not st['takes'], (tag, 'abre en Perfil', st)
        assert st['tabs'] == ['Perfil', 'Takes', 'Picks', 'Mi Party'], (tag, st['tabs'])
        assert not st['kicker'] and st['focus'] == 'aeProfileTitle', (tag, 'cabecera sin antetítulo y foco en el nombre', st['kicker'], st['focus'])
        assert st['edit'] and not st['invite'] and not st['shareIcon'] and st['shareText'] == 'Compartir', (tag, st)
        shown = 2 if width <= 360 else 3   # a 320 px, dos etiquetas como mucho
        assert st['highlights'] == ['2.º en la Quiniela Fútbol', '63 % de acierto en Picks', '80 % de apoyo en Takes'][:shown], st['highlights']
        assert st['strong'] == ['2.º en la Quiniela Fútbol'], st['strong']
        assert page.locator('#camProfileHighlights svg').count() == 1, 'trofeo en el podio'
        assert page.locator('#aeProfileTabParty .cam-tab-icon').count() == 1, 'icono de grupo junto a Mi Party'
        assert page.locator('#camProfileStats').count() == 0, 'sin fila de cifras en la cabecera'
        assert st['calls'].count('cam_profile_overview') == 1, (tag, st['calls'])
        assert st['calls'].count('ae_user_champion_picks') == 1 and st['calls'].count('ae_take_prestige') == 1, (tag, st['calls'])
        assert st['kinds'] == ['takes', 'picks', 'quiniela'], (tag, 'todo hecho: sin «Primeros pasos»', st['kinds'])
        assert not any(c in st['calls'] for c in ('ae_my_free_takes', 'from:ae_pick_feed', 'cam_profile_party')), (tag, 'el resumen no carga las otras pestañas', st['calls'])
        takes, picks, quiniela = st['cards']
        assert takes.startswith('Takes 12 · 80 % apoyo Ver todo ›') and 'Mejor Take' in takes and '+13 pts' in takes and 'Champions League' in takes, takes
        assert 'Con Mbappé en este nivel no hay rival en Europa.' in takes and '▲ 9' in takes and '▼ 2' in takes, takes
        assert picks.startswith('Picks 8 · 63 % acierto') and 'Mejor Pick' in picks and 'Barcelona vs Sevilla' in picks, picks
        assert 'Barcelona gana · 3 vías' in picks and 'MONEYLINE' not in picks and '+240' in picks and '+2,40 pts' in picks, picks
        assert quiniela.startswith('Quiniela 59 % acierto'), quiniela
        for line in ('NFL 4.º de 12 28 pts', 'Fútbol 2.º de 7 10 pts', 'Party Los Compas 1.º de 5'):
            assert line in quiniela, (line, quiniela)
        assert all('Ver todo ›' in c and not c.endswith('Ver todo ›') for c in st['cards']), st['cards']
        # El título del Take va a 2 líneas como máximo, con «…».
        lines = page.evaluate("(() => { const t = document.querySelector('#camProfileOverview [data-kind=takes] .cam-ov-title'); return Math.round(t.getBoundingClientRect().height / parseFloat(getComputedStyle(t).lineHeight)); })()")
        assert lines <= 2, (tag, 'título en más de 2 líneas', lines)
        if width == 390:
            h = bottom_of(page, 'camProfileOverview')
            assert h <= 1.5 * 844, (tag, 'cabecera + resumen en 1,5 pantallas', h)
        check_clean(page, tag + ' resumen propio')
        shot(page, f'{tag}-perfil')
        shot_full(page, f'{tag}-perfil-completo', 'camProfileOverview')

        # Mejor Take → conversación; Mejor Pick → ficha.
        page.click('#camProfileOverview [data-kind=takes] .cam-ov-item')
        page.wait_for_selector('#aeTakeDiscussion[open]')
        assert 'El Madrid gana la Champions' in page.inner_text('#aeDiscussionSubject')
        page.evaluate("document.getElementById('aeTakeDiscussion').close()")
        page.wait_for_timeout(200)
        page.click('#camProfileOverview [data-kind=picks] .cam-ov-item')
        page.wait_for_function("new URL(location.href).searchParams.get('pick') === 'c1000000-0000-4000-8000-000000000001'")
        page.evaluate("document.getElementById('cpDialog')?.close()")
        page.wait_for_timeout(250)

        # «Ver todo ›» cambia a su pestaña (y solo entonces carga sus datos).
        page.click('#camProfileOverview [data-kind=takes] .cam-ov-more')
        page.wait_for_function("document.getElementById('aeProfileTabTakes').getAttribute('aria-selected') === 'true'")
        page.wait_for_timeout(400)
        st = state(page)
        assert st['takes'] and st['calls'].count('ae_my_free_takes') == 1, (tag, st['calls'])
        # La pestaña Takes reutiliza el prestigio y los campeones del resumen.
        assert st['calls'].count('ae_user_champion_picks') == 1 and st['calls'].count('ae_take_prestige') == 1, (tag, st['calls'])
        assert st['calls'].count('ae_take_legendary') == 1, (tag, st['calls'])
        page.click('#aeProfileTabOverview')
        page.wait_for_timeout(200)

        # La tarjeta de quiniela lleva a Mi Party, con «Mis jornadas» al final.
        page.click('#camProfileOverview [data-kind=quiniela] .cam-ov-item')
        page.wait_for_selector('#camProfileParties .cam-pp-block', timeout=8000)
        page.wait_for_selector('#camProfileQuiniela .cam-qh-message', timeout=8000)
        page.wait_for_timeout(250)
        st = state(page)
        assert st['tab'] == 'aeProfileTabParty' and st['party'] and st['jornadas'] and not st['overview'], (tag, st)
        assert 'Mis jornadas' in page.inner_text('#camProfileQuiniela'), 'jornadas al final de Mi Party'
        order = page.evaluate("document.getElementById('camProfileParties').getBoundingClientRect().bottom <= document.getElementById('camProfileQuiniela').getBoundingClientRect().top + 1")
        assert order, (tag, 'Mis jornadas debajo de Mi Party')
        txt = st['partyText']
        assert txt.startswith('Tus parties de quiniela'), txt
        assert 'Los Compas 1.º de 5 · esta semana 5 miembros' in txt, txt
        assert 'Oculto en tu perfil' in txt, txt
        assert 'Crear otra' in txt and 'Mi quiniela' in txt and 'NFL 4.º de 12 28 pts 7/12' in txt and 'Fútbol 2.º de 7 10 pts 3/5' in txt, txt
        assert 'Jugar esta semana ›' in txt and 'Chiefs @ Bills' not in txt, (tag, 'los pronósticos van en Mis jornadas', txt)
        assert txt.index('Otros parties') > txt.index('Mi quiniela') and 'Los del barrio ⚽' in txt and 'Takes de la oficina' in txt, txt
        if width == 390:
            h = bottom_of(page, 'camProfileParties')
            assert h <= 2 * 844, (tag, 'Mi Party en 2 pantallas', h)
        check_clean(page, tag + ' mi party')
        shot(page, f'{tag}-mi-party')
        shot_full(page, f'{tag}-mi-party-completo', 'camProfileQuiniela')
        page.click('#aeProfileTabPicks')
        page.wait_for_timeout(300)
        page.click('#aeProfileTabParty')
        page.wait_for_timeout(200)
        page.click('#aeProfileTabOverview')
        page.wait_for_timeout(200)
        st = state(page)
        assert st['calls'].count('cam_profile_party') == 1 and st['calls'].count('cam_profile_overview') == 1, (tag, 'sin llamadas repetidas', st['calls'])

        # Una fila de party abre ese party.
        page.evaluate("window.__fake.rpc.cam_party_ranking = () => ({data: {party: {id: 'f1000000-0000-4000-8000-000000000001', name: 'Los Compas', kind: 'quiniela', sport: 'all', code: 'K7M2QX', owner_id: '%s', member_count: 5, is_owner: true, is_member: true, show_on_profile: true}, week: [], month: [], total: []}, error: null})" % U['ana'])
        page.click('#aeProfileTabParty')
        page.click('#camProfileParties .cam-pp-invite .cam-party-card >> text=Los Compas')
        page.wait_for_function("document.getElementById('camPartyTitle')?.textContent === 'Los Compas'")
        periods = page.eval_on_selector_all('#camPartyBoard .cam-party-seg-btn', 'ns => ns.map(n => n.textContent)')
        assert periods == ['Esta semana', 'Este mes', 'Total'], periods
        assert page.locator('#camPartyBoard .cam-party-seg-btn[aria-pressed=true]').inner_text() == 'Esta semana'
    finally:
        close(page)


def scenario_own_empty(dark, width, tag):
    page = open_page('dani', dark, width)
    try:
        open_own(page, width)
        page.wait_for_selector('#camProfileOverview .cam-ov-steps', timeout=8000)
        page.wait_for_timeout(250)
        st = state(page)
        assert st['kinds'] == ['steps'], (tag, 'Primeros pasos en lugar de tarjetas vacías', st['cards'])
        steps = st['cards'][0]
        assert steps.startswith('Primeros pasos 0 de 4'), steps
        for name in ('Publica tu primer Take', 'Juega la quiniela', 'Prepara tu primer Pick', 'Únete a una party'):
            assert name in steps, (name, steps)
        assert not st['highlights'], st['highlights']
        check_clean(page, tag + ' resumen vacío')
        shot(page, f'{tag}-perfil-vacio')
        # Con un Take publicado, ese paso sale hecho.
        page.evaluate("""(() => { const o = window.__fake.rpc.cam_profile_overview; window.__fake.rpc.cam_profile_overview = a => {
          const r = o(a); r.data = JSON.parse(JSON.stringify(r.data)); r.data.takes = {count: 1, up: 0, down: 0, top: {kind: 'supported', type: 'take',
          id: 'd1000000-0000-4000-8000-000000000009', title: 'Mi primer Take', body: 'Hola', sport: 'nfl', net: 0, upvotes: 0, downvotes: 0,
          created_at: new Date().toISOString()}}; return r; }; })()""")
        page.evaluate("closeAeProfile()")
        page.wait_for_timeout(200)
        open_own(page, width)
        page.wait_for_selector('#camProfileOverview .cam-ov-steps .cam-ov-step.is-done', timeout=8000)
        st = state(page)
        assert st['kinds'] == ['steps', 'takes'] and st['cards'][0].startswith('Primeros pasos 1 de 4'), (tag, st['cards'])
        assert 'Tu Take' in st['cards'][1] and 'Take más apoyado' not in st['cards'][1], st['cards'][1]
        check_clean(page, tag + ' primeros pasos 1 de 4')
        shot(page, f'{tag}-primeros-pasos')
        page.click('#aeProfileTabParty')
        page.wait_for_selector('#camProfileParties .cam-pp-invite')
        txt = state(page)['partyText']
        assert txt.startswith('¿Ya tienes tu party de quiniela?'), txt
        assert 'Arma un grupo con tus amigos y compitan cada semana con su propia clasificación.' in txt, txt
        assert 'Crear party' in txt and 'Unirme con código' in txt and 'Otros parties' not in txt, txt
        assert 'NFL Sin resultados' in txt and 'Fútbol Sin resultados' in txt, txt
        page.wait_for_selector('#camProfileQuiniela .cam-qh-message', timeout=8000)
        assert 'Aún no has guardado pronósticos de NFL.' in page.inner_text('#camProfileQuiniela')
        check_clean(page, tag + ' mi party vacío')
        shot(page, f'{tag}-mi-party-vacio')
        shot_full(page, f'{tag}-mi-party-vacio-completo', 'camProfileQuiniela')
        # Crear party abre la creación con Quiniela ya elegida (y primera).
        page.click('#camProfileParties .cam-party-btn >> text=Crear party')
        page.wait_for_selector('#camPartyName', state='visible')
        kinds = page.eval_on_selector_all('#camParty [data-value]', 'ns => ns.map(n => n.dataset.value)')
        assert kinds[:3] == ['quiniela', 'picks', 'takes'], kinds
        assert page.locator('#camParty [data-value=quiniela]').get_attribute('aria-pressed') == 'true'
        assert page.locator('#camParty .cam-party-hint >> text=LaLiga').is_visible()
        page.click('#camParty [data-value=picks]')
        page.wait_for_timeout(100)
        assert not page.locator('#camParty .cam-party-hint >> text=LaLiga').is_visible(), 'las ligas solo con Quiniela'
        page.evaluate("document.getElementById('camParty').close()")
        page.wait_for_timeout(200)
        # «Juega la quiniela» (Primeros pasos) lleva a la quiniela NFL.
        page.click('#aeProfileTabOverview')
        page.click('#camProfileOverview .cam-ov-step-go >> text=Juega la quiniela')
        page.wait_for_timeout(800)
        assert not page.evaluate("document.getElementById('aeProfileDialog').open")
        assert page.evaluate("currentCategory") == 'NFL'
        if width < 700:
            q = page.evaluate("new URL(location.href).searchParams.toString()")
            # En NFL la quiniela vive en La semana (4 nov 2026).
            assert 's=nfl' in q and 'v=semana' in q, q
        assert page.locator('#camPartyEntryQuinielaNfl').is_visible(), 'acceso «Mis parties» en la quiniela'
        page.evaluate("document.getElementById('camPartyEntryQuinielaNfl').scrollIntoView({block:'center'})")
        page.wait_for_timeout(300)
        bad = page.evaluate(CLIPPED, '.cam-party-entry-row')
        assert not bad, bad
        shot(page, f'{tag}-acceso-quiniela')
        page.click('#camPartyEntryQuinielaNfl button')
        page.wait_for_selector('#camParty .cam-party-seg-btn[aria-pressed=true]')
        assert page.locator('#camParty .cam-party-seg-btn[aria-pressed=true]').inner_text() == 'Quiniela'
        assert not page.errors and not page.console_errors, (page.errors, page.console_errors)
    finally:
        close(page)


def scenario_public(dark, width, tag):
    # ?perfil=<id> abre Perfil; &tab= abre esa pestaña.
    page = open_page('dani', dark, width, f"?perfil={U['ana']}")
    try:
        page.wait_for_selector('#camProfileOverview .cam-ov-card', timeout=8000)
        st = state(page)
        assert st['tab'] == 'aeProfileTabOverview' and st['title'] == '@ana_futbolera', st
        assert st['tabs'] == ['Perfil', 'Takes', 'Picks', 'Party'], st['tabs']
        assert len(st['cards']) == 3 and not page.locator('#camProfileEditOpen').is_visible()
        assert st['invite'] and not st['edit'] and st['shareIcon'], (tag, 'Invitar a mi party y compartir como icono', st)
        assert page.get_attribute('#camProfileShare', 'aria-label') == 'Compartir perfil'
        assert st['kinds'] == ['quiniela', 'takes', 'picks'], (tag, 'la quiniela primero: va en el podio', st['kinds'])
        assert st['highlights'][0] == '2.º en la Quiniela Fútbol', st['highlights']
        before = st['history']
        page.click('#aeProfileTabPicks')
        page.wait_for_timeout(300)
        st = state(page)
        assert 'tab=picks' in st['url'] and st['history'] == before, (tag, 'cambiar de pestaña no suma pasos', st)
        page.click('#aeProfileTabOverview')
        page.wait_for_timeout(200)
        assert 'tab=' not in state(page)['url']
        check_clean(page, tag + ' público')
        shot(page, f'{tag}-publico')
        shot_full(page, f'{tag}-publico-completo', 'camProfileOverview')
        # «Invitar a mi party» abre «Mis parties» de quiniela.
        page.click('#camProfileInvite')
        page.wait_for_selector('#camParty .cam-party-seg-btn[aria-pressed=true]', timeout=8000)
        assert page.locator('#camParty .cam-party-seg-btn[aria-pressed=true]').inner_text() == 'Quiniela'
        page.evaluate("document.getElementById('camParty').close()")
        page.wait_for_timeout(200)
    finally:
        close(page)
    # Un Take sin votos no es «el más apoyado»; campeones con su estado.
    page = open_page('dani', dark, width, f"?perfil={U['eva']}")
    try:
        page.wait_for_selector('#camProfileOverview .cam-ov-champ', timeout=8000)
        page.wait_for_timeout(300)
        st = state(page)
        assert st['kinds'] == ['takes'], st['kinds']
        takes = st['cards'][0]
        assert 'Su Take' in takes and 'Take más apoyado' not in takes, takes
        assert 'Bears, Caleb y su lesión llevarán a Chicago a su superbowl' in takes and 'NFC North' not in takes, takes
        assert '▲ 0' in takes and '▼ 0' in takes, takes
        assert 'Campeones elegidos FB FC Barcelona LaLiga 2026/27 · paga 3 pts En juego KC Kansas City Chiefs NFL 2026/27 · paga 5 pts En juego' in takes, takes
        assert st['highlights'] == ['Campeones: Barcelona · Chiefs'], st['highlights']
        check_clean(page, tag + ' su take y campeones')
        shot(page, f'{tag}-campeones')
    finally:
        close(page)
    for tab, panel in (('takes', 'aeProfileTabTakes'), ('picks', 'aeProfileTabPicks'), ('party', 'aeProfileTabParty')):
        page = open_page('dani', dark, width, f"?perfil={U['beto']}&tab={tab}")
        try:
            page.wait_for_function(f"document.getElementById({panel!r}).getAttribute('aria-selected') === 'true'", timeout=8000)
            page.wait_for_timeout(500)
            st = state(page)
            assert 'cam_profile_overview' in st['calls'], st['calls']
            if tab == 'party':
                page.wait_for_selector('#camProfileParties .cam-pp-cta')
                txt = state(page)['partyText']
                assert txt.startswith('Parties Los Compas Quiniela 4.º de 5'), txt
                assert 'Picks de los martes' in txt and 'Quiniela NFL 9.º de 12 6 pts 2/9' in txt and 'Cowboys @ 49ers' in txt, txt
                assert txt.endswith('¿Juegas la quiniela? Arma tu party ›') and 'Jugar esta semana' not in txt and 'Crear party' not in txt, txt
                assert page.locator('#camProfileParties button.cam-party-card').count() == 0, 'sin id no se abre'
                check_clean(page, tag + ' party público')
                shot(page, f'{tag}-party-publico')
                shot_full(page, f'{tag}-party-publico-completo', 'camProfileParties')
                # Sin sesión: «Arma tu party» abre el acceso.
                page.evaluate("window.__fake.user = null")
                page.click('#camProfileParties .cam-pp-cta')
                page.wait_for_selector('#userAuthModal:not(.hidden)', timeout=8000)
                assert 'volverás a la invitación' in page.inner_text('#aeAuthPublishHint')
            if tab == 'picks':
                page.click('#aeProfileTabOverview')
                page.wait_for_timeout(300)
                st = state(page)
                takes, picks, quiniela = st['cards']
                assert 'Take más apoyado' in takes and '▲ 6' in takes and '▼ 1' in takes and 'NFL' in takes, takes
                assert 'Último Pick' in picks and 'Chiefs vs Bills +1' in picks and 'Chiefs gana' in picks and '+120' in picks and 'pts' not in picks, picks
                assert quiniela.startswith('Quiniela 22 % acierto') and 'NFL 9.º de 12 6 pts' in quiniela, quiniela
                check_clean(page, tag + ' alternativas')
                shot(page, f'{tag}-alternativas')
        finally:
            close(page)
    # Perfil público vacío: una sola línea.
    page = open_page('dani', dark, width, f"?perfil={U['carla']}")
    try:
        page.wait_for_selector('#camProfileOverview .cam-ov-status', timeout=8000)
        page.wait_for_timeout(300)
        assert page.inner_text('#camProfileOverview').strip() == '@carla todavía no ha participado'
        page.click('#aeProfileTabParty')
        page.wait_for_selector('#camProfileParties .cam-pp-cta')
        txt = state(page)['partyText']
        assert txt == '@carla todavía no ha participado ¿Juegas la quiniela? Arma tu party ›', txt
        check_clean(page, tag + ' público vacío')
        shot(page, f'{tag}-publico-vacio')
    finally:
        close(page)


def scenario_jornadas(dark, width, tag):
    # ?perfil=<propio>&tab=quiniela y «Ver mis jornadas» abren Mi Party en las jornadas.
    page = open_page('ana', dark, width, f"?perfil={U['ana']}&tab=quiniela")
    try:
        page.wait_for_function("document.getElementById('aeProfileTabParty').getAttribute('aria-selected') === 'true'", timeout=8000)
        page.wait_for_selector('#camProfileQuiniela .cam-qh-message', timeout=8000)
        page.wait_for_timeout(400)
        st = state(page)
        assert st['jornadas'] and st['party'] and 'tab=party' in st['url'], (tag, st)
        # Baja hasta Mis jornadas (con el historial vacío, hasta el final).
        pos = page.evaluate("""(() => { const d = document.getElementById('aeProfileDialog'), r = document.getElementById('camProfileQuiniela').getBoundingClientRect();
          return {top: r.top, bottom: r.bottom, h: innerHeight, scrolled: d.scrollTop, max: d.scrollHeight - d.clientHeight}; })()""")
        assert pos['top'] < pos['h'] - 80 and (pos['top'] < 260 or pos['scrolled'] >= pos['max'] - 2), (tag, 'baja hasta Mis jornadas', pos)
        page.click('#aeProfileTabOverview')
        page.wait_for_timeout(200)
        assert not state(page)['jornadas']
        page.evaluate("window.camOpenQuinielaHistory('football')")
        page.wait_for_timeout(500)
        st = state(page)
        assert st['tab'] == 'aeProfileTabParty' and st['jornadas'], (tag, st)
        assert page.locator('#camProfileQuiniela [data-sport=football]').get_attribute('aria-pressed') == 'true'
        check_clean(page, tag + ' jornadas')
    finally:
        close(page)
    # Un perfil ajeno nunca enseña jornadas privadas.
    page = open_page('dani', dark, width, f"?perfil={U['beto']}&tab=quiniela")
    try:
        page.wait_for_function("document.getElementById('aeProfileTabParty').getAttribute('aria-selected') === 'true'", timeout=8000)
        page.wait_for_timeout(500)
        assert not state(page)['jornadas']
        assert not any(c in state(page)['calls'] for c in ('from:cam_nfl_picks', 'from:cam_football_picks'))
    finally:
        close(page)


def scenario_author(dark, width, tag):
    # El @autor de un Take abre el perfil en «Perfil».
    page = open_page('dani', dark, width)
    try:
        page.evaluate("""window.aeTakeReplies.open({id: 'd1000000-0000-4000-8000-000000000002', author_id: '%s', author: 'beto_crack',
          title: 'Los Chiefs vuelven al Super Bowl', body: 'Mahomes', sport: 'nfl', created_at: new Date().toISOString(), upvotes: 6, downvotes: 1})""" % U['beto'])
        page.wait_for_selector('#aeTakeDiscussion[open]')
        page.click('#aeDiscussionAuthor')
        page.wait_for_selector('#camProfileOverview .cam-ov-card', timeout=8000)
        st = state(page)
        assert st['tab'] == 'aeProfileTabOverview' and st['title'] == '@beto_crack' and f"perfil={U['beto']}" in st['url'], st
        assert not page.errors, page.errors
    finally:
        close(page)


COMBOS = [(320, False, '320-dia'), (320, True, '320-noche'), (390, False, '390-dia'), (390, True, '390-noche'),
          (1366, False, '1366-dia'), (1366, True, '1366-noche')]
SCENARIOS = [scenario_own, scenario_own_empty, scenario_public, scenario_jornadas, scenario_author]

if __name__ == '__main__':
    for width, dark, tag in COMBOS:
        if ONLY and ONLY != tag:
            continue
        for scenario in SCENARIOS:
            scenario(dark, width, tag)
            print('ok', tag, scenario.__name__)
    print('profile-overview: todo OK')
