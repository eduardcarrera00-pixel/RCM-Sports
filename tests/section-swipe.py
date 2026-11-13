"""Deslizar con el dedo entre apartados (12 nov 2026).

Página completa en Chromium (tests/full-page.py, Supabase falso, sin red) con
toques reales enviados por el protocolo del navegador: el gesto pasa por el
mismo camino que en un teléfono, con el desplazamiento de la página incluido.

Cubre, a 390 px de día y de noche y a 320 px:
  · NFL y Fútbol: La semana → Takes → Noticias → La semana (vuelta) y hacia atrás;
  · Picks: Picks → Chefs → Historial → Picks; Actualidad: Todas → NFL → Fútbol →
    Colegial → Ciclismo → Todas, y hacia atrás;
  · la dirección (?s=nfl&v=takes) cambia igual que al tocar la pestaña;
  · arrastre lento y largo sí cambia; gesto rápido corto sí cambia;
  · no cambia: arrastre corto, bajar la página (y la página sí baja), diagonal,
    empezar en el borde, arrepentirse al final, empezar sobre algo que se
    desliza de lado (y eso sí se desliza);
  · mientras se arrastra asoma el nombre del apartado siguiente;
  · al terminar no queda ningún estilo en línea, ni desbordamiento lateral;
  · «reducir movimiento»: cambia sin animación;
  · escritorio (1366 px, pantalla táctil): NFL es una página continua y no
    cambia nada; Picks, que tiene pestañas, sí se desliza.

Uso: python3 -B tests/section-swipe.py [--shots DIR]
"""
import importlib.util, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

