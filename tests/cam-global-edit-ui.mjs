/* CAM SPORTS · Global editing behavior and regressions, no browser/network required.
 * Run: node tests/cam-global-edit-ui.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const source = read('assets/cam-global-edit.js');
const html = read('index.html');
const css = read('assets/cam-global-edit.css');
const siteImages = read('assets/ae-site-images.js');

function harness() {
  const documentEvents = new Map(), windowEvents = new Map();
  const buttonEvents = new Map(), attrs = new Map(), classes = new Set();
  const rootClasses = new Set();
  const button = {
    hidden: true, disabled: false, title: '',
    classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
    setAttribute: (name, value) => attrs.set(name, value),
    addEventListener: (event, fn) => buttonEvents.set(event, fn)
  };
  let activeUserId = null, roleGranted = false, authEvent = null, refreshes = 0;
  const db = {
    auth: {
      getUser: async () => ({data:{user:activeUserId ? {id: activeUserId} : null}, error:null}),
      onAuthStateChange: fn => {authEvent = fn}
    },
    from: table => {
      assert.equal(table, 'editors');
      return {select: () => ({eq: (_column, requested) => ({
        maybeSingle: async () => ({
          data: roleGranted && requested === activeUserId ? {user_id: requested} : null,
          error: null
        })
      })})};
    }
  };
  const window = {
    camSiteImages: {refresh: () => {refreshes++}},
    addEventListener: (event, fn) => windowEvents.set(event, fn)
  };
  const document = {
    readyState: 'complete', hidden: false,
    getElementById: id => id === 'camGlobalEditToggle' ? button : null,
    documentElement: {classList: {
      toggle: (name, enabled) => enabled ? rootClasses.add(name) : rootClasses.delete(name)
    }},
    addEventListener: (event, fn) => documentEvents.set(event, fn)
  };
  const context = {window, document, db, currentAdmin: null};
  vm.runInNewContext(source, context, {filename:'cam-global-edit.js'});
  return {
    mode:window.camGlobalEditMode,button,attrs,classes,rootClasses,
    windowEvents,documentEvents,buttonEvents,context,
    setAuth:(id,role) => {activeUserId=id;roleGranted=role},
    authEvent:(name,user) => authEvent?.(name,user ? {user:{id:user}} : null),
    refreshes:() => refreshes
  };
}

const run = async () => {
  const t=harness(), {mode,button,attrs,rootClasses,buttonEvents,context}=t;
  const pressed = () => attrs.get('aria-pressed');
  const enabled = () => rootClasses.has('cam-global-edit-active');

  assert.equal(mode.isActive(), false, 'the new session starts disabled');
  assert.equal(button.hidden, true, 'the main pencil is hidden for visitors');
  assert.equal(enabled(), false);

  context.currentAdmin={id:'editor'};t.setAuth('editor',true);mode.sync();
  assert.equal(button.hidden,false);
  await buttonEvents.get('click')();
  assert.equal(mode.isActive(),true,'verified editor can enter edit mode');
  assert.equal(pressed(),'true');
  assert.equal(enabled(),true);
  mode.sync(); // Same state after navigating inside the SPA.
  assert.equal(mode.isActive(),true);
  await t.windowEvents.get('focus')(); // Permission refresh.
  assert.equal(mode.isActive(),true);

  await buttonEvents.get('click')();
  assert.equal(mode.isActive(),false,'second click disables edit mode');
  assert.equal(enabled(),false);
  assert.equal(pressed(),'false');

  await buttonEvents.get('click')();
  t.authEvent('SIGNED_IN','editor'); // Same editor and same session.
  assert.equal(mode.isActive(),true);
  t.setAuth('editor',false);
  await t.windowEvents.get('focus')();
  assert.equal(mode.isActive(),false,'role revocation disables the mode');

  context.currentAdmin=null;t.authEvent('SIGNED_OUT');mode.sync();
  assert.equal(button.hidden,true);
  assert.equal(mode.isActive(),false);

  context.currentAdmin={id:'ordinary-user'};t.setAuth('ordinary-user',false);mode.sync();
  await buttonEvents.get('click')();
  assert.equal(mode.isActive(),false,'a noneditor cannot activate it through JS');
  context.currentAdmin={id:'forged-admin'};t.setAuth('ordinary-user',true);
  await mode.toggle();
  assert.equal(mode.isActive(),false,'forged local currentAdmin cannot activate');

  const newTab=harness();
  newTab.context.currentAdmin={id:'editor'};newTab.setAuth('editor',true);newTab.mode.sync();
  assert.equal(newTab.mode.isActive(),false,'a new page load resets the mode');

  assert.ok(t.refreshes()>=6,'site-image overlay gets refreshed upon toggles');
  assert.match(siteImages,/function refresh\(\) \{ if \(editModeOn\(\)\) enableAdmin\(\); else disableAdmin\(\); \}/);
  assert.match(siteImages,/async function openEditor\(key, el\) \{\s*if \(!editModeOn\(\)\) return;/);
  assert.match(siteImages,/sb\.rpc\('ae_set_site_image'/);
  assert.match(siteImages,/sb\.rpc\('ae_reset_site_image'/);
  assert.match(html,/id="camGlobalEditToggle"/);
  assert.doesNotMatch(html,/id="aeCategoryAdmin"/);
  assert.match(html,/filterByCategory\('NFL'\)/);
  assert.match(html,/filterByCategory\('Fútbol'\)/);
  assert.match(html,/assets\/cam-global-edit\.js/);
  assert.match(html,/assets\/cam-global-edit\.css/);
  assert.match(css,/camGlobalEditToggle\[hidden\]/);
  assert.match(css,/html:not\(\.cam-global-edit-active\) cam-site-image-layer/);
  assert.match(css,/@media\(max-width:979px\)/);
  assert.doesNotMatch(source,/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)/);
  console.log('CAM SPORTS global edit mode: 22 behavioral and integration checks passed');
};
await run();
