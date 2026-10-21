"""Prueba del perfil de prestigio de Takes (Chromium real vía Playwright, con un `db` falso).
Uso: python3 tests/take-difficulty-public.py [--shots DIR]
"""
import pathlib, re, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None


def page_html():
    html = (ROOT / 'index.html').read_text(encoding='utf8')
    html = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', html, flags=re.I)
    links = re.findall(r'<link\b[^>]*rel="stylesheet"[^>]*href="(assets/[^"?]+)', html)
    html = re.sub(r'<link\b[^>]*>', '', html, flags=re.I)
    css = ''.join((ROOT / href).read_text(encoding='utf8') for href in links if (ROOT / href).exists())
    return html, css


FAKE = r"""
window.calls=[];
const USER='11111111-1111-4111-8111-111111111111';
const QID='41df762f-a97c-4e3d-8044-842f86470056', QOLD='22222222-2222-4222-8222-222222222222';
const tables={
  ae_take_questions:[
    {id:QID,competition:'laliga',period:'season',prompt:'¿Quién será campeón de LaLiga 2026/27?',points:25,status:'open',closes_at:'2099-10-30T23:59:00Z',correct_option_id:null},
    {id:QOLD,competition:'premier',period:'weekly',prompt:'¿Cómo terminará Everton vs Chelsea (90 minutos)?',points:5,status:'open',closes_at:'2099-10-25T18:00:00Z',correct_option_id:null}],
  ae_take_options:[
    {id:'o1',question_id:QID,label:'FC Barcelona',points:3},{id:'o2',question_id:QID,label:'Real Madrid',points:6},
    {id:'o3',question_id:QID,label:'Atlético de Madrid',points:9},{id:'o4',question_id:QID,label:'Elche',points:20},
    {id:'p1',question_id:QOLD,label:'Gana Everton',points:null},{id:'p2',question_id:QOLD,label:'Empate',points:null}],
  ae_take_predictions:[]
};
const query=t=>{const q={select:()=>q,neq:()=>q,order:()=>q,limit:()=>q,in:()=>q,eq:()=>q,
  then:(ok,ko)=>Promise.resolve({data:tables[t]||[],error:null}).then(ok,ko)};return q;};
const CREST=c=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 46"><path d="M3 3h34v20c0 11-8 18-17 21C11 41 3 34 3 23z" fill="'+c+'" stroke="#1d2b36" stroke-width="2"/><path d="M20 3v41" stroke="#fff" stroke-width="5"/></svg>');
window.aeSeasonPredictions={crest:(c,t)=>({'Elche':CREST('#0f7a3d'),'Paris Saint-Germain':CREST('#14315f'),'Arsenal':CREST('#c8102e')})[t]||''};
tables.nfl_teams=[{name:'Kansas City Chiefs',logo:CREST('#e31837')}];
window.currentCategory='Picks';
window.confirm=()=>false;
window.db={from:query,auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange(){}},
  rpc:async(name,args)=>{
    calls.push({name,args});
    if(name==='ae_take_leaderboard'||name==='ae_pick_top_choices')return {data:[],error:null};
    if(name==='ae_public_take_profile')return {data:[{id:'t1',author_id:USER,author:'nostradamus',sport:'football',title:'Elche termina en Champions',body:'Lo veo claro.',created_at:'2026-08-10T10:00:00Z',upvotes:4,downvotes:9,my_vote:null}],error:null};
    if(name==='ae_take_prestige')return {data:[{resolved:7,risk_score:10.7,risk_label:'Atrevido',bold_attempts:5,bold_hits:2,bold_rate:40,legendary_count:1,rated_points:41}],error:null};
    if(name==='ae_take_legendary')return {data:[{take_id:'t1',title:'Elche termina en Champions',competition:'LaLiga',season_label:'2026/27',points:20,probability:0.0043,scored_at:'2027-05-30T10:00:00Z'}],error:null};
    if(name==='ae_user_champion_picks')return {data:[
      {question_id:QID,competition:'laliga',season:'2026/27',prompt:'¿Quién será campeón de LaLiga 2026/27?',team:'Elche',points:20,state:'open',awarded_points:0,winner:null,closes_at:'2099-10-30T23:59:00Z'},
      {question_id:'qC',competition:'champions',season:'2026/27',prompt:'¿Quién será campeón de la Champions 2026/27?',team:'Paris Saint-Germain',points:8,state:'pending',awarded_points:0,winner:null,closes_at:'2026-10-30T23:59:00Z'},
      {question_id:'qN',competition:'nfl',season:'2025/26',prompt:'¿Quién será campeón de la NFL 2025/26?',team:'Kansas City Chiefs',points:5,state:'won',awarded_points:5,winner:'Kansas City Chiefs'},
      {question_id:'qP',competition:'premier',season:'2025/26',prompt:'¿Quién será campeón de la Premier 2025/26?',team:'Arsenal',points:5,state:'lost',awarded_points:0,winner:'Liverpool'}],error:null};
    throw Error('rpc inesperado '+name);
  }};
"""


