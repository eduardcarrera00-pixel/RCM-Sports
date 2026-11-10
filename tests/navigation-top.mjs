import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';
const w = new Window({url: 'https://camsports.github.io/'});
w.document.body.innerHTML = '<main id="mainContent"></main>';
let mobile = true;
w.matchMedia = () => ({get matches() {return mobile;}, addEventListener() {}});
w.currentCategory = 'Todos';
w.currentSearchQuery = '';
const transitions=[];
w.camPageLoader={start(){transitions.push('loading');}};
w.filterByCategory = cat => {
  if(cat!==w.currentCategory)assert.equal(transitions.at(-1),'loading','The loading screen starts before the new section renders');
  transitions.push(cat);
  w.currentCategory = cat;
};
let y = 0, lastScroll;
Object.defineProperty(w, 'scrollY', {get: () => y});
w.scrollTo = options => {lastScroll = options; y = options.top;};
w.history.scrollRestoration = 'auto';
w.eval(fs.readFileSync('assets/cam-mobile-sections.js', 'utf8'));
for (const cat of ['NFL', 'Fútbol', 'Picks', 'Opiniones', 'NFL', 'Todos', 'Picks']) {
  const started=transitions.filter(value=>value==='loading').length;
  y = 1200;
  w.filterByCategory(cat);
  assert.equal(y, 0, cat + ' always starts at top, including a return visit');
  assert.equal(lastScroll.behavior, 'instant');
  assert.equal(transitions.filter(value=>value==='loading').length,started+1,cat+' opens the loading screen');
}
const beforeTabs=transitions.filter(value=>value==='loading').length;
y = 900; w.camSectionTabs.select('historial'); assert.equal(y, 0);
y = 700; w.camSectionTabs.select('picks'); assert.equal(y, 0);
y = 800; w.camSectionTabs.select('picks'); assert.equal(y, 0, 'reselect is instant');
y = 800; w.camSectionTabs.select('chefs', {scroll:false}); assert.equal(y, 800, 'explicit reveal retains anchor scrolling');
assert.equal(transitions.filter(value=>value==='loading').length,beforeTabs,'Picks, Chefs and Historial switch instantly without another loading screen');
for (const sport of ['NFL','Fútbol']) {
  w.filterByCategory(sport);
  const started=transitions.filter(value=>value==='loading').length;
  for (const tab of ['takes','noticias','semana']) w.camSectionTabs.select(tab);
  assert.equal(transitions.filter(value=>value==='loading').length,started,sport+' tabs never reopen the loading screen');
}
mobile = false; y = 500; w.filterByCategory('NFL'); assert.equal(y, 0, 'desktop section starts at top too');
assert.equal(w.history.scrollRestoration, 'manual');
y = 600; w.dispatchEvent(new w.PopStateEvent('popstate')); assert.equal(y, 0, 'Back never restores an old height');
console.log('PASS: only main sections open the loader; NFL/football/Picks tabs, scroll, reselect and Back retain instant navigation.');
w.happyDOM.abort();
