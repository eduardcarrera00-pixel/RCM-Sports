import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';

const html = fs.readFileSync('index.html', 'utf8');
const w = new Window({url: 'https://camsports.github.io/'});
const d = w.document;
d.body.innerHTML = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
d.body.classList.add('ae-is-home');
w.matchMedia = () => ({matches: false, addEventListener() {}});
w.currentSearchQuery = '';
w.articles = Array.from({length: 5}, (_, i) => ({id: 'news-'+i, remote: true, title: 'Noticia '+i, summary: 'Entradilla breve', category: 'NFL'}));
w.renderArticleInteractions = () => '<div class="cam-news-interactions"></div>';
const navigations = [];
w.camGoQuiniela = sport => navigations.push(sport);
const original = d.getElementById('aeHomeTakesPopular').parentNode;
let opened = 0;
for (const id of ['aeHomeTakesPositiveList', 'aeHomeTakesNegativeList']) {
  const list = d.getElementById(id);
  list.replaceChildren();
  for (let i=0; i<5; i++) {
    const li = d.createElement('li'); li.className = 'ae-top-take';
    const button = d.createElement('button'); button.textContent = 'Take '+i;
    button.addEventListener('click', () => opened++);
    li.append(button); list.append(li);
  }
}
w.eval(fs.readFileSync('assets/ae-home-take-discoveries.js', 'utf8'));
w.eval(fs.readFileSync('assets/cam-home-jornada.js', 'utf8'));
const root = d.getElementById('camHomeJornada');
const state = w.camHomeJornada._state();
const game = (id, hours) => ({id, status:'scheduled', picks_open:true, odds_locked_at:new Date().toISOString(), kickoff:new Date(Date.now()+hours*3600000).toISOString(), away_id:'BUF', home_id:'MIN', points_away:4, points_home:5});
state.nfl = [game('n1',10), game('n2',20)];
state.football = [game('f1',5), game('f2',15), game('f3',25)];
state.takesOk = true;
state.takes = Array.from({length:6}, (_,i) => ({id:'t'+i,title:'Take '+i,body:'Una opinión con contexto',author:'lector',created_at:new Date().toISOString()}));
w.camHomeJornada.repaint();
assert.deepEqual([...root.querySelectorAll(':scope > [data-row]')].map(n=>n.dataset.row), ['news','jornada','takes']);
assert.equal(root.querySelectorAll('.cam-hj-news').length,3);
assert.equal(root.querySelectorAll('.cam-hj-game').length,2);
assert.equal(root.querySelectorAll('.cam-hj-take').length,6,'All recent Takes remain reachable in the carousel');
assert.equal(root.querySelectorAll('.cam-home-takes-track').length,3,'Every filter uses the same carousel');
assert.equal(root.querySelectorAll('#camHomeTakesRecent .cam-home-take-comments').length,6,'Every recent Take has a conversation button');
assert.equal(root.querySelectorAll('#camHomeTakesRecent .cam-home-take-rank + .cam-home-take-name').length,6,'The real profile rank precedes the username');
for (const kind of ['recent','positive','negative']) {
  const card=w.camHomeTakeCard(state.takes[0],kind,new Map([['t0',2]]),null);
  assert.equal(card.querySelector('.cam-home-take-comments').textContent,'2');
  assert.equal(card.className,root.querySelector('.cam-home-take-unified').className,'All three filters share the same component');
}

