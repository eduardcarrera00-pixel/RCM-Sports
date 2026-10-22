/* CAM SPORTS · Tamaños visuales independientes. No modifica el archivo ni el layout. */
(() => {
  'use strict';
  if (window.camVisualSizes) return;
  const CACHE = 'cam_visual_sizes_v1';
  const TABLE = 'cam_visual_sizes';
  const MOBILE = 979;
  const rows = new Map();
  const pending = new Map();
  const valid = key => /^[a-z0-9][a-z0-9._-]{2,119}$/.test(key || '');
  const percent = n => Math.max(50, Math.min(200, Math.round(Number(n) / 5) * 5 || 100));
  const cacheKey = (key, device, theme) => [key, device, theme].join('|');
  const deviceNow = () => matchMedia('(max-width: ' + MOBILE + 'px)').matches ? 'mobile' : 'desktop';
  const themeNow = () => document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const clean = r => {
    if (!r || !valid(r.key) || !['desktop', 'mobile'].includes(r.device) ||
        !['all', 'light', 'dark'].includes(r.theme) || !Number.isInteger(r.size_percent) ||
        r.size_percent < 50 || r.size_percent > 200 || r.size_percent % 5) return null;
    return { key: r.key, device: r.device, theme: r.theme, size_percent: r.size_percent };
  };
  function readCache() {
    try { for (const item of JSON.parse(localStorage.getItem(CACHE) || '[]')) {
      const r = clean(item); if (r) rows.set(cacheKey(r.key, r.device, r.theme), r.size_percent);
    } } catch {}
  }
  function store() {
    try { localStorage.setItem(CACHE, JSON.stringify([...rows].map(([id, value]) => {
      const [key, device, theme] = id.split('|');
      return { key, device, theme, size_percent: value };
    }))); } catch {}
  }
  const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55);
  function identify(img) {
    if (!img || img.localName !== 'img' || img.closest('#camSiteImageDialog,cam-site-image-layer')) return null;
    if (img.classList.contains('cam-brand-art')) {
      const scope = img.closest('header') ? 'header' : img.closest('footer') ? 'footer' : 'other';
      return { key: 'brand.' + scope, label: 'Logo CAM SPORTS · ' + ({header:'cabecera',footer:'pie',other:'sección'}[scope]), max: 175 };
    }
    if (img.classList.contains('cam-welcome-logo')) return { key: 'brand.welcome', label:'Logo CAM SPORTS · bienvenida', max:175 };
    const nav = img.closest('header .category-btn[data-category]');
    if (nav && img.classList.contains('ae-custom-sport-icon')) {
      const category = slug(nav.dataset.category);
      if (category) return { key:'nav.' + category, label:'Icono · ' + nav.dataset.category, max:140 };
    }
    const rankRow = img.closest('li.rcm-team[data-team-id]');
    if (rankRow && img.closest('.ae-team-emblem')) {
      const sport = rankRow.dataset.rankSport === 'ucl' ? 'champions' : 'nfl';
      const id = slug(rankRow.dataset.teamId);
      if (id) return { key:'ranking.' + sport + '.' + id, label:'Escudo · ' + (rankRow.dataset.teamName || img.alt || id), max:160 };
    }
    if (/pix[eé]?l?/i.test(img.alt || '') || /pix[eé]?l?/i.test(img.closest('[class*="pix"]')?.className || '')) {
      const section = img.closest('header') ? 'header' : img.closest('footer') ? 'footer' : 'content';
      return { key:'brand.pixel.' + section, label:'Logo Píxel · ' + section, max:175 };
    }
    // Una imagen fija del inventario conserva su propio lápiz; su tamaño no
    // se comparte con otras piezas aunque el archivo original sea el mismo.
    const imageKey = img.dataset.siteImage;
    if (valid(imageKey) && !/^noticias\.respaldo/.test(imageKey)) {
      return { key:'asset.' + imageKey, label:'Imagen · ' + (img.alt || imageKey), max:200 };
    }
    return null;
  }
  function mark(root) {
    if (!root || root.nodeType !== 1) return;
    const imgs = root.localName === 'img' ? [root] : root.querySelectorAll('img');
    for (const img of imgs) {
      const item = identify(img);
      if (item && valid(item.key)) {
        if (img.dataset.camSizeKey !== item.key) img.dataset.camSizeKey = item.key;
        // El wordmark vive dentro de un recorte intencionado (sin márgenes
        // transparentes). Escalar el recorte completo evita cortar letras.
        const crop = img.classList.contains('cam-brand-art') && img.closest('.cam-brand-crop');
        if (crop && crop.dataset.camSizeKey !== item.key) crop.dataset.camSizeKey = item.key;
      } else if (img.dataset.camSizeKey) delete img.dataset.camSizeKey;
    }
  }
  function allTargets() {
    const found = [];
    for (const el of document.querySelectorAll('img[data-cam-size-key]')) {
      const item = identify(el);
      if (item) found.push({ el, ...item });
    }
    return found;
  }
  function effective(key, device, theme) {
    const item = (t) => {
      const id = cacheKey(key, device, t);
      return pending.has(id) ? pending.get(id) : rows.get(id);
    };
    return item(theme) ?? item('all') ?? 100;
  }
  let style = null;
  function render() {
    if (!style) { style = document.createElement('style'); style.id = 'cam-size-overrides'; document.head.append(style); }
    const keys = new Set([...rows.keys(), ...pending.keys()].map(id => id.split('|')[0]));
    const rules = [];
    for (const key of keys) {
      if (!valid(key)) continue;
      for (const device of ['desktop','mobile']) for (const theme of ['light','dark']) {
        const pct = effective(key, device, theme);
        if (pct === 100) continue;
        const surface = /^brand\.(header|footer|other)$/.test(key)
          ? '.cam-brand-crop' : 'img';
        const selector = 'html' + (theme === 'dark' ? '.dark' : ':not(.dark)') +
          ' ' + surface + '[data-cam-size-key="' + key + '"]';
        const size = 'scale:' + (pct / 100) + ' !important; transform-origin:center center !important;';
        rules.push('@media ' + (device === 'mobile' ? '(max-width:979px)' : '(min-width:980px)') +
          '{' + selector + '{' + size + '}}');
      }
    }
    style.textContent = rules.join('\n');
  }
  function get(key, device = deviceNow(), theme = 'all') {
    if (!valid(key)) return 100;
    const id = cacheKey(key, device, theme);
    return pending.get(id) ?? rows.get(id) ?? (theme !== 'all' ? effective(key, device, theme) : 100);
  }
  function preview(key, device, theme, value) {
    if (!valid(key)) return;
    pending.set(cacheKey(key, device, theme), percent(value)); render();
  }
  function cancelPreview() { if (!pending.size) return; pending.clear(); render(); }
  function api() { try { return typeof db !== 'undefined' ? db : window.db; } catch { return window.db; } }
  async function load() {
    const sb = api(); if (!sb?.from) return false;
    const result = await sb.from(TABLE).select('key,device,theme,size_percent');
    if (result.error) { console.warn('CAM SPORTS: sin lectura de tamaños', result.error.message); return false; }
    rows.clear();
    for (const item of result.data || []) {
      const r = clean(item); if (r) rows.set(cacheKey(r.key, r.device, r.theme), r.size_percent);
    }
    store(); render(); mark(document.documentElement); return true;
  }
  async function save(key, device, theme, value) {
    if (!valid(key) || !['desktop','mobile'].includes(device) ||
      !['all','light','dark'].includes(theme)) throw Error('Configuración de tamaño no válida.');
    const editor = window.camGlobalEditMode;
    if (!editor?.isActive()) throw Error('Activa el Modo Edición para cambiar tamaños.');
    const sb = api();
    if (!sb?.auth?.getUser || !sb?.from) throw Error('No se pudo conectar con Supabase.');
    const { data: auth, error: authError } = await sb.auth.getUser();
    if (authError || !auth?.user) throw Error('La sesión del administrador ha caducado.');
    const { data: access, error: accessError } = await sb.from('editors').select('user_id')
      .eq('user_id', auth.user.id).maybeSingle();
    if (accessError || access?.user_id !== auth.user.id) throw Error('No tienes permisos para editar tamaños.');
    const size = percent(value), id = cacheKey(key, device, theme);
    // El 100 % es una anulación explícita: permite volver al tamaño original
    // en modo noche aunque «Ambos» tenga, por ejemplo, un 125 %.
    const result = await sb.from(TABLE).upsert(
      { key, device, theme, size_percent:size }, { onConflict:'key,device,theme' });
    if (result.error) throw Error(result.error.message || 'No se pudo guardar el tamaño.');
    rows.set(id, size);
    pending.delete(id); store(); render();
  }
  readCache();
  render(); // La regla CSS se instala antes de pintar el contenido del body.
  const observer = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'childList') for (const node of m.addedNodes) mark(node);
      else if (m.attributeName === 'src') mark(m.target);
    }
  });
  observer.observe(document.documentElement, { subtree:true, childList:true, attributes:true, attributeFilter:['src'] });
  mark(document.documentElement);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mark(document.documentElement); load().catch(() => {}); });
  else load().catch(() => {});
  window.camVisualSizes = Object.freeze({ identify, allTargets, get, effective, deviceNow, themeNow, preview, cancelPreview, save, load, mark });
})();