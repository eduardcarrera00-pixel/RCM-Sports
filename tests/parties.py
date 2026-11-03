"""Parties: grupos privados con su propia clasificación (Picks o Takes).

Página completa en Chromium con tests/full-page.py y el Supabase falso de
tests/fake-supabase.js (sin red: nada llega a *.supabase.co). Las funciones
cam_party_* se imitan aquí con las mismas reglas que la base de datos; las
reglas reales (solo cuenta lo publicado tras entrar, RLS, límites…) se prueban
en SQL con tests/parties-sql.sh.

Cubre, a 390 y 1366 px, de día y de noche, sin errores de consola ni textos
cortados:
  · crear un party desde el perfil (y ver su código para invitar);
  · invitar y unirse por enlace (?party=CÓDIGO) con sesión y sin sesión
    (inicia sesión y vuelve sola a la invitación);
  · la clasificación solo cuenta lo publicado tras unirse; Este mes / Total;
  · la actividad, sus filtros (estado y miembro), «Ver más» y abrir un Pick/Take;
  · el perfil propio y el público, incluido ocultar un party del perfil;
  · las opciones del creador: renombrar, cambiar código, expulsar y borrar;
    y salir del party como miembro;
  · la moderación: un administrador ve todos los parties y borra uno ajeno.

Uso: python3 -B tests/parties.py [--shots DIR] [--only 390-light]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
ONLY = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

USERS = {
    'ana': 'a0000000-0000-4000-8000-000000000001',
    'beto': 'a0000000-0000-4000-8000-000000000002',
    'carla': 'a0000000-0000-4000-8000-000000000003',
    'dani': 'a0000000-0000-4000-8000-000000000004',
}

# Modelo en memoria de cam_parties / cam_party_members y de los Picks/Takes.
MODEL = r"""
(() => {
const F = window.__fake;
F.rpc = F.rpc || {}; F.tables = F.tables || {}; F.calls = F.calls || [];
const U = %(users)s;
const NAMES = {ana:'ana', beto:'beto_crack', carla:'carla', dani:'dani_el_del_parlay_de_los_domingos'};
const byId = Object.fromEntries(Object.entries(U).map(([k, id]) => [id, k]));
const day = 864e5, now = Date.now();
const D = d => new Date(now - d * day).toISOString();
const asUser = k => ({id: U[k], email: k + '@x.test', is_anonymous: false, user_metadata: {username: NAMES[k]}});
F.asUser = asUser; F.U = U;
F.user = F.start ? asUser(F.start) : null;
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
F.parties = [
  {id: 'f1000000-0000-4000-8000-000000000001', name: 'Los del barrio ⚽', kind: 'picks', sport: 'football', code: 'K7M2QX', owner_id: U.ana,
   members: [{user_id: U.ana, joined_at: D(40), show: true}, {user_id: U.dani, joined_at: D(30), show: true}, {user_id: U.beto, joined_at: D(10), show: true}]},
  {id: 'f2000000-0000-4000-8000-000000000002', name: 'Takes de la oficina', kind: 'takes', sport: 'all', code: 'T4KESZ', owner_id: U.beto,
   members: [{user_id: U.beto, joined_at: D(20), show: true}, {user_id: U.ana, joined_at: D(15), show: true}]}
];
const leg = (event, selection, sport = 'Fútbol') => [{event, selection, sport}];
F.items = [
  {type: 'pick', id: 'c1000000-0000-4000-8000-000000000001', user: 'beto', title: 'Clásico sin goles', legs: leg('Barcelona vs Real Madrid', 'Menos de 0.5 goles'), american_odds: 300, state: 'won', points: 3, created_at: D(15), month: true},
  {type: 'pick', id: 'c1000000-0000-4000-8000-000000000002', user: 'beto', title: 'Barça gana en Montjuïc', legs: leg('Barcelona vs Sevilla', 'Barcelona gana'), american_odds: 240, state: 'won', points: 2.4, created_at: D(5), month: true},
  {type: 'pick', id: 'c1000000-0000-4000-8000-000000000003', user: 'beto', title: 'Over 2.5 en Anfield', legs: leg('Liverpool vs Arsenal', 'Más de 2.5 goles'), american_odds: 150, state: 'pending', created_at: D(2)},
  {type: 'pick', id: 'c1000000-0000-4000-8000-000000000004', user: 'ana', title: 'PSG gana y ambos anotan', legs: leg('PSG vs Barcelona', 'PSG · Ambos anotan'), american_odds: 240, state: 'won', points: 2.4, created_at: D(20), month: true},
  {type: 'pick', id: 'c1000000-0000-4000-8000-000000000005', user: 'ana', title: 'Empate en el derbi', legs: leg('Atlético vs Real Madrid', 'Empate'), american_odds: 190, state: 'lost', points: -1.9, created_at: D(8), month: true},
  {type: 'pick', id: 'c1000000-0000-4000-8000-000000000006', user: 'ana', title: 'Toluca gana el Apertura', legs: leg('Toluca vs Cruz Azul', 'Toluca'), american_odds: 300, state: 'won', points: 3, created_at: D(35), month: false},
  {type: 'pick', id: 'c1000000-0000-4000-8000-000000000007', user: 'ana', title: 'Chiefs cubren el spread', legs: leg('Chiefs vs Bills', 'Chiefs -3.5', 'NFL'), american_odds: 110, state: 'won', points: 1.1, created_at: D(6), month: true},
  {type: 'take', id: 'd1000000-0000-4000-8000-000000000001', user: 'beto', title: 'El Madrid gana la Champions', body: 'Con Mbappé en este nivel no hay rival en Europa. Lo digo desde octubre.', sport: 'champions', competition: 'Champions League', state: 'won', points: 13, created_at: D(10), month: true},
  {type: 'take', id: 'd1000000-0000-4000-8000-000000000002', user: 'ana', title: 'Mbappé será Pichichi', body: 'Más de 30 goles en LaLiga, y sin penaltis de por medio.', sport: 'laliga', competition: 'LaLiga', state: 'pending', created_at: D(12)},
  {type: 'champion', id: 'e1000000-0000-4000-8000-000000000001', user: 'ana', title: 'Campeón · Arsenal', body: '¿Quién será campeón de la Premier 2026/27?', competition: 'premier', state: 'pending', points: 9, created_at: D(14)},
  {type: 'take', id: 'd1000000-0000-4000-8000-000000000003', user: 'ana', title: 'Lamine gana el Balón de Oro', body: 'Publicado antes de entrar al party: no cuenta aquí.', sport: 'general', state: 'won', points: 20, created_at: D(18), month: true}
];
// Dani: 22 Picks pendientes publicados tras entrar, para probar «Ver más».
for (let i = 1; i <= 22; i++) F.items.push({type: 'pick', id: 'c2000000-0000-4000-8000-' + String(i).padStart(12, '0'), user: 'dani', title: 'Parlay del domingo ' + i, legs: [...leg('Real Sociedad vs Betis', 'Ambos anotan'), ...leg('Valencia vs Getafe', 'Valencia gana')], american_odds: 450 + i, state: 'pending', created_at: D(28 - i)});
F.codes = ['NEWPTY', 'CHG234', 'XYZ789'];
F.events = [];

const me = () => F.user?.id || null;
const need = () => { if (!me()) throw Error('Inicia sesión para usar los parties.'); return me(); };
const party = id => F.parties.find(p => p.id === id);
const member = (p, u) => p?.members.find(m => m.user_id === u);
const ok = data => ({data, error: null});
const isAdmin = () => Boolean(F.admin) && me() === U.ana;
const sportOf = it => it.type === 'pick' ? (it.legs.every(l => l.sport === 'NFL') ? 'nfl' : it.legs.every(l => l.sport === 'Fútbol') ? 'football' : 'other')
  : it.sport === 'nfl' ? 'nfl' : ['football', 'laliga', 'premier', 'ligamx', 'champions'].includes(it.sport || it.competition) ? 'football' : 'other';
function counted(p, m, it) {
  const kindOk = p.kind === 'picks' ? it.type === 'pick' : it.type !== 'pick';
  return kindOk && U[it.user] === m.user_id && it.created_at >= m.joined_at && (p.sport === 'all' || sportOf(it) === p.sport);
}
function standings(p, period) {
  const rows = p.members.map(m => {
    const done = F.items.filter(it => counted(p, m, it) && ['won', 'lost', 'void'].includes(it.state) && (period === 'all' || it.month));
    return {user_id: m.user_id, username: NAMES[byId[m.user_id]] || 'Aficionado', joined_at: m.joined_at,
      points: Math.round(done.reduce((s, it) => s + (Number(it.points) || 0), 0) * 100) / 100,
      correct: done.filter(it => it.state === 'won').length, attempts: done.length,
      is_owner: m.user_id === p.owner_id, is_me: m.user_id === me()};
  });
  rows.sort((a, b) => b.points - a.points || b.correct - a.correct || a.joined_at.localeCompare(b.joined_at));
  rows.forEach((r, i) => r.position = i + 1);
  return rows;
}
const header = p => ({id: p.id, name: p.name, kind: p.kind, sport: p.sport, code: p.code, owner_id: p.owner_id,
  member_count: p.members.length, max_members: 50, is_owner: p.owner_id === me(), is_member: Boolean(member(p, me())),
  is_admin: isAdmin(), show_on_profile: member(p, me())?.show ?? null, created_at: D(40)});
const summary = (p, u) => { const r = standings(p, 'all').find(x => x.user_id === u); return {position: r?.position || null, member_count: p.members.length, points: r?.points || 0}; };
function drop(p, u) {
  p.members = p.members.filter(m => m.user_id !== u);
  if (!p.members.length) F.parties = F.parties.filter(x => x !== p);
  else if (p.owner_id === u) p.owner_id = [...p.members].sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0].user_id;
}
const findCode = c => F.parties.find(p => p.code === String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''));
Object.assign(F.rpc, {
  cam_party_mine: () => ok(me() ? F.parties.filter(p => member(p, me())).map(p => ({id: p.id, name: p.name, kind: p.kind, sport: p.sport, code: p.code,
    is_owner: p.owner_id === me(), show_on_profile: member(p, me()).show, joined_at: member(p, me()).joined_at, ...summary(p, me())})) : []),
  cam_party_public_list: ({p_user}) => ok(F.parties.filter(p => member(p, p_user)?.show).map(p => ({id: member(p, me()) ? p.id : null,
    name: p.name, kind: p.kind, sport: p.sport, ...summary(p, p_user)}))),
  cam_party_preview: ({p_code}) => { const p = findCode(p_code); if (!p) return ok({status: 'not_found'});
    return ok({status: 'ok', name: p.name, kind: p.kind, sport: p.sport, member_count: p.members.length, max_members: 50,
      is_full: p.members.length >= 50, is_member: Boolean(member(p, me())), id: member(p, me()) ? p.id : null}); },
  cam_party_join: ({p_code}) => { const u = need(); const p = findCode(p_code); if (!p) throw Error('Ese código no es válido o el party ya no existe.');
    if (member(p, u)) return ok({id: p.id, already: true});
    p.members.push({user_id: u, joined_at: new Date().toISOString(), show: true}); F.events.push('join:' + byId[u]); return ok({id: p.id, already: false}); },
  cam_party_create: ({p_name, p_kind, p_sport}) => { const u = need(); const p = {id: 'f9000000-0000-4000-8000-00000000000' + (F.parties.length + 1), name: p_name, kind: p_kind, sport: p_sport || 'all',
    code: F.codes.shift(), owner_id: u, members: [{user_id: u, joined_at: new Date().toISOString(), show: true}]}; F.parties.push(p); return ok({id: p.id, code: p.code}); },
  cam_party_ranking: ({p_party}) => { const p = party(p_party); if (!p || !(member(p, me()) || isAdmin())) throw Error('Solo los miembros pueden ver este party.');
    return ok({party: header(p), month: standings(p, 'month'), total: standings(p, 'all')}); },
  cam_party_activity: ({p_party, p_filter = 'all', p_member, p_before, p_before_key, p_limit = 20}) => {
    const p = party(p_party); if (!p || !(member(p, me()) || isAdmin())) throw Error('Solo los miembros pueden ver este party.');
    let rows = F.items.filter(it => p.members.some(m => counted(p, m, it)))
      .filter(it => !p_member || U[it.user] === p_member)
      .filter(it => p_filter === 'all' || (p_filter === 'resolved') === (it.state !== 'pending'))
      .map(it => ({...it, key: it.id, user_id: U[it.user], username: NAMES[it.user], legs_count: it.legs?.length || 0,
        upvotes: 3, downvotes: 1, my_vote: null, moderation_status: 'approved', points: it.state === 'pending' && it.type !== 'champion' ? null : it.points}))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.key.localeCompare(a.key));
    if (p_before) rows = rows.filter(r => r.created_at < p_before || (r.created_at === p_before && r.key < p_before_key));
    return ok({items: rows.slice(0, p_limit), more: rows.length > p_limit}); },
  cam_party_set_visibility: ({p_party, p_show}) => { member(party(p_party), need()).show = p_show; return ok({show_on_profile: p_show}); },
  cam_party_rename: ({p_party, p_name}) => { const p = party(p_party); if (p.owner_id !== need()) throw Error('Solo quien administra el party puede hacer esto.'); p.name = p_name; return ok({name: p_name}); },
  cam_party_new_code: ({p_party}) => { const p = party(p_party); if (p.owner_id !== need()) throw Error('Solo quien administra el party puede hacer esto.'); p.code = F.codes.shift(); return ok({code: p.code}); },
  cam_party_kick: ({p_party, p_user}) => { const p = party(p_party); if (p.owner_id !== need()) throw Error('Solo quien administra el party puede hacer esto.'); drop(p, p_user); return ok({kicked: true}); },
  cam_party_leave: ({p_party}) => { const p = party(p_party); drop(p, need()); return ok({left: true, deleted: !party(p_party)}); },
  cam_party_delete: ({p_party}) => { const p = party(p_party); if (p.owner_id !== need() && !isAdmin()) throw Error('Solo quien administra el party puede borrarlo.');
    F.parties = F.parties.filter(x => x !== p); return ok({deleted: true}); },
  cam_party_admin_list: () => ok(F.parties.map(p => ({id: p.id, name: p.name, kind: p.kind, sport: p.sport, member_count: p.members.length, owner_name: NAMES[byId[p.owner_id]], created_at: D(40)})))
});
// Datos que usan las vistas existentes al abrir un Pick o un perfil.
F.tables.ae_pick_feed = F.items.filter(it => it.type === 'pick').map(it => ({id: it.id, user_id: U[it.user], author: NAMES[it.user], title: it.title,
  explanation: '', legs: it.legs, american_odds: it.american_odds, created_at: it.created_at, hidden: false, moderation_status: 'approved',
  outcome: it.state, result_points: it.points || 0, upvotes: 0, downvotes: 0, score: 0, my_vote: 0, comments_count: 0}));
