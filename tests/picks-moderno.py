"""Picks moderno (9 nov 2026) sobre la página completa (Chromium + Supabase falso).
Uso: python3 -B tests/picks-moderno.py [--shots DIR]
Comprueba en 360/390/1366 px, día y noche:
  · feed sin scroll propio: 6 Picks en el flujo y el resto en «Ver todos los Picks»;
  · cada Pick: @usuario · deporte, pronóstico, momio a la derecha (con «−»), sin
    «paga», «cierra en» ni fechas; ▲ ▼, responder y compartir; combinada con su rótulo;
  · Platos de la semana: filas con número, @usuario · momio y barra de votos;
    en el teléfono una pestaña a la vez (Mejores / Peores), en el ordenador lado a lado;
    «Ver los N» despliega del 6.º en adelante;
  · sin desplazamiento horizontal y sin errores; Inicio sigue con la tarjeta de siempre.
Sustituye a picks-feed-scroll-browser.cjs (la ventana con scroll interno ya no existe).
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
# El cliente falso ignora gt/lt y abortSignal: los platos separan Mejores (>0) y Peores (<0).
fp.FAKE_CLIENT = fp.FAKE_CLIENT.replace("'gt', 'lt', ", "").replace("'overlaps']", "'overlaps', 'abortSignal']").replace(
    "q.neq = (col, val) =>",
    "q.gt = (col, val) => { state.filters.push(r => r[col] > val); return q; };\n"
    "    q.lt = (col, val) => { state.filters.push(r => r[col] < val); return q; };\n"
    "    q.neq = (col, val) =>")
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
U = lambda n: '%08d-0000-4000-8000-000000000000' % n


def leg(event, selection, sport, odds, outcome=None):
    return dict(event=event, selection=selection, sport=sport, odds=odds, **({'outcome': outcome} if outcome else {}))


RAW = [  # autor, id usuario, título, legs, momio, fecha, estado, ▲, ▼
    ('tribuna_azteca', 1, 'Querétaro vs. Monterrey', [leg('Querétaro vs. Monterrey', 'Resultado final (tiempo regular): Monterrey', 'Fútbol', 110)], 110, '2099-11-14', 'pending', 3, 1),
    ('kingdom_chiefs', 2, 'Atlanta Falcons vs. Kansas City Chiefs', [leg('Atlanta Falcons vs. Kansas City Chiefs', 'Ganador del partido: Kansas City Chiefs', 'NFL', -175)], -175, '2099-11-15', 'pending', 5, 0),
    ('madridista_en_serie', 3, 'Combinada · Seattle Seahawks + San Francisco 49ers',
     [leg('Las Vegas Raiders vs. Seattle Seahawks', 'Ganador del partido: Seattle Seahawks', 'NFL', -278),
      leg('Dallas Cowboys vs. San Francisco 49ers', 'Ganador del partido: San Francisco 49ers', 'NFL', -198)], 105, '2099-11-15', 'pending', 1, 2),
    ('reddevil_77', 4, 'Combinada · New England Patriots + Houston Texans',
     [leg('Detroit Lions vs. New England Patriots', 'Ganador del partido: New England Patriots', 'NFL', -130),
      leg('Cleveland Browns vs. Houston Texans', 'Ganador del partido: Houston Texans', 'NFL', -205)], 163, '2099-11-15', 'pending', 2, 0),
    ('flock_baltimore', 5, 'Minnesota Vikings vs. Buffalo Bills', [leg('Minnesota Vikings vs. Buffalo Bills', 'Ganador del partido: Buffalo Bills', 'NFL', -142)], -142, '2099-11-16', 'pending', 4, 1),
    ('greenbay_12', 8, 'Chicago Bears vs. Green Bay Packers', [leg('Chicago Bears vs. Green Bay Packers', 'Ganador del partido: Green Bay Packers', 'NFL', 120)], 120, '2099-11-16', 'pending', 2, 1),
    ('colchonero_sur', 7, 'Real Betis vs. Atlético Madrid', [leg('Real Betis vs. Atlético Madrid', 'Resultado final (tiempo regular): Atlético Madrid', 'Fútbol', 135)], 135, '2099-11-17', 'pending', 0, 2),
    ('sf_49ers', 9, 'San Francisco 49ers vs. Arizona Cardinals', [leg('San Francisco 49ers vs. Arizona Cardinals', 'Ganador del partido: San Francisco 49ers', 'NFL', -300)], -300, '2099-11-17', 'pending', 1, 0),
    ('buffalo_mafia', 6, 'Combinada · Seattle Seahawks + Tampa Bay Buccaneers',
     [leg('Seattle Seahawks vs. Arizona Cardinals', 'Ganador del partido: Seattle Seahawks', 'NFL', -650, 'won'),
      leg('Chicago Bears vs. Tampa Bay Buccaneers', 'Ganador del partido: Tampa Bay Buccaneers', 'NFL', 215, 'lost')], 263, '2026-11-08', 'lost', 1, 4),
    ('flock_baltimore', 5, 'Indianapolis Colts vs. Dallas Cowboys', [leg('Indianapolis Colts vs. Dallas Cowboys', 'Ganador del partido: Dallas Cowboys', 'NFL', -218)], -218, '2026-11-08', 'won', 6, 1),
]
FEED = [{'id': U(100 + i), 'user_id': U(uid), 'author': a, 'title': t, 'explanation': 'Mi razonamiento del Pick.', 'legs': legs,
         'american_odds': odds, 'event_date': day, 'created_at': '2026-11-09T17:%02d:00Z' % (59 - i), 'moderation_status': 'approved',
         'outcome': state, 'settled_at': None if state == 'pending' else '2026-11-09T05:00:00Z', 'result_points': 0,
         'upvotes': up, 'downvotes': down, 'score': up - down, 'comments_count': i, 'my_vote': 0, 'is_current_week': True}
        for i, (a, uid, t, legs, odds, day, state, up, down) in enumerate(RAW)]
FAKE = ('window.__fake.tables=Object.assign(window.__fake.tables||{},' + json.dumps({'ae_pick_feed': FEED}) + ');')
ACTIVE = [p for p in FEED if p['outcome'] == 'pending']
BEST = sorted([p for p in FEED if p['score'] > 0], key=lambda p: -p['score'])
WORST = [p for p in FEED if p['score'] < 0]

STATE = """() => {
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const feed = document.getElementById('cpFeed');
  const cards = [...feed.querySelectorAll(':scope > .cp-card')];
  const rail = document.querySelector('#communityPicks > .ae-picks-rail');
  const rows = id => [...document.querySelectorAll('#' + id + ' > .cam-plato')];
  return {
    scrollWidth: document.documentElement.scrollWidth,
    cards: cards.length,
    allModern: cards.every(c => c.classList.contains('cam-pk') && !c.classList.contains('cam-ticket-card')),
    feedScrolls: feed.scrollHeight > feed.clientHeight + 2 || feed.classList.contains('ae-picks-feed-scrollable'),
    feedOverflow: getComputedStyle(feed).overflowY,
    hintVisible: vis(document.getElementById('cpFeedScrollHint')),
    footerVisible: vis(document.getElementById('cpViewAll')),
    texts: cards.map(c => c.innerText),
    odds: cards.map(c => c.querySelector('.cam-pk-odds')?.textContent),
    oddsRight: cards.every(c => { const o = c.querySelector('.cam-pk-odds').getBoundingClientRect(), m = c.querySelector('.cam-pk-main').getBoundingClientRect(); return o.left >= m.right - 1; }),
    actions: cards.every(c => c.querySelector('.cp-upvote') && c.querySelector('.cp-downvote') && c.querySelector('.cp-replies-button') && c.querySelector('.cam-pick-share-button')),
    combos: cards.filter(c => c.querySelector('.cam-pk-combo')).map(c => c.querySelectorAll('.cam-pk-leg').length),
    cardOverflow: cards.some(c => c.scrollWidth > c.clientWidth + 1),
    railVisible: vis(rail),
    tabsVisible: vis(document.querySelector('.cam-platos-tabs')),
    bestVisible: vis(document.querySelector('.ae-chef-best')),
    worstVisible: vis(document.querySelector('.ae-chef-worst')),
    bestRows: rows('picksPopular').length,
    bestShown: rows('picksPopular').filter(vis).length,
    worstRows: rows('picksQuestioned').length,
    ranks: rows('picksPopular').map(r => r.querySelector('.cam-plato-rank').textContent),
    bestNames: rows('picksPopular').map(r => r.querySelector('.cam-plato-name').textContent),
    worstMeta: rows('picksQuestioned').map(r => r.querySelector('.cam-plato-meta').textContent),
    bars: rows('picksPopular').every(r => r.querySelector('.cam-plato-bar > .is-up') && r.querySelector('.cam-plato-net')),
    moreText: document.querySelector('.ae-chef-best > .cam-platos-more')?.textContent,
    moreVisible: vis(document.querySelector('.ae-chef-best > .cam-platos-more')),
    pressed: [...document.querySelectorAll('.cam-platos-tabs [data-platos]')].map(b => b.getAttribute('aria-pressed')),
  };
}"""


def check(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=844 if width < 700 else 900) as page:
        page.goto(page.url.split('?')[0] + '?s=picks', wait_until='load')
        page.wait_for_selector('#cpFeed > .cam-pk', timeout=15000)
        page.wait_for_selector('#picksPopular > .cam-plato', state='attached', timeout=15000)
        page.wait_for_timeout(600)
        st = page.evaluate(STATE)
        assert st['scrollWidth'] <= width, f'{where}: desplazamiento horizontal {st["scrollWidth"]}'
        assert st['cards'] == 6 < len(ACTIVE), f'{where}: el feed enseña 6 Picks ({st["cards"]})'
        assert st['allModern'], f'{where}: tarjeta moderna en todo el feed'
        assert not st['feedScrolls'] and st['feedOverflow'] == 'visible', f'{where}: el feed no tiene scroll propio'
        assert not st['hintVisible'] and st['footerVisible'], f'{where}: sin «Desliza…» y con «Ver todos los Picks»'
        for text in st['texts']:
            assert not any(w in text.lower() for w in ('paga', 'cierra', '2099', 'nov ')), f'{where}: texto de sobra en «{text[:80]}»'
            assert 'Leer análisis' in text
        assert st['odds'][:2] == ['+110', '−175'], f'{where}: momios {st["odds"][:2]}'
        assert st['oddsRight'], f'{where}: el momio va a la derecha del pronóstico'
        assert st['actions'], f'{where}: ▲ ▼, responder y compartir en cada Pick'
        assert st['combos'] == [2, 2], f'{where}: combinadas {st["combos"]}'
        assert not st['cardOverflow'], f'{where}: nada se sale de su tarjeta'
        assert 'Gana Monterrey' in st['texts'][0] and '@tribuna_azteca' in st['texts'][0] and 'Fútbol' in st['texts'][0]
        assert st['railVisible'], f'{where}: Platos de la semana visible'
        assert st['bestRows'] == len(BEST) and st['worstRows'] == len(WORST), f'{where}: filas {st["bestRows"]}/{st["worstRows"]}'
        assert st['ranks'] == [str(i + 1) for i in range(len(BEST))]
        assert st['bestShown'] == 5 and st['moreVisible'] and st['moreText'] == f'Ver los {len(BEST)}', f'{where}: 5 visibles y «Ver los N»'
        assert st['bars'], f'{where}: saldo y barra en cada fila'
        assert all('Combinada' not in m for m in st['worstMeta']), f'{where}: el pie de la fila no repite «Combinada»'
        assert any(n.startswith('Gana ') for n in st['bestNames'])
        if width < 761:
            assert st['tabsVisible'] and st['bestVisible'] and not st['worstVisible'], f'{where}: una pestaña a la vez {st}'
            assert st['pressed'] == ['true', 'false']
            page.click('.cam-platos-tabs [data-platos="worst"]'); page.wait_for_timeout(150)
            st2 = page.evaluate(STATE)
            assert st2['worstVisible'] and not st2['bestVisible'] and st2['pressed'] == ['false', 'true'], f'{where}: pestaña Peores'
            page.click('.cam-platos-tabs [data-platos="best"]'); page.wait_for_timeout(150)
        else:
            assert not st['tabsVisible'] and st['bestVisible'] and st['worstVisible'], f'{where}: lado a lado en el ordenador'
        page.click('.ae-chef-best > .cam-platos-more'); page.wait_for_timeout(150)
        st3 = page.evaluate(STATE)
        assert st3['bestShown'] == len(BEST) and st3['moreText'] == 'Ver menos', f'{where}: «Ver los N» despliega'
        # Inicio, archivo y perfil siguen con la tarjeta de siempre.
        assert page.evaluate("window.renderCamPickCard(" + json.dumps(FEED[0]) + ").classList.contains('cam-ticket-card')")
        if SHOTS:
            page.evaluate("window.scrollTo(0,document.getElementById('communityPicks').getBoundingClientRect().top+scrollY-80)")
            page.wait_for_timeout(300)
            page.screenshot(path=f'{SHOTS}/picks-moderno-{where}.png')
        assert not page.errors, page.errors


for dark in (False, True):
    for width in (360, 390, 1366):
        check(width, dark)
print('PASS: Picks moderno · feed sin scroll propio (6 + «Ver todos»), Pick sin texto de sobra, platos en ranking con pestañas en el teléfono y lado a lado en el ordenador (360/390/1366, día y noche).')
