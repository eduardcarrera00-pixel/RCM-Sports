"""NFL · Duelo de la semana: «Tu pick», «Tu jornada» y «Tu Take» (12 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).
Una jornada como la de verdad: el jueves (abierto, hoy), el domingo con el duelo
(n.º 7 en casa del n.º 9) y otros partidos, y el lunes todavía sin cuotas.

Cubre, en 390 y 320 px, de día y de noche:
  · los equipos del duelo son los botones (con su escudo) y no muestran puntos;
  · antes de elegir: «Un toque y estás dentro · cierra en …»;
  · al tocar un equipo se guarda (cam_nfl_save_pick), queda marcado «Tu pick»
    y aparece «Tu jornada»: 1 de N, los días (el lunes «Pronto») y el botón al
    siguiente partido abierto, que abre ese partido en La Quiniela;
  · «Tu Take» ya no va en La semana: abre la pestaña Takes (#camNflTakePrompt),
    con el ejemplo del duelo; tras elegir, sus ideas abren el compositor con el
    título ya escrito; «Demuestra tu conocimiento» cierra Takes (12 nov 2026);
  · con todo lo abierto elegido: «vuelve el lunes antes de las …»;
  · sin desbordamientos ni textos recortados, y sin errores.
Escritorio (1366 px): el duelo con los mismos bloques.

Uso: python3 -B tests/nfl-duelo.py [--shots DIR]
"""
import importlib.util, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

