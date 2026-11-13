/* Match Football's rendered measurements, including after fonts or width change.
   The Football panel itself is never resized by this module. */
(() => {
  'use strict';
  let current = null, observer = null, queued = false;
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  function emptyCard(label, lead) {
    const article = make('article', 'ae-opinion-card is-sym-empty' + (lead ? ' is-lead cam-act-approved-hero' : ' is-tile'));
    const open = make('div', 'ae-opinion-open');
    const media = make('div', 'ae-opinion-media is-empty cam-sym-empty-media', label);
    const text = make('div', 'ae-opinion-text');
    const meta = make('p', 'ae-opinion-meta');
    meta.append(make('span', 'ae-opinion-sport', label));
    text.append(meta, make('h3', 'ae-opinion-title', 'Próximamente'),
      make('p', 'ae-opinion-excerpt', lead ? 'Las próximas publicaciones de ' + label + ' aparecerán aquí.' : 'Sin publicaciones todavía.'));
    open.append(media, text);
    article.append(open, make('div', 'cam-actualidad-news-actions cam-sym-empty-actions'));
    return article;
  }
  function ensureEmptyLayout(root) {
    const list = root.querySelector('#aeOpinionsList');
    if (!list || list.getAttribute('aria-busy') === 'true') return;
    const label = root.querySelector('#aeOpinionsTabs [aria-selected=true]')?.textContent || 'CAM SPORTS';
    if (!list.querySelector('.cam-act-approved-hero') && list.querySelector('.ae-opinions-empty')) {
      list.querySelector('.ae-opinions-empty').hidden = true;
      list.append(emptyCard(label, true));
    }
    if (list.querySelector('.cam-act-approved-hero') && !list.querySelector('.cam-act-approved-rail')) {
      const rail = make('div', 'cam-act-approved-rail cam-sym-empty-rail');
      rail.setAttribute('aria-label', 'Espacio para próximas publicaciones de ' + label);
      rail.append(emptyCard(label, false), emptyCard(label, false));
      list.append(rail);
    }
  }
  function measure() {
    queued = false;
    if (!current || !current.root.isConnected) return;
    const { root, reference } = current;
    const list = root.querySelector('#aeOpinionsList');
    if (!list || !list.clientWidth || !reference) return;
    const box = make('div', 'cam-sym-reference');
    box.setAttribute('aria-hidden', 'true');
    box.inert = true;
    box.innerHTML = reference;
    box.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    const active = root.dataset.camActualidad;
    // Measure the unmodified reference rules synchronously before the next paint.
    root.dataset.camActualidad = 'futbol';
    list.append(box);
    const hero = box.querySelector('.cam-act-approved-hero');
    const title = hero?.querySelector('.ae-opinion-title');
    const rail = box.querySelector('.cam-act-approved-rail');
    if (!hero || !rail || !title) {
      box.remove(); root.dataset.camActualidad = active; return;
    }
    const heights = {
      hero: hero,
      open: hero.querySelector('.ae-opinion-open'),
      text: hero.querySelector('.ae-opinion-text'),
      title,
      excerpt: hero.querySelector('.ae-opinion-excerpt'),
      footer: hero.querySelector('.cam-actualidad-news-actions'),
      rail,
      'rail-title': rail.querySelector('.ae-opinion-title'),
      debates: box.querySelector('.ae-opinions-debated-list')
    };
    for (const [name, node] of Object.entries(heights)) {
      if (node) root.style.setProperty('--cam-sym-' + name, node.getBoundingClientRect().height + 'px');
    }
    const lines = node => Math.max(1, Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)));
    root.style.setProperty('--cam-sym-title-lines', lines(title));
    root.style.setProperty('--cam-sym-excerpt-lines', lines(heights.excerpt));
    root.style.setProperty('--cam-sym-rail-title-lines', lines(heights['rail-title']));
    box.remove();
    root.dataset.camActualidad = active;
    root.classList.add('cam-act-symmetric');
    ensureEmptyLayout(root);
  }
  function refresh() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(measure);
  }
  window.camActualidadSymmetry = {
    configure(root, reference) {
      if (!root || !reference) return;
      if (current?.root !== root) {
        observer?.disconnect();
        let width = 0;
        observer = new ResizeObserver(() => {
          if (root.clientWidth !== width) { width = root.clientWidth; refresh(); }
        });
        observer.observe(root);
      }
      current = { root, reference };
      measure();
    },
    refresh
  };
  document.fonts?.ready.then(refresh);
  addEventListener('resize', refresh, { passive: true });
})();
