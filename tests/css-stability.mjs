/* CSS maintenance regression gate; never modifies the site. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const report=JSON.parse(execFileSync(process.execPath,['scripts/audit-css.mjs','--json'],
  {encoding:'utf8',maxBuffer:4*1024*1024}));
assert.equal(report.status,'ok','Every stylesheet referenced in the active cascade must exist');
assert.deepEqual(report.missing,[],'No missing CSS files');
assert.equal(report.bundleSourceCount,66,'The 11 safely redundant early bundle sheets must stay removed');
assert.ok(report.linkedStylesheetCount>=45,'Active component styles must remain linked');

// Existing double-loading is measured, not blindly removed. A later external
// copy may be a required override; future cleanup needs viewport screenshots.
const existingDuplicateSources=[
  'assets/ae-power-rankings-scenic.css',
  'assets/ae-football-takes-scenic.css',
  'assets/ae-football-news-debate.css',
  'assets/ae-football-news-editorial.css',
  'assets/ae-home-cta-icons.css',
  'assets/ae-picks-platos-odds.css',
  'assets/ae-mobile-polish-weekly-pick.css',
  'assets/ae-nfl-mobile-ranking-compact.css',
  'assets/ae-champions-mobile-ranking-compact.css',
  'assets/ae-home-weekly-match-picks-mobile.css',
  'assets/ae-mobile-home-takes-swipe-and-football-news.css'
];
const repeated=report.doubleLoaded.map(row=>row.file);
assert.deepEqual(repeated,[],
  'No stylesheet should be loaded both inside the editorial bundle and standalone');
const manifest=JSON.parse(fs.readFileSync('assets/style-sources.json','utf8'));
const htmlLinks=[...fs.readFileSync('index.html','utf8').matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)]
  .map(match=>match[1].split('?')[0]);
for(const file of existingDuplicateSources){
  assert.equal(manifest.includes(file),false, file+' must be omitted from the initial bundle');
  assert.equal(htmlLinks.filter(url=>url===file).length,1,
    file+' must remain linked exactly once, in its approved final position');
}

// Third phase: component styles stay in adjacent source order, loaded once.
const groups=JSON.parse(fs.readFileSync('assets/component-css-groups.json','utf8')).groups;
assert.equal(groups.length,4,'Four component groups are expected in phase 3');
for(const group of groups){
  assert.equal(htmlLinks.filter(file=>file===group.output).length,1,
    'The generated group must be linked exactly once: '+group.output);
  for(const source of group.sources){
    assert.equal(htmlLinks.includes(source),false,
      'A grouped original CSS file must not still be linked independently: '+source);
    assert.equal(manifest.includes(source),false,
      'Grouped CSS sources must not also be inside the editorial bundle: '+source);
  }
}

// First safe cleanup: two identical, unconditional badge visibility rules
// were in the same standalone CSS. Preserve the later authoritative rule.
const auth=fs.readFileSync('assets/ae-classical-auth-buttons.css','utf8');
const hidden=/html body>header #aeNotificationsButton #aeNotificationsBadge\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/g;
assert.equal([...auth.matchAll(hidden)].length,1,'Keep exactly one hidden notification badge rule');

const html=fs.readFileSync('index.html','utf8');
assert.match(html,/ae-editorial-bundle\.css/);
assert.match(html,/ae-classical-auth-buttons\.css/);

// Phase 4: 17 adjacent inline <style> elements were moved into four
// stylesheets at precisely the same positions. Keep each original rule intact.
const extracted=[
  {file:'assets/ae-inline-mobile-layout.css',ids:[
    'ae-home-weekly-reference-mobile','ae-mobile-home-rankings-top-three',
    'ae-football-ranking-mobile-frame-fix','ae-sport-bottom-ctas-style',
    'ae-nfl-savant-rookie-mobile-visible']},
  {file:'assets/ae-inline-news-rankings.css',ids:[
    'ae-home-news-carousel-styles','ae-cocina-day-variant',
    'ae-sport-news-mobile-carousel','ae-home-rankings-edge-to-edge',
    'ae-home-points-tables','ae-news-headings-20261017-fine-tune']},
  {file:'assets/ae-inline-brand-header.css',ids:[
    'ae-home-sun-takes-trending-polish','ae-header-moon-sport-icons-and-classic-avisos',
    'ae-avisos-harmonized-icon']},
  {file:'assets/ae-inline-standings-trending.css',ids:[
    'ae-home-standings-simplified-20261017',
    'ae-desktop-sport-nav-hover-no-squares-20261017',
    'ae-home-trending-read-count-bottom-right']}
];
let lastLinkPosition=-1;
for(const group of extracted){
  const pos=html.indexOf('href="'+group.file+'?');
  assert.ok(pos>lastLinkPosition,'Extracted CSS must maintain original cascade order: '+group.file);
  lastLinkPosition=pos;
  assert.equal(htmlLinks.filter(file=>file===group.file).length,1);
  const stylesheet=fs.readFileSync(group.file,'utf8');
  const origins=[...stylesheet.matchAll(/\/\* Original <style id="([^"]+)"> \*\//g)]
    .map(match=>match[1]);
  assert.deepEqual(origins,group.ids,'Original inline declaration order must be retained');
  for(const origin of group.ids){
    assert.ok(!html.includes('<style id="'+origin+'"'),
      'Extracted CSS should not remain duplicated inside index.html: '+origin);
  }
}
assert.equal([...html.matchAll(/<style\b/gi)].length,4,
  'Only four high-risk inline style elements should remain after phase 4');


const safeDeduplications=[
  {file:'assets/ae-mobile-compact-home.css',
   selector:'html body>header .ae-mobile-header-grid #themeToggle .ae-mobile-theme-caption',
   declaration:'display:none!important;'},
  {file:'assets/ae-take-rankings-palette.css',
   selector:'html body #aeHomeTakeHighlights .ae-discovery-list li',
   declaration:'min-width:0;'},
  {file:'assets/ae-admin-publish-plus-small-mobile.css',
   selector:'html body>header .ae-header-actions:has(#loggedAdminContainer:not(.hidden)) #aeCategoryAdmin .ae-admin-manage-label',
   declaration:'display:none!important;'}
];
for(const {file,selector,declaration} of safeDeduplications){
  const body=fs.readFileSync(file,'utf8');
  let count=0;
  let pos=0;
  while((pos=body.indexOf(selector,pos))>=0){
    const start=pos+selector.length;
    const open=body.indexOf('{',start);
    if(!body.slice(start,open).trim()){
      const close=body.indexOf('}',open+1);
      const declared=body.slice(open+1,close).replace(/\s+/g,'');
      if(declared===declaration)count++;
    }
    pos=start;
  }
  assert.equal(count,1,'The verified late CSS rule must be retained exactly once: '+file);
}

console.log('PASS: CSS referenced assets, existing cascade order and safe duplicate-rule cleanup.');
