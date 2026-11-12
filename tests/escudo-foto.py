"""El escudo del rango como foto (11 nov 2026).

Página completa en Chromium con tests/full-page.py y el Supabase falso de
tests/fake-supabase.js (sin red). Comprueba:

  · Perfil propio, de Cobre a Leyenda CAM (390 px de día y de noche; 320 y
    1366 px con Oro y Leyenda CAM): el escudo del rango relleno de su metal (un
    color distinto por rango) con la inicial («E») en el centro, en lugar del
    símbolo, y el nombre del rango debajo en su color; se lee «Rango: Oro»; la línea pequeña
    «COBRE · PICKS» ya no se ve; el nombre no queda cortado ni montado; el
    escudo de la cabecera, del mismo color.
  · Mientras llega el rango: escudo neutro del mismo tamaño, ya con la inicial.
  · «Editar perfil»: el mismo escudo con su nombre y el texto nuevo.
  · Resto de la web, cada persona con el escudo de su rango y su inicial en el centro:
    Picks (tarjetas y detalle), Chefs (escudo junto al nombre, del rango de la
    persona), Inicio · clasificación de Takes, Últimos Takes y la conversación
    de un Take (autor y respuestas). Sin cuenta detrás: escudo neutro.
  · Una sola llamada cam_league_identities por tanda (≤ 50 personas), sin
    repetir personas; la insignia Top 10 sigue junto al nombre.
  · Sin errores de consola, sin textos cortados y sin desborde lateral.

Uso: python3 -B tests/escudo-foto.py [--shots DIR] [--only perfil|sitio]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
# Como en picks-moderno.py: el cliente falso separa platos Mejores (>0) y Peores (<0).
fp.FAKE_CLIENT = fp.FAKE_CLIENT.replace("'gt', 'lt', ", "").replace(
    "q.neq = (col, val) =>",
    "q.gt = (col, val) => { state.filters.push(r => r[col] > val); return q; };\n"
    "    q.lt = (col, val) => { state.filters.push(r => r[col] < val); return q; };\n"
    "    q.neq = (col, val) =>")
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
CLIPPED = (ROOT / 'tests/parties.py').read_text(encoding='utf8').split('CLIPPED = r"""', 1)[1].split('"""', 1)[0]

ME = 'a0000000-0000-4000-8000-000000000001'
LEVELS = ['Cobre', 'Bronce', 'Plata', 'Oro', 'Platino', 'Diamante', 'Leyenda CAM']
KEYS = ['cobre', 'bronce', 'plata', 'oro', 'platino', 'diamante', 'leyenda']
FAILS = []
U = lambda n: '%08d-0000-4000-8000-000000000000' % n
# Rango de cada persona de las listas (usuario n → nivel). Sin fila: Cobre.
LEVEL_OF = {1: 3, 2: 6, 3: 1, 4: 2, 5: 4, 6: 5, 7: 0, 8: 3, 9: 1, 21: 2, 22: 5, 23: 0}


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print('FALLA:', msg)


def shot(page, name):
    if SHOTS: page.screenshot(path=str(SHOTS / f'{name}.png'))


def clean(page, t, selector='#aeProfileDialog'):
    # cam-tk-open (el título de una tarjeta de Take, recortado a propósito) ya salía así en main antes de este cambio.
    bad = [b for b in page.evaluate(CLIPPED, selector) if not b.startswith('cam-tk-open ')]
    check(not bad, f'{t}: textos cortados {bad[:3]}')
    over = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(over <= 1, f'{t}: desborde lateral {over}')
    check(not page.errors, f'{t}: errores {page.errors[:2]}')


BASE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
const F = window.__fake; F.rpc = F.rpc || {}; F.tables = F.tables || {};
const ME = %(me)s, LEVEL_OF = %(levels)s;
F.top = %(top)s; F.slow = 0;
F.user = {id: ME, is_anonymous: false, email: 'eduard@ejemplo.com', created_at: '2026-10-12T15:00:00Z',
  user_metadata: {username: 'eduard_carrera'}};
F.tables.editors = [];
const cur = c => ({competition: c, season_month: '2026-11-01', user_id: ME, username: 'eduard_carrera', points: 0, correct: 0,
  resolved: 0, required: 14, available: 30, eligible: false, position: null, participants: 20, rank_before: 0, rank_after: 0,
  zone: 'pausa', next_inactive: 1, next_streak: 0});
const ranks = () => [
  {competition: 'football', label: 'Quiniela Fútbol', starts_on: '2026-11-01', rank: 0, best_rank: 0, inactive_months: 0, last_month: '2026-10-01', current: cur('football')},
  {competition: 'nfl', label: 'Quiniela NFL', starts_on: '2026-11-01', rank: F.top, best_rank: F.top, inactive_months: 0, last_month: '2026-10-01', current: cur('nfl')},
  {competition: 'picks', label: 'Picks', starts_on: '2026-11-01', rank: 0, best_rank: 0, inactive_months: 0, last_month: '2026-10-01', current: null}];
const wait = ms => new Promise(r => setTimeout(r, ms));
F.rpc.cam_league_profile = async () => { if (F.slow) await wait(F.slow);
  return {data: {month: '2026-11-01', ranks: ranks(), awards: [], history: []}, error: null}; };
// Rangos de las listas: ranks de cam_league_members (rank_level) y, para el usuario 1, Top 10 en Picks.
F.rpc.cam_league_identities = ({p_users}) => ({data: Object.fromEntries(p_users.map(id => {
  const n = parseInt(id.slice(0, 8), 10), lv = LEVEL_OF[n];
  const rows = lv === undefined ? [] : [{user_id: id, competition: 'nfl', rank_level: lv}, {user_id: id, competition: 'picks', rank_level: 0}];
  const awards = n === 1 ? [{user_id: id, competition: 'picks', season_month: '2026-10-01', eligible: true, position: 2}] : [];
  return [id, {ranks: rows, awards}];
})), error: null});
F.rpc.cam_league_board = ({p_competition}) => ({data: {competition: p_competition, month: '2026-11-01', closed: false, rows: []}, error: null});
F.rpc.cam_profile_overview = ({p_user}) => ({data: {user_id: p_user, username: 'eduard_carrera', joined_month: '2026-10',
  takes: {count: 0, up: 0, down: 0, top: null}, picks: {count: 0, won: 0, lost: 0, top: null},
  quiniela: {nfl: null, football: null, parties: []}, liguilla: null}, error: null});
F.rpc.cam_profile_party = () => ({data: {own: true, parties: [], quiniela: {nfl: null, football: null}, recent: [], last_sport: null}, error: null});
F.tables.cam_nfl_picks = []; F.tables.cam_football_picks = []; F.tables.cam_party_members = [];
F.rpc.cam_username_status = () => ({data: {username: 'eduard_carrera', can_change: true}, error: null});
F.rpc.cam_party_mine = () => ({data: [], error: null});
})();
"""


