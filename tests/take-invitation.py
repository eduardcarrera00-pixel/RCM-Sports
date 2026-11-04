"""«Seguro que alguna vez dijiste…» (#camTakeInvitation) en el mismo sitio en Fútbol que en NFL.

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).
  · Teléfono (390 px, pestaña Takes): «Demuestra tu conocimiento» → opiniones
    → párrafo → «Últimos Takes».
  · Escritorio (1366 px): «Demuestra tu conocimiento» → párrafo → opiniones.
De día y de noche, pasando NFL → Fútbol → NFL → Fútbol, sin errores de consola.

Uso: python3 -B tests/take-invitation.py
"""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)

FAKE = "try { sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1', '1'); } catch (e) {}"
ORDER = """() => {
  const ids = ['camTakeInvitation', 'aeSportTakeLeaders', 'aeTakesFeedHeading'];
  const head = document.querySelector('#freeTakes > .ae-takes-head');
  const top = el => el && el.getClientRects().length ? el.getBoundingClientRect().top : null;
  const out = {head: top(head)};
  for (const id of ids) out[id] = top(document.getElementById(id));
  return out;
}"""
PHONE = ['head', 'aeSportTakeLeaders', 'camTakeInvitation', 'aeTakesFeedHeading']
DESKTOP = ['head', 'camTakeInvitation', 'aeSportTakeLeaders', 'aeTakesFeedHeading']


def go(page, cat, mobile):
    if mobile:
        page.click(f'body > nav.cam-mobile-bottom-nav > button[data-category="{cat}"]')
        page.wait_for_timeout(600)
        page.click('#camSectionTabs button[data-tab="takes"]')
    else:
        page.evaluate('cat => window.filterByCategory(cat)', cat)
    page.wait_for_timeout(800)
    return page.evaluate(ORDER)


def run(width, dark):
    mobile = width < 760
    where = f'{width}px {"noche" if dark else "día"}'
    expected = PHONE if mobile else DESKTOP
    with fp.full_page(fake_js=FAKE, dark=dark, width=width, height=900, scale=1) as page:
        page.wait_for_timeout(600)
        for cat in ('NFL', 'Fútbol', 'NFL', 'Fútbol'):
            tops = go(page, cat, mobile)
            assert all(tops[k] is not None for k in expected), f'{where} {cat}: falta algo visible {tops}'
            got = sorted(expected, key=lambda k: tops[k])
            assert got == expected, f'{where} {cat}: orden {got}, esperado {expected}'
        assert not page.errors, f'{where}: errores {page.errors}'
    print('ok', where)


for width in (390, 1366):
    for dark in (False, True):
        run(width, dark)
print('take-invitation: todo bien')
