import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('assets/community-picks.js','utf8');
const premium=fs.readFileSync('assets/ae-picks-premium.js','utf8');
const css=fs.readFileSync('assets/cam-picks-moderno.css','utf8');

const w=new Window({url:'https://camsports.github.io/'});
w.document.body.innerHTML=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const d=w.document,community=d.querySelector('#communityPicks'),feed=d.querySelector('#cpFeed');
const hint=d.querySelector('#cpFeedScrollHint'),footer=d.querySelector('#cpFeedFooter'),button=d.querySelector('#cpViewAll');

assert.ok(community&&feed&&hint&&footer&&button,'The original community feed and archive action exist');
assert.equal(feed.parentElement,community,'Feed stays in the Picks section before responsive column grouping');
assert.equal(footer.parentElement,community,'Archive button must be outside the feed');
assert.equal(footer.contains(button),true);
assert.equal(feed.contains(footer),false);
assert.ok(feed.compareDocumentPosition(footer)&w.Node.DOCUMENT_POSITION_FOLLOWING,'Archive button follows the cards');
assert.ok(hint.compareDocumentPosition(footer)&w.Node.DOCUMENT_POSITION_FOLLOWING,'Scroll hint precedes the archive action');
assert.equal(d.querySelectorAll('#cpViewAll').length,1,'Keep exactly one archive button');
assert.match(js,/limit=20/,'Twenty cards are requested');
assert.match(js,/order\('created_at',\{ascending:false\}\)\.order\('id',\{ascending:false\}\)\.range\(0,limit-1\)/,'Newest picks go first with a deterministic tiebreaker');
assert.match(js,/const FEED_VISIBLE=6;/,'Picks moderno: six Picks in the page flow, the rest in the archive');
assert.match(js,/feedEl\.replaceChildren\(\.\.\.\(feed\.data\|\|\[\]\)\.slice\(0,FEED_VISIBLE\)\.map\(p=>card\(p,false,false,currentViewerId,'stream'\)\)\)/,'The feed uses the modern stream card');
assert.doesNotMatch(js,/feedEl\.replaceChildren\([^;\n]*footer\)/,'Footer cannot be reinserted inside scroller');
assert.ok(premium.includes("community.querySelector(':scope > #cpFeedFooter')"),'Desktop relocation also moves the footer with the feed');
assert.match(css,/#cpFeedScrollHint \{ display: none !important; \}/,'No «Desliza…» hint: the feed has no inner scroll');
assert.match(css,/#communityPicks #cpFeed \{[^}]*max-height: none !important;[^}]*overflow: visible !important;/,'The feed grows with the page');
assert.match(css,/#communityPicks #cpFeedFooter \{/,'Footer keeps its own styling');
assert.equal(feed.querySelector('#cpViewAll'),null);
await w.happyDOM.close();
console.log('PASS: twenty recent Picks requested, six in the page flow with the modern card, archive button after the feed.');
