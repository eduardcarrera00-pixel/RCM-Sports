import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Window} from 'happy-dom';

const w = new Window({url: 'https://camsports.github.io/?s=nfl'}), d = w.document;
const html = fs.readFileSync('index.html', 'utf8');
d.body.innerHTML = html.match(/<div id="camSportNewsCommunity"[\s\S]*?<p id="camSportCommunityStatus"[\s\S]*?<\/div>/)[0];
d.body.className = 'ae-is-nfl';
const news = [
  ...Array.from({length: 201}, (_, i) => ({id: 'n' + i, category: 'NFL'})),
  {id: 'f0', category: 'Fútbol'}, {id: 'c0', category: 'Colegial'}
];
const comments = [
  {id: 'other', article_id: 'c0', upvotes: 999, downvotes: 999},
  {id: 'n-best', article_id: 'n200', upvotes: 12, downvotes: 1},
  {id: 'n-second', article_id: 'n0', upvotes: 3, downvotes: 0},
  ...Array.from({length: 5}, (_, i) => ({id: 'n-extra-' + i, article_id: 'n0', upvotes: 2, downvotes: 0})),
  {id: 'f-best', article_id: 'f0', upvotes: 7, downvotes: 0},
  {id: 'f-worst', article_id: 'f0', upvotes: 0, downvotes: 8}
].map(t => ({...t, article_title: t.id, body: 'Comentario ' + t.id, author: 'Autor', created_at: '2026-11-10', my_vote: 0}));
const takes = ['nfl', 'football', 'laliga', 'premier', 'ligamx', 'champions', 'colegial']
  .map((sport, i) => ({id: 'take-' + sport, sport, title: 'Debate ' + sport, author: 'Aficionado', author_id: 'author-' + i,
    body: 'Conversación de ' + sport, upvotes: i, downvotes: 1, created_at: '2026-11-10'}));
const replyCount = {nfl: 2, football: 0, laliga: 7, premier: 3, ligamx: 1, champions: 8, colegial: 99};
const reads = [], mutations = [], opens = [];
let authChange, releaseNfl;
const nflGate = new Promise(resolve => { releaseNfl = resolve; });
let blockNfl = true, fail = false;
function from(table) {
  const filters = [], orders = [];
  let range, limit;
  return {
    select() { return this; },
    eq(k, v) { filters.push([k, 'eq', v]); return this; },
    in(k, v) { filters.push([k, 'in', v]); return this; },
    gt(k, v) { filters.push([k, 'gt', v]); return this; },
    order(k, opts) { orders.push([k, opts]); return this; },
    range(a, b) { range = [a, b]; return this; },
    limit(v) { limit = v; return this; },
    async then(resolve, reject) {
      try {
        reads.push({table, filters, range});
        if (fail) return resolve({error: Error('offline')});
        let rows = table === 'articles' ? news : table === 'rcm_comment_totals' ? comments : comments.map(c => ({id: c.id, user_id: 'comment-author'}));
        for (const [k, op, v] of filters) {
          if (k === 'is_public') continue;
          rows = rows.filter(row => op === 'eq' ? row[k] === v : op === 'in' ? v.includes(row[k]) : row[k] > v);
        }
        for (const [k, opts] of orders.toReversed()) rows = [...rows].sort((a, b) =>
          (typeof a[k] === 'number' ? a[k] - b[k] : String(a[k]).localeCompare(String(b[k]))) * (opts?.ascending === false ? -1 : 1));
        if (range) rows = rows.slice(range[0], range[1] + 1);
        if (limit) rows = rows.slice(0, limit);
        resolve({data: rows.map(row => ({...row}))});
      } catch (e) { reject(e); }
    }
  };
}
w.db = {from, auth: {onAuthStateChange(fn) { authChange = fn; }}, async rpc(name, args) {
  if (name === 'ae_public_take_feed') {
    if (args.p_sport === 'nfl' && blockNfl) await nflGate;
    if (fail) return {error: Error('offline')};
    return {data: takes.filter(t => t.sport === args.p_sport)};
  }
  if (name === 'ae_public_take_reply_counts') return {data: takes.filter(t => args.p_take_ids.includes(t.id))
    .map(t => ({take_id: t.id, reply_count: replyCount[t.sport]}))};
  mutations.push({name, args});
  if (name === 'rcm_set_comment_vote') {
    const row = comments.find(c => c.id === args.p_comment_id);
    row.my_vote = args.p_vote;
  }
  return {data: null};
}};
const rankFaces = [];
w.CamLeagues = {avatar(node, user) { rankFaces.push({node, user}); }};
w.currentUser = null;
w.articleURL = (a, c) => 'https://camsports.github.io/?article=' + a + '&comment=' + c;
w.openArticleFromShareLink = () => opens.push('article');
w.openUserAuthModal = () => opens.push('auth');
w.openAePublicProfile = id => opens.push(id);
w.aeTakeReplies = {open: row => opens.push(row.id)};
w.refreshCommunity = async () => {};
w.eval(fs.readFileSync('assets/cam-sport-news-community.js', 'utf8'));
const settle = () => new Promise(resolve => setTimeout(resolve, 35));
await settle();
// A slow NFL request cannot overwrite a later Fútbol page.
d.body.className = 'ae-is-football';
await settle();
await w.camSportNewsCommunity.refresh();
assert.equal(d.querySelector('#camSportNewsCommunity').dataset.sport, 'futbol');
assert.deepEqual([...d.querySelectorAll('#camSportDebatedList article')].map(n => n.dataset.recordId),
  ['take-champions', 'take-laliga', 'take-premier']);
