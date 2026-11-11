"""Dos ajustes del 10 nov 2026, sobre la página completa (Chromium + Supabase falso):

1. Inicio: el bloque de atajos (Quiniela NFL, Quiniela Fútbol, Publicar Take,
   Publicar Pick) se titula «Comparte tu sabiduría» en el teléfono (desplegable) y
   en el carril del ordenador; el título se lee entero (una línea en el teléfono), sin subtítulo, y los
   cuatro atajos siguen en su sitio.
2. Picks: el momio del feed va en cian suave (texto, borde y un fondo muy tenue del
   mismo tono), con contraste de texto ≥ 4,5:1 de día y de noche. Nada más cambia de
   color: el título «Últimos Picks», los votos y el momio de los platos siguen igual.

320, 390 y 1366 px, de día y de noche.
Uso: python3 -B tests/inicio-atajos-y-momio.py [--shots DIR]
"""
import importlib.util, json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
# El cliente falso ignora gt/lt y abortSignal: los platos separan Mejores (>0) y Peores (<0).
fp.FAKE_CLIENT = fp.FAKE_CLIENT.replace("'gt', 'lt', ", "").replace("'overlaps']", "'overlaps', 'abortSignal']").replace(
    "q.neq = (col, val) =>",
    "q.gt = (col, val) => { state.filters.push(r => r[col] > val); return q; };\n"
    "    q.lt = (col, val) => { state.filters.push(r => r[col] < val); return q; };\n"
    "    q.neq = (col, val) =>")
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
U = lambda n: '%08d-0000-4000-8000-000000000000' % n
TITLE = 'Comparte tu sabiduría'
MOMIO = {False: ('rgb(10, 101, 120)', 'rgba(34, 211, 238, 0.1)', 'rgba(14, 116, 144, 0.45)'),
         True: ('rgb(111, 216, 232)', 'rgba(34, 211, 238, 0.1)', 'rgba(34, 211, 238, 0.45)')}


def pick(i, author, title, selection, sport, odds, up, down):
    return {'id': U(100 + i), 'user_id': U(i + 1), 'author': author, 'title': title, 'explanation': 'Mi razonamiento del Pick.',
            'legs': [{'event': title, 'selection': selection, 'sport': sport, 'odds': odds}], 'american_odds': odds, 'event_date': '2099-11-15',
            'created_at': '2026-11-09T17:%02d:00Z' % (59 - i), 'moderation_status': 'approved', 'outcome': 'pending', 'settled_at': None,
            'result_points': 0, 'upvotes': up, 'downvotes': down, 'score': up - down, 'comments_count': i, 'my_vote': 0, 'is_current_week': True}


FEED = [pick(0, 'tribuna_azteca', 'Querétaro vs. Monterrey', 'Resultado final (tiempo regular): Monterrey', 'Fútbol', 110, 3, 1),
        pick(1, 'kingdom_chiefs', 'Atlanta Falcons vs. Kansas City Chiefs', 'Ganador del partido: Kansas City Chiefs', 'NFL', -175, 5, 0),
        pick(2, 'colchonero_sur', 'Real Betis vs. Atlético Madrid', 'Resultado final (tiempo regular): Atlético Madrid', 'Fútbol', 135, 0, 2)]
FAKE = ("try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}\n"
        'window.__fake.tables=Object.assign(window.__fake.tables||{},' + json.dumps({'ae_pick_feed': FEED}) + ');')


def rgba(text):
    n = [float(x) for x in re.findall(r'[\d.]+', text)]
    return n[:3], (n[3] if len(n) > 3 else 1.0)