F.rpc.ae_my_free_takes = () => ok([]);
F.rpc.ae_public_take_profile = ({p_author_id}) => ok(F.items.filter(it => it.type === 'take' && U[it.user] === p_author_id).map(it => ({id: it.id, author_id: U[it.user], author: NAMES[it.user], sport: it.sport, title: it.title, body: it.body, created_at: it.created_at, upvotes: 0, downvotes: 0, my_vote: null})));
F.rpc.ae_take_prestige = () => ok([]);
F.rpc.ae_take_legendary = () => ok([]);
F.rpc.ae_user_champion_picks = () => ok([]);
F.rpc.ae_my_profile_unpopular_take = () => ok(null);
})();
""" % {'users': json.dumps(USERS)}


# Detector de textos cortados: cajas con overflow que cortan un texto (salvo
# los «…» y los resúmenes de 2 líneas, que recortan a propósito) y elementos
# que se salen de la pantalla.
CLIPPED = r"""(selector) => {
  const out = [];
  for (const root of document.querySelectorAll(selector)) {
    if (!root.getClientRects().length) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode: n => n.textContent.trim() ? 1 : 2});
    while (walker.nextNode()) {
      const t = walker.currentNode, host = t.parentElement;
      if (!host || !host.getClientRects().length || getComputedStyle(host).visibility === 'hidden') continue;
      if (host.closest('option, select')) continue;
      const range = document.createRange(); range.selectNodeContents(t);
      const rects = [...range.getClientRects()].filter(r => r.width > 0.5 && r.height > 0.5);
      let visibleBox = null;  // caja que recorta el texto («…»): lo que se ve es eso
      for (let a = host; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (s.overflowY === 'auto' || s.overflowY === 'scroll' || a.tagName === 'DIALOG') break;
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
          const b = a.getBoundingClientRect();
          const l = b.left + a.clientLeft, top = b.top + a.clientTop, r = l + a.clientWidth, bot = top + a.clientHeight;
          const intended = s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none');
          if (!visibleBox) visibleBox = {left: l, right: r};
          for (const q of rects) {
            const vertical = q.top < top - 0.75 || q.bottom > bot + 0.75;
            const horizontal = q.left < l - 0.75 || q.right > r + 0.75;
            if ((vertical || horizontal) && !intended) out.push((a.className || a.tagName) + ' corta «' + t.textContent.trim().slice(0, 40) + '»');
            if (intended && vertical && rects.indexOf(q) === 0) out.push((a.className || a.tagName) + ' corta la primera línea de «' + t.textContent.trim().slice(0, 40) + '»');
          }
        }
        if (a === root) break;
      }
      for (const q of rects) {
        const left = visibleBox ? Math.max(q.left, visibleBox.left) : q.left;
        const right = visibleBox ? Math.min(q.right, visibleBox.right) : q.right;
        if (right > innerWidth + 1 || left < -1) out.push('fuera de la pantalla: «' + t.textContent.trim().slice(0, 40) + '»');
      }
    }
  }
  return [...new Set(out)];
}"""
SELECTOR = '#camParty, #camProfileParties, .cam-party-entry-row'


def check_clean(page, where):
    bad = page.evaluate(CLIPPED, SELECTOR)
    assert not bad, (where, bad)
    assert not page.errors, (where, page.errors)


def shot(page, name):
    if SHOTS:
        page.screenshot(path=str(SHOTS / f'{name}.png'))


def calls(page, name):
    return page.evaluate(f"window.__fake.calls.filter(c => c.rpc === {name!r})")


def open_page(fake, dark, width, url=''):
    height = 844 if width < 700 else 900
    ctx = fp.full_page(fake_js='window.__fake=window.__fake||{};' + fake + MODEL, dark=dark, width=width, height=height)
    page = ctx.__enter__()
    page._ctx = ctx
    if url:
        page.evaluate(f"history.replaceState(null, '', {url!r})")
    return page


def close(page):
    page._ctx.__exit__(None, None, None)


def goto(page, query):
    """Recarga la página con unos parámetros (como abrir un enlace)."""
    base = page.url.split('?')[0]
    page.goto(base + query, wait_until='load')
    page.wait_for_timeout(1500)


def visible(page, sel):
    return page.locator(sel).first.is_visible()


def scenario_create_and_ranking(dark, width, tag):
    page = open_page("window.__fake.start='ana';", dark, width)
    try:
        # Perfil propio · pestaña Picks: bloque «Parties» con posición y botones.
        page.evaluate("window.openAeProfile()")
        page.wait_for_selector('#camProfileParties', state='visible', timeout=8000)
        assert 'MIS TAKES' in page.inner_text('#aeProfileTabs').upper()
        page.click('#aeProfileTabTakes')
        page.wait_for_timeout(300)
        txt = page.inner_text('#camProfileParties')
        assert 'Takes de la oficina' in txt and 'Los del barrio' not in txt, txt
        page.click('#aeProfileTabPicks')
        page.wait_for_timeout(300)
        txt = page.inner_text('#camProfileParties')
        assert 'Los del barrio ⚽' in txt and '1.º' in txt and 'de 3' in txt, txt
        assert 'Crear party' in txt and 'Unirme con código' in txt
        assert len(calls(page, 'cam_party_mine')) == 1, 'una sola llamada al abrir el perfil'
        page.evaluate("document.getElementById('camProfileParties').scrollIntoView({block:'center'})")
        page.wait_for_timeout(250)
        check_clean(page, tag + ' perfil propio')
        shot(page, f'{tag}-perfil-propio')

        # Crear party desde el perfil.
        page.click('#camProfileParties >> text=Crear party')
        page.wait_for_selector('#camPartyName', state='visible')
        assert page.locator('#camParty [data-value="picks"]').get_attribute('aria-pressed') == 'true'
        page.fill('#camPartyName', 'ab')
        page.click('#camParty button[type=submit]')
        assert 'entre 3 y 40' in page.inner_text('#camParty .cam-party-error')
        page.fill('#camPartyName', '  Liga   del curro 🍻  ')
        assert page.inner_text('#camPartyNameCount') == '16/40', page.inner_text('#camPartyNameCount')
        page.click('#camParty [data-value="football"]')
        check_clean(page, tag + ' crear')
        shot(page, f'{tag}-crear')
        page.click('#camParty button[type=submit]')
        page.wait_for_selector('#camParty .cam-party-code', state='visible')
        create = calls(page, 'cam_party_create')[-1]['args']
        assert create == {'p_name': 'Liga del curro 🍻', 'p_kind': 'picks', 'p_sport': 'football'}, create
        assert page.inner_text('#camParty .cam-party-code') == 'NEWPTY'
        assert page.inner_text('#camParty .cam-party-url') == 'https://camsports.github.io/?party=NEWPTY'
        check_clean(page, tag + ' invitar')
        shot(page, f'{tag}-invitar')
        page.click('#camParty .cam-party-sheet button[aria-label=Cerrar]')
        assert page.inner_text('#camPartyTitle') == 'Liga del curro 🍻'

        # Party existente: clasificación. Beto entró hace 10 días: su Pick de hace
        # 15 días no cuenta; el de hace 5 sí. El Pick NFL de Ana no cuenta en Fútbol.
        page.evaluate("window.camParties.openParty('f1000000-0000-4000-8000-000000000001','hub')")
        page.wait_for_selector('#camPartyBoard .cam-party-row')
        rows = page.eval_on_selector_all('#camPartyBoard .cam-party-row', "rs => rs.map(r => r.innerText.replace(/\\s+/g,' ').trim().toLowerCase())")
        assert rows[0].startswith('1 b @beto_crack') and '+2,40' in rows[0] and '1/1 aciertos' in rows[0], rows
        assert '@ana' in rows[1] and '+0,50' in rows[1] and '1/2 aciertos' in rows[1] and 'creador' in rows[1], rows
        assert 'sin resultados' in rows[2] and '0,00' in rows[2], rows
        assert page.locator('#camPartyBoard .cam-party-row.is-me').count() == 1
        page.click('#camPartyBoard .cam-party-seg-btn >> text="Total"')
        rows = page.eval_on_selector_all('#camPartyBoard .cam-party-row', "rs => rs.map(r => r.innerText.replace(/\\s+/g,' ').trim().toLowerCase())")
        assert '@ana' in rows[0] and '+3,50' in rows[0] and '2/3 aciertos' in rows[0], rows
        assert len(calls(page, 'cam_party_ranking')) == 2, 'Este mes / Total no vuelven a llamar'
        page.click('#camPartyBoard .cam-party-seg-btn >> text="Este mes"')
        check_clean(page, tag + ' clasificación')
        shot(page, f'{tag}-party-clasificacion')

        # Tocar a un miembro abre su actividad dentro del party.
        # Toque en la fila (fuera del @nombre, que lleva al perfil).
        page.click('#camPartyBoard .cam-party-row:nth-child(1) .cam-party-row-open', position={'x': 6, 'y': 6})
        page.wait_for_selector('#camPartyFeed .cam-party-item')
        assert page.locator('#camPartyTabActivity').get_attribute('aria-selected') == 'true'
        titles = page.eval_on_selector_all('#camPartyFeed .cam-party-item-title', 'ns => ns.map(n => n.textContent)')
        assert titles == ['Over 2.5 en Anfield', 'Barça gana en Montjuïc'], titles
        last = calls(page, 'cam_party_activity')[-1]['args']
        assert last['p_member'] == USERS['beto'] and last['p_filter'] == 'all', last
        # Filtros de estado.
        page.click('#camPartyFeed .cam-party-seg-btn >> text="Resueltos"')
        page.wait_for_function("document.querySelectorAll('#camPartyFeed .cam-party-item').length === 1")
        assert 'Acertado · +2,40 pts' in page.inner_text('#camPartyFeed .cam-party-item')
        page.click('#camPartyFeed .cam-party-seg-btn >> text="Pendientes"')
        page.wait_for_function("document.querySelector('#camPartyFeed .cam-party-item-title')?.textContent === 'Over 2.5 en Anfield'")
        assert 'Pendiente · Cuota +150' in page.inner_text('#camPartyFeed .cam-party-item')
        # Todos los miembros + «Ver más» (de 20 en 20).
        page.select_option('#camPartyMember', '')
        page.click('#camPartyFeed .cam-party-seg-btn >> text="Todos"')
        page.wait_for_function("document.querySelectorAll('#camPartyFeed .cam-party-item').length === 20")
        assert visible(page, '#camPartyFeed .cam-party-btn >> text="Ver más"')
        page.evaluate("document.querySelector('#camPartyFeed .cam-party-item').scrollIntoView({block:'start'})")
        check_clean(page, tag + ' actividad')
        shot(page, f'{tag}-party-actividad')
        page.click('#camPartyFeed .cam-party-btn >> text="Ver más"')
        page.wait_for_function("document.querySelectorAll('#camPartyFeed .cam-party-item').length === 27")
        titles = page.eval_on_selector_all('#camPartyFeed .cam-party-item-title', 'ns => ns.map(n => n.textContent)')
        assert 'Clásico sin goles' not in titles and 'Chiefs cubren el spread' not in titles, titles
        assert page.locator('#camPartyFeed .cam-party-btn >> text="Ver más"').count() == 0
        # Una tarjeta abre la vista del Pick que ya existe.
        page.click('#camPartyFeed .cam-party-item >> text=Barça gana en Montjuïc')
        page.wait_for_function("new URL(location.href).searchParams.get('pick') === 'c1000000-0000-4000-8000-000000000002'")
        page.wait_for_selector('#cpDialog[open]')
        page.evaluate("document.getElementById('cpDialog').close()")
        page.wait_for_timeout(200)
        assert visible(page, '#camParty[open]'), 'el party sigue abierto debajo'
        check_clean(page, tag + ' tras abrir un Pick')
    finally:
        close(page)


def scenario_takes_and_creator(dark, width, tag):
    page = open_page("window.__fake.start='beto';", dark, width)
    try:
        # Party de Takes (Beto es el creador): un Take abre su conversación.
        page.evaluate("window.camParties.openHub('takes','all')")
        page.wait_for_selector('#camParty .cam-party-card')
        assert page.locator('#camParty .cam-party-seg-btn[aria-pressed=true]').inner_text() == 'Takes'
        check_clean(page, tag + ' mis parties')
        shot(page, f'{tag}-mis-parties')
        page.click('#camParty .cam-party-card >> text=Takes de la oficina')
        page.wait_for_selector('#camPartyBoard .cam-party-row')
        rows = page.eval_on_selector_all('#camPartyBoard .cam-party-row', "rs => rs.map(r => r.innerText.replace(/\\s+/g,' ').trim().toLowerCase())")
        # El Take de Ana de hace 18 días es anterior a su entrada (15 días): no suma 20.
        assert '@beto_crack' in rows[0] and ' 13 ' in rows[0] and '@ana' in rows[1] and 'sin resultados' in rows[1], rows
        page.click('#camPartyTabActivity')
        page.wait_for_selector('#camPartyFeed .cam-party-item')
        titles = page.eval_on_selector_all('#camPartyFeed .cam-party-item-title', 'ns => ns.map(n => n.textContent)')
        assert titles == ['El Madrid gana la Champions', 'Mbappé será Pichichi', 'Campeón · Arsenal'], titles
        assert 'Pendiente · vale 9 pts' in page.inner_text('#camPartyFeed')
        page.click('#camPartyFeed .cam-party-item >> text=Mbappé será Pichichi')
        page.wait_for_selector('#aeTakeDiscussion[open]')
        assert 'Mbappé será Pichichi' in page.inner_text('#aeTakeDiscussion')
        page.evaluate("document.getElementById('aeTakeDiscussion').close()")
        page.wait_for_timeout(200)

        # Opciones del creador: renombrar, cambiar código, expulsar.
        page.click('#camPartyMenu')
        page.wait_for_selector('#camParty .cam-party-sheet')
        menu = page.inner_text('#camParty .cam-party-sheet')
        for label in ('Mostrar en mi perfil', 'Renombrar', 'Cambiar código', 'Miembros', 'Salir del party', 'Borrar party'):
            assert label in menu, (label, menu)
        check_clean(page, tag + ' menú')
        shot(page, f'{tag}-menu-creador')
        page.click('#camParty .cam-party-sheet >> text=Renombrar')
        page.fill('#camPartyRename', 'La oficina 📎')
        page.click('#camParty .cam-party-sheet button[type=submit]')
        page.wait_for_function("document.getElementById('camPartyTitle')?.textContent === 'La oficina 📎'")
        page.click('#camPartyMenu')
        page.click('#camParty .cam-party-sheet >> text=Cambiar código')
        page.click('#camParty .cam-party-sheet .cam-party-btn >> text=Cambiar código')
        page.wait_for_selector('#camParty .cam-party-code')
        assert page.inner_text('#camParty .cam-party-code') == 'NEWPTY'
        assert page.evaluate("window.__fake.rpc.cam_party_preview({p_code:'T4KESZ'}).data.status") == 'not_found', 'el enlace viejo deja de valer'
        page.click('#camParty .cam-party-sheet button[aria-label=Cerrar]')
        page.click('#camPartyMenu')
        page.click('#camParty .cam-party-sheet >> text=Miembros')
        page.wait_for_selector('#camParty .cam-party-member')
        check_clean(page, tag + ' miembros')
        page.click('#camParty .cam-party-member >> text=Expulsar')
        page.click('#camParty .cam-party-sheet .cam-party-btn.is-danger >> text=Expulsar')
        page.wait_for_function("document.querySelector('#camParty .cam-party-members')?.textContent === '1 miembro'")
        page.click('#camPartyTabRanking')
        assert page.locator('#camPartyBoard .cam-party-row').count() == 1

        # Borrar el party (vuelve a «Mis parties»).
        page.click('#camPartyMenu')
        page.click('#camParty .cam-party-sheet >> text=Borrar party')
        page.click('#camParty .cam-party-sheet .cam-party-btn.is-danger >> text="Borrar"')
        page.wait_for_function("document.getElementById('camPartyTitle')?.textContent === 'Mis parties'")
        page.wait_for_function("document.querySelector('#camParty .cam-party-list')?.textContent === 'Aún no estás en ningún party de Takes.'")
        assert page.evaluate("window.__fake.parties.length") == 1

        # Como miembro (no creador): salir del party de Picks.
        page.click('#camParty .cam-party-seg-btn >> text="Picks"')
        page.click('#camParty .cam-party-card >> text=Los del barrio ⚽')
        page.wait_for_selector('#camPartyBoard .cam-party-row')
        page.click('#camPartyMenu')
        menu = page.inner_text('#camParty .cam-party-sheet')
        assert 'Renombrar' not in menu and 'Borrar party' not in menu and 'Salir del party' in menu, menu
        page.click('#camParty .cam-party-sheet >> text=Salir del party')
        page.click('#camParty .cam-party-sheet .cam-party-btn.is-danger >> text="Salir"')
        page.wait_for_function("document.getElementById('camPartyTitle')?.textContent === 'Mis parties'")
        assert page.evaluate("window.__fake.parties[0].members.length") == 2
        check_clean(page, tag + ' tras salir')
    finally:
        close(page)


def scenario_invite(dark, width, tag):
    # Con sesión: Carla abre el enlace y se une.
    page = open_page("window.__fake.start='carla';", dark, width)
    try:
        goto(page, '?party=K7M2QX')
        page.wait_for_selector('#camPartyJoin', state='visible', timeout=8000)
        assert page.inner_text('#camParty .cam-party-kicker').strip().lower() == 'te invitaron a'
        assert page.inner_text('#camPartyTitle') == 'Los del barrio ⚽'
        chips = page.inner_text('#camParty .cam-party-chips')
        assert 'Picks' in chips and 'Fútbol' in chips and '3 miembros' in chips, chips
        assert not page.evaluate("document.getElementById('camWelcomeDialog')?.open"), 'la bienvenida no tapa la invitación'
        check_clean(page, tag + ' invitación')
        shot(page, f'{tag}-invitacion')
        page.click('#camPartyJoin')
        page.wait_for_selector('#camPartyBoard .cam-party-row')
        assert 'party' not in page.url, page.url
        rows = page.eval_on_selector_all('#camPartyBoard .cam-party-row', "rs => rs.map(r => r.innerText.replace(/\\s+/g,' ').trim().toLowerCase())")
        assert len(rows) == 4 and '@carla' in rows[-1] and 'sin resultados' in rows[-1], rows
    finally:
        close(page)

    # Sin sesión: Unirme → iniciar sesión → vuelve sola a la invitación.
    page = open_page('', dark, width)
    try:
        page.route('**/functions/v1/username-auth', lambda r: r.fulfill(status=200, content_type='application/json',
                   body=json.dumps({'session': {'access_token': 'a', 'refresh_token': 'b'}, 'username': 'dani_el_del_parlay_de_los_domingos'})))
        goto(page, '?party=k7m2qx')
        page.evaluate("""() => {
          db.supabaseUrl = 'https://supabase.test'; db.supabaseKey = 'clave-de-prueba';
          db.auth.setSession = async () => { window.__fake.user = window.__fake.asUser('dani'); return {data: {user: window.__fake.user}, error: null}; };
        }""")
        page.wait_for_selector('#camPartyJoin', state='visible', timeout=8000)
        page.click('#camPartyJoin')
        page.wait_for_selector('#userAuthModal:not(.hidden)')
        assert not page.evaluate("document.getElementById('camParty').open")
        page.click('#aeAuthMiniOk')
        assert 'volverás a la invitación' in page.inner_text('#aeAuthPublishHint')
        page.fill('#userAuthUsername', 'dani')
        page.fill('#userAuthPassword', 'secreto123')
        page.click('#authSubmit')
        # Dani ya era miembro: al volver, la invitación ofrece abrir el party.
        page.wait_for_selector('#camParty .cam-party-btn >> text="Abrir party"', timeout=8000)
        assert page.inner_text('#camPartyTitle') == 'Los del barrio ⚽'
        page.click('#camParty .cam-party-btn >> text="Abrir party"')
        page.wait_for_selector('#camPartyBoard .cam-party-row')
        assert 'party' not in page.url
    finally:
        close(page)


def scenario_invite_login_new_member(dark, width, tag):
    # Igual que arriba pero con alguien que no es miembro (Carla): se une al volver.
    page = open_page('', dark, width)
    try:
        page.route('**/functions/v1/username-auth', lambda r: r.fulfill(status=200, content_type='application/json',
                   body=json.dumps({'session': {'access_token': 'a', 'refresh_token': 'b'}, 'username': 'carla'})))
        goto(page, '?party=K7M2QX')
        page.evaluate("""() => {
          db.supabaseUrl = 'https://supabase.test'; db.supabaseKey = 'clave-de-prueba';
          db.auth.setSession = async () => { window.__fake.user = window.__fake.asUser('carla'); return {data: {user: window.__fake.user}, error: null}; };
        }""")
        page.wait_for_selector('#camPartyJoin', state='visible', timeout=8000)
        page.click('#camPartyJoin')
        page.wait_for_selector('#userAuthModal:not(.hidden)')
        page.click('#aeAuthMiniOk')
        page.fill('#userAuthUsername', 'carla')
        page.fill('#userAuthPassword', 'secreto123')
        page.click('#authSubmit')
        page.wait_for_selector('#camPartyJoin', state='visible', timeout=8000)
        page.click('#camPartyJoin')
        page.wait_for_selector('#camPartyBoard .cam-party-row')
        assert page.evaluate("window.__fake.events").count('join:carla') == 1
        assert 'party' not in page.url
        check_clean(page, tag + ' unirse tras iniciar sesión')
    finally:
        close(page)


def scenario_public_profile(dark, width, tag):
    page = open_page("window.__fake.start='beto';", dark, width)
    try:
        # Beto ve el perfil público de Ana: nombre, tipo y posición de sus parties.
        page.evaluate(f"window.openAePublicProfile({USERS['ana']!r}, true, 'picks')")
        page.wait_for_selector('#camProfileParties .cam-party-card', timeout=8000)
        txt = page.inner_text('#camProfileParties')
        assert 'Los del barrio ⚽' in txt and '1.º' in txt and 'de 3' in txt, txt
        assert 'Crear party' not in txt
        page.evaluate("document.getElementById('camProfileParties').scrollIntoView({block:'center'})")
        page.wait_for_timeout(250)
        check_clean(page, tag + ' perfil público')
        shot(page, f'{tag}-perfil-publico')
        page.evaluate("window.closeAeProfile()")
    finally:
        close(page)

    # Ana oculta el party de su perfil: el perfil público ya no lo muestra.
    page = open_page("window.__fake.start='ana';", dark, width)
    try:
        page.evaluate("window.camParties.openParty('f1000000-0000-4000-8000-000000000001', null)")
        page.wait_for_selector('#camPartyMenu')
        page.click('#camPartyMenu')
        switch = page.locator('#camParty .cam-party-switch')
        assert switch.get_attribute('aria-checked') == 'true'
        switch.click()
        page.wait_for_function("document.querySelector('#camParty .cam-party-switch')?.getAttribute('aria-checked') === 'false'")
        assert calls(page, 'cam_party_set_visibility')[-1]['args'] == {'p_party': 'f1000000-0000-4000-8000-000000000001', 'p_show': False}
        page.evaluate("document.getElementById('camParty').close()")
        page.evaluate("window.__fake.user = window.__fake.asUser('beto')")
        page.evaluate(f"window.openAePublicProfile({USERS['ana']!r}, true, 'picks')")
        page.wait_for_timeout(1200)
        assert page.locator('#camProfileParties').count() == 0 or not visible(page, '#camProfileParties'), 'el party oculto no sale'
        # En la pestaña Takes sigue el otro party de Ana.
        page.click('#aeProfileTabTakes')
        page.wait_for_selector('#camProfileParties .cam-party-card')
        assert 'Takes de la oficina' in page.inner_text('#camProfileParties')
        check_clean(page, tag + ' perfil público tras ocultar')
    finally:
        close(page)


def scenario_entries(dark, width, tag):
    page = open_page("window.__fake.start='ana';", dark, width)
    try:
        page.evaluate("filterByCategory('Picks')")
        # En el teléfono está en la pestaña Chefs: ir a él la abre (cam-mobile-sections.js).
        page.evaluate("document.getElementById('camPartyEntryPicks').scrollIntoView({block:'center'})")
        page.wait_for_selector('#camPartyEntryPicks', state='visible', timeout=8000)
        page.wait_for_timeout(300)
        check_clean(page, tag + ' acceso Picks')
        shot(page, f'{tag}-acceso-picks')
        page.click('#camPartyEntryPicks button')
        page.wait_for_selector('#camParty .cam-party-card')
        assert page.locator('#camParty .cam-party-seg-btn[aria-pressed=true]').inner_text() == 'Picks'
        page.evaluate("document.getElementById('camParty').close()")
        for category in ('Fútbol', 'NFL'):
            page.evaluate(f"filterByCategory({category!r})")
            page.wait_for_timeout(1500)
            # En el teléfono está en la pestaña Clasificación.
            page.evaluate("document.getElementById('camPartyEntryTakes').scrollIntoView({block:'center'})")
            assert visible(page, '#camPartyEntryTakes'), category
            page.wait_for_timeout(300)
            check_clean(page, tag + ' acceso Takes ' + category)
            if category == 'Fútbol':
                shot(page, f'{tag}-acceso-takes')
        page.click('#camPartyEntryTakes button')
        page.wait_for_selector('#camParty .cam-party-card')
        assert page.locator('#camParty .cam-party-seg-btn[aria-pressed=true]').inner_text() == 'Takes'
        # Crear desde ahí propone Takes · NFL.
        page.click('#camParty >> text=Crear party')
        assert page.locator('#camParty [data-value="takes"]').get_attribute('aria-pressed') == 'true'
        assert page.locator('#camParty [data-value="nfl"]').get_attribute('aria-pressed') == 'true'
        assert not page.errors, page.errors
    finally:
        close(page)


def scenario_admin(dark, width, tag):
    # Administradora (tabla editors): ve todos los parties y puede borrar uno ajeno.
    fake = """window.__fake.start='ana'; window.__fake.admin=true;
      window.__fake.tables = window.__fake.tables || {};
      window.__fake.tables.editors = [{user_id: %r}];""" % USERS['ana']
    page = open_page(fake, dark, width)
    try:
        page.evaluate("""() => window.__fake.parties.push({id: 'f3000000-0000-4000-8000-000000000003', name: 'Nombre a moderar', kind: 'takes', sport: 'nfl',
          code: 'MDR234', owner_id: window.__fake.U.carla, members: [{user_id: window.__fake.U.carla, joined_at: new Date().toISOString(), show: true}]})""")
        page.wait_for_function("typeof currentAdmin !== 'undefined' && Boolean(currentAdmin)")
        page.evaluate("window.camParties.openHub('picks','all')")
        page.click('#camParty .cam-party-link >> text="Moderar todos los parties"')
        page.wait_for_function("document.querySelectorAll('#camParty .cam-party-card').length === 3")
        check_clean(page, tag + ' moderación')
        page.click('#camParty .cam-party-card >> text="Nombre a moderar"')
        page.wait_for_selector('#camPartyBoard .cam-party-row')
        assert page.locator('#camPartyInvite').count() == 0, 'quien no es miembro no invita'
        page.click('#camPartyMenu')
        menu = page.inner_text('#camParty .cam-party-sheet')
        assert 'Borrar party (moderación)' in menu and 'Salir del party' not in menu and 'Renombrar' not in menu, menu
        page.click('#camParty .cam-party-sheet >> text="Borrar party (moderación)"')
        page.click('#camParty .cam-party-sheet .cam-party-btn.is-danger >> text="Borrar"')
        page.wait_for_function("document.getElementById('camPartyTitle')?.textContent === 'Todos los parties'")
        page.wait_for_function("document.querySelectorAll('#camParty .cam-party-card').length === 2")
        assert not page.errors, page.errors
    finally:
        close(page)


COMBOS = [(390, False, '390-dia'), (390, True, '390-noche'), (1366, False, '1366-dia'), (1366, True, '1366-noche')]
SCENARIOS = [scenario_create_and_ranking, scenario_takes_and_creator, scenario_invite,
             scenario_invite_login_new_member, scenario_public_profile, scenario_entries, scenario_admin]

for width, dark, tag in COMBOS:
    if ONLY and ONLY != tag:
        continue
    for scenario in SCENARIOS:
        scenario(dark, width, tag)
        print('ok', tag, scenario.__name__)
print('parties: todo OK')
