/* CAM SPORTS · Parties (1 nov 2026; Quiniela, 3 nov 2026).
   Grupos privados de amigos con su propia clasificación de Quiniela, Picks o Takes.
   · Se entra desde la pestaña «Mi grupo» del perfil y desde «Mis grupos» junto
     a las clasificaciones y en las quinielas NFL y Fútbol.
   · Invitación: camsports.github.io/?party=CÓDIGO (6 caracteres).
   · Cuota de Supabase: nada en bucle ni en tiempo real. Una llamada al abrir
     el party (clasificación de «Este mes» y «Total» juntas), otra al abrir la
     actividad, una al abrir la pestaña «Mi grupo» del perfil (cam_profile_party)
     y una al abrir «Mis grupos». Cambiar de periodo no llama. */
(() => {
'use strict';

const SITE = 'https://camsports.github.io/';
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PENDING_KEY = 'cam_party_invite_v1';
const KINDS = {quiniela: 'Quiniela', picks: 'Picks', takes: 'Takes'};
const SPORTS = {all: 'Todos', football: 'Fútbol', nfl: 'NFL'};
const PAGE = 20;

/* ---------- utilidades ---------- */
const $ = id => document.getElementById(id);
function el(tag, text, cls, attrs) {
  const n = document.createElement(tag);
  if (text !== undefined && text !== null && text !== '') n.textContent = String(text);
  if (cls) n.className = cls;
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? '' : String(v));
  return n;
}
function button(text, cls, onClick, attrs) {
  const b = el('button', text, cls, attrs);
  b.type = 'button';
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
const ICONS = {
  users: '<path d="M15.5 19v-1.3a3.4 3.4 0 0 0-3.4-3.4H7.4A3.4 3.4 0 0 0 4 17.7V19"/><circle cx="9.75" cy="8" r="3.25"/><path d="M20 19v-1.2a3.3 3.3 0 0 0-2.5-3.2M15 4.9a3.25 3.25 0 0 1 0 6.2"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 12v6.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5V12"/>',
  copy: '<rect x="8.5" y="8.5" width="10.5" height="10.5" rx="2"/><path d="M15.5 8.5V6.5c0-.8-.7-1.5-1.5-1.5H6.5C5.7 5 5 5.7 5 6.5V14c0 .8.7 1.5 1.5 1.5h2"/>',
  dots: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  ticket: '<path d="M4 7.5c0-.8.7-1.5 1.5-1.5h13c.8 0 1.5.7 1.5 1.5v2a2.5 2.5 0 0 0 0 5v2c0 .8-.7 1.5-1.5 1.5h-13c-.8 0-1.5-.7-1.5-1.5v-2a2.5 2.5 0 0 0 0-5z"/><path d="M14 6.5v1.5M14 11.2v1.6M14 16v1.5"/>',
  chevron: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>'
};
function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  s.setAttribute('class', 'cam-party-icon' + (cls ? ' ' + cls : ''));
  s.innerHTML = ICONS[name] || '';
  return s;
}
const client = () => { try { return typeof db !== 'undefined' && db ? db : null; } catch { return null; } };
async function rpc(name, args = {}) {
  const c = client();
  if (!c) throw Error('No se pudo conectar con CAM SPORTS.');
  const r = await c.rpc(name, args);
  if (r?.error) throw r.error;
  return r?.data;
}
async function currentUser() {
  const c = client();
  if (!c?.auth) return null;
  try { const r = await c.auth.getUser(); const u = r?.data?.user; return u && !u.is_anonymous ? u : null; }
  catch { return null; }
}
const isAdmin = () => { try { return typeof currentAdmin !== 'undefined' && Boolean(currentAdmin); } catch { return false; } };
function message(e) {
  const m = String(e?.message || e || '').replace(/^Error:\s*/, '').trim();
  if (!m || /failed to fetch|networkerror|load failed|sin red/i.test(m)) return 'No se pudo conectar. Inténtalo de nuevo.';
  return m;
}
const chars = s => [...String(s || '')].length; // como char_length() de la base: emojis incluidos
const cleanName = s => String(s || '').replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const sportLabel = p => p?.sport && p.sport !== 'all' ? SPORTS[p.sport] : 'Todos los deportes';
const kindLabel = p => KINDS[p?.kind] || 'Party';
const membersText = n => { n = Math.max(0, Number(n) || 0); return n === 1 ? '1 miembro' : n + ' miembros'; };
const placeText = (pos, total) => pos ? pos + '.º de ' + (total || pos) : '—';
const initial = name => (String(name || 'A').replace(/^@+/, '').trim().charAt(0) || 'A').toLocaleUpperCase('es');
/* Foto de cada miembro (11 nov 2026): el escudo de su rango, que pinta cam-leagues.js
   (si ese archivo aún no llegó, la inicial se convierte en escudo al cargar). */
function face(name, user, cls) {
  const n = el('span', initial(name), cls, {'aria-hidden': 'true', 'data-rank-face': user || ''});
  window.CamLeagues?.avatar?.(n, user);
  return n;
}
function formatPoints(v, kind, sign = true) {
  const n = Number(v) || 0;
  if (kind === 'picks') {
    const t = Math.abs(n).toFixed(2).replace('.', ',');
    return (n > 0 && sign ? '+' : n < 0 ? '−' : '') + t;
  }
  return (n > 0 && sign ? '+' : '') + String(Math.round(n));
}
function shortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const opts = {day: 'numeric', month: 'short'};
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('es', opts).replace('.', '');
}
function inviteLink(code) { const u = new URL(SITE); u.searchParams.set('party', code); return u.href; }
function oddsText(v) { const n = Number(v); return Number.isFinite(n) && n ? (n > 0 ? '+' : '') + n : ''; }
function savePending(code) { try { sessionStorage.setItem(PENDING_KEY, code); } catch {} }
function readPending() { try { return sessionStorage.getItem(PENDING_KEY) || ''; } catch { return ''; } }
function clearPending() { try { sessionStorage.removeItem(PENDING_KEY); } catch {} }
function clearInviteParam() {
  const u = new URL(location.href);
  if (!u.searchParams.has('party')) return;
  u.searchParams.delete('party');
  history.replaceState(history.state, '', u.href);
}

/* ---------- estado ---------- */
const S = {
  view: null, from: null, context: {kind: 'quiniela', sport: 'all'},
  mine: null, mineError: '', mineStale: true, hubList: null,
  partyId: null, data: null, error: '', tab: 'ranking', period: 'month', act: null,
  invite: null, admin: null, sheet: null, sheetReturn: null, loginPending: false
};
let dialog = null, lastFocus = null, partyReq = 0, activityReq = 0, hubReq = 0;
const freshActivity = () => ({items: [], more: false, filter: 'all', member: '', loading: false, loaded: false, error: ''});