def luminance(rgb):
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = [f(c / 255) for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(ink, tint, surface):
    (fg, _), (tc, ta), (bg, _) = rgba(ink), rgba(tint), rgba(surface)
    over = [tc[i] * ta + bg[i] * (1 - ta) for i in range(3)]
    hi, lo = sorted((luminance(fg), luminance(over)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


HOME = """() => {
  const vis = e => !!e && e.getClientRects().length > 0;
  const phone = document.querySelector('#camHomeJornada .cam-hj-shortcuts-disclosure > summary'), rail = document.getElementById('camDeskRailTitle');
  const title = [phone, rail].find(vis);
  const block = title.closest('.cam-hj-shortcuts-disclosure, #camDeskRail');
  if (block.tagName === 'DETAILS') block.open = true;
  const r = title.getBoundingClientRect();
  return {
    where: title === phone ? 'phone' : 'rail', text: title.textContent, visibleTitles: [phone, rail].filter(vis).length,
    lines: (() => { const range = document.createRange(); range.selectNodeContents(title); return new Set([...range.getClientRects()].filter(b => b.width > 1).map(b => Math.round(b.top))).size; })(),
    clipped: title.scrollWidth > title.clientWidth + 1 || r.left < 0 || r.right > innerWidth + 1,
    old: [...document.querySelectorAll('#mainContent *')].filter(e => vis(e) && e.children.length === 0 && e.textContent.trim() === 'Atajos').length,
    nav: document.querySelector('.cam-hj-shortcuts').getAttribute('aria-label'),
    shortcuts: [...block.querySelectorAll('.cam-hj-shortcuts > .cam-hj-shortcut')].filter(vis).map(b => b.dataset.shortcut),
    extra: [...block.children].filter(vis).map(e => e.className.split(' ')[0] || e.tagName),
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
}"""
PICKS = """() => {
  const css = (e, keys) => { const c = getComputedStyle(e); return keys.map(k => c[k]); };
  const odds = [...document.querySelectorAll('#cpFeed > .cam-pk .cam-pk-odds')];
  const card = odds[0].closest('.cam-pk'), heading = document.querySelector('#cpFeedHeading h3'), plato = document.querySelector('.cam-plato-odds');
  return {
    texts: odds.map(o => o.firstChild.textContent),
    notes: odds.map(o => o.querySelector('.cam-pick-impact')).filter(Boolean).map(n => getComputedStyle(n).color),
    odds: odds.map(o => css(o, ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'borderTopWidth', 'borderTopStyle'])),
    surface: getComputedStyle(document.getElementById('cpFeed')).backgroundColor,
    clipped: odds.some(o => o.scrollWidth > o.clientWidth + 1),
    others: {choice: css(card.querySelector('.cam-pk-choice'), ['color'])[0], user: css(card.querySelector('.cam-pk-user, .cp-author, [class*=user]'), ['color'])[0],
      vote: css(card.querySelector('.cp-upvote'), ['color'])[0], heading: heading ? css(heading, ['color'])[0] : null, plato: plato ? css(plato, ['color'])[0] : null},
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
}"""


def check(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    height = 844 if width < 700 else 900
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=height, scale=1) as page:
        page.wait_for_selector('.cam-hj-shortcuts', state='attached', timeout=15000)
        page.wait_for_timeout(700)
        st = page.evaluate(HOME)
        assert st['where'] == ('phone' if width <= 760 else 'rail') and st['visibleTitles'] == 1, f'{where}: un solo título de atajos visible {st}'
        assert st['text'] == TITLE and st['nav'] == TITLE and st['old'] == 0, f'{where}: el bloque se titula «{TITLE}» {st}'
        # El carril del ordenador mide 148 px entre 1280 y 1599 px: ahí el título ocupa dos líneas, sin cortes.
        assert st['lines'] <= (1 if width <= 760 else 2) and not st['clipped'], f'{where}: el título se lee entero, sin cortes {st}'
        assert st['shortcuts'] == ['nfl', 'football', 'take', 'pick'] + ([] if width <= 760 else ['parties']), f'{where}: atajos {st["shortcuts"]}'
        assert st['extra'] == (['cam-desk-rail-toggle', 'cam-hj-shortcuts'] if width <= 760 else ['cam-desk-rail-in']), f'{where}: sin subtítulo ni piezas nuevas {st["extra"]}'
        assert st['overflow'] <= 0, f'{where}: Inicio no se desplaza de lado'
        if SHOTS:
            page.wait_for_timeout(200)
            page.locator('#camHomeJornada .cam-hj-shortcuts-disclosure' if width <= 760 else '#camDeskRail').screenshot(path=str(SHOTS / f'atajos-{where}.png'))

        page.goto(page.url.split('?')[0] + '?s=picks', wait_until='load')
        page.wait_for_selector('#cpFeed > .cam-pk', timeout=15000)
        page.wait_for_timeout(700)
        st = page.evaluate(PICKS)
        ink, tint, line = MOMIO[dark]
        assert st['texts'] == ['+110', '−175', '+135'] and not st['clipped'], f'{where}: momios {st["texts"]}'
        for odds in st['odds']:
            assert odds[0] == ink and odds[1] == tint, f'{where}: momio en cian suave con fondo tenue {odds}'
            assert odds[2:6] == [line] * 4 and odds[6] == '1px' and odds[7] == 'solid', f'{where}: el recuadro del momio lleva el borde cian {odds}'
        ratio = contrast(ink, tint, st['surface'])
        assert ratio >= 4.5, f'{where}: contraste del momio {ratio:.2f}:1'
        cyan = {ink, line}
        assert not cyan & set(st['notes']), f'{where}: la nota de liga del recuadro no cambia de color {st["notes"]}'
        assert not cyan & {v for v in st['others'].values() if v}, f'{where}: el cian es solo para el momio {st["others"]}'
        assert st['overflow'] <= 0, f'{where}: Picks no se desplaza de lado'
        if SHOTS:
            page.locator('#cpFeed > .cam-pk').nth(1).screenshot(path=str(SHOTS / f'momio-{where}.png'))
        assert not page.errors, f'{where}: errores {page.errors}'
    print(f'  ok {where} · contraste del momio {ratio:.1f}:1')


for width in (320, 390, 1366):
    for dark in (False, True):
        check(width, dark)
print('PASS: «Comparte tu sabiduría» en Inicio y momio del feed en cian suave (320/390/1366, día y noche).')
