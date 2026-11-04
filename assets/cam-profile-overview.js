/* CAM SPORTS · Pestaña «Perfil» del perfil (3 nov 2026).
   Tres tarjetas pequeñas: Takes, Picks y Quiniela. Cada una con su cabecera
   (nombre, una o dos cifras y «Ver todo ›»), un solo elemento destacado.
   4 nov 2026: el Take enseña sus primeras líneas y sus votos; si nadie lo ha
   apoyado no se llama «más apoyado». Debajo, sus campeones elegidos. En el
   perfil propio, «Primeros pasos» sustituye a las tarjetas vacías; en el
   ajeno, la quiniela va primero si va en el podio. highlights() da las
   etiquetas de la cabecera.
   Solo pinta: los datos llegan de ae-profile.js (cam_profile_overview y, una
   vez por perfil, campeones y prestigio). Sin llamadas, bucles ni
   temporizadores propios. */
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
// Las primeras líneas del Take, sin la línea de contexto de la NFL
// («NFL · NFC · NFC West»), como en las tarjetas de «Últimos Takes».
function excerpt(take) {
  let text = String(take?.body || '').replace(/\r\n/g, '\n').trim();
  if (take?.sport === 'nfl') {
    const m = text.match(/^NFL((?: · [^\n]*)?)\n\n/);
    if (m) text = text.slice(m[0].length).trim();
  }
  text = text.replace(/\s+/g, ' ').trim();
  if (!text || text === String(take?.title || '').trim()) return '';
  return text.length > 220 ? text.slice(0, 217).replace(/\s+\S*$/, '') + '…' : text;
}
const CHAMPION_LEAGUES = {laliga: 'LaLiga', premier: 'Premier League', ligamx: 'Liga MX', champions: 'Champions', nfl: 'NFL', colegial: 'Colegial'};
const CHAMPION_STATE = {open: 'Abierta', pending: 'En juego', won: 'Acierto', lost: 'Fallo'};
function initials(team) {
  return /^otro\b/i.test(team || '') ? 'Otro' : String(team || '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
}
// Nombre corto de un equipo para una etiqueta: «Chiefs», «Barcelona».
function shortTeam(c) {
  const team = String(c?.team || '').trim();
  if (!team || /^otro\b/i.test(team)) return '';
  if (c.competition === 'nfl') return team.split(/\s+/).pop();
  return team.replace(/^(FC|CF|AFC|SC|CA|Club)\s+/i, '').replace(/\s+(FC|CF|SC)$/i, '');
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
  const title = el('div', null, 'cam-ov-heading');
  title.append(el('h3', name, 'cam-ov-name'));
  const shown = figures.filter(Boolean);
  if (shown.length) {
    const f = el('p', null, 'cam-ov-figures');
    shown.forEach((text, i) => { if (i) f.append(el('span', '·', 'cam-ov-dot', {'aria-hidden': 'true'})); f.append(el('span', text)); });
    title.append(f);
  }
  head.append(title);
  // «Ver todo ›» arriba, junto al nombre: sin hueco al pie de la tarjeta.
  if (onMore) head.append(button('Ver todo ›', 'cam-ov-more', onMore, {'aria-label': 'Ver todo: ' + name}));
  card.append(head);
  return card;
}
function emptyCard(kind, name, action, onAction) {
  const card = el('section', null, 'cam-ov-card is-empty', {'data-kind': kind, 'aria-label': name});
  const head = el('header', null, 'cam-ov-head');
  head.append(el('h3', name, 'cam-ov-name'), button(action, 'cam-ov-cta', onAction));
  card.append(head);
  return card;
}

function votes(up, down) {
  const pill = el('span', null, 'cam-ov-votes', {'aria-label': num(up) + ' a favor, ' + num(down) + ' en contra'});
  pill.append(el('span', '▲ ' + num(up), 'cam-ov-up', {'aria-hidden': 'true'}), el('span', null, 'cam-ov-votes-sep', {'aria-hidden': 'true'}),
    el('span', '▼ ' + num(down), 'cam-ov-down', {'aria-hidden': 'true'}));
  return pill;
}
function championList(champions, ctx) {
  const box = el('div', null, 'cam-ov-champs');
  box.append(el('p', ctx.own ? 'Mis campeones' : 'Campeones elegidos', 'cam-ov-sublabel'));
  const list = el('ul', null, 'cam-ov-champ-list');
  const crests = [];
  for (const c of champions.slice(0, 3)) {
    const state = CHAMPION_STATE[c.state] ? c.state : 'open';
    const li = el('li', null, 'cam-ov-champ is-' + state);
    const crest = el('span', null, 'cam-ov-crest', {'aria-hidden': 'true'});
    crest.append(el('span', initials(c.team), 'cam-ov-crest-initials'));
    crests.push([crest, c]);
    const copy = el('span', null, 'cam-ov-champ-copy');
    copy.append(el('span', c.team || '—', 'cam-ov-champ-team'));
    const pts = num(state === 'won' ? c.awarded_points : c.points);
    const league = (CHAMPION_LEAGUES[c.competition] || c.competition || '') + (c.season ? ' ' + c.season : '');
    copy.append(el('span', [league, state === 'won' ? '+' + pts + ' pts' : pts ? 'paga ' + pts + ' pts' : ''].filter(Boolean).join(' · '), 'cam-ov-champ-meta'));
    li.append(crest, copy, el('span', CHAMPION_STATE[state], 'cam-ov-champ-state'));
    list.append(li);
  }
  box.append(list);
  // Escudos reales cuando los hay (los de la NFL llegan con una consulta pequeña).
  const paint = () => {
    for (const [crest, c] of crests) {
      if (crest.querySelector('img')) continue;
      const src = typeof ctx.crest === 'function' ? ctx.crest(c) : '';
      if (!src) continue;
      const img = el('img', null, null, {alt: '', width: 32, height: 32, loading: 'lazy', decoding: 'async'});
      img.addEventListener('load', () => crest.classList.add('has-img'));
      img.addEventListener('error', () => img.remove());
      img.src = src;
      crest.append(img);
    }
  };
  paint();
  if (champions.some(c => c.competition === 'nfl') && typeof ctx.crestsReady === 'function') Promise.resolve(ctx.crestsReady()).then(paint, () => {});
  return box;
}

function takesCard(data, ctx) {
  const t = data.takes || {};
  const top = t.top;
  const count = num(t.count);
  const champions = Array.isArray(ctx.extras?.champions) ? ctx.extras.champions : [];
  if (!top && !count && !champions.length) return ctx.own && !ctx.stepsShown ? emptyCard('takes', 'Takes', 'Publicar mi Take ›', ctx.newTake) : null;
  const support = pct(num(t.up), num(t.down));
  const card = shell('takes', 'Takes', [count ? String(count) : '', support && support + ' apoyo'], () => ctx.tab('takes'));
  if (top) {
    const best = top.kind === 'best';
    const up = num(top.upvotes), down = num(top.downvotes);
    // «Más apoyado» solo si alguien lo apoyó de verdad.
    const supported = !best && (top.net == null ? up - down : num(top.net)) > 0;
    const label = best ? 'Mejor Take' : supported ? 'Take más apoyado' : ctx.own ? 'Tu Take' : 'Su Take';
    const item = button('', 'cam-ov-item', () => top.type === 'champion' ? ctx.tab('takes') : ctx.openTake(top),
      {'aria-label': label + ': ' + (top.title || 'Take')});
    const row = el('span', null, 'cam-ov-item-top');
    row.append(el('span', label, 'cam-ov-label'), el('span', league(top), 'cam-ov-tag'));
    item.append(row, el('strong', top.title || 'Take', 'cam-ov-title'));
    const text = excerpt(top);
    if (text) item.append(el('span', text, 'cam-ov-excerpt'));
    const meta = el('span', null, 'cam-ov-meta');
    if (best) meta.append(el('span', '+' + num(top.points) + ' pts', 'cam-ov-medal'));
    if (top.type !== 'champion') meta.append(votes(up, down));
    const day = shortDate(top.created_at);
    if (day) meta.append(el('span', day, 'cam-ov-date'));
    item.append(meta);
    card.append(item);
  }
  if (champions.length) card.append(championList(champions, ctx));
  return card;
}

function picksCard(data, ctx) {
  const p = data.picks || {};
  const top = p.top;
  const count = num(p.count);
  if (!top && !count) return ctx.own && !ctx.stepsShown ? emptyCard('picks', 'Picks', 'Prepara tu Pick ›', ctx.newPick) : null;
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
  return card;
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
  if (!lines.length) return ctx.own && !ctx.stepsShown ? emptyCard('quiniela', 'Quiniela', 'Jugar la quiniela ›', () => ctx.play('nfl')) : null;
  const hits = num(q.nfl?.hits) + num(q.football?.hits);
  const resolved = num(q.nfl?.resolved) + num(q.football?.resolved);
  // Lleva a «Mi Party» (en el perfil propio, con «Mis jornadas» al final).
  const open = () => ctx.tab('party');
  const card = shell('quiniela', 'Quiniela', [resolved ? Math.round(hits / resolved * 100) + ' % acierto' : ''], open);
  const body = button('', 'cam-ov-item cam-ov-lines', open, {'aria-label': 'Quiniela: ' + lines.map(l => l.filter(Boolean).join(', ')).join('. ')});
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
  return card;
}

/* ---------- «Primeros pasos» (solo el perfil propio) ---------- */
const STEPS = [
  ['take', 'Publica tu primer Take', 'Da tu opinión y deja que la comunidad vote', ctx => ctx.newTake()],
  ['quiniela', 'Juega la quiniela', 'Elige quién gana en la NFL o el fútbol', ctx => ctx.play('nfl')],
  ['pick', 'Prepara tu primer Pick', 'Sube la captura de tu apuesta antes del partido', ctx => ctx.newPick()],
  ['party', 'Únete a una party', 'Compite con tus amigos en su propia tabla', ctx => ctx.tab('party')]
];
function stepsCard(steps, ctx) {
  const done = STEPS.filter(([key]) => steps[key]).length;
  const card = el('section', null, 'cam-ov-card cam-ov-steps', {'data-kind': 'steps', 'aria-label': 'Primeros pasos'});
  const head = el('header', null, 'cam-ov-head');
  const title = el('div', null, 'cam-ov-heading');
  title.append(el('h3', 'Primeros pasos', 'cam-ov-name'));
  head.append(title, el('p', done + ' de ' + STEPS.length, 'cam-ov-steps-count'));
  card.append(head);
  const bar = el('div', null, 'cam-ov-progress', {role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': STEPS.length, 'aria-valuenow': done, 'aria-label': done + ' de ' + STEPS.length + ' pasos hechos'});
  for (const [key] of STEPS) bar.append(el('span', null, steps[key] ? 'is-done' : ''));
  card.append(bar);
  const list = el('ol', null, 'cam-ov-step-list');
  STEPS.forEach(([key, name, hint, act], i) => {
    const li = el('li', null, 'cam-ov-step' + (steps[key] ? ' is-done' : ''));
    const mark = el('span', steps[key] ? '✓' : String(i + 1), 'cam-ov-step-mark', {'aria-hidden': 'true'});
    const copy = el('span', null, 'cam-ov-step-copy');
    copy.append(el('span', name, 'cam-ov-step-name'), el('span', steps[key] ? 'Hecho' : hint, 'cam-ov-step-hint'));
    if (steps[key]) {
      li.append(mark, copy);
    } else {
      const b = button('', 'cam-ov-step-go', () => act(ctx), {'aria-label': name + '. ' + hint});
      b.append(mark, copy, el('span', '›', 'cam-ov-step-chevron', {'aria-hidden': 'true'}));
      li.append(b);
    }
    list.append(li);
  });
  card.append(list);
  return card;
}

/* ---------- etiquetas de la cabecera: lo que destaca de cada uno ---------- */
function highlights(data, extras) {
  if (!data) return [];
  const out = [];
  const q = data.quiniela || {};
  const ranks = [['nfl', 'NFL'], ['football', 'Fútbol']]
    .map(([key, label]) => ({label, pos: num(q[key]?.position)}))
    .filter(r => r.pos > 0)
    .sort((a, b) => a.pos - b.pos);
  if (ranks.length) out.push({text: ranks[0].pos + '.º en la Quiniela ' + ranks[0].label, strong: ranks[0].pos <= 3, icon: ranks[0].pos <= 3 ? 'trophy' : ''});
  const prestige = extras?.prestige;
  if (prestige && num(prestige.resolved) > 0 && prestige.risk_label) {
    const legends = num(prestige.legendary_count);
    out.push({text: prestige.risk_label + (legends ? ' · ' + legends + (legends === 1 ? ' legendario' : ' legendarios') : '')});
  }
  const teams = (Array.isArray(extras?.champions) ? extras.champions : []).filter(c => c.state !== 'lost').map(shortTeam).filter(Boolean);
  if (teams.length) out.push({text: 'Campeones: ' + [...new Set(teams)].slice(0, 2).join(' · ')});
  const p = data.picks || {};
  const decided = num(p.won) + num(p.lost);
  if (decided >= 3) out.push({text: Math.round(num(p.won) / decided * 100) + ' % de acierto en Picks'});
  const t = data.takes || {};
  if (num(t.up) + num(t.down) >= 5) out.push({text: Math.round(num(t.up) / (num(t.up) + num(t.down)) * 100) + ' % de apoyo en Takes'});
  return out.slice(0, 3);
}

function render(target, data, ctx) {
  if (!target) return;
  target.replaceChildren();
  if (!data) {
    target.append(el('p', ctx.error || 'Cargando…', 'cam-ov-status', {role: 'status'}));
    return;
  }
  const steps = ctx.own && ctx.steps && !ctx.steps.complete ? ctx.steps : null;
  const stepsShown = Boolean(steps && !(steps.take && steps.quiniela && steps.pick && steps.party));
  const c = {...ctx, stepsShown};
  const takes = takesCard(data, c), picks = picksCard(data, c), quiniela = quinielaCard(data, c);
  // En un perfil ajeno, la quiniela va primero si va en el podio.
  const q = data.quiniela || {};
  const podium = [q.nfl, q.football].some(s => num(s?.position) > 0 && num(s.position) <= 3);
  const ordered = !ctx.own && podium ? [quiniela, takes, picks] : [takes, picks, quiniela];
  const cards = ordered.filter(Boolean);
  if (stepsShown) {
    const grid = el('div', null, 'cam-ov-grid');
    grid.append(stepsCard(steps, c), ...cards);
    target.replaceChildren(grid);
    return;
  }
  if (!cards.length) {
    target.append(el('p', '@' + String(ctx.name || data.username || 'aficionado').replace(/^@+/, '') + ' todavía no ha participado', 'cam-ov-status'));
    return;
  }
  const grid = el('div', null, 'cam-ov-grid');
  grid.append(...cards);
  target.append(grid);
}

window.CamProfileOverview = Object.freeze({render, goQuiniela, highlights});
})();
