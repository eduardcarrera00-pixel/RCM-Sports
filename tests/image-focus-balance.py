"""Encuadre equilibrado: un recorte pequeño se reparte a los dos lados y el
encuadre guardado sigue mandando en los recortes grandes (página completa,
Chromium + Supabase falso, sin red).
Uso: python3 -B tests/image-focus-balance.py [--shots DIR]
"""
import importlib.util, io, json, pathlib, sys
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None


def png(width, height):
    # Portada tipo cartel: texto pegado al borde izquierdo y figura a la derecha.
    im = Image.new('RGB', (width, height), (14, 20, 30))
    d = ImageDraw.Draw(im)
    d.rectangle([int(width * .06), int(height * .30), int(width * .40), int(height * .42)], fill=(240, 232, 220))
    d.rectangle([int(width * .72), int(height * .45), int(width * .80), int(height * .95)], fill=(200, 170, 120))
    buf = io.BytesIO(); im.save(buf, 'PNG'); return buf.getvalue()


POSTER, TALL = png(1200, 675), png(600, 900)
ARTICULOS = [
    {'id': '20000000-0000-4000-8000-000000000001', 'legacy_id': None, 'title': 'El guardián olvidado',
     'category': 'Fútbol', 'author': 'Eduard Carrera', 'image': 'https://img.test/poster.png',
     'image_focus_x': 98, 'image_focus_y': 50, 'image_zoom_pct': 100, 'summary': '',
     'body': '<p>' + 'Hay jugadores que sostienen la luz para que otros brillen. ' * 10 + '</p>',
     'featured': True, 'created_at': '2026-10-28T19:06:00Z', 'is_public': True},
    {'id': '20000000-0000-4000-8000-000000000002', 'legacy_id': None, 'title': 'Foto vertical',
     'category': 'Fútbol', 'author': 'Redacción', 'image': 'https://img.test/tall.png',
     'image_focus_x': 50, 'image_focus_y': 20, 'image_zoom_pct': 100, 'summary': '',
     'body': '<p>' + 'Texto de prueba. ' * 20 + '</p>',
     'featured': False, 'created_at': '2026-10-27T10:00:00Z', 'is_public': True},
]
FAKE = ('window.__fake.tables=' + json.dumps({'articles': ARTICULOS}) + ';window.__fake.user=null;'
        "try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}")


def abrir(page, article_id):
    page.wait_for_function("typeof openArticleModal === 'function'", timeout=15000)
    page.evaluate(f"openArticleModal({json.dumps(article_id)})")
    page.wait_for_selector('#articleModal:not(.hidden)', timeout=10000)
    page.wait_for_function("document.getElementById('modalImage').complete && document.getElementById('modalImage').naturalWidth > 0", timeout=10000)
    page.wait_for_timeout(300)


def estado(page):
    return page.eval_on_selector('#modalImage', """img => ({
        focus: img.style.getPropertyValue('--ae-image-focus').trim(),
        position: getComputedStyle(img).objectPosition,
        frame: img.clientWidth / img.clientHeight,
        saved: img.dataset.camFocusSaved})""")


def run():
    with fp.full_page(fake_js=FAKE, width=390, height=844) as page:
        page.route('https://img.test/poster.png', lambda r: r.fulfill(status=200, content_type='image/png', body=POSTER))
        page.route('https://img.test/tall.png', lambda r: r.fulfill(status=200, content_type='image/png', body=TALL))
        abrir(page, ARTICULOS[0]['id'])
        s = estado(page)
        hidden = 1 - s['frame'] / (1200 / 675)
        assert 0 < hidden < .15, s
        # El cartel se recorta poco en el lector: se centra para no perder el texto del borde.
        assert s['focus'] == '50% 50%' and s['saved'] == '98% 50%', s
        assert s['position'] == '50% 50%', s
        if SHOTS: page.screenshot(path=f'{SHOTS}/lector-cartel-390.png')
        # Otro artículo en el mismo lector: recorte grande, manda el encuadre guardado.
        page.evaluate("closeModal()")
        abrir(page, ARTICULOS[1]['id'])
        s = estado(page)
        assert s['focus'] == '50% 20%' and s['saved'] == '50% 20%', s
        # Volver al cartel no arrastra el encuadre anterior.
        page.evaluate("closeModal()")
        abrir(page, ARTICULOS[0]['id'])
        assert estado(page)['focus'] == '50% 50%'
        # Al girar a una pantalla ancha el cartel no se recorta de lado: el valor guardado vuelve.
        page.set_viewport_size({'width': 1280, 'height': 900})
        page.wait_for_timeout(400)
        s = estado(page)
        assert s['frame'] > 1200 / 675 and s['focus'] == '98% 50%', s
        assert not page.errors, page.errors
    print('PASS: recorte pequeño centrado en el lector, recorte grande con el encuadre guardado, cambio de artículo y de tamaño.')


if __name__ == '__main__':
    run()