/* ---------- ventana ---------- */
function ensureDialog() {
  if (dialog?.isConnected) return dialog;
  dialog = el('dialog', null, 'cam-party', {id: 'camParty', 'aria-labelledby': 'camPartyTitle'});
  dialog.addEventListener('cancel', e => { if (S.sheet) { e.preventDefault(); closeSheet(); } });
  dialog.addEventListener('close', () => {
    S.sheet = null;
    // Al ir a iniciar sesión la invitación queda pendiente; cerrarla a mano la descarta.
    const keep = S.loginPending;
    S.loginPending = false;
    if (S.view === 'invite' && !keep) { clearPending(); clearInviteParam(); }
    S.view = null;
    const f = lastFocus; lastFocus = null;
    if (f?.isConnected) try { f.focus({preventScroll: true}); } catch {}
  });
  // En ordenador, tocar fuera de la ventana la cierra.
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return dialog;
}
function closeDialog() { if (dialog?.open) dialog.close(); }
function mount(shell, focusSelector) {
  ensureDialog();
  S.sheet = null;
  dialog.replaceChildren(shell);
  if (!dialog.open) {
    lastFocus = document.activeElement;
    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  }
  const target = (focusSelector && dialog.querySelector(focusSelector)) || dialog.querySelector('.cam-party-title');
  try { target?.focus({preventScroll: true}); } catch {}
  const body = dialog.querySelector('.cam-party-scroll');
  if (body) body.scrollTop = 0;
}
function frame({kicker, title, back, menu, lead, after, tabs, body, foot, cls}) {
  const shell = el('div', null, 'cam-party-shell' + (cls ? ' ' + cls : ''));
  const scroll = el('div', null, 'cam-party-scroll');
  const head = el('header', null, 'cam-party-head');
  // La barra (volver, menú, cerrar) y las pestañas se quedan fijas arriba al desplazar.
  const bar = el('div', null, 'cam-party-bar');
  if (back) {
    const b = button('', 'cam-party-iconbtn', back, {'aria-label': 'Volver'});
    b.append(icon('back'));
    bar.append(b);
  } else bar.append(el('span', null, 'cam-party-bar-gap'));
  const right = el('div', null, 'cam-party-bar-right');
  if (menu) right.append(menu);
  const close = button('', 'cam-party-iconbtn', closeDialog, {'aria-label': 'Cerrar'});
  close.append(icon('close'));
  right.append(close);
  bar.append(right);
  scroll.append(bar);
  if (lead) head.append(lead);
  if (kicker) head.append(el('p', kicker, 'cam-party-kicker'));
  head.append(el('h2', title, 'cam-party-title', {id: 'camPartyTitle', tabindex: '-1'}));
  if (after) head.append(...[].concat(after).filter(Boolean));
  scroll.append(head);
  if (tabs) scroll.append(tabs);
  const main = el('div', null, 'cam-party-body');
  main.append(...[].concat(body).filter(Boolean));
  scroll.append(main);
  shell.append(scroll);
  if (foot) {
    const f = el('footer', null, 'cam-party-foot');
    f.append(...[].concat(foot).filter(Boolean));
    shell.append(f);
  }
  return shell;
}
function line(text, cls = 'cam-party-empty') { return el('p', text, cls); }
function errorLine() { const p = el('p', '', 'cam-party-error', {role: 'alert'}); p.hidden = true; return p; }
function showError(node, text) { node.textContent = text; node.hidden = !text; }

/* ---------- hojas (menú, invitar, confirmar) ---------- */
function sheet(title, content, returnTo) {
  closeSheet(false);
  ensureDialog();
  const wrap = el('div', null, 'cam-party-sheet-wrap');
  const scrim = button('', 'cam-party-scrim', () => closeSheet(), {'aria-hidden': 'true', tabindex: '-1'});
  const panel = el('section', null, 'cam-party-sheet', {role: 'dialog', 'aria-modal': 'true', 'aria-label': title});
  const head = el('div', null, 'cam-party-sheet-head');
  const close = button('', 'cam-party-iconbtn', () => closeSheet(), {'aria-label': 'Cerrar'});
  close.append(icon('close'));
  head.append(el('h3', title, 'cam-party-sheet-title'), close);
  panel.append(head, ...[].concat(content).filter(Boolean));
  wrap.append(scrim, panel);
  dialog.append(wrap);
  S.sheet = wrap;
  S.sheetReturn = returnTo || document.activeElement;
  const first = panel.querySelector('input, .cam-party-sheet-item, .cam-party-btn');
  try { (first || close).focus({preventScroll: true}); } catch {}
  return panel;
}
function closeSheet(restore = true) {
  if (!S.sheet) return;
  S.sheet.remove();
  S.sheet = null;
  const r = S.sheetReturn; S.sheetReturn = null;
  if (restore && r?.isConnected) try { r.focus({preventScroll: true}); } catch {}
}
function confirmSheet(title, text, actionLabel, run, danger = true) {
  const status = errorLine();
  const ok = button(actionLabel, 'cam-party-btn' + (danger ? ' is-danger' : ' is-primary'));
  const cancel = button('Cancelar', 'cam-party-btn', () => closeSheet());
  ok.addEventListener('click', async () => {
    ok.disabled = cancel.disabled = true;
    try { await run(); }
    catch (e) { showError(status, message(e)); ok.disabled = cancel.disabled = false; }
  });
  const actions = el('div', null, 'cam-party-actions');
  actions.append(cancel, ok);
  sheet(title, [line(text, 'cam-party-sheet-text'), status, actions]);
}

/* ---------- acceso con sesión ---------- */
async function requireLogin(resume, hint) {
  if (dialog?.open) { S.loginPending = true; closeDialog(); }
  if (typeof aeRequestPublication === 'function') {
    await aeRequestPublication('party', resume);
    const h = $('aeAuthPublishHint');
    if (h && !h.hidden) h.textContent = hint;
    return;
  }
  window.openUserAuthModal?.();
}

/* ---------- Mis grupos ---------- */
async function openHub(kind, sport) {
  const finishEntrance=window.camPageLoader?.begin?.();
  try{
  if (KINDS[kind]) S.context.kind = kind;
  S.context.sport = SPORTS[sport] ? sport : 'all';
  if (!await currentUser()) {
    requireLogin(() => openHub(kind, sport), 'Para ver tus parties, inicia sesión o crea una cuenta. Después volverás aquí.');
    return;
  }
  renderHub();
  if (S.mineStale || !S.mine) loadMine();
  }finally{finishEntrance?.();}
}
function renderHub() {
  S.view = 'hub';
  const seg = el('div', null, 'cam-party-seg', {role: 'group', 'aria-label': 'Tipo de party'});
  for (const [k, label] of Object.entries(KINDS)) {
    seg.append(button(label, 'cam-party-seg-btn', () => { S.context.kind = k; renderHub(); }, {'aria-pressed': String(S.context.kind === k)}));
  }
  const list = el('div', null, 'cam-party-list', {'aria-live': 'polite'});
  S.hubList = list;
  const create = button('Crear party', 'cam-party-btn is-primary', () => openCreate());
  create.prepend(icon('plus'));
  const join = button('Unirme con código', 'cam-party-btn', () => openJoin());
  join.prepend(icon('ticket'));
  const actions = el('div', null, 'cam-party-actions');
  actions.append(create, join);
  const body = [seg, list];
  if (isAdmin()) body.push(button('Moderar todos los parties', 'cam-party-link', () => openAdmin()));
  mount(frame({kicker: 'CAM SPORTS · PARTIES', title: 'Mis grupos', body, foot: actions}));
  fillMine();
}
function fillMine() {
  const list = S.hubList;
  if (!list?.isConnected) return;
  list.replaceChildren();
  if (!S.mine) { list.append(line(S.mineError || 'Cargando…')); return; }
  const items = S.mine.filter(p => p.kind === S.context.kind);
  if (!items.length) { list.append(line('Aún no estás en ningún party de ' + KINDS[S.context.kind] + '.')); return; }
  for (const p of items) list.append(partyCard(p, () => openParty(p.id, 'hub')));
}
function partyCard(p, onOpen, extra) {
  const card = onOpen ? button('', 'cam-party-card', onOpen) : el('div', null, 'cam-party-card');
  const copy = el('span', null, 'cam-party-card-copy');
  copy.append(el('span', p.name, 'cam-party-card-name'));
  const meta = el('span', null, 'cam-party-card-meta');
  meta.append(el('span', sportLabel(p)), el('span', membersText(p.member_count)));
  if (extra) meta.append(el('span', extra, 'cam-party-card-tag'));
  copy.append(meta);
  const rank = el('span', null, 'cam-party-card-rank');
  if (p.position) rank.append(el('strong', p.position + '.º'), el('small', 'de ' + (p.member_count || p.position)));
  card.append(copy, rank);
  if (onOpen) {
    card.setAttribute('aria-label', p.name + ', ' + kindLabel(p) + ', ' + sportLabel(p) + ', ' + placeText(p.position, p.member_count));
    card.append(icon('chevron', 'cam-party-card-chevron'));
  }
  return card;
}
async function loadMine() {
  const finishEntrance=window.camPageLoader?.begin?.();
  const req = ++hubReq;
  S.mine = null; S.mineError = '';
  fillMine();
  try {
    const d = await rpc('cam_party_mine');
    if (req !== hubReq) return;
    S.mine = Array.isArray(d) ? d : [];
    S.mineStale = false;
  } catch (e) {
    if (req !== hubReq) return;
    S.mineError = message(e);
  }finally{finishEntrance?.();}
  fillMine();
}
function backToHub() { renderHub(); if (S.mineStale || !S.mine) loadMine(); }

