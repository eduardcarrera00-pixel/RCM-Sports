"""Captura de apuestas sencillas en la página completa (Chromium + Supabase falso):
vista previa compacta, una línea por apuesta, y un Pick publicado por cada apuesta marcada.
El OCR se simula con el texto real del lector (tests/fixtures/real-ticket-ocr.json).
Uso: python3 tests/pick-singles-browser.py
"""
import datetime, importlib.util, io, json, pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
OCR = '\n'.join(json.load(open(ROOT / 'tests/fixtures/real-ticket-ocr.json'))['sencillos_psm11'])
_buf = io.BytesIO(); Image.new('RGB', (600, 1300), 'white').save(_buf, 'PNG'); PNG = _buf.getvalue()  # imagen en blanco: el OCR está simulado
DAY = (datetime.date.today() + datetime.timedelta(days=2)).isoformat()
FAKE = """
window.__fake.user={id:'11111111-1111-4111-8111-111111111111',email:'chef@example.test',is_anonymous:false,user_metadata:{username:'chef'}};
window.__fake.tables=window.__fake.tables||{};window.__fake.tables.ae_community_picks=[{id:'22222222-2222-4222-8222-222222222222'}];
const OCR=%s;
window.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:OCR,confidence:90}}),terminate:async()=>{}})};
window.aeRequestPublication=(kind,fn)=>fn();
""" % json.dumps(OCR)

for dark in (False, True):
    with fp.full_page(fake_js=FAKE, dark=dark) as page:
        page.evaluate('window.aeOpenPickComposer()'); page.wait_for_timeout(800)
        page.set_input_files('#cpCaptureFile', files=[{'name': 'sencillos.png', 'mimeType': 'image/png', 'buffer': PNG}])
        page.wait_for_selector('.cp-single', timeout=20000); page.wait_for_timeout(2500)
        submit = page.locator('#cpForm button[type=submit]')
        assert page.locator('.cp-single').count() == 5
        assert page.locator('#cpPreviewTitle').inner_text() == '5 apuestas sencillas'
        assert submit.inner_text() == 'Publicar 5 Picks' and submit.is_disabled(), 'Sin fecha no se publica'
        dates = page.locator('.cp-single-date')
        for i in range(dates.count()): dates.nth(i).fill(DAY)
        page.locator('.cp-single input[type=checkbox]').nth(2).uncheck(); page.wait_for_timeout(150)
        assert submit.inner_text() == 'Publicar 4 Picks' and not submit.is_disabled()
        overflow = page.evaluate("document.querySelector('.cp-singles').scrollWidth-document.querySelector('.cp-singles').clientWidth")
        assert overflow <= 1, 'Las líneas caben en el ancho del teléfono'
        submit.click(); page.wait_for_timeout(1500)
        inserts = page.evaluate("window.__fake.calls.filter(c=>c.table==='ae_community_picks'&&c.op==='insert').map(c=>c.payload)")
        assert [(c['legs'][0]['event'], c['legs'][0]['odds']) for c in inserts] == [
            ('Como vs. Manchester United', 120), ('Lille vs. Galatasaray', 118),
            ('Bayern Munich vs. Arsenal', 220), ('Real Betis vs. Feyenoord Rotterdam', 365)]
        assert all(len(c['legs']) == 1 and c['event_date'] == DAY for c in inserts), 'Un Pick por apuesta'
        assert all(c['capture_check']['readings'][0]['odds'] == c['legs'][0]['odds'] for c in inserts)
        assert not page.evaluate("document.getElementById('cpComposePanel').open"), 'El compositor se cierra al publicar'
        assert not page.errors, page.errors
print('PASS: captura de sencillos → vista previa compacta → un Pick por apuesta marcada (claro y oscuro).')