def base(top=0):
    return BASE % {'me': json.dumps(ME), 'levels': json.dumps({str(k): v for k, v in LEVEL_OF.items()}), 'top': top}


# Colores esperados (cam-leagues.css): relleno del escudo y nombre (de día / de noche).
def rgb(h): return 'rgb(%d, %d, %d)' % tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
FILL = [rgb(h) for h in ('#c96f4b', '#a8804a', '#c4ccd6', '#e5b53d', '#6fcfc0', '#72b2f4', '#b88ae6')]
TEXT_DAY = [rgb(h) for h in ('#8a4024', '#6c4d20', '#4b5a69', '#765810', '#1e665c', '#1f5a9c', '#673891')]
TEXT_NIGHT = [rgb(h) for h in ('#efa385', '#dcb986', '#dde5ee', '#f3d27a', '#93e6d9', '#addaff', '#dfc3fb')]

FACE = """() => {
  const vis = n => Boolean(n && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
  const box = n => { const r = n.getBoundingClientRect(); return {l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height}; };
  const a = document.getElementById('camProfileAvatar'), names = document.querySelector('#aeProfileDialog .cam-profile-names');
  const em = a.querySelector('.cam-rank-emblem'), name = a.querySelector('.cam-rank-avatar-name');
  const head = document.querySelector('#camHeaderRank .cam-rank-shield');
  return {
    cls: a.className, rank: a.dataset.rank, role: a.getAttribute('role'), hidden: a.getAttribute('aria-hidden'),
    label: a.getAttribute('aria-label'), text: a.textContent.trim(), emblem: em ? em.dataset.rank : null,
    fill: em ? getComputedStyle(em.querySelector('.cam-rank-shield')).fill : null,
    symbol: em ? em.querySelectorAll('.cam-rank-symbol').length : null,
    letter: em?.querySelector('.cam-rank-letter')?.textContent ?? null,
    letterBox: em?.querySelector('.cam-rank-letter') ? box(em.querySelector('.cam-rank-letter')) : null,
    letterFill: em?.querySelector('.cam-rank-letter') ? getComputedStyle(em.querySelector('.cam-rank-letter')).fill : null,
    nameText: name ? name.textContent : null, nameColor: name ? getComputedStyle(name).color : null,
    nameClipped: name ? name.scrollWidth > name.clientWidth + 1 : null,
    bg: getComputedStyle(a).backgroundImage + ' ' + getComputedStyle(a).backgroundColor, radius: getComputedStyle(a).borderTopLeftRadius,
    border: getComputedStyle(a).borderTopWidth,
    avatar: box(a), shield: em ? box(em) : null, nameBox: name ? box(name) : null, names: box(names),
    oldLine: vis(document.getElementById('camProfileRank')),
    headFill: head ? getComputedStyle(head).fill : null,
  };
}"""


