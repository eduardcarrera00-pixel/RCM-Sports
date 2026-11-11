"""Perfil con pestaña «Rangos» (11 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso de
tests/fake-supabase.js (sin red). Cubre, a 320, 390 y 1366 px, de día y de noche:

  · pestañas Perfil · Takes · Picks · Rangos · Mi grupo (Party en un perfil
    ajeno), en ese orden; ningún texto cortado; de 360 px en adelante caben
    las cinco y a 320 la barra se desliza con la elegida siempre a la vista;
    flechas del teclado;
  · «Perfil»: solo el escudo y «Rango: <rango real>», el enlace «¿Quieres
    entender el sistema de rangos?» (abre «Rangos»), «Primeros pasos» con Mi
    liguilla y Quiniela (sin Take) y debajo «Mi liguilla»; sin tarjetas por
    modalidad, sin «Ver/Cerrar detalle» ni «Rango provisional»;
  · «Rangos»: rango actual, mejor rango y «Rango provisional · Por clasificar»;
    progreso con su barra y lo que falta; las tres tarjetas por modalidad con
    «X / N resultados · faltan M»; la escalera de Cobre a Leyenda CAM con el
    rango actual marcado y el resto en gris; «¿Cómo funcionan los rangos?» en
    desplegables con las reglas del código (10 Picks, 20 %, 5 %, 10 %…);
  · progreso con rango y puesto reales (zona de ascenso, puestos y puntos que
    faltan, Diamante → Leyenda, Leyenda, pausa, inactividad);
  · perfil ajeno con ?tab=rangos y textos en tercera persona;
  · el escudo de la cabecera abre «Rangos»;
  · sin errores de consola, sin textos cortados y sin desborde lateral.

Uso: python3 -B tests/perfil-rangos.py [--shots DIR] [--only 390-dia]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
CLIPPED = (ROOT / 'tests/parties.py').read_text(encoding='utf8').split('CLIPPED = r"""', 1)[1].split('"""', 1)[0]

ME = 'a0000000-0000-4000-8000-000000000001'
OTHER = 'b0000000-0000-4000-8000-000000000002'
LEVELS = ['Cobre', 'Bronce', 'Plata', 'Oro', 'Platino', 'Diamante', 'Leyenda CAM']
FAILS = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print('FALLA:', msg)


def model(kind='provisional'):
    """kind: «provisional» (todo Cobre, sin cierres) u «oro» (Oro confirmado en Picks, puesto 4 de 20)."""
    return r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
const F = window.__fake; F.rpc = F.rpc || {}; F.tables = F.tables || {};
const ME = %(me)s, OTHER = %(other)s, KIND = %(kind)s;
F.user = {id: ME, is_anonymous: false, email: 'ana@ejemplo.com', created_at: '2026-10-12T15:00:00Z',
  user_metadata: {username: 'ana_futbolera_con_nombre_largo'}};
F.tables.editors = [];
const cur = (user, comp, o) => Object.assign({competition: comp, season_month: '2026-11-01', user_id: user, username: 'ana_futbolera_con_nombre_largo',
  points: 0, correct: 0, resolved: 0, required: 14, available: 30, eligible: false, position: null, participants: 20,
  rank_before: 0, rank_after: 0, zone: 'pausa', next_inactive: 1, next_streak: 0}, o || {});
F.position = 4;
const ranks = user => KIND === 'oro' && user === ME ? [
  {competition: 'football', label: 'Quiniela Fútbol', starts_on: '2026-11-01', rank: 1, best_rank: 1, inactive_months: 1, last_month: '2026-10-01',
   current: cur(user, 'football', {resolved: 2, rank_before: 1, rank_after: 0, zone: 'inactividad'})},
  {competition: 'nfl', label: 'Quiniela NFL', starts_on: '2026-11-01', rank: 0, best_rank: 0, inactive_months: 0, last_month: '2026-10-01', current: null},
  {competition: 'picks', label: 'Picks', starts_on: '2026-11-01', rank: 3, best_rank: 4, inactive_months: 0, last_month: '2026-10-01',
   current: cur(user, 'picks', {eligible: true, resolved: 12, required: 10, points: 50 - F.position * 2.5, correct: 8, position: F.position, participants: 20,
     rank_before: 3, rank_after: F.position <= 4 ? 4 : 3, zone: F.position <= 4 ? 'ascenso' : 'permanencia', next_inactive: 0})}] : [
  {competition: 'football', label: 'Quiniela Fútbol', starts_on: '2026-11-01', rank: 0, best_rank: 0, inactive_months: 0, last_month: null, current: cur(user, 'football', {resolved: 5})},
  {competition: 'nfl', label: 'Quiniela NFL', starts_on: '2026-11-01', rank: 0, best_rank: 0, inactive_months: 0, last_month: null, current: cur(user, 'nfl', {resolved: 3})},
  {competition: 'picks', label: 'Picks', starts_on: '2026-11-01', rank: 0, best_rank: 0, inactive_months: 0, last_month: null, current: null}];
F.rpc.cam_league_profile = ({p_user}) => ({data: {month: '2026-11-01', ranks: ranks(p_user), awards: [], history: []}, error: null});
// Clasificación de Picks: 20 clasificados con 2,5 pts de diferencia entre puestos.
F.rpc.cam_league_board = ({p_competition}) => ({data: {competition: p_competition, month: '2026-11-01', closed: false,
  rows: p_competition !== 'picks' ? [] : Array.from({length: 20}, (_, i) => {
    const pos = i + 1, me = pos === F.position;
    const user = me ? (KIND === 'oro' ? ME : OTHER) : 'c0000000-0000-4000-8000-0000000000' + String(pos).padStart(2, '0');
    return cur(user, 'picks', {username: me ? 'ana_futbolera_con_nombre_largo' : 'rival_' + pos, eligible: true, position: pos,
      participants: 20, resolved: 12, required: 10, points: 50 - pos * 2.5, correct: 8, rank_before: 3, rank_after: 3, zone: 'permanencia'});
  })}, error: null});
F.rpc.cam_profile_overview = ({p_user}) => ({data: {user_id: p_user, username: p_user === ME ? 'ana_futbolera_con_nombre_largo' : 'beto_crack',
  joined_month: '2026-10', takes: {count: 0, up: 0, down: 0, top: null}, picks: {count: 0, won: 0, lost: 0, top: null},
  quiniela: {nfl: null, football: null, parties: []},
  liguilla: {name: 'Apertura 2026', season: 2026, own: p_user === ME, phase: 'qualifiers_open',
    closes_at: new Date(Date.now() + 5 * 864e5).toISOString(), qualifiers: null, bracket: null}}, error: null});
F.rpc.cam_profile_party = () => ({data: {own: true, parties: [], quiniela: {nfl: null, football: null}, recent: [], last_sport: null}, error: null});
F.tables.cam_nfl_picks = []; F.tables.cam_football_picks = []; F.tables.cam_party_members = [];
F.rpc.cam_username_status = () => ({data: {username: 'ana_futbolera_con_nombre_largo', can_change: true}, error: null});
F.rpc.cam_party_mine = () => ({data: [], error: null});
})();
""" % {'me': json.dumps(ME), 'other': json.dumps(OTHER), 'kind': json.dumps(kind)}


