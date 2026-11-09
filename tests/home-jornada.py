"""Inicio en el teléfono: «Tu jornada» (atajos + filas deslizables).

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).

Cubre:
  · 320 y 390 px, de día y de noche: «Tu jornada» se ve en Inicio y los bloques
    de la portada de siempre se ocultan; atajos con el número de partidos
    abiertos; filas Cierran pronto (Pick del editor vigente + las dos quinielas
    intercaladas), Últimas noticias, Takes de la comunidad y Power Rankings;
    sin desbordamiento horizontal ni errores de consola;
  · cada tarjeta abre lo de siempre: la quiniela (?s=nfl&v=quiniela), la
    noticia, la conversación del Take, el Top 10 (Power Rankings en NFL · La semana),
    el compositor de Takes;
    al volver a Inicio, «Tu jornada» vuelve a verse;
  · vacíos: sin partidos ni Pick no hay fila Cierran pronto; sin Takes queda
    solo la invitación; sin Power Rankings no hay fila;
  · cuota: los partidos y los Takes se piden una vez (también en escritorio desde
    el 8 nov 2026, aprobado: mismas consultas que el teléfono);
  · escritorio (1366 px): «Tu jornada» compuesta en columnas; el detalle está en
    tests/escritorio-secciones.py.

Uso: python3 -B tests/home-jornada.py [--shots DIR]
"""
import importlib.util, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

