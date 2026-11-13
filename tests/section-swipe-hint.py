"""Enseñar el gesto de deslizar (12 nov 2026).

Página completa en Chromium (tests/full-page.py, Supabase falso, sin red). Cada
caso abre un navegador nuevo: es como alguien que llega por primera vez.

Cubre:
  · teléfono táctil (390 px, día y noche): al entrar en NFL, tras 1,5 s sin
    tocar nada, el contenido amaga hacia la izquierda y asoma «Takes ›»; luego
    todo vuelve a su sitio, sin estilos en línea ni desbordamiento lateral;
  · en la misma visita no se repite antes de 45 s (Picks después no lo enseña);
  · a los 45 s, si sigue en una de estas áreas sin haber deslizado, una última
    vez; si en ese momento está en Inicio, al volver a entrar; y nunca una tercera;
  · Actualidad lo enseña con su siguiente apartado («NFL ›»);
  · tocar o bajar la página mientras espera lo retrasa; tocar durante el amago
    lo quita al momento;
  · no sale: si ya deslizó alguna vez, si ya salió hoy, tras 3 visitas, en Inicio,
    en una pantalla sin tacto (ordenador), ni si desliza antes de que salga
    (y entonces queda apuntado que ya sabe);
  · «reducir movimiento»: en vez del amago, la frase «Desliza para cambiar ›»
    bajo las pestañas, sin mover el contenido, y se va sola.

Uso: python3 -B tests/section-swipe-hint.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

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
TODAY = "(() => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); })()"

STATE = """() => {
  const peek = document.querySelector('body > .cam-swipe-peek');
  const tip = document.querySelector('body > .cam-swipe-tip');
  const moved = [...document.querySelectorAll('#mainContent > *, #aeOpinions > *')]
    .filter(e => e.style.transform || e.style.opacity || e.style.transition)
    .map(e => ({ id: e.id || e.className, x: new DOMMatrix(getComputedStyle(e).transform).m41 }));
  let shown = null, visit = null;
  try { shown = JSON.parse(localStorage.getItem('cam_swipe_hint_v1') || 'null'); } catch (e) {}
  try { visit = JSON.parse(sessionStorage.getItem('cam_swipe_hint_session_v1') || 'null'); } catch (e) {}
  return { hinting: window.camSectionSwipe.hinting(), moved,
           peek: peek && !peek.hidden ? { text: peek.textContent, ready: peek.classList.contains('is-ready') } : null,
           tip: tip && !tip.hidden ? { text: tip.textContent, on: tip.classList.contains('is-on'), top: tip.getBoundingClientRect().top } : null,
           shown, visit, learned: localStorage.getItem('cam_swipe_learned_v1'),
           overflow: document.documentElement.scrollWidth - innerWidth };
}"""


def seed(extra):
    return FAKE + '\n' + extra


def open_area(page, cat):
    page.evaluate(f"filterByCategory({cat!r})")


def wait_hint(page, where, within=4500):
    """Espera a que empiece el aviso y devuelve el estado a media animación."""
    page.wait_for_function('window.camSectionSwipe.hinting()', timeout=within)
    page.wait_for_timeout(520)   # el amago llega a su punto más lejano
    return page.evaluate(STATE)


def no_hint(page, where, wait=3200):
    page.wait_for_timeout(wait)
    st = page.evaluate(STATE)
    assert not st['hinting'] and not st['peek'] and not st['tip'] and not st['moved'], f'{where}: no debía enseñarse {st}'
    return st


def clean(page, where):
    page.wait_for_function('!window.camSectionSwipe.hinting()', timeout=5000)
    page.wait_for_timeout(150)
    st = page.evaluate(STATE)
    assert not st['moved'], f'{where}: quedaron estilos en línea {st["moved"]}'
    assert not st['peek'] and not (st['tip'] and st['tip']['on']), f'{where}: el aviso no se fue {st}'
    assert st['overflow'] <= 1, f'{where}: desbordamiento lateral {st["overflow"]}px'
    return st


def touch(cdp, kind, points):
    cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y} for x, y in points]})


def swipe(page, cdp, x0, y0, dx, dy=0, steps=12):
    touch(cdp, 'touchStart', [(x0, y0)])
    for i in range(1, steps + 1):
        page.wait_for_timeout(15)
        touch(cdp, 'touchMove', [(x0 + dx * i / steps, y0 + dy * i / steps)])
    touch(cdp, 'touchEnd', [])


def first_visit(dark):
    where = f'primera visita {"noche" if dark else "día"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=390, height=800, touch=True) as page:
        page.wait_for_timeout(300)
        no_hint(page, f'{where} · Inicio', wait=2500)
        open_area(page, 'NFL')
        page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert not st['hinting'], f'{where}: salió antes de 1,5 s'
        st = wait_hint(page, where)
        assert st['peek'] and 'Takes' in st['peek']['text'] and not st['peek']['ready'], f'{where}: aviso {st["peek"]}'
        assert st['moved'] and all(-30 <= m['x'] <= -4 for m in st['moved']), f'{where}: el contenido no amagó {st["moved"]}'
        if SHOTS: page.screenshot(path=str(SHOTS / f'{where.replace(" ", "-")}-nfl.png'))
        st = clean(page, where)
        assert st['shown'] and st['shown']['count'] == 1 and st['visit'] and st['visit']['n'] == 1, f'{where}: no se apuntó la visita {st}'
        assert st['learned'] is None, f'{where}: enseñar no es aprender'
        # Antes de 45 s no se repite.
        open_area(page, 'Picks')
        no_hint(page, f'{where} · Picks después')
        assert not page.errors, page.errors
        print(f'ok {where}')


def actualidad():
    with fp.full_page(fake_js=FAKE, width=390, height=800, touch=True) as page:
        open_area(page, 'Opiniones')
        st = wait_hint(page, 'Actualidad')
        assert st['peek'] and 'NFL' in st['peek']['text'], f'Actualidad: aviso {st["peek"]}'
        assert st['moved'], 'Actualidad: el contenido no amagó'
        if SHOTS: page.screenshot(path=str(SHOTS / 'actualidad.png'))
        clean(page, 'Actualidad')
        assert not page.errors, page.errors
        print('ok Actualidad')


def interactions():
    with fp.full_page(fake_js=FAKE, width=390, height=800, touch=True) as page:
        cdp = page.context.new_cdp_session(page)
        open_area(page, 'Fútbol')
        # Bajar la página al segundo: el aviso espera otros 1,5 s de calma.
        page.wait_for_timeout(1000)
        swipe(page, cdp, 195, 600, 0, -260)
        page.wait_for_timeout(1100)
        assert not page.evaluate(STATE)['hinting'], 'tocar no retrasó el aviso'
        st = wait_hint(page, 'tras bajar la página', within=3000)
        assert st['peek'] and 'Takes' in st['peek']['text'], st
        # Tocar durante el amago lo quita al momento.
        touch(cdp, 'touchStart', [(200, 420)])
        page.wait_for_timeout(60)
        st = page.evaluate(STATE)
        assert not st['hinting'] and not st['moved'] and not st['peek'], f'tocar no quitó el aviso {st}'
        touch(cdp, 'touchEnd', [])
        page.wait_for_timeout(300)
        assert page.evaluate("document.body.dataset.camTab") == 'semana', 'el toque cambió de apartado'
        assert not page.errors, page.errors
        print('ok toques')

    # Desliza antes de que salga: no sale y queda apuntado que ya sabe.
    with fp.full_page(fake_js=FAKE, width=390, height=800, touch=True) as page:
        cdp = page.context.new_cdp_session(page)
        open_area(page, 'NFL')
        # En cuanto se va la pantalla de carga (antes no se puede tocar nada).
        page.wait_for_function("!document.documentElement.classList.contains('cam-booting') && getComputedStyle(document.getElementById('camPageLoader') || document.body).display !== 'grid'")
        t0 = page.evaluate('performance.now()')
        # Un punto del contenido fuera de lo que ya se desliza de lado.
        y = page.evaluate("""() => {
          const r = document.getElementById('mainContent');
          const side = el => { for (let e = el; e && e !== r; e = e.parentElement)
            if (e.scrollWidth > e.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true; return false; };
          const top = document.getElementById('camSectionTabs').getBoundingClientRect().bottom;
          for (let y = top + 30; y < innerHeight - 90; y += 14) {
            const el = document.elementFromPoint(innerWidth / 2, y);
            if (el && r.contains(el) && !side(el) && !el.closest('input,textarea,select,button')) return y;
          }
          return 400;
        }""")
        swipe(page, cdp, 300, y, -220)
        assert page.evaluate('performance.now()') - t0 < 1400, 'la prueba tardó demasiado en deslizar'
        page.wait_for_timeout(700)
        st = no_hint(page, 'deslizó antes')
        assert st['learned'] == '1' and page.evaluate("document.body.dataset.camTab") == 'takes', f'deslizó antes: {st}'
        print('ok ya sabe')


def remembered():
    cases = {
        'ya deslizó otra vez': "localStorage.setItem('cam_swipe_learned_v1', '1');",
        'ya salió hoy': f"localStorage.setItem('cam_swipe_hint_v1', JSON.stringify({{count: 1, day: {TODAY}}}));",
        'tres visitas': "localStorage.setItem('cam_swipe_hint_v1', JSON.stringify({count: 3, day: '2000-1-1'}));",
    }
    for name, js in cases.items():
        with fp.full_page(fake_js=seed(js), width=390, height=800, touch=True) as page:
            open_area(page, 'NFL')
            no_hint(page, name)
            print(f'ok no sale: {name}')
    # Otro día, segunda visita: sí sale y suma.
    with fp.full_page(fake_js=seed("localStorage.setItem('cam_swipe_hint_v1', JSON.stringify({count: 1, day: '2000-1-1'}));"),
                      width=390, height=800, touch=True) as page:
        open_area(page, 'Picks')
        st = wait_hint(page, 'otro día')
        assert st['peek'] and 'Chefs' in st['peek']['text'], f'otro día: {st["peek"]}'
        st = clean(page, 'otro día')
        assert st['shown']['count'] == 2, f'otro día: cuenta {st["shown"]}'
        print('ok otro día')


def last_time():
    """A los 45 s, una última vez (en el área o al volver a entrar), y nunca una tercera."""
    with fp.full_page(fake_js=FAKE, width=390, height=800, touch=True, clock=True) as page:
        open_area(page, 'NFL')
        wait_hint(page, '45 s · primera')
        clean(page, '45 s · primera')
        page.clock.fast_forward('00:30')
        no_hint(page, '45 s · a los 30 s', wait=2500)
        page.clock.fast_forward('00:20')
        st = wait_hint(page, '45 s · última vez')
        assert st['peek'] and 'Takes' in st['peek']['text'] and st['moved'], f'45 s: {st}'
        st = clean(page, '45 s · última vez')
        assert st['visit']['n'] == 2 and st['shown']['count'] == 1, f'45 s: la última vez no debe contar como otra visita {st}'
        page.clock.fast_forward('06:00')
        open_area(page, 'Picks')
        no_hint(page, '45 s · nunca una tercera')
        assert not page.errors, page.errors
        print('ok última vez en el área')

    with fp.full_page(fake_js=FAKE, width=390, height=800, touch=True, clock=True) as page:
        open_area(page, 'Picks')
        wait_hint(page, '45 s · primera (Picks)')
        clean(page, '45 s · primera (Picks)')
        open_area(page, 'Todos')
        page.wait_for_timeout(600)
        page.clock.fast_forward('00:50')
        no_hint(page, '45 s · en Inicio', wait=2500)
        open_area(page, 'Fútbol')
        st = wait_hint(page, '45 s · al volver a entrar')
        assert st['peek'] and 'Takes' in st['peek']['text'], f'45 s al volver: {st}'
        clean(page, '45 s · al volver a entrar')
        print('ok última vez al volver')

    # Si desliza entre la primera y los 45 s, ya no hay última vez.
    with fp.full_page(fake_js=FAKE, width=390, height=800, touch=True, clock=True) as page:
        open_area(page, 'NFL')
        wait_hint(page, '45 s · primera (desliza)')
        clean(page, '45 s · primera (desliza)')
        page.evaluate("localStorage.setItem('cam_swipe_learned_v1', '1')")
        page.clock.fast_forward('00:50')
        no_hint(page, '45 s · ya sabe')
        print('ok sin última vez si ya sabe')


def desktop():
    with fp.full_page(fake_js=FAKE, width=1366, height=900, scale=1) as page:
        open_area(page, 'Picks')
        no_hint(page, 'ordenador sin tacto')
        assert not page.errors, page.errors
        print('ok ordenador')


def reduced():
    with fp.full_page(fake_js=FAKE, width=390, height=800, touch=True, reduced_motion=True) as page:
        open_area(page, 'NFL')
        page.wait_for_function('window.camSectionSwipe.hinting()', timeout=4500)
        page.wait_for_timeout(400)
        st = page.evaluate(STATE)
        bar = page.evaluate("document.getElementById('camSectionTabs').getBoundingClientRect().bottom")
        assert st['tip'] and st['tip']['on'] and 'Desliza para cambiar' in st['tip']['text'], f'reducir movimiento: {st}'
        assert bar < st['tip']['top'] < bar + 30, f'reducir movimiento: la frase no está bajo las pestañas {st["tip"]} / {bar}'
        assert not st['moved'] and not st['peek'], f'reducir movimiento: algo se movió {st}'
        if SHOTS: page.screenshot(path=str(SHOTS / 'reducir-movimiento.png'))
        clean(page, 'reducir movimiento')
        assert not page.errors, page.errors
        print('ok reducir movimiento')


first_visit(False)
first_visit(True)
actualidad()
interactions()
remembered()
last_time()
desktop()
reduced()
print('section-swipe-hint: todo bien')
