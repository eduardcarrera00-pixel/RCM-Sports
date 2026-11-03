/* CAM SPORTS · Pestaña «Perfil» del perfil (3 nov 2026).
   Tres tarjetas pequeñas: Takes, Picks y Quiniela. Cada una con su cabecera
   (nombre y una o dos cifras), un solo elemento destacado y «Ver todo ›».
   Solo pinta: los datos llegan de cam_profile_overview (una llamada, en
   ae-profile.js). Sin llamadas, bucles ni temporizadores propios. */
(() => {
'use strict';

const LEAGUES = {
  laliga: 'LaLiga', premier: 'Premier League', ligamx: 'Liga MX', champions: 'Champions League',
  nfl: 'NFL', football: 'Fútbol', colegial: 'Colegial', general: 'Deportes'
};
const el = (tag, text, cls, attrs) => {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null && text !== '') n.textContent = String(text);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, String(v));
  return n;
};
const button = (text, cls, onClick, attrs) => {
  const b = el('button', text, cls, attrs);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
};
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pct = (a, b) => (a + b) ? Math.round(a / (a + b) * 100) + ' %' : '';
const place = (pos, of) => pos ? pos + '.º de ' + (of || pos) : '';
function shortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const opts = {day: 'numeric', month: 'short'};
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('es', opts).replace('.', '');
}
function league(take) {
  const raw = String(take?.competition || '').trim();
  if (raw && !LEAGUES[raw]) return raw;
  return LEAGUES[raw] || LEAGUES[take?.sport] || 'Deportes';
}
function odds(v) {
  const n = Number(v);
  return Number.isFinite(n) && n ? (n > 0 ? '+' : '') + n : '';
}
function pickPoints(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || !n) return '';
  return (n > 0 ? '+' : '−') + Math.abs(n).toFixed(2).replace('.', ',') + ' pts';
}

/* Ir a la quiniela de un deporte (?s=nfl&v=quiniela): cierra el perfil y
   abre la sección; en el teléfono, su pestaña Quiniela. */
function goQuiniela(sport) {
  const football = sport === 'football';
  try { window.closeAeProfile?.(); } catch {}
  try { document.getElementById('camParty')?.open && document.getElementById('camParty').close(); } catch {}
  if (typeof window.filterByCategory === 'function') window.filterByCategory(football ? 'Fútbol' : 'NFL');
  window.camSectionTabs?.select?.('quiniela');
  const root = document.getElementById(football ? 'camFootballQuiniela' : 'camNflQuiniela');
  requestAnimationFrame(() => { try { root?.scrollIntoView({block: 'start'}); } catch {} });
}
window.camGoQuiniela = goQuiniela;

/* ---------- tarjetas ---------- */
function shell(kind, name, figures, onMore) {
  const card = el('section', null, 'cam-ov-card', {'data-kind': kind, 'aria-label': name});
  const head = el('header', null, 'cam-ov-head');
  head.append(el('h3', name, 'cam-ov-name'));
  const shown = figures.filter(Boolean);
  if (shown.length) {
    const f = el('p', null, 'cam-ov-figures');
    shown.forEach((text, i) => { if (i) f.append(el('span', '·', 'cam-ov-dot', {'aria-hidden': 'true'})); f.append(el('span', text)); });
    head.append(f);
  }
  card.append(head);
  if (onMore) card.moreAction = onMore;
  return card;
}
function more(card, label) {
  const b = button('Ver todo ›', 'cam-ov-more', card.moreAction, {'aria-label': 'Ver todo: ' + label});
  card.append(b);
  return card;
}
function emptyCard(kind, name, action, onAction) {
  const card = el('section', null, 'cam-ov-card is-empty', {'data-kind': kind, 'aria-label': name});
  const head = el('header', null, 'cam-ov-head');
  head.append(el('h3', name, 'cam-ov-name'), button(action, 'cam-ov-cta', onAction));
  card.append(head);
  return card;
}

function takesCard(data, ctx) {
  const t = data.takes || {};
  const top = t.top;
  const count = num(t.count);
  if (!top && !count) return ctx.own ? emptyCard('takes', 'Takes', 'Publicar mi Take ›', ctx.newTake) : null;
  const support = pct(num(t.up), num(t.down));
  const card = shell('takes', 'Takes', [String(count), support && support + ' apoyo'], () => ctx.tab('takes'));
  if (top) {
    const best = top.kind === 'best';
    const item = button('', 'cam-ov-item', () => top.type === 'champion' ? ctx.tab('takes') : ctx.openTake(top),
      {'aria-label': (best ? 'Mejor Take: ' : 'Take más apoyado: ') + (top.title || 'Take')});
    const row = el('span', null, 'cam-ov-item-top');
    row.append(el('span', best ? 'Mejor Take' : 'Take más apoyado', 'cam-ov-label'), el('span', league(top), 'cam-ov-tag'));
    item.append(row, el('strong', top.title || 'Take', 'cam-ov-title'));
    const meta = el('span', null, 'cam-ov-meta');
    if (best) meta.append(el('span', '+' + num(top.points) + ' pts', 'cam-ov-medal'));
    else meta.append(el('span', '▲ ' + num(top.net), 'cam-ov-net'));
    const day = shortDate(top.created_at);
    if (day) meta.append(el('span', day, 'cam-ov-date'));
    item.append(meta);
    card.append(item);
  }
  return more(card, 'Takes');
}

