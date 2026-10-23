"""«Demuestra tu conocimiento»: la misma tarjeta-acción en NFL y en Fútbol.

Comprueba en la página completa (Chromium + Supabase falso, sin red) que:
  · la cabecera se ve igual en los dos deportes, en teléfono y en ordenador;
  · el botón es un botón de verdad («Publicar mi Take»), no un círculo ni el título;
  · tocar cualquier punto de la tarjeta hace lo mismo que tocar el botón.

Uso: python3 tests/take-cta-unificado.py
"""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)

FAKE = "try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){}"
SPORTS = (('NFL', 'nfl'), ('Fútbol', 'football'))
STYLE = """() => {
  const head = document.querySelector('#freeTakes > .ae-takes-head');
  const btn = document.getElementById('aeSportTakePublish');
  const title = document.getElementById('freeTakesTitle');
  const eyebrow = head.querySelector('.ae-takes-eyebrow');
  const text = document.querySelector('#freeTakes > .ae-takes-head > p');
  const cs = getComputedStyle(btn), hs = getComputedStyle(head), ts = getComputedStyle(title);
  const r = el => { const b = el.getBoundingClientRect(); return {w: Math.round(b.width), h: Math.round(b.height)}; };
  return {
    head: r(head), button: r(btn), title: r(title), eyebrow: r(eyebrow), text: r(text),
    label: btn.innerText.replace(/\\s+/g, ' ').trim(),
    eyebrowText: eyebrow.innerText.trim(),
    btnStyle: [cs.borderRadius, cs.padding, cs.fontSize, cs.fontWeight, cs.backgroundImage, cs.minHeight, cs.justifyContent],
    headStyle: [hs.borderRadius, hs.padding, hs.cursor, hs.gridTemplateColumns.split(' ').length],
    titleStyle: [ts.fontSize, ts.color, ts.position],
    authHidden: document.getElementById('userAuthModal').classList.contains('hidden'),
  };
}"""


def ready(page, category):
    page.evaluate(f"filterByCategory({category!r})")
    page.wait_for_timeout(1500)
    page.evaluate("document.querySelector('#freeTakes > .ae-takes-head').scrollIntoView({block:'center'})")
    page.wait_for_timeout(400)


for width, where in ((1366, 'ordenador'), (390, 'teléfono')):
    seen = {}
    for category, sport in SPORTS:
        # --- aspecto -------------------------------------------------------
        with fp.full_page(fake_js=FAKE, width=width) as page:
            ready(page, category)
            s = page.evaluate(STYLE)
            assert s['label'] == 'Publicar mi Take →', (where, sport, s['label'])
            assert s['eyebrowText'].lower() == 'takes de la comunidad', (where, sport, s['eyebrowText'])
            # El título se ve: ya no está oculto haciendo de botón.
            assert s['title']['w'] > 120 and s['title']['h'] > 20, (where, sport, s['title'])
            assert s['titleStyle'][2] == 'static', (where, sport, s['titleStyle'])
            assert s['text']['h'] > 10, (where, sport, s['text'])
            # El botón es una píldora ancha, nunca un círculo.
            assert s['button']['w'] >= s['button']['h'] * 2, (where, sport, s['button'])
            assert s['button']['h'] >= 44, (where, sport, s['button'])
            if width < 760:   # en el teléfono ocupa todo el ancho de la tarjeta
                assert s['button']['w'] > s['head']['w'] * .8, (where, sport, s['button'], s['head'])
            else:             # en ordenador va a la derecha, sin estirarse
                assert s['button']['w'] < s['head']['w'] * .4, (where, sport, s['button'], s['head'])
            assert s['headStyle'][2] == 'pointer', (where, sport, s['headStyle'])
            seen[sport] = s

        # --- toda la tarjeta abre el Take ----------------------------------
        for target in ('#freeTakesTitle', '#freeTakes > .ae-takes-head > p', '#aeSportTakePublish'):
            with fp.full_page(fake_js=FAKE, width=width) as page:
                ready(page, category)
                assert page.evaluate("document.getElementById('userAuthModal').classList.contains('hidden')")
                page.locator(target).first.click()
                page.wait_for_timeout(900)
                opened = page.evaluate("!document.getElementById('userAuthModal').classList.contains('hidden')"
                                       " || Boolean(document.getElementById('aeTakeComposerDialog')?.open)")
                assert opened, (where, sport, target, 'no abrió el Take')
                assert not page.errors, (where, sport, target, page.errors[:2])

    a, b = seen['nfl'], seen['football']
    for key in ('btnStyle', 'headStyle', 'titleStyle', 'label', 'eyebrowText'):
        assert a[key] == b[key], (where, key, a[key], b[key])
    for key in ('head', 'button', 'title', 'eyebrow'):
        assert abs(a[key]['h'] - b[key]['h']) <= 1, (where, key, a[key], b[key])
    print(f'· {where}: NFL y Fútbol comparten tarjeta, botón y medidas ({a["head"]["h"]} px de alto)')

print('take-cta-unificado OK')