FAKE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {};
  const art = (n, category, days) => ({id: 'a000000' + n + '-0000-4000-8000-000000000000', title: category + ' · nota ' + n, category,
    author: 'Eduard Carrera', image: '', summary: 'Resumen de la nota ' + n, body: '<p>Texto ' + n + '</p>', featured: false,
    created_at: new Date(Date.now() - days * 864e5).toISOString(), is_public: true, image_focus_x: 50, image_focus_y: 50});
  F.tables.articles = [art(1, 'NFL', 1), art(2, 'Fútbol', 2), art(3, 'NFL', 3), art(4, 'Fútbol', 4)];
})();
"""

STATE = """() => {
  const sec = document.querySelector('#camSectionTabs:not([hidden]) [aria-current="true"]');
  const act = document.querySelector('#aeOpinions:not([hidden]) #aeOpinionsTabs [aria-selected="true"]');
  const moved = [...document.querySelectorAll('#mainContent > *, #aeOpinions > *')]
    .filter(e => e.style.transform || e.style.opacity || e.style.transition).map(e => (e.id || e.className) + ' {' + e.getAttribute('style') + '}');
  const peek = document.querySelector('body > .cam-swipe-peek');
  return { tab: sec ? sec.dataset.tab : act ? act.dataset.sport : null, url: location.search, y: Math.round(scrollY),
           moved, overflow: document.documentElement.scrollWidth - innerWidth, busy: window.camSectionSwipe.busy(),
           peek: peek && !peek.hidden ? { text: peek.textContent, ready: peek.classList.contains('is-ready'), side: peek.dataset.side } : null };
}"""

# Un punto del contenido donde empezar el gesto: dentro de la sección y fuera de
# lo que ya se desliza de lado (eso se prueba aparte).
SAFE_Y = """(area) => {
  const r = area === 'act' ? document.getElementById('aeOpinions') : document.getElementById('mainContent');
  const side = el => { for (let e = el; e; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true;
    if (e === r) break; } return false; };
  const tops = [document.getElementById('camSectionTabs'), document.getElementById('aeOpinionsTabs')]
    .filter(Boolean).map(e => e.getBoundingClientRect().bottom);
  for (let y = Math.max(120, ...tops) + 30; y < innerHeight - 90; y += 14) {
    const el = document.elementFromPoint(innerWidth / 2, y);
    if (el && r.contains(el) && !side(el) && !el.closest('input,textarea,select,[contenteditable],dialog,[role=slider],iframe,video,canvas')) return y;
  }
  return null;
}"""


def touch(cdp, kind, points):
    cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y} for x, y in points]})


def swipe(page, cdp, x0, y0, dx, dy=0, ms=220, steps=12, end=True, via=None):
    touch(cdp, 'touchStart', [(x0, y0)])
    path = via or [(dx, dy)]
    px, py = 0, 0
    for tx, ty in path:
        for i in range(1, steps + 1):
            if ms: page.wait_for_timeout(ms / steps / len(path))
            touch(cdp, 'touchMove', [(x0 + px + (tx - px) * i / steps, y0 + py + (ty - py) * i / steps)])
        px, py = tx, ty
    if end:
        touch(cdp, 'touchEnd', [])
        page.wait_for_timeout(650)


# Un gesto rápido de verdad (un toque cada 12 ms, como un teléfono): el protocolo
# del navegador tarda ~40 ms por toque, así que este se genera dentro de la página.
FLICK = """async ([x0, y0, dx]) => {
  const target = document.elementFromPoint(x0, y0);
  const make = (x) => new Touch({identifier: 7, target, clientX: x, clientY: y0, pageX: x, pageY: y0 + scrollY});
  const fire = (type, x, list) => target.dispatchEvent(new TouchEvent(type, {bubbles: true, cancelable: true, composed: true,
    touches: list ? [make(x)] : [], targetTouches: list ? [make(x)] : [], changedTouches: [make(x)]}));
  fire('touchstart', x0, true);
  for (let i = 1; i <= 5; i++) { await new Promise(r => setTimeout(r, 12)); fire('touchmove', x0 + dx * i / 5, true); }
  fire('touchend', x0 + dx, false);
}"""


def state(page):
    return page.evaluate(STATE)


def settled(page, where):
    st = state(page)
    for _ in range(12):   # la página completa puede ir algo cargada: espera a que termine la animación
        if not (st['moved'] or st['busy'] or st['peek']): break
        page.wait_for_timeout(120); st = state(page)
    assert not st['moved'], f'{where}: quedaron estilos en línea en {st["moved"]}'
    assert not st['busy'], f'{where}: el gesto no terminó'
    assert st['overflow'] <= 1, f'{where}: desbordamiento lateral {st["overflow"]}px'
    assert st['peek'] is None, f'{where}: el aviso del borde no se ocultó {st["peek"]}'
    return st


def open_area(page, cat):
    page.evaluate(f"filterByCategory({cat!r})")
    page.wait_for_timeout(900)


def start_y(page, area):
    y = page.evaluate(SAFE_Y, area)
    assert y is not None, f'{area}: no hay dónde empezar el gesto'
    return y


def loop(page, cdp, area, order, where, url=None):
    w = page.evaluate('innerWidth')
    st = settled(page, where)
    assert st['tab'] == order[0], f'{where}: empieza en {st["tab"]}, se esperaba {order[0]}'
    # Hacia la izquierda: siguiente… y del último al primero.
    for expected in order[1:] + order[:1]:
        swipe(page, cdp, w * 0.78, start_y(page, area), -w * 0.55)
        st = settled(page, f'{where} → {expected}')
        assert st['tab'] == expected, f'{where}: deslizar a la izquierda debía abrir {expected}, abrió {st["tab"]}'
        if url: assert f'v={expected}' in st['url'], f'{where}: dirección {st["url"]}'
    # Hacia la derecha: anterior… y del primero al último.
    swipe(page, cdp, w * 0.22, start_y(page, area), w * 0.55)
    st = settled(page, f'{where} ← {order[-1]}')
    assert st['tab'] == order[-1], f'{where}: deslizar a la derecha desde el primero debía abrir {order[-1]}, abrió {st["tab"]}'
    swipe(page, cdp, w * 0.22, start_y(page, area), w * 0.55)
    st = settled(page, where)
    assert st['tab'] == order[-2], f'{where}: deslizar a la derecha debía abrir {order[-2]}, abrió {st["tab"]}'


def no_change(page, cdp, area, where):
    w = page.evaluate('innerWidth')
    before = state(page)['tab']
    y = start_y(page, area)
    cases = {
        'arrastre corto': dict(x0=w * 0.6, y0=y, dx=-48, ms=500),
        'diagonal': dict(x0=w * 0.7, y0=y + 60, dx=-130, dy=-120),
        'empieza en el borde': dict(x0=6, y0=y, dx=w * 0.6),
        'se arrepiente al final': dict(x0=w * 0.8, y0=y, dx=0, ms=520, via=[(-170, 0), (-100, 0)]),
    }
    for name, args in cases.items():
        swipe(page, cdp, **args)
        st = settled(page, f'{where} · {name}')
        assert st['tab'] == before, f'{where} · {name}: cambió de {before} a {st["tab"]}'
    # Bajar la página con un poco de lado: la página baja y el apartado sigue.
    page.evaluate("scrollTo({top: 0, behavior: 'instant'})"); page.wait_for_timeout(200)
    y0 = page.evaluate('innerHeight') - 140
    swipe(page, cdp, w * 0.5, y0, -24, -320, ms=300)
    st = settled(page, f'{where} · bajar')
    assert st['tab'] == before, f'{where} · bajar la página cambió de apartado'
    assert st['y'] > 120, f'{where} · bajar: la página no bajó (scrollY {st["y"]})'


def sideways_scroller(page, cdp, area, where):
    """Sobre algo que se desliza de lado, el gesto es suyo."""
    w = page.evaluate('innerWidth')
    y = page.evaluate("""(area) => {
      const r = area === 'act' ? document.getElementById('aeOpinions') : document.getElementById('mainContent');
      const host = [...r.children].find(e => e.getBoundingClientRect().height > 120 && !/TabS|Tabs/.test(e.id) && e.tagName !== 'NAV');
      const rail = document.createElement('div');
      rail.id = 'swipeTestRail';
      rail.style.cssText = 'overflow-x:auto;white-space:nowrap;height:90px;margin:8px 0';
      rail.innerHTML = '<span style="display:inline-block;width:1200px;height:80px;background:repeating-linear-gradient(90deg,#c99a5b33 0 40px,transparent 40px 80px)"></span>';
      r.insertBefore(rail, host);
      // Sin scrollIntoView: en las secciones abre la pestaña que contiene el bloque.
      window.scrollBy({top: rail.getBoundingClientRect().top - innerHeight / 2, behavior: 'instant'});
      const b = rail.getBoundingClientRect();
      return b.top + b.height / 2;
    }""", area)
    page.wait_for_timeout(250)
    before = state(page)['tab']
    swipe(page, cdp, w * 0.8, y, -w * 0.55)
    st = settled(page, f'{where} · carrusel')
    left = page.evaluate("document.getElementById('swipeTestRail').scrollLeft")
    hit = page.evaluate("(y) => { const e = document.elementFromPoint(innerWidth * 0.8, y); return [y, e && (e.id || e.tagName), !!(e && e.closest('#swipeTestRail')), document.getElementById('swipeTestRail').getBoundingClientRect().top, scrollY]; }", y)
    page.evaluate("document.getElementById('swipeTestRail').remove()")
    assert st['tab'] == before, f'{where} · carrusel: el apartado cambió ({before} → {st["tab"]})'
    assert left > 40, f'{where} · carrusel: no se deslizó (scrollLeft {left}) {hit}'
    page.evaluate("scrollTo({top: 0, behavior: 'instant'})"); page.wait_for_timeout(150)


NEXT_LABEL = """() => {
  const tabs = [...document.querySelectorAll('#camSectionTabs:not([hidden]) button, #aeOpinions:not([hidden]) #aeOpinionsTabs [role=tab]')];
  const i = tabs.findIndex(b => b.getAttribute('aria-current') === 'true' || b.getAttribute('aria-selected') === 'true');
  return tabs[(i + 1) % tabs.length].textContent.trim();
}"""


def drag_feel(page, cdp, area, where, expect_label=None, shot=None):
    """A mitad del arrastre: el contenido acompaña y asoma el siguiente apartado."""
    w = page.evaluate('innerWidth')
    before = state(page)['tab']
    label = expect_label or page.evaluate(NEXT_LABEL)
    y = start_y(page, area)
    swipe(page, cdp, w * 0.8, y, -w * 0.42, ms=260, end=False)
    page.wait_for_timeout(60)
    st = state(page)
    assert st['moved'], f'{where}: el contenido no acompaña al dedo'
    assert st['peek'] and st['peek']['side'] == 'end' and label in st['peek']['text'] and st['peek']['ready'], f'{where}: aviso {st["peek"]} (se esperaba {label})'
    if shot: page.screenshot(path=str(shot))
    # Volver con el dedo antes de soltar: no cambia.
    for i in range(1, 9):
        touch(cdp, 'touchMove', [(w * 0.8 - w * 0.42 * (1 - i / 8), y)]); page.wait_for_timeout(30)
    page.wait_for_timeout(200)
    touch(cdp, 'touchEnd', []); page.wait_for_timeout(500)
    st = settled(page, f'{where} · volver con el dedo')
    assert st['tab'] == before, f'{where}: al volver con el dedo cambió de apartado'


def repaint_mid_gesture(page, cdp, area, where):
    """El bloque bajo el dedo se repinta (sale de la página) a mitad del gesto: el gesto termina bien."""
    w = page.evaluate('innerWidth')
    before = state(page)['tab']
    x0 = w * 0.8
    # El elemento tocado (no un bloque entero de la sección), que luego se devuelve a su sitio.
    y = page.evaluate("""([area, x, y0]) => {
      const r = area === 'act' ? document.getElementById('aeOpinions') : document.getElementById('mainContent');
      for (let y = y0; y < innerHeight - 90; y += 12) {
        const el = document.elementFromPoint(x, y);
        if (el && r.contains(el) && el !== r && el.parentElement !== r && !el.closest('[id$=Tabs]')) return y;
      }
      return null;
    }""", [area, x0, start_y(page, area)])
    assert y is not None, f'{where} · repintado: no hay elemento que tocar'
    page.evaluate("""([x, y]) => { const el = document.elementFromPoint(x, y); window.__gone = [el, el.parentNode, el.nextSibling]; }""", [x0, y])
    touch(cdp, 'touchStart', [(x0, y)])
    for i in range(1, 5):
        touch(cdp, 'touchMove', [(x0 - 30 * i, y)]); page.wait_for_timeout(20)
    page.evaluate("window.__gone[0].remove()")
    for i in range(5, 9):
        touch(cdp, 'touchMove', [(x0 - 30 * i, y)]); page.wait_for_timeout(20)
    touch(cdp, 'touchEnd', []); page.wait_for_timeout(650)
    st = settled(page, f'{where} · repintado')
    page.evaluate("const [el, parent, next] = window.__gone; parent.insertBefore(el, next && next.parentNode === parent ? next : null); delete window.__gone")
    assert st['tab'] != before, f'{where} · repintado: no cambió de apartado'


def phone(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=800, touch=True) as page:
        cdp = page.context.new_cdp_session(page)
        page.wait_for_timeout(600)

        open_area(page, 'NFL')
        loop(page, cdp, 'sec', ['semana', 'takes', 'noticias'], f'{where} NFL', url=True)
        # Arrastre lento y largo («arrastrar»), y gesto rápido corto: los dos cambian.
        w = page.evaluate('innerWidth')
        before = state(page)['tab']
        swipe(page, cdp, w * 0.75, start_y(page, 'sec'), -max(110, w * 0.3), ms=1100, steps=30)
        st = settled(page, f'{where} NFL · lento'); assert st['tab'] != before, f'{where} NFL: arrastre lento no cambió'
        before = st['tab']
        page.evaluate(FLICK, [w * 0.75, start_y(page, 'sec'), -64]); page.wait_for_timeout(650)
        st = settled(page, f'{where} NFL · rápido'); assert st['tab'] != before, f'{where} NFL: gesto rápido no cambió'
        no_change(page, cdp, 'sec', f'{where} NFL')
        repaint_mid_gesture(page, cdp, 'sec', f'{where} NFL')
        sideways_scroller(page, cdp, 'sec', f'{where} NFL')
        page.evaluate("camSectionTabs.select('semana')"); page.wait_for_timeout(300)
        drag_feel(page, cdp, 'sec', f'{where} NFL', 'Takes', SHOTS / f'{where}-nfl-arrastrando.png' if SHOTS else None)

        open_area(page, 'Fútbol')
        loop(page, cdp, 'sec', ['semana', 'takes', 'noticias'], f'{where} Fútbol', url=True)

        open_area(page, 'Picks')
        loop(page, cdp, 'sec', ['picks', 'chefs', 'historial'], f'{where} Picks', url=True)
        page.evaluate("camSectionTabs.select('historial')"); page.wait_for_timeout(300)
        drag_feel(page, cdp, 'sec', f'{where} Picks (vuelta)', 'Picks', SHOTS / f'{where}-picks-vuelta.png' if SHOTS else None)

        open_area(page, 'Opiniones')
        tabs = page.evaluate("[...document.querySelectorAll('#aeOpinionsTabs [role=tab]')].map(b => b.dataset.sport)")
        assert tabs == ['todas', 'nfl', 'futbol', 'colegial', 'ciclismo'], f'{where} Actualidad: pestañas {tabs}'
        loop(page, cdp, 'act', tabs, f'{where} Actualidad')
        no_change(page, cdp, 'act', f'{where} Actualidad')
        repaint_mid_gesture(page, cdp, 'act', f'{where} Actualidad')
        page.evaluate("aeOpinions.rerender()")
        page.wait_for_function("document.querySelectorAll('#aeOpinionsTabs [role=tab][aria-selected=true]').length === 1")
        page.wait_for_timeout(400)
        drag_feel(page, cdp, 'act', f'{where} Actualidad', None, SHOTS / f'{where}-actualidad-arrastrando.png' if SHOTS else None)

        # Inicio no tiene apartados: deslizar no hace nada.
        open_area(page, 'Todos')
        swipe(page, cdp, w * 0.8, 400, -w * 0.55)
        st = settled(page, f'{where} Inicio')
        assert page.evaluate('currentCategory') == 'Todos', f'{where} Inicio: cambió de sección'

        assert not page.errors, f'{where}: errores {page.errors}'
        print(f'ok {where}')


def reduced():
    with fp.full_page(fake_js=FAKE, width=390, height=800, touch=True, reduced_motion=True) as page:
        cdp = page.context.new_cdp_session(page)
        open_area(page, 'NFL')
        swipe(page, cdp, 300, start_y(page, 'sec'), -140, ms=200, end=False)
        page.wait_for_timeout(60)
        st = state(page)
        assert not st['moved'], f'reducir movimiento: el contenido se movió {st["moved"]}'
        touch(cdp, 'touchEnd', []); page.wait_for_timeout(120)
        st = settled(page, 'reducir movimiento')
        assert st['tab'] == 'takes', f'reducir movimiento: no cambió ({st["tab"]})'
        assert not page.errors, page.errors
        print('ok reducir movimiento')


def desktop():
    with fp.full_page(fake_js=FAKE, width=1366, height=900, scale=1, touch=True) as page:
        cdp = page.context.new_cdp_session(page)
        open_area(page, 'NFL')
        y = page.evaluate("Math.round(document.getElementById('mainContent').getBoundingClientRect().top) + 260")
        search = page.evaluate('location.search')
        swipe(page, cdp, 1000, y, -600)
        st = settled(page, 'escritorio NFL')
        assert page.evaluate('currentCategory') == 'NFL' and st['url'] == search, f'escritorio NFL: algo cambió {st}'
        open_area(page, 'Picks')
        if page.evaluate("!document.getElementById('camSectionTabs').hidden"):
            loop(page, cdp, 'sec', ['picks', 'chefs', 'historial'], 'escritorio Picks', url=True)
        assert not page.errors, page.errors
        print('ok escritorio')


for width, dark in [(390, False), (390, True), (320, False)]:
    phone(width, dark)
reduced()
desktop()
print('section-swipe: todo bien')