STATE = """() => {
  const vis = n => Boolean(n && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const txt = n => n ? n.textContent.replace(/\\s+/g, ' ').trim() : '';
  const words = n => n ? n.innerText.replace(/\\s+/g, ' ').trim() : '';
  const d = document.getElementById('aeProfileDialog');
  const bar = document.getElementById('aeProfileTabs');
  const barBox = bar.getBoundingClientRect();
  const tabs = [...bar.querySelectorAll('button')].filter(vis);
  const ranks = document.getElementById('camProfileRanks');
  const simple = document.getElementById('camProfileLeagues');
  return {
    open: d.open,
    tabs: tabs.map(b => b.textContent.trim()),
    selected: tabs.find(b => b.getAttribute('aria-selected') === 'true')?.id || null,
    tabsClipped: tabs.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent.trim()),
    tabsFit: bar.scrollWidth <= bar.clientWidth + 1,
    barClass: bar.className,
    activeInView: (() => { const b = tabs.find(x => x.getAttribute('aria-selected') === 'true'); if (!b) return false;
      const r = b.getBoundingClientRect(); return r.left >= barBox.left - 1 && r.right <= barBox.right + 1; })(),
    tabHeights: tabs.map(b => Math.round(b.getBoundingClientRect().height)),
    barH: Math.round(barBox.height),
    ladderNameTops: [...document.querySelectorAll('#camProfileRanks .cam-rk-step-name')].map(n => Math.round(n.getBoundingClientRect().top)),
    focus: document.activeElement?.id || null,
    simpleVisible: vis(simple), simple: txt(simple),
    simpleLink: vis(simple?.querySelector('.cam-rank-simple-link')) ? txt(simple.querySelector('.cam-rank-simple-link')) : null,
    perfilExtras: [...d.querySelectorAll('#camProfileLeagues .cam-league-card, #camProfileLeagues details, .cam-rank-disclosure')].length,
    overviewVisible: vis(document.getElementById('camProfileOverview')),
    kinds: [...document.querySelectorAll('#camProfileOverview .cam-ov-card')].filter(vis).map(n => n.dataset.kind),
    steps: [...document.querySelectorAll('#camProfileOverview .cam-ov-step-name')].map(txt),
    stepsCount: txt(document.querySelector('#camProfileOverview .cam-ov-steps-count')),
    stepBars: document.querySelectorAll('#camProfileOverview .cam-ov-progress > span').length,
    stepBarCols: (() => { const b = document.querySelector('#camProfileOverview .cam-ov-progress'); return b ? getComputedStyle(b).gridTemplateColumns.split(' ').length : 0; })(),
    ranksVisible: vis(ranks),
    blocks: [...(ranks?.children || [])].filter(vis).map(n => n.querySelector('h3, :scope > summary')?.textContent.trim() || n.className),
    heroName: txt(ranks?.querySelector('.cam-rk-hero-name')),
    heroBest: txt(ranks?.querySelector('.cam-rk-hero-best')),
    chip: txt(ranks?.querySelector('.cam-rk-chip')),
    pick: [...(ranks?.querySelectorAll('.cam-rk-pick-btn') || [])].map(b => [b.textContent, b.getAttribute('aria-pressed')]),
    track: [...(ranks?.querySelectorAll('.cam-rk-track-end') || [])].map(txt),
    bar: (() => { const b = ranks?.querySelector('.cam-rk-bar'); return b ? [b.getAttribute('aria-valuenow'), b.getAttribute('aria-label')] : null; })(),
    label: txt(ranks?.querySelector('.cam-rk-progress-label')),
    main: txt(ranks?.querySelector('.cam-rk-progress-main')),
    notes: [...(ranks?.querySelectorAll('.cam-rk-progress-note') || [])].map(txt),
    rivals: [...(ranks?.querySelectorAll('.cam-rival') || [])].map(words),
    cards: [...(ranks?.querySelectorAll('.cam-league-card') || [])].map(words),
    ladder: [...(ranks?.querySelectorAll('.cam-rk-step') || [])].map(li => [li.querySelector('.cam-rk-step-name').textContent,
      li.className.replace('cam-rk-step ', ''), li.getAttribute('aria-current'), txt(li.querySelector('.cam-rk-step-tag'))]),
    lockedGray: [...(ranks?.querySelectorAll('.cam-rk-step.is-locked .cam-rank-emblem') || [])].every(e => getComputedStyle(e).filter.includes('grayscale')),
    how: [...(ranks?.querySelectorAll('.cam-rk-how-item') || [])].map(x => [x.querySelector('summary').textContent, x.open]),
    overflow: d.scrollWidth - d.clientWidth,
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    url: location.search
  };
}"""