def run():
    html, css = page_html()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 390, 'height': 1000}, device_scale_factor=2)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.set_content(html)
        page.add_style_tag(content=css)
        page.add_script_tag(content=FAKE)
        page.add_script_tag(path=str(ROOT / 'assets/ae-profile.js'))
        page.evaluate("document.dispatchEvent(new Event('DOMContentLoaded'))")

        # 2) Perfil público con prestigio
        page.evaluate("window.openAePublicProfile('11111111-1111-4111-8111-111111111111',false)")
        page.wait_for_function("document.querySelector('#aeProfilePrestige .ae-profile-medal')")
        prestige = page.locator('#aeProfilePrestige')
        assert prestige.is_visible()
        text = prestige.text_content()
        for expected in ['PERFIL DE PRESTIGIO', 'Atrevido', '10,7', '40%', '2 de 5', 'Legendarios',
                         'Epic Prediction 2026/27', 'Elche termina en Champions', '+20 pts', '0,4%',
                         'Campeones elegidos', 'LaLiga 2026/27', 'pts si acierta', 'Kansas City Chiefs', 'pts ganados',
                         'Campeón confirmado', 'Campeón: Liverpool', '2 en juego', '1 acierto, +5 pts']:
            assert expected in text, (expected, text)
        assert page.locator('#aeProfilePrestige .ae-champ').count() == 4
        page.wait_for_function("document.querySelectorAll('#aeProfilePrestige .ae-champ-medal img').length===4")
        # Se oculta en la pestaña de Picks y vuelve en Takes
        page.evaluate("document.getElementById('aeProfileTabPicks').click()")
        assert prestige.is_hidden()
        page.evaluate("document.getElementById('aeProfileTabTakes').click()")
        assert prestige.is_visible()
        if SHOTS:
            prestige.screenshot(path=f'{SHOTS}/prestigio.png')
            cab = page.locator('#aeProfilePrestige .ae-champ-cabinet')
            cab.screenshot(path=f'{SHOTS}/campeones-movil.png')
            page.evaluate("document.documentElement.classList.add('dark')")
            cab.screenshot(path=f'{SHOTS}/campeones-noche.png')
            page.evaluate("document.documentElement.classList.remove('dark')")
            page.set_viewport_size({'width': 900, 'height': 1000})
            cab.screenshot(path=f'{SHOTS}/campeones-escritorio.png')
            page.set_viewport_size({'width': 390, 'height': 1000})

        # 3) Perfil sin Takes puntuados: mensaje, sin estadísticas
        page.evaluate("""() => {
          const old = db.rpc;
          db.rpc = async (n, a) => n === 'ae_take_prestige' ? {data:[{resolved:0,risk_score:null,risk_label:null,bold_attempts:0,bold_hits:0,bold_rate:null,legendary_count:0,rated_points:0}],error:null}
            : n === 'ae_take_legendary' || n === 'ae_user_champion_picks' ? {data:[],error:null} : old(n, a);
          window.closeAeProfile && window.closeAeProfile();
          window.openAePublicProfile('33333333-3333-4333-8333-333333333333', false);
        }""")
        page.wait_for_function("/todavía no tiene Takes puntuados/i.test(document.getElementById('aeProfilePrestige').textContent)")
        assert page.locator('#aeProfilePrestige .ae-profile-prestige-stat').count() == 0
        assert page.locator('#aeProfilePrestige .ae-champ').count() == 0
        assert not errors, errors
        browser.close()
    print('PASS: perfil de prestigio (stats, medallas, pestañas y estado vacío).')


if __name__ == '__main__':
    try:
        run()
    except AssertionError as e:
        print('FAIL:', e); sys.exit(1)
