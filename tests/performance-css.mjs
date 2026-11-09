/* Ensure compiled CSS packs replace requests without changing authored styles. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const groups=JSON.parse(fs.readFileSync(path.join(root,'assets/performance-css-packs.json'),'utf8')).groups;
const links=[...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*>/gi)]
  .map(match=>(match[0].match(/\bhref="([^"]+)"/)||[])[1]?.split('?')[0]);
assert.equal(links.length,13,'Eleven local CSS bundles plus the two external font stylesheets');
assert.equal(groups.length,8);
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
assert.equal(allSources.size,71,'Original pack sources plus monthly leagues and the desktop sections (cam-escritorio.css); editorial sources must not load in later packs');
assert(editorialSources.every(source=>!links.includes(source)), 'Editorial sources cannot also load separately');
const redundancies=editorialSources.filter(source=>allSources.has(source));
assert.deepEqual(redundancies,[],'Do not ship duplicate CSS files inside both the editorial bundle and later CSS packs');
assert(!links.includes('assets/cam-perf-core-extras.css'),'The old core pack is superseded by the editorial bundle');
assert(links.indexOf('assets/ae-editorial-bundle.css')<links.indexOf('assets/cam-perf-home-components.css'));
assert(links.indexOf('assets/cam-perf-home-components.css')<links.indexOf('assets/cam-perf-rankings.css'));
assert(links.indexOf('assets/cam-perf-rankings.css')<links.indexOf('assets/cam-perf-picks-mobile.css'));
assert(links.indexOf('assets/cam-perf-picks-mobile.css')<links.indexOf('assets/cam-perf-controls.css'),
  'Mobile/Picks pack must remain before the late theme overrides');
const sport=groups.find(g=>g.output==='assets/cam-perf-sport-banners.css');
assert.deepEqual(sport.sources, ['assets/ae-football-mobile-redesign.css','assets/ae-take-discussion-reference.css','assets/ae-power-rankings-scenic.css','assets/ae-football-takes-scenic.css','assets/ae-football-news-debate.css','assets/cam-football-opinion-heading-labels.css','assets/ae-football-news-editorial.css','assets/ae-admin-header-compact.css','assets/ae-home-community-spotlight.css']);
assert(links.indexOf(sport.output)>links.indexOf('assets/ae-editorial-bundle.css'));
assert(links.indexOf(sport.output)<links.indexOf('assets/cam-perf-home-components.css'));
console.log('PASS: consolidated header CSS, no duplicated sources and original component cascade boundaries retained.');