def shot(page, name):
    if SHOTS:
        page.screenshot(path=str(SHOTS / (name + '.png')))


def clean(page, t):
    # «Aún no alcanzado» es texto solo para lectores de pantalla (recortado a propósito).
    bad = [b for b in page.evaluate(CLIPPED, '#aeProfileDialog') if 'cam-rk-step-hidden' not in b]
    check(not bad, f'{t}: textos cortados {bad[:4]}')
    s = page.evaluate(STATE)
    check(s['overflow'] <= 1 and s['pageOverflow'] <= 1, f'{t}: desborde lateral {s["overflow"]}/{s["pageOverflow"]}')
    check(not page.errors, f'{t}: errores {page.errors[:2]}')


def own_provisional(width, dark, tag):
    with fp.full_page(fake_js=model('provisional'), dark=dark, width=width, height=900) as page:
        page.evaluate("openAeProfile()"); page.wait_for_timeout(1200)
        s = page.evaluate(STATE)
        t = tag + ' perfil'
        # Pestañas.
        check(s['tabs'] == ['Perfil', 'Takes', 'Picks', 'Rangos', 'Mi grupo'], f'{t}: pestañas {s["tabs"]}')
        check(s['selected'] == 'aeProfileTabOverview', f'{t}: abre en {s["selected"]}')
        check(not s['tabsClipped'], f'{t}: pestañas con texto cortado {s["tabsClipped"]}')
        check(len(set(s['tabHeights'])) == 1 and s['tabHeights'][0] >= 40, f'{t}: pestañas de distinto alto {s["tabHeights"]}')
        if width >= 360:
            check(s['tabsFit'], f'{t}: las cinco pestañas no caben a {width} px')
        else:
            check(not s['tabsFit'] and 'has-more-end' in s['barClass'], f'{t}: a {width} px la barra debería deslizarse {s["barClass"]}')
        # Perfil: rango sencillo + enlace + Primeros pasos (Mi liguilla, Quiniela) + Mi liguilla.
        check(s['simpleVisible'] and s['simple'].startswith('Rango: Cobre'), f'{t}: rango sencillo «{s["simple"]}»')
        check(s['simpleLink'] == '¿Quieres entender el sistema de rangos?›', f'{t}: enlace «{s["simpleLink"]}»')
        for word in ('provisional', 'clasificar', 'detalle', 'Mejor rango', 'Picks', 'Quiniela'):
            check(word not in s['simple'], f'{t}: el rango del perfil lleva «{word}»: {s["simple"]}')
        check(s['perfilExtras'] == 0, f'{t}: quedan tarjetas o desplegables del rango en Perfil')
        check(s['kinds'] == ['steps', 'liguilla'], f'{t}: tarjetas {s["kinds"]}')
        check(s['steps'] == ['Elige a tus 8 clasificados', 'Juega la quiniela'], f'{t}: pasos {s["steps"]}')
        check(s['stepsCount'] == '0 de 2' and s['stepBars'] == 2 and s['stepBarCols'] == 2, f'{t}: progreso de pasos {s["stepsCount"]} {s["stepBars"]} {s["stepBarCols"]}')
        clean(page, t)
        shot(page, f'{tag}-perfil')
        # El enlace abre «Rangos» (y el foco pasa a su pestaña).
        page.click('#camProfileLeagues .cam-rank-simple-link'); page.wait_for_timeout(900)
        s = page.evaluate(STATE)
        t = tag + ' rangos'
        check(s['selected'] == 'aeProfileTabRanks' and s['ranksVisible'] and not s['simpleVisible'] and not s['overviewVisible'],
              f'{t}: el enlace no abre Rangos {s["selected"]}')
        check(s['focus'] == 'aeProfileTabRanks', f'{t}: el foco va a {s["focus"]}')
        # La barra de pestañas no se aplasta bajo una pestaña larga (ordenador).
        check(s['barH'] >= max(s['tabHeights']) + 8, f'{t}: barra de pestañas de {s["barH"]} px')
        if width > 760:
            check(max(s['ladderNameTops']) - min(s['ladderNameTops']) <= 1, f'{t}: nombres de la escalera desalineados {s["ladderNameTops"]}')
        check(s['activeInView'], f'{t}: la pestaña Rangos no queda a la vista')
        check(s['blocks'] == ['Cobre', 'Progreso al siguiente rango', 'Rango por modalidad',
                              'Escalera de rangos', 'Historial de rangos e insignias', '¿Cómo funcionan los rangos?'], f'{t}: bloques {s["blocks"]}')
        check(s['heroName'] == 'Cobre' and s['heroBest'] == 'Mejor rango: Cobre', f'{t}: rango actual {s["heroName"]} / {s["heroBest"]}')
        check(s['chip'] == 'Rango provisional · Por clasificar', f'{t}: provisional «{s["chip"]}»')
        # Progreso: empieza por la modalidad con más resultados (Fútbol, 5 de 14).
        check(s['pick'] == [['Picks', 'false'], ['NFL', 'false'], ['Fútbol', 'true']], f'{t}: modalidades {s["pick"]}')
        check(s['track'] == ['Cobre', 'Bronce'], f'{t}: barra de {s["track"]}')
        check(s['bar'] and s['bar'][0] == '36' and 'Bronce' in s['bar'][1], f'{t}: barra {s["bar"]}')
        check(s['label'] == '5 / 14 resultados · faltan 9', f'{t}: etiqueta «{s["label"]}»')
        check(s['main'] == 'Faltan 9 resultados para clasificar este mes en Quiniela Fútbol.', f'{t}: «{s["main"]}»')
        check(s['notes'] == ['Después, el 20 % mejor de los clasificados sube a Bronce al cierre del mes.'], f'{t}: notas {s["notes"]}')
        # Por modalidad: Picks, Quiniela NFL, Quiniela Fútbol, con «X / 14 resultados · faltan N» sin repetir.
        check(len(s['cards']) == 3 and s['cards'][0].upper().startswith('PICKS COBRE') and s['cards'][1].upper().startswith('QUINIELA NFL COBRE')
              and s['cards'][2].upper().startswith('QUINIELA FÚTBOL COBRE'), f'{t}: tarjetas {s["cards"]}')
        check(s['cards'][1].endswith('3 / 14 resultados · faltan 11') and s['cards'][1].count('3 / 14') == 1, f'{t}: NFL {s["cards"][1]}')
        check('Rango provisional · Por clasificar' in s['cards'][0], f'{t}: Picks {s["cards"][0]}')
        # Escalera: de Cobre a Leyenda CAM; Cobre marcado, el resto en gris.
        check([x[0] for x in s['ladder']] == LEVELS, f'{t}: escalera {s["ladder"]}')
        check(s['ladder'][0][1:] == ['is-current', 'step', 'Tu rango'] and all(x[1] == 'is-locked' for x in s['ladder'][1:]), f'{t}: escalera {s["ladder"]}')
        check(s['lockedGray'], f'{t}: los niveles sin alcanzar no están en gris')
        # Cómo funcionan: 5 desplegables cerrados.
        check([x[0] for x in s['how']] == ['¿Qué es un rango provisional?', '¿Cuántos resultados hacen falta para clasificar?',
              '¿Cómo se sube y se baja?', '¿Qué significa «mejor rango»?', '¿Y las insignias Top 10?'] and not any(x[1] for x in s['how']), f'{t}: {s["how"]}')
        clean(page, t)
        shot(page, f'{tag}-rangos')
        page.click('#camProfileRanks .cam-rk-how-item:nth-child(2) summary'); page.wait_for_timeout(200)
        body = page.inner_text('#camProfileRanks .cam-rk-how-item:nth-child(2)')
        check('10 Picks resueltos' in body and 'la mitad de los partidos' in body and 'cada 15 minutos' in body, f'{t}: clasificar «{body}»')
        page.click('#camProfileRanks .cam-rk-how-item:nth-child(3) summary'); page.wait_for_timeout(200)
        body = page.inner_text('#camProfileRanks .cam-rk-how-item:nth-child(3)')
        for part in ('20 % mejor sube un rango', '20 % de abajo baja uno', 'día 1 a las 12:00', 'Dos meses seguidos sin clasificar', '5 % mejor', '10 % mejor'):
            check(part in body, f'{t}: falta «{part}» en cómo se sube')
        clean(page, t + ' desplegado')
        if width <= 390: shot(page, f'{tag}-rangos-desplegado')
        # Cambiar de modalidad: NFL.
        page.click('#camProfileRanks .cam-rk-pick-btn[data-competition="nfl"]'); page.wait_for_timeout(300)
        s = page.evaluate(STATE)
        check(s['label'] == '3 / 14 resultados · faltan 11' and s['main'].endswith('en Quiniela NFL.'), f'{t} NFL: {s["label"]} / {s["main"]}')
        # Picks sin resultados: el mínimo de 10.
        page.click('#camProfileRanks .cam-rk-pick-btn[data-competition="picks"]'); page.wait_for_timeout(500)
        s = page.evaluate(STATE)
        check(s['label'] == '0 / 10 resultados · faltan 10', f'{t} Picks: {s["label"]}')
        # Teclado: de Picks a Rangos con la flecha.
        page.click('#aeProfileTabPicks'); page.wait_for_timeout(300)
        page.focus('#aeProfileTabPicks'); page.keyboard.press('ArrowRight'); page.wait_for_timeout(300)
        s = page.evaluate(STATE)
        check(s['selected'] == 'aeProfileTabRanks' and s['focus'] == 'aeProfileTabRanks', f'{t}: flecha → {s["selected"]}')
        page.keyboard.press('ArrowRight'); page.wait_for_timeout(300)
        s = page.evaluate(STATE)
        check(s['selected'] == 'aeProfileTabParty' and s['activeInView'], f'{t}: Mi grupo no queda a la vista {s}')
        if width < 360:
            check('has-more-start' in s['barClass'], f'{t}: tras deslizar, falta el desvanecido de la izquierda {s["barClass"]}')
        page.click('#aeProfileTabOverview'); page.wait_for_timeout(300)
        s = page.evaluate(STATE)
        check(s['activeInView'] and s['simpleVisible'], f'{t}: volver a Perfil')
        check(not page.errors, f'{t}: errores {page.errors[:2]}')