def profile_case(width, dark, levels, tag):
    with fp.full_page(fake_js=base(levels[0]), dark=dark, width=width, height=900) as page:
        page.evaluate("openAeProfile()"); page.wait_for_timeout(1300)
        for lv in levels:
            if lv != levels[0]:
                page.evaluate(f"window.__fake.top = {lv}; document.dispatchEvent(new Event('ae:picks-updated')); closeAeProfile();")
                page.wait_for_timeout(250)
                page.evaluate("window.CamLeagues.syncHeader(true); openAeProfile()"); page.wait_for_timeout(1100)
            s = page.evaluate(FACE)
            t = f'{tag} {LEVELS[lv]}'
            check('cam-rank-avatar' in s['cls'] and 'is-profile' in s['cls'], f'{t}: la foto no es el escudo ({s["cls"]})')
            check(s['rank'] == KEYS[lv] and s['emblem'] == KEYS[lv], f'{t}: rango {s["rank"]}/{s["emblem"]}')
            check(s['nameText'] == LEVELS[lv] and s['text'] == 'E' + LEVELS[lv], f'{t}: debajo del escudo «{s["nameText"]}» (texto «{s["text"]}»)')
            # La inicial («E» de eduard_carrera) en el centro del escudo, en lugar del símbolo del rango.
            check(s['letter'] == 'E' and s['symbol'] == 0, f'{t}: inicial «{s["letter"]}», símbolos {s["symbol"]}')
            lb, sb = s['letterBox'], s['shield']
            check(lb and abs((lb['l'] + lb['r']) / 2 - (sb['l'] + sb['r']) / 2) <= 1.5 and lb['l'] > sb['l'] and lb['r'] < sb['r']
                  and lb['t'] > sb['t'] and lb['b'] < sb['b'] and lb['h'] >= sb['h'] * .3, f'{t}: la inicial no va centrada dentro del escudo {lb} {sb}')
            check(s['letterFill'] == 'rgb(16, 41, 59)', f'{t}: color de la inicial {s["letterFill"]}')
            check(s['role'] == 'img' and s['hidden'] is None and s['label'] == 'Rango: ' + LEVELS[lv], f'{t}: accesible {s["role"]} {s["hidden"]} «{s["label"]}»')
            check(s['fill'] == FILL[lv], f'{t}: relleno {s["fill"]} ≠ {FILL[lv]}')
            check(s['nameColor'] == (TEXT_NIGHT if dark else TEXT_DAY)[lv], f'{t}: color del nombre {s["nameColor"]}')
            check(s['headFill'] == FILL[lv], f'{t}: escudo de la cabecera {s["headFill"]}')
            check(s['bg'].startswith('none') and s['border'] == '0px' and s['radius'] == '0px', f'{t}: queda el círculo de la inicial {s["bg"]} {s["border"]} {s["radius"]}')
            check(not s['oldLine'], f'{t}: sigue la línea «COBRE · PICKS»')
            check(not s['nameClipped'], f'{t}: nombre del rango cortado')
            sh, nm, av, names = s['shield'], s['nameBox'], s['avatar'], s['names']
            check(sh['h'] >= 54 and sh['w'] >= 46, f'{t}: escudo pequeño {sh["w"]:.0f}×{sh["h"]:.0f}')
            check(nm['t'] >= sh['b'] - 1 and abs((nm['l'] + nm['r']) / 2 - (sh['l'] + sh['r']) / 2) <= 2, f'{t}: el nombre no va centrado debajo del escudo')
            if width > 760:
                check(names['t'] >= av['b'] - 1, f'{t}: el nombre de usuario se monta con el escudo')
            else:
                check(names['l'] >= av['r'] - 1, f'{t}: el nombre de usuario se monta con el escudo')
            clean(page, t)
            if lv in (0, 3, 6) or SHOTS and width == 390: shot(page, f'{tag}-{KEYS[lv]}')
        # «Editar perfil»: el mismo escudo con su nombre y el texto nuevo.
        if levels[-1] == 6:
            page.click('#camProfileEditOpen'); page.wait_for_timeout(500)
            e = page.evaluate("""() => { const a = document.getElementById('camProfileEditAvatar'), em = a.querySelector('.cam-rank-emblem');
              return {rank: a.dataset.rank, text: a.textContent.trim(), h: em ? em.getBoundingClientRect().height : 0,
                fill: em ? getComputedStyle(em.querySelector('.cam-rank-shield')).fill : null,
                p: a.parentElement.querySelector('p').textContent}; }""")
            check(e['rank'] == 'leyenda' and e['text'] == 'ELeyenda CAM' and e['h'] >= 80 and e['fill'] == FILL[6], f'{tag} editar: {e}')
            check(e['p'] == 'Tu foto de perfil es tu inicial sobre el escudo de tu rango: cambia de color cada vez que subes.', f'{tag} editar: texto «{e["p"]}»')
            clean(page, tag + ' editar')
            shot(page, f'{tag}-editar')


