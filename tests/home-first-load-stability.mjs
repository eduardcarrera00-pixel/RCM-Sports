// CAM SPORTS: never tell readers there are zero articles before the first fetch finishes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/let initialArticlesPending = true/,'Initial fetch starts pending');
const api=html.slice(html.indexOf('async function loadArticlesFromStorage()'),html.indexOf('function exportLegacyArticles()'));
assert.match(api,/initialArticlesPending = false;\s*renderArticlesFeed\(\)/,'A successful fetch renders only after loading completes');
assert.match(api,/catch\s*\{\s*initialArticlesPending = false;\s*renderArticlesFeed\(\)/,'Offline visitors see the actual empty state when fetching fails');
const feed=html.slice(html.indexOf('function renderArticlesFeed()'),html.indexOf('function renderHeroCard(hero)'));
assert.match(feed,/noResults\.classList\.toggle\('hidden', initialArticlesPending\)/,
 'The empty state must remain hidden during the initial fetch');
assert.match(feed,/noResults\.classList\.add\('hidden'\);/,'Articles still hide the empty state');
assert.match(html,/id="noResults" class="hidden\s/,'Initial HTML never flashes the empty state');
console.log('PASS: no false empty-news screen during cold load; offline and real empty results remain available.');