BASE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  const T = F.tables, H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  if (!F.anonymous) F.user = {id: 'u1', email: 'u1@example.com', user_metadata: {username: 'probador'}};
  T.articles = [];
  T.nfl_rankings = [{id: 1, edition: 'Week 10', team_ids: ['SF','KC','BUF','PHI','BAL','MIN','NE','GB','DET','SEA'], updated_at: '2026-11-10T18:00:00Z'}];
  T.nfl_ranking_history = [];
  const g = (id, away, home, hours, extra) => Object.assign({id, season: 2026, week: 10, home_id: home, away_id: away, kickoff: iso(hours),
    status: 'scheduled', picks_open: true, odds_locked_at: iso(-30), points_home: 2, points_away: 2,
    probability_home: 0.5, probability_away: 0.5, home_score: null, away_score: null, winner_id: null}, extra || {});
  // Horas de Toronto contadas desde hoy, para que la prueba valga a cualquier hora:
  // hoy por la noche; dentro de 3 días, el duelo y dos partidos más; dentro de 4, uno aún sin cuotas.
  const p = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Toronto', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'}).formatToParts(new Date());
  const nowH = Number(p.find(x => x.type === 'hour').value) + Number(p.find(x => x.type === 'minute').value) / 60;
  const at = (d, h) => d * 24 + h - nowH;
  const tonight = Math.min(Math.max(nowH + 0.5, 20.25), 23.9);
  T.cam_nfl_games = [
    g('w10-thu', 'WAS', 'NYG', at(0, tonight), {is_bonus: true}),
    g('w10-sun-1', 'NE', 'DET', at(3, 9.5)), g('w10-sun-2', 'TEN', 'HOU', at(3, 13)), g('w10-sun-3', 'CAR', 'ATL', at(3, 16.4)),
    g('w10-mon', 'LV', 'DEN', at(4, 20.25), {odds_locked_at: null, picks_open: false})];
  T.cam_nfl_picks = (F.prePicks || []).map(([game_id, team_id]) => ({game_id, user_id: 'u1', team_id, awarded_points: 0, settled_at: null}));
  T.cam_nfl_laurels = [];
  F.rpc.cam_nfl_expert_picks = () => ({data: [], error: null});
  F.rpc.cam_nfl_pick_split = () => ({data: [], error: null});
  F.rpc.cam_nfl_expert_duel = () => ({data: [], error: null});
  F.rpc.cam_nfl_save_pick = a => { T.cam_nfl_picks.push({game_id: a.p_game_id, user_id: 'u1', team_id: a.p_team_id, awarded_points: 0, settled_at: null}); return {data: true, error: null}; };
})();
"""

STATE = """() => {
  const q = s => document.querySelector('#camNflSemana ' + s);
  const text = s => [...document.querySelectorAll('#camNflSemana ' + s)].map(e => e.textContent.replace(/\\s+/g, ' ').trim());
  const p = s => document.querySelector('#camNflTakePrompt ' + s);
  const ptext = s => [...document.querySelectorAll('#camNflTakePrompt ' + s)].map(e => e.textContent.replace(/\\s+/g, ' ').trim());
  const duel = q('[data-block=duelo]');
  return {
    tab: document.body.dataset.camTab || null,
    kicker: text('[data-block=duelo] .cam-ns-kicker')[0] || '',
    duelText: duel ? duel.textContent.replace(/\\s+/g, ' ') : '',
    sides: [...document.querySelectorAll('#camNflSemana .cam-ns-side')].map(b => ({tag: b.tagName, team: b.dataset.team,
      pressed: b.getAttribute('aria-pressed'), name: b.querySelector('.cam-ns-side-name')?.textContent, sub: b.querySelector('.cam-ns-side-sub')?.textContent,
      crest: !!b.querySelector('.cam-ns-crest'), h: Math.round(b.getBoundingClientRect().height)})),
    hint: text('.cam-ns-hint')[0] || '',
    next: !!q('.cam-ns-next'), count: text('.cam-ns-next-count')[0] || '', days: text('.cam-ns-day'),
    nextText: text('.cam-ns-next-text')[0] || '', cta: text('.cam-ns-next-cta')[0] || '',
    takeInSemana: !!q('.cam-ns-take'),
    take: !!p('.cam-ns-take'), takeTitle: ptext('.cam-ns-take .cam-ns-step-title')[0] || '', ideas: ptext('.cam-ns-idea'),
    field: !!p('.cam-ns-take-field'), scale: ptext('.cam-ns-take-scale')[0] || '',
    example: ptext('.cam-ns-take-placeholder')[0] || '',
    overflow: document.documentElement.scrollWidth - innerWidth,
    calls: window.__fake.calls.filter(c => c.rpc).map(c => c.rpc)
  };
}"""

CLIPPED = """() => {
  const out = [];
  for (const node of document.querySelectorAll(':is(#camNflSemana,#camNflTakePrompt) :is(.cam-ns-kicker,.cam-ns-step-label,.cam-ns-step-title,.cam-ns-side-name,.cam-ns-side-sub,.cam-ns-hint,.cam-ns-next-title,.cam-ns-next-count,.cam-ns-day,.cam-ns-next-text,.cam-ns-next-cta,.cam-ns-take-text,.cam-ns-idea,.cam-ns-take-scale)')) {
    if (!node.getClientRects().length) continue;
    if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 2) out.push(node.className + ': ' + node.textContent.trim().slice(0, 40));
  }
  for (const node of document.querySelectorAll(':is(#camNflSemana,#camNflTakePrompt) :is(.cam-ns-side,.cam-ns-day,.cam-ns-next-cta,.cam-ns-idea,.cam-ns-take-field)')) {
    if (!node.getClientRects().length) continue;
    const r = node.getBoundingClientRect();
    if (r.height < 43.5) out.push('objetivo pequeño ' + node.className + ' ' + Math.round(r.height));
  }
  return out;
}"""


TAKES_ORDER = """() => {
  const top = el => el && el.getClientRects().length ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
  const first = [...document.getElementById('freeTakes').children].find(e => e.getClientRects().length && e.getBoundingClientRect().height > 4);
  return {prompt: top(document.getElementById('camNflTakePrompt')), latest: top(document.getElementById('aeTakesFeedHeading')),
    ranking: top(document.getElementById('aeSportTakeRanking')), cta: top(document.querySelector('#freeTakes > .ae-takes-head')),
    first: first ? (first.id || first.className) : null};
}"""


def open_nfl(page):
    page.click('body > nav.cam-mobile-bottom-nav > button[data-category="NFL"]')
    page.wait_for_timeout(1800)


def shot(page, name):
    if not SHOTS: return
    page.locator('#camNflSemana [data-block=duelo]').screenshot(path=str(SHOTS / f'{name}.png'))


def phone(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=BASE, dark=dark, width=width, height=860) as page:
        open_nfl(page)
        st = page.evaluate(STATE)
        assert st['tab'] == 'semana', f'{where}: no abre La semana {st["tab"]}'
        assert st['duelText'], f'{where}: no hay duelo'
        assert [s['team'] for s in st['sides']] == ['NE', 'DET'] and all(s['tag'] == 'BUTTON' and s['crest'] for s in st['sides']), f'{where}: equipos {st["sides"]}'
        assert [s['sub'] for s in st['sides']] == ['Visitante', 'Local'], f'{where}: {st["sides"]}'
        assert 'pts' not in st['duelText'] and 'puntos' not in st['duelText'], f'{where}: el duelo muestra puntos: {st["duelText"]}'
        assert st['hint'] == '', f'{where}: pista antes de elegir {st["hint"]}'
        assert not st['next'] and not st['takeInSemana'] and st['take'] and st['field'] and st['takeTitle'] == '¿Qué crees que va a pasar?' and st['ideas'] == [], f'{where}: take {st}'
        assert st['example'] == '«Los Lions ganan por más de 10…»', f'{where}: ejemplo {st["example"]}'
        assert page.evaluate("document.getElementById('camNflTakePrompt').getClientRects().length") == 0, f'{where}: «Tu Take» se ve en La semana'
        assert st['scale'] == 'Cuanto más atrevido, más vale si aciertas', f'{where}: escala {st["scale"]}'
        assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'{where}: recortes {page.evaluate(CLIPPED)} {st["overflow"]}'
        shot(page, f'{where}-1-antes')

        # Elegir a los Lions guarda el pronóstico y abre «Tu jornada».
        page.locator('#camNflSemana .cam-ns-side[data-team="DET"]').click(); page.wait_for_timeout(800)
        st = page.evaluate(STATE)
        assert 'cam_nfl_save_pick' in st['calls'], f'{where}: no guarda {st["calls"]}'
        assert [s['pressed'] for s in st['sides']] == ['false', 'true'] and st['sides'][1]['sub'] == 'Local', f'{where}: marca {st["sides"]}'
        assert st['hint'].startswith('Guardado. Puedes cambiarlo hasta el '), f'{where}: guardado {st["hint"]}'
        assert page.evaluate("document.activeElement?.dataset?.team") == 'DET', f'{where}: el foco no vuelve al equipo'
        assert st['next'] and st['count'] == '1 de 5', f'{where}: jornada {st["count"]}'
        assert len(st['days']) == 3 and st['days'][0].endswith('0/1') and st['days'][1].endswith('1/3') and st['days'][2].endswith('Pronto'), f'{where}: días {st["days"]}'
        assert st['nextText'].startswith('Te quedan 3 partidos por elegir. El siguiente empieza hoy a las'), f'{where}: mensaje {st["nextText"]}'
        assert st['cta'] == 'Elegir el de hoy →', f'{where}: botón {st["cta"]}'
        assert st['takeTitle'] == '¿Qué crees que va a pasar?' and st['ideas'] == ['Los Lions ganan por 10 o más', 'Los Lions remontan en el último cuarto'], f'{where}: take {st}'
        assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'{where}: recortes tras elegir {page.evaluate(CLIPPED)}'
        shot(page, f'{where}-2-elegido')

        # El botón lleva al partido de hoy en La Quiniela.
        page.locator('#camNflSemana .cam-ns-next-cta').click(); page.wait_for_timeout(700)
        focus = page.evaluate("""() => ({id: document.activeElement?.closest?.('[data-game-id]')?.dataset.gameId || null,
          day: document.querySelector('#camNflDayNav .cam-nfl-day.is-active strong')?.textContent || null,
          top: Math.round(document.activeElement?.getBoundingClientRect?.().top ?? -1)})""")
        assert focus['id'] == 'w10-thu' and focus['day'] and 0 <= focus['top'] < 860, f'{where}: no abre el partido de hoy {focus}'

        # Takes: «Tu Take» arriba, «Demuestra tu conocimiento» al final; sin recortes.
        page.click('#camSectionTabs button[data-tab="takes"]'); page.wait_for_timeout(700)
        tops = page.evaluate(TAKES_ORDER)
        assert all(tops[k] is not None for k in ('prompt', 'latest', 'ranking', 'cta')), f'{where}: Takes {tops}'
        assert tops['prompt'] < tops['latest'] < tops['ranking'] < tops['cta'], f'{where}: orden de Takes {tops}'
        assert tops['first'] == 'camNflTakePrompt', f'{where}: Takes empieza con {tops["first"]}'
        assert page.evaluate(CLIPPED) == [], f'{where}: recortes en Takes {page.evaluate(CLIPPED)}'
        if SHOTS: page.locator('#camNflTakePrompt').screenshot(path=str(SHOTS / f'{where}-3-takes.png'))

        # Una idea abre el compositor con el título escrito.
        page.locator('#camNflTakePrompt .cam-ns-idea').first.scroll_into_view_if_needed()
        page.locator('#camNflTakePrompt .cam-ns-idea').first.click(); page.wait_for_timeout(500)
        comp = page.evaluate("""() => { const d = document.getElementById('aeTakeComposerDialog'), f = document.getElementById('freeTakesForm');
          return {open: !!d?.open, title: f?.elements.title.value, competition: f?.elements.competition.value,
            sport: f?.querySelector('input[name=sport]:checked')?.value || null, focus: document.activeElement?.name || null}; }""")
        assert comp['open'] and comp['title'] == 'Los Lions ganan por 10 o más' and comp['competition'] == 'NFL' and comp['sport'] == 'nfl', f'{where}: compositor {comp}'
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def come_back():
    """Con todo lo abierto elegido, «Tu jornada» dice cuándo volver."""
    where = '390-vuelve'
    pre = "window.__fake = window.__fake || {}; window.__fake.prePicks = [['w10-thu','WAS'],['w10-sun-2','HOU'],['w10-sun-3','ATL']];"
    with fp.full_page(fake_js=pre + BASE, dark=True, width=390, height=860) as page:
        open_nfl(page)
        page.locator('#camNflSemana .cam-ns-side[data-team="NE"]').click(); page.wait_for_timeout(800)
        st = page.evaluate(STATE)
        assert st['count'] == '4 de 5' and st['cta'] == '', f'{where}: {st["count"]} {st["cta"]}'
        assert re.match(r'Ya elegiste todo lo abierto\. Lo del (\w+) se abre cuando lleguen sus cuotas: vuelve el \1 antes de las \d\d:\d\d\.$', st['nextText']), f'{where}: {st["nextText"]}'
        assert st['days'][0].endswith('✓') and st['days'][1].endswith('✓') and st['days'][2].endswith('Pronto'), f'{where}: días {st["days"]}'
        assert page.evaluate(CLIPPED) == [], f'{where}: recortes {page.evaluate(CLIPPED)}'
        shot(page, f'{where}')
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def complete():
    """Jornada completa: invita a poner el laurel."""
    where = '390-completa'
    pre = ("window.__fake = window.__fake || {}; window.__fake.prePicks = [['w10-thu','WAS'],['w10-sun-2','HOU'],['w10-sun-3','ATL'],['w10-mon','LV']];")
    with fp.full_page(fake_js=pre + BASE + "(() => { const T = window.__fake.tables; const m = T.cam_nfl_games.find(g => g.id === 'w10-mon'); m.odds_locked_at = new Date(Date.now() - 36e5).toISOString(); m.picks_open = true; })();", width=390, height=860) as page:
        open_nfl(page)
        page.locator('#camNflSemana .cam-ns-side[data-team="DET"]').click(); page.wait_for_timeout(800)
        st = page.evaluate(STATE)
        assert st['count'] == '5 de 5' and st['nextText'].startswith('¡Jornada completa! Ya elegiste los 5 partidos.'), f'{where}: {st["count"]} {st["nextText"]}'
        assert st['cta'] in ('Poner el laurel →', ''), f'{where}: {st["cta"]}'
        shot(page, f'{where}')
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where, '(laurel)' if st['cta'] else '(sin laurel)')


def desktop(dark):
    where = f'1366-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=BASE, dark=dark, width=1366, height=1000, scale=1) as page:
        page.evaluate('filterByCategory("NFL")'); page.wait_for_timeout(1800)
        page.evaluate("window.camSectionTabs?.select?.('semana', {scroll: false})"); page.wait_for_timeout(600)
        st = page.evaluate(STATE)
        if not st['sides']:
            print('SKIP', where, '(La semana no está a la vista en escritorio)'); return
        assert all(s['tag'] == 'BUTTON' for s in st['sides']) and 'pts' not in st['duelText'], f'{where}: {st["sides"]}'
        page.locator('#camNflSemana .cam-ns-side[data-team="DET"]').click(); page.wait_for_timeout(800)
        st = page.evaluate(STATE)
        assert st['next'] and st['cta'] == 'Elegir el de hoy →' and st['overflow'] <= 0, f'{where}: {st}'
        assert not st['takeInSemana'] and st['take'] and st['ideas'], f'{where}: take {st}'
        tops = page.evaluate(TAKES_ORDER)
        assert None not in (tops['prompt'], tops['latest'], tops['ranking'], tops['cta']) and tops['prompt'] < tops['latest'] < tops['ranking'] < tops['cta'], f'{where}: orden de Takes {tops}'
        if SHOTS:
            page.locator('#camNflSemana [data-block=duelo]').scroll_into_view_if_needed(); page.wait_for_timeout(200)
            page.screenshot(path=str(SHOTS / f'{where}.png'))
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)



META = """sel => [...document.querySelectorAll(sel + ' .cam-nfl-game-meta')].map(m => {
  const badge = m.querySelector('.cam-nfl-badge'), r = m.getBoundingClientRect(), b = badge?.getBoundingClientRect();
  return {text: m.textContent.replace(/\\s+/g, ' ').trim(), kids: m.children.length, right: b ? Math.round(r.right - b.right) : null};
})"""

# Texto y título de cada opción (equipos y empate): sin puntos.
OPTIONS = """sel => [...document.querySelectorAll(sel + ' :is(.cam-nfl-team,.cam-nfl-draw)')].map(b => b.textContent.replace(/\\s+/g, ' ').trim() + ' | ' + (b.title || ''))"""


def meta_line():
    """La línea de cada partido (a la izquierda de «Abierto») no lleva hora ni «Bonus +5»."""
    where = '390-linea-partido'
    with fp.full_page(fake_js=BASE, dark=True, width=390, height=860) as page:
        open_nfl(page)
        page.click('#camNflDayNav .cam-nfl-day[data-day]'); page.wait_for_timeout(300)
        lines = page.evaluate(META, '#camNflGames')
        assert lines and all(l['kids'] == 1 and l['text'] == 'Abierto' and l['right'] <= 24 for l in lines), f'{where}: {lines}'
        options = page.evaluate(OPTIONS, '#camNflGames')
        assert options and not any('pts' in o or 'punto' in o.lower() for o in options), f'{where}: puntos en las opciones {options}'
        dots = page.evaluate("[...document.querySelectorAll('#camNflGames .cam-nfl-team')].map(b => b.querySelectorAll('.cam-q-dot').length)")
        assert dots and all(n == 1 for n in dots), f'{where}: falta el círculo {dots}'
        if SHOTS:
            page.locator('#camNflGames .cam-nfl-game').first.screenshot(path=str(SHOTS / f'{where}.png'))
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


FOOTBALL = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const f = window.__fake = window.__fake || {}; f.tables = f.tables || {}; f.rpc = f.rpc || {};
  if (!f.anonymous) f.user = {id: 'u1', email: 'u1@example.com', user_metadata: {username: 'probador'}};
  const now = new Date(), season = now.getUTCFullYear() - (now.getUTCMonth() < 6 ? 1 : 0);
  const day = new Date(now.getTime() + 2 * 24 * 36e5); day.setUTCHours(16, 0, 0, 0);
  const squads = [['86','Real Madrid'],['83','Barcelona'],['1068','Sevilla'],['2922','Getafe']];
  f.tables.cam_football_teams = squads.map(([id, name]) => ({id, name, short_name: name, abbreviation: name.slice(0, 3).toUpperCase(), logo: ''}));
  f.tables.cam_football_games = [0, 1].map(i => ({id: '4018800' + i, competition: 'laliga', season, matchday: 13,
    kickoff: new Date(day.getTime() + i * 9e5).toISOString(), home_id: squads[i * 2][0], away_id: squads[i * 2 + 1][0],
    status: 'scheduled', home_score: null, away_score: null, outcome: null, probability_home: .4, probability_draw: .3, probability_away: .3,
    points_home: 2, points_draw: 2, points_away: 2, is_bonus: i === 0, odds_source: 'prueba',
    odds_locked_at: new Date(now.getTime() - 36e5).toISOString(), picks_open: true, opening_mode: 'auto'}));
  f.tables.cam_football_picks = [];
  f.rpc.cam_football_leaderboard = () => ({data: [], error: null});
})();
"""


