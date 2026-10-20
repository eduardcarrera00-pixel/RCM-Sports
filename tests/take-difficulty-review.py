"""Prueba del panel admin de Takes por dificultad (Chromium real vía Playwright).

Carga index.html sin sus scripts, inyecta un `db` falso y el módulo
assets/ae-take-rankings.js, y recorre el flujo: clasificar → marcar resultado.
Uso: python3 tests/take-difficulty-review.py
"""
import pathlib, re, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf8')
html = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', html, flags=re.I)
html = re.sub(r'<link\b[^>]*>', '', html, flags=re.I)  # sin red: estilos fuera
module = (ROOT / 'assets/ae-take-rankings.js').read_text(encoding='utf8')

FAKE_DB = r"""
window.calls=[];
const takes=[
  {id:'t-futbol',title:'Elche termina en Champions',author:'pepe',sport:'football',created_at:'2026-10-01T12:00:00Z',outcome:null,points:null},
  {id:'t-viejo',title:'Take ya puntuado',author:'ana',sport:'football',created_at:'2026-09-01T12:00:00Z',outcome:'won',points:9}
];
const classes={};
window.currentAdmin={id:'editor'};
const q=(table)=>{const b={_t:table,select(){return b;},in(){return b;},
  then(res,rej){
    let data=[];
    if(table==='ae_outlook_snapshots')data=[{id:'s1',competition:'laliga',season:'2026/27'},{id:'s2',competition:'premier',season:'2026/27'}];
    if(table==='ae_outlook_teams')data=[{snapshot_id:'s1',team:'Real Madrid'},{snapshot_id:'s1',team:'Elche'},{snapshot_id:'s2',team:'Arsenal'}];
    if(table==='ae_take_classifications')data=Object.values(classes);
    return Promise.resolve({data,error:null}).then(res,rej);
  }};return b;};
window.db={from:q,rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='ae_take_review_queue')return {data:args.p_sport==='football'?takes:[],error:null};
  if(name==='ae_take_result_ranking_details'||name==='ae_take_result_ranking_rookies')return {data:[],error:null};
  if(name==='ae_classify_free_take'){
    const pts=args.p_method==='tier'&&args.p_tier==='casi_seguro'?0:20;
    const row={probability:pts?0.0043:0.92,points:pts,trivial:!pts,snapshot_id:'s1'};
    classes[args.p_take_id]={take_id:args.p_take_id,method:args.p_method,difficulty_points:pts,probability:row.probability,trivial:!pts,
      competition:args.p_competition,team:args.p_team,condition:args.p_condition,target_position:args.p_position,tier:args.p_tier};
    return {data:[row],error:null};
  }
  if(name==='ae_score_free_take_auto'){const c=classes[args.p_take_id];return {data:args.p_outcome==='won'?c.difficulty_points:0,error:null};}
  throw Error('rpc inesperado '+name);
}};
"""

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 390, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(html)
        page.add_script_tag(content=FAKE_DB)
        page.add_script_tag(content=module)
        page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")
        page.evaluate("window.aeTakeRankings.setSport('Fútbol')")
        page.wait_for_selector('.ae-take-review-entry')
        entries = page.locator('.ae-take-review-entry')
        assert entries.count() == 2, entries.count()
        first = entries.nth(0)

        # Sin clasificar: no se puede guardar el resultado
        assert 'Sin clasificar' in first.locator('.ae-take-review-difficulty').inner_text()
        assert first.locator('button[type=submit]').is_disabled()
        # Método tabla por defecto en fútbol, con equipos de la matriz 2026/27
        assert first.locator('select[name=method]').input_value() == 'table'
        teams = first.locator('select[name=team] option').all_inner_texts()
        assert teams == ['Elche', 'Real Madrid'], teams
        assert first.locator('select[name=tier]').is_hidden()

        # Clasificar: Elche, 4º o mejor
        first.locator('select[name=team]').select_option('Elche')
        first.locator('input[name=position]').fill('4')
        first.locator('button[name=classify]').click()
        page.wait_for_function("document.querySelector('.ae-take-review-difficulty').dataset.state==='ready'")
        badge = first.locator('.ae-take-review-difficulty').inner_text()
        assert '20 pts' in badge and '0.4%' in badge, badge
        call = page.evaluate("calls.find(c=>c.name==='ae_classify_free_take')")
        assert call['args'] == {'p_take_id': 't-futbol', 'p_method': 'table', 'p_rescore': False,
                                'p_competition': 'laliga', 'p_season': '2026/27', 'p_team': 'Elche',
                                'p_condition': 'at_or_above', 'p_position': 4}, call

        # Resultado: acertado → +20
        first.locator('select[name=outcome]').select_option('won')
        assert first.locator('.ae-take-review-preview').inner_text() == '+20 pts'
        first.locator('button[type=submit]').click()
        page.wait_for_function("calls.some(c=>c.name==='ae_score_free_take_auto')")
        page.wait_for_function("/\\+20 pts/.test(document.getElementById('aeTakeReviewStatus').textContent)")
        score = page.evaluate("calls.find(c=>c.name==='ae_score_free_take_auto')")
        assert score['args'] == {'p_take_id': 't-futbol', 'p_outcome': 'won'}, score

        # Take ya puntuado: recalcular usa p_rescore y nivel trivial bloquea guardar
        page.wait_for_selector('.ae-take-review-entry >> nth=1')
        second = page.locator('.ae-take-review-entry').nth(1)
        second.locator('select[name=method]').select_option('tier')
        assert second.locator('select[name=team]').is_hidden()
        second.locator('select[name=tier]').select_option('casi_seguro')
        second.locator('button[name=classify]').click()
        page.wait_for_function("calls.filter(c=>c.name==='ae_classify_free_take').length===2")
        last = page.evaluate("calls.filter(c=>c.name==='ae_classify_free_take').pop()")
        assert last['args']['p_rescore'] is True and last['args']['p_tier'] == 'casi_seguro', last
        page.wait_for_function("document.querySelectorAll('.ae-take-review-difficulty')[1].dataset.state==='trivial'")
        assert second.locator('button[type=submit]').is_disabled()
        assert 'no se puntúa' in second.locator('.ae-take-review-preview').inner_text()

        # Cuota inválida no llama al servidor
        before = page.evaluate("calls.length")
        second.locator('select[name=method]').select_option('odds')
        second.locator('input[name=odds]').fill('50')
        second.locator('button[name=classify]').click()
        assert page.evaluate("calls.length") == before
        assert 'cuota americana' in page.locator('#aeTakeReviewStatus').inner_text()

        # Sin admin, el panel se oculta
        page.evaluate("window.currentAdmin=null; window.aeTakeRankings.refresh()")
        page.wait_for_function("document.getElementById('aeTakeReview').hidden")
        assert not errors, errors
        browser.close()
    print('PASS: clasificar dificultad (tabla/nivel/cuota), guardar resultado, recalcular y bloqueo de triviales.')

if __name__ == '__main__':
    try:
        run()
    except AssertionError as e:
        print('FAIL:', e); sys.exit(1)
