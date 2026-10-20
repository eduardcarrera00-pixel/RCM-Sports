import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

// Combina las hojas de assets/style-sources.json, en su orden, en assets/ae-editorial-bundle.css.
// Ninguna hoja usa directivas de Tailwind: Tailwind solo se usaba para minificar. Si está
// instalado se sigue usando; si no, se usa el minificador conservador de abajo (sin dependencias),
// así el bundle se puede regenerar siempre y nunca hace falta editarlo a mano.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets/ae-editorial-bundle.css');
const sources = JSON.parse(fs.readFileSync(path.join(root, 'assets/style-sources.json'), 'utf8'));
const css = sources.map(file => `/* ${file} */\n${fs.readFileSync(path.join(root, file), 'utf8')}`).join('\n');

// Minificador conservador: quita comentarios y espacios solo donde no cambian el significado
// (alrededor de { } ; y saltos de línea). Respeta cadenas y url(...).
export function minifyCss(input) {
  let result = '';
  let i = 0;
  const n = input.length;
  let pendingSpace = false;
  const push = chunk => {
    if (pendingSpace) {
      const prev = result[result.length - 1];
      const next = chunk[0];
      if (prev && !'{};'.includes(prev) && !'{};'.includes(next)) result += ' ';
      pendingSpace = false;
    }
    result += chunk;
  };
  while (i < n) {
    const ch = input[i];
    if (ch === '/' && input[i + 1] === '*') {
      const end = input.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      pendingSpace = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && input[j] !== ch) j += input[j] === '\\' ? 2 : 1;
      push(input.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (/\s/.test(ch)) {
      while (i < n && /\s/.test(input[i])) i++;
      pendingSpace = true;
      continue;
    }
    if (ch === '{' || ch === '}' || ch === ';') {
      pendingSpace = false;
      result += ch;
      i++;
      continue;
    }
    push(ch);
    i++;
  }
  return result.replace(/;}/g, '}').trim() + '\n';
}

const require = createRequire(import.meta.url);
let tailwindCli = null;
try { tailwindCli = require.resolve('tailwindcss/lib/cli.js'); } catch { tailwindCli = null; }

if (tailwindCli && !process.env.AE_CSS_NO_TAILWIND) {
  fs.writeFileSync(out, css);
  const result = spawnSync(process.execPath, [tailwindCli, '-i', 'assets/ae-editorial-bundle.css', '-o', 'assets/ae-editorial-bundle.css', '--minify'], {cwd: root, stdio: 'inherit'});
  if (result.status !== 0) throw new Error('Could not minify editorial CSS');
  console.log(`Editorial CSS: ${sources.length} stylesheets combined with Tailwind minify, original order preserved.`);
} else {
  fs.writeFileSync(out, minifyCss(css));
  console.log(`Editorial CSS: ${sources.length} stylesheets combined (built-in minifier, Tailwind not required), original order preserved.`);
}