/* ---------- crear ---------- */
function choice(label, options, value, name) {
  let current = value;
  const group = el('div', null, 'cam-party-field');
  const id = 'camPartyLabel' + name;
  group.append(el('span', label, 'cam-party-label', {id}));
  const seg = el('div', null, 'cam-party-seg', {role: 'group', 'aria-labelledby': id});
  const buttons = Object.entries(options).map(([k, text]) => {
    const b = button(text, 'cam-party-seg-btn', () => { current = k; buttons.forEach(x => x.setAttribute('aria-pressed', String(x.dataset.value === k))); }, {'aria-pressed': String(k === value), 'data-value': k});
    return b;
  });
  seg.append(...buttons);
  group.append(seg);
  return {node: group, value: () => current};
}
function openCreate(kind, sport) {
  if (KINDS[kind]) S.context.kind = kind;
  if (SPORTS[sport]) S.context.sport = sport;
  S.view = 'create';
  const form = el('form', null, 'cam-party-form', {novalidate: true});
  const status = errorLine();
  const field = el('label', null, 'cam-party-field');
  const top = el('span', null, 'cam-party-label-row');
  const count = el('span', '0/40', 'cam-party-count', {id: 'camPartyNameCount', 'aria-live': 'polite'});
  top.append(el('span', 'Nombre', 'cam-party-label'), count);
  const name = el('input', null, 'cam-party-input', {id: 'camPartyName', type: 'text', autocomplete: 'off', maxlength: '120', enterkeyhint: 'done', placeholder: 'Los del barrio ⚽', 'aria-describedby': 'camPartyNameCount'});
  name.addEventListener('input', () => { const n = chars(cleanName(name.value)); count.textContent = n + '/40'; count.classList.toggle('is-over', n > 40); showError(status, ''); });
  field.append(top, name);
  const kindChoice = choice('Tipo', KINDS, S.context.kind, 'Kind');
  kindChoice.node.append(line('No se puede cambiar después.', 'cam-party-hint'));
  const sportChoice = choice('Deporte', SPORTS, S.context.sport || 'all', 'Sport');
  const leagues = line('Fútbol: LaLiga, Premier, Liga MX y Champions.', 'cam-party-hint');
  const syncLeagues = () => { leagues.hidden = kindChoice.value() !== 'quiniela'; };
  sportChoice.node.append(leagues);
  kindChoice.node.addEventListener('click', () => queueMicrotask(syncLeagues));
  syncLeagues();
  const submit = el('button', 'Crear party', 'cam-party-btn is-primary is-wide', {type: 'submit'});
  form.append(field, kindChoice.node, sportChoice.node, status, submit);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const value = cleanName(name.value), n = chars(value);
    if (n < 3 || n > 40) { showError(status, 'El nombre debe tener entre 3 y 40 caracteres.'); name.focus(); return; }
    if (!await currentUser()) { requireLogin(() => openCreate(kindChoice.value(), sportChoice.value()), 'Para crear un party, inicia sesión o crea una cuenta.'); return; }
    submit.disabled = true; showError(status, '');
    try {
      const r = await rpc('cam_party_create', {p_name: value, p_kind: kindChoice.value(), p_sport: sportChoice.value()});
      changed();
      S.context.kind = kindChoice.value();
      openParty(r.id, 'hub', {justCreated: true});
    } catch (err) {
      showError(status, message(err));
      submit.disabled = false;
    }
  });
  mount(frame({kicker: 'CAM SPORTS · PARTIES', title: 'Crear party', back: backToHub, body: form}), '#camPartyName');
}

/* ---------- unirse con código ---------- */
function openJoin() {
  S.view = 'join';
  const form = el('form', null, 'cam-party-form', {novalidate: true});
  const field = el('label', null, 'cam-party-field');
  field.append(el('span', 'Código', 'cam-party-label'));
  const input = el('input', null, 'cam-party-input cam-party-code-input', {id: 'camPartyCode', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '9', inputmode: 'text', enterkeyhint: 'go', placeholder: 'ABC234'});
  const status = errorLine();
  input.addEventListener('input', () => { const v = cleanCode(input.value); if (v !== input.value) input.value = v; showError(status, ''); });
  field.append(input);
  const submit = el('button', 'Ver invitación', 'cam-party-btn is-primary is-wide', {type: 'submit'});
  form.append(field, status, submit);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const code = cleanCode(input.value);
    if (!CODE_RE.test(code)) { showError(status, 'El código tiene 6 letras y números.'); input.focus(); return; }
    openInvite(code, {from: 'join'});
  });
  mount(frame({kicker: 'CAM SPORTS · PARTIES', title: 'Unirme con código', back: backToHub, body: form}), '#camPartyCode');
}

