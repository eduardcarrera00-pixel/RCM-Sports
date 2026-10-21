/* CAM SPORTS · Opiniones.
 * Columnas y noticias comentadas por la redacción, divididas por deporte.
 * Lectura pública (ae_opinions, solo publicadas); los administradores ven también
 * los borradores y publican, editan o borran con ae_publish_opinion,
 * ae_update_opinion y ae_delete_opinion. Las vistas se cuentan con
 * ae_bump_opinion_view. Enlace directo: ?opinion=<id>.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const SPORTS = [
    ['nfl', 'NFL'], ['futbol', 'Fútbol'], ['colegial', 'Colegial'], ['ciclismo', 'Ciclismo'], ['tenis', 'Tenis']
  ];
  const SPORT_NAME = Object.fromEntries(SPORTS);
  const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const MAX_IMAGE = 8 * 1024 * 1024;

  let failed = false, items = [], views = new Map(), active = 'todas', loaded = false, loading = null, editing = null, reading = null, pendingDeepLink = null;

  const client = () => { try { return typeof db !== 'undefined' ? db : window.db; } catch { return window.db; } };
  const isAdmin = () => { try { return typeof currentAdmin !== 'undefined' && Boolean(currentAdmin); } catch { return false; } };
  const adminName = () => { try { return (typeof currentAdmin !== 'undefined' && currentAdmin?.name) || ''; } catch { return ''; } };
  const dateText = s => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s));
  const shortDate = s => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(s));
  const readMinutes = text => Math.max(1, Math.round(String(text || '').trim().split(/\s+/).length / 200));
  const safeImage = url => (typeof url === 'string' && /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/\S*)?$/.test(url)) ? url : '';
  const clamp = v => Math.min(100, Math.max(0, Math.round(Number(v)) || 0));
  const excerpt = o => (o.summary || '').trim() || String(o.body || '').trim().split(/\n\s*\n/)[0].slice(0, 220).trim() + (String(o.body || '').length > 220 ? '…' : '');
  const status = (text, isError) => { const n = $('aeOpinionsStatus'); if (n) { n.textContent = text || ''; n.classList.toggle('is-error', Boolean(isError)); } };

  // ---------- Datos ----------
  async function load(force) {
    const sb = client();
    if (!sb) { status('La conexión no está disponible.', true); return; }
    if (loading && !force) return loading;
    loading = (async () => {
      const r = await sb.from('ae_opinions')
        .select('id,sport,title,summary,body,image,image_focus_x,image_focus_y,author,is_published,featured,created_at,edited_at')
        .order('created_at', { ascending: false }).limit(200);
      if (r.error) { failed = true; loaded = true; return; }
      failed = false;
      items = (r.data || []).filter(o => o.is_published || isAdmin());
      const ids = items.map(o => o.id);
      views = new Map();
      if (ids.length) {
        const v = await sb.from('ae_opinion_views').select('opinion_id,views').in('opinion_id', ids);
        if (!v.error) for (const row of v.data || []) views.set(row.opinion_id, Number(row.views) || 0);
      }
      loaded = true; status('');
    })();
    try { await loading; } finally { loading = null; }
    render();
    openDeepLink();
  }

  // ---------- Listado ----------
  // Las noticias son referencias a los artículos originales: no se copian a
  // ae_opinions, no cambian la fecha de publicación ni pierden sus comentarios.
  function sportNews() {
    const source = typeof articles !== 'undefined' && Array.isArray(articles) ? articles : [];
    return source.filter(a => a && ['NFL', 'Fútbol'].includes(a.category))
      .map(a => ({
        id: a.id,
        sport: a.category === 'NFL' ? 'nfl' : 'futbol',
        title: a.title || 'Sin título',
        summary: a.summary || '',
        body: a.body || '',
        image: a.image || '',
        image_focus_x: a.image_focus_x,
        image_focus_y: a.image_focus_y,
        author: a.author || 'CAM Sports',
        created_at: a.createdAt,
        readTime: a.readTime,
        is_published: true,
        featured: false,
        is_news: true
      }));
  }

  function visible() {
    const list = [...items, ...sportNews()].filter(o => active === 'todas' || o.sport === active);
    return list.sort((a, b) => (b.featured === true) - (a.featured === true) || new Date(b.created_at) - new Date(a.created_at));
  }

  function renderTabs() {
    const root = $('aeOpinionsTabs'); if (!root) return;
    root.replaceChildren();
    for (const [key, label] of [['todas', 'Todas'], ...SPORTS]) {
      const b = el('button', null, 'ae-opinions-tab');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.sport = key;
      b.setAttribute('aria-selected', String(active === key));
      b.tabIndex = active === key ? 0 : -1;
      b.append(el('span', label));
      b.addEventListener('click', () => { active = key; render(); });
      b.addEventListener('keydown', e => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const tabs = [...root.querySelectorAll('[role=tab]')]; let i = tabs.indexOf(b);
        i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        active = tabs[i].dataset.sport; render(); root.querySelector('[aria-selected=true]')?.focus();
      });
      root.append(b);
    }
  }

  function media(o, cls) {
    const box = el('div', null, cls);
    const url = safeImage(o.image);
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.style.objectPosition = clamp(o.image_focus_x ?? 50) + '% ' + clamp(o.image_focus_y ?? 50) + '%';
      img.addEventListener('error', () => { img.remove(); box.classList.add('is-empty'); box.append(el('span', SPORT_NAME[o.sport] || 'Opinión', 'ae-opinion-media-mark')); }, { once: true });
      box.append(img);
    } else {
      box.classList.add('is-empty');
      box.append(el('span', SPORT_NAME[o.sport] || 'Opinión', 'ae-opinion-media-mark'));
    }
    return box;
  }

  function meta(o) {
    const m = el('p', null, 'ae-opinion-meta');
    m.append(el('span', SPORT_NAME[o.sport] || '', 'ae-opinion-sport'));
    m.append(el('span', shortDate(o.created_at)));
    m.append(el('span', o.readTime || readMinutes(o.body) + ' min de lectura'));
    if (o.is_news) m.append(el('span', 'Noticia', 'ae-opinion-flag'));
    else if (!o.is_published) m.append(el('span', 'Borrador', 'ae-opinion-flag'));
    else if (o.featured) m.append(el('span', 'Destacada', 'ae-opinion-flag is-featured'));
    return m;
  }

  function card(o, lead) {
    const a = el('article', null, 'ae-opinion-card' + (lead ? ' is-lead' : '') + (o.is_published ? '' : ' is-draft'));
    const b = el('button', null, 'ae-opinion-open');
    b.type = 'button';
    b.setAttribute('aria-label', (o.is_news ? 'Leer noticia: ' : 'Leer opinión: ') + o.title);
    b.addEventListener('click', () => {
      if (o.is_news) {
        // Abrir la noticia original con sus votos, comentarios y enlace.
        if (typeof openArticleModal === 'function') openArticleModal(o.id);
      } else {
        openReader(o.id, b);
      }
    });
    const text = el('div', null, 'ae-opinion-text');
    text.append(meta(o), el('h3', o.title, 'ae-opinion-title'), el('p', excerpt(o), 'ae-opinion-excerpt'), el('p', 'Por ' + o.author, 'ae-opinion-author'));
    b.append(media(o, 'ae-opinion-media'), text);
    a.append(b);
    return a;
  }

  function render() {
    const root = $('aeOpinions'); if (!root) return;
    const admin = isAdmin();
    const write = $('aeOpinionsWrite'); if (write) write.hidden = !admin;
    renderTabs();
    const list = $('aeOpinionsList'); list.replaceChildren();
    list.setAttribute('aria-busy', String(!loaded));
    const shown = visible();
    if (!loaded && !shown.length) { list.append(el('p', 'Cargando opiniones…', 'ae-opinions-empty')); return; }
    if (failed) {
      const box = el('div', null, 'ae-opinions-empty');
      const retry = el('button', 'Reintentar', 'ae-opinions-button is-secondary'); retry.type = 'button';
      retry.addEventListener('click', () => { loaded = false; render(); load(true); });
      box.append(el('p', 'No se pudieron cargar las columnas editoriales. Las noticias siguen disponibles.'), retry);
      list.append(box);
    }
    if (!shown.length) {
      const empty = el('div', null, 'ae-opinions-empty');
      const name = active === 'todas' ? '' : ' de ' + SPORT_NAME[active];
      empty.append(el('h3', 'Todavía no hay opiniones' + name), el('p', admin ? 'Pulsa «Escribir opinión» para publicar la primera.' : 'La redacción publicará aquí sus próximas columnas.'));
      list.append(empty); return;
    }
    shown.forEach((o, i) => list.append(card(o, i === 0)));
  }

  // ---------- Lectura ----------
  function openReader(id, opener) {
    const o = items.find(x => x.id === id); if (!o) return;
    reading = o;
    const d = $('aeOpinionReader');
    const body = $('aeOpinionReaderBody'); body.replaceChildren();
    const head = el('header', null, 'ae-opinion-reader-head');
    head.append(meta(o), el('h2', o.title, 'ae-opinion-reader-title'));
    if ((o.summary || '').trim()) head.append(el('p', o.summary.trim(), 'ae-opinion-reader-summary'));
    const by = el('p', null, 'ae-opinion-reader-by');
    const count = views.get(o.id) || 0;
    by.append(el('span', 'Por ' + o.author), el('span', dateText(o.created_at)));
    if (count) by.append(el('span', count + (count === 1 ? ' lectura' : ' lecturas')));
    head.append(by);
    body.append(head);
    if (safeImage(o.image)) body.append(media(o, 'ae-opinion-reader-media'));
    const text = el('div', null, 'ae-opinion-reader-text');
    for (const para of String(o.body).trim().split(/\n\s*\n/)) {
      const p = el('p');
      para.split('\n').forEach((line, i) => { if (i) p.append(document.createElement('br')); p.append(document.createTextNode(line)); });
      text.append(p);
    }
    body.append(text);
    const tools = $('aeOpinionReaderAdmin'); tools.hidden = !isAdmin();
    d.dataset.opener = '';
    d._opener = opener || null;
    if (!d.open) d.showModal();
    d.scrollTop = 0; body.scrollTop = 0;
    $('aeOpinionReaderClose').focus();
    try { const u = new URL(location.href); u.searchParams.set('opinion', o.id); history.replaceState(history.state, '', u); } catch {}
    if (o.is_published) {
      const sb = client();
      sb?.rpc('ae_bump_opinion_view', { p_opinion_id: o.id }).then(r => { if (!r?.error) views.set(o.id, (views.get(o.id) || 0) + 1); }, () => {});
    }
  }

  function closeReader() {
    const d = $('aeOpinionReader');
    if (d.open) d.close();
  }

  function onReaderClosed() {
    const d = $('aeOpinionReader');
    reading = null;
    try { const u = new URL(location.href); if (u.searchParams.has('opinion')) { u.searchParams.delete('opinion'); history.replaceState(history.state, '', u); } } catch {}
    const opener = d._opener; d._opener = null;
    if (opener && opener.isConnected) opener.focus();
  }

  async function share() {
    if (!reading) return;
    const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('opinion', reading.id);
    const data = { title: reading.title, text: reading.title + ' · CAM Sports', url: u.toString() };
    const note = $('aeOpinionReaderNote');
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url);
      note.textContent = 'Enlace copiado.';
    } catch (e) { if (e?.name !== 'AbortError') note.textContent = 'No se pudo compartir. Copia la dirección de la página.'; }
    setTimeout(() => { note.textContent = ''; }, 3000);
  }

  function openDeepLink() {
    if (!pendingDeepLink || !loaded) return;
    const id = pendingDeepLink; pendingDeepLink = null;
    if (items.some(o => o.id === id)) openReader(id, null);
  }

  // ---------- Edición (solo administradores) ----------
  function fillSportOptions() {
    const s = $('aeOpinionSport'); if (!s || s.options.length) return;
    for (const [key, label] of SPORTS) { const o = el('option', label); o.value = key; s.append(o); }
  }

  function updatePreview() {
    const url = safeImage($('aeOpinionImage').value.trim()) || $('aeOpinionImagePreview').dataset.localUrl || '';
    const box = $('aeOpinionImagePreview'); const img = box.querySelector('img');
    box.hidden = !url;
    if (url) {
      img.src = url;
      img.style.objectPosition = $('aeOpinionFocusX').value + '% ' + $('aeOpinionFocusY').value + '%';
    }
    $('aeOpinionFocusFields').hidden = !url;
  }

  function counter(input, out) {
    const n = $(input), c = $(out); if (!n || !c) return;
    const max = n.maxLength > 0 ? n.maxLength : null;
    c.textContent = n.value.length + (max ? ' / ' + max : '');
  }

  function openEditor(o) {
    if (!isAdmin()) return;
    fillSportOptions();
    editing = o || null;
    const f = $('aeOpinionForm'); f.reset();
    $('aeOpinionEditorTitle').textContent = o ? 'Editar opinión' : 'Escribir opinión';
    $('aeOpinionSport').value = o?.sport || (active !== 'todas' ? active : 'nfl');
    $('aeOpinionTitle').value = o?.title || '';
    $('aeOpinionSummary').value = o?.summary || '';
    $('aeOpinionBody').value = o?.body || '';
    $('aeOpinionAuthor').value = o?.author || adminName() || 'Redacción';
    $('aeOpinionImage').value = o?.image || '';
    $('aeOpinionFile').value = '';
    const prev = $('aeOpinionImagePreview');
    if (prev.dataset.localUrl) { URL.revokeObjectURL(prev.dataset.localUrl); delete prev.dataset.localUrl; }
    $('aeOpinionFocusX').value = o?.image_focus_x ?? 50;
    $('aeOpinionFocusY').value = o?.image_focus_y ?? 50;
    $('aeOpinionFeatured').checked = Boolean(o?.featured);
    $('aeOpinionPublished').checked = o ? Boolean(o.is_published) : true;
    $('aeOpinionFormError').textContent = '';
    $('aeOpinionSave').textContent = o ? 'Guardar cambios' : 'Publicar';
    counter('aeOpinionTitle', 'aeOpinionTitleCount'); counter('aeOpinionSummary', 'aeOpinionSummaryCount'); counter('aeOpinionBody', 'aeOpinionBodyCount');
    syncSaveLabel();
    updatePreview();
    const d = $('aeOpinionEditor');
    if (!d.open) d.showModal();
    $('aeOpinionTitle').focus();
  }

  function syncSaveLabel() {
    const published = $('aeOpinionPublished').checked;
    $('aeOpinionSave').textContent = editing ? 'Guardar cambios' : (published ? 'Publicar' : 'Guardar borrador');
  }

  async function uploadImage(file) {
    if (!IMAGE_TYPES[file.type]) throw Error('La imagen debe ser JPG, PNG o WebP.');
    if (file.size > MAX_IMAGE) throw Error('La imagen supera 8 MB.');
    const sb = client();
    if (!sb?.storage) throw Error('La subida de imágenes no está disponible. Pega un enlace HTTPS.');
    const name = 'opinions/' + crypto.randomUUID() + '.' + IMAGE_TYPES[file.type];
    const r = await sb.storage.from('article-images').upload(name, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (r.error) throw Error('No se pudo guardar la imagen: ' + r.error.message);
    const url = sb.storage.from('article-images').getPublicUrl(r.data?.path || name).data?.publicUrl || '';
    if (!safeImage(url)) throw Error('La imagen se subió, pero no se obtuvo un enlace válido.');
    return url;
  }

  async function save(e) {
    e.preventDefault();
    if (!isAdmin()) return;
    const err = $('aeOpinionFormError'); err.textContent = '';
    const btn = $('aeOpinionSave');
    const title = $('aeOpinionTitle').value.trim(), body = $('aeOpinionBody').value.trim();
    if (title.length < 5) { err.textContent = 'El título necesita al menos 5 caracteres.'; $('aeOpinionTitle').focus(); return; }
    if (body.length < 20) { err.textContent = 'El texto necesita al menos 20 caracteres.'; $('aeOpinionBody').focus(); return; }
    let image = $('aeOpinionImage').value.trim();
    if (image && !safeImage(image)) { err.textContent = 'El enlace de la imagen debe empezar por https://'; $('aeOpinionImage').focus(); return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Guardando…';
    try {
      const file = $('aeOpinionFile').files?.[0];
      if (file) image = await uploadImage(file);
      const args = {
        p_sport: $('aeOpinionSport').value,
        p_title: title,
        p_summary: $('aeOpinionSummary').value.trim(),
        p_body: body,
        p_author: $('aeOpinionAuthor').value.trim() || 'Redacción',
        p_image: image || null,
        p_image_focus_x: clamp($('aeOpinionFocusX').value),
        p_image_focus_y: clamp($('aeOpinionFocusY').value),
        p_featured: $('aeOpinionFeatured').checked,
        p_is_published: $('aeOpinionPublished').checked
      };
      const r = editing
        ? await client().rpc('ae_update_opinion', { p_opinion_id: editing.id, ...args })
        : await client().rpc('ae_publish_opinion', args);
      if (r.error) throw Error(r.error.message || 'No se pudo guardar.');
      const id = r.data || editing?.id;
      $('aeOpinionEditor').close();
      active = args.p_sport === active || active === 'todas' ? active : args.p_sport;
      await load(true);
      status(args.p_is_published ? 'Opinión publicada.' : 'Borrador guardado. Solo lo ven los administradores.');
      if (id && items.some(o => o.id === id)) openReader(id, null);
    } catch (x) {
      err.textContent = x.message || 'No se pudo guardar. Tu texto sigue aquí.';
    } finally {
      btn.disabled = false; if (btn.textContent === 'Guardando…') btn.textContent = label;
    }
  }

  async function remove() {
    if (!reading || !isAdmin()) return;
    if (!window.confirm('¿Borrar definitivamente «' + reading.title + '»? Esta acción no se puede deshacer.')) return;
    const id = reading.id;
    const r = await client().rpc('ae_delete_opinion', { p_opinion_id: id });
    if (r.error) { $('aeOpinionReaderNote').textContent = r.error.message || 'No se pudo borrar.'; return; }
    closeReader();
    items = items.filter(o => o.id !== id);
    render(); status('Opinión borrada.');
  }

  // ---------- Integración con la navegación ----------
  function show() {
    render();
    if (!loaded) load();
  }

  function bind() {
    $('aeOpinionsWrite')?.addEventListener('click', () => openEditor(null));
    $('aeOpinionReaderClose')?.addEventListener('click', closeReader);
    $('aeOpinionReaderShare')?.addEventListener('click', share);
    $('aeOpinionReaderEdit')?.addEventListener('click', () => { const o = reading; closeReader(); openEditor(o); });
    $('aeOpinionReaderDelete')?.addEventListener('click', remove);
    const reader = $('aeOpinionReader');
    reader?.addEventListener('close', onReaderClosed);
    reader?.addEventListener('click', e => { if (e.target === reader) closeReader(); });
    const editor = $('aeOpinionEditor');
    $('aeOpinionCancel')?.addEventListener('click', () => editor.close());
    $('aeOpinionEditorClose')?.addEventListener('click', () => editor.close());
    editor?.addEventListener('cancel', e => {
      const dirty = $('aeOpinionTitle').value.trim() || $('aeOpinionBody').value.trim();
      if (dirty && !window.confirm('¿Cerrar sin guardar? Se perderá lo que has escrito.')) e.preventDefault();
    });
    $('aeOpinionForm')?.addEventListener('submit', save);
    $('aeOpinionPublished')?.addEventListener('change', syncSaveLabel);
    for (const [i, c] of [['aeOpinionTitle', 'aeOpinionTitleCount'], ['aeOpinionSummary', 'aeOpinionSummaryCount'], ['aeOpinionBody', 'aeOpinionBodyCount']])
      $(i)?.addEventListener('input', () => counter(i, c));
    for (const id of ['aeOpinionImage', 'aeOpinionFocusX', 'aeOpinionFocusY']) $(id)?.addEventListener('input', updatePreview);
    $('aeOpinionFile')?.addEventListener('change', () => {
      const prev = $('aeOpinionImagePreview'); const f = $('aeOpinionFile').files?.[0];
      if (prev.dataset.localUrl) { URL.revokeObjectURL(prev.dataset.localUrl); delete prev.dataset.localUrl; }
      $('aeOpinionFormError').textContent = '';
      if (f) {
        if (!IMAGE_TYPES[f.type] || f.size > MAX_IMAGE) { $('aeOpinionFormError').textContent = 'La imagen debe ser JPG, PNG o WebP de hasta 8 MB.'; $('aeOpinionFile').value = ''; }
        else { prev.dataset.localUrl = URL.createObjectURL(f); $('aeOpinionImage').value = ''; }
      }
      updatePreview();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bind();
    try {
      const id = new URLSearchParams(location.search).get('opinion');
      if (id && /^[0-9a-f-]{36}$/i.test(id)) {
        pendingDeepLink = id;
        if (typeof filterByCategory === 'function') setTimeout(() => filterByCategory('Opiniones'), 0);
      }
    } catch {}
  });

  window.aeOpinions = {
    show,
    rerender: () => { if (!$('aeOpinions')?.hidden) { loaded ? load(true) : show(); } },
    reload: () => load(true),
    refreshNews: () => { if (!$('aeOpinions')?.hidden) render(); }
  };
})();
