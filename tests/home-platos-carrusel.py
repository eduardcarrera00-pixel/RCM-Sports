"""Inicio · «Picks de la comunidad» en un solo carrusel (14 nov 2026, noche).

Pedido de Eduard: el boleto no debe estar solo en «Mejores platos»; tiene que explicar
rápido qué es un Pick y, después, salir los mejores y los peores platos, todo en carrusel.
Eligió la opción A: dos accesos junto al boleto.

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).

Cubre:
  · orden: boleto → rombos con «Mejores platos →» y «Peores platos →» → 5 mejores →
    rótulo «Peores platos» → 5 peores → «Ver todos los Picks →» (las listas traen más);
  · 18 nov 2026 · la tarjeta es «La comanda del Chef» (opción C): gorro, «Cocina tu Pick», la comanda
    en papel con borde dentado (dos selecciones con su momio en gris, −150 y +125, que combinados dan
    el total +275), «Comparte tu apuesta y pelea por el primer lugar…» y «Cocinar mi Pick ›»; nada se sale de la tarjeta, los rombos la acompañan a todo su alto y los
    platos siguen de 164 px, arriba;
  · ya no hay títulos «Mejores platos»/«Peores platos» ni una segunda fila (#camHomeWorstPlates);
  · tocar «Peores platos →» deja el rótulo al principio del carrusel; «Mejores platos →», el primer plato;
  · votos con ▲ (verde) en los mejores y ▼ (teja) en los peores, colores distintos;
  · solo peores: un acceso y sin rótulo; sin votos: el boleto y «Aún sin votos esta semana»;
  · 320/360/390 de día y de noche (accesos enteros junto al boleto desde 360 px) y escritorio 1366, sin desplazamiento horizontal ni errores.

Uso: python3 -B tests/home-platos-carrusel.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
# El cliente falso ignora gt/lt: los platos separan Mejores (>0) y Peores (<0).
fp.FAKE_CLIENT = fp.FAKE_CLIENT.replace("'gt', 'lt', ", "").replace(
    "q.neq = (col, val) =>",
    "q.gt = (col, val) => { state.filters.push(r => r[col] > val); return q; };\n"
    "    q.lt = (col, val) => { state.filters.push(r => r[col] < val); return q; };\n"
    "    q.neq = (col, val) =>")
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
U = lambda n: '%08d-0000-4000-8000-000000000000' % n

GAMES = [('Querétaro vs. Monterrey', 'Resultado final (tiempo regular): Monterrey', 'Fútbol'),
         ('Detroit Lions vs. New England Patriots', 'Ganador del partido: New England Patriots', 'NFL'),
         ('Atlanta Falcons vs. Kansas City Chiefs', 'Ganador del partido: Kansas City Chiefs', 'NFL'),
         ('Real Betis vs. Atlético Madrid', 'Resultado final (tiempo regular): Atlético Madrid', 'Fútbol')]
SCORES = [9, 6, 3, 2, 2, 1, 1, -5, -4, -4, -3, -2, -1]


def pick(i, score):
    event, selection, sport = GAMES[i % len(GAMES)]
    up, down = (score, 0) if score > 0 else (0, -score)
    return {'id': U(300 + i), 'user_id': U(i + 1), 'author': 'chef_%02d' % i, 'title': event, 'explanation': '',
            'legs': [{'event': event, 'selection': selection, 'sport': sport, 'odds': 110}], 'american_odds': 110 + i,
            'event_date': '2099-11-16', 'created_at': '2026-11-14T12:%02d:00Z' % i, 'moderation_status': 'approved',
            'outcome': 'pending', 'settled_at': None, 'result_points': 0, 'upvotes': up, 'downvotes': down, 'score': score,
            'comments_count': 0, 'my_vote': 0, 'is_current_week': True}


def fake(scores):
    feed = [pick(i, s) for i, s in enumerate(scores)]
    return ("try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}"
            "window.__fake.tables=Object.assign(window.__fake.tables||{}," + json.dumps({'ae_pick_feed': feed}) + ");")


STATE = """() => {
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const list = document.getElementById('camHomeBestPlates');
  const items = [...list.children];
  const kind = li => li.classList.contains('cam-home-plate-intro') ? 'intro'
    : li.classList.contains('cam-home-plate-access') ? 'access'
    : li.classList.contains('cam-home-plate-label') ? 'label'
    : li.classList.contains('cam-home-plate-more') ? 'more'
    : li.classList.contains('is-best') ? 'best' : li.classList.contains('is-worst') ? 'worst' : li.className;
  const card = list.querySelector('.cam-home-parlay');
  const inside = (outer, inner) => { const a = outer.getBoundingClientRect(), b = inner.getBoundingClientRect(); return b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1; };
  const votes = cls => { const v = list.querySelector('.cam-home-plate-row.' + cls + ' .cam-home-plate-votes'); return v ? [v.textContent, getComputedStyle(v).color] : null; };
  return {
    scrollWidth: document.documentElement.scrollWidth,
    visible: vis(document.getElementById('camHomePicks')) && vis(list),
    order: items.map(kind),
    access: [...list.querySelectorAll('.cam-home-plate-access .cam-home-plate-sep-text')].map(e => e.textContent),
    accessButtons: list.querySelectorAll('.cam-home-plate-access button').length,
    label: list.querySelector('.cam-home-plate-label')?.textContent || null,
    more: list.querySelector('.cam-home-plate-more')?.textContent || null,
    lead: list.querySelector('.cam-home-parlay-lead')?.textContent || null,
    title: card?.querySelector('.cam-home-parlay-title')?.textContent || null,
    cta: card?.querySelector('.cam-home-parlay-cta')?.textContent || null,
    hat: !!card?.querySelector('.cam-home-parlay-head svg.cam-home-parlay-hat[aria-hidden="true"]'),
    paper: (() => { const e = card?.querySelector('.cam-home-parlay-paper'); if (!e) return null; const cs = getComputedStyle(e);
      return { clip: cs.clipPath.startsWith('polygon'), bg: cs.backgroundColor, ink: cs.color,
        legs: [...e.querySelectorAll('.cam-home-parlay-selection')].map(l => l.textContent), odds: e.querySelector('.cam-home-parlay-odds')?.textContent,
        legOdds: [...e.querySelectorAll('.cam-home-parlay-leg-odds')].map(l => l.textContent),
        legOddsColor: [...e.querySelectorAll('.cam-home-parlay-leg-odds')].map(l => getComputedStyle(l).color),
        total: e.querySelector('.cam-home-parlay-total-label')?.textContent,
        cut: [...e.querySelectorAll('.cam-home-parlay-selection')].some(l => l.scrollWidth > l.clientWidth + 1)
          || [...e.querySelectorAll('.cam-home-parlay-leg')].some(l => l.scrollWidth > l.clientWidth + 1),
        rounded: [...e.querySelectorAll('span'), ...list.querySelectorAll('.cam-home-plate-sep-diamond')].some(x => getComputedStyle(x).borderRadius !== '0px') }; })(),
    ctaHeight: Math.round(card?.querySelector('.cam-home-parlay-cta')?.getBoundingClientRect().height || 0),
    accessHeight: Math.round(list.querySelector('.cam-home-plate-access')?.getBoundingClientRect().height || 0),
    rowTop: (() => { const r = list.querySelector('.cam-home-plate-row'), i = list.querySelector('.cam-home-plate-intro'); return r && i ? Math.round(r.getBoundingClientRect().top - i.getBoundingClientRect().top) : null; })(),
    cardFits: !!card && [...card.children].every(c => inside(card, c)),
    titleOneLine: !!card && card.querySelector('.cam-home-parlay-title').getBoundingClientRect().height < 30,
    introHeight: Math.round(list.querySelector('.cam-home-plate-intro')?.getBoundingClientRect().height || 0),
    rowHeight: Math.round(list.querySelector('.cam-home-plate-row')?.getBoundingClientRect().height || 0),
    accessFits: [...list.querySelectorAll('.cam-home-plate-sep')].every(s => { const box = s.firstElementChild; return box.scrollHeight <= s.getBoundingClientRect().height + 1 && box.scrollWidth <= s.getBoundingClientRect().width + 1; }),
    accessShown: (() => { const a = list.querySelector('.cam-home-plate-access'); if (!a) return 0; const r = a.getBoundingClientRect(), l = list.getBoundingClientRect(); return Math.round(Math.min(r.right, l.right) - r.left - (r.width - a.querySelector('.cam-home-plate-sep-link').scrollWidth) / 2); })(),
    accessWidth: Math.round(list.querySelector('.cam-home-plate-access .cam-home-plate-jump')?.getBoundingClientRect().width || 0),
    best: votes('is-best'), worst: votes('is-worst'),
    oldTitles: document.querySelectorAll('#camHomeBestTitle,#camHomeWorstTitle,#camHomeWorstPlates').length,
    state: list.dataset.camContentState,
  };
}"""

LEFT = """sel => { const list = document.getElementById('camHomeBestPlates'), e = list.querySelector(sel);
  return Math.round(e.getBoundingClientRect().left - list.getBoundingClientRect().left); }"""


def open_page(scores, width, dark):
    return fp.full_page(fake_js=fake(scores), dark=dark, width=width, height=844 if width < 700 else 900, reduced_motion=True)


def ready(page):
    page.wait_for_selector('#camHomeBestPlates .cam-home-plate-intro', state='attached', timeout=15000)
    page.wait_for_function("document.getElementById('camHomeBestPlates').dataset.camContentState", timeout=15000)
    page.wait_for_timeout(500)
    page.locator('#camHomePicks').scroll_into_view_if_needed()
    page.wait_for_timeout(200)


def contrast(a, b):
    lum = lambda c: (lambda r, g, b: 0.2126 * r + 0.7152 * g + 0.0722 * b)(*[(v / 255 / 12.92) if v / 255 <= 0.03928 else ((v / 255 + 0.055) / 1.055) ** 2.4 for v in map(int, c[c.index('(') + 1:c.index(')')].split(',')[:3])])
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def comanda(st, where):
    assert st['title'] == 'Cocina tu Pick' and st['hat'], f'{where}: gorro y título {st["title"]}'
    assert st['lead'] == 'Comparte tu apuesta y pelea por el primer lugar de CAM Sports. Compite y demuestra que eres el mejor.', f'{where}: texto {st["lead"]}'
    assert st['cta'] == 'Cocinar mi Pick ›' and st['ctaHeight'] >= 38, f'{where}: botón {st["cta"]} ({st["ctaHeight"]} px)'
    pa = st['paper']
    assert pa and pa['clip'] and pa['legs'] == ['Más de 49.5 · NE–DET', 'Más de 47.5 · KC–ATL'] and pa['odds'] == '+275', f'{where}: comanda {pa}'
    assert pa['legOdds'] == ['−150', '+125'] and pa['total'] == 'Momio total', f'{where}: momios {pa["legOdds"]} / {pa["total"]}'
    american = lambda t: int(t.replace('−', '-'))
    decimal = 1
    for o in map(american, pa['legOdds']): decimal *= 1 + o / 100 if o > 0 else 1 + 100 / -o
    combined = round((decimal - 1) * 100 if decimal >= 2 else -100 / (decimal - 1))
    assert '+%d' % combined == pa['odds'] == '+275', f'{where}: el total ({pa["odds"]}) es la combinación de {pa["legOdds"]} ({combined})'
    assert all(contrast(c, pa['bg']) >= 4.5 for c in pa['legOddsColor']) and len(set(pa['legOddsColor'])) == 1 and pa['legOddsColor'][0] != pa['ink'], f'{where}: momios en gris legible {pa["legOddsColor"]} sobre {pa["bg"]}'
    assert not pa['cut'], f'{where}: las selecciones y sus momios se leen enteros'
    assert not pa['rounded'], f'{where}: filetes rectos en la comanda y rombos (no círculos)'
    assert pa['ink'] == 'rgb(19, 50, 77)' and pa['bg'] in ('rgb(255, 253, 249)', 'rgb(244, 232, 219)'), f'{where}: papel {pa["bg"]} / {pa["ink"]}'
    assert st['cardFits'] and st['titleOneLine'], f'{where}: la comanda cabe en su tarjeta'
    assert 164 <= st['introHeight'] <= 300, f'{where}: alto de la tarjeta {st["introHeight"]}'
    assert st['accessHeight'] == st['introHeight'], f'{where}: rombos a todo el alto ({st["accessHeight"]}/{st["introHeight"]})'
    if st['rowHeight']:
        assert st['rowHeight'] == 164 and st['rowTop'] == 0, f'{where}: platos de 164 px arriba ({st["rowHeight"]}, {st["rowTop"]})'


def full(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with open_page(SCORES, width, dark) as page:
        ready(page)
        st = page.evaluate(STATE)
        assert st['visible'], f'{where}: la sección se ve'
        assert st['scrollWidth'] <= width, f'{where}: desplazamiento horizontal {st["scrollWidth"]}'
        assert st['order'] == ['intro', 'access'] + ['best'] * 5 + ['label'] + ['worst'] * 5 + ['more'], f'{where}: orden {st["order"]}'
        assert st['access'] == ['Mejores platos', 'Peores platos'] and st['accessButtons'] == 2, f'{where}: accesos {st["access"]}'
        assert st['label'] == 'Peores platos' and st['more'].startswith('Ver todos los Picks'), f'{where}: rótulos {st["label"]} / {st["more"]}'
        comanda(st, where)
        assert st['accessFits'], f'{where}: los rombos y sus textos caben'
        need = 40 if width < 360 else 80
        assert st['accessShown'] >= need or width >= 1024, f'{where}: los accesos se ven junto al boleto ({st["accessShown"]} px)'
        assert st['best'][0].startswith('▲ 9 votos') and st['worst'][0].startswith('▼ 5 votos'), f'{where}: votos {st["best"]} {st["worst"]}'
        assert st['best'][1] != st['worst'][1], f'{where}: ▲ y ▼ con colores distintos'
        assert st['oldTitles'] == 0, f'{where}: sin títulos ni segunda fila'
        if SHOTS: page.locator('#camHomePicks').screenshot(path=str(SHOTS / f'carrusel-{where}.png'))
        # Accesos: «Peores platos →» deja el rótulo al principio; «Mejores platos →», el primer plato.
        page.click('#camHomeBestPlates .cam-home-plate-jump.is-worst'); page.wait_for_timeout(400)
        left = page.evaluate(LEFT, '.cam-home-plate-label')
        assert abs(left) <= 3, f'{where}: «Peores platos →» lleva al rótulo ({left})'
        if SHOTS: page.locator('#camHomePicks').screenshot(path=str(SHOTS / f'carrusel-{where}-peores.png'))
        page.evaluate("document.getElementById('camHomeBestPlates').scrollLeft = 0"); page.wait_for_timeout(150)
        page.click('#camHomeBestPlates .cam-home-plate-jump.is-best'); page.wait_for_timeout(400)
        assert abs(page.evaluate(LEFT, '.cam-home-plate-row.is-best')) <= 3, f'{where}: «Mejores platos →» lleva al primer plato'
        assert not page.errors, f'{where}: errores {page.errors}'
    print('ok', where)


def partial():
    with open_page([-3, -1], 390, True) as page:
        ready(page)
        st = page.evaluate(STATE)
        assert st['order'] == ['intro', 'access', 'worst', 'worst', 'more'], f'solo peores: {st["order"]}'
        assert st['access'] == ['Peores platos'] and st['label'] is None, f'solo peores: {st["access"]}'
        page.click('#camHomeBestPlates .cam-home-plate-jump.is-worst'); page.wait_for_timeout(400)
        assert abs(page.evaluate(LEFT, '.cam-home-plate-row.is-worst')) <= 3, 'solo peores: el acceso lleva al primer plato'
        assert not page.errors, page.errors
    with open_page([], 390, False) as page:
        ready(page)
        st = page.evaluate(STATE)
        assert st['visible'] and st['state'] == 'empty', f'sin votos: la sección sigue a la vista ({st["state"]})'
        assert st['order'] == ['intro', 'access'] and st['access'] == ['Aún sin votos esta semana'] and st['accessButtons'] == 0, f'sin votos: {st}'
        comanda(st, 'sin votos')
        if SHOTS: page.locator('#camHomePicks').screenshot(path=str(SHOTS / 'carrusel-sin-votos.png'))
        assert not page.errors, page.errors
    print('ok solo peores / sin votos')


for w, d in [(390, True), (390, False), (360, True), (320, True), (320, False), (1366, True)]:
    full(w, d)
partial()
print('PASS: un solo carrusel con la comanda del Chef, accesos a Mejores y Peores platos, ▲/▼ y casos sin votos.')