/* ---------- invitación ---------- */
async function openInvite(raw, opts = {}) {
  const code = cleanCode(raw);
  S.invite = {code, data: null, error: '', from: opts.from || null};
  renderInvite();
  if (!CODE_RE.test(code)) { S.invite.error = 'Este enlace de invitación no es válido.'; renderInvite(); return; }
  try {
    const d = await rpc('cam_party_preview', {p_code: code});
    if (S.invite?.code !== code) return;
    S.invite.data = d || {status: 'not_found'};
  } catch (e) {
    if (S.invite?.code !== code) return;
    S.invite.error = message(e);
  }
  if (S.view === 'invite') renderInvite();
}
function renderInvite() {
  S.view = 'invite';
  const inv = S.invite, d = inv.data;
  const ok = d?.status === 'ok';
  const body = [];
  const status = errorLine();
  let foot = null;
  if (inv.error) body.push(line(inv.error));
  else if (!d) body.push(line('Cargando invitación…'));
  else if (!ok) body.push(line('Este enlace ya no es válido.'));
  else {
    const chips = el('ul', null, 'cam-party-chips', {'aria-label': 'Datos del party'});
    for (const text of [KINDS[d.kind] || 'Party', sportLabel(d), membersText(d.member_count)]) chips.append(el('li', text, 'cam-party-chip'));
    body.push(chips, status);
    const actions = el('div', null, 'cam-party-actions is-stacked');
    if (d.is_member && d.id) actions.append(button('Abrir party', 'cam-party-btn is-primary is-wide', () => { clearPending(); clearInviteParam(); openParty(d.id, null); }));
    else if (d.is_full) actions.append(button('Party completo', 'cam-party-btn is-wide', null, {disabled: true}));
    else {
      const join = button('Unirme', 'cam-party-btn is-primary is-wide', () => joinInvite(join, status));
      join.id = 'camPartyJoin';
      actions.append(join);
    }
    actions.append(button('Ahora no', 'cam-party-btn is-quiet is-wide', () => { clearPending(); clearInviteParam(); closeDialog(); }));
    foot = actions;
  }
  const back = inv.from === 'join' ? () => openJoin() : null;
  const lead = el('span', null, 'cam-party-emblem');
  lead.append(icon('users'));
  mount(frame({kicker: ok ? 'Te invitaron a' : 'Invitación · CAM SPORTS', title: ok ? d.name : 'Party', back, lead, body, foot, cls: 'is-invite'}));
}
async function joinInvite(btn, status) {
  const inv = S.invite;
  if (!inv?.data) return;
  if (!await currentUser()) {
    savePending(inv.code);
    requireLogin(() => openInvite(inv.code, {from: inv.from}), 'Para unirte al party, inicia sesión o crea una cuenta. Después volverás a la invitación.');
    return;
  }
  btn.disabled = true; showError(status, '');
  try {
    const r = await rpc('cam_party_join', {p_code: inv.code});
    clearPending(); clearInviteParam();
    changed();
    S.context.kind = inv.data.kind || S.context.kind;
    openParty(r.id, null);
  } catch (e) {
    showError(status, message(e));
    btn.disabled = false;
  }
}

/* ---------- un party ---------- */
async function openParty(id, from, opts = {}) {
  const finishEntrance=window.camPageLoader?.begin?.();
  try{
  if (!UUID.test(String(id || ''))) return;
  S.from = from || null; S.partyId = id; S.data = null; S.error = '';
  S.tab = 'ranking'; S.period = null; S.act = freshActivity();
  renderParty();
  const req = ++partyReq;
  try {
    const d = await rpc('cam_party_ranking', {p_party: id});
    if (req !== partyReq) return;
    S.data = d;
  } catch (e) {
    if (req !== partyReq) return;
    S.error = message(e);
  }
  if (S.view !== 'party' || S.partyId !== id) return;
  renderParty();
  if (opts.justCreated && S.data) openInviteSheet();
  }finally{finishEntrance?.();}
}
async function reloadParty() {
  const id = S.partyId, req = ++partyReq;
  try {
    const d = await rpc('cam_party_ranking', {p_party: id});
    if (req !== partyReq || S.partyId !== id) return;
    S.data = d;
    if (S.view === 'party') { const tab = S.tab; renderParty(); if (tab === 'activity') setTab('activity'); }
  } catch (e) { if (req === partyReq) S.error = message(e); }
}
function partyBack() {
  if (S.from === 'hub') return backToHub;
  if (S.from === 'admin') return () => openAdmin();
  return null;
}
function renderParty() {
  S.view = 'party';
  const back = partyBack();
  if (S.error || !S.data) {
    mount(frame({kicker: 'CAM SPORTS · PARTIES', title: S.error ? 'Party no disponible' : 'Party', back, body: line(S.error || 'Cargando…')}));
    return;
  }
  const p = S.data.party;
  const menu = button('', 'cam-party-iconbtn', e => openMenu(e.currentTarget), {'aria-label': 'Opciones del party', 'aria-haspopup': 'dialog', id: 'camPartyMenu'});
  menu.append(icon('dots', 'is-dots'));
  const row = el('div', null, 'cam-party-headrow');
  row.append(el('span', membersText(p.member_count), 'cam-party-members'));
  if (p.is_member) {
    const invite = button('Invitar', 'cam-party-btn is-primary is-small', () => openInviteSheet(), {id: 'camPartyInvite'});
    invite.prepend(icon('share'));
    row.append(invite);
  }
  const tabs = el('div', null, 'cam-party-tabs', {role: 'tablist', 'aria-label': 'Secciones del party'});
  const tabRanking = button('Clasificación', 'cam-party-tab', () => setTab('ranking'), {role: 'tab', id: 'camPartyTabRanking', 'aria-controls': 'camPartyBoard'});
  const tabActivity = button('Actividad', 'cam-party-tab', () => setTab('activity'), {role: 'tab', id: 'camPartyTabActivity', 'aria-controls': 'camPartyFeed'});
  tabs.append(tabRanking, tabActivity);
  tabs.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    setTab(S.tab === 'ranking' ? 'activity' : 'ranking');
    (S.tab === 'ranking' ? tabRanking : tabActivity).focus();
  });
  const board = el('section', null, 'cam-party-panel', {id: 'camPartyBoard', role: 'tabpanel', 'aria-labelledby': 'camPartyTabRanking'});
  const feed = el('section', null, 'cam-party-panel', {id: 'camPartyFeed', role: 'tabpanel', 'aria-labelledby': 'camPartyTabActivity'});
  const kicker = 'Party · ' + kindLabel(p) + (p.sport && p.sport !== 'all' ? ' · ' + SPORTS[p.sport] : '');
  mount(frame({kicker, title: p.name, back, menu, after: row, tabs, body: [board, feed], cls: 'is-party'}));
  setTab(S.tab, false);
}
function setTab(tab, focus) {
  S.tab = tab === 'activity' ? 'activity' : 'ranking';
  for (const [id, value] of [['camPartyTabRanking', 'ranking'], ['camPartyTabActivity', 'activity']]) {
    const b = $(id);
    if (!b) continue;
    b.setAttribute('aria-selected', String(S.tab === value));
    b.tabIndex = S.tab === value ? 0 : -1;
  }
  const board = $('camPartyBoard'), feed = $('camPartyFeed');
  if (board) board.hidden = S.tab !== 'ranking';
  if (feed) feed.hidden = S.tab !== 'activity';
  if (S.tab === 'ranking') renderBoard();
  else { renderFeed(); if (!S.act.loaded && !S.act.loading) loadActivity(false); }
}

/* Clasificación */
const PERIODS = {week: 'Esta semana', month: 'Este mes', total: 'Total'};
function periodsOf(kind) { return kind === 'quiniela' ? ['week', 'month', 'total'] : ['month', 'total']; }
function renderBoard() {
  const board = $('camPartyBoard');
  if (!board || !S.data) return;
  const kind = S.data.party.kind;
  const periods = periodsOf(kind);
  if (!periods.includes(S.period)) S.period = periods[0];
  const seg = el('div', null, 'cam-party-seg is-period', {role: 'group', 'aria-label': 'Periodo'});
  for (const k of periods) {
    seg.append(button(PERIODS[k], 'cam-party-seg-btn', () => { S.period = k; renderBoard(); }, {'aria-pressed': String(S.period === k)}));
  }
  const rows = S.data[S.period] || [];
  const list = el('ol', null, 'cam-party-board', {'aria-label': 'Clasificación: ' + PERIODS[S.period].toLowerCase()});
  for (const r of rows) list.append(boardRow(r, kind));
  board.replaceChildren(seg, rows.length ? list : line('Todavía no hay miembros.'));
}
function boardRow(r, kind) {
  const li = el('li', null, 'cam-party-row' + (r.is_me ? ' is-me' : '') + (r.position <= 3 && Number(r.attempts) > 0 ? ' is-top is-top-' + r.position : ''));
  const name = String(r.username || 'Aficionado').replace(/^@+/, '');
  li.append(el('span', String(r.position), 'cam-party-pos', {'aria-label': 'Posición ' + r.position}));
  li.append(face(name, r.user_id, 'cam-party-avatar'));
  const who = el('span', null, 'cam-party-who');
  const link = el('a', '@' + name, 'cam-party-name', {href: '?perfil=' + r.user_id, title: 'Perfil de @' + name});
  link.addEventListener('click', e => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || typeof window.openAePublicProfile !== 'function') return;
    e.preventDefault();
    window.openAePublicProfile(r.user_id, true);
  });
  who.append(link);
  const sub = el('span', null, 'cam-party-sub');
  sub.append(el('span', Number(r.attempts) ? r.correct + '/' + r.attempts + ' aciertos' : 'Sin resultados'));
  if (r.is_owner) sub.append(el('span', 'Creador', 'cam-party-owner'));
  who.append(sub);
  li.append(who);
  const pts = el('span', null, 'cam-party-pts');
  const n = Number(r.points) || 0;
  pts.append(el('strong', formatPoints(n, kind, kind === 'picks'), n < 0 ? 'is-negative' : ''), el('small', 'pts'));
  li.append(pts);
  li.append(button('', 'cam-party-row-open', () => showMember(r.user_id), {'aria-label': 'Ver actividad de @' + name + ' en este party'}));
  return li;
}
function showMember(userId) {
  S.act = freshActivity();
  S.act.member = userId;
  setTab('activity');
  try { $('camPartyFeed')?.scrollIntoView({block: 'start'}); } catch {}
}

