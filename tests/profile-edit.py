"""Perfil ordenado como una app y cambio de nombre de usuario.

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).
Las reglas reales del cambio de nombre se prueban en SQL (tests/username-change.sh);
aquí se imitan las funciones cam_username_* para probar la interfaz.

Cubre, a 390 y 1366 px, de día y de noche:
  · cabecera: inicial, @usuario, «Miembro desde», Editar perfil / Compartir perfil;
  · pestañas Perfil · Takes · Picks · Mi Party (sin fila de cifras: las cifras
    están en las tarjetas del resumen, tests/profile-overview.py);
  · Editar perfil: comprobación en vivo (ocupado, espacios, acentos, libre),
    confirmación, cambio, deshacer y espera de 30 días; Escape vuelve al perfil;
  · el nombre nuevo llega a la cabecera y a la sesión;
  · el perfil público no muestra Editar perfil y sus pestañas no dicen «Mis…»;
  · sin errores de consola ni desbordamiento horizontal.

Uso: python3 -B tests/profile-edit.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

UID = 'a0000000-0000-4000-8000-000000000001'
OTHER = 'b0000000-0000-4000-8000-000000000002'
FAKE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.rpc = F.rpc || {}; F.tables = F.tables || {};
  const UID = '%(uid)s', OTHER = '%(other)s';
  F.user = {id: UID, is_anonymous: false, created_at: '2026-10-12T15:00:00Z', user_metadata: {username: 'ana_futbolera'}};
  const D = d => new Date(Date.now() - d * 864e5).toISOString();
  const take = (n, up, down) => ({id: 'd100000' + n + '-0000-4000-8000-000000000000', author_id: UID, author: 'ana_futbolera',
    title: 'Take ' + n, body: 'Texto del Take ' + n, sport: 'laliga', competition: 'LaLiga', upvotes: up, downvotes: down, created_at: D(n), hidden: false});
  const takes = [take(1, 14, 3), take(2, 6, 9), take(3, 21, 12)];
  F.rpc.ae_my_free_takes = () => ({data: takes, error: null});
  F.rpc.ae_public_take_profile = () => ({data: takes, error: null});
  const pick = (n, outcome) => ({id: 'c100000' + n + '-0000-4000-8000-000000000000', user_id: UID, author: 'ana_futbolera', title: 'Pick ' + n,
    legs: [{event: 'Barcelona vs Sevilla', selection: 'Barcelona gana', sport: 'Fútbol'}], american_odds: 140, created_at: D(n),
    outcome, result_points: outcome === 'won' ? 1.4 : outcome === 'lost' ? -1.4 : null, moderation_status: 'approved', hidden: false, upvotes: 1, downvotes: 0});
  F.tables.ae_pick_feed = [pick(1, 'won'), pick(2, 'lost'), pick(3, 'pending')];
  const N = {current: 'ana_futbolera', taken: ['beto', 'carla'], last: null, prev: null, undoUsed: false};
  F.names = N;
  const status = () => {
    const now = Date.now(), last = N.last, undoOk = last && !N.undoUsed && now - last < 7 * 864e5;
    return {username: N.current, can_change: !last || now - last > 30 * 864e5,
      next_change_at: last && new Date(last + 30 * 864e5).toISOString(),
      undo_username: undoOk ? N.prev : null, undo_until: undoOk ? new Date(last + 7 * 864e5).toISOString() : null};
  };
  F.rpc.cam_username_status = () => ({data: status(), error: null});
  F.rpc.cam_username_available = ({p_username}) => {
    const n = String(p_username).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(n)) return {data: 'invalid', error: null};
    if (n === N.current) return {data: 'same', error: null};
    return {data: N.taken.includes(n) ? 'taken' : 'ok', error: null};
  };
  F.rpc.cam_change_username = ({p_username}) => {
    const n = String(p_username).trim().toLowerCase(), st = status(), undo = st.undo_username === n;
    if (!st.can_change && !undo) return {data: null, error: {message: 'Solo puedes cambiar tu nombre una vez cada 30 días.'}};
    if (N.taken.includes(n)) return {data: null, error: {message: 'Ese nombre ya lo usa otra persona.'}};
    const previous = N.current;
    if (undo) N.undoUsed = true; else { N.prev = previous; N.undoUsed = false; }
    N.current = n; N.last = Date.now(); F.user.user_metadata.username = n;
    return {data: Object.assign(status(), {previous_username: previous, undo}), error: null};
  };
  F.rpc.cam_public_profile_card = ({p_user}) => ({data: {username: p_user === OTHER ? 'beto_crack' : N.current, joined_month: '2026-10'}, error: null});
  // Resumen del perfil (pestaña Perfil): nombre público y cifras.
  F.rpc.cam_profile_overview = ({p_user}) => ({data: {user_id: p_user, username: p_user === OTHER ? 'beto_crack' : N.current, joined_month: '2026-10',
    takes: {count: 3, up: 41, down: 24, top: null}, picks: {count: 3, won: 1, lost: 1, top: null},
    quiniela: {nfl: null, football: null, parties: []}}, error: null});
  F.rpc.cam_profile_party = () => ({data: {own: true, parties: [], quiniela: {nfl: null, football: null}, recent: []}, error: null});
})();
""" % {'uid': UID, 'other': OTHER}

