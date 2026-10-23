/* Regression: NFL/Fútbol Noticias and Rankings edit independently in both themes. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Window } from 'happy-dom';

const source = readFileSync(new URL('../assets/ae-site-images.js', import.meta.url), 'utf8');
new vm.Script(source, { filename: 'ae-site-images.js' });

const window = new Window({ url: 'https://camsports.github.io/' });
const { document } = window;
const img = {
  nfl: ['ae-nfl-stadium-night.webp', 'ae-nfl-stadium-day.webp'],
  futbol: ['ae-champions-stadium-night.webp', 'ae-champions-stadium-day.webp']
};
const key = {
  nfl: ['nfl.noticias-noche', 'nfl.noticias-dia', 'nfl.estadio-noche', 'nfl.estadio-dia'],
  futbol: ['futbol.noticias-noche', 'futbol.noticias-dia', 'futbol.estadio-champions-noche', 'futbol.estadio-champions-dia']
};

const rules = [];
for (const sport of ['nfl', 'futbol']) {
  for (const theme of ['noche', 'dia']) {
    const index = theme === 'noche' ? 0 : 1;
    const path = 'assets/rankings/' + img[sport][index];
    const prefix = sport === 'nfl' ? 'nfl' : 'football';
    // The actual stylesheets use :has(> #aeNewsSectionTitle) on desktop
    // and #aeNewsHeadingRow on mobile, while Rankings have separate rules.
    rules.push({
      name: sport + '-news-desktop-' + theme,
      css: 'html body.ae-is-' + prefix + ' #mainContent div:has(> #aeNewsSectionTitle){background-image:linear-gradient(#000,#222),url("' + path + '")!important}'
    }, {
      name: sport + '-news-mobile-' + theme,
      css: 'html body.ae-is-' + prefix + ' #mainContent #aeNewsHeadingRow{background-image:linear-gradient(#000,#222),url("' + path + '")!important}'
    }, {
      name: sport + '-rankings-' + theme,
      css: 'html body.ae-is-' + prefix + ' #mainContent #' + (sport === 'nfl' ? 'nflRankings' : 'championsRankings') + '{background-image:linear-gradient(#000,#222),url("' + path + '")!important}'
    });
  }
}
const sheet = document.createElement('style');
sheet.textContent = rules.map(r => r.css).join('\n');
document.head.append(sheet);
assert.equal(sheet.sheet.cssRules.length, rules.length);

const rows = [];
for (const sport of ['nfl', 'futbol']) {
  for (const [i, theme] of ['noche', 'dia'].entries()) {
    rows.push({ key: key[sport][i], url: 'https://img.test/' + sport + '-news-' + theme + '.webp', focus_x: null, focus_y: null, alt: null });
    rows.push({ key: key[sport][i + 2], url: 'https://img.test/' + sport + '-ranking-' + theme + '.webp', focus_x: null, focus_y: null, alt: null });
  }
}
let databaseRows = rows;
window.db = { from(name) {
  assert.equal(name, 'ae_site_images');
  return { select: async () => ({ data: databaseRows, error: null }) };
}};
window.localStorage.setItem('cam_site_images_v1', JSON.stringify(rows));

vm.runInNewContext(source, {
  window, document, localStorage: window.localStorage, MutationObserver: window.MutationObserver,
  URL, Image: window.Image,
  getComputedStyle: window.getComputedStyle.bind(window),
  addEventListener: window.addEventListener.bind(window),
  setTimeout, clearTimeout, setInterval: () => 0
}, { filename: 'ae-site-images.js' });
await window.camSiteImages.reload();

const snapshots = () => Object.fromEntries(rules.map((rule, i) =>
  [rule.name, sheet.sheet.cssRules[i].style.getPropertyValue('background-image')]));

let images = snapshots();
for (const sport of ['nfl', 'futbol']) {
  for (const theme of ['noche', 'dia']) {
    const news = 'https://img.test/' + sport + '-news-' + theme + '.webp';
    const ranking = 'https://img.test/' + sport + '-ranking-' + theme + '.webp';
    for (const layout of ['desktop', 'mobile']) {
      const result = images[sport + '-news-' + layout + '-' + theme];
      assert.ok(result.includes(news), sport + ' news ' + layout + ' ' + theme + ': ' + result);
      assert.ok(!result.includes(ranking), 'Ranking image must not overwrite News');
    }
    const ranked = images[sport + '-rankings-' + theme];
    assert.ok(ranked.includes(ranking), sport + ' ranking ' + theme + ': ' + ranked);
    assert.ok(!ranked.includes(news), 'News image must not overwrite Ranking');
  }
}

// Restore just NFL daytime News: the other three banners and their themes persist.
databaseRows = rows.filter(row => row.key !== 'nfl.noticias-dia');
await window.camSiteImages.reload();
images = snapshots();
assert.ok(images['nfl-news-desktop-dia'].includes('ae-nfl-stadium-day.webp'));
assert.ok(images['nfl-news-mobile-dia'].includes('ae-nfl-stadium-day.webp'));
assert.ok(images['nfl-rankings-dia'].includes('nfl-ranking-dia.webp'));
assert.ok(images['nfl-news-desktop-noche'].includes('nfl-news-noche.webp'));
assert.ok(images['futbol-news-desktop-dia'].includes('futbol-news-dia.webp'));
assert.ok(images['futbol-rankings-dia'].includes('futbol-ranking-dia.webp'));

// A legacy stadium replacement should affect Rankings, not the new News slot.
databaseRows = rows.filter(row => row.key !== 'nfl.noticias-noche' && row.key !== 'nfl.noticias-dia');
await window.camSiteImages.reload();
images = snapshots();
assert.ok(images['nfl-news-desktop-noche'].includes('ae-nfl-stadium-night.webp'));
assert.ok(images['nfl-rankings-noche'].includes('nfl-ranking-noche.webp'));

// The existing editor exposes the four independent pairs and both variants.
const inventory = window.camSiteImages.inventory();
for (const sport of ['nfl', 'futbol']) {
  for (const newKey of key[sport].slice(0, 2)) {
    const entry = inventory.find(item => item.key === newKey);
    assert.ok(entry, 'missing editable image ' + newKey);
  }
}
// NFL: las dos tarjetas de opiniones usan la misma textura predeterminada,
// pero el editor guarda cuatro variantes independientes (dos tarjetas x dos temas).
for (const type of ['apoyadas', 'hateadas']) {
  for (const theme of ['noche', 'dia']) {
    assert.ok(window.camSiteImages.keys().includes('nfl.opiniones-' + type + '-' + theme),
      'missing editable NFL opinion banner ' + type + '/' + theme);
  }
}
document.body.classList.add('ae-is-nfl');
const wrap = document.createElement('section');
wrap.id = 'aeSportTakeLeaders';
wrap.className = 'ae-sport-chefs';
wrap.dataset.sport = 'nfl';
wrap.innerHTML = '<div class="ae-sport-takes-grid">' +
  '<section class="ae-sport-chef-card is-supported"></section>' +
  '<section class="ae-sport-chef-card is-questioned"></section></div>';
document.body.append(wrap);
const supported = wrap.querySelector('.is-supported');
const questioned = wrap.querySelector('.is-questioned');
databaseRows = [
  { key: 'nfl.opiniones-apoyadas-dia', url: 'https://img.test/supported-day.webp', focus_x: 25, focus_y: 75, alt: null },
  { key: 'nfl.opiniones-hateadas-dia', url: 'https://img.test/questioned-day.webp', focus_x: null, focus_y: null, alt: null },
  { key: 'nfl.opiniones-apoyadas-noche', url: 'https://img.test/supported-night.webp', focus_x: null, focus_y: null, alt: null },
  { key: 'nfl.opiniones-hateadas-noche', url: 'https://img.test/questioned-night.webp', focus_x: null, focus_y: null, alt: null }
];
await window.camSiteImages.reload();
assert.match(supported.style.backgroundImage, /supported-day.webp/);
assert.match(questioned.style.backgroundImage, /questioned-day.webp/);
assert.equal(supported.style.backgroundPosition, '25% 75%');
document.documentElement.classList.add('dark');
await window.camSiteImages.reload();
assert.match(supported.style.backgroundImage, /supported-night.webp/);
assert.match(questioned.style.backgroundImage, /questioned-night.webp/);
databaseRows = databaseRows.filter(r => r.key !== 'nfl.opiniones-hateadas-noche');
await window.camSiteImages.reload();
assert.match(supported.style.backgroundImage, /supported-night.webp/);
assert.equal(questioned.style.backgroundImage, '', 'restoring one banner must leave original CSS intact');
document.body.classList.remove('ae-is-nfl');
document.body.classList.add('ae-is-football');
await window.camSiteImages.reload();
assert.equal(supported.style.backgroundImage, '', 'football must not inherit NFL banner');
assert.equal(questioned.style.backgroundImage, '');

// Eres Chef: banner personalizado guardado desde el editor debe verse igual
// en el teléfono, también después de cambiar día/noche o restaurar uno.
const picks = document.createElement('section');
picks.id = 'footballTakes';
picks.className = 'ae-picks-editorial';
picks.innerHTML = '<section id="communityPicks"><div class="ae-picks-heading-cta-row ae-chef-marble">¿Eres Chef?</div></section>';
document.body.append(picks);
const chef = picks.querySelector('.ae-chef-marble');
databaseRows = [
  { key:'picks.marmol-dia', url:'https://img.test/eres-chef-dia.jpg', focus_x:null, focus_y:null, alt:null },
  { key:'picks.marmol-noche', url:'https://img.test/eres-chef-noche.jpg', focus_x:70, focus_y:50, alt:null }
];
document.documentElement.classList.remove('dark');
await window.camSiteImages.reload();
assert.match(chef.style.getPropertyValue('background-image'), /eres-chef-dia.jpg/,
  'Eres Chef day artwork must override stale mobile CSS');
assert.match(chef.style.getPropertyValue('--chef-invite-art'), /eres-chef-dia.jpg/,
  'the background custom property must also update');
document.documentElement.classList.add('dark');
await window.camSiteImages.reload();
assert.match(chef.style.getPropertyValue('background-image'), /eres-chef-noche.jpg/,
  'Eres Chef night artwork must load from Supabase');
assert.equal(chef.style.backgroundPosition, '70% 50%');
databaseRows = databaseRows.filter(row => row.key !== 'picks.marmol-noche');
await window.camSiteImages.reload();
assert.equal(chef.style.backgroundImage, '',
  'restoring the night banner re-enables its CSS default');
document.documentElement.classList.remove('dark');
await window.camSiteImages.reload();
assert.match(chef.style.backgroundImage, /eres-chef-dia.jpg/,
  'restoring night must leave the saved day banner intact');

window.happyDOM.abort();
console.log('CAM SPORTS: sport banners, NFL opinions and Eres Chef overrides (day/night) verified.');