/* Actividad */
function renderFeed() {
  const feed = $('camPartyFeed');
  if (!feed || !S.data) return;
  const a = S.act;
  const filters = el('div', null, 'cam-party-filters');
  const seg = el('div', null, 'cam-party-seg', {role: 'group', 'aria-label': 'Estado'});
  const quiniela = S.data.party.kind === 'quiniela';
  for (const [k, label] of [['all', 'Todos'], ['pending', quiniela ? 'En juego' : 'Pendientes'], ['resolved', 'Resueltos']]) {
    seg.append(button(label, 'cam-party-seg-btn', () => { if (a.filter === k) return; a.filter = k; loadActivity(false); }, {'aria-pressed': String(a.filter === k)}));
  }
  const select = el('select', null, 'cam-party-select', {id: 'camPartyMember', 'aria-label': 'Miembro'});
  select.append(el('option', 'Todos los miembros', null, {value: ''}));
  for (const r of S.data.total || []) {
    const o = el('option', '@' + String(r.username || 'Aficionado').replace(/^@+/, ''), null, {value: r.user_id});
    if (r.user_id === a.member) o.selected = true;
    select.append(o);
  }
  select.addEventListener('change', () => { a.member = select.value; loadActivity(false); });
  filters.append(seg, select);
  const list = el('div', null, 'cam-party-feed', {'aria-live': 'polite', 'aria-busy': String(a.loading)});
  if (a.items.length) for (const it of a.items) list.append(itemCard(it));
  else if (a.error) list.append(line(a.error));
  else if (!a.loaded || a.loading) list.append(line('Cargando…'));
  else list.append(line(a.filter === 'pending' ? (quiniela ? 'Ningún partido en juego.' : 'No hay nada pendiente.')
    : a.filter === 'resolved' ? 'Aún no hay nada resuelto.'
    : quiniela ? 'Todavía no ha empezado ningún partido.' : 'Todavía no hay ' + kindLabel(S.data.party) + ' en este party.'));
  const nodes = [filters, list];
  if (a.items.length && a.more) {
    const more = button(a.loading ? 'Cargando…' : 'Ver más', 'cam-party-btn is-wide', () => loadActivity(true), {disabled: a.loading});
    nodes.push(more);
  } else if (a.items.length && a.error) nodes.push(line(a.error, 'cam-party-error'));
  feed.replaceChildren(...nodes);
}
async function loadActivity(more) {
  const a = S.act, id = S.partyId, req = ++activityReq;
  if (!id) return;
  const last = more ? a.items[a.items.length - 1] : null;
  if (!more) { a.items = []; a.more = false; a.loaded = false; }
  a.loading = true; a.error = '';
  renderFeed();
  try {
    const d = await rpc('cam_party_activity', {
      p_party: id, p_filter: a.filter, p_member: a.member || null,
      p_before: last ? last.created_at : null, p_before_key: last ? last.key : null, p_limit: PAGE
    });
    if (req !== activityReq || S.partyId !== id || S.act !== a) return;
    const items = Array.isArray(d?.items) ? d.items : [];
    a.items = more ? a.items.concat(items) : items;
    a.more = Boolean(d?.more);
    a.loaded = true;
  } catch (e) {
    if (req !== activityReq || S.act !== a) return;
    a.error = message(e);
    a.loaded = true;
  }
  a.loading = false;
  if (S.view === 'party' && S.tab === 'activity') renderFeed();
}
function stateText(it, kind) {
  const pts = it.points;
  if (it.type === 'quiniela') {
    if (it.state === 'won') return {text: 'Acertado · +' + Math.round(Number(pts) || 0) + ' pts', tone: 'is-won'};
    if (it.state === 'lost') return {text: 'Fallado', tone: 'is-lost'};
    if (it.state === 'void') return {text: 'Anulado', tone: 'is-void'};
    return {text: 'En juego' + (pts ? ' · vale ' + pts + ' pts' : ''), tone: 'is-pending'};
  }
  if (it.state === 'won') return {text: 'Acertado · ' + formatPoints(pts, kind) + ' pts', tone: 'is-won'};
  if (it.state === 'lost') return {text: 'Fallado' + (kind === 'picks' ? ' · ' + formatPoints(pts, kind) + ' pts' : ''), tone: 'is-lost'};
  if (it.state === 'void') return {text: 'Anulado', tone: 'is-void'};
  if (it.type === 'pick') {
    const odds = oddsText(it.american_odds);
    return {text: (it.moderation_status === 'pending' ? 'En revisión' : 'Pendiente') + (odds ? ' · Cuota ' + odds : ''), tone: 'is-pending'};
  }
  if (it.type === 'champion' && pts) return {text: 'Pendiente · vale ' + pts + ' pts', tone: 'is-pending'};
  return {text: 'Pendiente', tone: 'is-pending'};
}
/* «Chiefs @ Bills» (NFL: visitante @ local) · «Barcelona vs Real Madrid» (fútbol). */
function matchTitle(it) {
  const home = it.home_name || 'Local', away = it.away_name || 'Visitante';
  return it.sport === 'nfl' ? away + ' @ ' + home : home + ' vs ' + away;
}
function quinielaCard(it) {
  const name = String(it.username || 'Aficionado').replace(/^@+/, '');
  const card = el('div', null, 'cam-party-item is-quiniela');
  const top = el('span', null, 'cam-party-item-top');
  top.append(face(name, it.user_id, 'cam-party-avatar is-small'), el('span', '@' + name, 'cam-party-item-author'), el('span', shortDate(it.kickoff || it.created_at), 'cam-party-item-date'));
  card.append(top, el('span', matchTitle(it), 'cam-party-item-title'));
  const score = Number.isFinite(Number(it.home_score)) && Number.isFinite(Number(it.away_score)) && it.home_score !== null && it.away_score !== null
    ? (it.sport === 'nfl' ? it.away_score + '–' + it.home_score : it.home_score + '–' + it.away_score) : '';
  card.append(el('span', 'Eligió ' + (it.pick_label || '—') + (score ? ' · ' + score : ''), 'cam-party-item-detail'));
  const st = stateText(it, 'quiniela');
  card.append(el('span', st.text, 'cam-party-state ' + st.tone));
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', '@' + name + ': ' + matchTitle(it) + '. Eligió ' + (it.pick_label || '') + '. ' + st.text);
  return card;
}
function itemCard(it) {
  if (it.type === 'quiniela') return quinielaCard(it);
  const kind = S.data.party.kind;
  const name = String(it.username || 'Aficionado').replace(/^@+/, '');
  const card = button('', 'cam-party-item', () => openItem(it));
  const top = el('span', null, 'cam-party-item-top');
  top.append(face(name, it.user_id, 'cam-party-avatar is-small'), el('span', '@' + name, 'cam-party-item-author'), el('span', shortDate(it.created_at), 'cam-party-item-date'));
  card.append(top, el('span', it.title || (it.type === 'pick' ? 'Pick' : 'Take'), 'cam-party-item-title'));
  let detail = '';
  if (it.type === 'pick') {
    const leg = (Array.isArray(it.legs) ? it.legs : [])[0] || {};
    detail = [leg.event, leg.selection].filter(Boolean).join(' · ');
    const extra = Number(it.legs_count) - 1;
    if (extra > 0) detail += (detail ? ' · ' : '') + '+' + extra + (extra === 1 ? ' selección' : ' selecciones');
  } else detail = it.body || '';
  if (detail) card.append(el('span', detail, 'cam-party-item-detail'));
  const st = stateText(it, kind);
  card.append(el('span', st.text, 'cam-party-state ' + st.tone));
  card.setAttribute('aria-label', (it.type === 'pick' ? 'Pick' : 'Take') + ' de @' + name + ': ' + (it.title || '') + '. ' + st.text);
  return card;
}
function openItem(it) {
  if (it.type === 'pick') {
    if (typeof window.aeOpenPickDetail === 'function') window.aeOpenPickDetail(it.id);
    else window.openAeCommunityPick?.(it.id);
    return;
  }
  if (it.type === 'take' && window.aeTakeReplies?.open) {
    window.aeTakeReplies.open({
      id: it.id, author_id: it.user_id, author: it.username, title: it.title, body: it.body,
      sport: it.sport, competition: it.competition, created_at: it.created_at,
      upvotes: it.upvotes, downvotes: it.downvotes, my_vote: it.my_vote, hidden: false
    });
    return;
  }
  // «¿Quién será campeón?» vive en el perfil (pestaña Takes).
  window.openAePublicProfile?.(it.user_id, true, 'takes');
}

