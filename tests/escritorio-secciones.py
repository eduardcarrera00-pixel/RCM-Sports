"""Escritorio: las mismas secciones, pestañas y direcciones que el teléfono (8 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).

Cubre, a 1024, 1366 y 1920 px, de día y de noche:
  · cabecera: Inicio · NFL · Fútbol · Picks · Actualidad · Perfil (Perfil sustituye a
    «Iniciar sesión»), con la sección activa marcada;
  · sub-barra de pestañas fija bajo la cabecera en NFL, Fútbol y Picks, con
    pestaña activa, teclado (flechas) y direcciones ?s=…&v=… (también al
    abrir una dirección directamente y con el botón Atrás);
  · rejilla: ≥ 1280 px carril de atajos · contenido · carril derecho;
    1024–1279 px los atajos arriba y el carril derecho a la derecha;
    el carril derecho sigue fijo al bajar;
  · Inicio: «Cierran pronto» a todo el ancho con flechas ‹ ›, una noticia
    principal + cuatro, Takes en rejilla de tres, Power Rankings en el carril
    derecho; siguen a la vista Popular/Unpopular Takes, Genios/Anoetos, Take
    histórico y Picks de la comunidad;
  · NFL y Fútbol: La semana con su cabecera a todo el ancho, el duelo a la
    izquierda, lo de la semana a la derecha y la quiniela debajo; Takes en
    rejilla con las opiniones en el carril derecho (y de vuelta a su sitio al
    cambiar de pestaña); Noticias con Power Rankings y, en Fútbol, Lo más leído
    en el carril;
  · Picks: Mejores/Peores Chefs y Mis parties a la derecha del feed, el Pick
    histórico junto al historial, Chefs a todo el ancho; Actualidad («moderna»,
    9 nov) con su propia columna de Opinadores distinguidos y Lo más leído;
  · Perfil (≥ 1024 px): cabecera y cifras a la izquierda, pestañas y
    contenido a la derecha; «Cerrar» a la vista y sin textos recortados;
  · sin scroll horizontal, sin textos recortados (por el borde o por una
    esquina redondeada) y sin errores de consola;
  · teléfono (390 px): nada del escritorio aparece.

Uso: python3 -B tests/escritorio-secciones.py [--shots DIR]
"""
import importlib.util, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

