"""Rango en la cabecera y avisos dentro del perfil (9 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso de
tests/fake-supabase.js (sin red). Cubre, a 320, 390 y 1366 px, de día y de noche:

  · cabecera del teléfono: luna · perfil · rango · salir, en ese orden, a la
    misma altura, del mismo tamaño (44 × 44) y sin tocar el logo; en el
    ordenador luna · rango · salir y Perfil en la navegación;
  · sin sesión no hay rango ni globito; ya no hay campana en la cabecera;
  · el rango es solo el icono existente de las ligas (el más alto del usuario),
    con aria-label «Tu rango: <nombre>»; los siete niveles;
  · globito sobre Perfil: nada con 0 avisos, «1» con 1 y «9+» con 12, y el
    número en el aria-label de Perfil;
  · el editor conserva Editar y Publicar (segunda fila en el teléfono) sin
    desordenar los cuatro de arriba;
  · perfil propio: campana junto a «Editar perfil» con el número; abre el
    panel (hoja desde abajo en el teléfono, panel lateral en el ordenador),
    marca los avisos como leídos al abrirlos (siguen resaltados mientras está
    abierto) y cada aviso lleva a su publicación cerrando el perfil;
  · tocar el globito abre el perfil directamente con el panel;
  · tocar el rango abre el perfil con el detalle del rango desplegado;
  · perfil ajeno: sin campana; el perfil abre bien con y sin avisos;
  · sin errores de consola ni textos cortados.

Uso: python3 -B tests/rango-avisos.py [--shots DIR] [--only 390-dia]
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
KEYS = ['cobre', 'bronce', 'plata', 'oro', 'platino', 'diamante', 'leyenda']


def model(signed=True, admin=False, unread=0, rank=3):
    user = {'id': ME, 'is_anonymous': False, 'email': 'ana@ejemplo.com', 'created_at': '2026-10-12T15:00:00Z',
            'user_metadata': {'username': 'ana_futbolera', 'display_name': 'Ana'}} if signed else None
    return r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
const F = window.__fake; F.rpc = F.rpc || {}; F.tables = F.tables || {}; F.applyUpdates = true;
const ME = %(me)s, OTHER = %(other)s;
F.user = %(user)s;
F.tables.editors = %(editors)s;
const D = h => new Date(Date.now() - h * 36e5).toISOString();
// Avisos sin leer de Ana + uno ya leído de antes (no cuenta).
F.tables.ae_notifications = Array.from({length: %(unread)d}, (_, i) => ({id: 'n' + i, recipient_id: ME,
  event_key: i %% 3 === 2 ? 'take_reply' : 'take_vote', vote_value: 1, actor_name: 'beto_crack',
  context_title: 'Los Chiefs vuelven al Super Bowl ' + i, target_kind: 'pick', target_id: 'c100000' + i,
  created_at: D(i + 1), read_at: null}))
  .concat([{id: 'viejo', recipient_id: ME, event_key: 'pick_vote', vote_value: 1, actor_name: 'carla',
  context_title: 'Barça gana', target_kind: 'pick', target_id: 'c1000000', created_at: D(80), read_at: D(70)}]);
F.rank = %(rank)d;
const ranks = r => [{competition: 'football', label: 'Quiniela Fútbol', rank: 0, best_rank: 0, current: null, starts_on: '2026-11-01'},
  {competition: 'nfl', label: 'Quiniela NFL', rank: Math.min(r, 1), best_rank: 1, current: null, starts_on: '2026-11-01'},
  {competition: 'picks', label: 'Picks', rank: r, best_rank: r, current: null, starts_on: '2026-11-01'}];
F.rpc.cam_league_profile = ({p_user}) => ({data: {ranks: ranks(p_user === ME ? F.rank : 2), awards: [], history: []}, error: null});
const empty = user => ({user_id: user, username: user === ME ? 'ana_futbolera' : 'beto_crack', joined_month: '2026-10',
  takes: {count: 0, up: 0, down: 0, top: null}, picks: {count: 0, won: 0, lost: 0, top: null},
  quiniela: {nfl: null, football: null, parties: []}});
F.rpc.cam_profile_overview = ({p_user}) => ({data: empty(p_user), error: null});
F.rpc.cam_profile_party = () => ({data: {own: false, parties: [], quiniela: {nfl: null, football: null}, recent: [], last_sport: null}, error: null});
F.tables.cam_nfl_picks = []; F.tables.cam_football_picks = []; F.tables.cam_party_members = [];
F.rpc.cam_username_status = () => ({data: {username: 'ana_futbolera', can_change: true}, error: null});
F.rpc.cam_party_mine = () => ({data: [], error: null});
})();
""" % {'me': json.dumps(ME), 'other': json.dumps(OTHER), 'user': json.dumps(user),
       'editors': json.dumps([{'user_id': ME}] if admin else []), 'unread': unread, 'rank': rank}