/* Invitar */
function openInviteSheet() {
  const p = S.data?.party;
  if (!p?.code) return;
  const link = inviteLink(p.code);
  const code = el('p', p.code, 'cam-party-code', {'aria-label': 'Código ' + p.code.split('').join(' ')});
  const url = el('p', link, 'cam-party-url');
  const status = el('p', '', 'cam-party-sheet-status', {role: 'status', 'aria-live': 'polite'});
  const actions = el('div', null, 'cam-party-actions');
  if (typeof navigator.share === 'function') {
    const share = button('Compartir', 'cam-party-btn is-primary', async () => {
      try { await navigator.share({title: p.name + ' · CAM SPORTS', text: 'Únete a mi grupo «' + p.name + '» en CAM SPORTS', url: link}); }
      catch (e) { if (e?.name !== 'AbortError') copy(); }
    });
    share.prepend(icon('share'));
    actions.append(share);
  }
  const copyBtn = button('Copiar enlace', 'cam-party-btn' + (typeof navigator.share === 'function' ? '' : ' is-primary'), () => copy(), {id: 'camPartyCopy'});
  copyBtn.prepend(icon('copy'));
  actions.append(copyBtn);
  async function copy() {
    let ok = false;
    try { await navigator.clipboard.writeText(link); ok = true; }
    catch {
      const range = document.createRange(); range.selectNodeContents(url);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      try { ok = document.execCommand('copy'); } catch {}
    }
    status.textContent = ok ? 'Enlace copiado.' : 'Mantén pulsado el enlace para copiarlo.';
  }
  sheet('Invitar a ' + p.name, [code, url, actions, status], $('camPartyInvite'));
}

/* Menú ⋯ */
function openMenu(anchor) {
  const p = S.data?.party;
  if (!p) return;
  const items = [];
  const item = (label, run, cls) => button(label, 'cam-party-sheet-item' + (cls ? ' ' + cls : ''), run);
  if (p.is_member) {
    const sw = button('', 'cam-party-sheet-item cam-party-switch', null, {role: 'switch', 'aria-checked': String(p.show_on_profile !== false)});
    sw.append(el('span', 'Mostrar en mi perfil'), el('span', null, 'cam-party-switch-track', {'aria-hidden': 'true'}));
    const status = errorLine();
    sw.addEventListener('click', async () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.disabled = true; showError(status, '');
      try {
        await rpc('cam_party_set_visibility', {p_party: p.id, p_show: next});
        p.show_on_profile = next;
        sw.setAttribute('aria-checked', String(next));
        changed();
      } catch (e) { showError(status, message(e)); }
      sw.disabled = false;
    });
    items.push(sw, status);
  }
  if (p.is_owner) {
    items.push(item('Renombrar', () => openRename()));
    items.push(item('Cambiar código', () => confirmSheet('Cambiar código', 'El enlace actual dejará de funcionar.', 'Cambiar código', async () => {
      const r = await rpc('cam_party_new_code', {p_party: p.id});
      p.code = r.code;
      openInviteSheet();
    }, false)));
    items.push(item('Miembros', () => openMembers()));
  }
  if (p.is_member) items.push(item('Salir del party', () => confirmSheet('Salir del party', p.is_owner && p.member_count > 1
    ? 'El party pasará al miembro más antiguo. Si vuelves, empiezas de cero.'
    : p.member_count > 1 ? 'Si vuelves, empiezas de cero.' : 'Eres el único miembro: el party se borrará.',
    'Salir', async () => {
      await rpc('cam_party_leave', {p_party: p.id});
      changed();
      afterRemoval();
    }), 'is-danger'));
  if (p.is_owner || p.is_admin) items.push(item(p.is_owner ? 'Borrar party' : 'Borrar party (moderación)', () => confirmSheet('Borrar party', '«' + p.name + '» se borrará para todos. No se puede deshacer.', 'Borrar', async () => {
    await rpc('cam_party_delete', {p_party: p.id});
    changed();
    afterRemoval();
  }), 'is-danger'));
  const list = el('div', null, 'cam-party-sheet-list');
  list.append(...items);
  sheet('Opciones', list, anchor);
}
function afterRemoval() {
  S.data = null; S.partyId = null;
  if (S.from === 'hub') backToHub();
  else if (S.from === 'admin') openAdmin();
  else closeDialog();
}
function openRename() {
  const p = S.data.party;
  const form = el('form', null, 'cam-party-form', {novalidate: true});
  const field = el('label', null, 'cam-party-field');
  const count = el('span', chars(p.name) + '/40', 'cam-party-count', {'aria-live': 'polite'});
  const top = el('span', null, 'cam-party-label-row');
  top.append(el('span', 'Nombre', 'cam-party-label'), count);
  const input = el('input', null, 'cam-party-input', {id: 'camPartyRename', type: 'text', autocomplete: 'off', maxlength: '120'});
  input.value = p.name;
  input.addEventListener('input', () => { const n = chars(cleanName(input.value)); count.textContent = n + '/40'; count.classList.toggle('is-over', n > 40); });
  field.append(top, input);
  const status = errorLine();
  const save = el('button', 'Guardar', 'cam-party-btn is-primary is-wide', {type: 'submit'});
  form.append(field, status, save);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const value = cleanName(input.value), n = chars(value);
    if (n < 3 || n > 40) { showError(status, 'El nombre debe tener entre 3 y 40 caracteres.'); return; }
    save.disabled = true;
    try {
      const r = await rpc('cam_party_rename', {p_party: p.id, p_name: value});
      p.name = r?.name || value;
      changed();
      const tab = S.tab; renderParty(); if (tab === 'activity') setTab('activity');
    } catch (err) { showError(status, message(err)); save.disabled = false; }
  });
  sheet('Renombrar', form, $('camPartyMenu'));
}
function openMembers() {
  const p = S.data.party;
  const list = el('ul', null, 'cam-party-members-list');
  const status = errorLine();
  for (const r of S.data.total || []) {
    const name = String(r.username || 'Aficionado').replace(/^@+/, '');
    const li = el('li', null, 'cam-party-member');
    li.append(face(name, r.user_id, 'cam-party-avatar is-small'), el('span', '@' + name, 'cam-party-member-name'));
    if (r.user_id === p.owner_id) li.append(el('span', 'Creador', 'cam-party-owner'));
    else li.append(button('Expulsar', 'cam-party-btn is-small is-danger', () => confirmSheet('Expulsar', '¿Sacar a @' + name + ' del party?', 'Expulsar', async () => {
      await rpc('cam_party_kick', {p_party: p.id, p_user: r.user_id});
      changed();
      closeSheet(false);
      await reloadParty();
    }), {'aria-label': 'Expulsar a @' + name}));
    list.append(li);
  }
  sheet('Miembros · ' + (S.data.total || []).length, [list, status], $('camPartyMenu'));
}

