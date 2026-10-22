"""Power Rankings · vista previa «por qué está aquí» (NFL y Champions) en la página completa.
Chromium + Supabase falso. El texto sale de la última publicación «Power Rankings» de cada deporte.
Uso: python3 tests/ranking-notes.py
"""
import importlib.util, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
FIX = (ROOT / 'tests/fixtures/ranking-notes.js').read_text(encoding='utf8')
UCL = {'id': 'ucl-1', 'title': 'Power Rankings Champions Jornada 2', 'category': 'Fútbol', 'author': 'CAM', 'image': '',
       'summary': 'Así quedan los diez mejores', 'is_public': True, 'featured': False, 'created_at': '2026-10-21T20:00:00Z',
       'body': '<p>1. PSG</p><p>El campeón domina con autoridad.</p><h3>Bayern Munich (2-0)</h3><p>Kane no falla.</p>'
               '<p>Y la presión alta asfixia a todos.</p><p><strong>Real Madrid</strong></p><p>Mbappé sostiene al equipo.</p>'
               '<p>Conclusión</p><p>Texto general que no es de ningún equipo.</p>'}
FAKE = FIX + ";window.__fake.tables.articles.push(%s);try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}" % json.dumps(UCL)

def hover(page, track, team_id, click=False):
    page.evaluate("s=>{document.querySelector(s).scrollIntoView({block:'center'});window.scrollBy(0,-120)}", track)
    # Carrusel quieto, con el equipo buscado en el centro de su franja, para apuntar sin carreras.
    page.evaluate("""([s,id])=>{const t=document.querySelector(s);t.style.animation='none';t.style.transform='none';
      const li=t.querySelector('li[data-team-id="'+id+'"]'),v=t.parentElement.getBoundingClientRect(),r=li.getBoundingClientRect();
      t.style.transform='translateX('+Math.round((v.left+v.width/2)-(r.left+r.width/2))+'px)'}""", [track, team_id])
    page.wait_for_timeout(300)
    vw = page.viewport_size['width']
    boxes = [b for b in (l.bounding_box() for l in page.locator(f'{track} li[data-team-id="{team_id}"]').all()) if b]
    box = max(boxes, key=lambda b: min(b['x'] + b['width'], vw) - max(b['x'], 0))  # la copia más visible del carrusel
    x, y = min(max(box['x'] + box['width'] / 2, 30), vw - 30), box['y'] + box['height'] / 2
    hit = page.evaluate("([x,y])=>{const e=document.elementFromPoint(x,y);return e?(e.closest('li')?.dataset.teamId||e.className||e.tagName):null}", [x, y])
    assert hit == team_id, (team_id, hit, box)
    (page.mouse.click if click else page.mouse.move)(x, y); page.wait_for_timeout(500)
    return page.locator('#aeRankNote')

for width in (1366, 390):
    with fp.full_page(fake_js=FAKE, width=width) as page:
        page.evaluate("filterByCategory('NFL')"); page.wait_for_timeout(1200)
        note = hover(page, '#rankingTrack', 'KC', click=width < 600)
        assert note.count() == 1, 'Aparece la vista previa'
        text = note.inner_text()
        assert 'Kansas City Chiefs' in text and 'N.º 2' in text and 'Mahomes' in text and 'La defensiva' in text, text
        assert 'Buffalo' not in text, 'Solo el apartado de ese equipo'
        assert page.evaluate("document.getElementById('rankingTrack').matches('.ae-note-hold, :hover')"), 'El movimiento se detiene'
        page.mouse.move(2, 2); page.keyboard.press('Escape'); page.wait_for_timeout(400)
        assert page.locator('#aeRankNote').count() == 0, 'Se cierra'
        note = hover(page, '#rankingTrack', 'SF', click=True)
        assert 'Kittle' in note.inner_text(), 'El encabezado «San Francisco» identifica a los 49ers'
        page.locator('.ae-rank-note-read').click(); page.wait_for_timeout(800)
        assert page.evaluate("document.getElementById('articleModal') && !document.getElementById('articleModal').classList.contains('hidden')") or page.evaluate("location.search.includes('6a922625')"), 'Abre la publicación'
        page.keyboard.press('Escape'); page.wait_for_timeout(400)
        note = hover(page, '#rankingTrack', 'CHI', click=True)
        assert 'aún no explica' in note.inner_text(), 'Sin texto inventado si la publicación no menciona al equipo'
        page.keyboard.press('Escape')
        sr = page.evaluate("[...document.querySelectorAll('#rankingList .ae-rank-note-sr')].map(p=>p.parentElement.dataset.teamId)")
        assert sr == ['SF', 'KC', 'BUF', 'MIN', 'JAX'], sr
        page.evaluate("filterByCategory('Fútbol')"); page.wait_for_timeout(1200)
        note = hover(page, '#championsTrack', '50037', click=width < 600)
        t = note.inner_text()
        assert 'Bayern München' in t and 'Kane no falla.' in t and 'presión alta' in t and 'Mbappé' not in t, t
        page.mouse.move(2, 2); page.keyboard.press('Escape'); page.wait_for_timeout(300)
        assert 'Mbappé' in hover(page, '#championsTrack', '50051', click=True).inner_text(), 'Real Madrid (en negrita)'
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        assert 'Texto general' not in hover(page, '#championsTrack', '52265', click=True).inner_text(), 'Real Betis no hereda el texto de Real Madrid'
        page.keyboard.press('Escape'); page.wait_for_timeout(300)
        leader = page.locator('#championsRankOneList li[data-rank-sport]')
        leader.focus(); page.keyboard.press('Enter'); page.wait_for_timeout(400)
        assert 'El campeón domina' in page.locator('#aeRankNote').inner_text(), 'Teclado: el número uno abre su explicación'
        assert not page.errors, page.errors
print('PASS: vista previa de Power Rankings NFL y Champions (ratón, toque y teclado; texto solo de la publicación).')
