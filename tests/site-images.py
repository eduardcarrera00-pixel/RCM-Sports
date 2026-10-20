"""Imágenes del sitio editables (Chromium + Supabase falso, página completa).
Uso: python3 tests/site-images.py [--shots DIR]

- Público: ningún lápiz en el DOM y la página igual que antes (sin reemplazos).
- Admin: un lápiz por imagen editable; el diálogo guarda con ae_set_site_image.
- Un reemplazo se aplica en todas las instancias (fondo CSS, <img> y recorte de atlas).
- Restaurar (ae_reset_site_image) vuelve a la imagen del código.
- Los clics en tarjetas con lápiz siguen funcionando.
"""
import importlib.util, json, pathlib, sys, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
IMG = (ROOT / 'assets/ae-takes-community-banner.webp').read_bytes()
USER = {'id': 'u1', 'email': 'eduard@example.com', 'is_anonymous': False,
        'user_metadata': {'username': 'eduard', 'display_name': 'Eduard'}}


def fake(admin=False, rows=None):
    js = 'window.__fake.tables=' + json.dumps({'ae_site_images': rows or []}) + ';'
    if admin:
        js += ('window.__fake.user=' + json.dumps(USER) + ';window.__fake.tables.editors=[{user_id:"u1"}];'
               "try{localStorage.setItem('cam_sports_admin_welcome_preview_u1','1')}catch(e){}")
    js += """window.__fake.rpc=window.__fake.rpc||{};
      window.__fake.rpc.ae_set_site_image=a=>{const t=window.__fake.tables.ae_site_images;
        const i=t.findIndex(r=>r.key===a.p_key); const row={key:a.p_key,url:a.p_url,focus_x:a.p_focus_x,focus_y:a.p_focus_y,alt:a.p_alt};
        if(i>=0)t[i]=row;else t.push(row);return {data:row,error:null};};
      window.__fake.rpc.ae_reset_site_image=a=>{window.__fake.tables.ae_site_images=window.__fake.tables.ae_site_images.filter(r=>r.key!==a.p_key);return {data:null,error:null};};
      window.confirm=()=>true;"""
    return js


def images(page):
    page.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/webp', body=IMG))


def bg(page, selector):
    return page.evaluate('s=>{const n=document.querySelector(s);return n?getComputedStyle(n).backgroundImage:null}', selector)


def visible_pencils(page):
    return page.evaluate("""[...document.querySelectorAll('cam-site-image-layer > .cam-site-image-pencil')]
        .filter(b=>!b.hidden).map(b=>{const r=b.getBoundingClientRect();return {key:b.dataset.key,w:r.width,h:r.height}})""")


def calls(page, name):
    return [c for c in page.evaluate('window.__fake.calls') if c.get('rpc') == name]


