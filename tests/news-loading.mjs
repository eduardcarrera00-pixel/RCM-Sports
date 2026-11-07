import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const session = deferred(), stats = deferred();
const listeners = new Map(), timers = new Map(), clients = [], reads = [], renders = [];
const elements = {dataStatus: {textContent: ''}, retryArticles: {hidden: true}};
const row = {id: 'public-news', title: 'Noticias de CAM SPORTS', category: 'NFL',
  author: 'Editor', created_at: '2026-11-07T12:00:00Z', body: '<p>Análisis deportivo.</p>'};
let respond = () => Promise.resolve({data: [row], error: null});
let adminChecks = 0, sharedOpens = 0, timerId = 0;

function query(table) {
  const request = {table, filters: []};
  const builder = {
    select() { return this; },
    eq(...filter) { request.filters.push(filter); return this; },
    order() { return this; },
    range(start, end) { request.range = [start, end]; return this; },
    abortSignal(signal) { request.signal = signal; return this; },
    then(resolve, reject) {
      reads.push(request);
      const result = new Promise((done, fail) => {
        const abort = () => fail(new Error('Request aborted'));
        request.signal?.addEventListener('abort', abort, {once: true});
        if (request.signal?.aborted) return abort();
        Promise.resolve(respond(request)).then(done, fail).finally(() => {
          request.signal?.removeEventListener('abort', abort);
        });
      });
      return result.then(resolve, reject);
    }
  };
  return builder;
}

const context = vm.createContext({
  console, AbortController,
  document: {getElementById: id => elements[id]},
  localStorage: {removeItem() {}},
  supabase: {createClient(url, key, options) {
    clients.push({url, key, options});
    return clients.length === 1
      ? {supabaseUrl: url, supabaseKey: key, from: () => { throw Error('Public news used the blocked signed-in client'); }}
      : {from: query};
  }},
  addEventListener: (name, callback) => listeners.set(name, callback),
  setTimeout(callback, delay) { timers.set(++timerId, {callback, delay}); return timerId; },
  clearTimeout: id => timers.delete(id),
  withLocalInteractions: article => article,
  safeImageURL: url => url || '',
  renderAdminUI() {}, renderPoll() {}, renderTrending() {}, refreshCommunity() {},
  renderArticlesFeed() { renders.push(vm.runInContext('articles.map(article => article.title).join() ', context)); },
  loadUserSession: () => session.promise,
  loadAdminSession: async () => { adminChecks++; },
  openArticleFromShareLink: () => { sharedOpens++; },
  refreshArticleStats: () => stats.promise,
  loadArticleViews: () => stats.promise
});
context.window = context;
vm.runInContext(`let articles = [], loadingArticles = false, initialArticlesPending = true;
const defaultArticles = [];
${between('        const db = window.supabase', '        let publishDraftId')}
${between('        function setDataStatus(', '       window.addEventListener(\'DOMContentLoaded\'')}
${between('        function fromDatabase(', '        function exportLegacyArticles(')}
${between('       window.addEventListener(\'DOMContentLoaded\'', '        async function loadAdminSession(')}`, context);
const state = () => vm.runInContext('({articles, loadingArticles, initialArticlesPending})', context);
const startup = listeners.get('DOMContentLoaded')();
await tick();
assert.ok(renders.includes(row.title), 'Public news renders even when the saved session never finishes loading');
assert.equal(sharedOpens, 1, 'A shared article opens without waiting for authentication, likes or views');
assert.equal(elements.dataStatus.textContent, '', 'Slow statistics cannot keep the loading status visible');
assert.equal(state().loadingArticles, false, 'Slow statistics cannot prevent another feed refresh');
assert.equal(state().initialArticlesPending, false);
assert.equal(adminChecks, 0, 'Editor permissions still wait for the normal authenticated session');
assert.equal(clients.length, 2);
assert.equal(clients[1].options.auth.persistSession, false);
assert.equal(clients[1].options.auth.autoRefreshToken, false);
assert.equal(clients[1].options.auth.detectSessionInUrl, false);
assert.notEqual(clients[1].options.auth.storageKey, undefined);
assert.equal(reads[0].table, 'articles');
assert.deepEqual(reads[0].filters, [['is_public', true]], 'The independent reader only asks for published news');
assert.equal(timers.size, 0, 'Successful requests clear the timeout');

// A stalled connection must release the loading guard and offer an in-place retry.
respond = () => new Promise(() => {});
const stalled = context.loadArticlesFromStorage();
await tick();
const count = reads.length;
await context.loadArticlesFromStorage();
assert.equal(reads.length, count, 'Repeated taps do not duplicate an in-flight request');
assert.equal(timers.size, 1);
const timeout = [...timers.values()][0];
assert.ok(timeout.delay > 0 && timeout.delay <= 15000, 'A stalled public request has a bounded deadline');
timeout.callback();
await stalled;
assert.equal(state().loadingArticles, false);
assert.equal(elements.retryArticles.hidden, false);
assert.match(elements.dataStatus.textContent, /conexión/);
assert.equal(state().articles[0].title, row.title, 'A failed refresh keeps already loaded articles');

// The same retry path can recover; real empty results are no longer pending.
respond = () => Promise.resolve({data: [], error: null});
await context.loadArticlesFromStorage();
assert.equal(elements.retryArticles.hidden, true);
assert.equal(elements.dataStatus.textContent, '');
assert.equal(state().initialArticlesPending, false);
assert.equal(state().articles.length, 0);
assert.equal(timers.size, 0);

// A normal database error also offers retry, and pagination retains every article.
respond = () => Promise.resolve({data: null, error: {message: 'Temporary server error'}});
await context.loadArticlesFromStorage();
assert.equal(elements.retryArticles.hidden, false);
respond = request => Promise.resolve({data: request.range[0] === 0 ? Array(1000).fill(row) : [row], error: null});
await context.loadArticlesFromStorage();
assert.equal(state().articles.length, 1001);
assert.equal(elements.retryArticles.hidden, true);
assert.equal(timers.size, 0);
session.resolve();
await startup;
assert.equal(adminChecks, 1, 'The regular editor check still completes when authentication recovers');
console.log('PASS: public news and shared links load during blocked auth/stats; bounded timeout, retry, empty results, errors, pagination and editor checks.');
