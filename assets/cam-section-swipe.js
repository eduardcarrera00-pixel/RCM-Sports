/* CAM SPORTS — deslizar entre apartados con el dedo (12 nov 2026, pedido de Eduard).
   NFL y Fútbol (La semana · Takes · Noticias), Picks (Picks · Chefs · Historial)
   y Actualidad (Todas · NFL · Fútbol · Colegial · Ciclismo): arrastrar el
   contenido hacia la izquierda abre el apartado siguiente y hacia la derecha el
   anterior. Del último se pasa al primero, y del primero al último.

   Para que no salte sin querer:
     · solo cuenta un gesto claramente de lado (menos de unos 30° de inclinación);
       subir o bajar la página sigue igual que siempre;
     · hay que arrastrar al menos el 22 % del ancho (unos 85 px en un teléfono)
       o hacer un gesto rápido y decidido; si se suelta antes, todo vuelve a su sitio;
     · no actúa sobre lo que ya se desliza de lado (cinta del ranking, carruseles,
       portada de Actualidad…), campos de texto, ventanas abiertas, los bordes de
       la pantalla (el gesto «Atrás» del teléfono) ni con la página ampliada.

   El cambio lo hace el propio botón de la pestaña, así que todo funciona igual
   que al tocarla (dirección ?s=…&v=…, botón Atrás, medición). Mientras se
   arrastra, el contenido acompaña un poco al dedo y en el borde asoma el nombre
   del apartado al que se va. Con «reducir movimiento» no hay animación.
   Nada se mueve de sitio en el documento: solo estilos en línea temporales.

   Enseñar el gesto (12 nov 2026, pedido de Eduard): al entrar en un área con
   apartados, tras 1,5 s sin tocar nada, el contenido amaga un deslizamiento y
   asoma el siguiente apartado («Takes ›»); luego todo vuelve a su sitio. Sin
   flechas fijas en pantalla. Si sigue sin deslizar, una última vez a los 45 s,
   cuando esté en una de estas áreas. Como mucho 3 visitas en días
   distintos, y nunca más en cuanto la persona desliza una vez. Solo en pantallas
   táctiles. Con «reducir movimiento», un texto discreto bajo las pestañas. */
