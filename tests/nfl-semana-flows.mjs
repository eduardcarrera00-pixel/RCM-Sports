/* NFL navigation regression: real modules with local data, no network or browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const source = file => fs.readFileSync(file, 'utf8');
const html = source('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function scenario(anonymous = false) {
  const w = new Window({url:'https://camsports.github.io/?s=nfl', width:390, height:844,
    settings:{disableCSSFileLoading:true, disableJavaScriptFileLoading:true}});
  w.happyDOM.setWindowSize({width:390,height:844});
  const d = w.document;
  d.body.innerHTML = html;
  let frames = [], takeSport = null, logins = 0, rejected = false, reads = 0;
  const intervals = [];
  w.setInterval = (fn, ms) => { intervals.push({fn, ms}); return intervals.length; };
  w.requestAnimationFrame = callback => frames.push(callback);
  w.Element.prototype.scrollIntoView = function() { w.lastScroll = this; };
  w.matchMedia = query => ({matches:query.includes('max-width: 760px'), addEventListener(){}, removeEventListener(){}});
  w.currentCategory = 'Todos';
  w.currentSearchQuery = '';
  w.filterByCategory = category => {
    w.currentCategory = category;
    d.body.classList.toggle('ae-is-nfl', category === 'NFL');
    d.getElementById('nflRankings').classList.toggle('hidden', category !== 'NFL');
  };
  w.aeOpenTakeComposer = sport => {takeSport = sport;};
  w.openUserAuthModal = () => {logins++;};
  w.eval(source('assets/nfl-teams.js'));
  w.eval(source('tests/fake-supabase.js'));
  w.db = w.supabase.createClient();
  const F = w.__fake;
  const originalFrom = w.db.from.bind(w.db);
  w.db.from = table => { if(table === 'cam_nfl_games')reads++; return originalFrom(table); };
  F.user = anonymous ? null : {id:'reader', user_metadata:{username:'Lector'}};
  const iso = hours => new Date(Date.now() + hours * 36e5).toISOString();
  const season = new Date().getUTCFullYear();
  const game = (id, away, home, hours, pa, ph, week = 9) => ({id, season, week, away_id:away, home_id:home,
    kickoff:iso(hours), status:'scheduled', picks_open:true, odds_locked_at:iso(-4), points_away:pa, points_home:ph});
  F.tables.cam_nfl_games = [game('first','JAX','BAL',24,5,3), game('payer','ARI','SEA',70,12,2),
    game('duel','BUF','MIN',100,4,5), game('future','GB','KC',230,4,5,10),
    {...game('live-a','CLE','CIN',-1,4,5),status:'live',home_score:0,away_score:0},
    {...game('live-b','DET','CHI',-2,4,5),status:'live',home_score:null,away_score:null},
    game('live-c','DEN','MIA',-1,4,5),game('stale','NYJ','NE',-30,4,5),
    {...game('postponed','NYG','DAL',-1,4,5),status:'postponed'}];
  F.tables.cam_nfl_picks = anonymous ? [] : [{user_id:'reader',game_id:'first',team_id:'BAL'}];
  F.rpc.cam_nfl_save_pick = args => {
    if(rejected)return {data:null,error:{message:'Error de prueba: reintenta'}};
    return {data:true,error:null};
  };
  w.rankingPublished = {team_ids:['BUF','MIN']};
  w.eval(source('assets/cam-mobile-sections.js'));
  w.eval(source('assets/cam-nfl-quiniela.js'));
  w.eval(source('assets/cam-nfl-semana.js'));
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  const settle = async () => {
    for(let turn=0;turn<10;turn++) {
      await tick();
      const pending = frames; frames = [];
      pending.forEach(fn=>fn());
    }
  };
  await settle();
  const one = selector => d.querySelector(selector);
  assert.equal(w.camSectionTabs.current().tab,'semana');
  assert.deepEqual([...d.querySelectorAll('#camSectionTabs button')].map(b=>b.textContent),['La semana','Takes','Noticias']);
  assert.equal(one('[data-block=partidos]'),null,'redundant promotional matches are removed');
  assert.equal(one('.cam-ns-intro'),null);
  assert.equal(one('.cam-ns-edition'),null);
  assert.equal(one('.cam-ns-sub'),null);
  assert.equal(one('.cam-ns-opinion .cam-ns-action-label'),null);
  assert.ok(d.getElementById('camNflQuiniela').compareDocumentPosition(d.getElementById('camNflScore')) & w.Node.DOCUMENT_POSITION_FOLLOWING,'the scoreboard follows the quiniela');
  assert.equal(d.getElementById('camNflSemana').nextElementSibling.id,'camNflQuiniela','the full quiniela directly follows the duel section');
  assert.equal(one('.cam-ns-pick').closest('.cam-ns-quiniela').getAttribute('role'),'group');
  assert.match(one('.cam-ns-pick').getAttribute('aria-label'),/^Quiniela:/);
  let live = one('#camNflSemana details[data-block=envivo]');
  assert.equal(live.open,false,'simultaneous games start collapsed');
  assert.equal(live.querySelector('.cam-ns-aside').textContent,'3 partidos');
  assert.equal(live.querySelectorAll('li').length,3,'all live games appear regardless of the selected day');
  assert.match(live.textContent,/CLE 0 – 0 CIN/,'zero is an available score');
  assert.match(live.textContent,/DET @ CHI/,'a missing score is never fabricated');
  const poll = intervals.find(i=>i.ms===60000).fn, initialReads = reads;
  poll();await settle();assert.equal(reads,initialReads,'closed results do not poll');
  live.open=true;live.dispatchEvent(new w.Event('toggle'));await settle();
  assert.equal(reads,initialReads+1,'opening reads the latest available scores');
  live.querySelector('summary').focus();
  F.tables.cam_nfl_games=F.tables.cam_nfl_games.map(g=>g.id==='live-a'?{...g,home_score:7}:g);
  poll();await settle();live=one('#camNflSemana details[data-block=envivo]');
  assert.equal(live.open,true,'score updates preserve the expanded state');
  assert.equal(d.activeElement,live.querySelector('summary'),'score updates preserve keyboard focus');
  assert.match(live.textContent,/CLE 0 – 7 CIN/);
  assert.equal(w.camNflQuiniela.snapshot().mine.get('first'),anonymous?undefined:'BAL','score polling preserves saved picks');
  F.tableErrors={cam_nfl_games:'Offline'};poll();await settle();
  assert.match(one('#camNflSemana details').textContent,/CLE 0 – 7 CIN/,'an error keeps the last score');F.tableErrors={};
  live=one('#camNflSemana details');live.open=false;live.dispatchEvent(new w.Event('toggle'));
  const closedReads=reads;poll();await settle();assert.equal(reads,closedReads);
  const ranking = d.getElementById('nflRankings');
  assert.equal(ranking.parentElement.id,'mainContent','the full ranking stays outside the Takes container');
  one('.cam-ns-link-take').click();
  assert.equal(takeSport,'NFL','the opinion action opens the NFL composer');
  assert.equal(F.calls.filter(c=>c.rpc==='cam_nfl_save_pick').length,0,'opening a take never saves a prediction');
  for(const gameId of ['first','payer']) {
    await w.camNflQuiniela.focus(gameId);await settle();
    assert.equal(w.camSectionTabs.current().tab,'semana');
    assert.equal(d.activeElement.dataset.gameId,gameId);
    assert.equal(w.camNflQuiniela.snapshot().mine.get('first'),anonymous?undefined:'BAL');
  }
  one('.cam-ns-pick').click();await settle();
  if(anonymous) {
    assert.equal(logins,1,'anonymous selection follows the existing login flow');
    assert.equal(F.calls.filter(c=>c.rpc==='cam_nfl_save_pick').length,0);
  } else {
    assert.equal(w.camNflQuiniela.snapshot().mine.get('duel'),'BUF');
    assert.equal(one('.cam-ns-pick.is-selected').getAttribute('aria-pressed'),'true');
    assert.match(one('.cam-ns-quiniela [role=status]').textContent,/Quiniela guardada/);
    assert.equal(w.camNflQuiniela.snapshot().mine.get('first'),'BAL');
    rejected = true;
    d.querySelectorAll('.cam-ns-pick')[1].click();await settle();
    assert.equal(w.camNflQuiniela.snapshot().mine.get('duel'),'BUF','a rejected save preserves the previous choice');
    assert.match(one('.cam-ns-quiniela [role=status]').textContent,/Error de prueba/);
  }
  w.openNflTopTen();await settle();
  assert.equal(w.camSectionTabs.current().tab,'noticias');
  assert.equal(d.activeElement,ranking);
  assert.equal(w.lastScroll,ranking);
  assert.equal(d.querySelectorAll('#nflRankings').length,1);
  assert.equal(ranking.querySelector('#rankingTrack')!=null,true,'the entire ranking retains its ticker');
  w.camSectionTabs.select('takes',{scroll:false});
  ranking.scrollIntoView();
  assert.equal(w.camSectionTabs.current().tab,'noticias','direct ranking access reveals Noticias');
  w.camSectionTabs.select('noticias',{scroll:false});
  w.camNflQuiniela.focus('payer');await settle();
  assert.equal(w.camSectionTabs.current().tab,'semana','a quiniela access from Noticias reveals the match');
  assert.equal(d.activeElement.dataset.gameId,'payer');
  w.filterByCategory('Fútbol');w.camSectionTabs.select('quiniela',{scroll:false});
  assert.equal(w.camSectionTabs.current().tab,'semana','football quiniela links keep working through La semana');
  await w.happyDOM.close();
}
await scenario();
await scenario(true);
console.log('PASS NFL: collapsible simultaneous games, score refresh/fallback/focus, saved picks, take/quiniela actions, login and navigation.');
