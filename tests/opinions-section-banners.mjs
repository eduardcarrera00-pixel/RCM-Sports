import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../assets/cam-opinions-section-banners.css', import.meta.url), 'utf8');
const manager = readFileSync(new URL('../assets/cam-opinions-section-banners.js', import.meta.url), 'utf8');
const opinions = readFileSync(new URL('../assets/ae-opinions.js', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../sql/cam_opinions_section_banners.sql', import.meta.url), 'utf8');

new Script(manager, { filename: 'cam-opinions-section-banners.js' });
new Script(opinions, { filename: 'ae-opinions.js' });

for (const section of ['distinguished', 'debated']) {
  assert.match(index, new RegExp('data-cam-opinions-banner="' + section + '"'),
    section + ' debe tener un encabezado de banner');
}
assert.match(opinions, /sportsHeading\.dataset\.camOpinionsBanner\s*=\s*'sports'/,
  'Opiniones por deporte debe conservar la cabecera dinámica');
assert.match(opinions, /window\.camOpinionsBanners\?\.refresh\(\)/,
  'El render dinámico debe refrescar el banner');

assert.match(index, /cam-perf-home-components\.css/, 'El banner de Opiniones se carga ahora desde el CSS optimizado');
assert.match(readFileSync(new URL('../assets/cam-perf-home-components.css', import.meta.url), 'utf8'), /cam-opinions-section-banners/, 'El pack debe conservar las reglas originales del banner');
assert.match(index, /cam-opinions-section-banners\.js/);
for (const name of ['distinguished','debated','sports']) {
  assert.match(manager, new RegExp('\\b' + name + ':'), 'Falta la sección ' + name);
}
assert.match(manager, /\['light', 'dark'\]/, 'Deben existir ambos modos');
assert.match(manager, /\.upsert\(/, 'Debe poder guardar banners persistentes');
assert.match(manager, /\.delete\(\)/, 'Debe poder eliminar cada versión');
assert.match(manager, /if \(!editor\(\)\)/, 'La interfaz debe restringirse a administradores');
assert.match(manager, /storage\.from\('article-images'\)/, 'Subida al bucket actual');
assert.match(styles, /\.cam-op-banner-active/);
assert.match(styles, /@media \(max-width: 760px\)/);
assert.match(sql, /enable row level security/);
assert.match(sql, /rcm_is_editor\(\)/);
console.log('Banners de Opiniones: archivos, secciones, versiones, controles y RLS verificados.');