def pending_case():
    with fp.full_page(fake_js=base(3), width=390, height=900) as page:
        page.evaluate("window.__fake.slow = 1500; document.dispatchEvent(new Event('ae:picks-updated')); openAeProfile()")
        page.wait_for_timeout(500)
        s = page.evaluate(FACE)
        check(s['rank'] == 'pending' and s['emblem'] == 'pending' and s['letter'] == 'E' and s['nameText'].strip() == '', f'pendiente: {s["rank"]} «{s["letter"]}» «{s["nameText"]}»')
        check(s['shield']['h'] >= 54, 'pendiente: el escudo neutro no guarda el tamaño')
        before = s['avatar']
        page.wait_for_timeout(1700)
        s = page.evaluate(FACE)
        check(s['rank'] == 'oro' and s['nameText'] == 'Oro', f'pendiente → {s["rank"]}')
        check(abs(s['avatar']['t'] - before['t']) <= 1 and abs(s['names']['l'] - page.evaluate(FACE)['names']['l']) <= 1, 'pendiente: algo se movió al llegar el rango')


# ---------- Resto de la web ----------
def leg(event, selection, sport, odds):
    return dict(event=event, selection=selection, sport=sport, odds=odds)


PICKS = [('tribuna_azteca', 1, 'Querétaro vs. Monterrey', 'Fútbol', 110, 3, 1),
         ('kingdom_chiefs', 2, 'Atlanta Falcons vs. Kansas City Chiefs', 'NFL', -175, 5, 0),
         ('madridista_en_serie', 3, 'Las Vegas Raiders vs. Seattle Seahawks', 'NFL', -278, 1, 2),
         ('reddevil_77', 4, 'Detroit Lions vs. New England Patriots', 'NFL', -130, 2, 0),
         ('flock_baltimore', 5, 'Minnesota Vikings vs. Buffalo Bills', 'NFL', -142, 4, 1),
         ('sin_rango_aun', 12, 'Chicago Bears vs. Green Bay Packers', 'NFL', 120, 2, 1)]
