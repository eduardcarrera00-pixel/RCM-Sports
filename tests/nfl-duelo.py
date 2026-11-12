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
  · «Tu Take» es otro bloque (campo para escribir) y, tras elegir, sus ideas
    abren el compositor con el título ya escrito;
  · con todo lo abierto elegido: «vuelve el lunes antes de las …»;
  · sin desbordamientos ni textos recortados, y sin errores.
Escritorio (1366 px): el duelo con los mismos bloques.

Uso: python3 -B tests/nfl-duelo.py [--shots DIR]
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
  const T = F.tables, H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  F.user = {id: 'u1', email: 'u1@example.com', user_metadata: {username: 'probador'}};
  T.articles = [];
  T.nfl_rankings = [{id: 1, edition: 'Week 10', team_ids: ['SF','KC','BUF','PHI','BAL','MIN','NE','GB','DET','SEA'], updated_at: '2026-11-10T18:00:00Z'}];
  T.nfl_ranking_history = [];
  const g = (id, away, home, hours, extra) => Object.assign({id, season: 2026, week: 10, home_id: home, away_id: away, kickoff: iso(hours),
    status: 'scheduled', picks_open: true, odds_locked_at: iso(-30), points_home: 2, points_away: 2,
    probability_home: 0.5, probability_away: 0.5, home_score: null, away_score: null, winner_id: null}, extra || {});
  // Hoy (jueves) por la noche; el domingo, el duelo y dos partidos más; el lunes, aún sin cuotas.
  const thu = F.thuHours ?? 6;
  T.cam_nfl_games = [
    g('w10-thu', 'WAS', 'NYG', thu, {is_bonus: true}),
    g('w10-sun-1', 'NE', 'DET', 68), g('w10-sun-2', 'TEN', 'HOU', 68), g('w10-sun-3', 'CAR', 'ATL', 71),
    g('w10-mon', 'LV', 'DEN', 103, {odds_locked_at: null, picks_open: false})];
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
    take: !!q('.cam-ns-take'), takeTitle: text('.cam-ns-take .cam-ns-step-title')[0] || '', ideas: text('.cam-ns-idea'),
    field: !!q('.cam-ns-take-field'), scale: text('.cam-ns-take-scale')[0] || '',
    overflow: document.documentElement.scrollWidth - innerWidth,
    calls: window.__fake.calls.filter(c => c.rpc).map(c => c.rpc)
  };
}"""

CLIPPED = """() => {
  const out = [];
  for (const node of document.querySelectorAll('#camNflSemana :is(.cam-ns-kicker,.cam-ns-step-label,.cam-ns-step-title,.cam-ns-side-name,.cam-ns-side-sub,.cam-ns-hint,.cam-ns-next-title,.cam-ns-next-count,.cam-ns-day,.cam-ns-next-text,.cam-ns-next-cta,.cam-ns-take-text,.cam-ns-idea,.cam-ns-take-scale)')) {
    if (!node.getClientRects().length) continue;
    if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 2) out.push(node.className + ': ' + node.textContent.trim().slice(0, 40));
  }
  for (const node of document.querySelectorAll('#camNflSemana :is(.cam-ns-side,.cam-ns-day,.cam-ns-next-cta,.cam-ns-idea,.cam-ns-take-field)')) {
    const r = node.getBoundingClientRect();
    if (r.height < 43.5) out.push('objetivo pequeño ' + node.className + ' ' + Math.round(r.height));
  }
  return out;
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
        assert st['kicker'] == 'Duelo de la semana · n.º 7 vs n.º 9', f'{where}: duelo {st["kicker"]}'
        assert [s['team'] for s in st['sides']] == ['NE', 'DET'] and all(s['tag'] == 'BUTTON' and s['crest'] for s in st['sides']), f'{where}: equipos {st["sides"]}'
        assert [s['sub'] for s in st['sides']] == ['Visitante', 'Local'], f'{where}: {st["sides"]}'
        assert 'pts' not in st['duelText'] and 'puntos' not in st['duelText'], f'{where}: el duelo muestra puntos: {st["duelText"]}'
        assert st['hint'].startswith('Un toque y estás dentro · cierra en 2 d'), f'{where}: pista {st["hint"]}'
        assert not st['next'] and st['take'] and st['field'] and st['takeTitle'] == '¿Qué crees que va a pasar?' and st['ideas'] == [], f'{where}: take {st}'
        assert st['scale'] == 'Cuanto más atrevido, más vale si aciertas', f'{where}: escala {st["scale"]}'
        assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'{where}: recortes {page.evaluate(CLIPPED)} {st["overflow"]}'
        shot(page, f'{where}-1-antes')

        # Elegir a los Lions guarda el pronóstico y abre «Tu jornada».
        page.locator('#camNflSemana .cam-ns-side[data-team="DET"]').click(); page.wait_for_timeout(800)
        st = page.evaluate(STATE)
        assert 'cam_nfl_save_pick' in st['calls'], f'{where}: no guarda {st["calls"]}'
        assert [s['pressed'] for s in st['sides']] == ['false', 'true'] and st['sides'][1]['sub'] == 'Tu pick', f'{where}: marca {st["sides"]}'
        assert st['hint'].startswith('Guardado. Puedes cambiarlo hasta el domingo a las'), f'{where}: guardado {st["hint"]}'
        assert page.evaluate("document.activeElement?.dataset?.team") == 'DET', f'{where}: el foco no vuelve al equipo'
        assert st['next'] and st['count'] == '1 de 5', f'{where}: jornada {st["count"]}'
        assert st['days'][0].startswith('Jue') and st['days'][0].endswith('0/1') and st['days'][1].startswith('Dom') and st['days'][1].endswith('1/3') \
            and st['days'][2].startswith('Lun') and st['days'][2].endswith('Pronto'), f'{where}: días {st["days"]}'
        assert st['nextText'].startswith('Te quedan 3 partidos por elegir. El siguiente empieza hoy a las'), f'{where}: mensaje {st["nextText"]}'
        assert st['cta'] == 'Elegir el de hoy →', f'{where}: botón {st["cta"]}'
        assert st['takeTitle'] == '¿Y cómo ganan los Lions?' and st['ideas'] == ['Los Lions ganan por 10 o más', 'Los Lions remontan en el último cuarto'], f'{where}: take {st}'
        assert page.evaluate(CLIPPED) == [] and st['overflow'] <= 0, f'{where}: recortes tras elegir {page.evaluate(CLIPPED)}'
        shot(page, f'{where}-2-elegido')

        # El botón lleva al partido de hoy en La Quiniela.
        page.locator('#camNflSemana .cam-ns-next-cta').click(); page.wait_for_timeout(700)
        focus = page.evaluate("""() => ({id: document.activeElement?.closest?.('[data-game-id]')?.dataset.gameId || null,
          day: document.querySelector('#camNflDayNav .cam-nfl-day.is-active strong')?.textContent || null,
          top: Math.round(document.activeElement?.getBoundingClientRect?.().top ?? -1)})""")
        assert focus['id'] == 'w10-thu' and focus['day'] == 'jueves' and 0 <= focus['top'] < 860, f'{where}: no abre el partido de hoy {focus}'

        # Una idea abre el compositor con el título escrito.
        page.locator('#camNflSemana .cam-ns-idea').first.scroll_into_view_if_needed()
        page.locator('#camNflSemana .cam-ns-idea').first.click(); page.wait_for_timeout(500)
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
        assert st['nextText'].startswith('Ya elegiste todo lo abierto. Lo del lunes se abre cuando lleguen sus cuotas: vuelve el lunes antes de las'), f'{where}: {st["nextText"]}'
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
        if SHOTS:
            page.locator('#camNflSemana [data-block=duelo]').scroll_into_view_if_needed(); page.wait_for_timeout(200)
            page.screenshot(path=str(SHOTS / f'{where}.png'))
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
