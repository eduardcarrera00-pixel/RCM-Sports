/* Article metadata and published share previews. No editor/authentication changes. */
(function (root) {
  'use strict';
  const ORIGIN = 'https://camsports.github.io/';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const defaults = {
    title: 'CAM SPORTS | Tu blog deportivo',
    description: 'Noticias de NFL y fútbol, rankings, quinielas, Picks y opiniones de la comunidad CAM SPORTS.',
    url: ORIGIN,
    image: ORIGIN + 'assets/social-brand/news.jpg',
    type: 'website'
  };
  function text(value, limit = 200) {
    const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    return String(value ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, key) => {
        if (key[0] !== '#') return entities[key.toLowerCase()] || all;
        const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
        return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
      }).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0,limit);
  }
  function imageURL(value) {
    if (!String(value ?? '').trim()) return defaults.image;
    try {
      const u = new URL(String(value), ORIGIN);
      return u.protocol === 'https:' && !u.username && !u.password ? u.href : defaults.image;
    } catch { return defaults.image; }
  }
  function articleURL(id) {
    const u = new URL(ORIGIN);
    u.searchParams.set('article', String(id));
    return u.href;
  }
  function describe(article) {
    const title = text(article.title, 180) || 'Noticias';
    const date = article.createdAt || article.created_at;
    const published = date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : '';
    return {
      title: title + ' | CAM SPORTS',
      description: text(article.summary || article.body, 200) || defaults.description,
      url: articleURL(article.id),
      image: imageURL(article.image),
      type: 'article',
      author: text(article.author || 'CAM SPORTS', 100),
      published
    };
  }
  function previewPath(id) {
    return UUID.test(String(id)) ? 'compartir/noticias/' + String(id).toLowerCase() + '/' : null;
  }
  const api = {defaults, text, imageURL, articleURL, describe, previewPath};
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (!root.document) return;
  const document = root.document;
  const previews = new Set();
  function meta(name, content, property = false) {
    const key = property ? 'property' : 'name';
    let element = document.head.querySelector('meta[' + key + '="' + name + '"]');
    if (!content) { element?.remove(); return; }
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(key, name);
      document.head.append(element);
    }
    element.content = content;
  }
  function apply(data, unavailable = false) {
    document.title = data.title;
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = data.url;
    meta('description', data.description);
    meta('robots', unavailable ? 'noindex,follow' : null);
    for (const key of ['title','description','url','image','type']) meta('og:' + key, data[key], true);
    meta('og:site_name', 'CAM SPORTS', true);
    meta('og:locale', 'es_ES', true);
    meta('twitter:card', 'summary_large_image');
    for (const key of ['title','description','image']) meta('twitter:' + key, data[key]);
    meta('article:published_time', data.published, true);
    meta('article:author', data.author, true);
  }
  api.setArticle = article => apply(describe(article));
  api.reset = () => apply(defaults);
  api.unavailable = () => apply({...defaults, title:'Publicación no disponible | CAM SPORTS'}, true);
  // Only share static URLs that have actually been generated and published.
  // New articles still work through their existing URL while the catalog refreshes.
  api.shareURL = (id, fallback) => {
    const path = previewPath(id);
    return path && previews.has(String(id).toLowerCase()) ? new URL(path, ORIGIN).href : (fallback || articleURL(id));
  };
  const scriptURL = document.currentScript?.src || new URL('assets/cam-article-seo.js', root.location.href).href;
  api.ready = Promise.resolve().then(() => root.fetch(new URL('cam-article-previews.json',scriptURL), {cache:'no-cache'}))
    .then(response => response.ok ? response.json() : null)
    .then(catalog => {
      if (catalog?.version !== 1 || !Array.isArray(catalog.ids)) return;
      for (const id of catalog.ids) if (UUID.test(String(id))) previews.add(String(id).toLowerCase());
    }).catch(() => {});
  root.camArticleSeo = api;
})(typeof window === 'object' ? window : globalThis);
