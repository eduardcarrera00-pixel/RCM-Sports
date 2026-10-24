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
  currentAdmin: true,
  addEventListener: window.addEventListener.bind(window),
  removeEventListener: window.removeEventListener.bind(window),
  innerHeight: window.innerHeight, innerWidth: window.innerWidth,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {}
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
  '<section class="ae-sport-chef-card is-supported"><header class="ae-sport-chef-heading"><h3>Opiniones apoyadas</h3></header><ol class="ae-sport-takes-list"></ol></section>' +
  '<section class="ae-sport-chef-card is-questioned"><header class="ae-sport-chef-heading"><h3>Opiniones hateadas</h3></header><ol class="ae-sport-takes-list"></ol></section></div>';
document.body.append(wrap);
const supported = wrap.querySelector('.is-supported');
const questioned = wrap.querySelector('.is-questioned');
const supportedHeading = supported.querySelector('.ae-sport-chef-heading');
const questionedHeading = questioned.querySelector('.ae-sport-chef-heading');
databaseRows = [
  { key: 'nfl.opiniones-apoyadas-dia', url: 'https://img.test/supported-day.webp', focus_x: 25, focus_y: 75, alt: null },
  { key: 'nfl.opiniones-hateadas-dia', url: 'https://img.test/questioned-day.webp', focus_x: null, focus_y: null, alt: null },
  { key: 'nfl.opiniones-apoyadas-noche', url: 'https://img.test/supported-night.webp', focus_x: null, focus_y: null, alt: null },
  { key: 'nfl.opiniones-hateadas-noche', url: 'https://img.test/questioned-night.webp', focus_x: null, focus_y: null, alt: null }
];
await window.camSiteImages.reload();
assert.match(supportedHeading.style.backgroundImage, /supported-day.webp/);
assert.match(questionedHeading.style.backgroundImage, /questioned-day.webp/);
assert.equal(supportedHeading.style.backgroundPosition, '25% 75%');
assert.equal(supported.style.backgroundImage, '', 'banner must never cover the supported Takes');
assert.equal(questioned.style.backgroundImage, '', 'banner must never cover the questioned Takes');
document.documentElement.classList.add('dark');
await window.camSiteImages.reload();
assert.match(supportedHeading.style.backgroundImage, /supported-night.webp/);
assert.match(questionedHeading.style.backgroundImage, /questioned-night.webp/);
assert.equal(supported.style.backgroundImage, '');
assert.equal(questioned.style.backgroundImage, '');
databaseRows = databaseRows.filter(r => r.key !== 'nfl.opiniones-hateadas-noche');
await window.camSiteImages.reload();
assert.match(supportedHeading.style.backgroundImage, /supported-night.webp/);
assert.equal(questionedHeading.style.backgroundImage, '', 'restoring one header banner must leave original CSS intact');
document.body.classList.remove('ae-is-nfl');
document.body.classList.add('ae-is-football');
await window.camSiteImages.reload();
assert.equal(supportedHeading.style.backgroundImage, '', 'football must not inherit NFL banner');
assert.equal(questionedHeading.style.backgroundImage, '');
assert.equal(supported.style.backgroundImage, '');
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

// Las tarjetas de Savant/Rookie, Respira/Vende Humos y Opiniones Fútbol
// pintan un fondo en el encabezado desde variables CSS de la tarjeta.
const cards = document.createElement('div');
cards.innerHTML = '<section id="aeNflTwinRankings">' +
  '<article class="is-savant"><header class="ae-nfl-ranking-header"></header></article>' +
  '<article class="is-rookie"><header class="ae-nfl-ranking-header"></header></article>' +
  '</section>';
