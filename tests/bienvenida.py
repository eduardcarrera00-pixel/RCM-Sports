"""Bienvenida y tarjetas de sección (18 nov 2026, pedido de Eduard).

Página completa en Chromium (tests/full-page.py, Supabase falso, sin red). Cada
caso abre un navegador nuevo: es como alguien que llega por primera vez. Los
navegadores automáticos no ven la bienvenida salir sola; aquí se activa con
window.__camIntroTest = true (salvo en el caso que comprueba justo eso).

Cubre:
  · primera visita a Inicio sin sesión (390 px, día y noche): sale sola, en tres
    pasos (Takes con el ejemplo → NFL, Fútbol y Picks → los 7 escudos de rango);
    «Publicar mi primer Take» la cierra y abre el formulario del Take SIN pedir
    cuenta (con el aviso de que se pedirá al publicar);
  · al publicar sin cuenta: pide iniciar sesión; al entrar, el formulario vuelve
    con el texto intacto y «Sesión iniciada…»;
  · no se repite (recargar), no sale con sesión iniciada ni al llegar con un
    enlace a una sección (?s=nfl: sale la tarjeta de NFL, no la bienvenida);
  · NFL con datos: cuenta atrás del próximo partido y «El editor va con los Lions
    contra los Patriots. ¿Y tú?»; el botón abre La semana; la «i» de las pestañas
    vuelve a abrirla; Fútbol (cuenta atrás de LaLiga), Picks y Actualidad;
  · se cierra con la ×, Escape, tocando fuera y deslizando hacia abajo;
  · calma: si la persona no deja de bajar la página, no sale (se queda para otra vez);
  · el aviso de «desliza» espera a que se cierre la tarjeta y luego sale;
  · 320 px sin textos cortados ni desbordamiento; ordenador (1366 px) centrada;
    «reducir movimiento» sin animación; sin errores de la página.

Uso: python3 -B tests/bienvenida.py [--shots DIR]
"""
import importlib.util, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

ON = "window.__camIntroTest = true;"
DATA = r"""
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  const T = F.tables, H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  T.articles = [];
  T.nfl_rankings = [{id: 1, edition: 'Week 10', team_ids: ['SF','KC','BUF','PHI','BAL','MIN','NE','GB','DET','SEA'], updated_at: '2026-11-10T18:00:00Z'}];
  T.nfl_ranking_history = [];
  const g = (id, away, home, hours, extra) => Object.assign({id, season: 2026, week: 10, home_id: home, away_id: away, kickoff: iso(hours),
    status: 'scheduled', picks_open: true, odds_locked_at: iso(-30), points_home: 2, points_away: 2,
    probability_home: 0.5, probability_away: 0.5, home_score: null, away_score: null, winner_id: null}, extra || {});
  T.cam_nfl_games = [g('w10-thu', 'WAS', 'NYG', 26.5), g('w10-sun-1', 'NE', 'DET', 70), g('w10-sun-2', 'TEN', 'HOU', 74)];
  T.cam_nfl_picks = []; T.cam_nfl_laurels = [];
  F.rpc.cam_nfl_expert_picks = () => ({data: [
    {user_id: 'ed', username: 'editor', game_id: 'w10-sun-1', team_id: 'DET', awarded_points: 0, settled: false, laurel: false},
    {user_id: 'ed', username: 'editor', game_id: 'w10-thu', team_id: 'NYG', awarded_points: 0, settled: false, laurel: false}], error: null});
  F.rpc.cam_nfl_pick_split = () => ({data: [], error: null});
  F.rpc.cam_nfl_expert_duel = () => ({data: [], error: null});
  const now = new Date(), season = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  const squads = [['86','Real Madrid','RMA'], ['83','Barcelona','BAR'], ['1068','Sevilla','SEV'], ['2922','Getafe','GET']];
  T.cam_football_teams = squads.map(([id, name, abbr]) => ({id, name, short_name: name, abbreviation: abbr, logo: ''}));
  T.cam_football_games = [0, 1].map(i => ({id: '4018800' + i, competition: 'laliga', season, matchday: 10, kickoff: iso(50 + i),
    home_id: squads[i * 2][0], away_id: squads[i * 2 + 1][0], status: 'scheduled', home_score: null, away_score: null, outcome: null,
    odds_home: -150, odds_draw: 260, odds_away: 380, probability_home: .52, probability_draw: .26, probability_away: .22,
    points_home: 4, points_draw: 8, points_away: 9, odds_source: 'prueba', odds_locked_at: iso(-1), picks_open: true, opening_mode: 'auto'}));
  T.cam_football_picks = [];
})();
"""
SIGNED = "window.__fake.user = {id: 'u1', email: 'u1@example.com', user_metadata: {username: 'probador'}};"