assert.ok(d.querySelector('#camSportLeadersList').textContent.includes('f-best'));
assert.ok(!d.querySelector('#camSportLeadersList').textContent.includes('n-best'));
blockNfl = false; releaseNfl(); await settle();
assert.ok(!d.querySelector('#camSportDebatedList').textContent.includes('Debate nfl'));
assert.ok(!d.querySelector('#camSportNewsCommunity').textContent.includes('other'));
assert.equal(d.querySelector('.cam-snc-rank').textContent, '1');
assert.equal(d.querySelector('.cam-snc-take .cam-snc-excerpt'), null, 'Debate cards do not repeat the Take body');
assert.equal(d.querySelector('.cam-snc-take .cam-snc-meter').getAttribute('aria-label'), '5 a favor y 1 en contra');
assert.ok(d.querySelector('.is-supported .cam-snc-comment blockquote'));
assert.ok(d.querySelector('.is-questioned .cam-snc-comment .cam-snc-context a').textContent.startsWith('En '));

d.body.className = 'ae-is-nfl'; await settle();
assert.equal(d.querySelector('#camSportLeadersList article').dataset.recordId, 'n-best', 'Rank within the sport across all article pages and ID chunks');
assert.ok(reads.some(r => r.table === 'articles' && r.range[0] === 200), 'Article lookup is paginated');
const supportedTrack = d.querySelector('#camSportLeadersList .is-supported .cam-snc-track');
assert.equal(supportedTrack.querySelectorAll('article').length, 5, 'The sport-specific top five stays available in the carousel');
assert.ok([...supportedTrack.querySelectorAll('article')].every(n => !n.hidden), 'Scrolling replaces the old expansion gate');
assert.equal(d.querySelector('#camSportLeadersList .cam-snc-more'), null);
assert.equal(supportedTrack.tabIndex, 0, 'Native scrolling is keyboard accessible');
assert.equal(supportedTrack.querySelector('.cam-snc-category'), null, 'No repeated sport label');
assert.equal(supportedTrack.querySelector('.cam-snc-author').textContent, '', 'Only the real profile shield is displayed');
assert.equal(supportedTrack.querySelector('.cam-snc-author').getAttribute('aria-label'), 'Ver perfil de Autor');
assert.ok(rankFaces.some(face => face.user === 'comment-author' && face.node.dataset.rankLetter === 'A'), 'Distinguished opinion shows the author initial inside the actual rank shield');
assert.ok(rankFaces.some(face => face.user === 'author-0' && face.node.dataset.rankLetter === 'A'), 'Most debated Take shows the author initial inside the actual rank shield');
assert.equal(supportedTrack.querySelector('.cam-snc-context-arrow').tagName.toLowerCase(), 'svg', 'A thin vector replaces the old link glyph');
d.querySelector('#camSportDebatedList .cam-snc-reply').click();
assert.equal(opens.at(-1), 'take-nfl');
d.querySelector('#camSportLeadersList [data-direction="1"]').click(); await settle();
assert.equal(opens.at(-1), 'auth');
assert.equal(mutations.length, 0);
w.currentUser = {id: 'viewer'}; authChange('SIGNED_IN'); await settle();
d.querySelector('#camSportLeadersList [data-record-id="n-best"] [data-direction="1"]').click(); await settle();
assert.equal(mutations.at(-1).args.p_vote, 1);
d.querySelector('#camSportLeadersList [data-record-id="n-best"] [data-direction="1"]').click(); await settle();
assert.equal(mutations.at(-1).args.p_vote, 0, 'A repeated comment vote removes the existing vote');
d.querySelector('#camSportLeadersList .cam-snc-reply').click();
assert.equal(opens.at(-1), 'article', 'Responder retains the original article conversation');
d.querySelector('#camSportLeadersList .cam-snc-author').click();
assert.equal(opens.at(-1), 'comment-author', 'Author profiles keep their public ID');
const otherAuthor = d.createElement('button');
otherAuthor.dataset.camAuthorId = 'comment-author'; d.body.append(otherAuthor);
w.eval(fs.readFileSync('assets/cam-community-proof.js', 'utf8'));
await settle();
assert.equal(w.camDemoProfiles.isDemo('comment-author'), true, 'Internal attribution is preserved');
assert.equal(d.querySelector('#camSportNewsCommunity .cam-demo-account-tag'), null, 'No visible test badge is reinserted in sport news');
assert.ok(otherAuthor.nextElementSibling?.classList.contains('cam-demo-account-tag'), 'The change stays scoped to the approved surface');
assert.equal(d.querySelector('#camSportNewsCommunity .cam-snc-note'), null);
// Errors remain distinct from a real empty conversation and offer a retry.
fail = true; await w.camSportNewsCommunity.refresh(true);
assert.match(d.querySelector('#camSportDebatedList').textContent, /No pudimos cargar/);
assert.ok(d.querySelector('#camSportDebatedList .cam-snc-more'));
fail = false; await w.camSportNewsCommunity.refresh(true);
assert.doesNotMatch(d.querySelector('#camSportDebatedList').textContent, /No pudimos cargar/);
d.body.className = 'ae-is-home'; await settle();
assert.equal(d.getElementById('camSportNewsCommunity').hidden, true);
assert.ok(html.includes('assets/cam-sport-news-community.js'));
assert.ok(fs.readFileSync('assets/ae-football-mobile-redesign.js', 'utf8').includes("moveTo(byId('camSportNewsCommunity'), stage)"));
await w.happyDOM.close();
console.log('PASS: sport separation, football competitions, ranked replies, paginated leaders, stale responses, votes, auth, top-five carousels, profile rank shields and retries.');