def own_oro(width, dark, tag):
    with fp.full_page(fake_js=model('oro'), dark=dark, width=width, height=900) as page:
        page.evaluate("openAeProfile('rangos')"); page.wait_for_timeout(1400)
        s = page.evaluate(STATE)
        t = tag + ' oro'
        check(s['selected'] == 'aeProfileTabRanks', f'{t}: openAeProfile("rangos") abre {s["selected"]}')
        check(s['heroName'] == 'Oro' and s['heroBest'] == 'Mejor rango: Platino' and s['chip'] == '', f'{t}: {s["heroName"]} {s["heroBest"]} «{s["chip"]}»')
        check(s['pick'][0] == ['Picks', 'true'], f'{t}: empieza por {s["pick"]}')
        check(s['track'] == ['Oro', 'Platino'] and s['bar'][0] == '100', f'{t}: {s["track"]} {s["bar"]}')
        check(s['label'] == 'Puesto #4 de 20 · 40 pts', f'{t}: «{s["label"]}»')
        check(s['main'] == 'Si el mes cerrara hoy, subirías a Platino.', f'{t}: «{s["main"]}»')
        check(s['notes'] == ['Hay que seguir entre los 4 primeros hasta el cierre.'], f'{t}: {s["notes"]}')
        check(len(s['rivals']) == 2 and s['rivals'][0].startswith('Por alcanzar @rival_3') and s['rivals'][1].startswith('Te persigue @rival_5'), f'{t}: rivales {s["rivals"]}')
        lad = s['ladder']
        check([x[1] for x in lad] == ['is-reached'] * 3 + ['is-current'] + ['is-locked'] * 3 and lad[4][3] == 'Mejor rango', f'{t}: escalera {lad}')
        # Fútbol: dos meses sin clasificar bajan un rango.
        page.click('#camProfileRanks .cam-rk-pick-btn[data-competition="football"]'); page.wait_for_timeout(300)
        s = page.evaluate(STATE)
        check(s['label'] == '2 / 14 resultados · faltan 12' and any('bajas a Cobre' in n for n in s['notes']), f'{t} fútbol: {s["label"]} {s["notes"]}')
        clean(page, t)
        shot(page, f'{tag}-rangos-oro')
        # Puesto 9 de 20: faltan 5 puestos y 12,5 pts para la zona de ascenso.
        page.evaluate("window.__fake.position = 9; document.dispatchEvent(new Event('ae:picks-updated'))")
        page.evaluate("closeAeProfile()"); page.wait_for_timeout(200)
        page.evaluate("openAeProfile('rangos')"); page.wait_for_timeout(1400)
        s = page.evaluate(STATE)
        check(s['main'] == 'Faltan 5 puestos para la zona de ascenso (12,5 pts).' and s['bar'][0] == '69', f'{t} puesto 9: «{s["main"]}» {s["bar"]}')
        check(s['notes'] == ['Suben los 4 primeros (el 20 % mejor).'], f'{t} puesto 9: {s["notes"]}')
        # Diamante, Leyenda, pausa (mismas reglas, sin pantalla).
        cases = page.evaluate("""() => { const N = window.CamLeagues.nextStep;
          const c = o => Object.assign({competition: 'picks', eligible: true, available: 30, participants: 20, position: 1, points: 10, next_streak: 0, zone: 'permanencia', rank_after: 5}, o);
          return [N({rank: 5, label: 'Picks', competition: 'picks', current: c({position: 1, next_streak: 1, zone: 'leyenda'})}, null),
                  N({rank: 5, label: 'Picks', competition: 'picks', current: c({position: 1, next_streak: 2, zone: 'ascenso', rank_after: 6})}, null),
                  N({rank: 6, label: 'Picks', competition: 'picks', current: c({position: 5, zone: 'descenso'})}, null),
                  N({rank: 2, label: 'Quiniela NFL', competition: 'nfl', current: c({available: 0, eligible: false})}, null)]; }""")
        check(cases[0]['to'] == 6 and cases[0]['main'].startswith('Vas en el 5 % mejor') and cases[0]['fraction'] == 0.5, f'{t} diamante: {cases[0]}')
        check(cases[1]['main'] == 'Si el mes cerrara hoy, llegarías a Leyenda CAM.' and cases[1]['fraction'] == 1, f'{t} diamante 2: {cases[1]}')
        check(cases[2]['to'] is None and 'el 10 % mejor' in cases[2]['main'] and 'volverías a Diamante' in ' '.join(cases[2]['notes']), f'{t} leyenda: {cases[2]}')
        check(cases[3]['label'] == 'Temporada en pausa' and 'no cuentan' in cases[3]['notes'][0], f'{t} pausa: {cases[3]}')
        check(not page.errors, f'{t}: errores {page.errors[:2]}')


