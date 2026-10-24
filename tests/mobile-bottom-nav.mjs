/* Regression: the four existing sport buttons become the phone dock, never clones. */
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
assert.match(css, /border-radius: 50% !important/);
assert.match(readFileSync(new URL('../assets/cam-rounded-editorial.css', import.meta.url), 'utf8'), /@layer cam-rounded-editorial[\s\S]*\.ae-nav-icon[\s\S]*border-radius:50%!important/);
assert.match(css, /content: none !important/);
assert.match(css, /color: #d9ab70 !important/);
assert.match(css, /color: #886237 !important/);
assert.match(index, /viewport-fit=cover/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /svg\.cam-mobile-nav-symbol/);
assert.match(css, /calc\(7px \+ env\(safe-area-inset-bottom/);
assert.match(css, /img\.ae-custom-sport-icon\s*\{\s*display: block !important/);
assert.doesNotMatch(js, /mountMobileVectorIcons/);
assert.doesNotMatch(css, /@media\s*\(min-width:/);
assert.match(visibility, /querySelector\('nav\.ae-sport-nav'\)/);


// The icon files in desktop and phone are the exact same artwork, rather than similar drawings.
for (const [category, filename] of Object.entries({
  Picks: 'picks', NFL: 'nfl', 'Fútbol': 'futbol', Opiniones: 'takes'
})) {
  assert.match(index, new RegExp('assets/icons/cam-brand-' + filename + '\\.svg'));
  const iconSource = readFileSync(resolve(root, 'assets/icons/cam-brand-' + filename + '.svg'), 'utf8');
  assert.match(iconSource, /viewBox=/);
  assert.match(iconSource, /#F3EBDD/);
}
const brandStyles = readFileSync(resolve(root, 'assets/cam-brand-navigation-icons.css'), 'utf8');
assert.match(index, /cam-brand-navigation-icons\.css/);
assert.match(brandStyles, /cam-brand-login\.svg/);
assert.match(index, /cam-brand-sol\.svg/);

const window = new Window({ url: 'https://camsports.github.io/' });
const { document } = window;
const primary = ['Picks', 'NFL', 'Fútbol', 'Opiniones'];
const optional = ['Fútbol Americano Colegial', 'NBA', 'Tenis', 'Ciclismo'];
const categories = ['Todos', ...primary, ...optional];
document.body.innerHTML = `
  <header>
    <div class="ae-mobile-header-grid">
      <a class="cam-brand" href="#">CAM SPORTS</a>
      <nav class="ae-sport-nav" aria-label="Explorar deportes">
        ${categories.map(category => `<button class="category-btn ${category === 'Todos' ? 'active' : ''}" data-category="${category}">${primary.includes(category) ? '<span class="ae-nav-icon"><img class="ae-custom-sport-icon" src="existing.webp" alt=""></span>' : ''}<span>${category}</span></button>`).join('')}
      </nav>
      <div class="ae-header-actions"><button id="themeToggle">Modo</button><button id="camGlobalEditToggle">Editar</button><button id="login">Iniciar sesión</button></div>
    </div>
  </header>
  <footer><a id="moreSports" href="#">NBA</a></footer>
  <input id="composerInput">
  <div id="publishModal" class="hidden"></div>
`;
const nav = document.querySelector('header nav.ae-sport-nav');
const allButtons = Array.from(nav.querySelectorAll('.category-btn'));
const originalButtons = new Map(allButtons.map(button => [button.dataset.category, button]));
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
assert.equal(nav.querySelectorAll('.category-btn').length, 9, 'existing optional buttons remain in DOM');
assert.equal(document.querySelectorAll('.category-btn').length, 9, 'do not duplicate controls');
for (const [key, button] of originalButtons) assert.equal(nav.querySelector('[data-category="' + key + '"]'), button);
for (const category of primary) {
  const button = originalButtons.get(category);
  assert.equal(button.querySelectorAll('img.ae-custom-sport-icon').length, 1, category + ': canonical icon reused');
  assert.equal(button.querySelectorAll('svg.cam-mobile-nav-symbol').length, 0, 'no duplicated phone-only symbol');
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
assert.equal(nav.classList.contains('cam-nav-has-active'), true);
assert.equal(originalButtons.get('Picks').getAttribute('aria-pressed'), 'false');
originalButtons.get('Fútbol').classList.add('active');
originalButtons.get('NFL').classList.remove('active');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(originalButtons.get('Fútbol').getAttribute('aria-current'), 'page');
assert.equal(originalButtons.get('NFL').hasAttribute('aria-current'), false);
// Home uses the hidden Todos filter: there must be no stale capsule.
allButtons.forEach(button => button.classList.remove('active'));
originalButtons.get('Todos').classList.add('active');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(nav.classList.contains('cam-nav-has-active'), false);
assert.equal(primary.every(key => originalButtons.get(key).getAttribute('aria-pressed') === 'false'), true);

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
  assert.equal(originalButtons.get(category).querySelectorAll('img.ae-custom-sport-icon').length, 1);
  assert.equal(originalButtons.get(category).querySelectorAll('svg.cam-mobile-nav-symbol').length, 0);
}
assert.equal(nav.classList.contains('cam-mobile-bottom-nav'), false);
assert.equal(nav.getAttribute('aria-label'), 'Explorar deportes');
assert.equal(originalButtons.get('NFL').hasAttribute('aria-label'), false);
assert.equal(nav.classList.contains('cam-nav-has-active'), false);
assert.equal(allButtons.every(button => originalButtons.get(button.dataset.category) === button), true);

// Orientation/resize back to phone cannot duplicate buttons.
isPhone = true;
mobileListeners.forEach(listener => listener({ matches: true }));
assert.equal(nav.parentElement, document.body);
assert.equal(document.querySelectorAll('.category-btn').length, 9);

window.happyDOM.abort();
console.log('CAM SPORTS mobile bottom navigation: checks passed');
