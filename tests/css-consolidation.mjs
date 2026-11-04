/* Independently parse authored and delivered CSS to protect every cascade rule. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import postcss from 'postcss';
import {minifyCss} from '../scripts/css-minifier.mjs';

const read = path => fs.readFileSync(path, 'utf8');
const normalize = value => String(value || '').trim().replace(/\s+/g, ' ');
const project = node => {
  if (node.type === 'comment') return null;
  const result = {type: node.type};
  if (node.type === 'rule') result.selector = normalize(node.selector);
  if (node.type === 'decl') Object.assign(result, {
    property: node.prop, value: normalize(node.value), important: Boolean(node.important)
  });
  if (node.type === 'atrule') Object.assign(result, {name: node.name, params: normalize(node.params)});
  if (node.nodes) result.children = node.nodes.map(project).filter(Boolean);
  return result;
};

// Strings and data URLs may contain CSS delimiters; descendant selectors and
// calc() operators need their whitespace. Compression cannot rewrite either.
const tricky = String.raw`/* comment */
@layer cam-header {
  @media (max-width: 760px) {
    .a .b::before { content: "literal ;} /* text */"; background: url("data:image/svg+xml;a b"); width: calc(100% - 2px); }
  }
}`;
assert.deepEqual(project(postcss.parse(minifyCss(tricky))), project(postcss.parse(tricky)));

const editorial = JSON.parse(read('assets/style-sources.json'));
const groups = [
  {output: 'assets/ae-editorial-bundle.css', sources: editorial},
  ...JSON.parse(read('assets/performance-css-packs.json')).groups
];
for (const {output, sources} of groups) {
  assert(sources.every(source => source.startsWith('assets/') && !source.slice(7).includes('/')),
    'Keep CSS URLs relative to the same assets directory');
  const authored = postcss.root();
  for (const source of sources) authored.append(postcss.parse(read(source)).nodes);
  assert.deepEqual(project(postcss.parse(read(output))), project(authored),
    output + ': preserve selectors, declarations, priorities, media queries, layers and their order');
}

const html = read('index.html');
const links = [...html.matchAll(/<link\b(?=[^>]*\brel="stylesheet")[^>]*href="([^"]+)"[^>]*>/g)]
  .map(match => match[1].split('?')[0]);
assert.equal(links.filter(href => href.startsWith('assets/')).length, 11);
assert.equal(new Set(links).size, links.length, 'No bundle may load twice');
const position = marker => { const index = html.indexOf(marker); assert(index >= 0, marker); return index; };
const order = (...markers) => {
  const indexes = markers.map(position);
  assert(indexes.every((index, i) => !i || index > indexes[i - 1]), markers.join(' → '));
};
order('assets/ae-editorial-bundle.css', 'assets/ae-nfl-mobile-telephoto.js',
  'assets/cam-perf-sport-banners.css', 'id="ae-opinions-reused-home-panels"',
  'assets/cam-perf-home-components.css', 'id="ae-home-weekly-reference-mobile"',
  'assets/cam-perf-rankings.css', 'id="ae-home-news-carousel-styles"',
  'assets/cam-perf-news.css', 'id="ae-home-sun-takes-trending-polish"',
  'assets/ae-home-esports-standings.css', 'id="ae-home-standings-simplified-20261017"',
  'assets/cam-perf-picks-mobile.css', 'assets/cam-global-edit.js',
  'assets/cam-perf-controls.css', 'assets/cam-take-cta.js',
  'assets/cam-perf-football-headings.css', 'id="cam-weekly-results-style"',
  'id="cam-nfl-quiniela-theme"', 'assets/cam-perf-app-panels.css', 'assets/cam-parties.js');
console.log('PASS: all authored CSS rules retained in order; 28 → 11 own stylesheet requests; inline and script boundaries preserved.');