HEADER = """() => {
  const vis = n => Boolean(n && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const box = n => { const r = n.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, right: r.right, bottom: r.bottom}; };
  const header = document.querySelector('body > header');
  const actions = header.querySelector('.ae-header-actions');
  const pick = (name, node) => vis(node) ? Object.assign({name}, box(node)) : null;
  const logout = [...actions.querySelectorAll('.ae-classical-logout,.ae-signout-action')].find(vis);
  const controls = [pick('luna', document.getElementById('themeToggle')),
    actions.contains(document.getElementById('camNavProfile')) ? pick('perfil', document.getElementById('camNavProfile')) : null,
    pick('rango', document.getElementById('camHeaderRank')), logout ? pick('salir', logout) : null].filter(Boolean);
  const rank = document.getElementById('camHeaderRank');
  const profile = document.getElementById('camNavProfile');
  const badge = profile && profile.querySelector('.cam-profile-badge');
  const brand = header.querySelector('.cam-brand');
  const tools = [...actions.querySelectorAll('#camGlobalEditToggle,.ae-publish-action')].filter(vis).map(n => box(n));
  return {
    controls, tools, brand: box(brand), width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    bellInHeader: Boolean(header.querySelector('#aeNotificationsButton, .ae-notifications-bell')),
    rank: vis(rank) ? {label: rank.getAttribute('aria-label'), key: rank.querySelector('.cam-rank-emblem')?.dataset.rank || null,
      text: rank.textContent.trim(), emblem: box(rank.querySelector('.cam-rank-emblem'))} : null,
    profileInNav: Boolean(profile && profile.closest('nav.ae-sport-nav')),
    profileLabel: profile ? profile.getAttribute('aria-label') : null,
    badge: vis(badge) ? {text: badge.textContent, box: box(badge), profile: box(profile)} : null
  };
}"""

PROFILE = """() => {
  const vis = n => Boolean(n && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const box = n => { const r = n.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom}; };
  const d = document.getElementById('aeProfileDialog');
  const edit = document.getElementById('camProfileEditOpen');
  const bell = document.getElementById('aeNotificationsButton');
  const badge = document.getElementById('aeNotificationsBadge');
  return {open: d.open, title: document.getElementById('aeProfileTitle').textContent,
    edit: vis(edit) ? box(edit) : null, bell: vis(bell) ? box(bell) : null, bellLabel: bell.getAttribute('aria-label'),
    badge: vis(badge) ? badge.textContent : null,
    // El número de la campana sobresale: su caja (con overflow visible) no lo recorta.
    badgeInside: !vis(badge) || badge.getBoundingClientRect().top >= bell.parentElement.getBoundingClientRect().top - 0.5,
    share: vis(document.getElementById('camProfileShare')) ? box(document.getElementById('camProfileShare')) : null,
    rankCard: Boolean(d.querySelector('.cam-rank-disclosure')), rankOpen: Boolean(d.querySelector('.cam-rank-disclosure[open]'))};
}"""

PANEL = """() => {
  const p = document.getElementById('aeNotificationsDialog');
  const r = p.getBoundingClientRect();
  return {open: p.open, x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight,
    rows: p.querySelectorAll('.ae-notification-entry').length, unreadRows: p.querySelectorAll('.ae-notification-entry.is-unread').length,
    empty: [...p.querySelectorAll('.ae-notifications-empty')].map(n => n.textContent.trim()),
    readAll: !document.getElementById('aeNotificationsReadAll').hidden,
    stored: window.__fake.tables.ae_notifications.filter(n => !n.read_at).length,
    updates: window.__fake.calls.filter(c => c.table === 'ae_notifications' && c.op === 'update').length};
}"""

failures = []
def check(ok, label):
    if not ok:
        failures.append(label)
        print('  FALLA:', label)