/* ---------- moderación (administradores) ---------- */
async function openAdmin() {
  S.view = 'admin';
  const list = el('div', null, 'cam-party-list', {'aria-live': 'polite'});
  list.append(line('Cargando…'));
  mount(frame({kicker: 'Solo administradores', title: 'Todos los parties', back: backToHub, body: list}));
  try {
    const rows = await rpc('cam_party_admin_list');
    if (S.view !== 'admin' || !list.isConnected) return;
    list.replaceChildren();
    if (!rows?.length) { list.append(line('No hay parties.')); return; }
    for (const p of rows) list.append(partyCard({...p, position: null}, () => openParty(p.id, 'admin'), kindLabel(p) + ' · @' + p.owner_name));
  } catch (e) { if (list.isConnected) list.replaceChildren(line(message(e))); }
}

/* ---------- perfil: pestaña «Mi grupo» ----------
   Propio: invitación a armar una party de quiniela (o «Tus parties de
   quiniela»), «Mi quiniela» compacta y «Otros parties»; debajo, «Mis
   jornadas» (cam-profile-quiniela.js).
   Público: sus parties visibles (Quiniela primero), su quiniela compacta y
   una línea para armar la tuya. Una llamada (cam_profile_party) por perfil;
   cambiar de pestaña no vuelve a llamar. */