def football(dark, anonymous):
    """Fútbol: «Ver mis jornadas» al final de La semana, debajo del marcador (13 nov 2026), y la línea de cada partido solo con el estado."""
    where = f'390-futbol-{"noche" if dark else "dia"}-{"sin-sesion" if anonymous else "con-sesion"}'
    pre = "window.__fake = window.__fake || {}; window.__fake.anonymous = true;" if anonymous else ''
    with fp.full_page(fake_js=pre + FOOTBALL, dark=dark, width=390, height=860) as page:
        page.click('body > nav.cam-mobile-bottom-nav > button[data-category="Fútbol"]'); page.wait_for_timeout(2000)
        page.evaluate("window.camSectionTabs?.select?.('quiniela', {scroll: false})"); page.wait_for_timeout(600)
        page.locator('#camFootballHistory').scroll_into_view_if_needed(); page.wait_for_timeout(300)
        # 13 nov 2026: «Ver mis jornadas» cierra La semana, debajo del marcador (#camFootballWeekActions).
        st = page.evaluate("""() => {
          const save = document.getElementById('camFootballSaveDay'), hist = document.querySelector('#camFootballHistory button');
          const above = document.getElementById('camFootballScoreBody');
          const s = above.getBoundingClientRect(), n = hist?.getBoundingClientRect();
          const nav = document.getElementById('camFootballNav');
          return {save: save.textContent.trim(), hist: hist?.textContent.trim() || null, below: !!n && n.top >= s.bottom,
            end: !!hist && document.getElementById('camFootballWeekActions').contains(hist), saveShown: !!save.getClientRects().length,
            topButtons: [...nav.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => b.textContent.trim()),
            emptyTop: !nav.getClientRects().length || nav.getBoundingClientRect().height < 1 || [...nav.querySelectorAll('button')].some(b => b.getClientRects().length)};
        }""")
        if anonymous: assert st['saveShown'] and st['save'] == 'Inicia sesión para participar', f'{where}: {st}'
        assert st['hist'] == 'Ver mis jornadas ›' and st['below'] and st['end'], f'{where}: {st}'
        assert 'Ver mis jornadas ›' not in st['topButtons'] and st['emptyTop'], f'{where}: arriba {st}'
        lines = page.evaluate(META, '#camFootballGames')
        assert lines and all(l['kids'] == 1 and l['text'] == 'Abierto' and l['right'] <= 24 for l in lines), f'{where}: línea {lines}'
        options = page.evaluate(OPTIONS, '#camFootballGames')
        assert len(options) == 6 and not any('pts' in o or 'punto' in o.lower() for o in options), f'{where}: puntos en las opciones {options}'
        dots = page.evaluate("[...document.querySelectorAll('#camFootballGames :is(.cam-nfl-team,.cam-nfl-draw)')].map(b => b.querySelectorAll('.cam-q-dot').length)")
        assert len(dots) == 6 and all(n == 1 for n in dots), f'{where}: falta el círculo {dots}'
        if SHOTS:
            box = page.evaluate("""() => { const a = document.getElementById('camFootballGames').getBoundingClientRect(),
              b = document.getElementById('camFootballGames').getBoundingClientRect(); return {y: a.top + scrollY, h: b.bottom - a.top}; }""")
            page.screenshot(path=str(SHOTS / f'{where}.png'), full_page=True,
                            clip={'x': 0, 'y': max(0, box['y'] - 60), 'width': 390, 'height': box['h'] + 90})
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