STATE = """() => {
  const d = document.getElementById('camIntro');
  const q = s => d && d.querySelector(s);
  const sheet = q('.cam-intro-sheet');
  const box = sheet ? sheet.getBoundingClientRect() : null;
  const cut = d ? [...d.querySelectorAll('button, p:not(.cam-intro-sr), h2, li, blockquote, span')].filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map(e => e.className || e.tagName) : [];
  return {
    open: !!(d && d.open), card: window.camIntro.card(), step: window.camIntro.step(), pending: window.camIntro.pending(),
    kicker: q('.cam-intro-kicker')?.textContent || '', title: q('.cam-intro-title')?.textContent || '',
    body: (q('.cam-intro-body')?.textContent || '').replace(/\\s+/g, ' ').trim(),
    rows: d ? d.querySelectorAll('.cam-intro-row').length : 0, emblems: d ? d.querySelectorAll('.cam-intro-rank .cam-rank-emblem').length : 0,
    hooks: d ? [...d.querySelectorAll('.cam-intro-hook')].map(e => e.textContent.trim()) : [],
    primary: (q('.cam-intro-primary')?.textContent || '').replace('›', '').trim(), secondary: q('.cam-intro-secondary')?.textContent || '',
    dots: d ? d.querySelectorAll('.cam-intro-dots > span').length : 0,
    box: box && {top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height)},
    font: q('.cam-intro-primary') ? getComputedStyle(q('.cam-intro-primary')).fontFamily : '',
    titleRing: q('.cam-intro-title') ? getComputedStyle(q('.cam-intro-title')).outlineStyle : '',
    anim: d && d.open ? getComputedStyle(d).animationName : '',
    cut, overflow: document.documentElement.scrollWidth - innerWidth,
    seen: JSON.parse(localStorage.getItem('cam_intro_seen_v1') || '{}'),
    composer: !!document.getElementById('aeTakeComposerDialog')?.open,
    composerStatus: document.getElementById('aeTakeComposerStatus')?.textContent || '',
    login: !document.getElementById('userAuthModal')?.classList.contains('hidden'),
    tab: document.body.dataset.camTab || null,
    info: (() => { const b = document.querySelector('#camSectionTabs > .cam-intro-info'); return b && !b.hidden ? b.getAttribute('aria-label') : null; })(),
    swipeHint: !!window.camSectionSwipe?.hinting?.()
  };
}"""


def shot(page, name):
    if SHOTS: page.screenshot(path=str(SHOTS / (name + '.png')))


def state(page):
    return page.evaluate(STATE)


def wait_open(page, where, within=6000):
    page.wait_for_function('window.camIntro && window.camIntro.isOpen()', timeout=within)
    page.wait_for_timeout(450)   # termina de entrar
    st = state(page)
    assert not st['cut'], f'{where}: textos cortados {st["cut"]}'
    assert st['overflow'] <= 1, f'{where}: desbordamiento lateral {st["overflow"]}px'
    return st


def wait_closed(page, where):
    page.wait_for_function('!window.camIntro.isOpen()', timeout=3000)
    page.wait_for_timeout(120)
    return state(page)


def never_opens(page, where, wait=4500):
    page.wait_for_timeout(wait)
    st = state(page)
    assert not st['open'], f'{where}: no debía abrirse {st["card"]}'
    return st


