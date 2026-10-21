"""Panel admin de Picks: oculta lo que la verificación automática aún puede confirmar
y muestra el historial de resultados al final. Uso: python3 tests/pick-settle-history.py"""
import pathlib, re, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf8')
html = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', html, flags=re.I)
html = re.sub(r'<link\b[^>]*>', '', html, flags=re.I)
module = (ROOT / 'assets/community-picks.js').read_text(encoding='utf8')
FAKE = r"""
window.currentAdmin={id:'editor'};
const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Toronto'});
const pending=[
 {id:'p-wait',title:'Santos vs Pumas',author:'u1',event_date:today,american_odds:190,legs:[{event:'Santos vs Pumas',selection:'Pumas'}],outcome:'pending',moderation_status:'approved'},
 {id:'p-review',title:'Pick raro',author:'u2',event_date:'2026-10-18',american_odds:-110,legs:[],outcome:'pending',moderation_status:'approved'},
 {id:'p-queued',title:'Pick nuevo',author:'u3',event_date:today,american_odds:150,legs:[],outcome:'pending',moderation_status:'approved'}];
const settled=[
 {id:'s1',title:'América gana',author:'ana',event_date:'2026-10-19',american_odds:120,outcome:'won',settled_at:'2026-10-20T03:00:00Z',result_points:2.2},
 {id:'s2',title:'Chivas gana',author:'leo',event_date:'2026-10-19',american_odds:150,outcome:'lost',settled_at:'2026-10-20T02:00:00Z',result_points:0}];
const checks=[{pick_id:'p-wait',status:'waiting',reason:'No encontramos el partido.'},{pick_id:'p-review',status:'needs_review',reason:'Mercado no reconocido.'},{pick_id:'s1',status:'settled'}];
const q=(table)=>{const f={};const b={select(){return b;},order(){return b;},limit(){return b;},range(){return b;},or(){return b;},
 eq(k,v){f[k]=v;return b;},in(k,v){f[k]=v;return b;},neq(){return b;},gte(){return b;},lte(){return b;},is(){return b;},not(){return b;},maybeSingle(){return b;},single(){return b;},
 then(res,rej){let data=[];
  if(table==='ae_pick_feed')data=Array.isArray(f.outcome)?settled:(f.outcome==='pending'?pending:[]);
  if(table==='ae_pick_settlement_checks')data=checks.filter(c=>(!f.status||c.status===f.status)&&(!f.pick_id||f.pick_id.includes(c.pick_id)));
  return Promise.resolve({data,error:null}).then(res,rej);}};return b;};
window.db={from:q,rpc:async()=>({data:[],error:null}),auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}};}},
 channel(){const c={on(){return c;},subscribe(){return c;}};return c;},removeChannel(){},storage:{from(){return {upload:async()=>({}),getPublicUrl:()=>({data:{}})};}}};
"""
with sync_playwright() as p:
    br = p.chromium.launch(); page = br.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html)
    page.add_script_tag(content=FAKE); page.add_script_tag(content=module)
    page.evaluate('window.updateAePicksAdmin()'); page.wait_for_timeout(500)
    hist = page.inner_text('#cpSettleHistory')
    # La lista «Confirmar resultados terminados» puede no estar en la página.
    if page.locator('#cpSettleList').count():
        settle = page.inner_text('#cpSettleList')
        assert 'Pick raro' in settle and 'Santos vs Pumas' not in settle and 'Pick nuevo' not in settle
        assert '2 Picks en espera' in settle
    assert 'América gana' in hist and 'Acertó' in hist and 'Falló' in hist
    assert 'Verificado automáticamente' in hist and 'Confirmado por un admin' in hist
    assert not [e for e in errors if 'community' in e.lower() or 'settle' in e.lower()], errors
    print('OK', errors[:3]); br.close()
