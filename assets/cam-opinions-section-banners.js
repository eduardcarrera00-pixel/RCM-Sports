/* CAM SPORTS · Banners configurables de Opiniones.
 * Tres secciones x dos temas; sólo los editores pueden guardar.
 * La configuración pública se lee con RLS desde Supabase.
 */
(() => {
  'use strict';
  const SLOTS = {
    distinguished: 'Opinadores distinguidos',
    debated: 'Lo más debatido',
    sports: 'Opiniones por deporte'
  };
  const THEMES = ['light', 'dark'];
  const MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const MAX_ORIGINAL = 25 * 1024 * 1024;
  const MAX_UPLOADED = 8 * 1024 * 1024;
  const $ = id => document.getElementById(id);
  const banners = new Map();
  let fetched = false;
  let fetching = null;
  let dialog = null;
  let selectedSlot = null;
  let objectUrl = null;
  let opener = null;

  function client() {
    try { return typeof db !== 'undefined' ? db : window.db; }
    catch { return window.db; }
  }
  function editor() {
    try { return typeof currentAdmin !== 'undefined' && Boolean(currentAdmin); }
    catch { return false; }
  }
  function validUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }
  const key = (slot, theme) => slot + ':' + theme;
  const themeNow = () => document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  function imageFor(slot) {
    return banners.get(key(slot, themeNow())) || '';
  }
  function setSection(slot) {
    const header = document.querySelector('#aeOpinions .ae-opinions-section-head[data-cam-opinions-banner="' + slot + '"]');
    if (!header) return;
    const src = imageFor(slot);
    const hasLightAsset = Boolean(banners.get(key(slot, 'light')));
    header.classList.toggle('cam-op-banner-light-asset', hasLightAsset && themeNow() === 'light');
    let img = header.querySelector('.cam-op-banner-image');
    if (src) {
      if (!img) {
        img = document.createElement('img');
        img.className = 'cam-op-banner-image';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.loading = 'lazy';
        img.decoding = 'async';
        header.prepend(img);
      }
      if (img.getAttribute('src') !== src) img.src = src;
      header.classList.add('cam-op-banner-active');
    } else {
      img?.remove();
      header.classList.remove('cam-op-banner-active');
    }
    const existingButton = header.querySelector('.cam-op-banner-edit');
    if (!editor()) { existingButton?.remove(); return; }
    if (!existingButton) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'cam-op-banner-edit';
      button.textContent = 'Editar banner';
      button.setAttribute('aria-label', 'Editar banner de ' + SLOTS[slot]);
      button.addEventListener('click', () => open(slot, button));
      header.append(button);
    }
  }
  function refresh() {
    for (const slot of Object.keys(SLOTS)) setSection(slot);
    if (!fetched && !fetching && client()) void load();
  }
  async function load() {
    const sb = client();
    if (!sb) return;
    if (fetching) return fetching;
    fetching = (async () => {
      try {
        const res = await sb.from('cam_opinions_section_banners').select('section_key,theme,image_url');
        if (res.error) throw res.error;
        banners.clear();
        for (const row of res.data || []) {
          if (SLOTS[row.section_key] && THEMES.includes(row.theme) && validUrl(row.image_url))
            banners.set(key(row.section_key, row.theme), validUrl(row.image_url));
        }
        fetched = true;
      } catch (e) {
        // Si la migración no se ha aplicado, el sitio sigue mostrando su diseño previo.
        console.warn('CAM SPORTS: banners de Opiniones no disponibles', e.message || e);
      } finally {
        fetching = null;
        for (const slot of Object.keys(SLOTS)) setSection(slot);
      }
    })();
    return fetching;
  }

  function element(tag, cls, value) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function input(id, type) {
    const n = element('input');
    n.id = id; n.type = type;
    return n;
  }
  function field(text, control) {
    const n = element('label');
    n.append(document.createTextNode(text), control);
    return n;
  }
  function createDialog() {
    if (dialog) return dialog;
    dialog = element('dialog');
    dialog.id = 'camOpBannerDialog';
    dialog.setAttribute('aria-labelledby', 'camOpBannerTitle');
    const form = element('form');
    form.noValidate = true;
    const title = element('h2', null, 'Editar banner');
    title.id = 'camOpBannerTitle';
    const note = element('p', null, 'Cada sección puede tener una imagen distinta para día y noche. Se muestra sólo en Opiniones.');
    const theme = element('select'); theme.id = 'camOpBannerTheme';
    [['light','Modo día'],['dark','Modo noche']].forEach(pair => {
      const option = element('option', null, pair[1]); option.value = pair[0]; theme.append(option);
    });
    const file = input('camOpBannerFile', 'file');
    file.accept = 'image/jpeg,image/png,image/webp';
    const url = input('camOpBannerUrl', 'url');
    url.placeholder = 'https://… (o sube una imagen)';
    url.autocomplete = 'off';
    const img = element('img', 'cam-op-banner-preview');
    img.id = 'camOpBannerPreview';
    img.alt = 'Vista previa del banner';
    img.hidden = true;
    const status = element('p', null, '');
    status.id = 'camOpBannerStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const actions = element('div', 'cam-op-banner-actions');
    const save = element('button', null, 'Guardar banner'); save.type = 'submit'; save.id = 'camOpBannerSave';
    const remove = element('button', null, 'Quitar imagen de este modo'); remove.type = 'button'; remove.id = 'camOpBannerRemove';
    const cancel = element('button', null, 'Cerrar'); cancel.type = 'button';
    actions.append(save, remove, cancel);
    form.append(title, note, field('Versión', theme), field('Subir imagen (JPG, PNG o WebP)', file), field('O utilizar enlace HTTPS', url), img, status, actions);
    dialog.append(form);
    document.body.append(dialog);
    file.addEventListener('change', preview);
    url.addEventListener('input', () => { if (!file.files?.length) preview(); });
    theme.addEventListener('change', populate);
    form.addEventListener('submit', saveBanner);
    remove.addEventListener('click', removeBanner);
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { clearPreview(); opener?.focus(); opener = null; });
    return dialog;
  }
  function clearPreview() {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  function preview() {
    const file = $('camOpBannerFile')?.files?.[0];
    const img = $('camOpBannerPreview');
    clearPreview();
    const value = file ? (objectUrl = URL.createObjectURL(file)) : validUrl($('camOpBannerUrl').value.trim());
    img.hidden = !value;
    if (value) img.src = value;
    else img.removeAttribute('src');
  }
  function populate() {
    clearPreview();
    const theme = $('camOpBannerTheme').value;
    $('camOpBannerFile').value = '';
    $('camOpBannerUrl').value = banners.get(key(selectedSlot, theme)) || '';
    $('camOpBannerStatus').textContent = '';
    preview();
  }
  async function open(slot, button) {
    if (!editor() || !SLOTS[slot]) return;
    selectedSlot = slot;
    opener = button;
    createDialog();
    $('camOpBannerTitle').textContent = 'Banner · ' + SLOTS[slot];
    $('camOpBannerTheme').value = themeNow();
    $('camOpBannerStatus').textContent = 'Cargando configuración…';
    if (!dialog.open) dialog.showModal();
    await load();
    if (!dialog.open || selectedSlot !== slot) return;
    populate();
  }
  function busy(state) {
    $('camOpBannerSave').disabled = state;
    $('camOpBannerRemove').disabled = state;
    $('camOpBannerTheme').disabled = state;
  }
  async function saveBanner(event) {
    event.preventDefault();
    if (!editor() || !selectedSlot) return;
    const sb = client();
    if (!sb) return;
    const slot = selectedSlot;
    const theme = $('camOpBannerTheme').value;
    if (!THEMES.includes(theme)) return;
    const file = $('camOpBannerFile').files?.[0];
    let url = validUrl($('camOpBannerUrl').value.trim());
    const status = $('camOpBannerStatus');
    if (file && (!MIME[file.type] || file.size > MAX_ORIGINAL)) {
      status.textContent = 'Elige una imagen JPG, PNG o WebP de hasta 25 MB.'; return;
    }
    if (!file && !url) { status.textContent = 'Selecciona una imagen o pega una URL HTTPS válida.'; return; }
    busy(true);
    status.textContent = 'Guardando imagen…';
    try {
      if (file) {
        const resized = typeof window.camCompressImage === 'function' ? await window.camCompressImage(file) : file;
        if (!MIME[resized.type] || resized.size > MAX_UPLOADED)
          throw Error('La imagen comprimida debe ser JPG, PNG o WebP y pesar como máximo 8 MB.');
        const name = 'opinions-banners/' + slot + '/' + theme + '/' + crypto.randomUUID() + '.' + MIME[resized.type];
        const upload = await sb.storage.from('article-images').upload(name, resized, {
          contentType: resized.type, cacheControl: '3600', upsert: false
        });
        if (upload.error) throw upload.error;
        url = validUrl(sb.storage.from('article-images').getPublicUrl(name).data?.publicUrl);
        if (!url) throw Error('No se pudo obtener la URL de la imagen.');
      }
      const result = await sb.from('cam_opinions_section_banners')
        .upsert({ section_key: slot, theme, image_url: url, updated_at: new Date().toISOString() },
          { onConflict: 'section_key,theme' });
      if (result.error) throw result.error;
      banners.set(key(slot, theme), url);
      fetched = true;
      refresh();
      status.textContent = 'Banner guardado.';
      dialog.close();
    } catch (e) { status.textContent = 'No se pudo guardar: ' + (e.message || 'error desconocido'); }
    finally { busy(false); }
  }
  async function removeBanner() {
    if (!editor() || !selectedSlot) return;
    const sb = client();
    if (!sb) return;
    const slot = selectedSlot, theme = $('camOpBannerTheme').value;
    busy(true);
    $('camOpBannerStatus').textContent = 'Quitando banner…';
    try {
      const result = await sb.from('cam_opinions_section_banners')
        .delete().eq('section_key', slot).eq('theme', theme);
      if (result.error) throw result.error;
      banners.delete(key(slot, theme));
      fetched = true;
      refresh();
      populate();
      $('camOpBannerStatus').textContent = 'Imagen retirada en ' + (theme === 'dark' ? 'modo noche' : 'modo día') + '.';
    } catch (e) { $('camOpBannerStatus').textContent = 'No se pudo quitar: ' + (e.message || 'error desconocido'); }
    finally { busy(false); }
  }
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
      for (const slot of Object.keys(SLOTS)) setSection(slot);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('cam:opinions-sections-updated', refresh);
    refresh();
  });
  window.camOpinionsBanners = { refresh, reload: load };
})();
