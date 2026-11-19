/* CAM SPORTS · Publicar «NFL · Power Rankings» en 10 cajas (18 nov 2026).
 * Pedido de Eduard: al tocar un equipo de los Power Rankings no salía el texto de la
 * publicación porque no se conectaba. En «Publicar», la categoría «NFL · Power Rankings»
 * cambia el editor por diez cajas, del 1 al 10, con el equipo puesto solo desde el ranking
 * publicado; en cada caja se escribe por qué está ahí. Se publica como una noticia de NFL
 * y cada equipo queda marcado (data-cam-rank-team) para que ae-ranking-notes.js lo conecte
 * sin adivinar nombres. Solo se carga para administradores (cam-admin-news-editor-loader.js).
 * Si este archivo no carga, el formulario de siempre sigue igual.
 */
(() => {
  'use strict';
  const select = document.getElementById('pubCategory');
  const source = document.getElementById('pubBody');
  const form = select?.form;
  if (!select || !source || !form || window.camPowerRankingsPublish) return;

  const OPTION = 'NFL · Power Rankings';
  const SIZE = 10;
  const teamsList = () => (typeof NFL_TEAMS !== 'undefined' && Array.isArray(NFL_TEAMS) ? NFL_TEAMS : []);
  const teamOf = id => teamsList().find(t => t.id === id) || null;
  const admin = () => { try { return typeof currentAdmin !== 'undefined' ? currentAdmin : null; } catch { return null; } };
  const client = () => { try { return typeof db !== 'undefined' ? db : window.db; } catch { return null; } };
  const published = () => { try { return typeof rankingPublished !== 'undefined' ? rankingPublished : null; } catch { return null; } };
  const storeKey = () => 'cam:pr-publish:nfl:' + (admin()?.id || 'anon');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const escapeText = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const validIds = ids => Array.isArray(ids) && ids.length === SIZE && ids.every(id => teamOf(id)) && new Set(ids).size === SIZE;

  // La opción va justo después de «NFL».
  const option = new Option(OPTION, OPTION);
  const nfl = [...select.options].find(o => o.value === 'NFL');
  if (nfl) nfl.after(option); else select.append(option);

  // ---------------------------------------------------------------- Las 10 cajas
  const bodyBlock = source.parentElement;
  const originalRequired = () => !window.aeNewsEditor && source.hasAttribute('data-cam-required');
  if (source.required) source.setAttribute('data-cam-required', '');
  const panel = el('section', 'cam-prp');
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'camPrpTitle');
  const head = el('header', 'cam-prp-head');
  const title = el('h3', null, 'Power Rankings NFL · del 1 al 10'); title.id = 'camPrpTitle';
  const sub = el('p', 'cam-prp-sub');
  const useDraft = el('button', 'cam-prp-use'); useDraft.type = 'button'; useDraft.hidden = true;
  head.append(title, sub, useDraft);
  const list = el('ol', 'cam-prp-list');
  const foot = el('p', 'cam-prp-foot');
  const count = el('span', 'cam-prp-count');
  const saved = el('span', 'cam-prp-saved');
  saved.setAttribute('role', 'status'); saved.setAttribute('aria-live', 'polite');
  foot.append(count, saved);
  panel.append(head, list, foot);
  bodyBlock.before(panel);

  let boxes = Array.from({length: SIZE}, () => ({team: '', text: ''}));
  let filled = false, editing = false, draftOrder = null;

  function store() {
    if (editing) return;
    try { localStorage.setItem(storeKey(), JSON.stringify({boxes, at: Date.now()})); } catch {}
    saved.textContent = 'Borrador guardado en este aparato';
  }
  function restore() {
    try {
      const raw = JSON.parse(localStorage.getItem(storeKey()) || 'null');
      if (raw && Array.isArray(raw.boxes) && raw.boxes.length === SIZE && raw.boxes.some(b => String(b?.text || '').trim()))
        return raw.boxes.map(b => ({team: teamOf(b?.team) ? b.team : '', text: String(b?.text || '')}));
    } catch {}
    return null;
  }
  // El texto sigue a su equipo cuando cambia el orden.
  function setOrder(ids) {
    const byTeam = new Map(boxes.filter(b => b.team && b.text.trim()).map(b => [b.team, b.text]));
    boxes = ids.map(id => ({team: id, text: byTeam.get(id) || ''}));
  }

  function paintBox(i) {
    const b = boxes[i], li = list.children[i];
    li.classList.toggle('has-text', !!b.text.trim());
    const logo = li.querySelector('.cam-prp-logo'), team = teamOf(b.team);
    // Sin logo, el hueco se conserva (la columna del equipo no se mueve).
    if (team?.logo) { logo.src = team.logo; logo.alt = ''; logo.classList.remove('is-empty'); } else { logo.removeAttribute('src'); logo.classList.add('is-empty'); }
    const choose = li.querySelector('select');
    for (const o of choose.options) o.disabled = !!o.value && o.value !== b.team && boxes.some(x => x.team === o.value);
    choose.value = b.team;
  }
  function paintCount() {
    const n = boxes.filter(b => b.text.trim()).length;
    count.textContent = n + ' de ' + SIZE + ' con texto';
  }
  function paint() {
    list.replaceChildren();
    boxes.forEach((b, i) => {
      const li = el('li', 'cam-prp-box');
      const row = el('div', 'cam-prp-box-head');
      const num = el('span', 'cam-prp-num', String(i + 1)); num.setAttribute('aria-hidden', 'true');
      const logo = el('img', 'cam-prp-logo'); logo.width = 28; logo.height = 28; logo.decoding = 'async';
      logo.addEventListener('error', () => logo.classList.add('is-empty'));
      const choose = el('select', 'cam-prp-team'); choose.setAttribute('aria-label', 'Equipo en el puesto ' + (i + 1));
      choose.append(new Option('Elige el equipo', ''));
      for (const t of teamsList()) choose.append(new Option(t.name, t.id));
      choose.addEventListener('change', () => { boxes[i].team = choose.value; boxes.forEach((_, k) => paintBox(k)); store(); });
      row.append(num, logo, choose);
      const text = el('textarea', 'cam-prp-text');
      text.rows = 4; text.value = b.text;
      text.setAttribute('aria-label', 'Por qué está en el puesto ' + (i + 1));
      text.placeholder = '¿Por qué está en el puesto ' + (i + 1) + '? Este texto sale al tocar el equipo en la web.';
      text.addEventListener('input', () => { boxes[i].text = text.value; li.classList.toggle('has-text', !!text.value.trim()); paintCount(); store(); });
      li.append(row, text);
      list.append(li);
    });
    boxes.forEach((_, i) => paintBox(i));
    paintCount();
  }

  async function fill() {
    filled = true;
    const local = restore();
    let ranking = published();
    const c = client();
    if (!validIds(ranking?.team_ids) && c) {
      try { const r = await c.from('nfl_rankings').select('edition,team_ids').eq('id', 1).maybeSingle(); if (!r.error) ranking = r.data; } catch {}
    }
    if (local) {
      boxes = local;
      sub.textContent = 'Recuperamos el borrador que dejaste en este aparato. Cada caja ya lleva su equipo: escribe por qué está ahí.';
    } else if (validIds(ranking?.team_ids)) {
      boxes = ranking.team_ids.map(id => ({team: id, text: ''}));
      sub.textContent = 'Los equipos salen del ranking publicado' + (ranking.edition ? ' (' + ranking.edition + ')' : '') +
        '. Escribe por qué está cada uno; si cambió el orden, elige el equipo en su caja.';
    } else {
      sub.textContent = 'Todavía no hay un ranking publicado: elige el equipo de cada puesto y escribe por qué está ahí.';
    }
    // Si el ranking nuevo está en tu borrador (Editar ranking) y aún no se publica, se puede usar.
    draftOrder = null; useDraft.hidden = true;
    const me = admin();
    if (c && me?.id) {
      try {
        const r = await c.from('nfl_ranking_drafts').select('edition,team_ids').eq('user_id', me.id).maybeSingle();
        const ids = r.data?.team_ids;
        if (!r.error && validIds(ids) && ids.join() !== boxes.map(b => b.team).join()) {
          draftOrder = ids;
          useDraft.textContent = 'Usar el orden de mi borrador de ranking' + (r.data.edition ? ' (' + r.data.edition + ')' : '');
          useDraft.hidden = false;
        }
      } catch {}
    }
    if (active()) paint();
  }
  useDraft.addEventListener('click', () => {
    if (!draftOrder) return;
    setOrder(draftOrder); useDraft.hidden = true;
    sub.textContent = 'Orden de tu borrador de ranking. Los textos que ya escribiste siguen con su equipo.';
    paint(); store();
  });

  const active = () => select.value === OPTION;
  function setMode() {
    const on = active();
    panel.hidden = !on;
    bodyBlock.hidden = on;
    bodyBlock.style.display = on ? 'none' : '';
    source.required = on ? false : originalRequired();
    if (on) {
      const titleInput = document.getElementById('pubTitle');
      if (titleInput && !titleInput.value.trim()) titleInput.value = 'Power Rankings NFL';
      paint();
      if (!filled) void fill();
    }
  }
  select.addEventListener('change', setMode);

  // Editar una publicación hecha con las cajas: vuelven las cajas con su texto.
  function fromArticle(article) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(article?.body || '');
    const marks = [...tpl.content.querySelectorAll('[data-cam-rank-team]')];
    if (!marks.length) return null;
    const out = Array.from({length: SIZE}, () => ({team: '', text: ''}));
    marks.forEach((mark, k) => {
      const at = Number(mark.getAttribute('data-cam-rank')) - 1;
      const i = Number.isInteger(at) && at >= 0 && at < SIZE ? at : k;
      if (i >= SIZE) return;
      const lines = [];
      for (let n = mark.nextElementSibling; n && !n.hasAttribute('data-cam-rank-team'); n = n.nextElementSibling) {
        const t = n.textContent.trim(); if (t) lines.push(t);
      }
      out[i] = {team: teamOf(mark.getAttribute('data-cam-rank-team')) ? mark.getAttribute('data-cam-rank-team') : '', text: lines.join('\n\n')};
    });
    return out;
  }
  function sync(article) {
    const from = article ? fromArticle(article) : null;
    if (from) {
      editing = true; filled = true; boxes = from; draftOrder = null; useDraft.hidden = true;
      select.value = OPTION;
      sub.textContent = 'Estás editando esta publicación. Cada caja conserva su equipo y su texto.';
      saved.textContent = '';
    } else {
      // Después de editar una publicación, una nueva empieza de cero (o con su propio borrador).
      if (editing) { editing = false; filled = false; boxes = Array.from({length: SIZE}, () => ({team: '', text: ''})); }
      if (article && active()) select.value = 'NFL';
    }
    setMode();
  }

  // Lo que se publica: una noticia de NFL con un subtítulo por equipo y sus párrafos.
  function collect() {
    const used = boxes.filter(b => b.team);
    if (used.length !== SIZE) throw new Error('Elige el equipo de las ' + SIZE + ' cajas antes de publicar.');
    if (new Set(used.map(b => b.team)).size !== SIZE) throw new Error('Hay un equipo repetido en las cajas: cada puesto lleva un equipo distinto.');
    if (!boxes.some(b => b.text.trim())) throw new Error('Escribe el texto de al menos un equipo.');
    const html = [], text = [];
    boxes.forEach((b, i) => {
      const paragraphs = b.text.split(/\n+/).map(s => s.trim()).filter(Boolean);
      if (!paragraphs.length) return;
      const name = teamOf(b.team).name;
      html.push('<h3 data-cam-rank-team="' + escapeText(b.team) + '" data-cam-rank="' + (i + 1) + '">' + (i + 1) + '. ' + escapeText(name) + '</h3>');
      paragraphs.forEach(p => html.push('<p>' + escapeText(p) + '</p>'));
      text.push((i + 1) + '. ' + name, ...paragraphs);
    });
    return {category: 'NFL', html: html.join(''), text: text.join('\n')};
  }

  // Publicado con éxito (el formulario se reinicia): se borra el borrador del aparato.
  form.addEventListener('reset', () => setTimeout(() => {
    if (!editing) { try { localStorage.removeItem(storeKey()); } catch {} }
    boxes = Array.from({length: SIZE}, () => ({team: '', text: ''}));
    filled = false; editing = false; saved.textContent = '';
    setMode();
  }, 0));

  window.camPowerRankingsPublish = Object.freeze({OPTION, active, collect, sync});
})();