document.body.append(cards);
const savantCard = cards.querySelector('.is-savant');
const rookieCard = cards.querySelector('.is-rookie');
document.body.classList.remove('ae-is-football');
document.body.classList.add('ae-is-nfl');
databaseRows = [
  {key:'nfl.savant-dia',url:'https://img.test/nfl-savant-new.jpg',focus_x:50,focus_y:32,alt:null},
  {key:'nfl.rookie-dia',url:'https://img.test/nfl-rookie-new.jpg',focus_x:50,focus_y:26,alt:null}
];
await window.camSiteImages.reload();
assert.match(savantCard.style.getPropertyValue('--ae-community-portrait'), /nfl-savant-new.jpg/);
assert.match(rookieCard.style.getPropertyValue('--ae-community-portrait'), /nfl-rookie-new.jpg/);
assert.equal(savantCard.querySelector('header').style.backgroundPosition, '50% 50%, 50% 32%');
document.body.classList.remove('ae-is-nfl');
document.body.classList.add('ae-is-football');
wrap.dataset.sport = 'football';
supported.innerHTML = '<header class="ae-sport-chef-heading"></header>';
questioned.innerHTML = '<header class="ae-sport-chef-heading"></header>';
databaseRows = [
  {key:'futbol.respira-dia',url:'https://img.test/respira-new.jpg',focus_x:50,focus_y:29,alt:null},
  {key:'futbol.vende-humos-dia',url:'https://img.test/humos-new.jpg',focus_x:67,focus_y:39,alt:null},
  {key:'futbol.populares-dia',url:'https://img.test/football-popular-new.jpg',focus_x:50,focus_y:72,alt:null},
  {key:'futbol.impopulares-dia',url:'https://img.test/football-unpopular-new.jpg',focus_x:50,focus_y:72,alt:null}
];
await window.camSiteImages.reload();
assert.match(savantCard.style.getPropertyValue('--ae-community-portrait'), /respira-new.jpg/,
  'football must replace the NFL image on the same mobile card');
assert.match(rookieCard.style.getPropertyValue('--ae-community-portrait'), /humos-new.jpg/);
assert.match(supported.style.getPropertyValue('--ae-opinion-art'), /football-popular-new.jpg/);
assert.match(questioned.style.getPropertyValue('--ae-opinion-art'), /football-unpopular-new.jpg/);
assert.equal(questioned.querySelector('header').style.backgroundPosition, '50% 50%, 50% 72%');
databaseRows = databaseRows.filter(r=>r.key !== 'futbol.impopulares-dia');
await window.camSiteImages.reload();
assert.equal(questioned.style.getPropertyValue('--ae-opinion-art'), '',
  'restoring an opinion must return it to the original stylesheet');
assert.match(supported.style.getPropertyValue('--ae-opinion-art'), /football-popular-new.jpg/);
document.body.classList.remove('ae-is-football');
await window.camSiteImages.reload();
assert.equal(savantCard.style.getPropertyValue('--ae-community-portrait'), '',
  'navigating away should remove the old sports background');

// Mejores y Peores Platos: las dos cabeceras conservan sus claves propias,
// incluso cuando una de ellas solo tiene gradiente CSS y no URL original.
const plateRail = document.createElement('aside');
plateRail.className = 'ae-picks-rail';
plateRail.innerHTML =
  '<section class="ae-chef-board ae-chef-best"><div class="ae-picks-rail-heading">Mejores platos</div></section>' +
  '<section class="ae-chef-board ae-chef-worst"><div class="ae-picks-rail-heading">Peores platos</div></section>';
picks.querySelector('#communityPicks').append(plateRail);
const bestPlate = plateRail.querySelector('.ae-chef-best .ae-picks-rail-heading');
const worstPlate = plateRail.querySelector('.ae-chef-worst .ae-picks-rail-heading');
for (const variant of ['dia', 'noche']) {
  for (const type of ['mejores', 'peores']) {
    const plateKey = 'picks.platos-' + type + '-banner-' + variant;
    assert.ok(window.camSiteImages.keys().includes(plateKey), 'missing editable banner ' + plateKey);
  }
}
databaseRows = [
  {key:'picks.platos-mejores-banner-dia',url:'https://img.test/plates-best-day.jpg',focus_x:20,focus_y:35,alt:null},
  {key:'picks.platos-peores-banner-dia',url:'https://img.test/plates-worst-day.jpg',focus_x:65,focus_y:70,alt:null},
  {key:'picks.platos-mejores-banner-noche',url:'https://img.test/plates-best-night.jpg',focus_x:null,focus_y:null,alt:null},
  {key:'picks.platos-peores-banner-noche',url:'https://img.test/plates-worst-night.jpg',focus_x:null,focus_y:null,alt:null},
  {key:'picks.chefs-mejores-dia',url:'https://img.test/chefs-best-day.jpg',focus_x:null,focus_y:null,alt:null}
];
document.documentElement.classList.remove('dark');
await window.camSiteImages.reload();
assert.match(bestPlate.style.backgroundImage, /plates-best-day.jpg/);
assert.match(worstPlate.style.backgroundImage, /plates-worst-day.jpg/);
assert.equal(bestPlate.style.backgroundPosition, '20% 35%');
assert.equal(worstPlate.style.backgroundPosition, '65% 70%');
document.documentElement.classList.add('dark');
await window.camSiteImages.reload();
assert.match(bestPlate.style.backgroundImage, /plates-best-night.jpg/);
assert.match(worstPlate.style.backgroundImage, /plates-worst-night.jpg/);
databaseRows = databaseRows.filter(r => r.key !== 'picks.platos-peores-banner-noche');
await window.camSiteImages.reload();
assert.match(bestPlate.style.backgroundImage, /plates-best-night.jpg/,
  'restoring worst night must not erase best night');