def shot(page, name, locator=None):
    if not SHOTS: return
    (page.locator(locator) if locator else page).screenshot(path=str(SHOTS / (name + '.png')))


def check_header(page, tag, signed, admin=False, unread=0, rank=3):
    h = page.evaluate(HEADER)
    phone = h['width'] <= 760
    names = [c['name'] for c in sorted(h['controls'], key=lambda c: c['x'])]
    want = (['luna', 'perfil'] if phone else ['luna']) + (['rango', 'salir'] if signed else [])
    check(names == want, f'{tag}: orden de la cabecera {names} ≠ {want}')
    check(not h['bellInHeader'], f'{tag}: la campana sigue en la cabecera')
    check(h['scrollWidth'] <= h['width'], f'{tag}: la página se desborda a lo ancho ({h["scrollWidth"]})')
    sizes = {(round(c['w']), round(c['h'])) for c in h['controls']}
    check(len(sizes) == 1, f'{tag}: tamaños distintos {sizes}')
    if phone: check(sizes == {(44, 44)}, f'{tag}: los controles no miden 44 × 44: {sizes}')
    else: check(all(w >= 44 and hh >= 44 for w, hh in sizes), f'{tag}: controles < 44 px: {sizes}')
    check(max(c['cy'] for c in h['controls']) - min(c['cy'] for c in h['controls']) < 1, f'{tag}: los controles no están a la misma altura')
    xs = sorted(h['controls'], key=lambda c: c['x'])
    check(all(b['x'] >= a['right'] - 0.5 for a, b in zip(xs, xs[1:])), f'{tag}: controles encimados')
    check(xs[0]['x'] >= h['brand']['right'] - 0.5, f'{tag}: los controles tocan el logo ({xs[0]["x"]:.1f} < {h["brand"]["right"]:.1f})')
    check(xs[-1]['right'] <= h['width'] + 0.5, f'{tag}: un control se sale de la pantalla')
    check(phone != h['profileInNav'] if signed or phone else True, f'{tag}: Perfil no está donde toca')
    if signed:
        check(h['rank'] is not None and h['rank']['label'] == 'Tu rango: ' + LEVELS[rank], f'{tag}: rango {h["rank"]}')
        if h['rank']:
            check(h['rank']['key'] == KEYS[rank], f'{tag}: icono del rango {h["rank"]["key"]} ≠ {KEYS[rank]}')
            check(h['rank']['text'] == '', f'{tag}: el rango lleva texto «{h["rank"]["text"]}»')
            e = h['rank']['emblem']
            check(20 <= e['w'] <= 26 and 24 <= e['h'] <= 30, f'{tag}: icono del rango de {e["w"]:.0f}×{e["h"]:.0f}')
        want_badge = None if unread == 0 else ('9+' if unread > 9 else str(unread))
        got = h['badge']['text'] if h['badge'] else None
        check(got == want_badge, f'{tag}: globito de Perfil «{got}» ≠ «{want_badge}»')
        if unread:
            check('sin leer' in (h['profileLabel'] or ''), f'{tag}: aria-label de Perfil sin el número: {h["profileLabel"]}')
            b, p = h['badge']['box'], h['badge']['profile']
            check(b['right'] <= h['width'] and b['y'] >= -0.5, f'{tag}: el globito se sale de la pantalla')
            check(b['x'] < p['right'] + 6 and b['right'] > p['x'], f'{tag}: el globito no está sobre Perfil')
    else:
        check(h['rank'] is None, f'{tag}: rango visible sin sesión')
        check(h['badge'] is None, f'{tag}: globito sin sesión')
    if admin:
        check(len(h['tools']) == 2, f'{tag}: faltan Editar/Publicar del editor ({len(h["tools"])})')
        if phone:
            check(all(t['y'] >= max(c['bottom'] for c in h['controls']) - 0.5 for t in h['tools']), f'{tag}: Editar/Publicar en la fila de arriba')
        check(all(t['right'] <= h['width'] + 0.5 for t in h['tools']), f'{tag}: herramientas fuera de la pantalla')
    bad = page.evaluate(CLIPPED, 'body > header')
    check(not bad, f'{tag}: textos cortados en la cabecera {bad}')
    return h


