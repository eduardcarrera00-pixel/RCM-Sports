"""Predicciones de temporada en Picks, sobre la página completa (Chromium + Supabase falso).
Uso: python3 tests/season-predictions.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None

LALIGA = ['FC Barcelona', 3, 'Real Madrid', 6, 'Atlético de Madrid', 9, 'Sevilla', 15, 'Elche', 20, 'Otro club', 20]
PREMIER = ['Arsenal', 5, 'Manchester City', 5, 'Liverpool', 9, 'Tottenham', 20]


def fake(user=None, admin=False, predictions=()):
    def opts(qid, pairs):
        return [{'id': f'{qid}-{i}', 'question_id': qid, 'label': pairs[i], 'points': pairs[i + 1]} for i in range(0, len(pairs), 2)]
    tables = {
        'ae_take_questions': [
            {'id': 'qL', 'competition': 'laliga', 'period': 'season', 'prompt': '¿Quién será campeón de LaLiga 2026/27?', 'closes_at': '2099-10-30T23:59:00Z', 'points': 25, 'status': 'open', 'correct_option_id': None, 'settled_at': None},
            {'id': 'qP', 'competition': 'premier', 'period': 'season', 'prompt': '¿Quién será campeón de la Premier League 2026/27?', 'closes_at': '2099-10-30T23:59:00Z', 'points': 25, 'status': 'open', 'correct_option_id': None, 'settled_at': None},
            {'id': 'qW', 'competition': 'premier', 'period': 'weekly', 'prompt': '¿Cómo terminará Everton vs Chelsea (90 minutos)?', 'closes_at': '2026-10-17T11:25:00Z', 'points': 5, 'status': 'open', 'correct_option_id': None, 'settled_at': None},
        ],
        'ae_take_options': opts('qL', LALIGA) + opts('qP', PREMIER) + [
            {'id': 'qW-0', 'question_id': 'qW', 'label': 'Gana Everton', 'points': None},
            {'id': 'qW-1', 'question_id': 'qW', 'label': 'Empate', 'points': None}],
        'ae_take_predictions': [dict(p, user_id=user['id']) for p in predictions] if user else [],
    }
    return ('window.__fake.tables=' + json.dumps(tables) + ';'
            'window.__fake.user=' + json.dumps(user) + ';'
            + ('window.__fake.tables.editors=[{user_id:' + json.dumps(user['id']) + '}];' if admin else '')
            + """window.__fake.rpc=window.__fake.rpc||{};window.__fake.calls=window.__fake.calls||[];
                 window.__fake.rpc.ae_submit_take=a=>{window.__fake.tables.ae_take_predictions.push({question_id:a.p_question_id,option_id:a.p_option_id,awarded_points:0,user_id:window.__fake.user.id});return {data:true,error:null};};
                 window.__fake.rpc.ae_settle_take=a=>({data:1,error:null});
                 window.confirm=()=>true;""")


def open_picks(page):
    page.evaluate("filterByCategory('Picks')")
    page.wait_for_selector('#aeSeasonPredictions:not([hidden]) .ae-season-card', timeout=15000)


def run():
    # 1) Visitante: ve las abiertas con puntos; la semanal cerrada no aparece; votar pide iniciar sesión
    with fp.full_page(fake_js=fake()) as page:
        open_picks(page)
        tabs = page.locator('#aeSeasonTabs button').all_inner_texts()
        assert tabs == ['LaLiga', 'Premier League'], tabs
        card = page.locator('#aeSeasonList .ae-season-card')
        assert card.count() == 1
        assert 'De 3 a 20 pts' in card.locator('.ae-season-meta').text_content()
        labels = card.locator('.ae-season-option-label').all_inner_texts()
        assert labels == ['FC Barcelona', 'Real Madrid', 'Atlético de Madrid', 'Sevilla', 'Elche', 'Otro club'], labels
        assert card.locator('.ae-season-option-points').all_inner_texts()[:2] == ['+3', '+6']
        page.locator('#aeSeasonTabs button', has_text='Premier League').click()
        assert page.locator('#aeSeasonList .ae-season-card').count() == 1, 'la semanal cerrada no se muestra al público'
        assert 'Everton' not in page.locator('#aeSeasonList').inner_text()
        if SHOTS:
            page.locator('#aeSeasonTabs button', has_text='LaLiga').click()
            page.locator('#aeSeasonPredictions').screenshot(path=f'{SHOTS}/season-light.png')
        page.evaluate("window.__opened=0; window.openUserAuthModal=()=>{window.__opened++;}; 0")
        page.locator('#aeSeasonList .ae-season-option').first.click()
        assert page.evaluate('window.__opened') == 1
        assert not any(c.get('rpc') == 'ae_submit_take' for c in page.evaluate('window.__fake.calls'))
        assert not page.errors, page.errors

    # 2) Usuario: predice Elche (+20) y queda bloqueado con su elección
    user = {'id': 'u1', 'email': 'pepe@example.com', 'is_anonymous': False, 'user_metadata': {'username': 'pepe'}}
    with fp.full_page(fake_js=fake(user=user), dark=True) as page:
        open_picks(page)
        page.locator('#aeSeasonList .ae-season-option', has_text='Elche').click()
        page.wait_for_selector('#aeSeasonList .ae-season-option.is-chosen')
        call = [c for c in page.evaluate('window.__fake.calls') if c.get('rpc') == 'ae_submit_take'][0]
        assert call['args'] == {'p_question_id': 'qL', 'p_option_id': 'qL-8'}, call
        assert 'Tu elección: Elche · +20 pts si aciertas' in page.locator('#aeSeasonList .ae-season-note').inner_text()
        assert page.locator('#aeSeasonList .ae-season-option:not([disabled])').count() == 0
        if SHOTS:
            page.locator('#aeSeasonPredictions').screenshot(path=f'{SHOTS}/season-dark-chosen.png')
        assert not page.errors, page.errors

    # 3) Admin: ve la semanal cerrada para validarla
    with fp.full_page(fake_js=fake(user=user, admin=True)) as page:
        open_picks(page)
        page.locator('#aeSeasonTabs button', has_text='Premier League').click()
        weekly = page.locator('#aeSeasonList .ae-season-card', has_text='Everton')
        assert weekly.count() == 1
        assert 'pendiente de resultado' in weekly.locator('.ae-season-meta').text_content().lower()
        weekly.locator('select').select_option('qW-1')
        weekly.locator('button', has_text='Validar resultado').click()
        page.wait_for_function("window.__fake.calls.some(c=>c.rpc==='ae_settle_take')")
        call = [c for c in page.evaluate('window.__fake.calls') if c.get('rpc') == 'ae_settle_take'][0]
        assert call['args'] == {'p_question_id': 'qW', 'p_option_id': 'qW-1'}, call
        assert not page.errors, page.errors
    print('PASS: predicciones de temporada (visitante, usuario que predice y admin que valida).')


if __name__ == '__main__':
    try:
        run()
    except AssertionError as e:
        import traceback; traceback.print_exc(); sys.exit(1)
