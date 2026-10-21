"""Lector de noticias «Crónica de mármol» sobre la página completa (Chromium + Supabase falso).
Uso: python3 tests/chronicle-reader.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
IMG = (ROOT / 'assets/ae-takes-community-banner.webp').read_bytes()

CUERPO = ('<p>Desde el inicio de la temporada, el Barça ha desplegado un fútbol que ilusiona: rápido, valiente y lleno de magia.</p>'
          '<h2>La ilusión</h2><p>Un equipo que divierte y transmite la sensación de que cada pieza encuentra su lugar.</p>'
          '<h2>La lección</h2><p>Ganar otra vez reforzaría la ilusión, aunque también podría alimentar una sensación peligrosa.</p>'
          '<blockquote>Hay lecciones que duelen en el marcador.</blockquote>'
          '<h2>Lo que viene</h2><p>La temporada es larga y el hambre también se entrena.</p>')

ARTICULOS = [
    {'id': '10000000-0000-4000-8000-000000000001', 'legacy_id': None, 'title': 'La gloria también nace de una caída',
     'category': 'Fútbol', 'football_team': 'Barcelona', 'author': 'Eduard Carrera', 'image': 'https://img.test/a.webp',
     'image_focus_x': 50, 'image_focus_y': 40, 'image_zoom_pct': 100,
     'summary': 'A veces, una derrota enseña más que una victoria.', 'body': CUERPO,
     'featured': True, 'created_at': '2026-10-20T15:00:00Z', 'is_public': True},
    # Sin resumen y sin subtítulos: la entradilla y el índice deben desaparecer.
    {'id': '10000000-0000-4000-8000-000000000002', 'legacy_id': None, 'title': 'El plan de Flick ya no depende de un solo jugador',
     'category': 'Fútbol', 'football_team': 'Barcelona', 'author': 'Redacción', 'image': 'https://img.test/b.webp',
     'image_focus_x': 50, 'image_focus_y': 50, 'image_zoom_pct': 100,
     'summary': '', 'body': '<p>' + 'La rotación ha dejado de ser un parche. ' * 12 + '</p>',
     'featured': False, 'created_at': '2026-10-19T10:00:00Z', 'is_public': True},
]

FAKE = ('window.__fake.tables=' + json.dumps({'articles': ARTICULOS}) + ';window.__fake.user=null;'
        # La bienvenida de la portada no debe tapar el lector durante la prueba.
        "try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}")


def abrir(page, article_id):
    page.wait_for_function("typeof openArticleModal === 'function'", timeout=15000)
    page.wait_for_function("Array.isArray(window.articles) ? window.articles.length > 0 : true", timeout=15000)
    page.evaluate(f"openArticleModal({json.dumps(article_id)})")
    page.wait_for_selector('#articleModal:not(.hidden)', timeout=10000)
    page.wait_for_timeout(350)


def fondo(page, selector):
    return page.eval_on_selector(selector, 'el=>getComputedStyle(el).backgroundColor')


def run():
    # Escritorio, día: cabecera con marca, entradilla, capitular, índice y columna de notas.
    with fp.full_page(fake_js=FAKE, width=1280, height=900) as page:
        page.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/webp', body=IMG))
        abrir(page, ARTICULOS[0]['id'])

        assert page.locator('#articleModal .cam-chronicle-brand').is_visible()
        assert page.locator('#modalCategory').inner_text().strip().lower() == 'fútbol'
        assert '2026' in page.locator('#camChronicleToolbarDate').inner_text()

        entradilla = page.locator('#camChronicleDek')
        assert entradilla.is_visible() and 'derrota' in entradilla.inner_text()

        # Papel de mármol, no el blanco de Tailwind.
        assert fondo(page, '#articleModal > .ae-article-panel') == 'rgb(244, 241, 233)'
        # Capitular: el primer párrafo arranca con una letra de dos líneas.
        assert page.eval_on_selector(
            '#modalBody > p:first-child',
            "el=>parseFloat(getComputedStyle(el,'::first-letter').fontSize)") > 40

        # Columna de notas, con índice generado desde los subtítulos.
        assert page.locator('#articleModal .cam-chronicle-aside').is_visible()
        assert page.locator('#camChronicleIndexBlock').is_visible()
        enlaces = page.locator('#camChronicleIndex .cam-chronicle-aside-link')
        assert enlaces.count() == 3, enlaces.count()
        assert enlaces.nth(0).inner_text().strip() == 'La ilusión'
        assert page.locator('#camChronicleCategory').inner_text().strip() == 'Fútbol'
        assert page.locator('#camChronicleReadTime').inner_text().strip().endswith('min')
        # El índice lleva a su sección dentro del lector.
        enlaces.nth(2).click()
        page.wait_for_timeout(600)
        assert page.eval_on_selector('#modalBody h2:nth-of-type(1)', 'el=>true')

        # La columna de abajo comparte el papel: nada de cajas blancas sueltas.
        assert fondo(page, '#articleModal .ae-article-action') == 'rgb(236, 231, 219)'

        if SHOTS:
            page.screenshot(path=f'{SHOTS}/cronica-marmol-1280-dia.png')

        # Segunda noticia: sin resumen ni subtítulos no se ve ni entradilla ni índice.
        abrir(page, ARTICULOS[1]['id'])
        assert not page.locator('#camChronicleDek').is_visible()
        assert not page.locator('#camChronicleIndexBlock').is_visible()
        assert page.locator('#articleModal .cam-chronicle-aside').is_visible()
        assert not page.errors, page.errors

    # Escritorio, noche: el mismo lector en tinta azul.
    with fp.full_page(fake_js=FAKE, width=1280, height=900, dark=True) as page:
        page.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/webp', body=IMG))
        abrir(page, ARTICULOS[0]['id'])
        assert fondo(page, '#articleModal > .ae-article-panel') == 'rgb(20, 39, 51)'
        assert page.locator('#camChronicleIndexBlock').is_visible()
        if SHOTS:
            page.screenshot(path=f'{SHOTS}/cronica-marmol-1280-noche.png')
        assert not page.errors, page.errors

    # Móvil: una sola columna, notas al pie de la crónica y sin desbordes.
    with fp.full_page(fake_js=FAKE, width=390, height=844) as page:
        page.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/webp', body=IMG))
        abrir(page, ARTICULOS[0]['id'])
        assert page.eval_on_selector('#articleModal .cam-chronicle-layout',
                                     "el=>getComputedStyle(el).display") == 'block'
        notas = page.locator('#articleModal .cam-chronicle-aside')
        cuerpo = page.locator('#modalBody')
        assert notas.is_visible()
        assert notas.bounding_box()['y'] > cuerpo.bounding_box()['y']
        assert page.eval_on_selector('#articleModal .ae-article-scroll',
                                     'el=>el.scrollWidth <= el.clientWidth + 1')
        if SHOTS:
            page.screenshot(path=f'{SHOTS}/cronica-marmol-390-dia.png')
        assert not page.errors, page.errors

    print('PASS: lector Crónica de mármol (cabecera, entradilla, capitular, índice, notas; día, noche y móvil).')


if __name__ == '__main__':
    try:
        run()
    except AssertionError:
        import traceback; traceback.print_exc(); sys.exit(1)