assert.equal(worstPlate.style.backgroundImage, '',
  'restoring worst night must reveal original CSS gradient');
assert.ok(window.camSiteImages._state().rows.includes('picks.chefs-mejores-dia'),
  'the unrelated Chefs personalizations remain intact');
document.documentElement.classList.remove('dark');
await window.camSiteImages.reload();
assert.match(bestPlate.style.backgroundImage, /plates-best-day.jpg/);
assert.match(worstPlate.style.backgroundImage, /plates-worst-day.jpg/);
databaseRows = [];
await window.camSiteImages.reload();
assert.equal(bestPlate.style.backgroundImage, '', 'best restores original atlas CSS');
assert.equal(worstPlate.style.backgroundImage, '', 'worst restores original gradient CSS');

// Opiniones populares/impopulares Fútbol: modo día no puede depender de
// detectar una URL CSS. Ambos lápices aparecen en el editor global y cambian
// de clave al alternar día/noche, sin duplicados y sin acceso público.
const rect = { top:100, left:100, right:340, bottom:230, width:240, height:130 };
for (const card of [supported, questioned]) {
  card.getClientRects = () => [rect];
  card.getBoundingClientRect = () => rect;
}
wrap.dataset.sport = 'football';
document.body.classList.add('ae-is-football');
document.documentElement.classList.remove('dark');
databaseRows = [
  {key:'futbol.populares-dia',url:'https://img.test/popular-day.webp',focus_x:25,focus_y:60,alt:null},
  {key:'futbol.impopulares-dia',url:'https://img.test/unpopular-day.webp',focus_x:70,focus_y:40,alt:null},
  {key:'futbol.populares-noche',url:'https://img.test/popular-night.webp',focus_x:55,focus_y:60,alt:null},
  {key:'futbol.impopulares-noche',url:'https://img.test/unpopular-night.webp',focus_x:40,focus_y:40,alt:null}
];
window.camGlobalEditMode = { isActive:() => true };
await window.camSiteImages.reload();
window.camSiteImages.refresh();
const pencils = () => window.camSiteImages._state().pencils;
assert.equal(pencils().filter(k => k === 'futbol.populares-dia').length, 1,
  'day mode should provide exactly one pencil for popular opinions');
assert.equal(pencils().filter(k => k === 'futbol.impopulares-dia').length, 1,
  'day mode should provide exactly one pencil for unpopular opinions');
assert.match(supported.style.getPropertyValue('--ae-opinion-art'), /popular-day.webp/);
assert.match(questioned.style.getPropertyValue('--ae-opinion-art'), /unpopular-day.webp/);
document.documentElement.classList.add('dark');
await window.camSiteImages.reload();
await new Promise(resolve => setTimeout(resolve, 450));
assert.equal(pencils().filter(k => k === 'futbol.populares-noche').length, 1,
  'night mode should keep exactly one pencil for popular opinions');
assert.equal(pencils().filter(k => k === 'futbol.impopulares-noche').length, 1,
  'night mode should keep exactly one pencil for unpopular opinions');
assert.ok(!pencils().includes('futbol.populares-dia'),
  'day pencil must be removed on switching to night');
