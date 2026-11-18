"""Borradores de Takes sin cuenta (18 nov 2026).

Desde el 18 nov el Take se puede escribir antes de tener cuenta: la cuenta se
pide al publicar. Página completa en Chromium (Supabase falso, sin red).

Cubre (ae-draft-guard.js):
  · sin sesión, el borrador se guarda en este navegador como «anon»;
  · al iniciar sesión con el formulario lleno, la cuenta se queda con el texto
    y el «anon» desaparece;
  · si el borrador «anon» quedó guardado (otra visita), la primera cuenta que
    abre el formulario lo recupera, salvo que ya tuviera uno propio;
  · al cerrar sesión no se ve el borrador de la cuenta; si escribe otro sin
    sesión y vuelve a entrar, lo escrito en el formulario pasa a su cuenta;
  · con sesión todo sigue como siempre (tests/draft-guard.mjs).

Uso: python3 -B tests/draft-guard-anon.py
"""
import importlib.util, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)

SCENARIO = r"""async () => {
  const F = window.__fake, guard = window.aeDraftGuard, form = document.getElementById('freeTakesForm');
  const key = id => 'ae-sports-draft-v1:take:' + id;
  const body = () => form.elements.body.value;
  const type = text => { form.elements.competition.value = 'NFL'; form.elements.body.value = text;
    form.dispatchEvent(new Event('input', {bubbles: true})); return guard.save('take'); };
  const out = {};
  F.user = null;
  await guard.restore('take');
  out.anonSaved = type('Lo dije antes que nadie') && (localStorage.getItem(key('anon')) || '').includes('antes que nadie');
  F.user = {id: 'A'};
  await guard.restore('take');
  out.adopted = (localStorage.getItem(key('A')) || '').includes('antes que nadie') && localStorage.getItem(key('anon')) === null && body() === 'Lo dije antes que nadie';
  F.user = null;
  await guard.restore('take');
  out.loggedOutHidden = body() === '';
  type('Otro borrador sin cuenta');
  F.user = {id: 'A'};
  await guard.restore('take');
  // Lo que está escrito en el formulario manda: pasa a la cuenta que entra.
  out.typingWins = body() === 'Otro borrador sin cuenta' && (localStorage.getItem(key('A')) || '').includes('Otro borrador') && localStorage.getItem(key('anon')) === null;
  return out;
}"""

FRESH = r"""async () => {
  const F = window.__fake, guard = window.aeDraftGuard, form = document.getElementById('freeTakesForm');
  localStorage.setItem('ae-sports-draft-v1:take:anon', JSON.stringify({version: 1, updated: Date.now(),
    data: {sport: 'nfl', competition: 'NFL', title: 'Los Lions campeones', body: 'De otra visita'}}));
  F.user = {id: 'B'};
  await guard.restore('take');
  return {recovered: form.elements.body.value === 'De otra visita',
          moved: !!localStorage.getItem('ae-sports-draft-v1:take:B') && localStorage.getItem('ae-sports-draft-v1:take:anon') === null};
}"""

with fp.full_page(width=390, height=844) as page:
    r = page.evaluate(SCENARIO)
    assert all(r.values()), r
    assert not page.errors, page.errors
with fp.full_page(width=390, height=844) as page:
    r = page.evaluate(FRESH)
    assert all(r.values()), r
print('PASS: borradores de Takes sin cuenta: se guardan, pasan a la cuenta al entrar y no se mezclan.')
