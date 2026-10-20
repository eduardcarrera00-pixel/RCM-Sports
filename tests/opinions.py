"""Sección Opiniones sobre la página completa (Chromium + Supabase falso).
Uso: python3 tests/opinions.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
IMG = (ROOT / 'assets/ae-takes-community-banner.webp').read_bytes()

BODY = ('Kansas City ha vuelto a ganar sin brillar, y eso es precisamente lo que debería preocupar al resto de la liga. '
        'El equipo controla los tiempos del partido como nadie.\n\n'
        'La defensa, que hace un año era la gran duda, ahora sostiene los partidos cerrados.\n\n'
        'No es el equipo más espectacular, pero sí el más difícil de eliminar en enero.')
OPINIONS = [
    {'id': '00000000-0000-4000-8000-000000000001', 'sport': 'nfl', 'title': 'Los Chiefs ganan feo y por eso siguen siendo los favoritos',
     'summary': 'La regularidad vale más que el espectáculo cuando llega enero.', 'body': BODY,
     'image': 'https://img.test/a.webp', 'image_focus_x': 50, 'image_focus_y': 40, 'author': 'Eduard Carrera',
     'is_published': True, 'featured': True, 'created_at': '2026-10-19T15:00:00Z', 'edited_at': None},
    {'id': '00000000-0000-4000-8000-000000000002', 'sport': 'futbol', 'title': 'El Barça de Flick ya no depende de un solo jugador',
     'summary': '', 'body': 'La rotación ha dejado de ser un parche y se ha convertido en un plan. ' * 6,
     'image': None, 'image_focus_x': 50, 'image_focus_y': 50, 'author': 'Redacción',
     'is_published': True, 'featured': False, 'created_at': '2026-10-18T10:00:00Z', 'edited_at': None},
    {'id': '00000000-0000-4000-8000-000000000003', 'sport': 'tenis', 'title': 'Alcaraz y el arte de sufrir en pista rápida',
     'summary': 'Una gira asiática que explica su madurez.', 'body': 'Hubo un tiempo en que Alcaraz se desesperaba en las pistas lentas. ' * 5,
     'image': 'https://img.test/c.webp', 'image_focus_x': 50, 'image_focus_y': 50, 'author': 'Redacción',
     'is_published': True, 'featured': False, 'created_at': '2026-10-17T10:00:00Z', 'edited_at': None},
    {'id': '00000000-0000-4000-8000-000000000004', 'sport': 'ciclismo', 'title': 'Borrador: el Tour 2027 se decide en la montaña',
     'summary': '', 'body': 'Texto en preparación para la presentación del recorrido del Tour.', 'image': None,
     'image_focus_x': 50, 'image_focus_y': 50, 'author': 'Redacción',
     'is_published': False, 'featured': False, 'created_at': '2026-10-20T08:00:00Z', 'edited_at': None},
]


def fake(user=None, admin=False):
    rows = [o for o in OPINIONS if admin or o['is_published']]  # como la política RLS
    return ('window.__fake.tables=' + json.dumps({'ae_opinions': rows, 'ae_opinion_views': [
                {'opinion_id': OPINIONS[0]['id'], 'views': 41}]}) + ';'
            'window.__fake.user=' + json.dumps(user) + ';'
            + ('window.__fake.tables.editors=[{user_id:' + json.dumps(user['id']) + '}];' if admin else '')
            + """window.__fake.rpc=window.__fake.rpc||{};window.__fake.calls=window.__fake.calls||[];
                 window.__fake.rpc.ae_bump_opinion_view=()=>({data:null,error:null});
                 window.__fake.rpc.ae_publish_opinion=a=>{const id='00000000-0000-4000-8000-0000000000aa';
                   window.__fake.tables.ae_opinions.unshift({id,sport:a.p_sport,title:a.p_title,summary:a.p_summary,body:a.p_body,image:a.p_image,
                   image_focus_x:a.p_image_focus_x,image_focus_y:a.p_image_focus_y,author:a.p_author,is_published:a.p_is_published,
                   featured:a.p_featured,created_at:new Date().toISOString(),edited_at:null});return {data:id,error:null};};
                 window.__fake.rpc.ae_update_opinion=a=>{const o=window.__fake.tables.ae_opinions.find(x=>x.id===a.p_opinion_id);
                   Object.assign(o,{title:a.p_title,body:a.p_body,sport:a.p_sport});return {data:a.p_opinion_id,error:null};};
                 window.__fake.rpc.ae_delete_opinion=a=>{window.__fake.tables.ae_opinions=window.__fake.tables.ae_opinions.filter(x=>x.id!==a.p_opinion_id);return {data:null,error:null};};
                 window.confirm=()=>true;""")


def images(page):
    page.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/webp', body=IMG))


def open_opinions(page):
    page.evaluate("filterByCategory('Opiniones')")
    page.wait_for_selector('#aeOpinions:not([hidden]) .ae-opinion-card', timeout=15000)
    page.wait_for_timeout(300)


def calls(page, name):
    return [c for c in page.evaluate('window.__fake.calls') if c.get('rpc') == name]


def run():
    user = {'id': 'u1', 'email': 'eduard@example.com', 'is_anonymous': False, 'user_metadata': {'username': 'eduard', 'display_name': 'Eduard'}}
    for dark in (False, True):
        for width in (390, 1366):
            with fp.full_page(fake_js=fake(), dark=dark, width=width) as page:
                images(page)
                assert page.locator('nav.ae-sport-nav .category-btn[data-category="Opiniones"]').is_visible()
                open_opinions(page)
                # Solo la sección de Opiniones a la vista
                for sel in ['#articlesGrid', '#heroSection', '#footballTakes']:
                    assert not page.locator(sel).is_visible(), sel
                assert page.locator('.ae-opinion-card').count() == 3, 'el borrador no se muestra al público'
                assert page.locator('#aeOpinionsWrite').is_hidden()
                assert page.locator('.ae-opinion-card').first.locator('.ae-opinion-title').inner_text().startswith('Los Chiefs')
                tabs = page.locator('#aeOpinionsTabs [role=tab] > span:first-child').all_inner_texts()
                assert tabs == ['Todas', 'NFL', 'Fútbol', 'Colegial', 'Ciclismo', 'Tenis'], tabs
                assert page.locator('.ae-opinions-tab-count').count() == 0, 'sin contadores en las pestañas'
                bar = page.evaluate("(()=>{const n=document.getElementById('aeOpinionsTabs');n.scrollTop=40;return [n.scrollTop,n.scrollHeight-n.clientHeight,getComputedStyle(n).overflowY]})()")
                assert bar[0] == 0 and bar[1] <= 0 and bar[2] == 'hidden', ('la barra no se mueve en vertical', bar)
                assert page.evaluate('document.documentElement.scrollWidth') <= width, 'sin scroll horizontal'
                if SHOTS:
                    page.screenshot(path=f'{SHOTS}/opiniones-{width}-{"dark" if dark else "light"}.png', full_page=True)
                if width == 390 and not dark:
                    page.locator('#aeOpinionsTabs [role=tab][data-sport="colegial"]').click()
                    assert 'Todavía no hay opiniones de Colegial' in page.locator('#aeOpinionsList').inner_text()
                    page.locator('#aeOpinionsTabs [role=tab][data-sport="tenis"]').click()
                    assert page.locator('.ae-opinion-card').count() == 1
                    page.locator('#aeOpinionsTabs [role=tab][data-sport="todas"]').click()
                # Leer la opinión
                page.locator('.ae-opinion-card .ae-opinion-open').first.click()
                page.wait_for_selector('#aeOpinionReader[open]')
                assert page.locator('.ae-opinion-reader-text p').count() == 3
                assert '41 lecturas' in page.locator('.ae-opinion-reader-by').inner_text()
                assert calls(page, 'ae_bump_opinion_view')[0]['args'] == {'p_opinion_id': OPINIONS[0]['id']}
                assert page.locator('#aeOpinionReaderAdmin').is_hidden()
                assert 'opinion=' in page.url
                page.wait_for_timeout(250)
                if SHOTS:
                    page.screenshot(path=f'{SHOTS}/opinion-reader-{width}-{"dark" if dark else "light"}.png')
                page.keyboard.press('Escape')
                page.wait_for_function("!location.search.includes('opinion=')", timeout=5000)
                assert page.locator('#aeOpinionReader[open]').count() == 0
                assert 'opinion=' not in page.url
                # Volver a otro deporte oculta Opiniones
                page.evaluate("filterByCategory('NFL')")
                assert page.locator('#aeOpinions').is_hidden()
                assert not page.errors, page.errors

    # Enlace directo
    with fp.full_page(fake_js=fake()) as page:
        page.goto(page.url.split('?')[0].replace('index.html', '') + 'index.html?opinion=' + OPINIONS[2]['id'], wait_until='load')
        page.wait_for_selector('#aeOpinionReader[open]', timeout=15000)
        assert 'Alcaraz' in page.locator('.ae-opinion-reader-title').inner_text()
        assert page.locator('#aeOpinions').is_visible()
        assert not page.errors, page.errors

    # Administrador: ve borradores, publica, edita y borra
    with fp.full_page(fake_js=fake(user=user, admin=True), width=1366) as page:
        images(page)
        open_opinions(page)
        page.wait_for_selector('#aeOpinionsWrite:not([hidden])', timeout=10000)
        assert page.locator('.ae-opinion-card').count() == 4
        assert page.locator('.ae-opinion-card.is-draft').count() == 1
        page.locator('#aeOpinionsWrite').click()
        page.wait_for_selector('#aeOpinionEditor[open]')
        if SHOTS:
            page.wait_for_timeout(200)
            page.screenshot(path=f'{SHOTS}/opinion-editor-1366.png')
        # validación en el cliente: no llama a la base de datos
        page.locator('#aeOpinionTitle').fill('Hola')
        page.locator('#aeOpinionSave').click()
        assert 'al menos 5' in page.locator('#aeOpinionFormError').inner_text()
        assert not calls(page, 'ae_publish_opinion')
        page.locator('#aeOpinionSport').select_option('colegial')
        page.locator('#aeOpinionTitle').fill('Ohio State manda en el Big Ten')
        page.locator('#aeOpinionBody').fill('Primer párrafo con suficiente longitud para guardar.\n\nSegundo párrafo.')
        page.locator('#aeOpinionImage').fill('https://img.test/new.webp')
        page.locator('#aeOpinionSave').click()
        page.wait_for_selector('#aeOpinionReader[open]', timeout=10000)
        args = calls(page, 'ae_publish_opinion')[0]['args']
        assert args['p_sport'] == 'colegial' and args['p_is_published'] is True and args['p_author'] == 'Eduard', args
        assert args['p_image'] == 'https://img.test/new.webp'
        assert 'Ohio State' in page.locator('.ae-opinion-reader-title').inner_text()
        assert page.locator('#aeOpinionReaderAdmin').is_visible()
        page.locator('#aeOpinionReaderEdit').click()
        page.wait_for_selector('#aeOpinionEditor[open]')
        assert page.locator('#aeOpinionTitle').input_value() == 'Ohio State manda en el Big Ten'
        page.locator('#aeOpinionTitle').fill('Ohio State ya manda en el Big Ten')
        page.locator('#aeOpinionSave').click()
        page.wait_for_selector('#aeOpinionReader[open]', timeout=10000)
        assert calls(page, 'ae_update_opinion')[0]['args']['p_title'] == 'Ohio State ya manda en el Big Ten'
        page.locator('#aeOpinionReaderDelete').click()
        page.wait_for_function("!document.querySelector('#aeOpinionReader').open")
        assert calls(page, 'ae_delete_opinion')
        assert 'Ohio State' not in page.locator('#aeOpinionsList').inner_text()
        assert not page.errors, page.errors

    with fp.full_page(fake_js=fake(user=user, admin=True), width=390, dark=True) as page:
        open_opinions(page)
        page.wait_for_selector('#aeOpinionsWrite:not([hidden])', timeout=10000)
        page.locator('#aeOpinionsWrite').click()
        page.wait_for_selector('#aeOpinionEditor[open]')
        assert page.evaluate('document.documentElement.scrollWidth') <= 390
        if SHOTS:
            page.wait_for_timeout(200)
            page.screenshot(path=f'{SHOTS}/opinion-editor-390-dark.png')
        assert not page.errors, page.errors
    print('PASS: Opiniones (público por deporte, lectura, enlace directo y administración).')


if __name__ == '__main__':
    try:
        run()
    except AssertionError:
        import traceback; traceback.print_exc(); sys.exit(1)
