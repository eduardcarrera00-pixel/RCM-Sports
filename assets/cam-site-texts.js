/* CAM SPORTS · Textos fijos editables desde el Modo Edición global.
   Solo los elementos explícitamente registrados. Sin innerHTML para datos editados.
   Mismos permisos de editores y RPC autorizados en PostgreSQL. */
(() => {
  'use strict';
  if (window.camSiteTexts) return;
  const CACHE = 'cam_site_texts_v2';
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const ITEMS = [
    ['home.take.cta',' .cam-home-take-square-label','Home · Demuestra tu conocimiento · Botón'],
    ['home.take.popular','#aeHomeTakesPositiveTitle','Home · Popular Takes'],
    ['home.take.unpopular','#aeHomeTakesNegativeTitle','Home · Unpopular Takes'],
    ['home.take.genios','#aeTopTakesPositiveTitle','Home · Genios'],
    ['home.take.anoetos','#aeTopTakesNegativeTitle','Home · Anoetos'],
    ['home.take.historic','#aeHomeTakeHistoricTitle','Home · Take histórico'],
    ['home.pick.historic','#aeHomePickHistoricTitle','Home · Pick histórico'],
    ['home.pick.historic.description','#aeHomePickHistoric .ae-home-take-feature-intro','Home · Pick histórico · Descripción'],
    ['home.weekly.title','#weeklyPickTitle','Home · Pick del día'],
    ['home.nfl.rankings','#homeRankingTitle','Home · Power Rankings NFL'],
    ['home.champions.rankings','#homeChampionsTitle','Home · Power Rankings Champions'],
    ['home.trending','#trendingTitle','Home · Lo más leído'],
    ['home.opinadores','#communityTitle','Home · Opinadores distinguidos'],
    ['home.news.all','#aeHomeAllNewsButton','Home · Todas las noticias'],
    ['home.takes.historic.description','#aeHomeTakeHistoric .ae-home-take-feature-intro','Home · Take histórico · Descripción'],
    ['picks.editor','#picksFeaturedTitle','Picks · Pick del editor'],
    ['picks.publish','#cpPublishCta','Picks · Cocina tus Picks · Botón'],
    ['picks.best','#picksPopularTitle','Picks · Mejores Platos'],
    ['picks.worst','#picksQuestionedTitle','Picks · Peores Platos'],
    ['picks.best.caption','.ae-chef-best .ae-chef-recetario','Picks · Mejores Platos · Subtítulo'],
    ['picks.worst.caption','.ae-chef-worst .ae-chef-recetario','Picks · Peores Platos · Subtítulo'],
    ['picks.history','#cpSettleHistoryTitle','Picks · Historial'],
    ['picks.history.description','#cpSettleHistorySection .ae-pick-history-heading p','Picks · Historial · Descripción'],
    ['picks.ranking.best','#picksRankingTitle','Picks · Mejores Chefs'],
    ['picks.ranking.worst','#cpWorstRankingTitle','Picks · Peores Chefs'],
    ['picks.all','#cpArchiveTitle','Picks · Todos los Picks'],
    ['picks.composer','#cpComposeTitle','Picks · Prepara tu Pick'],
    ['picks.composer.hero','.cam-pick-hero__title','Picks · Instrucciones · Título'],
    ['picks.composer.how','.cam-pick-how__title','Picks · Cómo funcionan los Picks'],
    ['picks.composer.rules','.cam-pick-rules__lead','Picks · Reglas de puntos'],
    ['picks.table.label','.ae-pick-history-kicker','Picks · Resultados · Etiqueta'],
    ['news.title','#aeNewsPlainTitle','Noticias · Últimas noticias'],
    ['news.more','#aeMoreNewsTitle','Noticias · Más noticias'],
    ['footer.news.all','footer.bg-slate-900 .ae-footer-all-news','Footer · Todas las noticias'],
    ['footer.tagline','footer.bg-slate-900 .space-y-3 > p','Footer · Descripción de CAM SPORTS'],
    ['footer.categories','footer.bg-slate-900 h4','Footer · Categorías'],
    ['nfl.title','#rankingTitle','NFL · Clasificación'],
    ['nfl.savant','#aeNflSavantHeading','NFL · Savant'],
    ['nfl.rookie','#aeNflRookieHeading','NFL · Rookie'],
    ['nfl.overline','.ae-rank-overline','NFL · Cabecera'],
    ['football.champions.overline','.ae-champions-mobile-prefix','Fútbol · Champions · Cabecera'],
    ['takes.cta','#freeTakesTitle','NFL / Fútbol · Demuestra tu conocimiento'],
    ['takes.subtitle','#freeTakes .ae-takes-head > p','NFL / Fútbol · Instrucciones para Takes'],
    ['takes.publish','.cam-take-cta-text','NFL / Fútbol · Publicar Take'],
    ['takes.feed','#aeTakesFeedHeading','NFL / Fútbol · Últimos Takes'],
    ['takes.ranking','#aeSportTakeRankingTitle','NFL / Fútbol · Ranking'],
    ['takes.ranking.description','#aeSportTakeRankingDescription','NFL / Fútbol · Puntuación'],
    ['takes.genios','#aeSportGeniosTitle','NFL / Fútbol · Opiniones apoyadas'],
    ['takes.anoetos','#aeSportAnoetosTitle','NFL / Fútbol · Opiniones hateadas'],
    ['takes.season.overline','#aeSeasonOverline','Fútbol · Competición · Etiqueta'],
    ['takes.season.title','#aeSeasonTitle','Fútbol · ¿Quién será campeón?'],
    ['takes.composer.title','#aeTakeComposerTitle','Takes · Publicar mi Take'],
    ['takes.composer.notice','.cam-take-disclaimer__title','Takes · Instrucciones'],
    ['welcome.title','#camWelcomeTitle','Bienvenida · Título principal'],
    ['welcome.intro','#camWelcomeIntro','Bienvenida · Introducción'],
    ['welcome.overline','.cam-welcome-overline','Bienvenida · Eslogan'],
    ['welcome.outro','.cam-welcome-outro','Bienvenida · Mensaje final'],
    ['welcome.explore','#camWelcomeExplore','Bienvenida · Botón'],
    ['welcome.picks','.cam-welcome-feature[data-cam-welcome="picks"] > strong','Bienvenida · Cocina tus Picks'],
    ['welcome.picks.description','.cam-welcome-feature[data-cam-welcome="picks"] > span','Bienvenida · Picks · Descripción'],
    ['auth.title','#camAuthTitle','Acceso · Título principal'],
    ['auth.subtitle','.cam-auth-intro','Acceso · Introducción'],
    ['auth.overline','.cam-auth-story-overline','Acceso · Eslogan'],
    ['auth.privacy','#aeAuthPrivacyNote','Acceso · Privacidad'],
    ['profile.title','#aeProfileTitle','Perfil · Título principal'],
    ['profile.overview','#aeProfileOverviewText','Perfil · Introducción'],
    ['analytics.title','#camAnalyticsTitle','Administración · Analíticas'],
    ['notifications.title','#aeNotificationsTitle','Notificaciones · Título']
  ].map(([key, selector, location]) => ({key, selector:selector.trim(), location}));
  const rows = new Map(), originals = new Map(), originalsByElement = new WeakMap();
  const previewed = new Set();
  const originalStyles = new WeakMap(), pencils = new Map();
  const PROPS = ['font-size','text-align','font-weight','font-style','letter-spacing','line-height','color','max-width','position','left','top','padding','margin-bottom','white-space','overflow-wrap'];
  const PALETTE = {
    ink: {day:'#26323c',night:'#f2e9db'},
    bronze: {day:'#76502c',night:'#e6bd82'},
    blue: {day:'#245579',night:'#a8d5f3'},
    muted: {day:'#596672',night:'#d1dbe1'}
  };
  let overlay = null, dialog = null, editing = null, scheduled = false, loading = false, loaded = false, savePending = false;
  let writeRevision = 0;
  const $ = (sel, root=document) => root.querySelector(sel);
  const client = () => { try { return typeof db !== 'undefined' ? db : null; } catch { return null; } };
  const editOn = () => window.camGlobalEditMode?.isActive?.() === true;
  const dark = () => document.documentElement.classList.contains('dark');
  const mobile = () => matchMedia('(max-width: 767px)').matches;
  const validRow = r => r && typeof r.key === 'string' && ITEMS.some(d => d.key === r.key) &&
    (r.content == null || typeof r.content === 'string') && r.settings && typeof r.settings === 'object' && !Array.isArray(r.settings);
  function readCache() {
    try {
      const saved = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (!saved || !Number.isFinite(saved.savedAt) || Date.now() - saved.savedAt < 0 ||
          Date.now() - saved.savedAt >= CACHE_TTL_MS) { localStorage.removeItem(CACHE); return; }
      for (const r of saved.items || []) if (validRow(r)) rows.set(r.key, r);
    } catch {}
  }
  function writeCache() {
    try { localStorage.setItem(CACHE, JSON.stringify({savedAt:Date.now(),items:[...rows.values()]})); } catch {}
  }
  function nodeFor(el) {
    if (!el) return null;
    const nodes = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.data.trim());
    // No reemplazar HTML ni nodos de iconos/enlaces; solo un nodo de texto simple.
    return nodes.length === 1 ? nodes[0] : null;
  }
  function find(descriptor) {
    const el = $(descriptor.selector);
    const node = nodeFor(el);
    if (!node || el.closest('#camSiteTextDialog,.cam-site-text-layer')) return null;
    let base = originalsByElement.get(el);
    if (!base || base.node !== node) {
      base = {node,raw:node.data,clean:node.data.trim()};
      originalsByElement.set(el,base);
    }
    if (!originals.has(descriptor.key)) originals.set(descriptor.key,base.clean);
    if (!originalStyles.has(el)) {
      const m = {};
      for (const p of PROPS) m[p] = [el.style.getPropertyValue(p),el.style.getPropertyPriority(p)];
      originalStyles.set(el,m);
    }
    return {el,node,base};
  }
  function resetStyle(el, clearClass=true) {
    const saved = originalStyles.get(el);
    if (!saved) return;
    for (const p of PROPS) {
      if (saved[p][0]) el.style.setProperty(p,saved[p][0],saved[p][1]);
      else el.style.removeProperty(p);
    }
    if (clearClass) el.classList.remove('cam-site-text-custom');
  }
  const number = (settings, key) => Number.isFinite(settings[key]) ? settings[key] : null;
  function apply(descriptor, override=null) {
    const found = find(descriptor);
    if (!found) return;
    const {el,node,base} = found;
    const row = override || rows.get(descriptor.key);
    const original = originals.get(descriptor.key) || base.clean;
    // Si no hay personalización, respetar las modificaciones del motor de la página.
    if (!row) {
      if (previewed.has(descriptor.key)) { node.data=base.raw; previewed.delete(descriptor.key); }
      if (el.classList.contains('cam-site-text-custom')) resetStyle(el);
      return;
    }
    const content = typeof row.content === 'string' ? row.content : original;
    const leading = (base.raw.match(/^\s*/) || [''])[0];
    const trailing = (base.raw.match(/\s*$/) || [''])[0];
    const wanted = leading + content + trailing;
    if (node.data !== wanted) node.data = wanted;
    resetStyle(el,false);
    const s = row.settings || {}, narrow = mobile(), prefix = narrow ? 'mobile' : 'desktop';
    const set = (prop,v) => { if (v != null) el.style.setProperty(prop,String(v),'important'); };
    set('font-size',number(s,prefix+'Size') == null ? null : s[prefix+'Size']+'px');
    if (s[prefix+'Align'] && s[prefix+'Align'] !== 'inherit') set('text-align',s[prefix+'Align']);
    if (number(s,prefix+'Width') > 0) set('max-width',s[prefix+'Width']+'px');
    const x = number(s,prefix+'X'), y = number(s,prefix+'Y');
    if (x || y) {set('position','relative');set('left',(x || 0)+'px');set('top',(y || 0)+'px');}
    if (number(s,'weight') != null) set('font-weight',s.weight);
    if (typeof s.italic === 'boolean') set('font-style',s.italic ? 'italic' : 'normal');
    if (number(s,'letterSpacing') != null) set('letter-spacing',s.letterSpacing+'px');
    if (number(s,'lineHeight') != null) set('line-height',s.lineHeight);
    if (number(s,'padding') != null) set('padding',s.padding+'px');
    if (number(s,'gap') != null) set('margin-bottom',s.gap+'px');
    if (content.includes('\n')) set('white-space','pre-line');
    set('overflow-wrap','anywhere');
    const colorName = s[dark()?'colorNight':'colorDay'];
    if (colorName && PALETTE[colorName]) set('color',PALETTE[colorName][dark()?'night':'day']);
    el.classList.add('cam-site-text-custom');
  }
  function applyAll() { for (const d of ITEMS) apply(d, editing?.key === d.key ? editing.draft : null); }
  async function load() {
    if (loading) return;
    const sb=client();
    if (!sb?.from) return;
    loading=true;
    const startedAt = writeRevision;
    try {
      const {data,error}=await sb.from('cam_site_texts').select('key,content,settings');
      if (error) throw error;
      if (startedAt !== writeRevision) return;
      rows.clear();
      for (const r of data || []) if (validRow(r)) rows.set(r.key,r);
      loaded=true;writeCache();applyAll();
    } catch (err) { console.warn('CAM SPORTS: textos originales disponibles; personalización no cargada.',err?.message || err); }
    finally { loading=false;schedule(); }
  }
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay=document.createElement('div');
    overlay.className='cam-site-text-layer';
    overlay.setAttribute('aria-label','Herramientas de edición de textos');
    document.body.appendChild(overlay);
    return overlay;
  }
  function clearOverlay() {
    if (overlay) {overlay.remove();overlay=null;}
    pencils.clear();
    if (dialog?.open && !editOn()) dialog.close();
  }
  function repaintPencils() {
    if (!editOn()) {clearOverlay();return;}
    const layer=ensureOverlay(), keys=new Set();
    for (const d of ITEMS) {
      const f=find(d);
      if (!f) continue;
      const rect=f.el.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight ||
          rect.right < 0 || rect.left > innerWidth || getComputedStyle(f.el).visibility === 'hidden') continue;
      keys.add(d.key);
      let pencil=pencils.get(d.key);
      if (!pencil) {
        pencil=document.createElement('button');
        pencil.type='button';pencil.className='cam-site-text-pencil';
        pencil.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5Z"/></svg>';
        pencil.title='Editar texto: '+d.location;
        pencil.setAttribute('aria-label','Editar texto: '+d.location);
        pencil.addEventListener('click',()=>openEditor(d));
        layer.appendChild(pencil);pencils.set(d.key,pencil);
      }
      const left = rect.right + 5 + 21 < innerWidth ? rect.right + 5 : Math.max(4,rect.left - 22);
      pencil.style.left=Math.round(left)+'px';
      pencil.style.top=Math.round(Math.min(innerHeight-25,Math.max(4,rect.top+Math.min(4,rect.height/4))))+'px';
    }
    for (const [key,pencil] of pencils) if (!keys.has(key)) {pencil.remove();pencils.delete(key);}
  }
  function schedule() {
    if (scheduled) return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;applyAll();repaintPencils();});
  }
  function field(name) { return dialog?.querySelector('[data-field="'+name+'"]'); }
  function showError(message) {const target=$('[data-text-error]',dialog);if(target)target.textContent=message||'';}
  function makeDialog() {
    if (dialog) return dialog;
    dialog=document.createElement('dialog');
    dialog.id='camSiteTextDialog';dialog.className='cam-site-text-dialog';
    dialog.setAttribute('aria-labelledby','camSiteTextDialogTitle');
    dialog.innerHTML=[
      '<form method="dialog" class="cam-site-text-form">',
      '<header><div><small>CAM SPORTS · MODO EDICIÓN</small><h2 id="camSiteTextDialogTitle">Editar texto</h2><p data-location></p></div>',
      '<button type="button" data-close aria-label="Cerrar editor">×</button></header>',
      '<div class="cam-site-text-body">',
      '<label>Contenido <textarea data-content rows="3" maxlength="600" spellcheck="true"></textarea></label>',
      '<section><h3>Tamaño de letra</h3>',
      '<div class="cam-site-text-size"><label>Ordenador <span><button type="button" data-bump="desktopSize:-1">−</button>',
      '<input data-field="desktopSize" type="range" min="12" max="72" step="1"><button type="button" data-bump="desktopSize:1">+</button>',
      '<output data-output="desktopSize"></output></span></label></div>',
      '<div class="cam-site-text-size"><label>Móvil <span><button type="button" data-bump="mobileSize:-1">−</button>',
      '<input data-field="mobileSize" type="range" min="12" max="72" step="1"><button type="button" data-bump="mobileSize:1">+</button>',
      '<output data-output="mobileSize"></output></span></label></div></section>',
      '<section class="cam-site-text-two"><label>Alineación ordenador<select data-field="desktopAlign"><option value="">Original</option><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label>',
      '<label>Alineación móvil<select data-field="mobileAlign"><option value="">Original</option><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label></section>',
      '<section><h3>Estilo editorial</h3><div class="cam-site-text-two">',
      '<label>Peso<select data-field="weight"><option value="">Original</option><option value="400">Normal</option><option value="500">Medio</option><option value="600">Seminegrita</option><option value="700">Negrita</option><option value="800">Extra negrita</option><option value="900">Pesada</option></select></label>',
      '<label>Cursiva<select data-field="italic"><option value="">Original</option><option value="true">Sí</option><option value="false">No</option></select></label>',
      '<label>Espacio letras (px)<input data-field="letterSpacing" type="number" min="-0.5" max="3" step=".1" placeholder="Original"></label>',
      '<label>Altura de línea<input data-field="lineHeight" type="number" min="1" max="2" step=".05" placeholder="Original"></label>',
      '</div></section>',
      '<section><h3>Color de marca</h3><div class="cam-site-text-two">',
      '<label>Modo día<select data-field="colorDay"><option value="auto">Automático</option><option value="ink">Tinta</option><option value="bronze">Bronce</option><option value="blue">Azul</option><option value="muted">Azul grisáceo</option></select></label>',
      '<label>Modo noche<select data-field="colorNight"><option value="auto">Automático</option><option value="ink">Tinta</option><option value="bronze">Bronce</option><option value="blue">Azul</option><option value="muted">Azul grisáceo</option></select></label>',
      '</div></section>',
      '<section><h3>Espacio y encuadre <small>Desplazamientos máximos: ±12 px</small></h3>',
      '<div class="cam-site-text-two">',
      '<label>Ancho ordenador (px)<input data-field="desktopWidth" type="number" min="0" max="1200" step="10" placeholder="0 = original"></label>',
      '<label>Ancho móvil (px)<input data-field="mobileWidth" type="number" min="0" max="1200" step="10" placeholder="0 = original"></label>',
      '<label>Horizontal ordenador<input data-field="desktopX" type="number" min="-12" max="12" step="1" placeholder="Original"></label>',
      '<label>Vertical ordenador<input data-field="desktopY" type="number" min="-12" max="12" step="1" placeholder="Original"></label>',
      '<label>Horizontal móvil<input data-field="mobileX" type="number" min="-12" max="12" step="1" placeholder="Original"></label>',
      '<label>Vertical móvil<input data-field="mobileY" type="number" min="-12" max="12" step="1" placeholder="Original"></label>',
      '<label>Espaciado interno (px)<input data-field="padding" type="number" min="0" max="24" step="1" placeholder="Original"></label>',
      '<label>Separación inferior (px)<input data-field="gap" type="number" min="0" max="24" step="1" placeholder="Original"></label>',
      '</div></section></div>',
      '<p data-text-error role="alert"></p>',
      '<footer><button type="button" data-reset>Restablecer original</button><span></span>',
      '<button type="button" data-cancel>Cancelar</button><button type="submit" data-save>Guardar</button></footer>',
      '</form>'
    ].join('');
    document.body.appendChild(dialog);
    const form=$('form',dialog);
    $('[data-close]',dialog).addEventListener('click',()=>{if(!savePending)dialog.close();});
    $('[data-cancel]',dialog).addEventListener('click',()=>{if(!savePending)dialog.close();});
    $('[data-reset]',dialog).addEventListener('click',reset);
    form.addEventListener('submit',save);
    for (const el of dialog.querySelectorAll('[data-field],[data-content]')) {
      el.addEventListener('input',()=>{
        if (el.dataset.field) el.dataset.changed='1';
        if (el.dataset.field?.endsWith('Size')) field(el.dataset.field).closest('label').querySelector('output').textContent=el.value+' px';
        preview();
      });
      el.addEventListener('change',()=>{if(el.dataset.field)el.dataset.changed='1';preview();});
    }
    for (const b of dialog.querySelectorAll('[data-bump]')) {
      b.addEventListener('click',()=>{
        const [key,delta]=b.dataset.bump.split(':');const input=field(key);
        input.value=Math.max(12,Math.min(72,Number(input.value)+Number(delta)));
        input.dispatchEvent(new Event('input',{bubbles:true}));
      });
    }
    dialog.addEventListener('close',()=>{
      // Un evento close retrasado no debe destruir una edición nueva.
      if (dialog.open) return;
      const key=editing?.key;
      editing=null;savePending=false;
      if (key) {const d=ITEMS.find(t=>t.key===key);if(d)apply(d);}
      schedule();
    });
    dialog.addEventListener('cancel',e=>{if(savePending)e.preventDefault();});
    dialog.addEventListener('click',e=>{if(e.target===dialog && !savePending)dialog.close();});
    return dialog;
  }
  const NUMERIC=new Set(['desktopSize','mobileSize','desktopWidth','mobileWidth','desktopX','desktopY','mobileX','mobileY','weight','letterSpacing','lineHeight','padding','gap']);
  function getDraft() {
    const source=rows.get(editing.key);
    const settings={...(source?.settings || {})};
    for (const el of dialog.querySelectorAll('[data-field]')) {
      if (el.dataset.changed!=='1') continue;
      const key=el.dataset.field,val=el.value;
      if (val==='' || val==='auto') delete settings[key];
      else if (key==='italic') settings[key]=val==='true';
      else if (NUMERIC.has(key)) settings[key]=Number(val);
      else settings[key]=val;
    }
    return {key:editing.key,content:$('[data-content]',dialog).value,settings};
  }
  function preview() {
    if (!editing || savePending) return;
    editing.draft=getDraft();
    previewed.add(editing.key);
    const d=ITEMS.find(t=>t.key===editing.key);
    if (d) apply(d,editing.draft);
    schedule();
  }
  function openEditor(d) {
    if (!editOn()) return;
    const f=find(d);
    if (!f) return;
    makeDialog();
    if (dialog.open) dialog.close();
    editing={key:d.key,draft:null};
    const r=rows.get(d.key), settings=r?.settings||{};
    $('[data-location]',dialog).textContent=d.location;
    $('[data-content]',dialog).value=r?.content ?? originals.get(d.key) ?? f.base.clean;
    for (const el of dialog.querySelectorAll('[data-field]')) {
      const key=el.dataset.field;
      delete el.dataset.changed;
      if (key.endsWith('Size')) {
        el.value=settings[key] ?? Math.max(12,Math.min(72,Math.round(parseFloat(getComputedStyle(f.el).fontSize)||24)));
        el.closest('label').querySelector('output').textContent=el.value+' px';
      } else el.value=settings[key] ?? (key.startsWith('color')?'auto':'');
    }
    showError('');
    $('[data-reset]',dialog).hidden=!r;
    dialog.showModal();
    $('[data-content]',dialog).focus();
  }
  async function save(e) {
    e.preventDefault();
    if (!editOn() || !editing || savePending) return;
    const draft=getDraft(),content=draft.content;
    if (!content.trim() || content.length>600) {showError('Escribe entre 1 y 600 caracteres.');return;}
    for (const el of dialog.querySelectorAll('[data-field]')) {
      if (el.dataset.changed==='1' && !el.checkValidity()) {showError('Hay un valor fuera de los límites permitidos.');el.focus();return;}
    }
    const sb=client();
    if (!sb?.rpc) {showError('No hay conexión con Supabase.');return;}
    savePending=true;$('[data-save]',dialog).disabled=true;showError('');
    try {
      const original=originals.get(draft.key)||'';
      const result=await sb.rpc('cam_set_site_text',{
        p_key:draft.key,p_content:content===original ? null : content,p_settings:draft.settings
      });
      if (result.error) throw result.error;
      writeRevision++;
      rows.set(draft.key,{key:draft.key,content:content===original?null:content,settings:draft.settings});
      previewed.delete(draft.key);
      writeCache();
      if (editing?.key===draft.key) { editing.draft=null;dialog.close(); }
      applyAll();
    } catch(err) {showError('No se guardó: '+(err?.message||'error de permisos o conexión'));}
    finally {savePending=false;$('[data-save]',dialog).disabled=false;}
  }
  async function reset() {
    if (!editOn() || !editing || savePending) return;
    const key=editing.key;
    if (!confirm('¿Restaurar el texto original y todos sus estilos?')) return;
    const sb=client();
    if (!sb?.rpc) {showError('No hay conexión con Supabase.');return;}
    savePending=true;showError('');
    try {
      const {error}=await sb.rpc('cam_reset_site_text',{p_key:key});
      if (error) throw error;
      writeRevision++;
      rows.delete(key);previewed.delete(key);writeCache();
      const d=ITEMS.find(t=>t.key===key);
      // Los textos originales se guardan en la interfaz, no en Supabase.
      const f=d&&find(d),original=originals.get(key);
      if (f && original!=null) {
        const leading=(f.base.raw.match(/^\s*/) || [''])[0];
        const trailing=(f.base.raw.match(/\s*$/) || [''])[0];
        f.node.data=leading+original+trailing;
      }
      if (editing?.key===key) {editing.draft=null;dialog.close();}
      applyAll();
    } catch(err) {showError('No se pudo restaurar: '+(err?.message||'error de conexión'));}
    finally {savePending=false;}
  }
  function init() {
    readCache();applyAll();
    const observer=new MutationObserver(mutations=>{
      if (mutations.some(m=>{
        const node=m.target.nodeType===1 ? m.target : m.target.parentElement;
        return !node?.closest?.('#camSiteTextDialog,.cam-site-text-layer');
      })) schedule();
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','hidden','open']});
    addEventListener('resize',schedule,{passive:true});
    addEventListener('scroll',schedule,{passive:true,capture:true});
    let lastSync=0;
    const syncVisible=(force=false)=>{
      if (document.hidden || editing || savePending || (!force && Date.now()-lastSync<15000)) return;
      lastSync=Date.now();
      load();
    };
    syncVisible(true);schedule();
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncVisible();});
    addEventListener('pageshow',()=>syncVisible());
    addEventListener('focus',()=>syncVisible());
    addEventListener('online',()=>syncVisible(true));
    window.setInterval?.(syncVisible,60000);
  }
  window.camSiteTexts=Object.freeze({
    refresh:schedule, reload:load,
    _state:()=>({keys:[...rows.keys()],available:ITEMS.filter(d=>!!find(d)).map(d=>d.key),originals:[...originals.entries()],editing:editing?.key||null,active:editOn(),loaded})
  });
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
