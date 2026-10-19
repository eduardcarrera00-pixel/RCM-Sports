/* CSS maintenance regression gate; never modifies the site. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const report=JSON.parse(execFileSync(process.execPath,['scripts/audit-css.mjs','--json'],
  {encoding:'utf8',maxBuffer:4*1024*1024}));
assert.equal(report.status,'ok','Every stylesheet referenced in the active cascade must exist');
assert.deepEqual(report.missing,[],'No missing CSS files');
assert.ok(report.bundleSourceCount>=70,'Editorial bundle sources must not disappear accidentally');
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
assert.deepEqual(repeated.sort(),existingDuplicateSources.sort(),
  'Review every change to the order or number of double-loaded stylesheets');

// First safe cleanup: two identical, unconditional badge visibility rules
// were in the same standalone CSS. Preserve the later authoritative rule.
const auth=fs.readFileSync('assets/ae-classical-auth-buttons.css','utf8');
const hidden=/html body>header #aeNotificationsButton #aeNotificationsBadge\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;\s*\}/g;
assert.equal([...auth.matchAll(hidden)].length,1,'Keep exactly one hidden notification badge rule');

const html=fs.readFileSync('index.html','utf8');
assert.match(html,/ae-editorial-bundle\.css/);
assert.match(html,/ae-classical-auth-buttons\.css/);
console.log('PASS: CSS referenced assets, existing cascade order and safe duplicate-rule cleanup.');
