"""Actualidad · ajustes del 13 nov (tarde), en todas las pestañas (Chromium + Supabase falso).
Uso: python3 -B tests/actualidad-ajustes.py
Comprueba: Opinadores distinguidos a todo el ancho (antes se encogía a 0 px y el texto
salía letra a letra), «Ver más comentarios» abre hacia abajo sin desbordar, la portada
mide lo mismo en cada pestaña aunque tenga poco texto (la imagen ocupa el sobrante),
«Responder» a la derecha de me gusta y comentarios y abre los comentarios de la noticia.
"""
import importlib.util, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
fp.FAKE_CLIENT = fp.FAKE_CLIENT.replace("'overlaps']", "'overlaps', 'abortSignal']")

LONG = 'Hoy se tenía que ganar, y se ganó. El Barça se llevó el 1-2 del Metropolitano y conserva el liderato, aunque volvió a dejar la sensación de que cualquier pérdida podía acabar en un susto.'
STORIES = [('a1', 'Power Rankings NFL Semana 9', 'NFL', '2026-11-12T21:50:00Z', 'Power Rankings terminando la semana 9 de la NFL'),
           ('a2', 'Frenkie de Jong y su masterclass de intensidad reviven al Barça', 'Fútbol', '2026-11-09T01:33:00Z', LONG),
           ('a3', 'POWER RANKINGS FUTBOL', 'Fútbol', '2026-11-05T18:38:00Z', LONG),
           ('a4', 'Power Rankings NFL Semana 8', 'NFL', '2026-11-04T21:40:00Z', 'Power Rankings terminando la semana 8 de la NFL')]
ARTICLES = [{'id': i, 'legacy_id': None, 'title': t, 'category': c, 'football_team': None, 'created_at': d, 'author': 'eduardcarrera00',
             'image': None, 'image_focus_x': 50, 'image_focus_y': 50, 'image_zoom_pct': 100, 'summary': s,
             'body': '<p>' + 'Texto. ' * 300 + '</p>', 'featured': False, 'is_public': True} for i, t, c, d, s in STORIES]
LEADERS = [{'id': 'c%d' % n, 'article_id': 'a2', 'parent_id': None, 'author': 'aficionado%d' % n,
            'body': 'Fermín se lleva mi voto por decidir el partido. Lo de Frenkie cambia el ritmo, pero el empate antes del descanso fue clave.',
            'created_at': '2026-11-09T18:12:32Z', 'article_title': STORIES[1][1], 'upvotes': 5 - n, 'downvotes': 0, 'my_vote': 0} for n in range(3)]
TAKES = [{'id': 't1', 'title': 'Buffalo ganará la AFC esta temporada', 'body': 'Argumento.', 'sport': 'nfl', 'author': 'buffalo_mafia',
          'author_id': 'u1', 'upvotes': 3, 'downvotes': 2, 'my_vote': 0, 'created_at': '2026-11-11T12:00:00Z'},
         {'id': 't2', 'title': 'El Arsenal llegará más lejos que el City', 'body': 'Argumento.', 'sport': 'football', 'author': 'gunner_norte',
          'author_id': 'u2', 'upvotes': 4, 'downvotes': 1, 'my_vote': 0, 'created_at': '2026-11-07T12:00:00Z'},
         {'id': 't3', 'title': 'Haaland llegará al Barça', 'body': 'Argumento.', 'sport': 'football', 'author': 'adrian',
          'author_id': 'u3', 'upvotes': 2, 'downvotes': 0, 'my_vote': 0, 'created_at': '2026-11-04T12:00:00Z'}]
REPLIES = {'t1': 2, 't2': 2, 't3': 1}
FAKE = ('window.__fake.tables=' + json.dumps({'ae_opinions': [], 'ae_opinion_views': [], 'articles': ARTICLES, 'comments': [],
                                              'rcm_article_totals': [{'article_id': 'a1', 'likes': 2, 'my_like': False, 'top_comment': None}],
                                              'rcm_comment_totals': LEADERS}) + ';'
        'window.__fake.rpc=window.__fake.rpc||{};'
        'const T=' + json.dumps(TAKES) + ',R=' + json.dumps(REPLIES) + ';'
        'window.__fake.rpc.ae_public_take_feed=()=>({data:T,error:null});'
        'window.__fake.rpc.ae_public_take_reply_counts=a=>({data:a.p_take_ids.map(id=>({take_id:id,reply_count:R[id]||0})),error:null});'
        'window.__fake.rpc.ae_bump_opinion_view=()=>({data:null,error:null});')


