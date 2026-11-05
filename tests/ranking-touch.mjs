import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handlers = new Map();
let mobile = true;
let timerId = 0;
const timers = new Map();
const document = {
  addEventListener(type, callback) {
    const list = handlers.get(type) || [];
    list.push(callback); handlers.set(type, list);
  }
};
vm.runInNewContext(fs.readFileSync('assets/ae-ranking-notes.js', 'utf8'), {
  document,
  window: { addEventListener() {}, matchMedia: () => ({matches: mobile}) },
  getComputedStyle: el => ({transform: el.transform, animationDuration: '43s'}),
  DOMMatrixReadOnly: class {
    constructor(value) { this.m41 = Number(value.match(/matrix\(([^)]+)\)/)[1].split(',')[4]); }
  },
  clearTimeout: id => timers.delete(id), setTimeout: fn => { timers.set(++timerId, fn); return timerId; }
});
const down = handlers.get('pointerdown')[0];
function fixture(transform = 'matrix(1, 0, 0, 1, -350, 0)') {
  const classes = new Set();
  const track = {
    transform,
    classList: {contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x)},
    style: {setProperty: (k, v) => { track[k] = v; }},
    querySelector: () => ({getBoundingClientRect: () => ({width: 1800})})
  };
  const viewport = {scrollLeft: 0, querySelector: () => track};
  return {classes, track, viewport, event: {pointerType: 'touch', target: {closest: () => viewport}}};
}
for (const sport of ['NFL', 'Champions']) {
  const f = fixture(); down(f.event);
  assert(f.classes.has('ae-ranking-manual'), sport);
  assert.equal(f.viewport.scrollLeft, 350, 'preserve the currently visible team');
  f.viewport.scrollLeft = 800; down(f.event);
  assert.equal(f.viewport.scrollLeft, 800, 'later touches retain the user position');
}
const wrapped = fixture('matrix(1, 0, 0, 1, -2150, 0)'); down(wrapped.event);
assert.equal(wrapped.viewport.scrollLeft, 350, 'wrap the duplicate loop into the real Top 10');
const reduced = fixture('none'); down(reduced.event);
assert.equal(reduced.viewport.scrollLeft, 0);
const mouse = fixture(); down({...mouse.event, pointerType: 'mouse'});
assert.equal(mouse.classes.size, 0, 'mouse leaves autoplay unchanged');
const resumed = fixture(); down(resumed.event);
for (const handler of handlers.get('pointerup')) handler({});
for (const callback of [...timers.values()]) callback();
assert(!resumed.classes.has('ae-ranking-manual'), 'autoplay returns after touch and inertia settle');
assert.equal(resumed.viewport.scrollLeft, 0);
assert.equal(resumed.track['animation-delay'], -(350 / 1800) * 43 + 's', 'resume at the same visual offset');
mobile = false;
const desktop = fixture(); down(desktop.event);
assert.equal(desktop.classes.size, 0, 'desktop touch does not enter mobile mode');
console.log('PASS: both rankings hand autoplay to native touch scrolling without resetting the visible position.');
