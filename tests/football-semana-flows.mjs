/* La semana football: real UI modules, local fixtures, no external writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const source=file=>fs.readFileSync(file,'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const html=source('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
async function scenario({anonymous=false,failed=false}={}){
  const w=new Window({url:'https://camsports.github.io/?s=futbol&v=quiniela',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  const d=w.document;d.body.innerHTML=html;
  w.matchMedia=query=>({matches:query.includes('max-width: 760px'),addEventListener(){},removeEventListener(){}});
  let frames=[],takeSport=null,logins=0,rejectSave=false,reads=0;
  w.requestAnimationFrame=fn=>frames.push(fn);
  w.Element.prototype.scrollIntoView=function(){w.lastScroll=this;};
  w.currentCategory='Todos';w.currentSearchQuery='';
  w.filterByCategory=cat=>{w.currentCategory=cat;d.body.classList.toggle('ae-is-football',cat==='Fútbol');d.body.classList.toggle('ae-is-nfl',cat==='NFL');};
  w.aeOpenTakeComposer=sport=>{takeSport=sport;};
  w.openUserAuthModal=()=>{logins++;};w.currentAdmin=null;
  w.eval(source('tests/fake-supabase.js'));
  const F=w.__fake;F.user=anonymous?null:{id:'reader'};
  const iso=h=>new Date(Date.now()+h*36e5).toISOString();
  const season=new Date().getUTCFullYear();
  const g=(id,competition,home,away,h,ph,pd,pa)=>({id,competition,season,matchday:10,home_id:home,away_id:away,kickoff:iso(h),status:'scheduled',picks_open:true,odds_locked_at:iso(-24),points_home:ph,points_draw:pd,points_away:pa});
  F.tables.cam_football_games=[g('first','laliga','barca','atleti',24,3,5,7),g('duel','laliga','madrid','sociedad',72,4,7,4),g('payer','laliga','athletic','valencia',50,2,8,12),
    {...g('past','laliga','barca','madrid',-70,4,6,4),matchday:9,status:'final',home_score:0,away_score:1,outcome:'away',picks_open:false},
    g('premier','premier','arsenal','city',48,4,7,4),g('champions','champions','barca','arsenal',80,4,7,4)];
  F.tables.cam_football_teams=['barca','atleti','madrid','sociedad','athletic','valencia','arsenal','city'].map(id=>({id,name:id==='sociedad'?'Real Sociedad de Fútbol con nombre largo':id,short_name:id,abbreviation:id.slice(0,3).toUpperCase()}));
  F.tables.cam_football_picks=anonymous?[]:[{game_id:'first',user_id:'reader',pick:'home'},{game_id:'premier',user_id:'reader',pick:'draw'},{game_id:'champions',user_id:'reader',pick:'away'}];
  F.tableErrors=failed?{cam_football_games:'Calendario temporalmente no disponible'}:{};
  F.rpc.cam_football_save_pick=a=>{
    if(rejectSave)return {data:null,error:{message:'No se pudo guardar el pronóstico'}};
    const rows=F.tables.cam_football_picks;
    const row={game_id:a.p_game_id,user_id:'reader',pick:a.p_pick};
    const old=rows.findIndex(p=>p.game_id===row.game_id);
    if(old<0)rows.push(row);else rows[old]=row;
    return {data:true,error:null};
  };
  w.db=w.supabase.createClient();
  const originalFrom=w.db.from.bind(w.db);
  let deferPremier=null;
  w.db.from=table=>{
    if(table==='cam_football_games'||table==='cam_football_teams')reads++;
    const chain=originalFrom(table);
    if(table==='cam_football_picks'&&deferPremier&&w.camFootballQuiniela?.snapshot().competition==='premier'){
      const then=chain.then.bind(chain),pause=deferPremier;
      chain.then=(ok,ko)=>pause.then(()=>then(ok,ko));
    }
    return chain;
  };
  w.eval(source('assets/cam-mobile-sections.js'));
  w.eval(source('assets/cam-football-quiniela.js'));
  w.eval(source('assets/cam-football-semana.js'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const settle=async()=>{for(let i=0;i<10;i++){await tick();const batch=frames;frames=[];batch.forEach(fn=>fn());}};
  const one=s=>d.querySelector(s),api=w.camFootballQuiniela;
  await settle();
  assert.equal(w.camSectionTabs.current().tab,'semana','legacy quiniela URL opens La semana');
  assert.match(w.location.search,/v=semana/);
  assert.deepEqual([...d.querySelectorAll('#camSectionTabs button')].map(n=>n.textContent),['La semana','Takes','Noticias']);
  if(failed){
    assert.match(one('#camFootballSemanaBody').textContent,/No se pudo cargar la semana/);
    assert.equal(one('.cam-ns-feature'),null,'a failed calendar never becomes fabricated matches');
    F.tableErrors={};one('#camFootballSemanaBody button.cam-ns-link').click();await settle();
  }
  assert.equal(api.snapshot().loaded,true);
  assert.equal(one('.cam-ns-feature .cam-ns-kicker').textContent,'Duelo de la semana');
  assert.equal(one('#camFootballSemana .cam-ns-edition'),null);
  assert.equal(one('#camFootballSemana .cam-ns-opinion .cam-ns-action-label'),null);
  assert.equal(one('#camFootballSemana .cam-ns-intro'),null);
  assert.deepEqual([...d.querySelectorAll('#camFootballSemana .cam-ns-pick strong')].map(n=>n.textContent),['madrid','Empate','sociedad']);
  assert.equal(d.querySelectorAll('#camFootballSemana [data-competition]').length,4);
  assert.equal(one('#camFootballScore [data-block=marcador] .cam-ns-result-score').textContent,'barca 0 – 1 madrid');
  assert.ok(one('#camFootballQuiniela').compareDocumentPosition(one('#camFootballScore'))&w.Node.DOCUMENT_POSITION_FOLLOWING,'the scoreboard follows the actual quiniela');
  one('.cam-ns-link-take').click();assert.equal(takeSport,'Fútbol');
  assert.equal(F.calls.filter(c=>c.rpc==='cam_football_save_pick').length,0,'a take never saves quiniela data');
  one('#camFootballSemana .cam-ns-pick:nth-child(2)').click();await settle();
  if(anonymous){assert.equal(logins,1);assert.equal(F.calls.filter(c=>c.rpc==='cam_football_save_pick').length,0);}
  else{
    assert.equal(api.snapshot().mine.get('duel'),'draw','the duel saves the 1X2 result through the existing RPC');
    assert.match(one('#camFootballSemana [role=status]').textContent,/Quiniela guardada: Empate/);
    rejectSave=true;one('#camFootballSemana .cam-ns-pick').click();await settle();
    assert.equal(api.snapshot().mine.get('duel'),'draw','a rejected save preserves the saved result');
    assert.match(one('#camFootballSemana [role=status]').textContent,/No se pudo guardar/);rejectSave=false;
  }
  one('#camFootballViewTabs [data-view=month]').click();
  const card=one('#camFootballSemana .cam-ns-teaser');const target=card.dataset.gameId;card.click();await settle();
  assert.equal(d.activeElement.dataset.gameId,target);assert.equal(w.lastScroll.dataset.gameId,target);
  assert.equal(one('#camFootballViewTabs [data-view=jornada]').getAttribute('aria-pressed'),'true','match link restores Partidos from standings');
  assert.equal(api.snapshot().mine.get('first'),anonymous?undefined:'home');
  const beforeReads=reads;
  one('#camFootballSemana [data-competition=premier]').click();await settle();
  assert.equal(api.snapshot().competition,'premier');
  assert.match(one('#camFootballSemana .cam-ns-duel').textContent,/arsenal/);
  assert.equal(api.snapshot().mine.get('premier'),anonymous?undefined:'draw');
  one('#camFootballNav [data-competition=laliga]').click();await settle();
  assert.equal(api.snapshot().mine.get('first'),anonymous?undefined:'home');
  assert.equal(api.snapshot().mine.get('duel'),anonymous?undefined:'draw');
  assert.equal(reads,beforeReads,'La semana and its selector reuse the loaded calendar and teams');
  if(!anonymous){
    let release;deferPremier=new Promise(resolve=>{release=resolve;});
    const slow=api.selectCompetition('premier');await tick();
    await api.selectCompetition('champions');await settle();release();await slow;await settle();deferPremier=null;
    assert.equal(api.snapshot().competition,'champions');assert.equal(api.snapshot().mine.get('champions'),'away','a late competition response cannot erase the current saved picks');
    assert.equal(api.snapshot().mine.has('premier'),false);
  }
  await api.selectCompetition('ligamx');await settle();
  assert.match(one('#camFootballSemanaBody').textContent,/Todavía no hay partidos/);
  assert.equal(one('#camFootballSemana .cam-ns-feature'),null);
  assert.equal(one('#camFootballScore').children.length,0);
  w.camSectionTabs.select('noticias',{scroll:false});one('#championsRankings').scrollIntoView();
  assert.equal(w.camSectionTabs.current().tab,'noticias');assert.equal(d.querySelectorAll('#championsRankings').length,1);
  w.camSectionTabs.select('takes',{scroll:false});one('#camFootballQuiniela').scrollIntoView();
  assert.equal(w.camSectionTabs.current().tab,'semana','profile and direct quiniela links reveal La semana');
  await w.happyDOM.close();
}
await scenario();await scenario({anonymous:true});await scenario({failed:true});
console.log('PASS football week: NFL-style tabs, real fixtures, 1X2 save/error/login, match/day focus, competition races, saved picks, empty/error recovery and ranking routes.');
