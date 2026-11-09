import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const w = new Window({url: 'https://camsports.github.io/'});
w.document.body.innerHTML = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
w.currentAdmin = null;
let rows = [], error = null;
w.db = {auth: {onAuthStateChange() {}}, from() {
  const query = {select() {return query;}, eq() {return query;}, order() {return query;}, limit() {return query;},
    then(resolve, reject) {return Promise.resolve({data: rows, error}).then(resolve, reject);}};
  return query;
}};
w.eval(fs.readFileSync('assets/ae-editorial-weekly.js', 'utf8'));
const featured = w.document.getElementById('picksFeatured');
await w.refreshEditorialWeeklyPick();
assert.equal(featured.dataset.camEditorState, 'empty');
assert.equal(w.document.getElementById('aePicksTopPair').dataset.camContentState, 'empty');
assert.equal(w.document.getElementById('cpWeekly').dataset.camContentState, 'empty');

rows = [{id: '00000000-0000-0000-0000-000000000901', title: 'Pick vigente', event_name: 'Local vs visitante',
  selection: 'Local gana', american_odds: 150, analysis: 'Análisis original.',
  expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString()}];
await w.refreshEditorialWeeklyPick();
assert.equal(featured.dataset.camEditorState, 'ready');
assert.equal(w.document.getElementById('aePicksTopPair').dataset.camContentState, 'ready');
assert.match(featured.textContent, /Pick vigente/);
assert.equal(w.document.querySelector('#cpWeekly .ae-weekly-preview').getAttribute('role'),'button','Home uses the compact preview at every viewport');
assert.equal(w.document.querySelector('#cpWeekly details'),null);
assert.ok(featured.querySelector('details'),'Picks retains its full expandable analysis');
assert.equal(featured.querySelectorAll('.ae-weekly-empty').length, 0, 'Published Picks keep the complete existing card');

error = {message: 'Read unavailable'};
await w.refreshEditorialWeeklyPick();
assert.equal(featured.dataset.camEditorState, 'error');
assert.equal(w.document.getElementById('aePicksTopPair').dataset.camContentState, 'error', 'A failed read must remain visible rather than look empty');
assert.ok(featured.querySelector('.ae-weekly-retry'), 'The error state offers recovery');
assert.match(featured.textContent, /No se pudo cargar/);
assert.equal(featured.querySelectorAll('.ae-weekly-banner').length, 0, 'A failed read clears stale imagery');

error = null;
rows[0].expires_at = new Date(Date.now() - 86400000).toISOString();
await w.refreshEditorialWeeklyPick();
assert.equal(featured.dataset.camEditorState, 'empty', 'Expired Picks use the compact empty state after recovery');
await w.happyDOM.close();
console.log('PASS: empty, published, failed and expired editorial Picks retain the appropriate card and state.');
