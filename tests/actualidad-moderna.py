"""Actualidad moderna (8 nov 2026) sobre la página completa (Chromium + Supabase falso).
Uso: python3 -B tests/actualidad-moderna.py [--shots DIR]
Comprueba: «Lo más leído» dentro de Actualidad, título oculto, ranking de debates con
barra a favor / en contra, pestañas fijas, cambio de deporte, «Ver todo», carga con
bloques grises, sin desplazamiento horizontal y que Inicio no muestra nada de esto.
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
# El cliente falso no implementa abortSignal; sin él las noticias no cargarían.
fp.FAKE_CLIENT = fp.FAKE_CLIENT.replace("'overlaps']", "'overlaps', 'abortSignal']")
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None

HEADS = [('NFL', 'Los Chiefs ganan feo y por eso siguen siendo los favoritos'), ('Fútbol', 'El Barça de Flick ya no depende de un solo jugador'),
         ('NFL', 'Los Lions necesitan una defensa de enero'), ('Fútbol', 'El guardián olvidado del Real Madrid'),
         ('NFL', 'Por qué los Bills vuelven a ser candidatos'), ('Fútbol', 'La Premier ya no es la liga más difícil'),
         ('NFL', 'El draft que cambió a los Texans'), ('Fútbol', 'Yamal y la madurez que nadie esperaba'),
         ('NFL', 'Semana 10: lo que aprendimos del domingo')]
ARTICLES = [{'id': 1000 + i, 'legacy_id': None, 'title': t, 'category': c, 'football_team': '',
             'created_at': '2026-11-0%dT1%d:00:00Z' % (8 - i % 8, i % 9), 'author': ['Eduard Carrera', 'Adrian Mendoza'][i % 2],
             'image': None, 'image_focus_x': 50, 'image_focus_y': 50, 'image_zoom_pct': 100,
             'summary': 'Resumen de la crónica.', 'body': '<p>' + 'Texto de la crónica. ' * 60 + '</p>',
             'featured': i == 0, 'is_public': True} for i, (c, t) in enumerate(HEADS)]
TAKES = [{'id': 100 + i, 'title': t, 'body': 'Argumento de la comunidad. ' * 6, 'sport': s, 'author': 'usuario%d' % i,
          'author_id': 'a%d' % i, 'upvotes': up, 'downvotes': down, 'my_vote': 0, 'created_at': '2026-11-0%dT12:00:00Z' % (1 + i)}
         for i, (t, s, up, down) in enumerate([('Mahomes no es el mejor QB', 'nfl', 0, 0), ('El VAR está matando el fútbol', 'laliga', 7, 3),
                                                ('Los Jets deberían reconstruir ya', 'nfl', 3, 1), ('Yamal será Balón de Oro', 'laliga', 10, 4),
                                                ('Los Eagles sobrevaloran su línea', 'nfl', 6, 2)])]
REPLIES = {100: 4, 103: 2}
COMMENTS = [{'id': 'c1', 'article_id': 1001, 'parent_id': None, 'author': 'aficionado', 'body': 'No estoy de acuerdo con este análisis.',
             'created_at': '2026-11-05T10:00:00Z', 'article_title': HEADS[1][1], 'upvotes': 1, 'downvotes': 3, 'my_vote': 0}]


def fake(slow=False):
    return ('window.__fake.tables=' + json.dumps({'ae_opinions': [], 'ae_opinion_views': [], 'articles': ARTICLES,
                                                  'rcm_comment_totals': COMMENTS, 'comments': []}) + ';'
            'window.__fake.rpc=window.__fake.rpc||{};window.__fake.calls=[];'
            'const T=' + json.dumps(TAKES) + ',R=' + json.dumps(REPLIES) + ';'
            'window.__fake.rpc.ae_public_take_feed=()=>' + ('new Promise(r=>setTimeout(()=>r({data:T,error:null}),4000))' if slow else '({data:T,error:null})') + ';'
            'window.__fake.rpc.ae_public_take_reply_counts=a=>({data:a.p_take_ids.filter(id=>R[id]).map(id=>({take_id:id,reply_count:R[id]})),error:null});'
            'window.__fake.rpc.ae_bump_opinion_view=()=>({data:null,error:null});')


def open_actualidad(page):
    page.evaluate("filterByCategory('Opiniones')")
    page.wait_for_selector('#aeOpinions:not([hidden]) .ae-opinion-card', timeout=15000)
    page.wait_for_selector('#aeOpinionsDebatedContent .ae-opinions-take', timeout=15000)
    page.wait_for_timeout(800)


def run():
    for dark in (False, True):
        for width in (390, 1366):
            with fp.full_page(fake_js=fake(), dark=dark, width=width, height=844) as page:
                open_actualidad(page)
                assert page.evaluate('document.documentElement.scrollWidth') <= width, 'sin desplazamiento horizontal'
                assert page.evaluate("document.getElementById('aeTrendingPortada').parentNode.id") == 'aeOpinionsTrendingSlot', \
                    '«Lo más leído» se queda en Actualidad'
                assert page.locator('#aeTrendingPortada #trendingList > li').count() == 5
                assert page.evaluate("document.getElementById('aeOpinionsHeading').getBoundingClientRect().height") <= 1, 'título solo para lectores de pantalla'
                assert page.locator('.ae-opinions-front-grid .ae-opinion-card').count() == 3
                assert page.locator('.ae-opinions-front-grid .is-lead').count() == 1
                assert page.locator('.ae-opinions-recent-list .ae-opinion-card').count() == 6
                assert page.locator('#aeOpinions .ae-opinion-author').all_inner_texts() == ['Por Adrian Mendoza'] * 4, \
                    'la firma de la casa no se repite'
                assert page.locator('#aeOpinionsDebatedContent .cam-act-rank').all_inner_texts() == ['1', '2']
                assert page.locator('#aeOpinionsDebatedContent .cam-act-meter').count() == 2
                assert 'Debate de la comunidad' not in page.locator('#aeOpinionsDebatedContent').inner_text()
                assert page.evaluate("[...document.querySelectorAll('#aeOpinionsCommunitySlot .cam-act-meter')].filter(m=>m.offsetWidth>0).length") >= 1
                assert page.evaluate("getComputedStyle(document.querySelector('#aeOpinionsCommunitySlot .editorial-community > .ae-section-heading')).display") == 'none', \
                    'el título del panel no se repite'
                if SHOTS:
                    page.screenshot(path=f'{SHOTS}/actualidad-{width}-{"dark" if dark else "light"}.png', full_page=True)
                # Pestañas fijas al bajar y vuelta al principio al cambiar de deporte
                page.mouse.wheel(0, 1600); page.wait_for_timeout(400)
                tabs = page.locator('#aeOpinionsTabs')
                assert 'is-stuck' in tabs.get_attribute('class')
                top = page.evaluate("parseFloat(getComputedStyle(document.getElementById('aeOpinions')).getPropertyValue('--cam-act-sticky-top'))")
                assert abs(page.evaluate("document.getElementById('aeOpinionsTabs').getBoundingClientRect().top") - top) < 1
                page.locator('#aeOpinionsTabs [data-sport="nfl"]').click(); page.wait_for_timeout(900)
                assert abs(page.evaluate("document.getElementById('aeOpinions').getBoundingClientRect().top") - top) < 2
                assert set(page.locator('#aeOpinions .ae-opinion-card .ae-opinion-sport').all_inner_texts()) == {'NFL'}
                assert page.locator('#aeOpinionsSports .ae-opinions-sport-block').count() == 0
                page.locator('#aeOpinionsTabs [data-sport="tenis"]').click(); page.wait_for_timeout(300)
                assert 'Todavía no hay publicaciones de Tenis' in page.locator('#aeOpinionsList').inner_text()
                page.locator('#aeOpinionsTabs [data-sport="todas"]').click(); page.wait_for_timeout(300)
                see = page.locator('#aeOpinionsSports .ae-opinions-sport-link').first
                assert see.get_attribute('aria-label') == 'Ver todo de NFL'
                see.click(); page.wait_for_timeout(300)
                assert page.locator('#aeOpinionsTabs [aria-selected=true]').get_attribute('data-sport') == 'nfl'
                # Inicio no cambia
                page.evaluate("filterByCategory('Todos')"); page.wait_for_timeout(800)
                assert page.evaluate("document.getElementById('aeTrendingPortada').parentNode.id") != 'aeOpinionsTrendingSlot'
                assert page.evaluate("[...document.querySelectorAll('.cam-act-meter')].filter(m=>m.offsetWidth>0).length") == 0
                assert not page.errors, page.errors

    # Mientras cargan los debates se ven bloques grises con texto para lectores de pantalla
    with fp.full_page(fake_js=fake(slow=True), width=390, height=844) as page:
        page.evaluate("filterByCategory('Opiniones')"); page.wait_for_timeout(600)
        assert page.locator('#aeOpinionsDebatedContent .cam-act-skeleton-item').count() == 3
        assert 'Consultando los debates' in page.locator('#aeOpinionsDebatedContent .cam-act-sr').inner_text()
        page.wait_for_selector('#aeOpinionsDebatedContent .ae-opinions-take', timeout=10000)
        assert not page.errors, page.errors
    print('Actualidad moderna: portada, últimas, debates, opinadores, lo más leído, pestañas, carga e Inicio verificados.')


run()