for (const track of root.querySelectorAll('.cam-home-takes-track')) {
  assert.equal(track.getAttribute('tabindex'),'0','Every carousel is reachable by keyboard');
  assert.equal(track.getAttribute('aria-roledescription'),'carrusel');
}
assert.deepEqual([...root.querySelectorAll('.cam-hj-badge')].map(n=>n.textContent), ['2','3'], 'The compact preview must not change the full calendar counts');
root.querySelector('[data-row=jornada] .cam-hj-more').click();
assert.deepEqual(navigations,['football'], 'The next available sport opens once, with no duplicate click handler');
const popular = d.getElementById('aeHomeTakesPopular');
root.querySelector('[aria-controls=aeHomeTakesPopular]').click();
assert.equal(popular.hidden,false);
assert.equal(d.getElementById('camHomeTakesRecent').hidden,true);
assert.equal(d.getElementById('aeHomeTakesUnpopular').hidden,true);
popular.querySelector('li button').click();
assert.equal(opened,1, 'Moving the real cards preserves their existing conversation handlers');
assert.equal(popular.querySelectorAll('li').length,5,'Ranked Takes remain available beyond the first three');
assert.equal(root.querySelector('.cam-list-more'),null,'The carousel has no expansion controls');
root.querySelector('[aria-controls=aeHomeTakesUnpopular]').click();
assert.equal(d.getElementById('aeHomeTakesUnpopular').hidden,false);
assert.equal(popular.hidden,true);
assert.equal(d.getElementById('camHomeTakesRecent').hidden,true);
d.body.classList.remove('ae-is-home');
await new Promise(r=>setTimeout(r,10));
assert.equal(popular.parentNode,original, 'Leaving Home returns the original modules');
assert.equal(popular.querySelector('.cam-list-more'),null);
assert.equal(popular.querySelector('.cam-home-takes-track'),null,'Carousel styling does not leak into the original module');
d.body.classList.add('ae-is-home');
await new Promise(r=>setTimeout(r,10));
assert.equal(root.querySelectorAll('#aeHomeTakesPopular').length,1);
assert.equal(popular.querySelectorAll('.cam-home-takes-track').length,1);
state.takes=[]; state.takesOk=false; state.takesError=true;
w.camHomeJornada.repaint();
assert.equal(d.getElementById('camHomeTakesRecent').dataset.camContentState,'error');
assert.match(d.getElementById('camHomeTakesRecent').textContent,/No se pudieron cargar/);
state.takesOk=true; state.takesError=false; w.camHomeJornada.repaint();
assert.equal(d.getElementById('camHomeTakesRecent').dataset.camContentState,'empty');
await w.happyDOM.close();

const summarySource=html.slice(html.indexOf('function articleReadingSummary('),html.indexOf('function openArticleModal('));
const context={}; vm.runInNewContext(summarySource,context);
const lead='El Barça encontró espacios con paciencia y terminó cambiando el ritmo del partido.';
assert.equal(context.articleReadingSummary(lead,lead+' El resto de la noticia sigue intacto.'),'');
assert.equal(context.articleReadingSummary('Un ángulo distinto para entender el encuentro.',lead),'Un ángulo distinto para entender el encuentro.');
assert.ok(context.articleReadingSummary('Una entradilla diferente '+ 'con información útil '.repeat(30),lead).length<=241);

const ranks = new Window({url:'https://camsports.github.io/'});
ranks.document.body.innerHTML=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
ranks.currentAdmin=null;
let rankingError=false;
ranks.db={rpc:async()=>({data:[],error:rankingError?{message:'offline'}:null})};
ranks.eval(fs.readFileSync('assets/ae-take-rankings.js','utf8'));
ranks.aeTakeRankings.setSport('NFL');
await new Promise(r=>setTimeout(r,15));
assert.equal(ranks.document.querySelectorAll('.ae-nfl-ranking-panel[data-cam-content-state=empty]').length,2);
assert.equal(ranks.document.querySelectorAll('.cam-ranking-empty').length,1);
assert.equal(ranks.document.querySelectorAll('#aeSportTakeRanking [data-take-rank]').length,2, 'Historical results must remain reachable from an empty monthly view');
rankingError=true; ranks.aeTakeRankings.refresh();
await new Promise(r=>setTimeout(r,15));
assert.equal(ranks.document.querySelectorAll('.ae-nfl-ranking-panel[data-cam-content-state=error]').length,2, 'Failed reads must stay visible rather than becoming empty highlights');
assert.equal(ranks.document.querySelector('.cam-ranking-empty'),null);
await ranks.happyDOM.close();
console.log('PASS: shared Home Takes carousels with complete lists and keyboard access, preserved handlers, route restoration, complete calendars, distinct empty/error states, article lead deduplication and accessible ranking periods.');

