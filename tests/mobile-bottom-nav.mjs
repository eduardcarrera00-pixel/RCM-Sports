/* Regression: the real header buttons become the phone dock Inicio · NFL · Fútbol · Picks · Perfil,
   never clones; Opiniones moves to the header actions and everything returns on desktop. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { Window } from 'happy-dom';

const root = resolve(import.meta.dirname, '..');
const js = readFileSync(resolve(root, 'assets/cam-mobile-bottom-nav.js'), 'utf8');
const css = readFileSync(resolve(root, 'assets/cam-mobile-bottom-nav.css'), 'utf8');
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const visibility = readFileSync(resolve(root, 'assets/ae-category-visibility.js'), 'utf8');

assert.match(index, /cam-mobile-bottom-nav\.js/);
assert.match(index, /cam-mobile-bottom-nav\.css/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /position: fixed !important/);
assert.match(css, /env\(safe-area-inset-bottom/);
assert.match(css, /display: flex !important/);
assert.match(css, /bottom: 0 !important/);
assert.match(css, /width: 100% !important/);
const headerCSS = readFileSync(resolve(root, 'assets/cam-header-system.css'), 'utf8');
assert.doesNotMatch(headerCSS, /border-radius: 50% !important/);
assert.match(readFileSync(new URL('../assets/cam-rounded-editorial.css', import.meta.url), 'utf8'), /@layer cam-rounded-editorial[\s\S]*\.ae-nav-icon[\s\S]*border-radius:50%!important/);
assert.match(css, /content: none !important/);
assert.match(headerCSS, /color: #d9ab70 !important/);
assert.match(headerCSS, /color: #886237 !important/);
assert.match(index, /viewport-fit=cover/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /svg\.cam-mobile-nav-symbol/);
assert.match(css, /calc\(6px \+ env\(safe-area-inset-bottom/);
assert.match(css, /#camNavProfile/);
assert.match(css, /nav#camSectionTabs/);
assert.match(index, /cam-mobile-sections\.js/);
assert.match(css, /img\.ae-custom-sport-icon\s*\{\s*display: none !important/);
assert.doesNotMatch(css, /@media\s*\(min-width:/);
assert.match(visibility, /querySelector\('nav\.ae-sport-nav'\)/);
assert.match(headerCSS, /html:not\(\.dark\) body > header nav\.ae-sport-nav[\s\S]*?drop-shadow\(/);
assert.match(headerCSS, /body > nav\.cam-mobile-bottom-nav \.category-btn svg\.cam-mobile-nav-symbol/);
assert.doesNotMatch(index, /<span class="ae-mobile-theme-caption"[^>]*>Modo<\/span>/);
assert.match(index, /id="themeToggle"[\s\S]*?aria-label="Activar modo oscuro"/);


const window = new Window({ url: 'https://camsports.github.io/' });
const { document } = window;
const primary = ['Picks', 'NFL', 'Fútbol', 'Opiniones'];
const dock = ['Todos', 'NFL', 'Fútbol', 'Picks', 'Opiniones'];
const sourceNav = index.match(/<nav class="ae-sport-nav"[^>]*>[\s\S]*?<\/nav>/)[0];
document.body.innerHTML = `
  <header>
    <div class="ae-mobile-header-grid">
      <a class="cam-brand" href="#">CAM SPORTS</a>
      ${sourceNav}
      <div class="ae-header-actions"><button id="themeToggle" aria-label="Cambiar tema">☾</button><button id="camGlobalEditToggle">Editar</button><button id="login">Iniciar sesión</button></div>
    </div>
  </header>
  <footer><a id="moreSports" href="#">NBA</a></footer>
  <input id="composerInput">
  <div id="publishModal" class="hidden"></div>
`;
const nav = document.querySelector('header nav.ae-sport-nav');
const allButtons = Array.from(nav.querySelectorAll('.category-btn'));
const originalButtons = new Map(allButtons.map(button => [button.dataset.category, button]));
const referenceIcons = new Map(primary.map(key => [key, originalButtons.get(key).querySelector('svg.cam-category-nav-symbol')]));
for (const [key, icon] of referenceIcons) assert.ok(icon, key + ': reference vector exists in initial HTML');
const mobileListeners = [];
let isPhone = true;
const media = {
  get matches() { return isPhone; },
  addEventListener(type, listener) { if (type === 'change') mobileListeners.push(listener); },
};
window.matchMedia = () => media;
vm.runInNewContext(js, {
  document, window, Element: window.Element, MutationObserver: window.MutationObserver,
  Promise, setTimeout,
}, { filename: 'cam-mobile-bottom-nav.js' });

assert.equal(nav.parentElement, document.body, 'phone: move original nav outside sticky/backdrop header');
assert.equal(nav.classList.contains('cam-mobile-bottom-nav'), true);
const profile = document.getElementById('camNavProfile');
assert.ok(profile, 'phone: Perfil tab exists');
assert.equal(profile.parentElement, document.querySelector('header .ae-header-actions'));
assert.equal(nav.querySelectorAll('.category-btn').length, 9, 'eight real buttons plus Perfil');
assert.equal(document.querySelectorAll('.category-btn').length, 10, 'do not duplicate controls');
assert.equal(document.querySelectorAll('.category-btn[data-category]').length, 9, 'category buttons are never cloned');
for (const [key, button] of originalButtons) {
  if (key === 'Opiniones') continue;
  assert.equal(nav.querySelector('[data-category="' + key + '"]'), button);
}
// Dock order: Inicio · NFL · Fútbol · Picks · Perfil (Perfil always last of the visible tabs).
const visibleDock = Array.from(nav.children).filter(button => dock.includes(button.dataset.category));
assert.deepEqual(visibleDock.map(button => button.dataset.category || button.id), dock);
assert.equal(nav.children[dock.length-1], originalButtons.get('Opiniones'), 'Opiniones follows Picks');
const home = originalButtons.get('Todos');
assert.equal(home.hidden, false, 'phone: Inicio is visible');
assert.ok(home.querySelector('svg.cam-mobile-nav-symbol'), 'phone: Inicio has its icon');
assert.equal(home.textContent.trim(), 'Inicio');
assert.equal(home.getAttribute('aria-label'), 'Inicio');
assert.ok(profile.querySelector('svg.cam-mobile-nav-symbol'), 'Perfil has its icon');
assert.equal(profile.textContent.trim(), 'Perfil');
assert.match(profile.getAttribute('aria-label'), /perfil/i);
const opinions = originalButtons.get('Opiniones');
assert.equal(opinions.parentElement, nav, 'phone: Opiniones lives in the dock');
assert.equal(profile.parentElement.firstElementChild, profile);
for (const category of primary) {
  const button = originalButtons.get(category);
  const icon = button.querySelector('svg.cam-mobile-nav-symbol');
  assert.ok(icon, category + ': phone-only SVG is mounted');
  const paintedBox = icon.getAttribute('viewBox').split(/\s+/).map(Number);
  assert.equal(paintedBox.length, 4, category + ': a valid painted viewBox');
  assert.ok(paintedBox.every(Number.isFinite));
  assert.ok(paintedBox[2] > 0 && paintedBox[2] <= 24);
  assert.equal(paintedBox[2], paintedBox[3], category + ': square crop preserves proportions');
  assert.equal(icon.getAttribute('stroke'), 'currentColor');
  assert.ok(icon.children.length >= 2, category + ': visible details must remain');
  assert.equal(button.querySelectorAll('img.ae-custom-sport-icon').length, 0, 'every primary category uses exactly one inline SVG');
  if (referenceIcons.has(category)) assert.equal(icon, referenceIcons.get(category), 'phone reuses the initial reference vector');
}
assert.ok(document.getElementById('themeToggle')?.closest('header'));
assert.ok(document.getElementById('camGlobalEditToggle')?.closest('header'));
assert.ok(document.getElementById('login')?.closest('header'));
assert.ok(document.querySelector('header .cam-brand'), 'Home logo stays in header');
assert.ok(document.getElementById('moreSports'), 'secondary sport navigation stays available');

// Simulate the unchanged filterByCategory() updating its original .active class.
allButtons.forEach(button => button.classList.remove('active'));
originalButtons.get('NFL').classList.add('active');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(originalButtons.get('NFL').getAttribute('aria-current'), 'page');
assert.equal(originalButtons.get('NFL').getAttribute('aria-pressed'), 'true');
assert.equal(originalButtons.get('NFL').getAttribute('aria-label'), 'NFL');
assert.equal(originalButtons.get('Opiniones').getAttribute('aria-label'), 'Opiniones');
assert.equal(originalButtons.get('Picks').getAttribute('aria-pressed'), 'false');
originalButtons.get('Fútbol').classList.add('active');
originalButtons.get('NFL').classList.remove('active');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(originalButtons.get('Fútbol').getAttribute('aria-current'), 'page');
assert.equal(originalButtons.get('NFL').hasAttribute('aria-current'), false);
// Home (the Todos filter) selects Inicio only.
allButtons.forEach(button => button.classList.remove('active'));
originalButtons.get('Todos').classList.add('active');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(originalButtons.get('Todos').getAttribute('aria-current'), 'page');
assert.equal(dock.filter(key => key !== 'Todos').every(key => originalButtons.get(key).getAttribute('aria-pressed') === 'false'), true);
// Opiniones (header) is still marked as the current page when open.
allButtons.forEach(button => button.classList.remove('active'));
opinions.classList.add('active');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(opinions.getAttribute('aria-current'), 'page');
assert.equal(dock.filter(key=>key!=='Opiniones').every(key => !originalButtons.get(key).hasAttribute('aria-current')), true);
// Perfil opens the profile (or sign-in when the profile module is missing).
const opened = [];
window.openAeProfile = () => opened.push('perfil');
profile.click();
assert.deepEqual(opened, ['perfil']);
delete window.openAeProfile;
window.openUserAuthModal = () => opened.push('login');
profile.click();
assert.deepEqual(opened, ['perfil', 'login']);

// A mobile keyboard/editor should hide the dock until input focus ends.
const input = document.getElementById('composerInput');
input.focus();
document.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
// Dispatch from the input in environments that do not forward focusin automatically.
input.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
assert.ok(document.body.classList.contains('cam-mobile-input-focus'));
input.blur();
await new Promise(resolve => setTimeout(resolve, 1));
assert.equal(document.body.classList.contains('cam-mobile-input-focus'), false);

// Desktop/tablet restoration must reuse identical DOM positions and handlers.
isPhone = false;
mobileListeners.forEach(listener => listener({ matches: false }));
assert.equal(nav.parentElement, document.querySelector('header .ae-mobile-header-grid'));
for (const category of primary) {
  assert.equal(originalButtons.get(category).querySelectorAll('img.ae-custom-sport-icon').length, 0);
  if (referenceIcons.has(category)) assert.equal(originalButtons.get(category).querySelector('svg.cam-category-nav-symbol'), referenceIcons.get(category), 'desktop restoration preserves the same artwork');
  assert.equal(originalButtons.get(category).querySelectorAll('svg.cam-mobile-nav-symbol').length, 1);
}
assert.equal(nav.classList.contains('cam-mobile-bottom-nav'), false);
assert.equal(document.getElementById('camNavProfile'), null, 'desktop: no Perfil tab');
assert.equal(opinions.parentElement, nav, 'desktop: Opiniones returns to the nav');
assert.deepEqual(Array.from(nav.children), allButtons, 'desktop: original order restored');
assert.equal(home.hidden, true, 'desktop: Inicio hidden again (the logo goes home)');
assert.equal(home.textContent.trim(), 'Todos');
assert.equal(nav.getAttribute('aria-label'), 'Explorar deportes');
assert.equal(originalButtons.get('NFL').hasAttribute('aria-label'), false);
assert.equal(nav.classList.contains('cam-nav-has-active'), false);
assert.equal(allButtons.every(button => originalButtons.get(button.dataset.category) === button), true);

// Orientation/resize back to phone cannot duplicate buttons.
isPhone = true;
mobileListeners.forEach(listener => listener({ matches: true }));
assert.equal(nav.parentElement, document.body);
assert.equal(document.querySelectorAll('.category-btn').length, 10);
assert.equal(document.querySelectorAll('#camNavProfile').length, 1);

window.happyDOM.abort();
console.log('CAM SPORTS mobile bottom navigation: checks passed');
