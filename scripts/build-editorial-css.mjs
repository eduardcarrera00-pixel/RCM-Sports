import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {minifyCss} from './css-minifier.mjs';

// Combina las hojas de assets/style-sources.json, en su orden, en assets/ae-editorial-bundle.css.
// La salida usa siempre el mismo minificador conservador para preservar colores y
// evitar diferencias entre máquinas con/sin Tailwind. No edites el bundle a mano.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets/ae-editorial-bundle.css');
const sources = JSON.parse(fs.readFileSync(path.join(root, 'assets/style-sources.json'), 'utf8'));
const css = sources.map(file => `/* ${file} */\n${fs.readFileSync(path.join(root, file), 'utf8')}`).join('\n');

export {minifyCss} from './css-minifier.mjs';

// Always use the same conservative generator, locally and in CI.
// A prior optional Tailwind pass rewrote rgba(245,236,223,.10) as HSL and
// rounded its red/green/blue values, subtly changing the approved day colors.
// Compression must not change presentation; removing the optional branch
// makes every CSS rebuild reproducible regardless of npm dependencies.
const contents = minifyCss(css);
if (process.argv.includes('--check')) {
  if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== contents) {
    throw new Error('Editorial CSS is stale; run npm run build:styles.');
  }
} else {
  fs.writeFileSync(out, contents);
}
console.log(`Editorial CSS: ${sources.length} stylesheets combined with deterministic conservative minifier; source order preserved.`);