def run():
    # 1) Público sin reemplazos: nada nuevo en el DOM, imágenes originales.
    for dark in (False, True):
        with fp.full_page(fake_js=fake(), dark=dark, width=1366) as page:
            page.wait_for_timeout(800)
            assert page.locator('cam-site-image-layer, .cam-site-image-pencil, #camSiteImageDialog').count() == 0
            assert page.evaluate("document.querySelectorAll('img[srcset]').length") == 0
            assert ('ae-nfl-stadium-night' if dark else 'ae-nfl-stadium.svg') in bg(page, '#homeRankingLink')
            assert page.evaluate("document.querySelector('img.cam-brand-art').currentSrc").endswith('cam-sports-logo.webp?v=20261020-armonia-1')
            assert page.evaluate('camSiteImages._state().decls') == 0, 'sin reemplazos no se recorren las hojas'
            assert not page.errors, page.errors

    # 2) Público con reemplazos guardados: se aplican en todas las instancias.
    rows = [
        {'key': 'portada.ranking-nfl', 'url': 'https://img.test/nfl.webp', 'focus_x': 30, 'focus_y': 70, 'alt': None},
        {'key': 'marca.logo', 'url': 'https://img.test/logo.webp', 'focus_x': None, 'focus_y': None, 'alt': 'CAM Sports nuevo'},
        {'key': 'portada.populares-dia', 'url': 'https://img.test/pop.webp', 'focus_x': None, 'focus_y': None, 'alt': None},
    ]
    with fp.full_page(fake_js=fake(rows=rows), width=1366) as page:
        images(page)
        page.wait_for_timeout(800)
        assert 'img.test/nfl.webp' in bg(page, '#homeRankingLink'), bg(page, '#homeRankingLink')
        logos = page.evaluate("[...document.querySelectorAll('img.cam-brand-art')].map(i=>[i.getAttribute('srcset'),i.alt,i.getAttribute('src')])")
        assert len(logos) >= 2 and all(l[0] == 'https://img.test/logo.webp' and l[1] == 'CAM Sports nuevo' for l in logos), logos
        assert all('cam-sports-logo.webp' in l[2] for l in logos), 'src no cambia'
        pop = bg(page, '#aeHomeTakesPopular .ae-vote-column-heading')
        assert 'img.test/pop.webp' in pop and 'atlas' not in pop, pop
        unpop = bg(page, '#aeHomeTakesUnpopular .ae-vote-column-heading')
        assert 'ae-community-banner-atlas' in unpop, 'el resto del mosaico sigue igual'
        assert page.locator('cam-site-image-layer').count() == 0
        # Caché: la siguiente visita aplica el reemplazo antes de consultar la base
        cached = page.evaluate("JSON.parse(localStorage.getItem('cam_site_images_v1')).map(r=>r.key).sort()")
        assert cached == sorted(r['key'] for r in rows), cached
        assert not page.errors, page.errors
    with fp.full_page(fake_js=fake(rows=rows), dark=True, width=1366) as page:
        images(page)
        page.wait_for_timeout(600)
        assert 'ae-community-banner-atlas' in bg(page, '#aeHomeTakesPopular .ae-vote-column-heading'), 'la variante de día no toca la de noche'

    # 3) Admin: lápices, diálogo, guardar, restaurar.
    for width in (390, 1366):
        with fp.full_page(fake_js=fake(admin=True), width=width) as page:
            images(page)
            page.wait_for_timeout(1200)
            pencils = visible_pencils(page)
            page.evaluate("document.querySelector('#aeHomeTakesPopular .ae-vote-column-heading').scrollIntoView({block:'center'})")
            page.wait_for_timeout(400)
            pencils += visible_pencils(page)
            keys = {p['key'] for p in pencils}
            # En móvil «Impopulares» queda fuera de pantalla (carrusel): su lápiz se oculta.
            for k in ['marca.logo', 'portada.populares-dia'] + (['portada.impopulares-dia'] if width > 800 else []):
                assert k in keys, (k, sorted(keys))
            assert all(p['w'] <= 18.5 and p['h'] <= 18.5 for p in pencils), 'lápiz diminuto'
            if SHOTS:
                page.screenshot(path=f'{SHOTS}/site-images-admin-{width}.png')
            # Abrir el diálogo desde el lápiz de «Populares»
            page.locator('cam-site-image-layer > .cam-site-image-pencil[data-key="portada.populares-dia"]').first.click()
            page.wait_for_selector('#camSiteImageDialog[open]')
            assert 'Populares' in page.locator('#camSiteImageDialog [data-ui=label]').inner_text()
            assert page.locator('#camSiteImageDialog [data-ui=variants] button').count() == 2, 'día y noche'
            assert page.locator('#camSiteImageDialog [data-ui=badge]').inner_text() == 'Original'
            page.fill('#camSiteImageDialog [data-ui=url]', 'https://img.test/new-pop.webp')
            assert page.locator('#camSiteImageDialog [data-ui=badge]').inner_text() == 'Nueva'
            page.wait_for_timeout(150)
            if SHOTS:
                page.screenshot(path=f'{SHOTS}/site-images-dialog-{width}.png')
            page.locator('#camSiteImageDialog [data-act=save]').click()
            page.wait_for_function("!document.getElementById('camSiteImageDialog').open")
            assert calls(page, 'ae_set_site_image')[-1]['args']['p_url'] == 'https://img.test/new-pop.webp'
            page.wait_for_timeout(300)
            assert 'img.test/new-pop.webp' in bg(page, '#aeHomeTakesPopular .ae-vote-column-heading')
            # El lápiz sigue en el mismo sitio con la imagen nueva
            page.wait_for_timeout(500)
            assert 'portada.populares-dia' in {p['key'] for p in visible_pencils(page)}
            # Restaurar
            page.locator('cam-site-image-layer > .cam-site-image-pencil[data-key="portada.populares-dia"]').first.click()
            page.wait_for_selector('#camSiteImageDialog[open]')
            assert page.locator('#camSiteImageDialog [data-act=reset]').is_visible()
            page.locator('#camSiteImageDialog [data-act=reset]').click()
            page.wait_for_function("!document.getElementById('camSiteImageDialog').open")
            assert calls(page, 'ae_reset_site_image')[-1]['args'] == {'p_key': 'portada.populares-dia'}
            page.wait_for_timeout(300)
            assert 'ae-community-banner-atlas' in bg(page, '#aeHomeTakesPopular .ae-vote-column-heading')
            # Fondo CSS usado en varias reglas: cambia en todas sus instancias
            page.evaluate("camSiteImages.open('portada.ranking-nfl', document.querySelector('#homeRankingLink'))")
            page.wait_for_selector('#camSiteImageDialog[open]')
            page.fill('#camSiteImageDialog [data-ui=url]', 'https://img.test/nfl2.webp')
            page.check('#camSiteImageDialog [data-ui=focusOn]')
            page.locator('#camSiteImageDialog [data-act=save]').click()
            page.wait_for_function("!document.getElementById('camSiteImageDialog').open")
            args = calls(page, 'ae_set_site_image')[-1]['args']
            assert args['p_focus_x'] == 50 and args['p_focus_y'] == 50, args
            assert 'img.test/nfl2.webp' in bg(page, '#homeRankingLink')
            page.evaluate("document.documentElement.classList.add('dark')")
            page.wait_for_timeout(200)
            assert 'ae-nfl-stadium-night' in bg(page, '#homeRankingLink'), 'de noche manda su propia imagen'
            page.evaluate("document.documentElement.classList.remove('dark')")
            # <img> (icono de navegación)
            page.evaluate("camSiteImages.open('nav.opiniones', document.querySelector('[data-category=Opiniones] img'))")
            page.wait_for_selector('#camSiteImageDialog[open]')
            page.fill('#camSiteImageDialog [data-ui=url]', 'https://img.test/op.webp')
            page.locator('#camSiteImageDialog [data-act=save]').click()
            page.wait_for_function("!document.getElementById('camSiteImageDialog').open")
            assert page.evaluate("document.querySelector('[data-category=Opiniones] img').getAttribute('srcset')") == 'https://img.test/op.webp'
            # Los clics en tarjetas con lápiz siguen funcionando
            page.evaluate("filterByCategory('Opiniones')")
            page.wait_for_timeout(300)
            assert page.locator('#aeOpinions').is_visible()
            page.evaluate("filterByCategory('Todos')")
            page.wait_for_timeout(500)
            page.locator('#homeRankingLink').click(position={'x': 30, 'y': 30})
            page.wait_for_timeout(500)
            assert page.evaluate("document.body.classList.contains('ae-is-nfl')"), 'la tarjeta abre NFL'
            # Cerrar sesión retira los lápices
            page.evaluate('currentAdmin=null;renderAdminUI()')
            assert page.locator('cam-site-image-layer').count() == 0
            assert not page.errors, page.errors

    # 4) Un fallo de la base (migración sin aplicar) se explica en el diálogo.
    js = fake(admin=True) + "window.__fake.rpc.ae_set_site_image=()=>{throw Error('Could not find the function public.ae_set_site_image in the schema cache')};"
    with fp.full_page(fake_js=js, width=1366) as page:
        page.wait_for_timeout(800)
        page.evaluate("camSiteImages.open('nav.nfl', document.querySelector('[data-category=NFL] img'))")
        page.wait_for_selector('#camSiteImageDialog[open]')
        page.fill('#camSiteImageDialog [data-ui=url]', 'https://img.test/x.webp')
        page.locator('#camSiteImageDialog [data-act=save]').click()
        page.wait_for_timeout(300)
        assert 'migración' in page.locator('#camSiteImageDialog [data-ui=error]').inner_text()
        assert page.evaluate("document.querySelector('[data-category=NFL] img').getAttribute('srcset')") is None

    # 5) Coste: recorrer las hojas (solo admins o con reemplazos)
    with fp.full_page(fake_js=fake(rows=rows), width=1366) as page:
        ms = page.evaluate("(()=>{const t=performance.now();for(let i=0;i<5;i++)camSiteImages.refresh();return performance.now()-t})()")
        assert ms < 200, ms
    print('site-images: OK')


if __name__ == '__main__':
    run()