BASE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  // Cuenta qué tablas se leen (el Supabase falso no registra los select).
  const tables = F.tables; F.reads = [];
  F.tables = new Proxy(tables, { get(t, k) { if (typeof k === 'string') F.reads.push(k); return t[k]; } });
  const H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  const art = (n, category, days, title) => ({id: 'a000000' + n + '-0000-4000-8000-000000000000', title, category,
    author: 'Eduard Carrera', image: '', summary: 'Resumen ' + n, body: '<p>Texto de la nota ' + n + ' con unas cuantas palabras.</p>', featured: false,
    created_at: new Date(Date.now() - days * 864e5).toISOString(), is_public: true, image_focus_x: 50, image_focus_y: 50});
  tables.articles = [art(1, 'Fútbol', 1, 'Sin margen para aprender, toca ganar'), art(2, 'NFL', 2, 'Power Rankings NFL Semana 7'),
    art(3, 'Fútbol', 3, 'El guardián olvidado'), art(4, 'NFL', 4, 'Cleveland Browns: un carrusel de QBs y la reconstrucción que busca despegarse de la etiqueta perdedora')];
  tables.nfl_rankings = [{id: 1, edition: 'Semana 7', team_ids: ['SF','MIN','BUF','KC','JAX','CHI','DEN','CIN','GB','SEA']}];
  tables.nfl_ranking_history = [{team_ids: ['SF','BUF','MIN','KC','JAX','CHI','DEN','CIN','GB','CLE']}];
  if (!F.noGames) {
    const nfl = (id, h, a, hours, ph, pa) => ({id, season: 2026, week: 9, home_id: h, away_id: a, kickoff: iso(hours), status: 'scheduled', picks_open: true, odds_locked_at: iso(-100), points_home: ph, points_away: pa});
    tables.cam_nfl_games = [nfl('n1', 'BAL', 'JAX', 48, 3, 5), nfl('n2', 'KC', 'NYJ', 100, 3, 10), nfl('n3', 'SF', 'LV', 103, 2, 10),
      // cerrados: ya empezado, sin cuotas, sin abrir
      nfl('n4', 'MIN', 'BUF', -2, 5, 4), {...nfl('n5', 'NE', 'GB', 110, 3, 5), odds_locked_at: null}, {...nfl('n6', 'SEA', 'ARI', 120, 2, 12), picks_open: false}];
    const fb = (id, c, h, a, hours, ph, pd, pa) => ({id, competition: c, season: 2026, matchday: 19, home_id: h, away_id: a, kickoff: iso(hours), status: 'scheduled', picks_open: true, odds_locked_at: iso(-100), points_home: ph, points_draw: pd, points_away: pa});
    tables.cam_football_games = [fb('f1', 'champions', '436', '364', 16, 10, 9, 4), fb('f2', 'champions', '887', '86', 16, 12, 12, 3),
      fb('f3', 'laliga', '243', '96', 66, 4, 7, 8), fb('f4', 'ligamx', '15720', '17851', 71, 4, 8, 9)];
    tables.cam_football_teams = [['436', 'Fenerbahce'], ['364', 'Liverpool'], ['887', 'AEK Athens'], ['86', 'Real Madrid'], ['243', 'Sevilla'],
      ['96', 'Alavés'], ['15720', 'Atl. San Luis'], ['17851', 'Juárez']].map(([id, name]) => ({id, name, short_name: name, abbreviation: name.slice(0, 3).toUpperCase(), logo: ''}));
    tables.ae_editorial_weekly_picks = [{id: 'w1', title: 'El Clásico', event_name: 'FC Barcelona vs Real Madrid', selection: 'Over 4.5', american_odds: 125,
      analysis: 'Será cine.', created_at: iso(-20), expires_at: iso(30), is_published: true, banner_focus_x: 50, banner_focus_y: 50, image_focus_x: 50, image_focus_y: 50}];
  }
  const takes = F.noTakes ? [] : [
    {id: '8d48deaf-c697-44a9-8804-f8aa9a582939', author_id: '88f58f66-b74f-4aa2-8b92-23845678cecd', author: 'madridista234', sport: 'football', competition: 'Champions League',
     title: 'Real Madrid Campeón Champions', body: 'Se viene la orejona a casa', created_at: iso(-130), upvotes: 0, downvotes: 1, my_vote: null},
    {id: '7c0d7a44-72e6-45b9-be3b-4392af6b0da7', author_id: 'b5b3c2ca-c2bd-418c-b9ea-6b34612b6976', author: 'eduardcarrera00', sport: 'football', competition: 'Balón de Oro',
     title: 'Lamine Yamal Balón de Oro 2026', body: 'Hay futbolistas que se ven por pasión, y otros, como Lamine, por el privilegio de contemplar su arte.', created_at: iso(-380), upvotes: 3, downvotes: 0, my_vote: null}];
  F.rpc.ae_public_take_feed = () => ({data: takes, error: null});
  if (F.noRanking) tables.nfl_rankings = [];
})();
"""
EMPTY = "window.__fake = window.__fake || {}; window.__fake.noGames = true; window.__fake.noTakes = true; window.__fake.noRanking = true;"

STATE = """() => {
  const root = document.getElementById('camHomeJornada');
  const shown = s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; };
  return {
    on: document.body.classList.contains('cam-home-jornada'), visible: !!root && !root.hidden && shown('#camHomeJornada'),
    cat: currentCategory, url: location.search, tab: document.body.dataset.camTab || null,
    rows: Object.fromEntries([...document.querySelectorAll('#camHomeJornada .cam-hj-section')].map(s => [s.dataset.row, s.hidden ? null : s.querySelectorAll('.cam-hj-item').length])),
    badges: [...document.querySelectorAll('#camHomeJornada .cam-hj-shortcut')].map(b => b.querySelector('.cam-hj-badge')?.textContent || ''),
    jornada: [...document.querySelectorAll('#camHomeJornada [data-row=jornada] .cam-hj-card')].map(c => c.classList.contains('cam-hj-editor') ? 'pick' : c.dataset.sport || 'mas'),
    old: ['#picksFeatured', '#heroSection', '.editorial-layout'].map(shown),
    overflow: document.documentElement.scrollWidth - innerWidth,
    height: document.documentElement.scrollHeight,
    reads: window.__fake.reads.filter(t => /^cam_(nfl|football)_(games|teams)$/.test(t)),
    feedCalls: window.__fake.calls.filter(c => c.rpc === 'ae_public_take_feed' && c.args?.p_sport === 'all').length,
    loadedAt: window.camHomeJornada?._state().loadedAt || 0
  };
}"""

# Recorte de textos: un nodo de texto que se sale de su caja sin «…».
CLIPPED = """() => {
  const out = [];
  for (const node of document.querySelectorAll('#camHomeJornada :is(.cam-hj-card-title,.cam-hj-heading,.cam-hj-title,.cam-hj-shortcut-label,.cam-hj-league,.cam-hj-when,.cam-hj-cta,.cam-hj-more)')) {
    const style = getComputedStyle(node);
    if (style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none' && style.webkitLineClamp) continue;
    if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 2) out.push(node.className + ': ' + node.textContent.trim().slice(0, 40));
  }
  return out;
}"""


def tap(page, selector):
    page.locator(selector).first.scroll_into_view_if_needed()
    page.click(selector)
    page.wait_for_timeout(600)


def go_home(page):
    page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Todos"]')
    page.wait_for_timeout(600)


def phone(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=BASE, dark=dark, width=width, height=800) as page:
        page.wait_for_timeout(1000)
        st = page.evaluate(STATE)
        assert st['on'] and st['visible'], f'{where}: Tu jornada no se ve {st}'
        assert st['old'] == [False, False, False], f'{where}: la portada de siempre sigue a la vista {st["old"]}'
        assert st['rows'] == {'jornada': 10, 'news': 4, 'takes': 3, 'rankings': 1}, f'{where}: filas {st["rows"]}'
        assert st['badges'] == ['3', '4', '', ''], f'{where}: atajos {st["badges"]}'
        # Pick del editor primero; después las quinielas intercaladas (la más próxima delante) y sus dos accesos.
        assert st['jornada'] == ['pick', 'football', 'nfl', 'football', 'nfl', 'football', 'nfl', 'football', 'mas', 'mas'], f'{where}: Cierran pronto {st["jornada"]}'
        assert st['overflow'] <= 1, f'{where}: desbordamiento {st["overflow"]}px'
        assert st['height'] < 800 * 3.4, f'{where}: la portada mide {st["height"]}px'
        clipped = page.evaluate(CLIPPED)
        assert not clipped, f'{where}: textos recortados {clipped}'
        trends = page.evaluate("[...document.querySelectorAll('#camHomeJornada .cam-hj-trend')].map(t => t.textContent)")
        assert trends == ['▲ 1', '▼ 1'], f'{where}: tendencias {trends}'
        if SHOTS: page.screenshot(path=str(SHOTS / f'{where}-inicio.png'), full_page=True)

        # Una sola carga de partidos y Takes (el Supabase falso lee cada tabla dos veces por consulta).
        assert st['feedCalls'] == 1 and sorted(set(st['reads'])) == ['cam_football_games', 'cam_football_teams', 'cam_nfl_games'], f'{where}: consultas {st}'
        loaded_at = st['loadedAt']

        # Partido NFL → quiniela NFL; Inicio → Tu jornada otra vez (sin volver a pedir datos).
        tap(page, '#camHomeJornada .cam-hj-game[data-sport="nfl"]')
        st = page.evaluate(STATE)
        # En NFL la quiniela vive en La semana (4 nov 2026): se abre esa pestaña y se baja hasta la quiniela.
        assert st['cat'] == 'NFL' and st['tab'] == 'semana' and st['url'] == '?s=nfl&v=semana' and not st['on'], f'{where}: partido NFL {st}'
        q_top = page.evaluate("document.getElementById('camNflQuiniela').getBoundingClientRect().top")
        assert 0 <= q_top < 200, f'{where}: el partido NFL no lleva a la quiniela ({q_top})'
        go_home(page)
        st = page.evaluate(STATE)
        assert st['on'] and st['visible'] and st['loadedAt'] == loaded_at, f'{where}: volver a Inicio no debe volver a pedir datos {st}'
        # Atajo Quiniela Fútbol.
        tap(page, '#camHomeJornada .cam-hj-shortcut[data-shortcut="football"]')
        st = page.evaluate(STATE)
        assert st['cat'] == 'Fútbol' and st['tab'] == 'quiniela', f'{where}: atajo fútbol {st}'
        go_home(page)
        # Pick del editor → Picks.
        tap(page, '#camHomeJornada .cam-hj-editor')
        st = page.evaluate(STATE)
        assert st['cat'] == 'Picks' and st['tab'] == 'picks', f'{where}: Pick del editor {st}'
        go_home(page)
        # Noticia → lector.
        tap(page, '#camHomeJornada .cam-hj-news')
        assert page.evaluate("!document.getElementById('articleModal').classList.contains('hidden')"), f'{where}: la noticia no se abre'
        assert 'Sin margen' in page.evaluate("document.getElementById('modalTitle')?.textContent || ''"), f'{where}: otra noticia'
        page.keyboard.press('Escape'); page.wait_for_timeout(500)
        if not page.evaluate("document.getElementById('articleModal').classList.contains('hidden')"):
            page.evaluate("closeArticleModal?.()"); page.wait_for_timeout(300)
        # Take → conversación.
        tap(page, '#camHomeJornada .cam-hj-take')
        assert page.evaluate("!!document.getElementById('aeTakeDiscussion')?.open"), f'{where}: el Take no abre su conversación'
        page.evaluate("document.getElementById('aeTakeDiscussion').close()"); page.wait_for_timeout(300)
        # Power Rankings → Top 10 de NFL (los Power Rankings de siempre, dentro de La semana).
        tap(page, '#camHomeJornada .cam-hj-ranking[data-sport="nfl"]')
        st = page.evaluate(STATE)
        assert st['cat'] == 'NFL' and st['tab'] == 'semana', f'{where}: Top 10 {st}'
        rank_top = page.evaluate("document.getElementById('nflRankings').getBoundingClientRect().top")
        assert 0 <= rank_top < 400, f'{where}: el Top 10 no queda a la vista ({rank_top})'
        go_home(page)
        # Publicar Take: compositor (o el acceso si hace falta sesión).
        tap(page, '#camHomeJornada .cam-hj-shortcut[data-shortcut="take"]')
        opened = page.evaluate("!!document.getElementById('aeTakeComposerDialog')?.open || !document.getElementById('userAuthModal').classList.contains('hidden')")
        assert opened, f'{where}: Publicar Take no abre nada'
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def empty(width):
    where = f'{width}-vacio'
    with fp.full_page(fake_js=EMPTY + BASE, width=width, height=800) as page:
        page.wait_for_timeout(1000)
        st = page.evaluate(STATE)
        assert st['on'] and st['rows'] == {'jornada': None, 'news': 4, 'takes': 1, 'rankings': None}, f'{where}: filas {st["rows"]}'
        assert st['badges'] == ['', '', '', ''], f'{where}: atajos {st["badges"]}'
        assert page.evaluate("document.querySelector('#camHomeJornada [data-row=takes] .cam-hj-invite') !== null"), f'{where}: falta la invitación'
        assert page.errors == [], f'{where}: errores {page.errors}'
        if SHOTS: page.screenshot(path=str(SHOTS / f'{where}.png'), full_page=True)
    print('PASS', where)


def desktop(dark):
    """Desde el 8 nov 2026 «Tu jornada» también compone Inicio en escritorio."""
    where = f'1366-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=BASE, dark=dark, width=1366, height=900, scale=1) as page:
        page.wait_for_timeout(1000)
        st = page.evaluate(STATE)
        assert st['on'] and st['visible'], f'{where}: Tu jornada en escritorio {st}'
        assert not st['old'][1] and st['old'][2], f'{where}: portada en escritorio (sin el hero, con los destacados) {st["old"]}'
        assert st['feedCalls'] == 1, f'{where}: los Takes se piden una vez {st}'
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


if __name__ == '__main__':
    for width in (390, 320):
        for dark in (False, True):
            phone(width, dark)
    empty(390)
    for dark in (False, True):
        desktop(dark)
    print('PASS: Inicio en el teléfono («Tu jornada»)')