STATE = """() => {
  const $ = id => document.getElementById(id);
  return {title: $('aeProfileTitle').textContent, sub: $('aeProfileUsername').textContent, avatar: $('camProfileAvatar').textContent,
    kicker: $('camProfileKicker').textContent, edit: !$('camProfileEditOpen').hidden,
    stats: document.querySelectorAll('#camProfileStats').length,
    figures: [...document.querySelectorAll('#camProfileOverview .cam-ov-figures')].map(n => n.textContent),
    selected: [...document.querySelectorAll('#aeProfileTabs button')].find(b => b.getAttribute('aria-selected') === 'true')?.id || null,
    tabs: [...document.querySelectorAll('#aeProfileTabs button')].map(b => b.textContent),
    check: $('camUsernameCheck').textContent, tone: $('camUsernameCheck').dataset.tone || '',
    saveEnabled: !$('camUsernameSave').hidden && !$('camUsernameSave').disabled,
    confirm: !$('camUsernameConfirm').hidden, inputDisabled: $('camUsernameInput').disabled,
    undo: $('camUsernameUndo').hidden ? null : $('camUsernameUndo').textContent,
    editing: $('aeProfileDialog').classList.contains('is-editing'), open: $('aeProfileDialog').open,
    session: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : null,
    overflow: $('aeProfileDialog').scrollWidth - $('aeProfileDialog').clientWidth};
}"""


def typed(page, text):
    box = page.locator('#camUsernameInput')
    box.fill('')
    box.type(text)
    page.wait_for_timeout(650)
    return page.evaluate(STATE)


