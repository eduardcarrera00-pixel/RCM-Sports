import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Window} from 'happy-dom';

const html = fs.readFileSync('index.html', 'utf8');
const community = fs.readFileSync('assets/community.js', 'utf8');
const home = fs.readFileSync('assets/cam-home-jornada.js', 'utf8');
const between = (source, start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const w = new Window({url: 'https://example.test/'});
const requests = [], notices = [], opens = [], writes = [];
let guestReads = 0, signedInReads = 0, authOpens = 0;
let likes = [{article_id:'news-a', likes:3, my_like:false}];
let comments = [{id:'parent',article_id:'news-a'}, {id:'reply',article_id:'news-a'}];
let commentsError = false, likesError = false, pendingWrite = null;
const makeClient = guest => ({
  from(table) {
    guest ? guestReads++ : signedInReads++;
    const request = {table};
    return {
      select(columns) {request.columns = columns; return this;},
      in(column, ids) {request.filter = [column, [...ids]]; return this;},
      order() {return this;},
      range(start,end) {request.range = [start,end]; return this;},
      then(resolve, reject) {
        requests.push(request);
        const error = table === 'comments' ? commentsError : likesError;
        const rows = table === 'comments' ? comments : likes;
        return Promise.resolve({data: error ? null : rows.slice(request.range[0], request.range[1]+1),
          error: error ? new Error('Offline') : null}).then(resolve, reject);
      }
    };
  },
  async rpc(name,payload) {
    writes.push({name,payload});
    if (pendingWrite) await pendingWrite;
    likes = [{article_id:'news-a', likes:payload.p_liked ? 4 : 3, my_like:payload.p_liked}];
    return {error:null};
  }
});
const context = vm.createContext({console, document:w.document,
  articles:[{id:'news-a',remote:true,likes:null,commentCount:null}, {id:'news-empty',remote:true,likes:null}],
  currentUser:null, activeModalArticleId:null,
  publicArticlesDb:makeClient(true), db:makeClient(false),
  escapeHTML:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
  articleIdArgument:id=>'&quot;'+id+'&quot;',
  renderTrending() {},
  renderArticlesFeed() {throw Error('Statistics must not replace the news cards');},
  updateModalLikeBtn() {},
  openArticleModal:(id,options)=>opens.push({id,options}),
  openUserAuthModal:()=>authOpens++,
  notifyCommunity:message=>notices.push(message)
});
vm.runInContext(between(html,'        function renderArticleInteractions(', '        function renderArticlesFeed('),context);
vm.runInContext(between(community,'async function fetchAll(', 'async function loadCommentsFromSupabase('),context);
vm.runInContext(community.slice(community.indexOf('// Shared article likes and card comments')),context);

w.document.body.innerHTML = '<main id="mainContent"><div id="articlesGrid">'+context.renderArticleInteractions(context.articles[0])+'</div>'+
  '<div id="aeSportLatestNews">'+context.renderArticleInteractions(context.articles[0])+'</div></main>';
const button = w.document.querySelector('[data-cam-news-like]');
assert.equal(button.querySelector('span').textContent,'—','Unknown likes must not display an invented zero');
assert.equal(button.type,'button');
assert.equal(w.document.querySelectorAll('.cam-news-interactions button').length,4);
assert.ok(!w.document.querySelector('button button'),'No nested interactive controls');
assert.ok(!between(html,'            const renderNewsCard = art => {','            if (isHome) {').includes('art.readTime'));

await context.refreshArticleStats();
assert.equal(context.articles[0].likes,3);
assert.equal(context.articles[0].commentCount,2,'Count includes replies, just like the article reader');
assert.equal(context.articles[1].commentCount,0);
assert.equal(guestReads,2,'Guest counts use the independent public client');
assert.equal(signedInReads,0);
assert.deepEqual(requests.find(r=>r.table==='comments').filter,['article_id',['news-a','news-empty']]);
assert.equal(requests.find(r=>r.table==='comments').columns,'id,article_id','Do not download comment text or identities for the card counters');
assert.equal(w.document.querySelectorAll('[data-cam-news-comments]')[1].querySelector('span').textContent,'2');
assert.strictEqual(w.document.querySelector('[data-cam-news-like]'),button,'Refresh preserves the same DOM node');

await context.setArticleLike('news-a');
assert.equal(authOpens,1);
assert.equal(writes.length,0,'Guest likes keep the normal sign-in requirement');
context.currentUser={id:'reader'};
let release;
pendingWrite = new Promise(resolve=>{release=resolve;});
button.focus();
const first = context.setArticleLike('news-a');
assert.equal(button.disabled,true);
assert.equal(button.getAttribute('aria-busy'),'true');
await context.setArticleLike('news-a');
assert.equal(writes.length,1,'Repeated taps while pending write only once');
release();
await first;
pendingWrite = null;
assert.equal(button.disabled,false);
assert.equal(button.getAttribute('aria-pressed'),'true');
assert.equal(button.querySelector('span').textContent,'4');
assert.ok(button.querySelector('.fa-solid.fa-heart'));
assert.strictEqual(w.document.querySelector('[data-cam-news-like]'),button);
await context.setArticleLike('news-a');
assert.equal(button.getAttribute('aria-pressed'),'false','A second completed tap removes the like');
assert.equal(writes.at(-1).payload.p_liked,false);

commentsError = true;
await context.refreshArticleStats();
assert.equal(context.articles[0].commentCount,2,'An error preserves the last known comment count');
commentsError = false;
likesError = true;
comments = Array.from({length:205},(_,index)=>({id:String(index),article_id:'news-a'}));
assert.equal(await context.refreshArticleStats(),false);
assert.equal(context.articles[0].commentCount,205,'Comment counts still update when likes fail, including pagination');
assert.equal(context.articles[0].likes,3,'Failed likes keep their last confirmed count');
assert.equal(notices.length,1);

let stopped = false;
context.openArticleComments('news-a',{stopPropagation(){stopped=true;}});
assert.equal(stopped,true);
assert.equal(opens[0].id,'news-a');
assert.equal(opens[0].options.focusComments,true);

// The mobile Home has its own card renderer. It must use sibling controls,
// so tapping a like or comment never triggers the story's image/title button.
context.window = {renderArticleInteractions:context.renderArticleInteractions,
  openArticleModal:(id)=>opens.push({id})};
vm.runInContext(between(home,'  function el(', '  const client ='),context);
vm.runInContext(between(home,'  function newsCard(', '  function paintNews('),context);
const mobileCard = context.newsCard({...context.articles[0],title:'Noticia móvil',category:'NFL',date:'8 nov 2026',readTime:'2 min de lectura'});
w.document.querySelector('main').append(mobileCard);
assert.equal(mobileCard.tagName,'ARTICLE');
assert.equal(mobileCard.querySelectorAll('button').length,3,'Mobile Home has a story button plus like and comment buttons');
assert.equal(mobileCard.querySelector('button button'),null);
assert.ok(!mobileCard.textContent.includes('nov 2026'));
assert.ok(!mobileCard.textContent.includes('min de lectura'));
mobileCard.querySelector('.cam-hj-news-open').click();
assert.equal(opens.at(-1).id,'news-a');
assert.equal(mobileCard.querySelector('[data-cam-news-comments] span').textContent,'205');

w.document.body.insertAdjacentHTML('beforeend','<div id="articleModal"><section class="ae-conversation"><div id="commentAuthStatus"></div><textarea id="commentText"></textarea></section></div>');
let jumps=0;
w.document.querySelector('.ae-conversation').scrollIntoView=()=>jumps++;
context.activeModalArticleId='news-a';
context.focusArticleComments('news-a');
assert.equal(w.document.activeElement.id,'commentText');
context.currentUser=null;
context.focusArticleComments('news-a');
assert.equal(w.document.activeElement.id,'commentAuthStatus');
context.activeModalArticleId='another-story';
context.focusArticleComments('news-a');
assert.equal(jumps,2,'A stale animation frame cannot move a different article');
await w.happyDOM.close();
console.log('PASS: shared news counters, guest reads, zero/unknown/error states, replies and pagination, duplicate-tap guard, like/unlike, stable cards, and direct comment focus.');