def go(page, cat):
    page.evaluate(f"filterByCategory({cat!r})")


def first_visit(dark):
    tag = 'noche' if dark else 'dia'
    with fp.full_page(fake_js=ON + DATA, dark=dark, width=390, height=844, touch=True) as page:
        st = wait_open(page, f'bienvenida {tag}')
        assert st['card'] == 'bienvenida' and st['step'] == 0, st
        assert st['title'] == 'Tú lo viste primero. Que quede escrito.', st['title']
        assert 'Gilberto Mora será Balón de Oro en 2030' in st['body'] and st['dots'] == 3, st
        assert st['primary'] == 'Ver cómo funciona' and st['secondary'] == 'Explorar por mi cuenta', st
        assert 'Inter' in st['font'], f'botón con letra de interfaz: {st["font"]}'
        assert st['titleRing'] == 'none', f'el título recibe el foco sin recuadro: {st["titleRing"]}'
        assert st['box']['bottom'] >= 843 and st['box']['width'] == 390, f'{tag}: hoja abajo y a todo el ancho {st["box"]}'
        assert st['seen'].get('bienvenida'), 'queda marcada al salir'
        shot(page, f'bienvenida-1-{tag}')
        page.click('#camIntro .cam-intro-primary'); page.wait_for_timeout(400)
        st = state(page)
        assert st['step'] == 1 and st['rows'] == 3 and st['title'] == 'Cada deporte, su conversación', st
        assert 'NFL.' in st['body'] and 'Fútbol.' in st['body'] and 'Picks.' in st['body'], st['body']
        shot(page, f'bienvenida-2-{tag}')
        page.click('#camIntro .cam-intro-primary'); page.wait_for_timeout(400)
        st = state(page)
        assert st['step'] == 2 and st['emblems'] == 7, st
        assert st['title'] == 'Todos empiezan en Cobre. Pocos llegan a Leyenda.' and st['primary'] == 'Publicar mi primer Take', st
        shot(page, f'bienvenida-3-{tag}')
        page.click('#camIntro .cam-intro-primary')
        st = wait_closed(page, tag)
        page.wait_for_function("document.getElementById('aeTakeComposerDialog').open", timeout=3000)
        st = state(page)
        assert st['composer'] and not st['login'], f'{tag}: el Take se escribe sin cuenta {st}'
        assert 'te pediremos iniciar sesión' in st['composerStatus'], st['composerStatus']
        shot(page, f'take-sin-cuenta-{tag}')
        # Publicar sin cuenta: pide entrar; al entrar vuelve el formulario con el texto.
        page.evaluate("""() => { const f = document.getElementById('freeTakesForm');
          f.querySelector('input[name="sport"][value="nfl"]').checked = true;
          f.elements.competition.value = 'NFL'; f.elements.title.value = 'Los Lions ganan el Super Bowl';
          f.elements.body.value = 'Lo dije antes que nadie.'; f.dispatchEvent(new Event('input', {bubbles: true})); }""")
        page.click('#freeTakesForm button[type="submit"]')
        page.wait_for_function("!document.getElementById('userAuthModal').classList.contains('hidden')", timeout=3000)
        assert not page.evaluate("document.getElementById('aeTakeComposerDialog').open"), 'cierra el formulario para entrar'
        assert localStorage_has(page, 'ae-sports-draft-v1:take:anon', 'Lions'), 'el borrador sin cuenta queda en este navegador'
        page.evaluate(SIGNED + "closeUserAuthModal(true)")
        page.wait_for_function("document.getElementById('aeTakeComposerDialog').open", timeout=3000)
        st = state(page)
        assert page.evaluate("document.getElementById('freeTakesForm').elements.title.value") == 'Los Lions ganan el Super Bowl'
        assert st['composerStatus'].startswith('Sesión iniciada'), st['composerStatus']
        assert not page.errors, page.errors
        # Recargar: no se repite.
        page.reload(wait_until='load'); page.wait_for_timeout(1200)
        never_opens(page, f'recarga {tag}')
        assert not page.errors, page.errors
    print(f'  ok · primera visita {tag}: tres pasos, Take sin cuenta, no se repite')