def public(width, dark, tag):
    with fp.full_page(fake_js=model('provisional'), dark=dark, width=width, height=900) as page:
        page.goto(page.url.split('?')[0] + f'?perfil={OTHER}&tab=rangos', wait_until='load'); page.wait_for_timeout(1800)
        s = page.evaluate(STATE)
        t = tag + ' público'
        check(s['tabs'] == ['Perfil', 'Takes', 'Picks', 'Rangos', 'Party'], f'{t}: pestañas {s["tabs"]}')
        check(s['selected'] == 'aeProfileTabRanks' and s['ranksVisible'], f'{t}: ?tab=rangos abre {s["selected"]}')
        check('Su rango' in str(s['ladder'][0]) and 'Tu rango' not in str(s['ladder']), f'{t}: escalera {s["ladder"][0]}')
        page.click('#camProfileRanks .cam-rk-pick-btn[data-competition="picks"]'); page.wait_for_timeout(600)
        s = page.evaluate(STATE)
        check('Le persigue' in ' '.join(s['rivals']) or not s['rivals'], f'{t}: rivales {s["rivals"]}')
        clean(page, t)
        page.click('#aeProfileTabOverview'); page.wait_for_timeout(400)
        s = page.evaluate(STATE)
        check('tab=' not in s['url'] and s['simple'].startswith('Rango: Cobre') and s['kinds'] == [], f'{t}: Perfil {s["url"]} {s["simple"]} {s["kinds"]}')
        shot(page, f'{tag}-publico-perfil')
        page.click('#aeProfileTabRanks'); page.wait_for_timeout(300)
        check('tab=rangos' in page.evaluate("location.search"), f'{t}: la dirección no dice tab=rangos')
        # El escudo de la cabecera abre mis «Rangos».
        page.evaluate("closeAeProfile()"); page.wait_for_timeout(300)
        if page.locator('#camHeaderRank').is_visible():
            page.click('#camHeaderRank'); page.wait_for_timeout(1200)
            s = page.evaluate(STATE)
            check(s['open'] and s['selected'] == 'aeProfileTabRanks' and s['heroName'] == 'Cobre', f'{t}: el escudo de la cabecera abre {s["selected"]}')
        check(not page.errors, f'{t}: errores {page.errors[:2]}')


for width in (320, 390, 1366):
    for dark in (False, True):
        tag = f'{width}-{"noche" if dark else "dia"}'
        if ONLY and ONLY != tag:
            continue
        own_provisional(width, dark, tag)
        if width != 320:
            own_oro(width, dark, tag)
        if width != 320 and not dark:
            public(width, dark, tag)
        print('·', tag)

if FAILS:
    print(f'\n{len(FAILS)} fallos')
    sys.exit(1)
print('OK · perfil con pestaña Rangos: pestañas, Perfil sencillo, Rangos, progreso real, público y cabecera; 320/390/1366, día y noche')
