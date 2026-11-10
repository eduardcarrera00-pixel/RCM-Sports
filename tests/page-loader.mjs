import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('index.html', 'utf8');
const source = html.match(/<script id="cam-page-loader">([\s\S]*?)<\/script>/)[1];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
};
const classes = () => {
  const values = new Set();
  return {add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value)};
};

function fixture() {
  let now = 0, nextTimer = 0, observer;
  const timers = new Map(), docEvents = new Map(), winEvents = new Map();
  const fonts = deferred(), image = deferred();
  const root = {classList: classes()};
  const screen = {id: 'camPageLoader', tagName: 'DIV', classList: classes(), remove() {this.removed = true;}};
  const main = {tagName: 'MAIN', inert: false};
  const alreadyInert = {tagName: 'DIV', inert: true};
  const body = {children: [screen, main, alreadyInert, {tagName: 'SCRIPT'}], attrs: new Map(),
    setAttribute(name, value) {this.attrs.set(name, value);}, removeAttribute(name) {this.attrs.delete(name);}};
  const visible = {loading: 'lazy', getBoundingClientRect: () => ({width:100,height:100,top:20,bottom:120,left:0,right:100}),
    decode() {this.decoded = true; return image.promise;}};
  const below = {loading: 'lazy', getBoundingClientRect: () => ({width:100,height:100,top:1200,bottom:1300,left:0,right:100}),
    decode() {throw Error('Below-fold images must stay lazy');}};
  const hidden = {loading: 'lazy', getBoundingClientRect: () => ({width:0,height:0,top:0,bottom:0,left:0,right:0}),
    decode() {throw Error('Hidden sections must stay lazy');}};
  const document = {documentElement: root, body, fonts: {ready: fonts.promise}, images: [visible,below,hidden],
    getElementById: id => id === screen.id && !screen.removed ? screen : null,
    addEventListener: (name, callback) => docEvents.set(name, callback)};
  const setTimeout = (callback, delay = 0) => {timers.set(++nextTimer, {callback, at:now + delay}); return nextTimer;};
  const context = {document, console, innerWidth:390, innerHeight:844, setTimeout,
    clearTimeout: id => timers.delete(id), requestAnimationFrame: callback => setTimeout(callback, 16),
    addEventListener: (name, callback) => winEvents.set(name, callback),
    MutationObserver: class {constructor(callback) {this.callback = callback; observer = this;} observe() {} disconnect() {this.disconnected = true;}}};
  context.window = context;
  vm.runInNewContext(source, context);
  const flush = async () => {for (let i = 0; i < 20; i++) await Promise.resolve();};
  async function advance(ms) {
    const target = now + ms;
    await flush();
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= target).sort((a,b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
      await flush();
    }
    now = target;
    await flush();
  }
  return {context, root, main, alreadyInert, body, screen, fonts, image, visible, below,
    advance, observer: () => observer, boot: () => {docEvents.get('DOMContentLoaded')(); winEvents.get('load')();},
    restore: () => winEvents.get('pageshow')({persisted:true})};
}

// DOM ready and window.load are insufficient while application data is pending.
const f = fixture();
assert.ok(f.root.classList.contains('cam-booting'));
const finishNews = f.context.camPageLoader.begin(), finishGames = f.context.camPageLoader.begin();
f.boot();
assert.equal(f.main.inert, true);
assert.equal(f.body.attrs.get('aria-busy'), 'true');
f.fonts.resolve(); f.image.resolve();
await f.advance(1000);
assert.ok(f.root.classList.contains('cam-booting'), 'Pending data stays covered');
finishNews(); finishNews(); // Idempotent release must not finish another request.
await f.advance(150);
assert.ok(f.root.classList.contains('cam-booting'));
finishGames();
await f.advance(150);
assert.equal(f.root.classList.contains('cam-booting'), false);
assert.equal(f.main.inert, false);
assert.equal(f.alreadyInert.inert, true, 'Pre-existing interaction locks are retained');
assert.equal(f.body.attrs.has('aria-busy'), false);
assert.equal(f.visible.loading, 'eager');
assert.equal(f.below.loading, 'lazy');
assert.ok(f.observer().disconnected);
await f.advance(250);
assert.equal(f.screen.removed, true);
f.context.camPageLoader.begin()();
f.restore();
assert.equal(f.root.classList.contains('cam-booting'), false, 'Later requests and back navigation cannot restart the entrance');

// A late module that starts during image decoding must also finish first.
const late = fixture();
late.boot(); late.fonts.resolve();
await late.advance(100);
assert.equal(late.visible.decoded, true);
const finishLate = late.context.camPageLoader.begin();
late.image.resolve();
await late.advance(200);
assert.ok(late.root.classList.contains('cam-booting'));
finishLate();
await late.advance(150);
assert.equal(late.root.classList.contains('cam-booting'), false);

// Image errors settle like successful downloads; a stalled request has a bound.
const broken = fixture();
broken.boot(); broken.fonts.resolve();
await broken.advance(100);
broken.image.reject(Error('Image unavailable'));
await broken.advance(150);
assert.equal(broken.root.classList.contains('cam-booting'), false);
const offline = fixture();
offline.context.camPageLoader.begin(); offline.boot();
await offline.advance(14999);
assert.ok(offline.root.classList.contains('cam-booting'));
await offline.advance(1);
assert.equal(offline.root.classList.contains('cam-booting'), false);
assert.equal(offline.main.inert, false);
offline.fonts.resolve(); offline.image.resolve();

assert.ok(html.indexOf('id="cam-page-loader"') < html.indexOf('src="assets/cam-pick-share.js'), 'Entrance starts before blocking app downloads');
assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(html, /cam-loading-logo[\s\S]*?src="assets\/cam-sports-logo-completo.webp\?v=20261024-lossless-1"/);
console.log('PASS: real data, late modules, image decoding, lazy images, idempotent completion, input locks, back cache, image errors and bounded offline exit.');