function picksCard(data, ctx) {
  const p = data.picks || {};
  const top = p.top;
  const count = num(p.count);
  if (!top && !count) return ctx.own ? emptyCard('picks', 'Picks', 'Prepara tu Pick ›', ctx.newPick) : null;
  const hits = pct(num(p.won), num(p.lost));
  const card = shell('picks', 'Picks', [String(count), hits && hits + ' acierto'], () => ctx.tab('picks'));
  if (top) {
    const best = top.kind === 'best';
    const legs = Array.isArray(top.legs) ? top.legs : [];
    const first = legs[0] || {};
    const match = String(first.event || top.title || 'Pick').trim();
    const extra = legs.length - 1;
    const choice = typeof window.camPickChoiceText === 'function' ? window.camPickChoiceText(first.selection) : String(first.selection || '');
    const item = button('', 'cam-ov-item', () => ctx.openPick(top.id), {'aria-label': (best ? 'Mejor Pick: ' : 'Último Pick: ') + match});
    item.append(el('span', best ? 'Mejor Pick' : 'Último Pick', 'cam-ov-label'));
    item.append(el('strong', match + (extra > 0 ? ' +' + extra : ''), 'cam-ov-title is-one'));
    if (choice) item.append(el('span', choice, 'cam-ov-choice'));
    const meta = el('span', null, 'cam-ov-meta');
    const o = odds(top.american_odds);
    if (o) meta.append(el('span', o, 'cam-ov-odds'));
    const pts = top.outcome && top.outcome !== 'pending' ? pickPoints(top.result_points) : '';
    if (pts) meta.append(el('span', pts, best ? 'cam-ov-medal' : 'cam-ov-pts'));
    const day = shortDate(top.created_at);
    if (day) meta.append(el('span', day, 'cam-ov-date'));
    item.append(meta);
    card.append(item);
  }
  return more(card, 'Picks');
}

function quinielaCard(data, ctx) {
  const q = data.quiniela || {};
  const lines = [];
  for (const [key, label] of [['nfl', 'NFL'], ['football', 'Fútbol']]) {
    const s = q[key];
    if (s && s.position) lines.push([label, place(s.position, s.of), num(s.points) + ' pts']);
  }
  for (const p of Array.isArray(q.parties) ? q.parties : []) {
    if (lines.length >= 3) break;
    lines.push(['Party ' + p.name, place(p.position, p.member_count), '']);
  }
  if (!lines.length) return ctx.own ? emptyCard('quiniela', 'Quiniela', 'Jugar la quiniela ›', () => ctx.play('nfl')) : null;
  const hits = num(q.nfl?.hits) + num(q.football?.hits);
  const resolved = num(q.nfl?.resolved) + num(q.football?.resolved);
  const card = shell('quiniela', 'Quiniela', [resolved ? Math.round(hits / resolved * 100) + ' % acierto' : ''], () => ctx.tab('party'));
  const body = button('', 'cam-ov-item cam-ov-lines', () => ctx.tab('party'), {'aria-label': 'Quiniela: ' + lines.map(l => l.filter(Boolean).join(', ')).join('. ')});
  for (const [label, rank, pts] of lines) {
    const row = el('span', null, 'cam-ov-line');
    row.append(el('span', label, 'cam-ov-line-name'));
    const right = el('span', null, 'cam-ov-line-rank');
    right.append(el('b', rank));
    if (pts) right.append(el('span', pts));
    row.append(right);
    body.append(row);
  }
  card.append(body);
  return more(card, 'Quiniela');
}

function render(target, data, ctx) {
  if (!target) return;
  target.replaceChildren();
  if (!data) {
    target.append(el('p', ctx.error || 'Cargando…', 'cam-ov-status', {role: 'status'}));
    return;
  }
  const cards = [takesCard(data, ctx), picksCard(data, ctx), quinielaCard(data, ctx)].filter(Boolean);
  if (!cards.length) {
    target.append(el('p', '@' + String(ctx.name || data.username || 'aficionado').replace(/^@+/, '') + ' todavía no ha participado', 'cam-ov-status'));
    return;
  }
  const grid = el('div', null, 'cam-ov-grid');
  grid.append(...cards);
  target.append(grid);
}

window.CamProfileOverview = Object.freeze({render, goQuiniela});
})();
