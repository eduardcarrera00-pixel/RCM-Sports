"""Takes de Fútbol y NFL: la misma tarjeta en «Últimos Takes», «Takes populares» y
«Takes impopulares» (10 nov 2026). Página completa en Chromium con tests/full-page.py
y el Supabase falso (sin red).

Comprueba en 320, 390 y 1366 px, de día y de noche, en Fútbol y en NFL:
  · las tres listas pintan la misma tarjeta (mismas piezas, en el mismo orden) y ya
    no quedan las filas con posición y balance;
  · arriba competición, fecha y compartir (a la derecha); título y, como mucho, dos
    líneas de texto; abajo a la izquierda el autor (inicial en círculo y @usuario) y
    abajo a la derecha los comentarios (icono y número) justo a la izquierda de los
    votos ▲ n | ▼ n;
  · nada se corta ni se sale de su tarjeta, y la página no se desplaza de lado;
  · «Ver las N ›» / «Ver menos» en populares e impopulares;
  · el icono de comentarios abre el cuadro de respuesta dentro de la tarjeta («Ver
    conversación (n)», Cancelar, Publicar) y el título abre la conversación completa;
  · el @usuario abre el perfil; en tu propio Take los votos no se pueden pulsar;
  · votar en una lista actualiza la tarjeta del mismo Take en la otra;
  · consultas: el número de respuestas se sigue pidiendo una sola vez por carga de
    «Últimos Takes» y con un máximo de 30 Takes; responder y votar solo añaden la
    consulta de siempre que refresca populares e impopulares.

Uso: python3 -B tests/takes-misma-tarjeta.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
U = lambda n: '%08d-0000-4000-8000-000000000000' % n
VIEWER = U(12)  # eduardcarrera00: su Take está en «Últimos Takes» y en populares


def take(n, author, uid, sport, comp, title, body, up, down, hours):
    return dict(id=U(500 + n), author_id=U(uid), author=author, sport=sport, competition=comp, title=title, body=body,
                upvotes=up, downvotes=down, my_vote=None, hours=hours)


TAKES = [
    take(1, 'madridista234', 11, 'champions', 'Champions League', 'Real Madrid Campeón Champions', 'Se viene la orejona a casa', 0, 3, 130),
    take(2, 'eduardcarrera00', 12, 'football', 'Balón de Oro', 'Lamine Yamal Balón de Oro 2026',
         'Hay futbolistas que se ven por pasión, y otros, como Lamine, por el privilegio de contemplar su arte cada fin de semana.', 6, 0, 380),
    take(3, 'tribuna_azteca', 13, 'ligamx', 'Liga MX', 'Monterrey no llega a la final de la Liguilla aunque tenga la plantilla más cara del torneo',
         'Rayados lleva tres torneos prometiendo y quedándose corto en las series largas. Esta vez tampoco. Y el año que viene, menos.', 4, 1, 20),
    take(4, 'colchonero_sur', 14, 'laliga', 'LaLiga', 'El Atleti gana LaLiga', 'Simeone tiene por fin el banquillo que pidió.', 3, 1, 50),
    take(5, 'reddevil_77', 15, 'premier', 'Premier League', 'El United vuelve a Champions', 'Con paciencia y un mediocentro de verdad.', 2, 0, 70),
    take(6, 'culer_del_norte', 16, 'laliga', 'LaLiga', 'El Barça no pasa de cuartos', 'Demasiado joven todavía.', 0, 2, 90),
    take(7, 'cementero_azul', 17, 'ligamx', 'Liga MX', 'Cruz Azul campeón sin discusión', 'La mejor defensa del torneo.', 1, 5, 110),
    take(8, 'gunner_mx', 18, 'premier', 'Premier League', 'El Arsenal se cae en abril', 'Como cada año.', 1, 4, 140),
    take(9, 'aficionado_con_nombre_largo', 19, 'football', 'Copa Mundial de Clubes de la FIFA', 'Un Take sin votos', 'Todavía nadie opina.', 0, 0, 5),
    take(10, 'kingdom_chiefs', 21, 'nfl', 'NFL', 'Los Chiefs no ganan su división', 'NFL · AFC · AFC West\n\nDenver tiene mejor defensa y un calendario más amable en diciembre.', 5, 1, 12),
    take(11, 'flock_baltimore', 22, 'nfl', 'NFL', 'Lamar Jackson MVP otra vez', 'NFL · AFC · AFC North\n\nNadie mueve las cadenas como él.', 4, 0, 30),
    take(12, 'sf_49ers', 23, 'nfl', 'NFL', 'San Francisco llega al Super Bowl', 'NFL · NFC · NFC West\n\nSi Purdy está sano no hay quien los pare.', 3, 1, 60),
    take(13, 'eduardcarrera00', 12, 'nfl', 'NFL', 'Green Bay gana la NFC Norte', 'NFL · NFC · NFC North\n\nLove ya es top 5.', 2, 0, 80),
    take(14, 'buffalo_mafia', 25, 'nfl', 'NFL', 'Buffalo se queda otra vez en la orilla', 'NFL · AFC · AFC East\n\nSiempre igual en enero.', 0, 3, 100),
    take(15, 'dallas_star', 26, 'nfl', 'NFL', 'Dallas campeón', 'NFL · NFC · NFC East\n\nEste es el año.', 1, 6, 120),
    take(16, 'who_dat_nation', 27, 'nfl', 'NFL', 'Nueva Orleans se queda sin playoffs', 'NFL · NFC · NFC South\n\nSin quarterback no hay paraíso.', 0, 2, 150),
    take(17, 'steel_curtain', 28, 'nfl', 'NFL', 'Pittsburgh no pierde en casa', 'NFL · AFC · AFC North\n\nEl frío ayuda.', 2, 7, 160),
]
COUNTS = {U(501): 2, U(502): 7, U(503): 12, U(510): 3, U(511): 1, U(515): 9}
FAKE = """
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  const all = %s.map(t => ({...t, created_at: new Date(Date.now() - t.hours * 36e5).toISOString()}));
  const counts = %s;
  F.rpc.ae_public_take_feed = a => ({data: all.filter(t => a && a.p_sport === 'nfl' ? t.sport === 'nfl' : true).map(t => ({...t})), error: null});
  F.rpc.ae_public_take_reply_counts = a => ({data: (a.p_take_ids || []).filter(id => counts[id]).map(id => ({take_id: id, reply_count: counts[id]})), error: null});
  // El servidor guarda el voto: las siguientes cargas lo devuelven.
  F.rpc.ae_vote_free_take = a => { const t = all.find(x => x.id === a.p_take_id); const prev = t.my_vote || 0, next = prev === a.p_value ? 0 : a.p_value;
    if (prev === 1) t.upvotes--; if (prev === -1) t.downvotes--; if (next === 1) t.upvotes++; if (next === -1) t.downvotes++; t.my_vote = next || null; return {data: next, error: null}; };
  F.rpc.ae_post_take_reply = a => { counts[a.p_take_id] = (counts[a.p_take_id] || 0) + 1; return {data: {id: 'r1'}, error: null}; };
  F.user = {id: '%s', email: 'prueba@example.com'};
})();
""" % (json.dumps(TAKES), json.dumps(COUNTS), VIEWER)

LISTS = {'feed': '#freeTakesFeed', 'up': '#aeSportTakePositive', 'down': '#aeSportTakeNegative'}
STATE = """() => {
  const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const box = e => e.getBoundingClientRect();
  const lists = %s, out = {lists: {}, problems: []};
  const bad = (where, what) => out.problems.push(where + ': ' + what);
  for (const [name, selector] of Object.entries(lists)) {
    const list = document.querySelector(selector);
    const cards = [...list.querySelectorAll('article.cam-tk')].filter(vis);
    out.lists[name] = {
      shown: cards.length, total: list.querySelectorAll('article.cam-tk').length,
      ids: cards.map(c => c.dataset.takeId),
      shapes: [...new Set(cards.map(c => c.className + ' > ' + [...c.children].filter(k => !k.matches('.cam-tk-excerpt')).map(k => k.className.split(' ').pop()).join(' ')))],
      own: cards.filter(c => [...c.querySelectorAll('.cam-tk-vote-btn')].every(b => b.disabled)).map(c => c.dataset.takeId),
      counts: Object.fromEntries(cards.map(c => [c.dataset.takeId, c.querySelector('.ae-take-reply-count').hidden ? null : c.querySelector('.ae-take-reply-count').textContent])),
      votes: Object.fromEntries(cards.map(c => [c.dataset.takeId, [...c.querySelectorAll('.cam-football-vote-count')].map(n => n.textContent).join('|')])),
      old: list.querySelectorAll('.cam-op-rank, .cam-op-score, .cam-op-meta, .cam-tk-reply-label').length,
    };
    for (const card of cards) {
      const where = name + ' ' + card.querySelector('.cam-tk-open').textContent.slice(0, 24);
      const c = box(card), top = card.querySelector('.cam-tk-top'), actions = card.querySelector('.cam-tk-actions');
      const kicker = box(card.querySelector('.cam-tk-kicker')), by = box(card.querySelector('.cam-tk-by')), tools = box(card.querySelector('.cam-tk-tools'));
      const avatar = box(card.querySelector('.cam-tk-avatar')), author = card.querySelector('.cam-tk-author'), reply = card.querySelector('.cam-tk-reply');
      const vote = box(card.querySelector('.cam-tk-vote')), a = box(actions), t = box(top), r = box(reply), title = box(card.querySelector('.cam-tk-title'));
      const share = card.querySelector('.cam-tk-share'), excerpt = card.querySelector('.cam-tk-excerpt');
      if (!card.querySelector('.cam-tk-kicker').textContent.trim()) bad(where, 'sin competición');
      if (Math.abs(kicker.left - t.left) > 1 || kicker.bottom > title.top + 1) bad(where, 'la competición va arriba a la izquierda');
      if (!share || Math.abs(box(share).right - t.right) > 1 || box(share).top < c.top || box(share).bottom > title.top + 1) bad(where, 'compartir va arriba a la derecha');
      if (excerpt) { const lines = Math.round(box(excerpt).height / parseFloat(getComputedStyle(excerpt).lineHeight)); if (lines > 2) bad(where, 'el texto ocupa ' + lines + ' líneas'); }
      // Pie: autor abajo a la izquierda; comentarios y votos abajo a la derecha.
      if (a.top < title.bottom - 1 || a.bottom > c.bottom + 1) bad(where, 'el pie va al final de la tarjeta');
      if (Math.abs(by.left - a.left) > 1 || avatar.left < by.left - 1 || box(author).left < avatar.right) bad(where, 'autor (inicial y @usuario) abajo a la izquierda');
      if (Math.abs(tools.right - a.right) > 1 || Math.abs(vote.right - tools.right) > 1) bad(where, 'votos abajo a la derecha');
      if (r.right > vote.left + 1 || vote.left - r.right > 12 || Math.abs((r.top + r.bottom) / 2 - (vote.top + vote.bottom) / 2) > 2) bad(where, 'comentarios justo a la izquierda de los votos');
      if (!reply.querySelector('svg') || /responder/i.test(reply.textContent)) bad(where, 'comentarios es un icono con su número');
      if (r.width < 36 || r.height < 36) bad(where, 'el icono de comentarios se puede tocar (' + Math.round(r.width) + '×' + Math.round(r.height) + ')');
      if (!/^\\d+\\|\\d+$/.test([...card.querySelectorAll('.cam-football-vote-count')].map(n => n.textContent).join('|'))) bad(where, 'votos ▲ n | ▼ n');
      // Nada cortado ni fuera de la tarjeta.
      for (const node of card.querySelectorAll('.cam-tk-author, .cam-tk-kicker, .cam-tk-date, .ae-take-reply-count, .cam-football-vote-count'))
        if (vis(node) && node.scrollWidth > node.clientWidth + 1) bad(where, 'texto cortado en ' + node.className.split(' ').pop() + ' «' + node.textContent + '»');
      for (const node of card.querySelectorAll('.cam-tk-top > *, .cam-tk-actions > *, .cam-tk-tools > *, .cam-tk-title, .cam-tk-excerpt'))
        if (vis(node) && (box(node).left < c.left - 1 || box(node).right > c.right + 1 || box(node).bottom > c.bottom + 1)) bad(where, node.className.split(' ').pop() + ' se sale de la tarjeta');
      if (card.scrollWidth > card.clientWidth + 1) bad(where, 'la tarjeta se desborda');
      if (c.left < -1 || c.right > innerWidth + 1) bad(where, 'la tarjeta se sale de la pantalla');
    }
  }
  out.more = Object.fromEntries(['aeSportTakePositive', 'aeSportTakeNegative'].map(id => { const b = document.querySelector('#' + id + ' ~ .cam-op-more'); return [id, b && vis(b) ? b.textContent : null]; }));
  out.overflow = document.documentElement.scrollWidth - innerWidth;
  out.replyCalls = window.__fake.calls.filter(c => c.rpc === 'ae_public_take_reply_counts').map(c => c.args.p_take_ids.length);
  out.feedCalls = window.__fake.calls.filter(c => c.rpc === 'ae_public_take_feed').length;
  return out;
}""" % json.dumps(LISTS)



def expected(sport):
    mine = [t for t in TAKES if (t['sport'] == 'nfl') == (sport == 'nfl')]
    net = lambda t: t['upvotes'] - t['downvotes']
    up = sorted([t for t in mine if net(t) > 0], key=lambda t: (-net(t), -t['upvotes'], t['hours']))
    down = sorted([t for t in mine if net(t) < 0], key=lambda t: (net(t), -t['downvotes'], t['hours']))
    return mine, up, down


def check(sport, width, dark):
    where = f'{sport} {width}-{"noche" if dark else "dia"}'
    mine, up, down = expected(sport)
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=844 if width < 700 else 900, scale=1) as page:
        page.goto(page.url.split('?')[0] + f'?s={sport}&v=takes', wait_until='load')
        page.wait_for_selector('#freeTakesFeed article.cam-tk', timeout=15000)
        page.wait_for_selector('#aeSportTakePositive article.cam-tk', timeout=15000)
        page.wait_for_timeout(900)
        st = page.evaluate(STATE)
        assert not st['problems'], f'{where}: ' + ' · '.join(st['problems'][:8])
        assert st['overflow'] <= 0, f'{where}: la página se desplaza de lado ({st["overflow"]} px)'
        L = st['lists']
        shapes = {tuple(L[k]['shapes']) for k in L}
        assert len(shapes) == 1 and len(L['feed']['shapes']) == 1, f'{where}: las tres listas usan la misma tarjeta {[L[k]["shapes"] for k in L]}'
        assert 'cam-tk-top' in L['feed']['shapes'][0] and L['feed']['shapes'][0].endswith('cam-tk-top cam-tk-title cam-tk-actions cam-tk-quick cam-tk-note'), f'{where}: piezas {L["feed"]["shapes"]}'
        assert all(L[k]['old'] == 0 for k in L), f'{where}: no quedan filas con posición ni balance'
        assert L['feed']['shown'] == len(mine), f'{where}: Últimos Takes {L["feed"]["shown"]}/{len(mine)}'
        assert L['up']['ids'] == [t['id'] for t in up[:3]] and L['up']['total'] == len(up), f'{where}: populares {L["up"]["ids"]}'
        assert L['down']['ids'] == [t['id'] for t in down[:3]] and L['down']['total'] == len(down), f'{where}: impopulares {L["down"]["ids"]}'
        own = {t['id'] for t in mine if t['author_id'] == VIEWER}
        for key in L:
            assert set(L[key]['own']) == own & set(L[key]['ids']), f'{where}: en {key}, solo tu propio Take tiene los votos desactivados {L[key]["own"]}'
            for tid, shown in L[key]['counts'].items():
                assert shown == str(COUNTS.get(tid, 0)), f'{where}: respuestas de {tid} en {key}: {shown}'
        # Igual que antes del cambio: una consulta de respuestas por carga de «Últimos Takes»
        # (el ordenador carga la sección dos veces al componer sus columnas).
        loads = 2 if width > 760 else 1
        assert 1 <= len(st['replyCalls']) <= loads and max(st['replyCalls']) <= 30, f'{where}: consultas de respuestas {st["replyCalls"]}'
        feed_calls, reply_calls = st['feedCalls'], len(st['replyCalls'])
        want_more = lambda rows: f'Ver las {len(rows)} ›' if len(rows) > 3 else None
        assert st['more'] == {'aeSportTakePositive': want_more(up), 'aeSportTakeNegative': want_more(down)}, f'{where}: «Ver las N» {st["more"]}'
        if SHOTS:
            page.locator('#aeSportTakeLeaders').screenshot(path=str(SHOTS / f'{sport}-{width}-{"noche" if dark else "dia"}-populares.png'))
            page.locator('#freeTakesFeed').screenshot(path=str(SHOTS / f'{sport}-{width}-{"noche" if dark else "dia"}-ultimos.png'))

        # «Ver las N ›» despliega el resto con la misma tarjeta; «Ver menos» lo recoge.
        more = page.locator('#aeSportTakePositive ~ .cam-op-more')
        more.click(); page.wait_for_timeout(250)
        st = page.evaluate(STATE)
        assert st['lists']['up']['shown'] == len(up) and st['more']['aeSportTakePositive'] == 'Ver menos', f'{where}: «Ver las N» abre {st["lists"]["up"]["shown"]}/{len(up)}'
        assert not st['problems'] and st['overflow'] <= 0, f'{where} (desplegado): ' + ' · '.join(st['problems'][:8])
        more.click(); page.wait_for_timeout(250)
        assert page.evaluate(STATE)['lists']['up']['shown'] == 3, f'{where}: «Ver menos» vuelve a tres'

        # El icono de comentarios abre la respuesta dentro de la tarjeta; el título, la conversación.
        page.evaluate("window.__opened = []; window.aeTakeReplies = {...window.aeTakeReplies, open: t => window.__opened.push(t.id)};"
                      "window.__profiles = []; window.openAePublicProfile = id => window.__profiles.push(id);")
        target = up[1]
        card = f'#aeSportTakePositive article.cam-tk[data-take-id="{target["id"]}"]'
        page.locator(card + ' .cam-tk-reply').click(); page.wait_for_timeout(350)
        quick = page.evaluate("""s => { const c = document.querySelector(s), f = c.querySelector('.cam-tk-quick'), b = c.getBoundingClientRect(), r = f.querySelector('.cam-tk-quick-row').getBoundingClientRect();
          return {open: !f.hidden, focus: document.activeElement === f.querySelector('textarea'), expanded: c.querySelector('.cam-tk-reply').getAttribute('aria-expanded'),
            buttons: [...f.querySelectorAll('button')].map(x => x.textContent), inside: r.bottom <= b.bottom + 1 && r.left >= b.left - 1 && r.right <= b.right + 1,
            clipped: [...f.querySelectorAll('button')].filter(x => x.scrollWidth > x.clientWidth + 1).map(x => x.textContent), opened: window.__opened.length,
            others: document.querySelectorAll('article.cam-tk .cam-tk-quick:not([hidden])').length}; }""", card)
        n = COUNTS.get(target['id'], 0)
        assert quick == {'open': True, 'focus': True, 'expanded': 'true', 'buttons': [f'Ver conversación ({n}) ›' if n else 'Ver conversación ›', 'Cancelar', 'Publicar'],
                         'inside': True, 'clipped': [], 'opened': 0, 'others': 1}, f'{where}: cuadro de respuesta {quick}'
        if SHOTS and width in (320, 1366):
            page.locator(card).screenshot(path=str(SHOTS / f'{sport}-{width}-{"noche" if dark else "dia"}-respuesta.png'))
        page.locator(card + ' textarea').fill('Totalmente de acuerdo.')
        page.locator(card + ' .cam-tk-quick-send').click(); page.wait_for_timeout(500)
        after = page.evaluate("s => { const c = document.querySelector(s); return [c.querySelector('.cam-tk-quick').hidden, c.querySelector('.ae-take-reply-count').textContent, c.querySelector('.cam-tk-note').textContent]; }", card)
        assert after == [True, str(n + 1), 'Respuesta publicada ✓'], f'{where}: tras publicar {after}'
        same = page.evaluate("id => [...document.querySelectorAll('article.cam-tk')].filter(c => c.dataset.takeId === id).map(c => c.querySelector('.ae-take-reply-count').textContent)", target['id'])
        assert len(same) == 2 and set(same) == {str(n + 1)}, f'{where}: el número de respuestas sube en todas sus tarjetas {same}'
        page.locator(card + ' .cam-tk-open').click(); page.wait_for_timeout(150)
        page.locator(card + ' .cam-tk-excerpt').click(); page.wait_for_timeout(150)
        assert page.evaluate('window.__opened') == [target['id']] * 2, f'{where}: el título y el texto abren la conversación'
        page.locator(card + ' .cam-tk-author').click()
        assert page.evaluate('window.__profiles.filter(Boolean)') == [target['author_id']], f'{where}: el @usuario abre el perfil'

        # Votar en populares cambia también la tarjeta del mismo Take en «Últimos Takes».
        before = f'{target["upvotes"]}|{target["downvotes"]}'
        page.locator(card + ' .cam-tk-vote-btn[data-vote="up"]').click(); page.wait_for_timeout(900)
        votes = page.evaluate("id => [...document.querySelectorAll('article.cam-tk')].filter(c => c.dataset.takeId === id).map(c => [c.dataset.camTkScope, [...c.querySelectorAll('.cam-football-vote-count')].map(n => n.textContent).join('|'), c.querySelector('[data-vote=up]').getAttribute('aria-pressed')])", target['id'])
        want = f'{target["upvotes"] + 1}|{target["downvotes"]}'
        assert sorted(votes) == [['feed', want, 'true'], ['up', want, 'true']], f'{where}: el voto ({before} → {want}) se ve en las dos tarjetas {votes}'
        mine_card = next(iter(own & set(L['up']['ids'])), None)
        if mine_card:
            page.locator(f'#aeSportTakePositive article.cam-tk[data-take-id="{mine_card}"] .cam-tk-vote-btn[data-vote="up"]').click(force=True); page.wait_for_timeout(300)
        calls = page.evaluate("window.__fake.calls.filter(c => c.rpc === 'ae_vote_free_take').length")
        assert calls == 1, f'{where}: tu propio Take no se puede votar ({calls} votos enviados)'
        st = page.evaluate(STATE)
        assert not st['problems'] and st['overflow'] <= 0, f'{where} (tras votar): ' + ' · '.join(st['problems'][:8])
        # Responder y votar refrescan populares/impopulares con su consulta de siempre (una por
        # acción). En el ordenador, «Lo más debatido» también se refresca con las suyas, como antes.
        assert max(st['replyCalls']) <= 30, f'{where}: consultas de respuestas {st["replyCalls"]}'
        if width <= 760:
            assert len(st['replyCalls']) == reply_calls and st['feedCalls'] == feed_calls + 2, f'{where}: sin consultas de más {st["replyCalls"]} {st["feedCalls"]} (antes {feed_calls})'
        assert not page.errors, f'{where}: errores {page.errors}'
    print('  ok', where)


for sport in ('futbol', 'nfl'):
    for width in (320, 390, 1366):
        for dark in (False, True):
            check(sport, width, dark)
print('PASS: misma tarjeta en Últimos Takes, Takes populares y Takes impopulares (Fútbol y NFL, 320/390/1366, día y noche).')