FEED = [{'id': U(100 + i), 'user_id': U(uid), 'author': a, 'title': t, 'explanation': 'Mi razonamiento.', 'legs': [leg(t, 'Gana', sp, odds)],
         'american_odds': odds, 'event_date': '2099-11-15', 'created_at': '2026-11-09T17:%02d:00Z' % (59 - i), 'moderation_status': 'approved',
         'outcome': 'pending', 'settled_at': None, 'result_points': 0, 'upvotes': up, 'downvotes': down, 'score': up - down,
         'comments_count': 0, 'my_vote': 0, 'is_current_week': True}
        for i, (a, uid, t, sp, odds, up, down) in enumerate(PICKS)]
TAKES = [{'id': U(300 + i), 'author_id': U(uid) if uid else None, 'author': a, 'title': t, 'body': 'Lo digo y lo sostengo.', 'sport': 'ligamx',
          'created_at': '2026-11-1%dT1%d:00:00Z' % (i % 2, i), 'upvotes': 2, 'downvotes': 1, 'my_vote': 0, 'hidden': False}
         for i, (a, uid, t) in enumerate([('tribuna_azteca', 1, 'El América gana la liguilla'), ('kingdom_chiefs', 2, 'Toluca no pasa de cuartos'),
                                          ('madridista_en_serie', 3, 'Cruz Azul es candidato'), ('anonimo', 0, 'Nadie para a Tigres')])]
RANKING = [{'side': side, 'rank_number': i + 1, 'user_id': U(uid), 'username': name, 'points': 30 - i * 3, 'resolved': 6, 'won': 4,
            'best_take_id': None, 'best_take_title': None}
           for side, rows in (('genios', [(21, 'genio_uno'), (22, 'genio_dos'), (1, 'tribuna_azteca')]), ('anoetos', [(23, 'anoeto_uno'), (5, 'flock_baltimore')]))
           for i, (uid, name) in enumerate(rows)]
REPLIES = [{'id': U(400 + i), 'take_id': TAKES[0]['id'], 'parent_id': None, 'author_id': U(uid), 'author': name, 'body': 'Respuesta ' + str(i),
            'created_at': '2026-11-10T1%d:00:00Z' % i, 'hidden': False} for i, (uid, name) in enumerate([(6, 'diamante_fan'), (9, 'bronce_fan')])]
QUINIELA = [{'rank_position': i + 1, 'user_id': U(uid), 'username': name, 'points': 20 - i * 3, 'hits': 8 - i, 'resolved': 10, 'accuracy': 80 - i * 10}
            for i, (uid, name) in enumerate([(6, 'diamante_fan'), (2, 'kingdom_chiefs'), (4, 'reddevil_77'), (23, 'anoeto_uno')])]
SITE = base(0) + ('window.__fake.tables = Object.assign(window.__fake.tables || {}, ' + json.dumps({'ae_pick_feed': FEED}) + ');'
                  'window.__fake.rpc.ae_public_take_feed = () => ({data: ' + json.dumps(TAKES) + ', error: null});'
                  'window.__fake.rpc.ae_home_take_point_extremes = () => ({data: ' + json.dumps(RANKING) + ', error: null});'
                  'window.__fake.rpc.ae_take_comment_thread = () => ({data: ' + json.dumps(REPLIES) + ', error: null});'
                  'window.__fake.rpc.cam_nfl_leaderboard = () => ({data: ' + json.dumps(QUINIELA) + ', error: null});'
                  'window.__fake.rpc.ae_pick_result_ranking = () => ({data: [{user_id: "' + U(8) + '", username: "greenbay_12", points: 9, won: 3, lost: 1, resolved: 4}], error: null});')