def run(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=844 if width < 700 else 900, scale=2 if width < 700 else 1) as page:
        page.wait_for_timeout(1200)
        page.evaluate('openAeProfile()'); page.wait_for_timeout(1300)
        st = page.evaluate(STATE)
        assert st['title'] == '@ana_futbolera' and st['avatar'] == 'A', f'{where}: identidad {st}'
        assert st['sub'] == 'Miembro desde octubre de 2026', f'{where}: miembro desde {st}'
        assert st['edit'] and st['kicker'].startswith('MI PERFIL'), f'{where}: botones propios {st}'
        assert st['stats'] == 0, f'{where}: sin fila de cifras {st}'
        assert st['figures'] == ['3·63 % apoyo', '3·50 % acierto'], f'{where}: cifras en el resumen {st}'
        assert st['tabs'] == ['Perfil', 'Takes', 'Picks', 'Rangos', 'Mi grupo'] and st['selected'] == 'aeProfileTabOverview', f'{where}: pestañas {st}'
        assert st['overflow'] <= 1, f'{where}: desbordamiento {st}'
        if width < 700:
            box = page.evaluate("document.getElementById('aeProfileDialog').getBoundingClientRect().toJSON()")
            assert box['x'] == 0 and box['y'] == 0 and abs(box['width'] - width) <= 1, f'{where}: pantalla completa {box}'
        if SHOTS: page.screenshot(path=str(SHOTS / f'{where}-perfil.png'))
        # Las pestañas siguen funcionando (Takes y Picks cargan al abrirlas).
        page.click('#aeProfileTabPicks'); page.wait_for_timeout(400)
        assert page.evaluate("document.getElementById('aeProfileTabPicks').getAttribute('aria-selected')") == 'true', f'{where}: pestaña Picks'
        page.click('#aeProfileTabTakes'); page.wait_for_timeout(400)
        assert page.locator('#aeProfileTakeHighlights .ae-profile-feature').count() >= 1, f'{where}: Takes cargados'
        page.click('#aeProfileTabOverview'); page.wait_for_timeout(300)

        # Editar perfil.
        page.click('#camProfileEditOpen'); page.wait_for_timeout(500)
        st = page.evaluate(STATE)
        assert st['editing'] and not st['saveEnabled'] and not st['inputDisabled'], f'{where}: abrir edición {st}'
        assert page.evaluate("document.activeElement.id") == 'camProfileEditTitle', f'{where}: sin teclado automático'
        hidden = page.evaluate("[...document.querySelectorAll('#aeProfileDialog > :not(#camProfileEdit)')].every(n => !n.getClientRects().length)")
        assert hidden, f'{where}: en Editar perfil solo se ve la edición'
        st = typed(page, 'Beto')
        assert st['tone'] == 'error' and 'otra persona' in st['check'] and not st['saveEnabled'], f'{where}: ocupado {st}'
        st = typed(page, 'añita')
        assert st['tone'] == 'error' and 'acentos' in st['check'], f'{where}: acentos {st}'
        st = typed(page, 'ab')
        assert st['tone'] == 'error' and '3 caracteres' in st['check'], f'{where}: corto {st}'
        st = typed(page, 'Ana FC')
        assert page.input_value('#camUsernameInput') == 'ana_fc', f'{where}: minúsculas y espacios → _'
        assert st['tone'] == 'ok' and st['saveEnabled'], f'{where}: libre {st}'
        if SHOTS: page.screenshot(path=str(SHOTS / f'{where}-editar.png'))
        page.click('#camUsernameSave'); page.wait_for_timeout(300)
        st = page.evaluate(STATE)
        assert st['confirm'] and '@ana_fc' in page.inner_text('#camUsernameConfirm'), f'{where}: confirmación {st}'
        page.click('#camUsernameConfirmNo'); page.wait_for_timeout(200)
        assert not page.evaluate(STATE)['confirm'], f'{where}: cancelar'
        page.click('#camUsernameSave'); page.wait_for_timeout(200)
        page.click('#camUsernameConfirmYes'); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert st['title'] == '@ana_fc' and st['session'] == 'ana_fc', f'{where}: nombre nuevo {st}'
        assert st['tone'] == 'ok' and 'iniciar sesión' in st['check'], f'{where}: aviso de acceso {st}'
        assert st['inputDisabled'] and st['undo'] and '@ana_futbolera' in st['undo'], f'{where}: espera y deshacer {st}'
        if SHOTS: page.screenshot(path=str(SHOTS / f'{where}-cambiado.png'))
        page.click('#camUsernameUndo'); page.wait_for_timeout(200)
        page.click('#camUsernameConfirmYes'); page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert st['title'] == '@ana_futbolera' and st['undo'] is None and st['inputDisabled'], f'{where}: deshacer {st}'
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        st = page.evaluate(STATE)
        assert st['open'] and not st['editing'], f'{where}: Escape vuelve al perfil {st}'

        # Perfil público.
        page.evaluate(f"openAePublicProfile('{OTHER}', false)"); page.wait_for_timeout(1200)
        st = page.evaluate(STATE)
        assert st['title'] == '@beto_crack' and not st['edit'] and st['kicker'].startswith('AFICIONADO'), f'{where}: público {st}'
        assert st['tabs'] == ['Perfil', 'Takes', 'Picks', 'Rangos', 'Party'] and st['selected'] == 'aeProfileTabOverview', f'{where}: pestañas públicas {st}'
        assert not page.locator('#aeProfileDialog [data-cam-welcome-again]').count(), f'{where}: cabecera sin botón de bienvenida'
        if SHOTS: page.screenshot(path=str(SHOTS / f'{where}-publico.png'))
        assert page.errors == [], f'{where}: errores {page.errors}'
    print('PASS', where)


if __name__ == '__main__':
    for width in (390, 1366):
        for dark in (False, True):
            run(width, dark)
    print('PASS: perfil ordenado y cambio de nombre de usuario')
