/* Ensure compiled CSS packs replace requests without changing authored styles. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const head=html.slice(0,html.indexOf('</head>'));
const groups=JSON.parse(fs.readFileSync(path.join(root,'assets/performance-css-packs.json'),'utf8')).groups;
const links=[...head.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*>/gi)]
  .map(match=>(match[0].match(/\bhref="([^"]+)"/)||[])[1]?.split('?')[0]);
assert.equal(links.length,24,'CAM SPORTS should load 24 stylesheet links in its HTML, down from 27');
assert.equal(groups.length,5);
const editorialSources=JSON.parse(fs.readFileSync(path.join(root,'assets/style-sources.json'),'utf8'));
assert.equal(new Set(editorialSources).size,editorialSources.length,'Editorial CSS bundle must not repeat source entries');
const allSources=new Set();
for(const group of groups){
  assert.equal(links.filter(link=>link===group.output).length,1,group.output+' must load exactly once');
  assert(group.sources.length>1,'Each pack must eliminate requests');
  assert(group.sources.every(source=>path.dirname(source)===path.dirname(group.output)),'CSS URL paths must remain relative to assets/');
  for(const source of group.sources){
    assert(!allSources.has(source),'Pack sources must not be duplicated');
    allSources.add(source);
    assert(!links.includes(source),source+' must not also load separately');
  }
}
assert.equal(allSources.size,62,'All pack sources, including sport banner rules, must be represented');
assert(editorialSources.every(source=>!links.includes(source)), 'Editorial sources cannot also load separately');
const redundancies=editorialSources.filter(source=>allSources.has(source));
assert.deepEqual(redundancies,[],'Do not ship duplicate CSS files inside both the editorial bundle and later CSS packs');
assert(links.indexOf('assets/ae-editorial-bundle.css')<links.indexOf('assets/cam-perf-core-extras.css'));
assert(links.indexOf('assets/cam-perf-core-extras.css')<links.indexOf('assets/cam-perf-home-components.css'));
assert(links.indexOf('assets/cam-perf-home-components.css')<links.indexOf('assets/cam-perf-rankings.css'));
assert(links.indexOf('assets/cam-perf-rankings.css')<links.indexOf('assets/cam-perf-picks-mobile.css'));
assert(links.indexOf('assets/cam-perf-picks-mobile.css')<links.indexOf('assets/cam-mobile-bottom-nav.css'),
  'Mobile/Picks pack must remain before the late theme overrides');
const sport=groups.find(g=>g.output==='assets/cam-perf-sport-banners.css');
assert.deepEqual(sport.sources, ['assets/ae-power-rankings-scenic.css','assets/ae-football-takes-scenic.css','assets/ae-football-news-debate.css','assets/cam-football-opinion-heading-labels.css','assets/ae-football-news-editorial.css']);
assert(links.indexOf(sport.output)>links.indexOf('assets/ae-take-discussion-reference.css'));
assert(links.indexOf(sport.output)<links.indexOf('assets/ae-login-art-button.css'));
console.log('PASS: 3 fewer stylesheet requests, 4 removed duplicate sources and original cascade boundaries retained.');
