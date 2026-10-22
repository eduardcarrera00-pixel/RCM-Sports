/* CAM SPORTS · Por qué está aquí: vista previa de cada equipo en los Power Rankings
 * de NFL y Champions. El texto sale de la última publicación «Power Rankings» de cada
 * deporte (artículos públicos): el párrafo con el nombre del equipo abre su apartado y
 * los párrafos siguientes son la explicación. Nunca se inventa texto: si la publicación
 * no menciona al equipo, la tarjeta lo dice.
 * Escritorio: al pasar el ratón. Táctil: al tocar. Teclado: el líder enfocable y Esc cierra.
 */
(() => {
  'use strict';
  const SCOPES = {
    nfl: {section: '#nflRankings', lists: ['#rankingTrack', '#nflRankOneList', '#rankingList'], staticList: '#rankingList', label: 'NFL'},
    ucl: {section: '#championsRankings', lists: ['#championsTrack', '#championsRankOneList', '#championsList'], staticList: '#championsList', label: 'Champions League'}
  };
  // Otros nombres con los que las publicaciones pueden referirse a un equipo.
  const ALIASES = {
    'paris saint germain': ['psg', 'paris', 'paris sg'],
    'bayern munchen': ['bayern', 'bayern munich', 'bayern de munich'],
    'inter': ['inter de milan', 'inter milan', 'internazionale'],
    'leipzig': ['rb leipzig'],
    'bodo glimt': ['bodo', 'bodoe glimt'],
    'sporting cp': ['sporting', 'sporting lisboa', 'sporting de lisboa'],
    'atletico de madrid': ['atletico', 'atletico madrid', 'atleti'],
    'club brugge': ['brujas', 'club brujas', 'brugge'],
    'slavia praha': ['slavia praga', 'slavia'],
    'shakhtar donetsk': ['shakhtar'],
    'manchester city': ['city', 'man city'],
    'manchester united': ['united', 'man united', 'man utd'],
    'san francisco 49ers': ['niners', 'sf'],
    'new england patriots': ['pats'],
    'kansas city chiefs': ['kc'],
    'tampa bay buccaneers': ['bucs']
  };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ø/g, 'o').replace(/[^a-z0-9]+/g, ' ').trim();
  const words = s => norm(s).split(' ').filter(Boolean);

  function teamKeys(teams) {
    // Nombre completo, alias, y ciudad o apodo solo si no se repiten entre los diez.
    const keys = new Map(), count = new Map();
    const partial = teams.map(t => {
      const w = words(t.name), out = [];
      if (w.length >= 2) { out.push(w.slice(0, -1).join(' '), w.at(-1)); }
      if (w.length >= 3) out.push(w.slice(0, 2).join(' '), w.slice(-2).join(' '));
      return [...new Set(out)];
    });
    partial.flat().forEach(k => count.set(k, (count.get(k) || 0) + 1));
    teams.forEach((t, i) => {
      const own = [norm(t.name), norm(t.id), ...(ALIASES[norm(t.name)] || [])];
      partial[i].forEach(k => { if (count.get(k) === 1 && k.length >= 3) own.push(k); });
      own.filter(Boolean).forEach(k => { if (!keys.has(k)) keys.set(k, t.id); });
    });
    return keys;
  }
  // Un encabezado de equipo: línea corta, sin punto final. Admite «1. Chiefs» o «Chiefs (5-1)».
  const headingText = t => t.replace(/^\s*(?:#|n\.?º)?\s*\d{1,2}\s*[.)\-–—:]?\s*/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const looksHeading = t => t.length <= 60 && words(t).length <= 7 && !/[.!?;:,]$/.test(t.trim());

  function parse(html, teams) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    const blocks = [...tpl.content.querySelectorAll('h1,h2,h3,h4,h5,p,li,blockquote')]
      .filter(el => !el.querySelector('p,li,h1,h2,h3,h4,h5'))
      .map(el => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const keys = teamKeys(teams), notes = new Map();
    let current = null;
    for (const text of blocks) {
      if (looksHeading(text)) {
        const id = keys.get(norm(headingText(text)));
        if (id !== undefined) { current = id; if (!notes.has(id)) notes.set(id, []); continue; }
        if (words(text).length <= 6) { current = null; continue; }
      }
      if (current !== null) notes.get(current).push(text);
    }
    for (const [id, list] of notes) if (!list.length) notes.delete(id);
    return notes;
  }

  function articleFor(scope) {
    const list = typeof articles === 'undefined' || !Array.isArray(articles) ? [] : articles;
    const isRanking = a => /power\s*-?\s*rank/i.test((a.title || '') + ' ' + (a.summary || ''));
    const sport = a => norm(a.category);
    const match = scope === 'nfl'
      ? a => sport(a) === 'nfl'
      : a => sport(a) === 'futbol' && /champions|\bucl\b/i.test((a.title || '') + ' ' + (a.summary || ''));
    return list.filter(a => a && a.remote !== false && a.body && isRanking(a) && match(a))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null;
  }

  const cache = new Map();
  function notesFor(scope) {
    const items = [...document.querySelectorAll(`[data-rank-sport="${scope}"]`)];
    const teams = [...new Map(items.map(li => [li.dataset.teamId, {id: li.dataset.teamId, name: li.dataset.teamName}])).values()];
    const article = articleFor(scope);
    if (!article || !teams.length) return {article: null, notes: new Map()};
    const key = scope + '|' + article.id + '|' + article.body.length + '|' + teams.map(t => t.id).join(',');
    if (!cache.has(key)) cache.set(key, parse(article.body, teams));
    return {article, notes: cache.get(key)};
  }

  // Lectores de pantalla: la explicación también queda dentro de la lista accesible.
  function decorate() {
    for (const [scope, cfg] of Object.entries(SCOPES)) {
      const {notes} = notesFor(scope);
      document.querySelectorAll(cfg.staticList + ' > li[data-rank-sport]').forEach(li => {
        li.querySelector('.ae-rank-note-sr')?.remove();
        const text = notes.get(li.dataset.teamId);
        if (text) { const p = document.createElement('p'); p.className = 'ae-rank-note-sr'; p.textContent = text.join(' '); li.append(p); }
      });
      // El número uno destacado es enfocable para abrir su explicación con el teclado.
      document.querySelectorAll(cfg.lists[1] + ' > li[data-rank-sport]').forEach(li => {
        li.tabIndex = 0; li.setAttribute('aria-haspopup', 'dialog');
        li.setAttribute('aria-label', 'N.º ' + li.dataset.rank + ', ' + li.dataset.teamName + '. Ver por qué está en esta posición');
      });
    }
  }

  let card = null, anchor = null, pinned = false, hideTimer = 0, showTimer = 0;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function build(li) {
    const scope = li.dataset.rankSport, cfg = SCOPES[scope];
    const {article, notes} = notesFor(scope);
    const text = notes.get(li.dataset.teamId);
    const box = el('div', 'ae-rank-note');
    box.id = 'aeRankNote'; box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Por qué ' + li.dataset.teamName + ' está en el puesto ' + li.dataset.rank);
    const head = el('div', 'ae-rank-note-head');
    const logo = el('span', 'ae-rank-note-logo');
    const src = li.querySelector('.ae-team-emblem img')?.getAttribute('src');
    logo.append(el('span', 'ae-rank-note-initials', li.querySelector('.ae-logo-initials')?.textContent || ''));
    if (src) { const img = el('img'); img.src = src; img.alt = ''; img.width = 56; img.height = 56; img.decoding = 'async';
      img.onload = () => logo.classList.add('is-loaded'); img.onerror = () => img.remove(); logo.append(img); }
    const titles = el('div', 'ae-rank-note-titles');
    titles.append(el('strong', 'ae-rank-note-name', li.dataset.teamName));
    const meta = el('span', 'ae-rank-note-meta', 'N.º ' + li.dataset.rank + ' · ' + cfg.label + (li.dataset.edition ? ' · ' + li.dataset.edition : ''));
    const trend = li.querySelector('.ae-rank-trend');
    if (trend && trend.textContent.trim() && trend.textContent.trim() !== '–') {
      const t = el('span', trend.className + ' ae-rank-note-trend', trend.textContent.trim()); t.setAttribute('aria-label', trend.getAttribute('aria-label') || ''); meta.append(' ', t);
    }
    titles.append(meta);
    head.append(logo, titles);
    const body = el('div', 'ae-rank-note-body');
    if (text) text.forEach(p => body.append(el('p', null, p)));
    else body.append(el('p', 'ae-rank-note-empty', article
      ? 'La última publicación de Power Rankings aún no explica esta posición.'
      : 'El análisis de esta posición llegará con la próxima publicación de Power Rankings.'));
    box.append(head, body);
    if (article && text && typeof openArticleModal === 'function') {
      const read = el('button', 'ae-rank-note-read', 'Leer la publicación completa');
      read.type = 'button';
      read.addEventListener('click', () => { const id = article.id; hide(true); openArticleModal(id); });
      box.append(read);
    }
    box.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    box.addEventListener('pointerleave', e => { if (!pinned && e.pointerType === 'mouse') scheduleHide(); });
    return box;
  }

  function place() {
    if (!card || !anchor) return;
    const r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight, gap = 10, m = 12;
    const width = Math.min(380, vw - m * 2);
    card.style.width = width + 'px';
    const h = card.offsetHeight;
    const left = Math.max(m, Math.min(vw - width - m, r.left + r.width / 2 - width / 2));
    const below = r.bottom + gap + h <= vh - m || r.top - gap - h < m;
    card.style.left = left + 'px';
    card.style.top = Math.max(m, below ? Math.min(r.bottom + gap, vh - h - m) : r.top - gap - h) + 'px';
    card.dataset.side = below ? 'below' : 'above';
  }
  function holdTrack(on) {
    document.querySelectorAll('#rankingTrack, #championsTrack').forEach(t => t.classList.toggle('ae-note-hold', on));
  }
  function show(li, pin) {
    clearTimeout(hideTimer); clearTimeout(showTimer);
    if (anchor === li && card) { pinned = pinned || pin; return; }
    hide(true);
    anchor = li; pinned = pin;
    card = build(li); document.body.append(card);
    li.classList.add('ae-rank-note-anchor'); li.setAttribute('aria-expanded', 'true');
    holdTrack(true); place();
    requestAnimationFrame(() => card?.classList.add('is-open'));
  }
  function hide(now) {
    clearTimeout(showTimer); clearTimeout(hideTimer);
    if (!card) return;
    anchor?.classList.remove('ae-rank-note-anchor'); anchor?.setAttribute('aria-expanded', 'false');
    card.remove(); card = null; anchor = null; pinned = false; holdTrack(false);
  }
  const scheduleHide = () => { clearTimeout(hideTimer); hideTimer = setTimeout(() => hide(true), 220); };
  const teamFrom = target => {
    const li = target?.closest?.('li[data-rank-sport]');
    if (!li) return null;
    const cfg = SCOPES[li.dataset.rankSport];
    return cfg && li.closest(cfg.section) && cfg.lists.some(sel => li.closest(sel)) ? li : null;
  };

  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const li = teamFrom(e.target);
    if (!li) return;
    clearTimeout(hideTimer);
    if (pinned && anchor !== li) return;
    clearTimeout(showTimer); showTimer = setTimeout(() => show(li, false), anchor ? 0 : 140);
  });
  document.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse' || pinned) return;
    const li = teamFrom(e.target);
    if (!li || li.contains(e.relatedTarget)) return;
    clearTimeout(showTimer);
    if (!card?.contains(e.relatedTarget)) scheduleHide();
  });
  // Tocar (o hacer clic) fija la tarjeta; tocar fuera la cierra.
  document.addEventListener('click', e => {
    if (card?.contains(e.target)) return;
    const li = teamFrom(e.target);
    if (li) { if (anchor === li && pinned) hide(true); else show(li, true); return; }
    if (card) hide(true);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && card) { const a = anchor; hide(true); a?.focus?.(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('li[data-rank-sport][tabindex]')) { e.preventDefault(); show(e.target, true); }
  });
  window.addEventListener('resize', () => place());
  window.addEventListener('scroll', () => { if (card && !pinned) hide(true); else place(); }, {passive: true});

  window.aeRankingNotes = {refresh() { cache.clear(); decorate(); if (anchor && card) { const a = anchor, p = pinned; hide(true); if (document.body.contains(a)) show(a, p); } }, decorate, parse, notesFor};
  document.addEventListener('DOMContentLoaded', decorate);
})();
