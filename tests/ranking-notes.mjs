import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const w = new Window({url: 'https://camsports.github.io/'});
const teams = ['Paris Saint-Germain', 'Arsenal', 'Real Madrid', 'Bayern München',
  'Barcelona', 'Manchester City', 'Como', 'Atlético de Madrid', 'Inter', 'Club Brugge']
  .map((name, i) => ({id: String(i), name}));
const headings = ['PARIS SAINT-GERMAIN', 'ARSENAL', 'REAL MADRID', 'BAYERN MÚNICH',
  'BARCELONA', 'MANCHESTER CITY', 'COMO', 'ATLÉTICO DE MADRID', 'INTER DE MILÁN', 'CLUB BRUJAS'];
const body = '<p>POWER RANKINGS EUROPA<br>5 de noviembre de 2026</p>' +
  teams.map((t, i) => `<p><strong>${i + 1}. ${headings[i]}</strong><br>\nExplicación exclusiva del equipo ${i}, con control y presión.</p>`).join('');
w.document.body.innerHTML = `<section id="championsRankings"><ul id="championsList">${teams.map((t, i) =>
  `<li data-rank-sport="ucl" data-team-id="${t.id}" data-team-name="${t.name}" data-rank="${i + 1}"></li>`).join('')}</ul></section>`;
w.articles = [
  {id: 'old', category: 'Fútbol', title: 'Power Rankings Champions', body: '<p>Arsenal</p><p>Antiguo.</p>', createdAt: '2026-10-20'},
  {id: 'new', category: 'Fútbol', title: 'POWER RANKINGS FUTBOL', summary: 'Nuestra clasificación europea', body, createdAt: '2026-11-05'},
  {id: 'nfl', category: 'NFL', title: 'Power Rankings NFL', body: '<p>Arsenal</p><p>Otro deporte.</p>', createdAt: '2026-11-06'}
];
w.eval(fs.readFileSync('assets/ae-ranking-notes.js', 'utf8'));
const result = w.aeRankingNotes.notesFor('ucl');
assert.equal(result.article.id, 'new', 'latest football rankings need no Champions keyword');
assert.equal(result.notes.size, 10, 'all ten inline headings and aliases are recognized');
for (const t of teams) assert.equal(result.notes.get(t.id).join(' '), `Explicación exclusiva del equipo ${t.id}, con control y presión.`);
const nfl = w.aeRankingNotes.parse('<h2>1. San Francisco 49ers</h2><p>Primera idea.</p><p>Segunda idea.</p><h2>2. Buffalo Bills</h2><p>Otra explicación.</p>',
  [{id: 'SF', name: 'San Francisco 49ers'}, {id: 'BUF', name: 'Buffalo Bills'}]);
assert.deepEqual([...nfl.get('SF')], ['Primera idea.', 'Segunda idea.']);
assert.deepEqual([...nfl.get('BUF')], ['Otra explicación.']);
w.aeRankingNotes.decorate();
assert.equal(w.document.querySelectorAll('.ae-rank-note-sr').length, 10);
w.document.querySelector('[data-team-id="6"]').click();
assert.match(w.document.querySelector('.ae-rank-note').textContent, /Explicación exclusiva del equipo 6/);
assert.doesNotMatch(w.document.querySelector('.ae-rank-note').textContent, /llegará con la próxima/);
console.log('PASS: ten football previews, inline breaks, aliases, latest article selection, NFL paragraphs and touch card.');
w.happyDOM.abort();