def localStorage_has(page, key, text):
    return text in (page.evaluate(f"localStorage.getItem({key!r}) || ''") or '')


def no_welcome_cases():
    with fp.full_page(fake_js=ON + DATA + SIGNED, width=390, height=844) as page:
        never_opens(page, 'con sesión')
        assert page.evaluate("window.camIntro.seen('bienvenida')"), 'con sesión queda como vista'
    with fp.full_page(fake_js=DATA, width=390, height=844) as page:
        never_opens(page, 'navegador automático')
        assert page.evaluate("window.camIntro.pending()") is None
    print('  ok · sin bienvenida: con sesión y en navegadores automáticos')


def sections(dark):
    tag = 'noche' if dark else 'dia'
    js = ON + DATA + "try{localStorage.setItem('cam_intro_seen_v1', JSON.stringify({bienvenida:'2026-11-18'}))}catch(e){}"
    with fp.full_page(fake_js=js, dark=dark, width=390, height=844, touch=True) as page:
        never_opens(page, 'Inicio ya vista', 2500)
        go(page, 'NFL')
        st = wait_open(page, f'NFL {tag}')
        assert st['card'] == 'nfl' and st['title'] == 'La NFL, semana a semana' and st['rows'] == 3, st
        assert any(h == 'El editor va con los Lions contra los Patriots. ¿Y tú?' for h in st['hooks']), st['hooks']
        assert any(h.replace('\u00a0', ' ').startswith('Quedan 1 d') and h.endswith('para elegir el próximo partido de la NFL.') for h in st['hooks']), st['hooks']
        assert st['primary'] == '¿Le ganas al editor?', st
        shot(page, f'nfl-{tag}')
        page.click('#camIntro .cam-intro-primary')
        st = wait_closed(page, 'NFL')
        assert st['tab'] == 'semana', f'abre La semana: {st["tab"]}'
        assert st['info'] == '¿Qué hay en NFL?', st['info']
        page.click('#camSectionTabs > .cam-intro-info')
        st = wait_open(page, 'la «i» de NFL')
        assert st['card'] == 'nfl', st
        page.keyboard.press('Escape'); wait_closed(page, 'Escape')

        go(page, 'Fútbol')
        st = wait_open(page, f'Fútbol {tag}')
        assert st['card'] == 'futbol' and st['title'] == 'Liga MX, LaLiga, Premier y Champions', st
        assert any(h.replace('\u00a0', ' ').startswith('Quedan 2 d') and h.endswith('para elegir el próximo partido de LaLiga.') for h in st['hooks']), st['hooks']
        shot(page, f'futbol-{tag}')
        page.mouse.click(195, 60)   # fuera de la hoja
        wait_closed(page, 'tocar fuera')

        go(page, 'Picks')
        st = wait_open(page, f'Picks {tag}')
        assert st['card'] == 'picks' and st['primary'] == 'Preparar mi primer Pick', st
        shot(page, f'picks-{tag}')
        swipe_down(page)
        wait_closed(page, 'deslizar hacia abajo')

        go(page, 'Opiniones')
        st = wait_open(page, f'Actualidad {tag}')
        assert st['card'] == 'actualidad' and st['primary'] == 'Ver lo más debatido', st
        shot(page, f'actualidad-{tag}')
        page.click('#camIntro .cam-intro-close'); wait_closed(page, 'la ×')

        # Ya vistas: volver a NFL no la repite.
        go(page, 'NFL'); never_opens(page, 'NFL otra vez', 2500)
        st = state(page)
        assert all(st['seen'].get(k) for k in ('nfl', 'futbol', 'picks', 'actualidad')), st['seen']
        assert not page.errors, page.errors
    print(f'  ok · tarjetas de sección {tag}: datos reales, botones, «i» y cierres')