def run(width, dark):
    tag = f'{width}-{"noche" if dark else "dia"}'
    if ONLY and ONLY != tag: return
    height = 844 if width < 761 else 900
    print(tag)

    # Sin sesión.
    with fp.full_page(fake_js=model(signed=False), dark=dark, width=width, height=height) as page:
        check_header(page, tag + ' sin sesión', signed=False)
        shot(page, tag + '-cabecera-sin-sesion', 'body > header')
        check(not page.errors, f'{tag} sin sesión: errores {page.errors[:2]}')

    # Lector con 0, 1 y 12 avisos.
    for unread in (0, 1, 12):
        t = f'{tag} {unread} avisos'
        with fp.full_page(fake_js=model(unread=unread), dark=dark, width=width, height=height) as page:
            page.wait_for_timeout(300)
            check_header(page, t, signed=True, unread=unread)
            shot(page, f'{tag}-cabecera-{unread}', 'body > header')
            # El perfil abre bien, con la campana junto a «Editar perfil».
            page.click('#camNavProfile'); page.wait_for_timeout(900)
            p = page.evaluate(PROFILE)
            check(p['open'] and p['title'] == '@ana_futbolera', f'{t}: el perfil no abre ({p["title"]})')
            check(p['rankCard'], f'{t}: el perfil perdió el rango actual')
            check(p['bell'] is not None and p['edit'] is not None, f'{t}: falta la campana o «Editar perfil»')
            if p['bell'] and p['edit']:
                check(abs(p['bell']['y'] - p['edit']['y']) < 1 and 0 <= p['bell']['x'] - p['edit']['right'] <= 16,
                      f'{t}: la campana no está junto a «Editar perfil»')
                check(p['bell']['w'] >= 44 and p['bell']['h'] >= 44, f'{t}: campana < 44 px')
            want = None if unread == 0 else ('9+' if unread > 9 else str(unread))
            check(p['badge'] == want, f'{t}: número de la campana «{p["badge"]}» ≠ «{want}»')
            check(p['badgeInside'], f'{t}: el número de la campana queda recortado por arriba')
            bad = page.evaluate(CLIPPED, '#aeProfileDialog')
            check(not bad, f'{t}: textos cortados en el perfil {bad}')
            page.locator('#aeNotificationsButton').scroll_into_view_if_needed()
            shot(page, f'{tag}-perfil-{unread}')
            # Panel: hoja desde abajo (teléfono) o panel lateral (ordenador).
            page.click('#aeNotificationsButton'); page.wait_for_timeout(700)
            s = page.evaluate(PANEL)
            check(s['open'], f'{t}: el panel no abre')
            if width <= 760:
                check(abs(s['bottom'] - s['vh']) < 1 and abs(s['w'] - s['vw']) < 1 and s['y'] > 0, f'{t}: no es una hoja desde abajo {s}')
            else:
                check(abs(s['right'] - s['vw']) < 1 and abs(s['h'] - s['vh']) < 1 and s['w'] <= 440.5, f'{t}: no es un panel lateral {s}')
            check(s['rows'] == unread + 1, f'{t}: {s["rows"]} avisos en el panel, se esperaban {unread + 1}')
            check(s['stored'] == 0, f'{t}: quedan {s["stored"]} sin leer tras abrir')
            check(s['updates'] == (1 if unread else 0), f'{t}: {s["updates"]} escrituras al abrir')
            check(s['unreadRows'] == unread, f'{t}: resaltados {s["unreadRows"]}, se esperaban {unread}')
            check(not s['readAll'], f'{t}: «Marcar todas como leídas» sigue visible')
            if unread == 0: check(len(s['empty']) == 1, f'{t}: falta el aviso de lista vacía {s["empty"]}')
            bad = page.evaluate(CLIPPED, '#aeNotificationsDialog')
            check(not bad, f'{t}: textos cortados en el panel {bad}')
            shot(page, f'{tag}-panel-{unread}')
            h = page.evaluate(HEADER)
            check(h['badge'] is None, f'{t}: el globito de Perfil sigue tras leerlos')
            page.keyboard.press('Escape'); page.wait_for_timeout(300)
            check(page.evaluate("document.activeElement?.id") == 'aeNotificationsButton', f'{t}: el foco no vuelve a la campana')
            check(page.evaluate("document.getElementById('aeProfileDialog').open"), f'{t}: cerrar el panel cerró el perfil')
            check(page.evaluate("document.getElementById('aeNotificationsBadge').hidden"), f'{t}: la campana sigue con número')
            if unread:
                # Reabierto: ya no hay resaltados. Un aviso lleva a su publicación y cierra el perfil.
                page.click('#aeNotificationsButton'); page.wait_for_timeout(500)
                s = page.evaluate(PANEL)
                check(s['unreadRows'] == 0, f'{t}: siguen resaltados al reabrir ({s["unreadRows"]})')
                page.evaluate("window.__opened=[];window.aeOpenPickDetail=id=>window.__opened.push(id);0")
                page.locator('#aeNotificationsDialog .ae-notification-entry').first.click(); page.wait_for_timeout(600)
                gone = page.evaluate("[document.getElementById('aeNotificationsDialog').open,document.getElementById('aeProfileDialog').open,window.__opened]")
                check(gone[0] is False and gone[1] is False and gone[2] == ['c1000000'], f'{t}: el aviso no lleva a su Pick {gone}')
            check(not page.errors, f'{t}: errores {page.errors[:2]}')

    # Tocar el globito abre el perfil con el panel; tocar el rango, el detalle del rango.
    with fp.full_page(fake_js=model(unread=12), dark=dark, width=width, height=height) as page:
        page.wait_for_timeout(300)
        b = page.locator('#camNavProfile .cam-profile-badge').bounding_box()
        page.mouse.click(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2); page.wait_for_timeout(1200)
        s = page.evaluate(PANEL)
        check(page.evaluate("document.getElementById('aeProfileDialog').open") and s['open'], f'{tag}: el globito no abre el perfil con el panel')
        check(s['stored'] == 0, f'{tag}: el globito abrió el panel sin marcar como leídos')
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        page.evaluate("closeAeProfile()"); page.wait_for_timeout(300)
        page.click('#camHeaderRank'); page.wait_for_timeout(1000)
        p = page.evaluate(PROFILE)
        check(p['open'] and p['rankOpen'], f'{tag}: el rango no abre el perfil con su detalle {p}')
        page.evaluate("closeAeProfile()"); page.wait_for_timeout(300)
        # Tocar el icono de Perfil (no el globito) abre el perfil sin el panel y con el detalle cerrado.
        pr = page.locator('#camNavProfile').bounding_box()
        page.mouse.click(pr['x'] + pr['width'] / 2, pr['y'] + pr['height'] - 6); page.wait_for_timeout(900)
        p = page.evaluate(PROFILE)
        check(p['open'] and not page.evaluate("document.getElementById('aeNotificationsDialog').open") and not p['rankOpen'],
              f'{tag}: Perfil no abre el perfil normal {p}')
        # Perfil ajeno: sin campana.
        page.evaluate("closeAeProfile()"); page.wait_for_timeout(200)
        page.evaluate(f"openAePublicProfile('{OTHER}')"); page.wait_for_timeout(900)
        p = page.evaluate(PROFILE)
        check(p['open'] and p['bell'] is None and p['edit'] is None, f'{tag}: perfil ajeno con campana {p}')
        check(not page.errors, f'{tag} globito/rango: errores {page.errors[:2]}')

    # Editor: los cuatro en orden y sus herramientas aparte.
    with fp.full_page(fake_js=model(admin=True, unread=1, rank=5), dark=dark, width=width, height=height) as page:
        page.wait_for_timeout(500)
        check_header(page, tag + ' editor', signed=True, admin=True, unread=1, rank=5)
        shot(page, tag + '-cabecera-editor', 'body > header')
        check(not page.errors, f'{tag} editor: errores {page.errors[:2]}')


def levels():
    if ONLY and ONLY != 'rangos': return
    print('rangos')
    for width in (390, 1366):
        with fp.full_page(fake_js=model(rank=0), width=width, height=844) as page:
            page.wait_for_timeout(300)
            for n in range(7):
                page.evaluate(f"window.__fake.rank={n};CamLeagues.syncHeader(true)"); page.wait_for_timeout(150)
                h = check_header(page, f'{width} rango {LEVELS[n]}', signed=True, rank=n)
                if SHOTS and width == 390: page.locator('#camHeaderRank').screenshot(path=str(SHOTS / f'rango-{KEYS[n]}.png'))
            check(not page.errors, f'{width} rangos: errores {page.errors[:2]}')


for w in (320, 390, 1366):
    for d in (False, True):
        run(w, d)
levels()
print('FALLAS:' if failures else 'PASA: rango en la cabecera y avisos dentro del perfil.')
for f in failures: print(' -', f)
sys.exit(1 if failures else 0)