const P = {userId: null, own: false, tab: null, data: null, error: '', req: 0, stale: false};
const profileNode = () => $('camProfileParties');
const SPORT_SHORT = {nfl: 'NFL', football: 'Fútbol'};
async function loadProfile() {
  const finishEntrance=window.camPageLoader?.begin?.();
  const req = ++P.req, id = P.userId;
  P.data = null; P.error = ''; P.stale = false;
  renderProfile();
  try {
    const d = await rpc('cam_profile_party', {p_user: id});
    if (req !== P.req) return;
    P.data = d || {parties: [], quiniela: {}, recent: []};
  } catch (e) {
    if (req !== P.req) return;
    P.error = message(e);
  }finally{finishEntrance?.();}
  renderProfile();
}
function block(title, cls) {
  const box = el('section', null, 'cam-pp-block' + (cls ? ' ' + cls : ''));
  if (title) box.append(el('h3', title, 'cam-pp-title'));
  return box;
}
function quinielaRows(q) {
  const list = el('div', null, 'cam-pp-standings');
  for (const [key, label] of [['nfl', 'NFL'], ['football', 'Fútbol']]) {
    const s = q?.[key];
    const row = P.own ? button('', 'cam-pp-standing', () => window.camGoQuiniela?.(key), {'aria-label': 'Jugar la quiniela ' + label}) : el('div', null, 'cam-pp-standing');
    row.append(el('span', label, 'cam-pp-standing-name'));
    if (s && s.position) {
      row.append(el('span', placeText(s.position, s.of), 'cam-pp-standing-rank'),
        el('span', Math.round(Number(s.points) || 0) + ' pts', 'cam-pp-standing-pts'),
        el('span', (Number(s.hits) || 0) + '/' + (Number(s.resolved) || 0), 'cam-pp-standing-hits', {'aria-label': (Number(s.hits) || 0) + ' aciertos de ' + (Number(s.resolved) || 0)}));
    } else row.append(el('span', 'Sin resultados', 'cam-pp-standing-none'));
    list.append(row);
  }
  return list;
}
function recentList(items) {
  const list = el('ol', null, 'cam-pp-recent', {'aria-label': 'Últimos pronósticos resueltos'});
  for (const it of items) {
    const li = el('li', null, 'cam-pp-recent-row ' + (it.state === 'won' ? 'is-won' : 'is-lost'));
    li.append(el('span', it.state === 'won' ? '✓' : '✗', 'cam-pp-mark', {'aria-label': it.state === 'won' ? 'Acierto' : 'Fallo'}));
    li.append(el('span', matchTitle(it), 'cam-pp-recent-match', {title: 'Eligió ' + (it.pick_label || '')}));
    li.append(el('span', it.state === 'won' ? '+' + Math.round(Number(it.points) || 0) : '0', 'cam-pp-recent-pts'));
    list.append(li);
  }
  return list;
}
function partyRow(p, weekly) {
  const open = p.id ? () => openParty(p.id, null) : null;
  const card = open ? button('', 'cam-party-card cam-pp-party', open) : el('div', null, 'cam-party-card cam-pp-party');
  const copy = el('span', null, 'cam-party-card-copy');
  copy.append(el('span', p.name, 'cam-party-card-name'));
  const meta = el('span', null, 'cam-party-card-meta');
  if (weekly) {
    meta.append(el('span', placeText(p.week_position, p.member_count) + ' · esta semana'));
    meta.append(el('span', membersText(p.member_count)));
  } else {
    meta.append(el('span', kindLabel(p) + (p.sport && p.sport !== 'all' ? ' · ' + SPORTS[p.sport] : '')));
    meta.append(el('span', placeText(p.position, p.member_count)));
  }
  copy.append(meta);
  if (P.own && p.show_on_profile === false) copy.append(el('span', 'Oculto en tu perfil', 'cam-party-card-tag cam-pp-hidden'));
  card.append(copy);
  if (open) {
    card.setAttribute('aria-label', p.name + ', ' + kindLabel(p) + ', ' + (weekly ? placeText(p.week_position, p.member_count) + ' esta semana' : placeText(p.position, p.member_count)));
    card.append(icon('chevron', 'cam-party-card-chevron'));
  }
  return card;
}
function renderProfile() {
  const node = profileNode();
  if (!node) return;
  if (P.tab !== 'party' || !P.userId || !$('aeProfileDialog')?.open) { node.hidden = P.tab !== 'party'; return; }
  node.hidden = false;
  if (!P.data) { node.replaceChildren(line(P.error || 'Cargando…', 'cam-party-profile-empty')); return; }
  const d = P.data, parties = Array.isArray(d.parties) ? d.parties : [];
  const quiniela = parties.filter(p => p.kind === 'quiniela'), others = parties.filter(p => p.kind !== 'quiniela');
  const q = d.quiniela || {}, recent = Array.isArray(d.recent) ? d.recent : [];
  const played = Boolean(q.nfl?.position || q.football?.position);
  const nodes = [];
  if (P.own) {
    // 1 · Invitación (o «Tus parties de quiniela»).
    const invite = block(quiniela.length ? 'Tus parties de quiniela' : '¿Ya tienes tu grupo de quiniela?', 'cam-pp-invite');
    if (quiniela.length) {
      const list = el('div', null, 'cam-party-profile-list');
      for (const p of quiniela) list.append(partyRow(p, true));
      const other = button('Crear otra', 'cam-pp-link', () => openCreate('quiniela', 'all'));
      other.prepend(icon('plus'));
      invite.append(list, other);
    } else {
      invite.prepend(el('span', null, 'cam-pp-emblem'));
      invite.firstChild.append(icon('users'));
      invite.append(line('Arma un grupo con tus amigos y compitan cada semana con su propia clasificación.', 'cam-pp-text'));
      const actions = el('div', null, 'cam-party-actions');
      const create = button('Crear party', 'cam-party-btn is-primary', () => openCreate('quiniela', 'all'));
      create.prepend(icon('plus'));
      const join = button('Unirme con código', 'cam-party-btn', () => { S.context.kind = 'quiniela'; openJoin(); });
      join.prepend(icon('ticket'));
      actions.append(create, join);
      invite.append(actions);
    }
    nodes.push(invite);
    // 2 · Mi quiniela. Los pronósticos, jornada a jornada, van al final de
    // esta pestaña («Mis jornadas», cam-profile-quiniela.js).
    const mine = block('Mi quiniela', 'cam-pp-quiniela');
    mine.append(quinielaRows(q));
    const sport = d.last_sport === 'football' ? 'football' : 'nfl';
    mine.append(button('Jugar esta semana ›', 'cam-party-btn is-wide cam-pp-play', () => window.camGoQuiniela?.(sport)));
    nodes.push(mine);
    // 3 · Otros parties.
    if (others.length) {
      const box = block('Otros parties', 'cam-pp-others');
      const list = el('div', null, 'cam-party-profile-list');
      for (const p of others) list.append(partyRow(p, false));
      box.append(list);
      nodes.push(box);
    }
  } else {
    if (parties.length) {
      const box = block('Parties', 'cam-pp-others');
      const list = el('div', null, 'cam-party-profile-list');
      for (const p of parties) list.append(partyRow(p, false));
      box.append(list);
      nodes.push(box);
    }
    if (played) {
      const box = block('Quiniela', 'cam-pp-quiniela');
      box.append(quinielaRows(q));
      if (recent.length) box.append(recentList(recent));
      nodes.push(box);
    }
    if (!parties.length && !played) nodes.push(line('@' + String(document.getElementById('aeProfileTitle')?.textContent || '').replace(/^@+/, '') + ' todavía no ha participado', 'cam-party-profile-empty'));
    const cta = button('¿Juegas la quiniela? Arma tu grupo ›', 'cam-pp-link cam-pp-cta', () => armYourParty());
    nodes.push(cta);
  }
  node.replaceChildren(...nodes);
  // El perfil espera a esto para bajar hasta «Mis jornadas» si se pidió.
  document.dispatchEvent(new CustomEvent('cam:profile-party-rendered'));
}
// Desde un perfil ajeno: con sesión, crear tu grupo de quiniela; sin sesión,
// iniciar sesión y volver a la invitación de tu pestaña «Mi grupo».
async function armYourParty() {
  if (await currentUser()) { openCreate('quiniela', 'all'); return; }
  window.closeAeProfile?.();
  requireLogin(() => window.openAeProfile?.('party'), 'Para armar tu grupo, inicia sesión o crea una cuenta. Después volverás a la invitación.');
}
document.addEventListener('cam:profile-view', e => {
  const d = e.detail || {};
  if (!d.userId) { P.userId = null; P.data = null; P.req++; P.tab = null; const n = profileNode(); if (n) { n.replaceChildren(); n.hidden = true; } return; }
  const changedUser = d.userId !== P.userId || Boolean(d.own) !== P.own;
  P.userId = d.userId; P.own = Boolean(d.own); P.tab = d.tab;
  if (changedUser) { P.req++; P.data = null; P.error = ''; P.stale = true; }
  if (P.tab === 'party' && (P.stale || (!P.data && !P.error))) loadProfile();
  else renderProfile();
});

/* Tras crear, unirse, salir, renombrar… la pestaña «Mi grupo» se pone al día
   (una llamada si está abierta; si no, al volver a ella). */
function changed() {
  S.mineStale = true;
  if (P.userId && P.own) {
    P.stale = true;
    if (P.tab === 'party' && $('aeProfileDialog')?.open) loadProfile();
  }
  document.dispatchEvent(new CustomEvent('cam:parties-changed'));
}

/* ---------- accesos «Mis grupos» junto a las clasificaciones ---------- */
function entry(id, label, onClick) {
  const row = el('div', null, 'cam-party-entry-row', {id});
  const b = button('', 'cam-party-entry', onClick, {'aria-label': label});
  b.append(icon('users'), el('span', 'Mis grupos'), icon('chevron', 'cam-party-entry-chevron'));
  row.append(b);
  return row;
}
function sportNow() {
  try { return currentCategory === 'NFL' ? 'nfl' : currentCategory === 'Fútbol' ? 'football' : 'all'; }
  catch { return 'all'; }
}
function mountEntries() {
  const chefs = document.querySelector('.ae-chefs-dual-standings');
  if (chefs && !$('camPartyEntryPicks')) chefs.before(entry('camPartyEntryPicks', 'Mis grupos de Picks', () => openHub('picks', 'all')));
  const twin = $('aeNflTwinRankings');
  if (twin && !$('camPartyEntryTakes')) twin.prepend(entry('camPartyEntryTakes', 'Mis grupos de Takes', () => openHub('takes', sportNow())));
  // Quinielas: también se juegan en grupo.
  for (const [root, id, sport] of [['camNflQuiniela', 'camPartyEntryQuinielaNfl', 'nfl'], ['camFootballQuiniela', 'camPartyEntryQuinielaFootball', 'football']]) {
    const section = $(root);
    if (!section || $(id)) continue;
    const row = entry(id, 'Mis grupos de Quiniela', () => openHub('quiniela', sport));
    row.classList.add('is-quiniela');
    section.append(row);
  }
}

/* ---------- arranque ---------- */
function startFromUrl() {
  const raw = new URL(location.href).searchParams.get('party');
  if (raw) { openInvite(raw, {from: 'link'}); return; }
  // Volver sola a la invitación si la página se recargó al iniciar sesión.
  const pending = readPending();
  if (CODE_RE.test(pending)) currentUser().then(user => { if (user && !dialog?.open) openInvite(pending, {from: 'link'}); });
}
function init() {
  mountEntries();
  startFromUrl();
  window.addEventListener('popstate', () => {
    const raw = new URL(location.href).searchParams.get('party');
    if (raw && !(dialog?.open && S.view === 'invite' && S.invite?.code === cleanCode(raw))) openInvite(raw, {from: 'link'});
  });
}
window.camParties = {openHub, openParty, openInvite, openCreate, openJoin, inviteLink, _state: () => S};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once: true});
else init();
})();