assert.match(supported.style.getPropertyValue('--ae-opinion-art'), /popular-night.webp/);
assert.match(questioned.style.getPropertyValue('--ae-opinion-art'), /unpopular-night.webp/);
document.documentElement.classList.remove('dark');
await window.camSiteImages.reload();
await new Promise(resolve => setTimeout(resolve, 450));
assert.equal(pencils().filter(k => k === 'futbol.populares-dia').length, 1);
assert.equal(pencils().filter(k => k === 'futbol.impopulares-dia').length, 1);
window.camGlobalEditMode = { isActive:() => false };
window.camSiteImages.refresh();
assert.equal(pencils().length, 0, 'no pencils outside admin edit mode');

// Picks: both custom chef-header images shrink by 30% without changing the
// section layout. Their theme-specific image swaps keep the art right/centered.
const chefStyle = document.createElement('style');
chefStyle.textContent = `
  #testChefBest { background-image:linear-gradient(#102938,#102938),url("assets/ae-chefs-best-header-atlas.webp");
    background-size:100% 100%,auto 200%;background-position:center,right top; }
  #testChefWorst { background-image:linear-gradient(#102938,#102938),url("assets/ae-chefs-worst-header-atlas.webp");
    background-size:100% 100%,auto 200%;background-position:center,right top; }
`;
document.head.append(chefStyle);
const chefFixture = document.createElement('div');
chefFixture.innerHTML = '<header id="testChefBest" class="ae-chefs-art-heading"><h3>Mejores Chefs</h3></header>' +
  '<header id="testChefWorst" class="ae-chefs-art-heading"><h3>Peores Chefs</h3></header>';
document.body.append(chefFixture);
for (const theme of ['dia', 'noche']) {
  databaseRows = ['mejores', 'peores'].map(type => ({
    key: 'picks.chefs-' + type + '-' + theme,
    url: 'https://img.test/chefs-' + type + '-' + theme + '.webp',
    focus_x: null, focus_y: null, alt: null
  }));
  document.documentElement.classList.toggle('dark', theme === 'noche');
  await window.camSiteImages.reload();
  for (const [type, id] of [['mejores', 'testChefBest'], ['peores', 'testChefWorst']]) {
    const header = document.getElementById(id);
    assert.match(header.style.backgroundImage, new RegExp('chefs-' + type + '-' + theme + '.webp'));
    assert.match(header.style.backgroundSize, /auto 70%/, type + ' ' + theme + ': art should be 30% smaller');
    assert.match(header.style.backgroundPosition, /right center/, type + ' ' + theme + ': art stays centered at right');
    assert.equal(header.style.height, '', 'header height remains controlled by existing CSS');
  }
}
databaseRows = [];
await window.camSiteImages.reload();
for (const id of ['testChefBest', 'testChefWorst']) {
  assert.equal(document.getElementById(id).style.backgroundSize, '',
    'restoring original chef art must also restore the atlas crop');
}
chefFixture.remove();
chefStyle.remove();

window.happyDOM.abort();
console.log('CAM SPORTS: saved NFL and football banner overrides, separate news, NFL opinions, Eres Chef and Chefs sizing verified.');


/* Fútbol: cuatro banners independientes en el editor y limitados al encabezado. */
const opinionHeaderCss = readFileSync(new URL('../assets/cam-nfl-opinions-header-only.css', import.meta.url), 'utf8');
assert.match(opinionHeaderCss, /body\.ae-is-football/);
assert.match(opinionHeaderCss, /background-image:none!important/);
assert.match(opinionHeaderCss, /\.ae-sport-chef-heading/);
assert.match(opinionHeaderCss, /color:#FFFFFF!important/);
for (const kind of ['populares','impopulares'])
 for (const mode of ['dia','noche'])
  assert.ok(window.camSiteImages.keys().includes('futbol.' + kind + '-' + mode),
    'Falta banner editable Fútbol ' + kind + '/' + mode);
for (const kind of ['popular','unpopular'])
 for (const mode of ['day','night']) {
  const asset = 'cam-football-opinion-' + kind + '-' + mode + '.svg';
  assert.match(readFileSync(new URL('../assets/' + asset, import.meta.url),'utf8'), /<svg /);
  assert.ok(opinionHeaderCss.includes(asset), 'Falta recurso de ' + kind + '/' + mode);
 }
