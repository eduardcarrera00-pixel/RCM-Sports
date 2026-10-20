"""Pick de campeón en Fútbol y NFL (Chromium + Supabase falso).
Uso: python3 tests/season-predictions.py [--shots DIR]
"""
import importlib.util, json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('full_page', ROOT / 'tests/full-page.py')
fp = importlib.util.module_from_spec(spec); spec.loader.exec_module(fp)
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None

LALIGA = ['FC Barcelona', 3, 'Real Madrid', 6, 'Atlético de Madrid', 9, 'Sevilla', 15, 'Elche', 20, 'Otro club', 20]
PREMIER = ['Arsenal', 5, 'Manchester City', 5, 'Liverpool', 9, 'Tottenham', 20]
NFL = ['San Francisco 49ers', 4, 'Kansas City Chiefs', 5, 'Buffalo Bills', 6, 'Dallas Cowboys', 20]


def fake(user=None, admin=False, predictions=()):
    def opts(qid, pairs):
        return [{'id': f'{qid}-{i}', 'question_id': qid, 'label': pairs[i], 'points': pairs[i + 1]} for i in range(0, len(pairs), 2)]
    tables = {
        'ae_take_questions': [
            {'id': 'qL', 'competition': 'laliga', 'period': 'season', 'prompt': '¿Quién será campeón de LaLiga 2026/27?', 'closes_at': '2099-10-30T23:59:00Z', 'points': 25, 'status': 'open', 'correct_option_id': None, 'settled_at': None},
            {'id': 'qP', 'competition': 'premier', 'period': 'season', 'prompt': '¿Quién será campeón de la Premier League 2026/27?', 'closes_at': '2099-10-30T23:59:00Z', 'points': 25, 'status': 'open', 'correct_option_id': None, 'settled_at': None},
            {'id': 'qN', 'competition': 'nfl', 'period': 'season', 'prompt': '¿Quién será campeón de la NFL 2026/27?', 'closes_at': '2099-10-30T23:59:00Z', 'points': 20, 'status': 'open', 'correct_option_id': None, 'settled_at': None},
            {'id': 'qW', 'competition': 'premier', 'period': 'weekly', 'prompt': '¿Cómo terminará Everton vs Chelsea (90 minutos)?', 'closes_at': '2026-10-17T11:25:00Z', 'points': 5, 'status': 'open', 'correct_option_id': None, 'settled_at': None},
        ],
        'ae_take_options': opts('qL', LALIGA) + opts('qP', PREMIER) + opts('qN', NFL) + [
            {'id': 'qW-0', 'question_id': 'qW', 'label': 'Gana Everton', 'points': None},
            {'id': 'qW-1', 'question_id': 'qW', 'label': 'Empate', 'points': None}],
        'ae_take_predictions': [dict(p, user_id=user['id']) for p in predictions] if user else [],
        'nfl_teams': [
            {'name': 'San Francisco 49ers', 'logo': 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png'},
            {'name': 'Kansas City Chiefs', 'logo': 'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png'},
            {'name': 'Buffalo Bills', 'logo': 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png'},
            {'name': 'Dallas Cowboys', 'logo': 'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png'}],
    }
    return ("try{sessionStorage.setItem('cam_sports_home_welcome_seen_session_v1','1')}catch(e){};"
            'window.__fake.tables=' + json.dumps(tables) + ';'
            'window.__fake.user=' + json.dumps(user) + ';'
            + ('window.__fake.tables.editors=[{user_id:' + json.dumps(user['id']) + '}];'
               # Los admins ven una vez la vista previa de la bienvenida; aquí ya se vio.
               "try{localStorage.setItem('cam_sports_admin_welcome_preview_'+" + json.dumps(user['id']) + ",'1')}catch(e){}" if admin else '')
            + """window.__fake.rpc=window.__fake.rpc||{};window.__fake.calls=window.__fake.calls||[];
                 window.__fake.rpc.ae_submit_take=a=>{window.__fake.tables.ae_take_predictions.push({question_id:a.p_question_id,option_id:a.p_option_id,awarded_points:0,user_id:window.__fake.user.id});return {data:true,error:null};};
                 window.__fake.rpc.ae_settle_take=a=>({data:1,error:null});
                 window.confirm=()=>true;""")


def open_sport(page, sport='Fútbol'):
    page.evaluate("sport => filterByCategory(sport)", sport)
    page.wait_for_selector('#aeSeasonPredictions:not([hidden]) .ae-season-card', timeout=15000)


def run():
    # 1) Visitante: ve las abiertas con puntos; la semanal cerrada no aparece; votar pide iniciar sesión
    with fp.full_page(fake_js=fake()) as page:
        open_sport(page)
        tabs = page.locator('#aeSeasonTabs button').all_inner_texts()
        assert tabs == ['LaLiga', 'Premier League'], tabs
        card = page.locator('#aeSeasonList .ae-season-card')
        assert card.count() == 1
        assert 'De 3 a 20 pts' in card.locator('.ae-season-meta').text_content()
        labels = card.locator('.ae-season-option .sr-only').all_text_contents()
        assert labels == ['FC Barcelona', 'Real Madrid', 'Atlético de Madrid', 'Sevilla', 'Elche', 'Otro club'], labels
        assert card.locator('.ae-season-option-points').all_inner_texts()[:2] == ['+3', '+6']
        # Sin red los escudos de ESPN fallan y se quitan; se comprueba que cada club tiene escudo asignado.
        assert page.evaluate("['FC Barcelona','Real Madrid','Atlético de Madrid','Sevilla','Elche'].every(t=>window.aeSeasonPredictions.crest('laliga',t))"), 'deben verse escudos en lugar de nombres'
        assert page.locator('#aeSeasonPredictions').evaluate("n=>n.previousElementSibling.id") == 'aeNflTakeFooterCta'
        assert page.locator('#aeSeasonPredictions').evaluate("n=>n.nextElementSibling.id") == 'aeSportTakeRanking'
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
        open_sport(page)
        page.locator('#aeSeasonList .ae-season-option', has_text='Elche').click()
        page.wait_for_selector('#aeSeasonList .ae-season-option.is-chosen')
        call = [c for c in page.evaluate('window.__fake.calls') if c.get('rpc') == 'ae_submit_take'][0]
        assert call['args'] == {'p_question_id': 'qL', 'p_option_id': 'qL-8'}, call
        assert 'Tu elección: Elche · +20 pts si aciertas' in page.locator('#aeSeasonList .ae-season-note').inner_text()
        assert 'Takes' in page.locator('#aeSeasonStatus').inner_text(), 'los puntos van a Takes'
        assert page.locator('#aeSeasonList button', has_text='Anular').count() == 0, 'la elección es definitiva'
        assert page.locator('#aeSeasonList .ae-season-option:not([disabled])').count() == 0
        if SHOTS:
            page.locator('#aeSeasonPredictions').screenshot(path=f'{SHOTS}/season-dark-chosen.png')
        assert not page.errors, page.errors

    # 3) Admin: en la pregunta abierta ya elegida no hay botones; ve la semanal cerrada para validarla
    with fp.full_page(fake_js=fake(user=user, admin=True, predictions=[{'question_id': 'qL', 'option_id': 'qL-0', 'awarded_points': 0}])) as page:
        open_sport(page)
        assert page.locator('#aeSeasonList .ae-season-card').first.locator('button', has_text='Anular').count() == 0
        assert page.locator('#aeSeasonList .ae-season-admin').count() == 0
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

    # 4) NFL reutiliza el mismo componente y no mezcla competiciones de fútbol.
    with fp.full_page(fake_js=fake()) as page:
        open_sport(page, 'NFL')
        assert 'NFL 2026/27' in page.locator('#aeSeasonList .ae-season-card h3').inner_text()
        assert page.locator('#aeSeasonList .ae-season-option').count() == 4
        assert page.evaluate("['San Francisco 49ers','Dallas Cowboys'].every(t=>window.aeSeasonPredictions.crest('nfl',t))")
        page.evaluate("filterByCategory('Picks')")
        assert page.locator('#aeSeasonPredictions').is_hidden()
        assert not page.errors, page.errors
    print('PASS: predicciones de temporada (visitante, usuario que predice y admin que valida).')


if __name__ == '__main__':
    try:
        run()
    except AssertionError as e:
        import traceback; traceback.print_exc(); sys.exit(1)
