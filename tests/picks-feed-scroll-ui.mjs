import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('assets/community-picks.js','utf8');
const premium=fs.readFileSync('assets/ae-picks-premium.js','utf8');
const css=fs.readFileSync('assets/ae-picks-feed-scroll-20261018.css','utf8');

const w=new Window({url:'https://camsports.github.io/'});
w.document.body.innerHTML=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
const d=w.document,community=d.querySelector('#communityPicks'),feed=d.querySelector('#cpFeed');
const hint=d.querySelector('#cpFeedScrollHint'),footer=d.querySelector('#cpFeedFooter'),button=d.querySelector('#cpViewAll');

assert.ok(community&&feed&&hint&&footer&&button,'The original community feed and archive action exist');
assert.equal(feed.parentElement,community,'Feed stays in the Picks section before responsive column grouping');
assert.equal(footer.parentElement,community,'Archive button must be outside the feed');
assert.equal(footer.contains(button),true);
assert.equal(feed.contains(footer),false);
assert.ok(feed.compareDocumentPosition(footer)&w.Node.DOCUMENT_POSITION_FOLLOWING,'Archive button follows the scrolling cards');
assert.ok(hint.compareDocumentPosition(footer)&w.Node.DOCUMENT_POSITION_FOLLOWING,'Scroll hint precedes the archive action');
assert.equal(d.querySelectorAll('#cpViewAll').length,1,'Keep exactly one archive button');
assert.match(js,/limit=20/,'Twenty cards are requested');
assert.match(js,/order\('created_at',\{ascending:false\}\)\.order\('id',\{ascending:false\}\)\.range\(0,limit-1\)/,'Newest picks go first with a deterministic tiebreaker');
assert.match(js,/matches\?2:3/,'Mobile and desktop reveal several cards before scrolling');
assert.match(js,/feedEl\.replaceChildren\(\.\.\.\(feed\.data\|\|\[\]\)\.map\(p=>card\(p\)\)\)/,'Original Pick rendering remains unchanged');
assert.doesNotMatch(js,/feedEl\.replaceChildren\([^;\n]*footer\)/,'Footer cannot be reinserted inside scroller');
assert.ok(premium.includes("community.querySelector(':scope > #cpFeedFooter')"),'Desktop relocation also moves the footer with the feed');
assert.match(css,/#cpFeedFooter\.ae-picks-feed-footer/,'Footer has its own non-scrolling styling');
assert.match(css,/max-height:min\(var\(--ae-picks-feed-window-height,620px\),72vh,650px\)/,'Mobile scrolling height is capped');
assert.match(css,/max-height:min\(var\(--ae-picks-feed-window-height,720px\),78vh,820px\)/,'Desktop scrolling height is capped');
assert.equal(feed.querySelector('#cpViewAll'),null);
await w.happyDOM.close();
console.log('PASS: twenty recent Picks, stable order, unmodified cards and archive button outside scroll on responsive layouts.');
