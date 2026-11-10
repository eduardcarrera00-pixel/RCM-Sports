import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const w = new Window({url:'https://camsports.github.io/'});
const d = w.document;
d.body.innerHTML = fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
let phone = false;
const queries = new Map();
w.matchMedia = query => {
  if (!queries.has(query)) queries.set(query, {media:query,get matches(){return query.includes('max-width: 760px') || query.includes('max-width:760px') ? phone : !phone;},listeners:[],addEventListener(type,fn){this.listeners.push(fn);},addListener(fn){this.listeners.push(fn);}});
  return queries.get(query);
};
const scrolls = [];
w.Element.prototype.scrollIntoView = function(){scrolls.push(this.id);};
w.scrollTo = () => {};
w.currentCategory = 'Todos';
w.currentSearchQuery = '';
w.filterByCategory = category => {
  w.currentCategory = category;
  for (const [name,flag] of [['Todos','ae-is-home'],['NFL','ae-is-nfl'],['Fútbol','ae-is-football'],['Opiniones','ae-is-opinions']]) d.body.classList.toggle(flag,category===name);
  // The existing renderer hands these live modules to Actualidad synchronously.
  if(category==='Opiniones') d.getElementById('aeOpinionsTrendingSlot').append(d.getElementById('aeTrendingPortada'));
};
w.filterByCategory('Todos');
const home = d.createElement('section'); home.id='camHomeJornada';
const disclosure=d.createElement('details'); disclosure.className='cam-hj-shortcuts-disclosure';
const shortcuts=d.createElement('nav'); shortcuts.className='cam-hj-shortcuts';
shortcuts.innerHTML='<button class="cam-hj-shortcut"><span class="cam-hj-shortcut-label">Quiniela<br>NFL</span></button>';
disclosure.append(shortcuts);home.append(disclosure);d.getElementById('mainContent').prepend(home);
const ids=['freeTakes','camNflSemana','camFootballSemana','camNflQuiniela','camFootballQuiniela','camNflScore','camFootballScore','aeTrendingPortada','aeSportTakeLeaders','nflRankings','championsRankings'];
// Score shells are created dynamically by the existing sport scripts.
for(const id of ['camNflScore','camFootballScore']) if(!d.getElementById(id)){const n=d.createElement('section');n.id=id;d.getElementById('freeTakes').append(n);}
const original = new Map(ids.map(id=>{const node=d.getElementById(id);return[id,{node,parent:node.parentNode}];}));
const editorial=d.querySelector('.editorial-layout');
const originalEditorialParent=editorial.parentNode;
let clicks=0;const button=d.createElement('button');button.addEventListener('click',()=>clicks++);d.getElementById('aeSportTakeLeaders').append(button);
w.eval(fs.readFileSync('assets/cam-mobile-sections.js','utf8'));
w.eval(fs.readFileSync('assets/cam-escritorio.js','utf8'));
const settle=()=>new Promise(resolve=>setTimeout(resolve,35));
await settle();
assert.equal(d.getElementById('camDeskMain').firstElementChild,home);
assert.equal(d.querySelector('#camDeskAside #aeTrendingPortada'),original.get('aeTrendingPortada').node);
for(const [category,slug,prefix] of [['NFL','nfl','camNfl'],['Fútbol','futbol','camFootball']]) {
  w.filterByCategory(category); await settle();
  assert.equal(d.body.dataset.camSportPage,slug);
  assert.equal(d.body.dataset.camTabs,undefined);
  assert.equal(d.body.dataset.camTab,undefined);
  assert.equal(d.getElementById('camSectionTabs').hidden,true);
  const ranking=d.getElementById(slug==='nfl'?'nflRankings':'championsRankings');
  assert.equal(ranking.parentNode.id,'camDeskTop','The original sport ranking leads the desktop content');
  assert.equal(d.getElementById('camDeskTop').nextElementSibling,d.getElementById('camDeskLayout'));
  assert.equal(d.querySelector('#camDeskRail .cam-desk-rail-in').tagName,'DIV','Shortcuts are always exposed, with no collapse control');
  assert.equal(d.querySelector('#camDeskRail summary'),null);
  for(const id of [prefix+'Semana',prefix+'Quiniela','freeTakes']) assert.equal(d.getElementById(id).parentNode,d.getElementById('camDeskMain'));
  assert.equal(editorial.parentNode,d.getElementById('camDeskMain'));
  assert.equal(d.getElementById(prefix+'Score').parentNode,d.querySelector('#camDeskAside > div'));
  for(const tab of ['noticias','takes','quiniela']){
    w.camSectionTabs.select(tab);await settle();
    assert.equal(d.body.dataset.camTabs,undefined);
    assert.equal(d.getElementById(prefix+'Semana').parentNode,d.getElementById('camDeskMain'));
    assert.equal(new URL(w.location.href).searchParams.get('v'),null);
  }
  assert.deepEqual(scrolls.slice(-3),['aeNewsHeadingRow','freeTakes',prefix+'Quiniela']);
  button.click();
}
assert.equal(clicks,2,'Moving a live community module keeps its original event listeners');
w.filterByCategory('Opiniones');await settle();
assert.equal(d.getElementById('camDeskLayout'),null);
assert.equal(editorial.parentNode,originalEditorialParent);
assert.equal(d.getElementById('aeTrendingPortada').parentNode,d.getElementById('aeOpinionsTrendingSlot'),'The renderer can take ownership without restoration stealing its node');
w.filterByCategory('Fútbol');await settle();
phone=true;for(const query of queries.values()) for(const listener of query.listeners) listener({matches:query.matches});await settle();
assert.equal(d.body.dataset.camDesk,undefined);
assert.equal(d.body.dataset.camTabs,'sport');
assert.equal(d.getElementById('camSectionTabs').hidden,false);
assert.equal(d.getElementById('camDeskLayout'),null);
assert.equal(d.getElementById('camDeskTop'),null);
assert.equal(shortcuts.parentNode,disclosure);
for(const id of ids.filter(id=>id!=='aeTrendingPortada'))assert.equal(d.getElementById(id).parentNode,original.get(id).parent,'Restored '+id);
w.camSectionTabs.select('noticias');assert.equal(d.body.dataset.camTab,'noticias');
phone=false;for(const query of queries.values()) for(const listener of query.listeners) listener({matches:query.matches});await settle();
assert.equal(d.body.dataset.camSportPage,'futbol');assert.equal(d.body.dataset.camTabs,undefined);
assert.equal(d.querySelectorAll('#camDeskLayout').length,1);
// Legacy mobile/data renderers can finish after the desktop resize callback.
original.get('freeTakes').parent.append(d.getElementById('freeTakes'));
original.get('championsRankings').parent.append(d.getElementById('championsRankings'));
original.get('aeTrendingPortada').parent.append(d.getElementById('aeTrendingPortada'));
await settle();
assert.equal(d.getElementById('freeTakes').parentNode,d.getElementById('camDeskMain'));
assert.equal(d.getElementById('championsRankings').parentNode.id,'camDeskTop');
assert.deepEqual([...d.querySelector('#camDeskAside > div').children].map(n=>n.id),['camFootballScore','aeTrendingPortada','aeSportTakeLeaders']);
for(const id of ids)assert.equal(d.querySelectorAll('#'+id).length,1,'One live '+id+' after width changes');
w.filterByCategory('Picks');await settle();
assert.equal(d.body.dataset.camTabs,'picks');
assert.equal(d.getElementById('camSectionTabs').hidden,false);
assert.equal(d.getElementById('camDeskLayout'),null);
await w.happyDOM.close();
console.log('PASS: continuous desktop sports, anchor navigation, original handlers, route ownership, tablet/phone restoration and independent Picks tabs.');