FACES = """sel => [...document.querySelectorAll(sel)].filter(n => n.getClientRects().length).map(n => {
  const em = n.querySelector('.cam-rank-emblem'), cs = getComputedStyle(n);
  const who = (n.parentElement.textContent.match(/@([\\p{L}\\p{N}_]+)/u) || [])[1] || '';
  const lt = em?.querySelector('.cam-rank-letter'), lb = lt?.getBoundingClientRect(), sb = em?.getBoundingClientRect();
  return {cls: n.className, rank: n.dataset.rank || null, face: n.dataset.rankFace ?? null, text: n.textContent.trim(),
    want: (who.match(/[\\p{L}\\p{N}]/u) || [''])[0].toUpperCase(), symbols: em ? em.querySelectorAll('.cam-rank-symbol').length : -1,
    centred: Boolean(lb && sb && Math.abs((lb.left + lb.right) / 2 - (sb.left + sb.right) / 2) <= 1.5 && lb.left > sb.left && lb.right < sb.right && lb.top > sb.top && lb.bottom < sb.bottom),
    fill: em ? getComputedStyle(em.querySelector('.cam-rank-shield')).fill : null,
    h: em ? Math.round(em.getBoundingClientRect().height) : 0, boxH: Math.round(n.getBoundingClientRect().height),
    bg: cs.backgroundImage + ' ' + cs.backgroundColor, border: cs.borderTopWidth};
})"""


def expect(n):
    return KEYS[LEVEL_OF.get(n, 0)]


def faces_ok(page, sel, t, minimum=1):
    rows = page.evaluate(FACES, sel)
    check(len(rows) >= minimum, f'{t}: {len(rows)} fotos visibles con {sel}')
    for r in rows:
        want = 'none' if not r['face'] else expect(int(r['face'][:8]))
        check('cam-rank-avatar' in r['cls'] and r['rank'] == want, f'{t}: foto {r["face"]} → {r["rank"]} (esperado {want})')
        check(r['want'] and r['text'] == r['want'] and r['symbols'] == 0 and r['centred'], f'{t}: inicial «{r["text"]}» (esperada «{r["want"]}»), símbolos {r["symbols"]}, centrada {r["centred"]}')
        check(r['h'] >= 16 and r['h'] <= r['boxH'] + 1, f'{t}: escudo de {r["h"]} px en caja de {r["boxH"]}')
        check(r['bg'].startswith('none') and r['bg'].endswith('rgba(0, 0, 0, 0)') and r['border'] == '0px', f'{t}: queda el círculo {r["bg"]} {r["border"]}')
        if want != 'none': check(r['fill'] == FILL[KEYS.index(want)], f'{t}: relleno {r["fill"]} para {want}')
    return rows


def identity_calls(page):
    return page.evaluate("window.__fake.calls.filter(c => c.rpc === 'cam_league_identities').map(c => c.args.p_users)")


