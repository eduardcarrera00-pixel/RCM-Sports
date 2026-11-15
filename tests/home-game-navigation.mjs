import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

// The lazy script can be ready while its first calendar request is still pending.
for (const sport of ['football', 'nfl']) {
  const w = new Window({url:'https://camsports.github.io/', settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
  const d = w.document;
  d.body.innerHTML = fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  d.body.classList.add('ae-is-home');
  w.matchMedia = () => ({matches:true,addEventListener(){}});
  let loaded = false, loading = true;
  const calls = [], routes = [];
  const api = {snapshot:()=>({loaded,loading}),focus:async id=>calls.push(id)};
  w[sport === 'football' ? 'camFootballQuiniela' : 'camNflQuiniela'] = api;
  w.camSportQuinielaLoader = {ensure:()=>Promise.resolve(true)};
  w.camGoQuiniela = (kind, options) => {
    routes.push({kind,options});
    d.body.classList.remove('ae-is-home');
    d.body.classList.add(kind === 'football' ? 'ae-is-football' : 'ae-is-nfl');
  };
  w.eval(fs.readFileSync('assets/cam-home-jornada.js','utf8'));
  const state = w.camHomeJornada._state();
  const game = {id:'selected-game',competition:'premier',week:10,season:2026,matchday:12,
    home_id:'home',away_id:'away',status:'scheduled',picks_open:true,
    odds_locked_at:new Date().toISOString(),kickoff:new Date(Date.now()+864e5).toISOString()};
  state[sport === 'football' ? 'football' : 'nfl'] = [game];
  w.camHomeJornada.repaint();
  const card = d.querySelector('.cam-hj-game[data-sport="'+sport+'"]');
  card.click();
  await new Promise(r=>setTimeout(r,120));
  assert.deepEqual(calls,[],sport+': wait for the calendar, not only the script');
  assert.equal(routes[0].kind,sport);
  assert.equal(routes[0].options.gameId,game.id,'Suppress the generic section scroll for a specific match');
  loaded = true;
  await new Promise(r=>setTimeout(r,120));
  assert.deepEqual(calls,[],sport+': an in-flight refresh must not overwrite match focus');
  loading = false;
  await new Promise(r=>setTimeout(r,120));
  assert.deepEqual(calls,[game.id],sport+': focus the selected match once the calendar settles');

  // Leaving the sport cancels the delayed navigation rather than pulling readers back.
  calls.length = 0; loaded = false; loading = true;
  card.click();
  d.body.classList.remove('ae-is-football','ae-is-nfl');
  d.body.classList.add('ae-is-home');
  loaded = true; loading = false;
  await new Promise(r=>setTimeout(r,120));
  assert.deepEqual(calls,[],sport+': do not focus after the reader has left');
  await w.happyDOM.close();
}
console.log('PASS: selected-match navigation waits for calendars and refreshes, preserves the target and cancels on exit.');