def swipe_down(page):
    cdp = page.context.new_cdp_session(page)
    box = page.evaluate("(() => { const r = document.querySelector('#camIntro .cam-intro-sheet').getBoundingClientRect(); return [r.left + r.width / 2, r.top + 40]; })()")
    x, y = box
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    for i in range(1, 13):
        page.wait_for_timeout(15)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y + 14 * i}]})
    cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})


def deep_link_and_swipe_hint():
    with fp.full_page(fake_js=ON + DATA, width=390, height=844, touch=True) as page:
        base = page.url.split('?')[0]
        page.goto(base + '?s=nfl', wait_until='load'); page.wait_for_timeout(600)
        st = wait_open(page, 'enlace a NFL')
        assert st['card'] == 'nfl', f'con enlace a una sección sale su tarjeta, no la bienvenida: {st["card"]}'
        page.wait_for_timeout(2500)
        assert not state(page)['swipeHint'], 'el aviso de «desliza» no sale encima de la tarjeta'
        page.click('#camIntro .cam-intro-secondary'); wait_closed(page, 'Ahora no')
        page.wait_for_function('window.camSectionSwipe.hinting()', timeout=4000)
        go(page, 'Todos'); never_opens(page, 'Inicio tras llegar por enlace', 3000)
        assert not page.errors, page.errors
    print('  ok · enlace a una sección: su tarjeta sin bienvenida; el aviso de «desliza» sale después')


def calm():
    # Bajando la página sin parar desde que carga y durante más de 10 s: no sale (otra visita).
    # El desplazamiento lo hace la propia página cada 200 ms (no depende de lo que tarde la prueba).
    scroller = """document.addEventListener('DOMContentLoaded', () => { let i = 0; window.__scroller = setInterval(() => {
      window.scrollBy(0, i++ % 2 ? -140 : 140); window.dispatchEvent(new Event('scroll')); }, 200); });"""
    with fp.full_page(fake_js=ON + DATA + scroller, width=390, height=844, touch=True) as page:
        for i in range(23):
            page.wait_for_timeout(500)
            assert not state(page)['open'], 'no sale mientras baja la página'
        page.evaluate("clearInterval(window.__scroller)")
        page.wait_for_timeout(1500)
        st = state(page)
        assert not st['open'] and st['pending'] is None and not st['seen'].get('bienvenida'), st
    print('  ok · calma: no interrumpe a quien está bajando la página')


def narrow_desktop_motion():
    with fp.full_page(fake_js=ON + DATA, dark=True, width=320, height=640) as page:
        st = wait_open(page, '320 px')
        shot(page, 'bienvenida-320')
        for i in range(2):
            page.click('#camIntro .cam-intro-primary'); page.wait_for_timeout(400)
            st = state(page)
            assert not st['cut'] and st['overflow'] <= 1, st
            assert st['box']['top'] >= 0, f'cabe en la pantalla {st["box"]}'
        shot(page, 'bienvenida-320-paso3')
    with fp.full_page(fake_js=ON + DATA, dark=False, width=1366, height=900) as page:
        st = wait_open(page, 'ordenador')
        assert st['box']['width'] <= 460 and abs(st['box']['left'] - (1366 - st['box']['width']) / 2) <= 2, st['box']
        assert st['box']['bottom'] < 900, f'centrada, no pegada abajo {st["box"]}'
        shot(page, 'bienvenida-ordenador')
    with fp.full_page(fake_js=ON + DATA, width=390, height=844, reduced_motion=True) as page:
        st = wait_open(page, 'reducir movimiento')
        assert st['anim'] in ('none', ''), st['anim']
        page.click('#camIntro .cam-intro-close')
        assert not state(page)['open'], 'se cierra al momento'
    print('  ok · 320 px, ordenador centrado y «reducir movimiento»')


first_visit(True)
first_visit(False)
no_welcome_cases()
sections(True)
sections(False)
deep_link_and_swipe_hint()
calm()
narrow_desktop_motion()
print('PASS: bienvenida y tarjetas de sección')