(() => {
  'use strict';

  const main = document.getElementById('mainContent');
  if (!main) return;

  const LOCK = 8;             // px recorridos antes de decidir hacia dónde va el gesto
  const SLOPE = 0.58;         // |dy| / |dx| máximo para tomarlo como horizontal (≈ 30°)
  const EDGE = 18;            // px de cada borde reservados al gesto del sistema
  const COMMIT = 0.22;        // fracción del ancho que hay que arrastrar…
  const COMMIT_MIN = 72;      // …y nunca menos de estos px
  const FLICK_SPEED = 0.55;   // px/ms de un gesto rápido
  const FLICK_MIN = 40;       // px mínimos de un gesto rápido
  const REGRET = 32;          // px que el dedo vuelve atrás desde lo más lejos para anular
  const FOLLOW = 0.42;        // cuánto acompaña el contenido al dedo
  const OUT_MS = 150, IN_MS = 260, BACK_MS = 220;
  const MOVED = ['transform', 'opacity', 'transition', 'will-change'];

  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => Boolean(motion && motion.matches);
  const now = () => (window.performance && performance.now ? performance.now() : Date.now());

  // ---------- Dónde se puede deslizar ----------
  function pack(kind, root, bar, tabs, index) {
    return tabs.length > 1 && index >= 0 ? { kind, root, bar, tabs, index } : null;
  }
  function context() {
    const bar = document.getElementById('camSectionTabs');
    if (bar && !bar.hidden && document.body.dataset.camTabs && bar.getClientRects().length) {
      const tabs = [...bar.querySelectorAll('button.cam-section-tab')];
      return pack('section', main, bar, tabs, tabs.findIndex(b => b.getAttribute('aria-current') === 'true'));
    }
    const opinions = document.getElementById('aeOpinions');
    const strip = document.getElementById('aeOpinionsTabs');
    if (opinions && strip && !opinions.hidden && opinions.getClientRects().length) {
      const tabs = [...strip.querySelectorAll('[role="tab"]')];
      return pack('actualidad', opinions, strip, tabs, tabs.findIndex(b => b.getAttribute('aria-selected') === 'true'));
    }
    return null;
  }

  const BLOCK = 'input, textarea, select, option, [contenteditable=""], [contenteditable="true"], [role="slider"], ' +
    'video, audio, canvas, iframe, dialog, [role="dialog"], [aria-modal="true"], [data-cam-no-swipe]';

  // Algo que ya se desliza de lado (carrusel, cinta, barra de pestañas larga) se queda su gesto.
  function scrollsSideways(node, root) {
    for (let el = node instanceof Element ? node : node && node.parentElement; el; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1) {
        const x = getComputedStyle(el).overflowX;
        if (x === 'auto' || x === 'scroll') return true;
      }
      if (el === root) break;
    }
    return false;
  }
  function pageLocked() {
    if (document.querySelector('dialog[open]')) return true;
    for (const el of [document.documentElement, document.body]) {
      const s = getComputedStyle(el);
      if (s.overflowY === 'hidden' || s.position === 'fixed') return true;   // una ventana bloquea la página
    }
    return false;
  }
  function typing() {
    const a = document.activeElement;
    if (!a || a === document.body) return false;
    if (a.isContentEditable || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') return true;
    return a.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(a.type || '');
  }
  const zoomed = () => Boolean(window.visualViewport && window.visualViewport.scale > 1.02);
  function selecting() {
    try { const s = window.getSelection(); return Boolean(s && !s.isCollapsed && String(s).trim()); } catch { return false; }
  }

  // ---------- Lo que se mueve ----------
  function movers(ctx) {
    return [...ctx.root.children].filter(el => el !== ctx.bar && el.getClientRects().length > 0);
  }
  const saved = new WeakMap();   // estilos en línea que ya tenía cada bloque, para devolverlos tal cual
  function remember(el) {
    if (saved.has(el)) return;
    saved.set(el, MOVED.map(p => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]));
  }
  function place(els, x, opacity, ms = 0, ease = 'ease') {
    for (const el of els) {
      remember(el);
      const s = el.style;
      s.setProperty('transition', ms ? `transform ${ms}ms ${ease}, opacity ${ms}ms ${ease}` : 'none', 'important');
      s.setProperty('transform', `translate3d(${x.toFixed(1)}px,0,0)`, 'important');
      s.setProperty('opacity', String(Math.round(opacity * 1000) / 1000), 'important');
      s.setProperty('will-change', 'transform, opacity');
    }
  }
  function release(els) {
    for (const el of els) {
      const before = saved.get(el);
      if (!before) continue;
      saved.delete(el);
      for (const [p, value, priority] of before) {
        if (value) el.style.setProperty(p, value, priority);
        else el.style.removeProperty(p);
      }
    }
  }

  // ---------- El aviso del borde («Takes ›») ----------
  let peek = null, peekTimer = 0;
  function peekEl() {
    if (peek) return peek;
    peek = document.createElement('div');
    peek.className = 'cam-swipe-peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.hidden = true;
    document.body.append(peek);
    return peek;
  }
  function showPeek(label, side, progress) {
    const p = peekEl();
    clearTimeout(peekTimer);
    if (p.dataset.side !== side || p.dataset.label !== label) {
      p.dataset.side = side;
      p.dataset.label = label;
      const text = document.createElement('span');
      text.className = 'cam-swipe-peek-label';
      text.textContent = label;
      const arrow = document.createElement('span');
      arrow.className = 'cam-swipe-peek-arrow';
      arrow.textContent = side === 'end' ? '›' : '‹';
      p.replaceChildren(...(side === 'end' ? [text, arrow] : [arrow, text]));
    }
    p.classList.remove('is-settling', 'is-gone');
    p.classList.toggle('is-ready', progress >= 1);
    p.style.setProperty('--cam-swipe-p', String(Math.round(Math.min(1, progress) * 1000) / 1000));
    p.hidden = false;
  }
  function hidePeek(accepted) {
    if (!peek || peek.hidden) return;
    const p = peek;
    p.classList.add('is-settling');
    if (accepted) p.classList.add('is-gone');
    else p.style.setProperty('--cam-swipe-p', '0');
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => { p.hidden = true; p.classList.remove('is-settling', 'is-gone', 'is-ready'); }, BACK_MS + 30);
  }

  // ---------- El gesto ----------
  let g = null;               // gesto en curso
  let busy = false;           // animando un cambio
  let raf = 0, settleTimer = 0;
  let returning = null;       // bloques que aún vuelven a su sitio tras un gesto anulado
  let quietClicksUntil = 0;   // tras arrastrar, el dedo no "toca" lo que hay debajo

  const travelOf = s => Math.max(0, Math.abs(s.dx) - LOCK);
  const needed = s => Math.max(COMMIT_MIN, s.w * COMMIT);
  function offsetOf(s) {
    if (reduced()) return 0;
    const cap = s.w * 0.32;
    return Math.sign(s.dx) * cap * (1 - Math.exp(-travelOf(s) * FOLLOW / cap));
  }
  function targetOf(s) {
    const step = s.dx < 0 ? 1 : -1;   // dedo a la izquierda → siguiente
    const n = s.ctx.tabs.length;
    return s.ctx.tabs[(s.ctx.index + step + n) % n];
  }
  function find(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
    return null;
  }
  function sample(s, x) {
    const t = now();
    s.samples.push([t, x]);
    while (s.samples.length > 2 && t - s.samples[0][0] > 100) s.samples.shift();
  }
  function velocity(s) {
    const a = s.samples[0], b = s.samples[s.samples.length - 1];
    const dt = b[0] - a[0];
    return dt > 8 ? (b[1] - a[1]) / dt : 0;
  }

  function paint() {
    raf = 0;
    if (!g || g.state !== 'drag') return;
    const progress = travelOf(g) / needed(g);
    // Con «reducir movimiento» el contenido no se mueve: solo asoma el aviso del borde.
    if (!reduced()) place(g.movers, offsetOf(g), 1 - 0.25 * Math.min(1, progress));
    if (!progress) { hidePeek(false); return; }   // el dedo volvió al punto de partida
    showPeek(targetOf(g).textContent.trim(), g.dx < 0 ? 'end' : 'start', progress);
  }

  function abort() {
    const s = drop();
    if (s && s.state === 'drag') back(s);
  }

  function back(s) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    hidePeek(false);
    if (reduced()) { release(s.movers); return; }
    place(s.movers, 0, 1, BACK_MS, 'cubic-bezier(.2,.8,.2,1)');
    clearTimeout(settleTimer);
    returning = s.movers;
    settleTimer = setTimeout(() => { release(s.movers); returning = null; }, BACK_MS + 40);
  }
  // Un gesto nuevo antes de que termine la vuelta: se deja todo en su sitio primero.
  function settleNow() {
    clearTimeout(settleTimer);
    if (returning) { release(returning); returning = null; }
  }

  function go(s) {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    const ctx = s.ctx;
    const target = targetOf(s);
    const way = Math.sign(s.dx) || -1;
    const from = ctx.tabs[ctx.index];
    busy = true;
    learned();                // ya sabe deslizar: no se le vuelve a enseñar
    hidePeek(true);
    settleNow();

    const swap = () => {
      // Actualidad sube al principio de la sección igual que al tocar la pestaña,
      // pero de golpe mientras el contenido está oculto (sin recorrer la página).
      if (ctx.kind === 'actualidad') {
        const top = parseFloat(getComputedStyle(ctx.root).getPropertyValue('--cam-act-sticky-top')) || 0;
        const start = ctx.root.getBoundingClientRect().top + window.scrollY - top;
        if (window.scrollY > start + 2) window.scrollTo({ top: Math.max(0, start), left: 0, behavior: 'instant' });
      }
      try { target.click(); } catch {}
      const after = context();
      const next = after ? movers(after) : [];
      release(s.movers.filter(el => !next.includes(el)));
      document.dispatchEvent(new CustomEvent('cam:section-swipe', {
        detail: { area: ctx.kind, from: from && (from.dataset.tab || from.dataset.sport), to: target.dataset.tab || target.dataset.sport, way: way < 0 ? 'next' : 'previous' }
      }));
      if (reduced() || !next.length) { release(next); busy = false; return; }
      // El apartado nuevo entra desde el lado contrario, suave.
      place(next, -way * Math.min(36, s.w * 0.09), 0);
      void next[0].offsetWidth;
      place(next, 0, 1, IN_MS, 'cubic-bezier(.2,.7,.2,1)');
      settleTimer = setTimeout(() => { release(next); busy = false; }, IN_MS + 40);
    };

    if (reduced()) { release(s.movers); swap(); return; }
    const out = way * Math.max(Math.abs(offsetOf(s)) + 24, s.w * 0.16);
    place(s.movers, out, 0, OUT_MS, 'cubic-bezier(.4,0,1,1)');
    settleTimer = setTimeout(swap, OUT_MS);
  }

  function finish(s, lastX) {
    if (s.state !== 'drag') return;
    if (typeof lastX === 'number') { s.dx = lastX - s.x0; sample(s, lastX); }
    quietClicksUntil = now() + 400;
    const travel = travelOf(s);
    const v = velocity(s);
    const sameWay = Math.sign(v) === Math.sign(s.dx);
    // Quien tira, se arrepiente y vuelve el dedo atrás antes de soltar, se queda donde estaba.
    const regret = !sameWay && (Math.abs(v) > 0.3 || s.peak - travel >= REGRET);
    const flick = sameWay && Math.abs(v) >= FLICK_SPEED && travel >= FLICK_MIN;
    if ((travel >= needed(s) && !regret) || flick) go(s);
    else back(s);
  }

  // Si la página repinta el bloque que está bajo el dedo (Actualidad, marcadores en
  // vivo), los toques siguen llegando a ese bloque aunque ya no esté en la página y
  // no suben hasta #mainContent: por eso el gesto se escucha también en él.
  // Cada toque se atiende una sola vez aunque llegue por los dos caminos.
  const handled = new WeakSet();
  const once = event => !handled.has(event) && Boolean(handled.add(event));

  function watch(s) {
    const node = s.node;
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd, { passive: true });
    node.addEventListener('touchcancel', onCancel, { passive: true });
  }
  function unwatch(s) {
    if (!s || !s.node) return;
    s.node.removeEventListener('touchmove', onMove, { passive: false });
    s.node.removeEventListener('touchend', onEnd, { passive: true });
    s.node.removeEventListener('touchcancel', onCancel, { passive: true });
  }

  function onMove(event) {
    if (!g || !once(event)) return;
    if (event.touches.length > 1) { abort(); return; }
    const t = find(event.touches, g.id);
    if (!t) return;
    const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    if (g.state === 'pending') {
      if (Math.hypot(dx, dy) < LOCK) return;
      // De arriba abajo (o en diagonal) es desplazar la página: no se toca.
      if (Math.abs(dy) > Math.abs(dx) * SLOPE || !event.cancelable || selecting()) { drop(); return; }
      g.state = 'drag';
      settleNow();
      g.movers = movers(g.ctx);
    }
    if (event.cancelable) event.preventDefault();
    g.dx = dx;
    if (Math.sign(dx) !== g.side) { g.side = Math.sign(dx); g.peak = 0; }   // cambió de lado: otro destino
    g.peak = Math.max(g.peak, travelOf(g));
    sample(g, t.clientX);
    if (!raf) raf = requestAnimationFrame(paint);
  }
  function onEnd(event) {
    if (!g || !once(event)) return;
    const t = find(event.changedTouches, g.id);
    if (!t) return;
    const s = drop();
    finish(s, t.clientX);
  }
  function onCancel(event) {
    if (g && once(event)) abort();
  }
  function drop() {
    const s = g;
    g = null;
    unwatch(s);
    return s;
  }

  main.addEventListener('touchstart', event => {
    if (g && event.touches.length > 1) { abort(); return; }   // un segundo dedo: pellizco, no deslizamiento
    if (g) abort();                                            // un gesto anterior que no llegó a cerrarse
    if (busy || event.touches.length !== 1) return;
    const t = event.touches[0];
    const width = document.documentElement.clientWidth || window.innerWidth;
    if (t.clientX < EDGE || t.clientX > width - EDGE) return;
    const ctx = context();
    if (!ctx || !ctx.root.contains(event.target)) return;
    const node = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!node || node.closest(BLOCK) || scrollsSideways(node, ctx.root)) return;
    if (pageLocked() || typing() || zoomed() || selecting()) return;
    g = { ctx, node: event.target, id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, side: 0, peak: 0, w: width, state: 'pending', movers: [], samples: [] };
    sample(g, t.clientX);
    watch(g);
  }, { passive: true });

  // El oyente de #mainContent (no pasivo) es el que permite frenar el desplazamiento
  // de la página cuando el gesto es de lado.
  main.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onEnd, { capture: true, passive: true });
  window.addEventListener('touchcancel', onCancel, { capture: true, passive: true });
  window.addEventListener('blur', () => abort());
  document.addEventListener('visibilitychange', () => { if (document.hidden) abort(); });

  document.addEventListener('click', event => {
    if (event.isTrusted && now() < quietClicksUntil) {
      quietClicksUntil = 0;
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  // ---------- Enseñar el gesto ----------
  const LEARNED = 'cam_swipe_learned_v1';        // '1' en cuanto desliza una vez
  const SHOWN = 'cam_swipe_hint_v1';             // { count, day }: visitas en que se enseñó
  const SESSION = 'cam_swipe_hint_session_v1';   // { n, at }: veces en esta visita y cuándo la primera
  const HINT_MAX = 3, HINT_IDLE = 1500, HINT_WINDOW = 12000;
  const SECOND_AFTER = 45 * 1000;               // la segunda y última vez, 45 s después de la primera (pedido de Eduard)
  const SECOND_WAIT = 60 * 1000;                 // llegado ese momento, hasta 1 min esperando un momento de calma
  const NUDGE_IN = 420, NUDGE_HOLD = 650, NUDGE_OUT = 480, TIP_MS = 2600;
  const touchscreen = window.matchMedia ? window.matchMedia('(hover: none) and (pointer: coarse)') : null;

  function read(area, key) { try { return window[area].getItem(key); } catch { return null; } }
  function write(area, key, value) { try { window[area].setItem(key, value); } catch {} }
  function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function seen() { try { return JSON.parse(read('localStorage', SHOWN) || '{}') || {}; } catch { return {}; } }

  let memVisit = null;          // por si el navegador no guarda nada (modo privado)
  let hint = null, hintTimer = 0, hintUntil = 0, hintKey = '', tip = null, secondTimer = 0;

  // La visita (la pestaña abierta): cuántas veces se enseñó ya y cuándo fue la primera.
  function visit() {
    const raw = read('sessionStorage', SESSION);
    if (raw === '1') return { n: 2, at: 0 };          // formato anterior (12 nov): ya cumplido
    if (raw) { try { const v = JSON.parse(raw); if (v && typeof v.n === 'number') return v; } catch {} }
    return memVisit || { n: 0, at: 0 };
  }
  function saveVisit(v) { memVisit = v; write('sessionStorage', SESSION, JSON.stringify(v)); }

  function learned() {
    write('localStorage', LEARNED, '1');
    endHint();
    hintUntil = 0;
    clearTimeout(hintTimer);
    clearTimeout(secondTimer);
  }
  function hintAllowed() {
    if (!touchscreen || !touchscreen.matches) return false;
    if (read('localStorage', LEARNED) === '1') return false;
    const v = visit();
    if (v.n >= 2) return false;
    if (v.n === 1) return Date.now() - v.at >= SECOND_AFTER;   // la última vez
    const s = seen();
    return (s.count || 0) < HINT_MAX && s.day !== today();
  }
  // A los 45 s: si está en una de estas áreas, se enseña en el siguiente momento
  // de calma; si no, al volver a entrar en una (considerHint).
  function armSecond(delay) {
    clearTimeout(secondTimer);
    secondTimer = setTimeout(() => {
      if (hint || !hintAllowed()) return;
      const key = areaKey();
      if (!key) return;
      hintKey = key;
      hintUntil = now() + SECOND_WAIT;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(tryHint, HINT_IDLE);
    }, Math.max(0, delay));
  }
  function loading() {
    if (document.documentElement.classList.contains('cam-booting')) return true;
    const loader = document.getElementById('camPageLoader');
    return Boolean(loader && getComputedStyle(loader).display !== 'none');
  }

  // Al entrar en un área (no al cambiar de apartado dentro de ella) se programa el aviso.
  function areaKey() {
    const body = document.body;
    if (body.dataset.camTabs) return 'sec:' + (body.dataset.camSection || '');
    return body.classList.contains('ae-is-opinions') ? 'act' : '';
  }
  function considerHint() {
    const key = areaKey();
    if (key === hintKey) return;
    hintKey = key;
    endHint();
    clearTimeout(hintTimer);
    hintUntil = 0;
    if (!key || !hintAllowed()) return;
    hintUntil = now() + HINT_WINDOW;
    hintTimer = setTimeout(tryHint, HINT_IDLE);
  }
  // Cualquier toque, rueda, tecla o desplazamiento: si el aviso está en marcha se
  // quita al momento; si aún no salió, espera otros 1,5 s de calma (hasta 12 s).
  function postpone() {
    if (hint) { endHint(); return; }
    if (!hintUntil) return;
    clearTimeout(hintTimer);
    if (now() + HINT_IDLE > hintUntil) { hintUntil = 0; return; }   // no hubo calma: en otra visita
    hintTimer = setTimeout(tryHint, HINT_IDLE);
  }

  function tryHint() {
    hintTimer = 0;
    if (hint || g || busy || !hintAllowed() || areaKey() !== hintKey) return;
    const ctx = context();
    if (!ctx || document.hidden || loading() || pageLocked() || typing() || zoomed()) { postpone(); return; }
    const els = movers(ctx);
    const visible = els.some(el => { const r = el.getBoundingClientRect(); return r.height > 40 && r.bottom > 0 && r.top < window.innerHeight; });
    if (!visible) { postpone(); return; }

    hintUntil = 0;
    const v = visit();
    if (v.n === 0) {
      const s = seen();
      write('localStorage', SHOWN, JSON.stringify({ count: (s.count || 0) + 1, day: today() }));
      saveVisit({ n: 1, at: Date.now() });
      armSecond(SECOND_AFTER);
    } else {
      saveVisit({ n: 2, at: v.at });
    }
    const label = ctx.tabs[(ctx.index + 1) % ctx.tabs.length].textContent.trim();
    hint = { els: [], timers: [] };
    document.dispatchEvent(new CustomEvent('cam:section-swipe-hint', { detail: { area: ctx.kind, style: reduced() ? 'text' : 'nudge', time: v.n + 1 } }));

    if (reduced()) { showTip(ctx); return; }

    // El contenido amaga hacia la izquierda y asoma el siguiente apartado.
    const w = document.documentElement.clientWidth || window.innerWidth;
    const shift = -Math.min(28, w * 0.07);
    hint.els = els;
    place(els, 0, 1);
    const p = peekEl();
    showPeek(label, 'end', 0);
    p.classList.add('is-hint');
    void p.offsetWidth;
    const h = hint;
    requestAnimationFrame(() => {
      if (hint !== h) return;
      place(els, shift, 1, NUDGE_IN, 'cubic-bezier(.3,0,.2,1)');
      p.style.setProperty('--cam-swipe-p', '1');
    });
    h.timers.push(setTimeout(() => {
      if (hint !== h) return;
      place(els, 0, 1, NUDGE_OUT, 'cubic-bezier(.4,0,.2,1)');
      p.style.setProperty('--cam-swipe-p', '0');
    }, NUDGE_IN + NUDGE_HOLD));
    h.timers.push(setTimeout(endHint, NUDGE_IN + NUDGE_HOLD + NUDGE_OUT + 40));
  }

  // «Reducir movimiento»: una frase bajo las pestañas que aparece y se va sola.
  function showTip(ctx) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'cam-swipe-tip';
      tip.setAttribute('aria-hidden', 'true');
      tip.textContent = 'Desliza para cambiar ›';
      document.body.append(tip);
    }
    const bottom = ctx.bar.getBoundingClientRect().bottom;
    tip.style.top = Math.round(Math.max(12, bottom) + 10) + 'px';
    tip.hidden = false;
    void tip.offsetWidth;
    tip.classList.add('is-on');
    const h = hint;
    h.timers.push(setTimeout(() => { if (hint === h) tip.classList.remove('is-on'); }, TIP_MS));
    h.timers.push(setTimeout(endHint, TIP_MS + 320));
  }

  function endHint() {
    if (!hint) return;
    const h = hint;
    hint = null;
    h.timers.forEach(clearTimeout);
    release(h.els);
    if (peek && peek.classList.contains('is-hint')) {
      clearTimeout(peekTimer);
      peek.hidden = true;
      peek.classList.remove('is-hint', 'is-ready', 'is-settling', 'is-gone');
      peek.style.setProperty('--cam-swipe-p', '0');
    }
    if (tip) { tip.classList.remove('is-on'); tip.hidden = true; }
  }

  for (const type of ['touchstart', 'wheel', 'keydown', 'pointerdown']) {
    window.addEventListener(type, postpone, { capture: true, passive: true });
  }
  window.addEventListener('scroll', postpone, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) postpone(); });
  // La pantalla de carga tapa la sección al entrar: el 1,5 s se cuenta desde que se va.
  const calmAgain = () => { if (!hint) postpone(); };
  new MutationObserver(calmAgain).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  const loaderEl = document.getElementById('camPageLoader');
  if (loaderEl) new MutationObserver(calmAgain).observe(loaderEl, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  let considerQueued = false;
  new MutationObserver(() => {
    if (considerQueued) return;
    considerQueued = true;
    requestAnimationFrame(() => { considerQueued = false; considerHint(); });
  }).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-cam-tabs', 'data-cam-section'] });
  considerHint();   // enlace directo (?s=nfl)
  { const v = visit(); if (v.n === 1) armSecond(v.at + SECOND_AFTER - Date.now()); }   // al recargar la página

  window.camSectionSwipe = Object.freeze({
    area: () => { const ctx = context(); return ctx ? { area: ctx.kind, tabs: ctx.tabs.length, index: ctx.index } : null; },
    busy: () => busy || Boolean(g && g.state === 'drag'),
    hinting: () => Boolean(hint)
  });
})();
