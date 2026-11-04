"""«Sigue leyendo» del lector (página completa, Chromium + Supabase falso, sin red).
Lista de crónica sin cajas: filetes finos, antetítulo, titular en serif, fecha y
lectura, miniatura con el encuadre guardado. 390 y 1280 px, día y noche.
Uso: python3 -B tests/sigue-leyendo.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
IMG = (ROOT / 'assets/cam-welcome-dia-oleo-960.webp').read_bytes()


def articulo(n, title, category='Fútbol', image=True, focus=(50, 50), day=25):
    return {'id': f'20000000-0000-4000-8000-00000000000{n}', 'legacy_id': None, 'title': title,
            'category': category, 'football_team': '', 'author': 'Eduard Carrera',
            'image': f'https://img.test/{n}.webp' if image else 'https://img.test/roto.webp',
            'image_focus_x': focus[0], 'image_focus_y': focus[1], 'image_zoom_pct': 100,
            'summary': 'Resumen.', 'body': '<p>' + 'Texto de la crónica. ' * 40 * n + '</p>',
            'featured': False, 'created_at': f'2026-10-{day}T15:00:00Z', 'is_public': True}


LARGO = 'Una crónica con un titular larguísimo que no cabe en tres líneas de la lista porque sigue y sigue contando el partido entero, la previa, la polémica del descanso y lo que dijo el entrenador después'
ARTICULOS = [
    articulo(1, 'Un clásico que no perdona', day=25),
    articulo(2, 'El guardián olvidado', focus=(98, 50), day=24),
    articulo(3, LARGO, image=False, day=23),
    articulo(4, 'Otra liga, otra historia', category='NFL', day=22),
]
FAKE = ('window.__fake.tables=' + json.dumps({'articles': ARTICULOS}) + ';window.__fake.user=null;'
        "try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}")


def servir(route):
    if route.request.url.endswith('/roto.webp'):
        return route.fulfill(status=404, body='')
    return route.fulfill(status=200, content_type='image/webp', body=IMG)


def abrir(page, article_id):
    page.wait_for_function("typeof openArticleModal === 'function'", timeout=15000)
    page.wait_for_function("Array.isArray(window.articles) ? window.articles.length > 0 : true", timeout=15000)
    page.evaluate(f"openArticleModal({json.dumps(article_id)})")
    page.wait_for_selector('#articleModal:not(.hidden)', timeout=10000)
    page.eval_on_selector('#relatedStoriesSection', 'el=>el.scrollIntoView({block:"center"})')
    page.wait_for_timeout(500)


ESTADO = """() => [...document.querySelectorAll('#relatedStoriesList > .cam-related-item')].map(b => {
  const c = getComputedStyle(b), t = b.querySelector('.cam-related-title'), img = b.querySelector('img');
  const r = b.getBoundingClientRect();
  return {
    kicker: b.querySelector('.cam-related-kicker')?.textContent, title: t.textContent,
    meta: b.querySelector('.cam-related-meta')?.textContent,
    bg: c.backgroundColor, radius: c.borderTopLeftRadius, borderLeft: c.borderLeftWidth,
    titleColor: getComputedStyle(t).color, titleLines: Math.round(t.clientHeight / parseFloat(getComputedStyle(t).lineHeight)),
    titleClipped: t.scrollHeight > t.clientHeight + 1,
    thumb: img ? {w: img.clientWidth, h: img.clientHeight, fit: getComputedStyle(img).objectFit,
                  focus: img.style.getPropertyValue('--ae-image-focus').trim(), loaded: img.complete && img.naturalWidth > 0,
                  radius: getComputedStyle(img.parentElement).borderTopLeftRadius} : null,
    hasThumb: b.classList.contains('has-thumb'), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width),
    textRight: Math.round(b.querySelector('.cam-related-text').getBoundingClientRect().right),
  };
})"""


def comprobar(page, width, dark):
    items = page.evaluate(ESTADO)
    assert [i['title'] for i in items] == ['El guardián olvidado', LARGO], items
    for i in items:
        # Sin cajas ni píldoras: filete y fondo del papel.
        assert i['bg'] == 'rgba(0, 0, 0, 0)', i
        assert i['radius'] == '0px', i
        assert i['kicker'] == 'Fútbol', i
        assert i['meta'].endswith('min de lectura') and '2026' in i['meta'], i
        assert i['titleColor'] == ('rgb(241, 231, 216)' if dark else 'rgb(40, 59, 72)'), i
    guardian, largo = items
    side = 88 if width > 760 else 76
    assert guardian['hasThumb'] and guardian['thumb']['loaded'], guardian
    assert (guardian['thumb']['w'], guardian['thumb']['h']) == (side - 2, side - 2), guardian
    assert guardian['thumb']['fit'] == 'cover' and guardian['thumb']['radius'] == '0px', guardian
    # El encuadre guardado manda en una miniatura cuadrada (recorte grande).
    assert guardian['thumb']['focus'] == '98% 50%', guardian
    # Foto que no carga: la historia queda solo con texto, a todo el ancho.
    assert not largo['hasThumb'] and largo['thumb'] is None, largo
    # Titular largo: tres líneas y puntos suspensivos, nunca más alto.
    assert largo['titleLines'] == 3 and largo['titleClipped'], largo
    assert not guardian['titleClipped'], guardian
    if width > 760:
        assert guardian['y'] == largo['y'], 'En ordenador van lado a lado'
        assert largo['borderLeft'] == '1px', largo
    else:
        assert largo['y'] > guardian['y'] and guardian['w'] == largo['w'], items
    # El título de la sección lleva su filete hasta el margen.
    assert page.eval_on_selector('#relatedStoriesHeading', "el=>parseFloat(getComputedStyle(el,'::after').width)") > 24
    assert page.eval_on_selector('#articleModal .ae-article-scroll', 'el=>el.scrollWidth <= el.clientWidth + 1')


def run():
    for width in (390, 1280):
        for dark in (False, True):
            with fp.full_page(fake_js=FAKE, width=width, height=900, dark=dark) as page:
                page.route('https://img.test/**', servir)
                abrir(page, ARTICULOS[0]['id'])
                page.wait_for_function("document.querySelectorAll('#relatedStoriesList .has-thumb').length === 1", timeout=5000)
                comprobar(page, width, dark)
                if SHOTS:
                    page.screenshot(path=f"{SHOTS}/sigue-leyendo-{width}-{'noche' if dark else 'dia'}.png")
                if width == 390 and not dark:
                    # Tocar una historia abre esa crónica.
                    page.locator('#relatedStoriesList .cam-related-item').first.click()
                    page.wait_for_function("document.getElementById('modalTitle').textContent.includes('El guardián olvidado')", timeout=5000)
                    # Sin otras noticias de la misma sección, no hay «Sigue leyendo».
                    abrir(page, ARTICULOS[3]['id'])
                    assert not page.locator('#relatedStoriesSection').is_visible()
                assert not page.errors, page.errors
    print('PASS: «Sigue leyendo» sin cajas (filetes, antetítulo, titular a 3 líneas, fecha y lectura, '
          'miniatura con encuadre o solo texto si la foto falla), 390/1280 px, día y noche, abre la crónica, oculto sin historias.')


if __name__ == '__main__':
    try:
        run()
    except AssertionError:
        import traceback; traceback.print_exc(); sys.exit(1)