FAKE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  const tables = F.tables;
  const H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  const art = (n, category, days, title) => ({id: 'a000000' + n + '-0000-4000-8000-000000000000', title, category,
    author: 'Eduard Carrera', image: '', summary: 'Resumen de la nota ' + n + ' para la portada.', body: '<p>Texto de la nota ' + n + '.</p>', featured: false,
    created_at: new Date(Date.now() - days * 864e5).toISOString(), is_public: true, image_focus_x: 50, image_focus_y: 50});
  tables.articles = [art(1, 'Fútbol', 1, 'Sin margen para aprender, toca ganar'), art(2, 'NFL', 2, 'Power Rankings NFL Semana 7'),
    art(3, 'Fútbol', 3, 'El guardián olvidado'), art(4, 'NFL', 4, 'Cleveland Browns: un carrusel de QBs y la reconstrucción que busca despegarse de la etiqueta perdedora'),
    art(5, 'Fútbol', 5, 'La Champions de los porteros'), art(6, 'NFL', 6, 'Sexta nota que no cabe en la portada')];
  tables.nfl_rankings = [{id: 1, edition: 'Semana 7', team_ids: ['SF','MIN','BUF','KC','JAX','CHI','DEN','CIN','GB','SEA']}];
  tables.nfl_ranking_history = [{team_ids: ['SF','BUF','MIN','KC','JAX','CHI','DEN','CIN','GB','CLE']}];
  const nfl = (id, h, a, hours, ph, pa) => ({id, season: 2026, week: 9, home_id: h, away_id: a, kickoff: iso(hours), status: 'scheduled', picks_open: true, odds_locked_at: iso(-100), points_home: ph, points_away: pa});
  tables.cam_nfl_games = [nfl('n1', 'BAL', 'JAX', 48, 3, 5), nfl('n2', 'KC', 'NYJ', 100, 3, 10), nfl('n3', 'SF', 'LV', 103, 2, 10)];
  const fb = (id, c, h, a, hours, ph, pd, pa) => ({id, competition: c, season: 2026, matchday: 19, home_id: h, away_id: a, kickoff: iso(hours), status: 'scheduled', picks_open: true, odds_locked_at: iso(-100), points_home: ph, points_draw: pd, points_away: pa});
  tables.cam_football_games = [fb('f1', 'champions', '436', '364', 16, 10, 9, 4), fb('f2', 'champions', '887', '86', 16, 12, 12, 3),
    fb('f3', 'laliga', '243', '96', 66, 4, 7, 8), fb('f4', 'ligamx', '15720', '17851', 71, 4, 8, 9)];
  tables.cam_football_teams = [['436', 'Fenerbahce'], ['364', 'Liverpool'], ['887', 'AEK Athens'], ['86', 'Real Madrid'], ['243', 'Sevilla'],
    ['96', 'Alavés'], ['15720', 'Atl. San Luis'], ['17851', 'Juárez']].map(([id, name]) => ({id, name, short_name: name, abbreviation: name.slice(0, 3).toUpperCase(), logo: ''}));
  tables.ae_editorial_weekly_picks = [{id: 'w1', title: 'El Clásico', event_name: 'FC Barcelona vs Real Madrid', selection: 'Over 4.5', american_odds: 125,
    analysis: 'Será cine.', created_at: iso(-20), expires_at: iso(30), is_published: true, banner_focus_x: 50, banner_focus_y: 50, image_focus_x: 50, image_focus_y: 50}];
  const take = (n, sport, competition, title, body, up, down) => ({id: '8d48deaf-c697-44a9-8804-f8aa9a58290' + n, author_id: '88f58f66-b74f-4aa2-8b92-23845678cecd',
    author: 'aficionado' + n, sport, competition, title, body, created_at: iso(-10 * n), upvotes: up, downvotes: down, my_vote: null});
  const takes = [take(1, 'football', 'Champions League', 'Real Madrid Campeón Champions', 'Se viene la orejona a casa', 0, 1),
    take(2, 'football', 'Balón de Oro', 'Lamine Yamal Balón de Oro 2026', 'Hay futbolistas que se ven por pasión, y otros, como Lamine, por el privilegio de contemplar su arte.', 3, 0),
    take(3, 'nfl', 'NFL', 'Los Chiefs vuelven al Super Bowl', 'Mahomes no perdona en enero.', 2, 1),
    take(4, 'football', 'LaLiga', 'El Barça gana la Liga', 'Flick ya encontró el equipo.', 1, 0),
    take(5, 'nfl', 'NFL', 'Los 49ers ganan su división', 'Purdy sigue creciendo.', 0, 0),
    take(6, 'football', 'Premier', 'El Arsenal por fin', 'Este año sí.', 4, 2)];
  F.rpc.ae_public_take_feed = () => ({data: takes, error: null});
})();
"""

TEXT_CHECK = r"""(scopes) => {
  // Textos recortados: una caja con overflow que esconde parte del texto (por el borde
  // o por su esquina redondeada). Los recortes buscados («…», clamp) y los carruseles no cuentan.
  const bad = [];
  const intended = el => { for (let e = el; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.textOverflow === 'ellipsis' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none')) return true; } return false; };
  for (const sel of scopes) for (const scope of document.querySelectorAll(sel)) {
    if (!scope.getClientRects().length) continue;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      const host = node.parentElement;
      if (!host || !host.getClientRects().length || getComputedStyle(host).visibility === 'hidden') continue;
      if (host.closest('.sr-only,[hidden],details:not([open])') || intended(host)) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) continue;
      for (let box = host; box && box !== document.body; box = box.parentElement) {
        const cs = getComputedStyle(box);
        if (/auto|scroll/.test(cs.overflowX + cs.overflowY)) break;  // se desplaza: no es un recorte
        if (!/hidden|clip/.test(cs.overflowX + cs.overflowY)) continue;
        const b = box.getBoundingClientRect();
        if (b.width < 3 || b.height < 3) break;
        const raw = cs.borderTopLeftRadius.split(' ')[0];
        const rad = Math.min(raw.endsWith('%') ? parseFloat(raw) * b.width / 100 : parseFloat(raw) || 0, b.width / 2, b.height / 2);
        for (const r of rects) {
          // Un texto que queda entero fuera de la caja está plegado a propósito (desplegables), no cortado.
          const inside = r.right > b.left + 1 && r.left < b.right - 1 && r.bottom > b.top + 1 && r.top < b.bottom - 1;
          if (!inside) continue;
          const out = r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 2 || r.bottom > b.bottom + 2;
          let corner = false;
          if (rad > 2) for (const [x, y, cx, cy] of [[r.left, r.top, b.left + rad, b.top + rad], [r.right, r.top, b.right - rad, b.top + rad],
                                                [r.left, r.bottom, b.left + rad, b.bottom - rad], [r.right, r.bottom, b.right - rad, b.bottom - rad]]) {
            const inX = (x < cx && cx - x < rad) || (x > cx && x - cx < rad), inY = (y < cy && cy - y < rad) || (y > cy && y - cy < rad);
            if (((x < b.left + rad) || (x > b.right - rad)) && ((y < b.top + rad) || (y > b.bottom - rad)) && inX && inY &&
                Math.hypot(x - cx, y - cy) > rad + 2) corner = true;
          }
          if (out || corner) { bad.push((host.id || host.className || host.tagName) + ' «' + node.textContent.trim().slice(0, 40) + '» ' + (out ? 'borde' : 'esquina') + ' de ' + (box.id || box.className || box.tagName)); break; }
        }
        break;
      }
    }
  }
  return [...new Set(bad)].slice(0, 12);
}"""

STATE = r"""() => {
  const q = s => document.querySelector(s);
  const vis = s => { const e = typeof s === 'string' ? q(s) : s; return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const rect = s => { const e = typeof s === 'string' ? q(s) : s; if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top + scrollY), b: Math.round(r.bottom + scrollY), w: Math.round(r.width), h: Math.round(r.height), vt: Math.round(r.top)}; };
  const nav = q('body > header nav.ae-sport-nav');
  const navButtons = nav ? [...nav.querySelectorAll('button.category-btn')].filter(b => b.getClientRects().length)
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left) : [];
  const bar = q('#camSectionTabs');
  return {
    desk: 'camDesk' in document.body.dataset, url: location.search, cat: currentCategory,
    nav: navButtons.map(b => (b.textContent || '').trim()),
    navCurrent: navButtons.filter(b => b.getAttribute('aria-current') === 'page').map(b => b.textContent.trim()),
    login: vis('#guestAdminContainer'),
    bar: vis(bar), tabs: bar ? [...bar.querySelectorAll('.cam-section-tab')].map(b => b.textContent.trim()) : [],
    current: bar ? (bar.querySelector('[aria-current="true"]') || {}).textContent || null : null,
    barRect: rect(bar), headerRect: rect('body > header'), mainRect: rect('#mainContent'),
    rail: rect('#camDeskRail'), railItems: [...document.querySelectorAll('#camDeskRail .cam-hj-shortcut')].filter(b => b.getClientRects().length).map(b => b.dataset.deskLabel || b.textContent.trim()),
    aside: rect('#camDeskAside'), asideIn: rect('#camDeskAside .cam-desk-aside-in'),
    rankings: [...document.querySelectorAll('#camDeskAside .cam-desk-rank-card')].map(c => [c.dataset.sport, c.querySelectorAll('.cam-desk-rank').length]),
    overflow: document.documentElement.scrollWidth - innerWidth,
  };
}"""

HOME = r"""() => {
  const q = s => document.querySelector(s);
  const vis = s => { const e = typeof s === 'string' ? q(s) : s; return !!e && e.getClientRects().length > 0; };
  const rect = e => { if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top + scrollY), b: Math.round(r.bottom + scrollY), w: Math.round(r.width)}; };
  const items = row => [...document.querySelectorAll('#camHomeJornada [data-row="' + row + '"] .cam-hj-item')].filter(e => e.getClientRects().length);
  const strip = q('#camHomeJornada [data-row="jornada"]');
  const pad = 24, main = q('#mainContent').getBoundingClientRect();
  return {
    on: document.body.classList.contains('cam-home-jornada'), head: vis('#camHomeJornada .cam-hj-top'),
    strip: rect(strip), stripFull: !!strip && Math.abs(strip.getBoundingClientRect().left - (main.left + pad)) <= 1.5 && Math.abs(strip.getBoundingClientRect().right - (main.right - pad)) <= 1.5,
    arrows: vis('#camHomeJornada .cam-desk-arrows'), nextDisabled: q('#camHomeJornada .cam-desk-arrow:last-child')?.disabled,
    stripCards: items('jornada').length,
    news: items('news').map(e => rect(e)), newsRow: rect(q('#camHomeJornada [data-row="news"] .cam-hj-row')),
    takes: items('takes').map(e => rect(e)),
    blocks: ['#aeHomeTakesPopular', '#aeHomeTakesUnpopular', '#aeHomeTopTakes', '#aeHomeTakeHistoric', '#camHomePicks'].map(s => vis(s)),
    gone: ['#articlesGrid', '#heroSection', '#aeTrendingPortada', '#communityTitle'].map(s => vis(s)),
  };
}"""

errors = []
def check(cond, msg):
    if not cond: errors.append(msg)

def shot(page, name):
    if SHOTS: page.screenshot(path=str(SHOTS / (name + '.png')), full_page=False)

def visit(page, query):
    page.goto(page.url.split('?')[0] + query, wait_until='load')
    page.wait_for_timeout(1500)

def home(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=900, scale=1) as page:
        page.wait_for_timeout(600)
        st, h = page.evaluate(STATE), page.evaluate(HOME)
        check(st['desk'], f'{where}: falta body[data-cam-desk]')
        check(st['nav'] == ['Inicio', 'NFL', 'Fútbol', 'Picks', 'Actualidad', 'Perfil'], f'{where}: cabecera {st["nav"]}')
        check(st['navCurrent'] == ['Inicio'], f'{where}: sección activa {st["navCurrent"]}')
        check(not st['login'], f'{where}: «Iniciar sesión» duplica a Perfil')
        check(not st['bar'], f'{where}: Inicio no lleva pestañas')
        check(st['overflow'] <= 0, f'{where}: scroll horizontal {st["overflow"]}')
        check(h['on'] and not h['head'], f'{where}: Tu jornada en escritorio {h["on"]} {h["head"]}')
        check(h['stripFull'] and h['stripCards'] >= 5, f'{where}: «Cierran pronto» a todo el ancho {h["strip"]} {h["stripCards"]}')
        check(h['arrows'] and h['nextDisabled'] is False, f'{where}: flechas de la tira {h["arrows"]} {h["nextDisabled"]}')
        before = page.evaluate("document.querySelector('#camHomeJornada [data-row=jornada] .cam-hj-row').scrollLeft")
        page.click('#camHomeJornada .cam-desk-arrow:last-child'); page.wait_for_timeout(700)
        after = page.evaluate("document.querySelector('#camHomeJornada [data-row=jornada] .cam-hj-row').scrollLeft")
        check(after > before, f'{where}: la flecha › no mueve la tira ({before} → {after})')
        check(not page.evaluate("document.querySelector('#camHomeJornada .cam-desk-arrow').disabled"), f'{where}: ‹ sigue desactivada tras avanzar')
        news = h['news']
        check(len(news) == 5, f'{where}: noticias en portada {len(news)} (una principal + cuatro)')
        if news and h['newsRow']:
            check(news[0]['w'] >= h['newsRow']['w'] - 2 and len({n['l'] for n in news[1:]}) == 2, f'{where}: rejilla de noticias {news}')
        takes = h['takes']
        check(len({t['l'] for t in takes[:3]}) == 3 and len({t['t'] for t in takes[:3]}) == 1, f'{where}: Takes en rejilla de tres {takes[:3]}')
        check(len(takes) == 6, f'{where}: cinco Takes + «Publica tu Take» ({len(takes)})')
        check(all(h['blocks']), f'{where}: Popular/Unpopular, Genios/Anoetos, Take histórico y Picks deben verse {h["blocks"]}')
        check(not any(h['gone']), f'{where}: bloques de la portada antigua a la vista {h["gone"]}')
        check(st['railItems'] == ['Quiniela NFL', 'Quiniela Fútbol', 'Publicar Take', 'Sube tu Pick', 'Mis parties'], f'{where}: atajos {st["railItems"]}')
        check(st['rankings'] and st['rankings'][0] == ['nfl', 5], f'{where}: Power Rankings en el carril {st["rankings"]}')
        news_left = news[0]['l'] if news else 0
        if width >= 1280:
            check(st['rail']['r'] < news_left and st['aside']['l'] > news[0]['r'], f'{where}: tres columnas {st["rail"]} {news[:1]} {st["aside"]}')
            check(st['rail']['t'] >= h['strip']['b'], f'{where}: los carriles empiezan bajo la tira {st["rail"]} {h["strip"]}')
        else:
            check(st['rail']['b'] <= news[0]['t'] and st['rail']['l'] == news_left, f'{where}: atajos sobre el contenido {st["rail"]} {news[:1]}')
            check(st['aside']['l'] > news[0]['r'], f'{where}: carril derecho a la derecha {st["aside"]} {news[:1]}')
        clipped = page.evaluate(TEXT_CHECK, ['body > header nav', '#camHomeJornada', '#camDeskRail', '#camDeskAside', '#mainContent > .editorial-layout'])
        check(not clipped, f'{where}: textos recortados en Inicio {clipped}')
        shot(page, f'{where}-inicio')
        # El carril derecho sigue a la vista al bajar.
        page.evaluate('window.scrollTo(0, 1100)'); page.wait_for_timeout(300)
        st2 = page.evaluate(STATE)
        check(st2['asideIn'] and 0 < st2['asideIn']['vt'] < 900, f'{where}: el carril derecho no se queda fijo {st2["asideIn"]}')
        check(not page.errors, f'{where}: errores {page.errors}')

def sections(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=900, scale=1) as page:
        page.click('body > header nav.ae-sport-nav button[data-category="NFL"]'); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        check(st['url'] == '?s=nfl&v=semana', f'{where}: dirección de NFL {st["url"]}')
        check(st['bar'] and st['tabs'] == ['La semana', 'Takes', 'Noticias'] and st['current'] == 'La semana', f'{where}: pestañas NFL {st["tabs"]} {st["current"]}')
        check(abs(st['barRect']['vt'] - st['headerRect']['b']) <= 1.5, f'{where}: la sub-barra no toca la cabecera {st["barRect"]} {st["headerRect"]}')
        check(st['navCurrent'] == ['NFL'], f'{where}: sección activa {st["navCurrent"]}')
        shot(page, f'{where}-nfl')
        page.click('#camSectionTabs [data-tab="takes"]'); page.wait_for_timeout(600)
        st = page.evaluate(STATE)
        check(st['url'] == '?s=nfl&v=takes' and st['current'] == 'Takes', f'{where}: pestaña Takes {st["url"]} {st["current"]}')
        check(page.evaluate("!!document.getElementById('freeTakesFeed').getClientRects().length && !document.getElementById('camNflQuiniela').getClientRects().length"),
              f'{where}: Takes muestra los Takes y esconde la quiniela')
        page.focus('#camSectionTabs [data-tab="takes"]'); page.keyboard.press('ArrowRight'); page.wait_for_timeout(600)
        st = page.evaluate(STATE)
        check(st['url'] == '?s=nfl&v=noticias' and st['current'] == 'Noticias', f'{where}: flecha del teclado {st["url"]} {st["current"]}')
        check(page.evaluate("!!document.getElementById('nflRankings').getClientRects().length"), f'{where}: Noticias enseña Power Rankings')
        # La sub-barra sigue fija bajo la cabecera al bajar.
        page.evaluate('window.scrollTo(0, 700)'); page.wait_for_timeout(300)
        st = page.evaluate(STATE)
        # Bajo la cabecera si la cabecera es fija; si no (modo noche), arriba del todo.
        sticky_header = page.evaluate("/sticky|fixed/.test(getComputedStyle(document.querySelector('body > header')).position) && document.querySelector('body > header').getBoundingClientRect().top >= 0")
        expected = st['headerRect']['h'] if sticky_header else 0
        check(abs(st['barRect']['vt'] - expected) <= 1.5, f'{where}: sub-barra fija al bajar {st["barRect"]} (esperado {expected})')
        # Otra sección suma un paso a Atrás; cambiar de pestaña no.
        page.click('body > header nav.ae-sport-nav button[data-category="Fútbol"]'); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        check(st['url'] == '?s=futbol&v=semana' and st['tabs'] == ['La semana', 'Takes', 'Noticias'], f'{where}: Fútbol {st["url"]} {st["tabs"]}')
        page.go_back(); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        check(st['cat'] == 'NFL' and st['current'] == 'Noticias', f'{where}: Atrás vuelve a NFL · Noticias {st["cat"]} {st["current"]} {st["url"]}')
        # Direcciones directas.
        for query, cat, tab in [('?s=futbol&v=takes', 'Fútbol', 'Takes'), ('?s=picks&v=chefs', 'Picks', 'Chefs'), ('?s=picks', 'Picks', 'Picks'),
                                ('?s=nfl&v=quiniela', 'NFL', 'La semana')]:
            visit(page, query)
            st = page.evaluate(STATE)
            check(st['cat'] == cat and st['current'] == tab, f'{where}: {query} abre {st["cat"]} · {st["current"]}')
            check(st['overflow'] <= 0, f'{where}: {query} scroll horizontal {st["overflow"]}')
            clipped = page.evaluate(TEXT_CHECK, ['body > header nav', '#camSectionTabs', '#camDeskRail', '#camDeskAside'])
            check(not clipped, f'{where}: {query} textos recortados {clipped}')
        visit(page, '?s=opiniones')
        st = page.evaluate(STATE)
        check(st['cat'] == 'Opiniones' and not st['bar'] and st['navCurrent'] == ['Actualidad'], f'{where}: Actualidad {st["cat"]} {st["bar"]} {st["navCurrent"]}')
        check(not page.errors, f'{where}: errores {page.errors}')

SPORT = r"""() => {
  const q = s => document.querySelector(s);
  const rect = e => { e = typeof e === 'string' ? q(e) : e; if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top + scrollY), b: Math.round(r.bottom + scrollY), w: Math.round(r.width)}; };
  const main = q('#mainContent').getBoundingClientRect();
  const visibleScore = ['#camNflScore', '#camFootballScore'].map(s => q(s)).find(e => e && e.getClientRects().length && e.childElementCount);
  return {
    main: {l: Math.round(main.left), r: Math.round(main.right)},
    head: rect('#mainContent .cam-nfl-semana .cam-ns-head:not(:empty)') || [...document.querySelectorAll('.cam-nfl-semana .cam-ns-head')].map(rect).find(Boolean) || null,
    leagues: !!q('#camFootballSemana .cam-ns-head .cam-football-leagues'),
    duel: [...document.querySelectorAll('.cam-nfl-semana .cam-ns-feature')].map(rect).find(Boolean) || null,
    score: rect(visibleScore), quiniela: rect('#camNflQuiniela') || rect('#camFootballQuiniela'),
    feed: [...document.querySelectorAll('#freeTakesFeed > .ae-free-take-card')].map(rect).filter(Boolean),
    asideKids: [...document.querySelectorAll('#camDeskAside .cam-desk-aside-in > *')].filter(e => e.getClientRects().length).map(e => e.id || e.className),
    asideOn: 'camDeskAside' in document.body.dataset, aside: rect('#camDeskAside'),
    leadersHome: (q('#aeSportTakeLeaders') || {}).parentElement?.id || null,
    trending: document.querySelectorAll('#camDeskAside #aeTrendingPortada .ae-trending-item').length,
    twin: [...document.querySelectorAll('#aeNflTwinRankings > section')].map(rect).filter(Boolean),
    rankings: ['#nflRankings', '#championsRankings'].map(s => !!rect(s)),
    rail: rect('#camDeskRail'),
  };
}"""

def sport(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=900, scale=1) as page:
        for query in ('?s=nfl', '?s=futbol'):
            visit(page, query); page.wait_for_timeout(700)
            sp = page.evaluate(SPORT)
            check(sp['head'] and abs(sp['head']['l'] - (sp['main']['l'] + 24)) <= 1.5 and abs(sp['head']['r'] - (sp['main']['r'] - 24)) <= 1.5,
                  f'{where} {query}: cabecera de La semana a todo el ancho {sp["head"]} {sp["main"]}')
            check(sp['duel'] and sp['quiniela'] and sp['quiniela']['t'] > sp['duel']['b'], f'{where} {query}: la quiniela va debajo del duelo {sp["duel"]} {sp["quiniela"]}')
            if sp['score']:
                check(sp['score']['l'] > sp['duel']['r'] and sp['score']['t'] < sp['duel']['b'], f'{where} {query}: lo de la semana a la derecha del duelo {sp["duel"]} {sp["score"]}')
            check(sp['rail']['t'] >= sp['head']['b'] - 1, f'{where} {query}: los carriles empiezan bajo la cabecera {sp["rail"]} {sp["head"]}')
            if query == '?s=futbol':
                check(sp['leagues'], f'{where}: el selector de ligas va en la cabecera de La semana')
            clipped = page.evaluate(TEXT_CHECK, ['#freeTakes', '#camDeskAside', '#camSectionTabs'])
            check(not clipped, f'{where} {query}: textos recortados {clipped}')
            shot(page, f'{where}-semana-{query[3:]}')
        visit(page, '?s=futbol&v=takes'); page.wait_for_timeout(500)
        sp = page.evaluate(SPORT)
        cols = 3 if width >= 1280 else 2
        check(len(sp['feed']) >= cols and len({f['l'] for f in sp['feed']}) == cols, f'{where}: Últimos Takes en rejilla de {cols} {sp["feed"]}')
        check(sp['asideKids'] == ['aeSportTakeLeaders'] and sp['leadersHome'] != 'freeTakes', f'{where}: opiniones en el carril {sp["asideKids"]} {sp["leadersHome"]}')
        check(sp['aside'] and sp['feed'] and sp['aside']['l'] > max(f['r'] for f in sp['feed']), f'{where}: carril a la derecha de los Takes {sp["aside"]} {sp["feed"]}')
        check(len(sp['twin']) == 2 and sp['twin'][0]['l'] == sp['twin'][1]['l'], f'{where}: Respira Fútbol y Vende Humos, una debajo de otra {sp["twin"]}')
        clipped = page.evaluate(TEXT_CHECK, ['#freeTakes', '#camDeskAside'])
        check(not clipped, f'{where} Takes: textos recortados {clipped}')
        shot(page, f'{where}-takes')
        page.click('#camSectionTabs [data-tab="noticias"]'); page.wait_for_timeout(700)
        sp = page.evaluate(SPORT)
        check(sp['leadersHome'] == 'freeTakes', f'{where}: las opiniones vuelven a su sitio al dejar Takes ({sp["leadersHome"]})')
        check(sp['asideKids'] == ['aeTrendingPortada'] and sp['trending'] >= 3, f'{where}: Lo más leído en el carril de Noticias de Fútbol {sp["asideKids"]} {sp["trending"]}')
        check(sp['rankings'][1], f'{where}: Power Rankings Champions en Noticias')
        clipped = page.evaluate(TEXT_CHECK, ['#camDeskAside'])
        check(not clipped, f'{where} Noticias: textos recortados {clipped}')
        visit(page, '?s=nfl&v=noticias')
        sp = page.evaluate(SPORT)
        check(sp['rankings'][0] and not sp['asideOn'], f'{where}: Noticias NFL con Power Rankings y sin carril derecho {sp["rankings"]} {sp["asideOn"]}')
        # Al ir a Actualidad, Lo más leído pasa a su hueco de Actualidad (no se queda suelto en el carril).
        visit(page, '?s=futbol&v=noticias'); page.click('body > header nav.ae-sport-nav button[data-category="Opiniones"]'); page.wait_for_timeout(900)
        check(page.evaluate("!!document.querySelector('#aeOpinionsTrendingSlot > #aeTrendingPortada')"), f'{where}: Lo más leído no llegó a su hueco de Actualidad')
        check(page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0, f'{where}: scroll horizontal en NFL/Fútbol')
        check(not page.errors, f'{where}: errores {page.errors}')

PICKS = r"""() => {
  const q = s => document.querySelector(s);
  const rect = e => { e = typeof e === 'string' ? q(e) : e; if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top + scrollY), b: Math.round(r.bottom + scrollY)}; };
  const boards = [...document.querySelectorAll('#communityPicks > .ae-chefs-dual-standings > section')].map(rect);
  return {
    feed: rect('#communityPicks > .ae-picks-community-main') || rect('#cpFeed'), editor: rect('#aePicksTopPair'),
    chefs: rect('#communityPicks > .ae-chefs-dual-standings'), boards, parties: rect('#camPartyEntryPicks'),
    history: rect('#cpSettleHistorySection'), historic: rect('#aeHomePickHistoric'),
    chefsHome: q('.ae-chefs-dual-standings')?.parentElement?.id || null,
    asideOn: 'camDeskAside' in document.body.dataset,
  };
}"""

OPINIONS = r"""() => {
  const q = s => document.querySelector(s);
  const rect = e => { e = typeof e === 'string' ? q(e) : e; if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top + scrollY)}; };
  return {
    aside: [...document.querySelectorAll('#camDeskAside .cam-desk-aside-in > *')].map(e => e.id),
    slots: ['#aeOpinionsCommunitySlot .editorial-community', '#aeOpinionsTrendingSlot #aeTrendingPortada'].map(s => !!q(s)),
    highlights: rect('#aeOpinionsHighlights'), list: rect('#aeOpinionsList'), rail: rect('#camDeskRail'),
    highlightsHome: q('#aeOpinionsHighlights')?.parentElement?.id || null,
    trendingHome: q('#aeTrendingPortada')?.parentElement?.id || null,
  };
}"""

def picks_and_opinions(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=900, scale=1) as page:
        visit(page, '?s=picks')
        pk = page.evaluate(PICKS)
        check(pk['feed'] and pk['chefs'] and pk['parties'], f'{where}: Picks · Picks enseña feed, Chefs y Mis parties {pk}')
        check(pk['chefsHome'] == 'communityPicks' and not pk['asideOn'], f'{where}: los Chefs no se mueven de #communityPicks {pk["chefsHome"]}')
        if pk['feed'] and pk['chefs']:
            check(pk['chefs']['l'] > pk['feed']['r'] and pk['chefs']['t'] < pk['feed']['b'], f'{where}: Chefs a la derecha del feed {pk["feed"]} {pk["chefs"]}')
            check(pk['editor']['b'] <= pk['feed']['t'], f'{where}: el Pick del editor encima del feed {pk["editor"]} {pk["feed"]}')
        clipped = page.evaluate(TEXT_CHECK, ['#footballTakes'])
        check(not clipped, f'{where} Picks: textos recortados {clipped}')
        shot(page, f'{where}-picks')
        page.click('#camSectionTabs [data-tab="historial"]'); page.wait_for_timeout(600)
        pk = page.evaluate(PICKS)
        check(not pk['feed'] and not pk['chefs'] and pk['history'] and pk['historic'], f'{where}: Historial {pk}')
        if pk['history'] and pk['historic']:
            check(pk['historic']['l'] > pk['history']['r'], f'{where}: Pick histórico a la derecha del historial {pk["history"]} {pk["historic"]}')
        page.click('#camSectionTabs [data-tab="chefs"]'); page.wait_for_timeout(600)
        pk = page.evaluate(PICKS)
        check(not pk['feed'] and len(pk['boards']) == 2 and pk['boards'][1]['l'] > pk['boards'][0]['r'] and pk['boards'][0]['t'] == pk['boards'][1]['t'],
              f'{where}: Chefs a todo el ancho, lado a lado {pk["boards"]} feed={pk["feed"]}')
        clipped = page.evaluate(TEXT_CHECK, ['#footballTakes'])
        check(not clipped, f'{where} Chefs: textos recortados {clipped}')
        page.click('body > header nav.ae-sport-nav button[data-category="Opiniones"]'); page.wait_for_timeout(1500)
        op = page.evaluate(OPINIONS)
        # «Actualidad moderna» (9 nov) trae su propia columna derecha: no se presta nada.
        check(op['aside'] == [] and all(op['slots']) and op['highlightsHome'] == 'aeOpinions', f'{where}: Actualidad con Opinadores y Lo más leído en su sitio {op}')
        if width >= 1280 and op['highlights'] and op['list']:
            check(op['rail']['r'] < op['list']['l'] and op['highlights']['l'] > op['list']['r'], f'{where}: Actualidad entre atajos y su columna derecha {op}')
        clipped = page.evaluate(TEXT_CHECK, ['#camDeskAside', '#aeOpinions'])
        check(not clipped, f'{where} Actualidad: textos recortados {clipped}')
        shot(page, f'{where}-actualidad')
        page.click('body > header nav.ae-sport-nav button[data-category="Todos"]'); page.wait_for_timeout(900)
        op = page.evaluate(OPINIONS)
        check(op['highlightsHome'] == 'aeOpinions' and op['trendingHome'] != 'aeOpinionsTrendingSlot', f'{where}: al salir de Actualidad todo vuelve a su sitio {op}')
        check(page.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0, f'{where}: scroll horizontal en Picks/Actualidad')
        check(not page.errors, f'{where}: errores {page.errors}')

_po_spec = importlib.util.spec_from_file_location('profile_overview', ROOT / 'tests/profile-overview.py')
PO = importlib.util.module_from_spec(_po_spec)
_argv = sys.argv; sys.argv = sys.argv[:1]
_po_spec.loader.exec_module(PO)
sys.argv = _argv

PROFILE = r"""() => {
  const d = document.getElementById('aeProfileDialog');
  const rect = e => { if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return {l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom)}; };
  const close = d.querySelector('.ae-profile-close'), cr = close.getBoundingClientRect();
  const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
  return {open: d.open, dialog: rect(d), head: rect(d.querySelector(':scope > .cam-profile-head')), tabs: rect(d.querySelector('#aeProfileTabs')),
    overview: rect(d.querySelector('#camProfileOverview')), actions: rect(d.querySelector(':scope > .cam-profile-footer-actions')),
    closeOk: !!hit && !!hit.closest('.ae-profile-close'), overflow: d.scrollWidth - d.clientWidth};
}"""

def profile(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    page = PO.open_page('ana', dark, width)
    try:
        PO.open_own(page, width)
        pr = page.evaluate(PROFILE)
        check(pr['open'] and pr['closeOk'], f'{where}: perfil abierto con «Cerrar» a la vista {pr}')
        if width >= 1024:
            check(pr['head']['r'] <= pr['tabs']['l'] and pr['head']['r'] <= pr['overview']['l'], f'{where}: perfil en dos columnas {pr}')
            check(pr['actions'] and pr['actions']['r'] <= pr['tabs']['l'] and pr['actions']['t'] >= pr['head']['b'] - 1, f'{where}: Editar/Compartir bajo la cabecera {pr}')
        check(pr['overflow'] <= 1, f'{where}: el perfil se desborda en horizontal {pr["overflow"]}')
        clipped = page.evaluate(TEXT_CHECK, ['#aeProfileDialog'])
        check(not clipped, f'{where} Perfil: textos recortados {clipped}')
        page.click('#aeProfileTabTakes'); page.wait_for_timeout(500)
        pr2 = page.evaluate(PROFILE)
        if width >= 1024:
            check(pr2['head']['r'] <= pr2['tabs']['l'], f'{where}: Takes sigue en dos columnas {pr2}')
        shot(page, f'{where}-perfil')
        page.click('#aeProfileDialog .ae-profile-close'); page.wait_for_timeout(400)
        check(not page.evaluate("document.getElementById('aeProfileDialog').open"), f'{where}: «Cerrar» no cierra el perfil')
        check(not page.errors, f'{where}: errores {page.errors}')
    finally:
        PO.close(page)

def phone(dark):
    where = f'390-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=390, height=844) as page:
        st = page.evaluate("""() => ({desk: 'camDesk' in document.body.dataset, rail: !!document.getElementById('camDeskRail'),
          aside: !!document.getElementById('camDeskAside'), shortcuts: !!document.querySelector('#camHomeJornada > .cam-hj-shortcuts'),
          arrows: !!document.querySelector('.cam-desk-arrows'), full: !!document.querySelector('[data-cam-desk-full]')})""")
        check(st == {'desk': False, 'rail': False, 'aside': False, 'shortcuts': True, 'arrows': False, 'full': False}, f'{where}: el escritorio asoma en el teléfono {st}')
        # Al pasar de escritorio a teléfono todo vuelve a su sitio.
        page.set_viewport_size({'width': 1366, 'height': 900}); page.wait_for_timeout(500)
        check(page.evaluate("!!document.querySelector('#camDeskRail .cam-hj-shortcuts')"), f'{where}: en 1366 los atajos van al carril')
        page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(500)
        back = page.evaluate("""() => ({desk: 'camDesk' in document.body.dataset, rail: !!document.getElementById('camDeskRail'),
          shortcuts: !!document.querySelector('#camHomeJornada > .cam-hj-shortcuts'), parties: !!document.querySelector('.cam-desk-parties'),
          profile: document.getElementById('camNavProfile')?.parentElement?.className || ''})""")
        check(back['desk'] is False and not back['rail'] and back['shortcuts'] and not back['parties'] and 'ae-header-actions' in back['profile'],
              f'{where}: no todo volvió a su sitio {back}')
        check(not page.errors, f'{where}: errores {page.errors}')

for width in (1024, 1366, 1920):
    for dark in (False, True):
        home(width, dark)
        sections(width, dark)
        sport(width, dark)
        picks_and_opinions(width, dark)
        profile(width, dark)
for dark in (False, True):
    phone(dark)

if errors:
    print('FALLOS:'); print('\n'.join('  · ' + e for e in errors)); sys.exit(1)
print('OK: escritorio con secciones, pestañas, direcciones, rejilla, Inicio, NFL, Fútbol, Picks, Actualidad y Perfil (1024/1366/1920, día y noche); el teléfono sin cambios.')