def jornadas_below(dark, anonymous):
    """«Ver mis jornadas» va debajo del botón de iniciar sesión / guardar del día."""
    where = f'390-{"noche" if dark else "dia"}-{"sin-sesion" if anonymous else "con-sesion"}-jornadas'
    pre = "window.__fake = window.__fake || {}; window.__fake.anonymous = true;" if anonymous else ''
    with fp.full_page(fake_js=pre + BASE, dark=dark, width=390, height=860) as page:
        open_nfl(page)
        page.locator('#camNflSaveDay').scroll_into_view_if_needed(); page.wait_for_timeout(300)
        st = page.evaluate("""() => {
          const save = document.getElementById('camNflSaveDay'), nav = document.querySelector('#camNflNav button');
          const s = save.closest('.cam-nfl-save-row').getBoundingClientRect(), n = nav?.getBoundingClientRect();
          return {save: save.textContent.trim(), nav: nav?.textContent.trim() || null, below: !!n && n.top >= s.bottom,
            gap: n ? Math.round(n.top - s.bottom) : null, w: n ? Math.round(n.width) : 0, sw: Math.round(save.getBoundingClientRect().width)};
        }""")
        assert st['save'] == ('Inicia sesión para participar' if anonymous else 'Guardar picks del día'), f'{where}: {st}'
        assert st['nav'] == 'Ver mis jornadas ›' and st['below'] and 0 <= st['gap'] <= 24 and abs(st['w'] - st['sw']) <= 1, f'{where}: {st}'
        if SHOTS:
            box = page.evaluate("""() => { const a = document.getElementById('camNflDayNav').getBoundingClientRect(),
              b = document.getElementById('camNflNav').getBoundingClientRect(); return {y: a.top + scrollY, h: b.bottom - a.top}; }""")
            page.screenshot(path=str(SHOTS / f'{where}.png'), full_page=True,
                            clip={'x': 0, 'y': max(0, box['y'] - 120), 'width': 390, 'height': box['h'] + 150})
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


if __name__ == '__main__':
    for width in (390, 320):
        for dark in (False, True):
            phone(width, dark)
    come_back()
    complete()
    desktop(True)
    desktop(False)
    jornadas_below(True, True)
    jornadas_below(False, False)
    meta_line()
    football(True, True)
    football(False, False)
