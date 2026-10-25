import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../assets/cam-banner-artwork.js', import.meta.url), 'utf8'), context);
const { analyze, alphaFor } = context.window.camBannerArtwork;
const w = 120, h = 64;
function image(background, foreground, border = false) {
  const pixels = new Uint8ClampedArray(w * h * 4);
  const set = (x, y, colour) => pixels.set(colour, (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, background);
  for (let y = 24; y < 42; y++) for (let x = 84; x < 104; x++)
    if (y < 28 || y > 37 || x < 88 || x > 99) set(x, y, foreground);
  if (border) for (let y = 5; y < h - 5; y++) set(w - 2, y, [176, 139, 71, 255]);
  return pixels;
}

for (const [bg, fg] of [
  [[0, 0, 12, 255], [255, 255, 255, 255]],
  [[243, 235, 221, 255], [10, 50, 104, 255]]
]) {
  const art = analyze(image(bg, fg, true), w, h);
  assert.ok(art, 'Flat dark and cream artwork must be recognised');
  assert.ok(art.left >= 80 && art.width < 35 && art.height < 30,
    'The outline of the original canvas must not shrink the logo');
  assert.equal(alphaFor(...bg, art), 0, 'The old rectangle must become transparent');
  assert.equal(alphaFor(...fg, art), 255, 'The actual illustration must remain opaque');
  const edge = bg.slice(0, 3).map((v, c) => Math.round((v + fg[c]) / 2));
  const alpha = alphaFor(...edge, 255, art);
  assert.ok(alpha > 100 && alpha < 150, 'Antialiased edges retain partial alpha');
}

const transparent = analyze(image([0, 0, 0, 0], [243, 235, 221, 255]), w, h);
assert.equal(transparent.alphaOnly, true);
assert.equal(alphaFor(15, 40, 60, 128, transparent), 128, 'Existing alpha is preserved');
assert.equal(analyze(new Uint8ClampedArray(w * h * 4).fill(128), w, h).empty, true,
  'A plain uploaded background must not appear as a rectangular logo');
const photograph = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
  photograph.set([x * 255 / w, y * 255 / h, (x + y) * 255 / (w + h), 255], (y * w + x) * 4);
assert.equal(analyze(photograph, w, h), null, 'Photographic colour gradients must not be recoloured');
console.log('PASS: dark/cream backgrounds removed, canvas frames excluded, alpha edges retained, photographs preserved.');
