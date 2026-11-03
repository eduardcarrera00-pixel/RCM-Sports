"""Navegación del teléfono: barra inferior y pestañas dentro de cada sección.

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).

Cubre, a 320/390 px de día y de noche (y 1366 px para escritorio):
  · la barra inferior Inicio · NFL · Fútbol · Picks · Perfil (Perfil al final);
  · NFL y Fútbol: Noticias · Takes · Quiniela, y qué módulo enseña cada
    pestaña (Savant · Rookie, debajo de Últimos Takes); Picks: Picks · Historial · Chefs;
  · la barra de pestañas queda fija arriba al bajar y toca el encabezado;
  · la dirección (?s=nfl&v=quiniela), abrir un enlace directo (también el
    antiguo ?v=clasificacion, que abre Takes) y el botón Atrás;
  · los atajos que llevan a un módulo (Top 10 NFL) abren su pestaña;
  · en escritorio no hay pestañas y se ve todo como antes;
  · sin errores de consola ni desbordamiento horizontal.

Uso: python3 -B tests/mobile-sections.py [--shots DIR]
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

SPORT_TABS = ['noticias', 'takes', 'quiniela']
# Módulos que deben verse (True) u ocultarse (False) en cada pestaña.
SPORT_EXPECT = {
    'noticias': {'#articlesGrid': True, '#aeSportLatestNews': True, '#freeTakes': False, '#RANK': True},
    'takes': {'#freeTakesTitle': True, '#aeSportTakeLeaders': True, '#freeTakesFeed': True, '#aeSportTakeRanking': True, '#aeNflTwinRankings': True,
              '#QUINIELA': False, '#aeSeasonPredictions': False, '#articlesGrid': False, '#RANK': False},
    'quiniela': {'#QUINIELA': True, '#freeTakesTitle': False, '#aeSportTakeRanking': False, '#articlesGrid': False},
}
PICKS_TABS = ['picks', 'historial', 'chefs']
PICKS_EXPECT = {
    'picks': {'#picksFeatured': True, '#cpPublishCta': True, '#cpSettleHistorySection': False, '#cpLeaderboard': False},
    'historial': {'#cpSettleHistorySection': True, '#aeHomePickHistoric': True, '#picksFeatured': False, '#cpPublishCta': False, '#cpLeaderboard': False},
    'chefs': {'#cpLeaderboard': True, '#cpWorstLeaderboard': True, '#picksFeatured': False, '#cpSettleHistorySection': False},
}

STATE = """() => ({
  cat: currentCategory, tab: document.body.dataset.camTab || null, url: location.search,
  bar: !document.getElementById('camSectionTabs').hidden,
  tabs: [...document.querySelectorAll('#camSectionTabs button')].map(b => b.dataset.tab),
  current: document.querySelector('#camSectionTabs [aria-current="true"]')?.dataset.tab || null,
  barTop: document.getElementById('camSectionTabs').getBoundingClientRect().top,
  headerBottom: document.querySelector('body > header').getBoundingClientRect().bottom,
  overflow: document.documentElement.scrollWidth - innerWidth,
  dock: [...document.querySelectorAll('body > nav.cam-mobile-bottom-nav > button')]
    .filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.category || b.id)
})"""
SHOWN = "sels => Object.fromEntries(sels.map(s => { const el = document.querySelector(s); return [s, !!el && el.getClientRects().length > 0]; }))"


def expect_modules(page, expect, where):
    resolved = {}
    for sel, want in expect.items():
        sport = page.evaluate('currentCategory')
        real = {'#RANK': '#nflRankings' if sport == 'NFL' else '#championsRankings',
                '#QUINIELA': '#camNflQuiniela' if sport == 'NFL' else '#camFootballQuiniela'}.get(sel, sel)
        resolved[real] = want
    shown = page.evaluate(SHOWN, list(resolved))
    for sel, want in resolved.items():
        assert shown[sel] == want, f'{where}: {sel} debería {"verse" if want else "ocultarse"} · {shown}'


def phone(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=800) as page:
        page.wait_for_timeout(800)
        st = page.evaluate(STATE)
        assert st['dock'] == ['Todos', 'NFL', 'Fútbol', 'Picks', 'Opiniones'], f'{where}: barra inferior {st["dock"]}'
        assert not st['bar'], f'{where}: Inicio no lleva pestañas'

        for cat, slug, tabs, expect in [('NFL', 'nfl', SPORT_TABS, SPORT_EXPECT), ('Fútbol', 'futbol', SPORT_TABS, SPORT_EXPECT),
                                        ('Picks', 'picks', PICKS_TABS, PICKS_EXPECT)]:
            page.click(f'body > nav.cam-mobile-bottom-nav > button[data-category="{cat}"]')
            page.wait_for_timeout(700)
            st = page.evaluate(STATE)
            assert st['bar'] and st['tabs'] == tabs, f'{where} {cat}: pestañas {st}'
            assert st['current'] == tabs[0] and st['url'] == f'?s={slug}&v={tabs[0]}', f'{where} {cat}: inicio {st}'
            assert abs(st['barTop'] - st['headerBottom']) <= 1.5, f'{where} {cat}: la barra no toca el encabezado {st}'
            for tab in tabs:
                page.click(f'#camSectionTabs button[data-tab="{tab}"]')
                page.wait_for_timeout(450)
                st = page.evaluate(STATE)
                assert st['current'] == tab and st['url'] == f'?s={slug}&v={tab}', f'{where} {cat}/{tab}: {st}'
                assert st['overflow'] <= 1, f'{where} {cat}/{tab}: desbordamiento {st["overflow"]}px'
                expect_modules(page, expect[tab], f'{where} {cat}/{tab}')
                if tab == 'takes':
                    gap = page.evaluate("""() => {
                      const shown = [...document.getElementById('freeTakes').children].filter(e => e.getClientRects().length);
                      const rank = shown.findIndex(e => e.id === 'aeSportTakeRanking');
                      const feed = shown.findIndex(e => e.id === 'freeTakesFeed');
                      return {order: shown.slice(feed, rank + 1).map(e => e.id || e.className),
                              below: document.getElementById('aeSportTakeRanking').getBoundingClientRect().top - document.getElementById('freeTakesFeed').getBoundingClientRect().bottom};
                    }""")
                    assert gap['below'] >= 0 and all(i in ('freeTakesFeed', 'aeSportTakeRanking') or 'ae-football-mobile-cta' in i or 'ae-history-more' in i or 'ae-nfl-take-footer' in i for i in gap['order']), f'{where} {cat}: la clasificación no va debajo de Últimos Takes {gap}'
                if SHOTS: page.screenshot(path=str(SHOTS / f'{where}-{slug}-{tab}.png'))
            # Fija arriba al bajar.
            # (dentro de la sección: al llegar al pie de página la barra se va con ella)
            page.evaluate("scrollTo(0, Math.min(900, document.getElementById('mainContent').getBoundingClientRect().bottom + scrollY - 400))")
            page.wait_for_timeout(250)
            top = page.evaluate("document.getElementById('camSectionTabs').getBoundingClientRect().top")
            if page.evaluate('scrollY') > 200:
                assert abs(top) <= 1, f'{where} {cat}: la barra de pestañas no queda fija ({top})'
            page.evaluate('scrollTo(0, 0)')

        # Atrás: de Picks vuelve a Fútbol en la última pestaña usada (una sola vez por sección).
        page.go_back(); page.wait_for_timeout(700)
        st = page.evaluate(STATE)
        assert st['cat'] == 'Fútbol' and st['current'] == 'quiniela', f'{where}: Atrás {st}'
        page.go_back(); page.wait_for_timeout(700)
        st = page.evaluate(STATE)
        assert st['cat'] == 'NFL' and st['current'] == 'quiniela', f'{where}: Atrás 2 {st}'

        # Un atajo al Top 10 NFL abre su pestaña.
        page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Todos"]'); page.wait_for_timeout(500)
        page.evaluate('openNflTopTen()'); page.wait_for_timeout(600)
        st = page.evaluate(STATE)
        assert st['cat'] == 'NFL' and st['current'] == 'noticias', f'{where}: Top 10 {st}'
        assert page.evaluate("document.getElementById('nflRankings').getBoundingClientRect().top") >= 40, f'{where}: el Top 10 queda bajo la barra'

        # Tocar otra vez la sección activa sube arriba.
        page.evaluate('scrollTo(0, 700)'); page.wait_for_timeout(200)
        page.click('body > nav.cam-mobile-bottom-nav > button[data-category="NFL"]'); page.wait_for_timeout(900)
        assert page.evaluate('scrollY') < 5, f'{where}: tocar NFL otra vez no sube'

        # Opiniones sigue en el encabezado y no lleva pestañas.
        page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Opiniones"]'); page.wait_for_timeout(700)
        st = page.evaluate(STATE)
        assert st['cat'] == 'Opiniones' and not st['bar'] and st['url'] == '?s=opiniones', f'{where}: Opiniones {st}'

        # Perfil (sin sesión) abre el acceso.
        page.click('#camNavProfile'); page.wait_for_timeout(400)
        assert page.evaluate("!document.getElementById('userAuthModal').classList.contains('hidden')"), f'{where}: Perfil no abre el acceso'
        assert page.errors == [], f'{where}: errores {page.errors}'

        # Enlace directo.
        base = page.url.split('/index.html')[0]
        page.goto(base + '/index.html?s=futbol&v=quiniela', wait_until='load'); page.wait_for_timeout(1500)
        st = page.evaluate(STATE)
        assert st['cat'] == 'Fútbol' and st['current'] == 'quiniela', f'{where}: enlace directo {st}'
        expect_modules(page, SPORT_EXPECT['quiniela'], f'{where} enlace directo')
        # Enlace antiguo a la pestaña Clasificación: abre Takes.
        page.goto(base + '/index.html?s=nfl&v=clasificacion', wait_until='load'); page.wait_for_timeout(1500)
        st = page.evaluate(STATE)
        assert st['cat'] == 'NFL' and st['current'] == 'takes' and st['url'] == '?s=nfl&v=takes', f'{where}: enlace antiguo {st}'
        expect_modules(page, SPORT_EXPECT['takes'], f'{where} enlace antiguo')
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def desktop(dark):
    where = f'1366-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=1366, height=900, scale=1) as page:
        page.wait_for_timeout(800)
        assert page.evaluate("document.getElementById('camNavProfile')") is None, f'{where}: Perfil solo en teléfono'
        order = page.evaluate("[...document.querySelectorAll('header nav.ae-sport-nav > button')].filter(b => !b.hidden).map(b => b.dataset.category)")
        assert order == ['Picks', 'NFL', 'Fútbol', 'Opiniones'], f'{where}: menú de escritorio {order}'
        for cat, sels in [('NFL', ['#nflRankings', '#articlesGrid', '#freeTakesTitle', '#camNflQuiniela', '#aeSportTakeRanking']),
                          ('Picks', ['#picksFeatured', '#cpSettleHistorySection', '#cpLeaderboard'])]:
            page.evaluate('c => filterByCategory(c)', cat); page.wait_for_timeout(700)
            assert page.evaluate("document.getElementById('camSectionTabs').hidden"), f'{where} {cat}: pestañas en escritorio'
            shown = page.evaluate(SHOWN, sels)
            assert all(shown.values()), f'{where} {cat}: escritorio debe verlo todo {shown}'
        page.evaluate('() => filterByCategory("Fútbol")'); page.wait_for_timeout(300)
        assert page.evaluate('location.search') == '?s=futbol', f'{where}: dirección en escritorio'
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


if __name__ == '__main__':
    for width in (390, 320):
        for dark in (False, True):
            phone(width, dark)
    for dark in (False, True):
        desktop(dark)
    print('PASS: navegación del teléfono (barra inferior y pestañas por sección)')
