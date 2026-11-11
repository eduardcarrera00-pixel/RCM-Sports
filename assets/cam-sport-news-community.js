/* Sport-specific conversations below NFL/Fútbol news. Public reads reuse the
   existing comment totals and Take RPCs; votes keep their original records. */
(() => {
  'use strict';
  const root = document.getElementById('camSportNewsCommunity');
  if (!root) return;
  const sports = {
    nfl: { category: 'NFL', takes: ['nfl'] },
    futbol: { category: 'Fútbol', takes: ['football', 'laliga', 'premier', 'ligamx', 'champions'] }
  };
  const cache = new Map(), pending = new Set();
  const client = () => typeof db !== 'undefined' ? db : window.db;
  const sportNow = () => document.body.classList.contains('ae-is-nfl') ? 'nfl'
    : document.body.classList.contains('ae-is-football') ? 'futbol' : '';
  const active = () => sportNow() && (!document.body.dataset.camTabs || document.body.dataset.camTab === 'noticias');
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = String(text);
    if (cls) n.className = cls;
    return n;
  };
  const chunks = (rows, size) => Array.from({length: Math.ceil(rows.length / size)}, (_, i) => rows.slice(i * size, (i + 1) * size));
  const latest = (a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) || String(b.id).localeCompare(String(a.id));
  async function dataOf(query) {
    const result = await query;
    if (result.error) throw result.error;
    return result.data || [];
  }
  async function leaders(sport) {
    const reader = typeof publicArticlesDb !== 'undefined' ? publicArticlesDb : client();
    const ids = [];
    for (let offset = 0; ; offset += 200) {
      const rows = await dataOf(reader.from('articles').select('id').eq('is_public', true)
        .eq('category', sports[sport].category).order('id').range(offset, offset + 199));
      ids.push(...rows.map(row => String(row.id)));
      if (rows.length < 200) break;
    }
    const top = async column => {
      // Filter by this sport before taking the top results, including when its
      // comments would fall outside the global top ten.
      const groups = await Promise.all(chunks(ids, 50).map(part => dataOf(client().from('rcm_comment_totals')
        .select('id,article_id,author,body,created_at,article_title,upvotes,downvotes,my_vote')
        .in('article_id', part).gt(column, 0).order(column, {ascending: false})
        .order('created_at', {ascending: false}).order('id', {ascending: false}).limit(3))));
      return groups.flat().sort((a, b) => Number(b[column]) - Number(a[column]) || latest(a, b)).slice(0, 3);
    };
    const [supported, questioned] = await Promise.all([top('upvotes'), top('downvotes')]);
    const commentIds = [...new Set([...supported, ...questioned].map(row => row.id))];
    // Public author IDs preserve profile links without matching people by name.
    if (commentIds.length) {
      const authors = await dataOf(client().from('comments').select('id,user_id').in('id', commentIds));
      const byId = new Map(authors.map(row => [String(row.id), row.user_id]));
      for (const row of [...supported, ...questioned]) row.author_id = byId.get(String(row.id));
    }
    return {supported, questioned};
  }
  async function debates(sport) {
    const groups = await Promise.all(sports[sport].takes.map(key => dataOf(client().rpc('ae_public_take_feed', {p_sport: key}))));
    const rows = [...new Map(groups.flat().filter(t => t?.id && sports[sport].takes.includes(t.sport))
      .map(t => [String(t.id), t])).values()];
    const replies = new Map();
    await Promise.all(chunks(rows, 30).map(async group => {
      const counts = await dataOf(client().rpc('ae_public_take_reply_counts', {p_take_ids: group.map(t => t.id)}));
      for (const row of counts) replies.set(String(row.take_id), Math.max(0, Number(row.reply_count) || 0));
    }));
    return rows.filter(t => replies.get(String(t.id)) > 0).sort((a, b) =>
      replies.get(String(b.id)) - replies.get(String(a.id)) ||
      (Number(b.upvotes) + Number(b.downvotes)) - (Number(a.upvotes) + Number(a.downvotes)) || latest(a, b))
      .slice(0, 3).map(row => ({...row, reply_count: replies.get(String(row.id))}));
  }
  function message(target, text, retry) {
    target.append(el('p', text, 'cam-snc-empty'));
    if (retry) {
      const button = el('button', 'Volver a intentar', 'cam-snc-more'); button.type = 'button';
      button.onclick = () => refresh(true);
      target.append(button);
    }
  }
  async function vote(row, type, direction) {
    const viewer = typeof currentUser !== 'undefined' ? currentUser : null;
    if (!viewer) { window.openUserAuthModal?.(); return; }
    if (type === 'take' && String(viewer.id) === String(row.author_id)) return;
    const key = type + ':' + row.id;
    if (pending.has(key)) return;
    pending.add(key); render();
    try {
      const r = type === 'take'
        ? await client().rpc('ae_vote_free_take', {p_take_id: row.id, p_value: direction})
        : await client().rpc('rcm_set_comment_vote', {p_comment_id: String(row.id), p_vote: Number(row.my_vote) === direction ? 0 : direction});
      if (r.error) throw r.error;
      // Other sport caches may include this user's old vote state.
      for (const state of cache.values()) state.time = 0;
      if (type === 'take') document.dispatchEvent(new Event('ae:takes-updated'));
      else void refreshCommunity();
      await refresh(true);
    } catch {
      const notice = document.getElementById('camSportCommunityStatus');
      notice.textContent = 'No pudimos confirmar el voto. Vuelve a intentarlo.';
    } finally { pending.delete(key); render(); }
  }
  function card(row, type, rank) {
    const item = el('article', null, 'cam-snc-card cam-snc-' + type);
    item.dataset.recordId = row.id;
    const open = () => {
      if (type === 'take') { window.aeTakeReplies?.open(row); return; }
      history.pushState({}, '', articleURL(row.article_id, row.id));
      void openArticleFromShareLink();
    };
    const content = el('div', null, 'cam-snc-content');
    content.append(el('div', sports[sportNow()].category, 'cam-snc-category'));
    const head = el(type === 'take' ? 'h3' : 'p', null, type === 'take' ? 'cam-snc-title' : 'cam-snc-context');
    const title = el(type === 'take' ? 'button' : 'a', type === 'take' ? row.title : 'En ' + (row.article_title || 'Ver artículo'), 'cam-snc-open');
    if (type === 'comment') title.href = articleURL(row.article_id, row.id);
    else title.type = 'button';
    title.onclick = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); open();
    };
    if (type === 'comment') {
      const arrow = el('i', null, 'cam-snc-context-arrow fa-solid fa-arrow-up-right-from-square');
      arrow.setAttribute('aria-hidden', 'true'); title.append(arrow);
      if (row.body) content.append(el('blockquote', row.body, 'cam-snc-excerpt'));
    }
    head.append(title); content.append(head);
    if (rank) {
      const position = el('span', rank, 'cam-snc-rank');
      position.setAttribute('aria-label', 'Posición ' + rank); item.append(position);
    }
    const author = el(row.author_id ? 'button' : 'span', (type === 'take' ? '@' : '') + (row.author || 'Aficionado').replace(/^@+/, ''), 'cam-snc-author');
    if (row.author_id) { author.type = 'button'; author.dataset.camAuthorId = String(row.author_id); author.onclick = () => window.openAePublicProfile?.(row.author_id); }
    content.append(author); item.append(content);
    const actions = el('div', null, 'cam-snc-actions');
    const votes = el('div', null, 'cam-snc-votes');
    const up = Math.max(0, Number(row.upvotes) || 0), down = Math.max(0, Number(row.downvotes) || 0);
    const meter = el('span', null, 'cam-snc-meter');
    meter.setAttribute('role', 'img'); meter.setAttribute('aria-label', up + ' a favor y ' + down + ' en contra');
    const share = el('span'); share.style.width = (up + down ? up / (up + down) * 100 : 50) + '%';
    meter.append(share);
    for (const direction of [1, -1]) {
      const count = direction === 1 ? up : down;
      const button = el('button');
      const glyph = el('span', direction === 1 ? '▲' : '▼', 'cam-snc-vote-glyph');
      glyph.setAttribute('aria-hidden', 'true'); button.append(glyph, el('strong', count));
      button.type = 'button'; button.dataset.direction = direction;
      button.setAttribute('aria-label', (direction === 1 ? 'Votar a favor: ' : 'Votar en contra: ') + count);
      button.setAttribute('aria-pressed', String(Number(row.my_vote) === direction));
      button.disabled = pending.has(type + ':' + row.id);
      button.onclick = () => vote(row, type, direction);
      votes.append(button);
      if (direction === 1) votes.append(meter);
    }
    const reply = el('button', null, 'cam-snc-reply');
    const bubble = el('i', null, 'fa-regular fa-comment'); bubble.setAttribute('aria-hidden', 'true');
    reply.append(bubble, el('span', type === 'take' ? row.reply_count + (row.reply_count === 1 ? ' respuesta' : ' respuestas') : 'Responder'));
    if (type === 'comment') reply.setAttribute('aria-label', 'Responder al comentario de ' + (row.author || 'Aficionado'));
    reply.type = 'button'; reply.onclick = open;
    actions.append(votes, reply); item.append(actions);
    return item;
  }
  function render() {
    const sport = sportNow(), state = cache.get(sport);
    if (!sport || !state) return;
    const debated = document.getElementById('camSportDebatedList');
    const distinguished = document.getElementById('camSportLeadersList');
    debated.replaceChildren(); distinguished.replaceChildren();
    document.getElementById('camSportDebatedTitle').textContent='Lo más debatido · '+sports[sport].category;
    document.getElementById('camSportLeadersTitle').textContent='Opinadores distinguidos · '+sports[sport].category;
    for (const [kind, target] of [['debates', debated], ['leaders', distinguished]]) {
      target.setAttribute('aria-busy', String(Boolean(state.loading && !state[kind])));
      if (state.errors[kind]) message(target, 'No pudimos cargar ' + (kind === 'debates' ? 'los debates.' : 'los opinadores.'), true);
      if (!state[kind]) {
        if (!state.errors[kind]) message(target, 'Cargando…');
        continue;
      }
      if (kind === 'debates') {
        if (!state.debates.length) message(target, 'Aún no hay debates con respuestas en ' + sports[sport].category + '.');
        state.debates.forEach((row, i) => target.append(card(row, 'take', i + 1)));
      } else {
        for (const [key, label] of [['supported', 'Más apoyados'], ['questioned', 'Más cuestionados']]) {
          const group = el('section', null, 'cam-snc-leaders-group is-' + key);
          group.append(el('h3', (key === 'supported' ? '▲ ' : '▼ ') + label, 'cam-snc-group-title'));
          const rows = state.leaders[key];
          if (!rows.length) message(group, 'Todavía no hay comentarios con estos votos.');
          rows.forEach((row, i) => {
            const entry = card(row, 'comment'); entry.hidden = i > 0;
            group.append(entry);
          });
          if (rows.length > 1) {
            const more = el('button', 'Ver más', 'cam-snc-more'); more.type = 'button';
            more.setAttribute('aria-expanded', 'false');
            more.onclick = () => {
              const expanded = more.getAttribute('aria-expanded') !== 'true';
              more.setAttribute('aria-expanded', String(expanded)); more.textContent = expanded ? 'Ver menos' : 'Ver más';
              [...group.querySelectorAll('.cam-snc-card')].forEach((n, i) => { n.hidden = i > 0 && !expanded; });
            };
            group.append(more);
          }
          target.append(group);
        }
      }
    }
  }
  async function refresh(force = false) {
    const sport = sportNow();
    root.hidden = !sport;
    if (!sport || !active()) return;
    root.dataset.sport = sport;
    let state = cache.get(sport);
    if (!state) { state = {time: 0, errors: {}}; cache.set(sport, state); }
    if (state.loading) { render(); return state.loading; }
    if (!force && Date.now() - state.time < 60000) { render(); return; }
    if (!client()) { state.errors = {debates: true, leaders: true}; render(); return; }
    state.errors = {};
    state.loading = Promise.allSettled([debates(sport), leaders(sport)]).then(results => {
      ['debates', 'leaders'].forEach((kind, i) => {
        if (results[i].status === 'fulfilled') state[kind] = results[i].value;
        else state.errors[kind] = true;
      });
      state.time = Date.now();
    }).finally(() => { state.loading = null; if (sportNow() === sport) render(); });
    render();
    return state.loading;
  }
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; void refresh(); });
  };
  new MutationObserver(schedule).observe(document.body, {attributes: true, attributeFilter: ['class', 'data-cam-tab', 'data-cam-tabs']});
  document.addEventListener('ae:takes-updated', () => { for (const state of cache.values()) state.time = 0; schedule(); });
  document.addEventListener('cam:community-updated', () => { for (const state of cache.values()) state.time = 0; schedule(); });
  // Invalidate personalized vote state after signing in or out. Avoid requests
  // inside the Supabase auth callback while its session lock is held.
  client()?.auth?.onAuthStateChange?.(event => {
    if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) { cache.clear(); schedule(); }
  });
  window.camSportNewsCommunity = Object.freeze({refresh});
  schedule();
})();
