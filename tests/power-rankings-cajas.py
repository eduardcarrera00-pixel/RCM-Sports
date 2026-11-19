"""NFL · Power Rankings en 10 cajas (18 nov 2026).

Pedido de Eduard: al tocar un equipo de los Power Rankings no salía el texto de la
publicación («no se conecta»). Página completa en Chromium con tests/full-page.py y el
Supabase falso, como administrador:

  · Una publicación como la Semana 10 (nombres en negrita fuera de los párrafos) ya se
    conecta: los diez equipos tienen su texto y la tarjeta del n.º 1 lo enseña.
  · En «Publicar», la categoría «NFL · Power Rankings» cambia el editor por diez cajas,
    del 1 al 10, con el equipo puesto solo desde el ranking publicado.
  · El texto de cada caja se guarda en el aparato mientras se escribe; «Usar el orden de
    mi borrador de ranking» reordena y el texto sigue a su equipo.
  · Se publica como NFL con un subtítulo marcado por equipo; la tarjeta de cada equipo
    enseña su texto; el borrador del aparato se borra; editar vuelve a abrir las cajas.
Sin desbordes ni errores, a 390 px de día y de noche y en escritorio.

Uso: python3 -B tests/power-rankings-cajas.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = pathlib.Path(sys.argv[sys.argv.index('--shots') + 1]) if '--shots' in sys.argv else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)

PUBLISHED = ['SF', 'DEN', 'BUF', 'CHI', 'JAX', 'KC', 'CIN', 'DET', 'MIN', 'GB']
DRAFT = ['DEN', 'SF', 'BUF', 'CHI', 'JAX', 'KC', 'CIN', 'DET', 'MIN', 'LAR']
NAMES = {'SF': 'San Francisco 49ers', 'DEN': 'Denver Broncos', 'BUF': 'Buffalo Bills', 'CHI': 'Chicago Bears',
         'JAX': 'Jacksonville Jaguars', 'KC': 'Kansas City Chiefs', 'CIN': 'Cincinnati Bengals', 'DET': 'Detroit Lions',
         'MIN': 'Minnesota Vikings', 'GB': 'Green Bay Packers', 'LAR': 'Los Angeles Rams'}

# Mismo formato que la Semana 10: «<b>Equipo</b>» suelto, párrafos vacíos y <br> entre equipos.
OLD = '<p><b><br></b></p>' + ''.join(
    f'<b>{NAMES[t]}</b><p></p><p></p><p>Semana pasada de {NAMES[t]}: ganaron 31-19 con 584 yardas.</p><p><br></p>' for t in PUBLISHED) + '<br><br><p></p>'

FAKE = r"""
try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}
(() => {
  const F = window.__fake; F.tables = F.tables || {}; F.rpc = F.rpc || {};
  F.user = {id: 'u1', email: 'adrian@example.com', user_metadata: {display_name: 'adrianmendozac27'}};
  const T = F.tables, H = 36e5, iso = h => new Date(Date.now() + h * H).toISOString();
  T.editors = [{user_id: 'u1'}];
  T.nfl_rankings = [{id: 1, edition: 'Week 10', team_ids: %(published)s, updated_at: iso(-2)}];
  T.nfl_ranking_history = [];
  T.nfl_ranking_drafts = [{user_id: 'u1', edition: 'Week 11', team_ids: %(draft)s}];
  T.articles = [{id: 'a0000010-0000-4000-8000-000000000000', title: 'Power Rankings NFL Semana 10', category: 'NFL', author: 'adrianmendozac27',
    image: '', summary: 'Power Rankings tras la semana 10 de la NFL', featured: false, created_at: iso(-30), is_public: true,
    image_focus_x: 50, image_focus_y: 50, body: %(old)s}];
})();
"""


def fake():
    return FAKE % {'published': json.dumps(PUBLISHED), 'draft': json.dumps(DRAFT), 'old': json.dumps(OLD)}


# Guardar devuelve la fila guardada (el Supabase falso devolvería la primera de la tabla).
SAVE_RETURNS_ROW = """() => {
  const orig = db.from.bind(db);
  db.from = table => {
    const q = orig(table);
    if (table !== 'articles') return q;
    for (const op of ['insert', 'update']) {
      const base = q[op];
      q[op] = payload => { base(payload); const row = Object.assign({created_at: new Date().toISOString(), is_public: true, legacy_id: null,
        image_focus_x: 50, image_focus_y: 50}, payload); if (op === 'insert') window.__fake.tables.articles.unshift(row);
        q.single = () => Promise.resolve({data: row, error: null}); return q; };
    }
    return q;
  };
}"""

NOTE_OF_LEADER = """() => {
  const li = document.querySelector('#nflRankOneList > li[data-rank-sport]');
  li.click();
  const card = document.getElementById('aeRankNote');
  const text = card ? card.querySelector('.ae-rank-note-analysis')?.textContent || card.textContent : '';
  li.click();
  return {team: li.dataset.teamId, text};
}"""

PANEL = """() => {
  const p = document.querySelector('#publishModal .cam-prp');
  const body = document.getElementById('pubBody').parentElement;
  return {
    shown: !!p && !p.hidden && !!p.getClientRects().length, editor: !body.hidden && !!body.getClientRects().length,
    nums: [...document.querySelectorAll('#publishModal .cam-prp-num')].map(n => n.textContent),
    teams: [...document.querySelectorAll('#publishModal .cam-prp-team')].map(s => s.value),
    texts: [...document.querySelectorAll('#publishModal .cam-prp-text')].map(t => t.value),
    sub: p?.querySelector('.cam-prp-sub')?.textContent || '', use: (b => b && !b.hidden ? b.textContent : '')(p?.querySelector('.cam-prp-use')),
    count: p?.querySelector('.cam-prp-count')?.textContent || '', saved: p?.querySelector('.cam-prp-saved')?.textContent || '',
    title: document.getElementById('pubTitle').value,
    overflow: Math.max(document.documentElement.scrollWidth - innerWidth,
      ...[...document.querySelectorAll('#publishModal .cam-prp *')].map(n => n.getBoundingClientRect().right - document.querySelector('#publishModal form').getBoundingClientRect().right))
  };
}"""


def shot(page, name):
    if SHOTS:
        page.locator('#publishModal .cam-prp').screenshot(path=str(SHOTS / f'{name}.png'))


def run(width, dark):
    where = f'{width}-{"noche" if dark else "dia"}'
    with fp.full_page(fake_js=fake(), dark=dark, width=width, height=900) as page:
        page.evaluate("() => filterByCategory('NFL')"); page.wait_for_timeout(900)
        page.wait_for_function("() => document.querySelectorAll('#rankingList > li[data-rank-sport]').length === 10", timeout=15000)

        # 1) La publicación con el formato de la Semana 10 ya se conecta.
        notes = page.evaluate("() => [...window.aeRankingNotes.notesFor('nfl').notes.keys()]")
        assert sorted(notes) == sorted(PUBLISHED), f'{where}: formato Semana 10 sin conectar {notes}'
        leader = page.evaluate(NOTE_OF_LEADER)
        assert leader['team'] == 'SF' and 'Semana pasada de San Francisco 49ers' in leader['text'], f'{where}: tarjeta del n.º 1 {leader}'

        # 2) Publicar → «NFL · Power Rankings»: diez cajas con los equipos del ranking publicado.
        page.evaluate(SAVE_RETURNS_ROW)
        page.evaluate("() => openPublishModal()")
        page.wait_for_function("() => window.camPowerRankingsPublish && !document.getElementById('publishModal').classList.contains('hidden')", timeout=15000)
        options = page.locator('#pubCategory option').all_text_contents()
        assert 'NFL · Power Rankings' in options and options.index('NFL · Power Rankings') == options.index('NFL') + 1, f'{where}: opción {options}'
        st = page.evaluate(PANEL)
        assert not st['shown'] and st['editor'], f'{where}: con otra categoría sigue el editor de siempre {st}'
        page.select_option('#pubCategory', 'NFL · Power Rankings'); page.wait_for_timeout(500)
        st = page.evaluate(PANEL)
        assert st['shown'] and not st['editor'], f'{where}: no cambian las cajas por el editor {st}'
        assert st['nums'] == [str(i) for i in range(1, 11)], f'{where}: números {st["nums"]}'
        assert st['teams'] == PUBLISHED, f'{where}: los equipos no salen del ranking {st["teams"]}'
        assert 'Week 10' in st['sub'] and st['title'] == 'Power Rankings NFL', f'{where}: {st["sub"]} / {st["title"]}'
        assert 'Week 11' in st['use'], f'{where}: falta «Usar el orden de mi borrador» {st["use"]}'
        assert st['count'] == '0 de 10 con texto', st['count']

        boxes = page.locator('#publishModal .cam-prp-text')
        boxes.nth(0).fill('Los 49ers siguen arriba: 584 yardas ante Dallas.\nSegundo párrafo sobre la defensa.')
        boxes.nth(1).fill('Denver vuelve del descanso ante los Raiders.')
        boxes.nth(9).fill('Green Bay necesita un juego terrestre.')
        st = page.evaluate(PANEL)
        assert st['count'] == '3 de 10 con texto' and 'guardado' in st['saved'].lower(), f'{where}: {st["count"]} / {st["saved"]}'
        stored = page.evaluate("() => JSON.parse(localStorage.getItem('cam:pr-publish:nfl:u1'))")
        assert stored and stored['boxes'][1]['text'].startswith('Denver'), f'{where}: borrador del aparato {stored}'
        assert st['overflow'] <= 1, f'{where}: desborda {st["overflow"]}'
        shot(page, f'cajas-{where}')

        # 3) Cerrar sin publicar y volver: el texto sigue ahí.
        page.evaluate("() => closePublishModal()"); page.evaluate("() => openPublishModal()"); page.wait_for_timeout(500)
        st = page.evaluate(PANEL)
        assert st['shown'] and st['texts'][0].startswith('Los 49ers'), f'{where}: se perdió el texto al cerrar {st["texts"][:2]}'

        # 4) Orden del borrador: el texto sigue a su equipo (Green Bay sale del Top 10).
        page.locator('#publishModal .cam-prp-use').click(); page.wait_for_timeout(200)
        st = page.evaluate(PANEL)
        assert st['teams'] == DRAFT, f'{where}: orden del borrador {st["teams"]}'
        assert st['texts'][0].startswith('Denver') and st['texts'][1].startswith('Los 49ers') and st['texts'][9] == '', f'{where}: el texto no siguió a su equipo {st["texts"]}'

        # 5) Equipo repetido: no se publica.
        page.fill('#pubSummary', 'Power Rankings tras la semana 11 de la NFL')
        page.fill('#pubTitle', 'Power Rankings NFL Semana 11')
        page.select_option('#publishModal .cam-prp-team >> nth=9', 'GB'); page.wait_for_timeout(100)
        assert page.locator('#publishModal .cam-prp-team').nth(8).locator('option[value="GB"]').is_disabled(), f'{where}: un equipo usado debe quedar apagado en las otras cajas'
        page.locator('#pubSubmitButton').click(); page.wait_for_timeout(600)
        payload = page.evaluate("() => window.__fake.calls.filter(c => c.table === 'articles' && c.op === 'insert').pop()?.payload")
        assert payload, f'{where}: no se publicó'
        assert payload['category'] == 'NFL' and payload['title'] == 'Power Rankings NFL Semana 11', f'{where}: {payload["category"]} {payload["title"]}'
        body = payload['body']
        assert body.startswith('<h3 data-cam-rank-team="DEN" data-cam-rank="1">1. Denver Broncos</h3><p>Denver vuelve'), f'{where}: cuerpo {body[:140]}'
        assert '<h3 data-cam-rank-team="SF" data-cam-rank="2">2. San Francisco 49ers</h3><p>Los 49ers siguen arriba: 584 yardas ante Dallas.</p><p>Segundo párrafo sobre la defensa.</p>' in body, f'{where}: {body}'
        assert body.count('<h3') == 2, f'{where}: las cajas vacías no se publican {body}'
        assert page.evaluate("() => document.getElementById('publishModal').classList.contains('hidden')"), f'{where}: el modal no se cerró'
        assert page.evaluate("() => localStorage.getItem('cam:pr-publish:nfl:u1')") is None, f'{where}: el borrador del aparato debía borrarse'

        # 6) La tarjeta de cada equipo enseña el texto nuevo (conectado por su id).
        page.wait_for_timeout(300)
        notes = page.evaluate("() => Object.fromEntries(window.aeRankingNotes.notesFor('nfl').notes)")
        assert notes.get('SF') == ['Los 49ers siguen arriba: 584 yardas ante Dallas.', 'Segundo párrafo sobre la defensa.'], f'{where}: notas {notes}'
        assert notes.get('DEN') == ['Denver vuelve del descanso ante los Raiders.'], f'{where}: notas {notes}'
        leader = page.evaluate(NOTE_OF_LEADER)
        assert 'Los 49ers siguen arriba' in leader['text'], f'{where}: tarjeta del n.º 1 tras publicar {leader}'

        # 6b) Aunque el título no diga «Power Rankings», las cajas marcadas la delatan.
        other = page.evaluate("""() => { const a = articles.find(x => String(x.title).includes('Semana 11'));
          const copy = Object.assign({}, a, {id: 'otra', title: 'Mi top 10', summary: 'Semana movida', createdAt: new Date(Date.now() + 6e4).toISOString()});
          articles.unshift(copy); const r = window.aeRankingNotes.notesFor('nfl'); articles.shift(); return r.article && r.article.id; }""")
        assert other == 'otra', f'{where}: sin «Power Rankings» en el título no se reconoce {other}'

        # 7) La noticia se lee normal (subtítulo por equipo) y editarla vuelve a abrir las cajas.
        new_id = payload['id']
        page.evaluate(f"() => openArticleModal({json.dumps(new_id)})"); page.wait_for_timeout(400)
        heads = page.locator('#modalBody h3').all_text_contents()
        assert heads == ['1. Denver Broncos', '2. San Francisco 49ers'], f'{where}: subtítulos {heads}'
        # (En la web DOMPurify quita los data-*; aquí la prueba lo sustituye por uno que no limpia.)
        page.evaluate("() => openArticleEditor()"); page.wait_for_timeout(700)
        st = page.evaluate(PANEL)
        assert st['shown'] and st['teams'][:2] == ['DEN', 'SF'] and st['texts'][1].startswith('Los 49ers'), f'{where}: editar no abre las cajas {st}'
        assert st['texts'][1] == 'Los 49ers siguen arriba: 584 yardas ante Dallas.\n\nSegundo párrafo sobre la defensa.', f'{where}: {st["texts"][1]!r}'
        assert 'editando' in st['sub'], st['sub']
        # Una noticia nueva después de editar empieza limpia (no hereda la editada).
        page.evaluate("() => closePublishModal()"); page.evaluate("() => openPublishModal()"); page.wait_for_timeout(600)
        st = page.evaluate(PANEL)
        assert not any(st['texts']), f'{where}: la nueva hereda la editada {st["texts"][:2]}'
        assert page.errors == [], f'{where}: errores {page.errors}'


if __name__ == '__main__':
    for width, dark in [(390, False), (390, True), (1366, False)]:
        run(width, dark)
    print('Power Rankings en 10 cajas: conexión, publicar, borrador y editar · teléfono y escritorio, día y noche: OK')
