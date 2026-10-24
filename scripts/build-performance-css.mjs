/**
 * Regenerate CAM SPORTS stylesheet packs without reordering CSS cascade.
 * Usage: node scripts/build-performance-css.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/performance-css-packs.json'), 'utf8'));
const verifyOnly = process.argv.includes('--check');
let files = 0;
let bytes = 0;

for (const group of manifest.groups) {
  if (!/^assets\/[a-z0-9-]+\.css$/.test(group.output) || !Array.isArray(group.sources) || group.sources.length < 2) {
    throw new Error('Invalid performance CSS pack: ' + group.output);
  }
  const contents = group.sources.map(source => {
    if (!/^assets\/[\w-]+\.css$/.test(source)) throw new Error('Invalid CSS source: ' + source);
    const css = fs.readFileSync(path.join(root, source), 'utf8').trimEnd();
    if (/^\s*@(import|charset)\b/m.test(css)) {
      throw new Error('CSS @import/@charset cannot be moved inside a pack: ' + source);
    }
    files++;
    return `/* ${source} */\n${css}\n`;
  }).join('\n') + '\n';
  const output = path.join(root, group.output);
  bytes += Buffer.byteLength(contents);
  if (verifyOnly) {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== contents) {
      throw new Error('CSS performance pack is stale; run npm run build:css-packs: ' + group.output);
    }
  } else {
    fs.writeFileSync(output, contents);
  }
}
console.log(`${verifyOnly ? 'Verified' : 'Built'} ${manifest.groups.length} CSS packs from ${files} stylesheet files (${bytes} bytes).`);