def site_case(width, dark, tag):
    with fp.full_page(fake_js=SITE, dark=dark, width=width, height=900) as page:
        base_url = page.url.split('?')[0]
        # Inicio · clasificación de Takes.
        # (En el teléfono Inicio no muestra Genios / Anoetos; en el ordenador sí.)
        if width > 760:
            page.evaluate("document.getElementById('aeHomeTopTakes')?.scrollIntoView({block: 'center'})"); page.wait_for_timeout(900)
            faces_ok(page, '#aeHomeTopTakes .ae-points-avatar', tag + ' Inicio Takes', 5)
            shot(page, f'{tag}-inicio-takes')
        # Picks: tarjetas.
        page.goto(base_url + '?s=picks', wait_until='load'); page.wait_for_timeout(1600)
        page.evaluate("document.getElementById('cpFeed').scrollIntoView({block: 'start'})"); page.wait_for_timeout(700)
        rows = faces_ok(page, '#cpFeed .cam-pk-avatar', tag + ' Picks', 4)
        calls = identity_calls(page)
        asked = [u for c in calls for u in c]
        check(all(len(c) <= 50 for c in calls) and len(asked) == len(set(asked)), f'{tag} Picks: llamadas repetidas {calls}')
        badges = page.evaluate("[...document.querySelectorAll('#cpFeed .cam-author-rank')].map(b => [b.querySelectorAll('.cam-rank-emblem').length, b.querySelectorAll('.cam-top10-badge').length])")
        check(badges and all(e == 0 and t == 1 for e, t in badges), f'{tag} Picks: junto al nombre solo el Top 10 {badges}')
        clean(page, tag + ' Picks', '#communityPicks')
        shot(page, f'{tag}-picks')
        # Detalle del Pick.
        page.evaluate("window.aeOpenPickDetail(%s)" % json.dumps(FEED[0]['id'])); page.wait_for_timeout(1200)
        check(page.evaluate("Boolean(document.getElementById('cpDialog')?.open)"), f'{tag}: no abre el detalle del Pick')
        faces_ok(page, '#cpDialog .cp-feed-initial', tag + ' detalle del Pick')
        shot(page, f'{tag}-pick-detalle')
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        # Chefs: sin foto, el escudo va junto al nombre y es el rango de la persona (Oro).
        page.goto(base_url + '?s=picks&v=chefs', wait_until='load'); page.wait_for_timeout(1800)
        chef = page.evaluate("""() => [...document.querySelectorAll('.ae-chef-profile-link .cam-author-rank .cam-rank-emblem')].filter(n => n.getClientRects().length)
          .map(n => [n.dataset.rank, n.parentElement.title])""")
        if chef:
            check(all(r == 'oro' and title == 'Rango Oro' for r, title in chef), f'{tag} Chefs: {chef}')
        # Últimos Takes (Fútbol) y su conversación.
        page.goto(base_url + '?s=futbol&v=takes', wait_until='load'); page.wait_for_timeout(1800)
        page.evaluate("document.getElementById('freeTakesFeed')?.scrollIntoView({block: 'start'})"); page.wait_for_timeout(700)
        faces_ok(page, '#freeTakesFeed .cam-tk-avatar', tag + ' Últimos Takes', 3)
        clean(page, tag + ' Takes', '#freeTakesFeed')
        shot(page, f'{tag}-takes')
        page.evaluate("window.aeTakeReplies.open(%s)" % json.dumps(TAKES[0])); page.wait_for_timeout(1200)
        faces_ok(page, '#aeDiscussionAvatar', tag + ' conversación (autor)')
        faces_ok(page, '.ae-discussion-avatar', tag + ' conversación (respuestas)', 2)
        shot(page, f'{tag}-conversacion')
        # Clasificación de la Quiniela NFL (mensual).
        page.goto(base_url + '?s=nfl&v=quiniela', wait_until='load'); page.wait_for_timeout(1800)
        tab = page.locator('#camNflViewTabs button[data-view="month"]')
        if tab.count():
            tab.first.click(); page.wait_for_timeout(1500)
            page.evaluate("document.getElementById('camNflRanking')?.scrollIntoView({block: 'center'})"); page.wait_for_timeout(700)
            faces_ok(page, '#camNflRanking .cam-q-avatar', tag + ' Quiniela NFL', 4)
            badges = page.evaluate("[...document.querySelectorAll('#camNflRanking .cam-author-rank .cam-rank-emblem')].length")
            check(badges == 0, f'{tag} Quiniela NFL: escudo repetido junto al nombre ({badges})')
            shot(page, f'{tag}-quiniela-nfl')
        else:
            check(False, f'{tag}: no aparece la Quiniela NFL')
        check(not page.errors, f'{tag}: errores {page.errors[:2]}')


if __name__ == '__main__':
    if ONLY in (None, 'perfil'):
        for width, dark, levels in ((390, False, list(range(7))), (390, True, list(range(7))), (320, False, [3, 6]), (1366, False, [3, 6]), (1366, True, [6])):
            tag = f'{width}-{"noche" if dark else "dia"}'
            print('·', tag, 'perfil')
            profile_case(width, dark, levels, tag)
        print('· pendiente')
        pending_case()
    if ONLY in (None, 'sitio'):
        for width, dark in ((390, False), (390, True), (1366, False)):
            tag = f'{width}-{"noche" if dark else "dia"}'
            print('·', tag, 'sitio')
            site_case(width, dark, tag)
    if FAILS:
        print(f'\n{len(FAILS)} fallas'); sys.exit(1)
    print('OK · escudo del rango como foto: perfil de Cobre a Leyenda CAM, pendiente, editar, Inicio, Picks, Chefs, Takes y conversación; 320/390/1366, día y noche')