def run():
    for dark in (True, False):
        for width in (390, 1366):
            with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=844) as page:
                page.evaluate("filterByCategory('Opiniones')")
                page.wait_for_selector('#aeOpinions:not([hidden]) .cam-act-approved-hero', timeout=15000)
                page.wait_for_selector('#communityLeaders .ae-community-scroll-entry', timeout=15000)
                page.wait_for_timeout(900)
                heights = {}
                for tab in ('todas', 'nfl', 'futbol', 'colegial'):
                    page.locator(f'#aeOpinionsTabs [data-sport="{tab}"]').click(); page.wait_for_timeout(700)
                    m = page.evaluate('''() => {
                      const r = s => document.querySelector(s)?.getBoundingClientRect();
                      const hero = r('#aeOpinionsList .cam-act-approved-hero');
                      const leaders = r('#communityLeaders'), entry = r('#communityLeaders .ae-community-scroll-entry');
                      const list = r('#aeOpinionsDebatedContent'), last = [...document.querySelectorAll('#aeOpinionsDebatedContent > *')].pop()?.getBoundingClientRect();
                      const row = document.querySelector('#aeOpinionsList .cam-act-approved-hero .cam-news-interactions');
                      const reply = row?.querySelector('.cam-news-reply')?.getBoundingClientRect();
                      return { hero: hero.height, leaders: leaders.width, entry: entry.width, list: document.getElementById('aeOpinionsList').getBoundingClientRect().width,
                               gap: list && last ? list.bottom - last.bottom : 0, replyRight: reply ? row.getBoundingClientRect().right - reply.right : null,
                               replies: document.querySelectorAll('#aeOpinionsList .ae-opinion-card:not(.is-sym-empty) .cam-news-reply').length,
                               cards: document.querySelectorAll('#aeOpinionsList .ae-opinion-card:not(.is-sym-empty) .cam-actualidad-news-actions').length,
                               scroll: document.documentElement.scrollWidth };
                    }''')
                    assert m['scroll'] <= width, (tab, 'sin desplazamiento horizontal')
                    assert m['leaders'] >= m['list'] * 0.95 - 1, (tab, 'Opinadores distinguidos ocupa el ancho de la columna', m)
                    assert m['entry'] >= min(300, m['leaders'] / 2 - 20), (tab, 'la tarjeta de comentario no se encoge', m)
                    assert m['replies'] == m['cards'], (tab, '«Responder» en cada tarjeta con me gusta y comentarios', m)
                    if m['replies']:
                        assert m['replyRight'] is not None and m['replyRight'] < 8, (tab, '«Responder» va a la derecha', m)
                    assert m['gap'] < 24, (tab, 'Lo más debatido no deja hueco vacío', m)
                    heights[tab] = m['hero']
                assert max(heights.values()) - min(heights.values()) < 2, ('portada del mismo alto en cada pestaña', heights)
                # «Ver más comentarios» abre hacia abajo, sin salirse de la columna.
                page.locator('#aeOpinionsTabs [data-sport="todas"]').click(); page.wait_for_timeout(500)
                more = page.locator('#communityLeaders .is-supported .cam-list-more')
                more.scroll_into_view_if_needed(); more.click(); page.wait_for_timeout(300)
                boxes = page.evaluate("[...document.querySelectorAll('#communityLeaders .is-supported .ae-community-scroll-entry')].map(e=>{const b=e.getBoundingClientRect();return [b.left,b.right,b.top]})")
                assert len(boxes) == 3 and len({round(b[0]) for b in boxes}) == 1 and boxes[0][2] < boxes[1][2] < boxes[2][2], boxes
                assert page.evaluate('document.documentElement.scrollWidth') <= width
                # «Responder» abre la noticia en los comentarios.
                page.evaluate('window.scrollTo(0,0)')
                page.locator('#aeOpinionsTabs [data-sport="nfl"]').click(); page.wait_for_timeout(500)
                page.locator('#aeOpinionsList .cam-act-approved-hero .cam-news-reply').click(); page.wait_for_timeout(1200)
                assert page.evaluate("!document.getElementById('articleModal').classList.contains('hidden')")
                assert page.evaluate("document.activeElement?.id") in ('commentText', 'commentAuthStatus')
                assert not page.errors, page.errors
    print('Actualidad: Opinadores a todo el ancho, portada del mismo alto con poco texto, debates sin hueco y «Responder» verificados en Todas, NFL, Fútbol y Colegial.')


run()
