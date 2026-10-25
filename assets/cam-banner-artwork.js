/* CAM SPORTS · Transparent ink for decorative banner illustrations.
 * Only the banner renderer calls this helper. Original uploads remain editable;
 * photographs and editorial/team images retain their original colours.
 */
(() => {
  'use strict';
  const cache = new Map();

  function analyze(pixels, w, h) {
    let transparent = 0;
    const bins = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 30) { transparent++; continue; }
      const key = (pixels[i] >> 4) * 256 + (pixels[i + 1] >> 4) * 16 + (pixels[i + 2] >> 4);
      const bin = bins.get(key) || [0, 0, 0, 0];
      bin[0]++;
      for (let c = 0; c < 3; c++) bin[c + 1] += pixels[i + c];
      bins.set(key, bin);
    }
    const alphaOnly = transparent > w * h * .2;
    let rgb = null, foreground = [0, 0, 0], count = 0;
    if (!alphaOnly) {
      const bg = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
      if (!bg) return { empty: true };
      rgb = bg.slice(1).map(n => n / bg[0]);
      const flat = [...bins.values()].reduce((sum, bin) => sum +
        (bin.slice(1).reduce((d, n, c) => d + Math.abs(n / bin[0] - rgb[c]), 0) < 90 ? bin[0] : 0), 0);
      if (flat < w * h * .65) return null;
    }
    const distance = i => rgb ? Math.abs(pixels[i] - rgb[0]) +
      Math.abs(pixels[i + 1] - rgb[1]) + Math.abs(pixels[i + 2] - rgb[2]) : 255;
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < ink.length; i++) {
      const p = i * 4;
      if (pixels[p + 3] > 100 && distance(p) > 150) {
        ink[i] = 1; count++;
        for (let c = 0; c < 3; c++) foreground[c] += pixels[p + c];
      }
    }
    if (!count) return { empty: true };
    foreground = foreground.map(n => n / count);
    const parts = [];
    for (let i = 0; i < ink.length; i++) {
      if (!ink[i]) continue;
      const queue = [i]; ink[i] = 0;
      let left = w, top = h, right = -1, bottom = -1, red = 0, green = 0, blue = 0;
      for (let n = 0; n < queue.length; n++) {
        const at = queue[n], x = at % w, y = Math.floor(at / w);
        red += pixels[at * 4]; green += pixels[at * 4 + 1]; blue += pixels[at * 4 + 2];
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
        for (const next of [at - 1, at + 1, at - w, at + w]) {
          if (next >= 0 && next < ink.length && ink[next] && Math.abs(next % w - x) <= 1) {
            ink[next] = 0; queue.push(next);
          }
        }
      }
      const pw = right - left + 1, ph = bottom - top + 1, fill = queue.length / (pw * ph);
      if (queue.length < Math.max(2, w * h * .0001)) continue;
      // Exclude old rectangular frames, keeping the actual illustration.
      if ((pw > w * .85 && (ph < h * .12 || fill < .3)) ||
          (ph > h * .85 && pw < w * .12)) continue;
      const edge = left < w * .025 || right >= w * .975 || top < h * .025 || bottom >= h * .975;
      if (edge && ((pw < w * .06 && ph > h * .2) || (ph < h * .06 && pw > w * .2))) continue;
      if (edge && fill < .45 && (pw < w * .12 || ph < h * .12)) continue;
      parts.push({ left, top, right, bottom, count: queue.length, rgb: [red, green, blue] });
    }
    if (!parts.length) return { empty: true };
    parts.sort((a, b) => b.count - a.count);
    const main = parts[0], reach = Math.max(main.right - main.left, main.bottom - main.top) * .8 + 4;
    const group = parts.filter(p => p.right >= main.left - reach && p.left <= main.right + reach &&
      p.bottom >= main.top - reach && p.top <= main.bottom + reach);
    const inkCount = group.reduce((sum, p) => sum + p.count, 0);
    foreground = [0, 1, 2].map(c => group.reduce((sum, p) => sum + p.rgb[c], 0) / inkCount);
    let left = Math.min(...group.map(p => p.left)), top = Math.min(...group.map(p => p.top));
    let right = Math.max(...group.map(p => p.right)), bottom = Math.max(...group.map(p => p.bottom));
    const pad = Math.max(2, Math.ceil(Math.max(right - left, bottom - top) * .08));
    left = Math.max(0, left - pad); top = Math.max(0, top - pad);
    right = Math.min(w - 1, right + pad); bottom = Math.min(h - 1, bottom + pad);
    const vector = rgb ? foreground.map((n, c) => n - rgb[c]) : [0, 0, 0];
    const energy = vector.reduce((sum, n) => sum + n * n, 0);
    return { left, top, width: right - left + 1, height: bottom - top + 1,
      imageWidth: w, imageHeight: h, rgb, foreground, alphaOnly, vector, energy };
  }

  function alphaFor(r, g, b, alpha, art) {
    if (art.alphaOnly) return alpha;
    if (!art.energy) return 0;
    const v = art.vector, bg = art.rgb;
    const projection = ((r - bg[0]) * v[0] + (g - bg[1]) * v[1] + (b - bg[2]) * v[2]) / art.energy;
    // Remove compression noise while retaining antialiased edges as real alpha.
    return Math.round(alpha * Math.max(0, Math.min(1, (projection - .035) / .965)));
  }

  function load(url) {
    if (cache.has(url)) return cache.get(url);
    const job = new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onerror = () => resolve({ photo: true });
      image.onload = () => {
        try {
          const scale = Math.min(320 / image.naturalWidth, 180 / image.naturalHeight, 1);
          const canvas = document.createElement('canvas');
          const w = canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
          const h = canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx || w < 8 || h < 8) { resolve({ photo: true }); return; }
          ctx.drawImage(image, 0, 0, w, h);
          const art = analyze(ctx.getImageData(0, 0, w, h).data, w, h);
          if (!art) { resolve({ photo: true }); return; }
          if (art.empty) { resolve(art); return; }
          const full = Math.min(768 / image.naturalWidth, 768 / image.naturalHeight, 1);
          canvas.width = Math.max(1, Math.round(image.naturalWidth * full));
          canvas.height = Math.max(1, Math.round(image.naturalHeight * full));
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            const p = (y * canvas.width + x) * 4;
            const inCrop = x / canvas.width >= art.left / w && x / canvas.width <= (art.left + art.width) / w &&
              y / canvas.height >= art.top / h && y / canvas.height <= (art.top + art.height) / h;
            rgba.data[p + 3] = inCrop ? alphaFor(rgba.data[p], rgba.data[p + 1], rgba.data[p + 2], rgba.data[p + 3], art) : 0;
            rgba.data[p] = rgba.data[p + 1] = rgba.data[p + 2] = 255;
          }
          ctx.putImageData(rgba, 0, 0);
          resolve(Object.assign(art, { mask: canvas.toDataURL('image/png') }));
        } catch { resolve({ photo: true }); }
      };
      image.src = url;
    });
    cache.set(url, job);
    return job;
  }
  window.camBannerArtwork = Object.freeze({ load, analyze, alphaFor });
})();
