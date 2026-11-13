"""Orden de la pestaña Takes (12 nov 2026).

Pedido de Eduard: el ejemplo «Tu Take · ¿Qué crees que va a pasar?» abre Takes
y la tarjeta «Demuestra tu conocimiento» la cierra.

Página completa en Chromium con tests/full-page.py y el Supabase falso (sin red).
  · Teléfono (390 px, pestaña Takes):
      NFL    → Tu Take → opiniones → «Últimos Takes» → ranking → Demuestra tu conocimiento
      Fútbol → opiniones → «Últimos Takes» → ranking → Demuestra tu conocimiento (sin Tu Take)
  · Escritorio (1366 px, página continua; las opiniones van en la columna lateral):
      NFL    → Tu Take → «Últimos Takes» → ranking → Demuestra tu conocimiento
      Fútbol → «Últimos Takes» → ranking → Demuestra tu conocimiento
  · «Demuestra tu conocimiento» es lo último que se ve dentro de Takes.
  · En La semana no aparece «Tu Take».
De día y de noche, pasando NFL → Fútbol → NFL → Fútbol, sin errores de consola.

Uso: python3 -B tests/takes-orden.py
"""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
BASE = (ROOT / 'tests/nfl-duelo.py').read_text(encoding='utf8').split('BASE = r"""', 1)[1].split('"""', 1)[0]

ORDER = """() => {
  const top = el => el && el.getClientRects().length ? el.getBoundingClientRect().top + scrollY : null;
  const feed = document.getElementById('freeTakes');
  const parts = {
    prompt: document.getElementById('camNflTakePrompt'),
    leaders: document.getElementById('aeSportTakeLeaders'),
    latest: document.getElementById('aeTakesFeedHeading'),
    ranking: document.getElementById('aeSportTakeRanking'),
    cta: feed.querySelector(':scope > .ae-takes-head')
  };
  const out = {};
  for (const [k, el] of Object.entries(parts)) out[k] = el && feed.contains(el) ? top(el) : null;
  const shown = [...feed.children].filter(e => e.getClientRects().length && e.getBoundingClientRect().height > 1);
  out.last = shown.length ? (shown[shown.length - 1].id || shown[shown.length - 1].className) : null;
  out.promptText = parts.prompt.textContent.replace(/\\s+/g, ' ').trim();
  out.overflow = document.documentElement.scrollWidth - innerWidth;
  return out;
}"""
EXPECT = {
    (True, 'NFL'): ['prompt', 'leaders', 'latest', 'ranking', 'cta'],
    (True, 'Fútbol'): ['leaders', 'latest', 'ranking', 'cta'],
    (False, 'NFL'): ['prompt', 'latest', 'ranking', 'cta'],
    (False, 'Fútbol'): ['latest', 'ranking', 'cta'],
}


def go(page, cat, mobile):
    if mobile:
        page.click(f'body > nav.cam-mobile-bottom-nav > button[data-category="{cat}"]')
        page.wait_for_timeout(700)
        # Al volver a un deporte se abre la última pestaña elegida: pasar antes por La semana.
        page.click('#camSectionTabs button[data-tab="semana"]'); page.wait_for_timeout(400)
        semana_prompt = page.evaluate("document.getElementById('camNflTakePrompt').getClientRects().length")
        assert semana_prompt == 0, f'{cat}: «Tu Take» se ve en La semana'
        page.click('#camSectionTabs button[data-tab="takes"]')
    else:
        page.evaluate('cat => window.filterByCategory(cat)', cat)
    page.wait_for_timeout(1000)
    return page.evaluate(ORDER)


def run(width, dark):
    mobile = width < 760
    where = f'{width}px {"noche" if dark else "día"}'
    with fp.full_page(fake_js=BASE, dark=dark, width=width, height=900, scale=1) as page:
        page.wait_for_timeout(600)
        for cat in ('NFL', 'Fútbol', 'NFL', 'Fútbol'):
            st = go(page, cat, mobile)
            expected = EXPECT[(mobile, cat)]
            assert all(st[k] is not None for k in expected), f'{where} {cat}: falta algo visible {st}'
            got = sorted(expected, key=lambda k: st[k])
            assert got == expected, f'{where} {cat}: orden {got}, esperado {expected}'
            if cat == 'NFL':
                assert '¿Qué crees que va a pasar?' in st['promptText'] and '«Los Lions ganan por más de 10…»' in st['promptText'], f'{where}: {st["promptText"]}'
            else:
                assert st['prompt'] is None, f'{where} {cat}: «Tu Take» de NFL se ve en Fútbol'
            assert st['last'] == 'ae-takes-head', f'{where} {cat}: lo último de Takes es {st["last"]}'
            assert st['overflow'] <= 0, f'{where} {cat}: desborda {st["overflow"]}'
        assert not page.errors, f'{where}: errores {page.errors}'
    print('ok', where)


for width in (390, 1366):
    for dark in (False, True):
        run(width, dark)
print('takes-orden: todo bien')
