/* CAM SPORTS · Actualidad.
 * Columnas y noticias comentadas por la redacción, divididas por deporte.
 * Lectura pública (ae_opinions, solo publicadas); los administradores ven también
 * los borradores y publican, editan o borran con ae_publish_opinion,
 * ae_update_opinion y ae_delete_opinion. Las vistas se cuentan con
 * ae_bump_opinion_view. Enlace directo: ?opinion=<id>.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = String(text); if (cls) n.className = cls; return n; };
  const SPORTS = [
    ['nfl', 'NFL'], ['futbol', 'Fútbol'], ['colegial', 'Colegial'], ['ciclismo', 'Ciclismo'], ['tenis', 'Tenis']
  ];
  const SPORT_NAME = Object.fromEntries(SPORTS);
  const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const MAX_IMAGE = 8 * 1024 * 1024;
  const MAX_ORIGINAL = 25 * 1024 * 1024; // antes de comprimir en el navegador

  let failed = false, items = [], views = new Map(), active = 'todas', loaded = false, loading = null, editing = null, reading = null, pendingDeepLink = null;
  let communityTakes = [], takeReplies = new Map(), takesLoaded = false, takesLoading = null, voteBusy = false, takeRequest = 0;

  const client = () => { try { return typeof db !== 'undefined' ? db : window.db; } catch { return window.db; } };
  const isAdmin = () => { try { return typeof currentAdmin !== 'undefined' && Boolean(currentAdmin); } catch { return false; } };
  const adminName = () => { try { return (typeof currentAdmin !== 'undefined' && currentAdmin?.name) || ''; } catch { return ''; } };
  const dateText = s => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s));
  const shortDate = s => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(s));
  const readMinutes = text => Math.max(1, Math.round(String(text || '').trim().split(/\s+/).length / 200));
  // Fecha relativa («hace 3 h», «ayer»); a partir de una semana, la fecha corta.
  function relTime(s) {
    const t = Date.parse(s);
    if (!Number.isFinite(t)) return '';
    const diff = Date.now() - t;
    if (diff < 0) return shortDate(s);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return 'hace ' + min + ' min';
    const h = Math.floor(min / 60);
    if (h < 24) return 'hace ' + h + ' h';
    const d = Math.floor(h / 24);
    if (d === 1) return 'ayer';
    if (d < 7) return 'hace ' + d + ' días';
    return shortDate(s);
  }
  function timeEl(s) {
    const text = relTime(s);
    if (!text) return null;
    const t = el('time', text);
    t.dateTime = new Date(s).toISOString();
    t.title = dateText(s);
    return t;
  }
  // La firma de la casa no se repite en cada tarjeta; las demás sí se muestran.
  const HOUSE_AUTHOR = /^(eduard\s*carrera|eduardcarrera00)$/i;
  const showsByline = name => Boolean(String(name || '').trim()) && !HOUSE_AUTHOR.test(String(name).trim());
  const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } };
  const safeImage = url => (typeof url === 'string' && /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/\S*)?$/.test(url)) ? url : '';
  const clamp = v => Math.min(100, Math.max(0, Math.round(Number(v)) || 0));
  const excerpt = o => (o.summary || '').trim() || String(o.body || '').trim().split(/\n\s*\n/)[0].slice(0, 220).trim() + (String(o.body || '').length > 220 ? '…' : '');
  const status = (text, isError) => { const n = $('aeOpinionsStatus'); if (n) { n.textContent = text || ''; n.classList.toggle('is-error', Boolean(isError)); } };

  // ---------- Datos ----------
  async function load(force) {
    const sb = client();
    if (!sb) { status('La conexión no está disponible.', true); return; }
    if (loading && !force) return loading;
    const finishEntrance = window.camPageLoader?.begin?.();
    loading = (async () => {
      const r = await sb.from('ae_opinions')
        .select('id,sport,title,summary,body,image,image_focus_x,image_focus_y,author,is_published,featured,created_at,edited_at')
        .order('created_at', { ascending: false }).limit(200);
      if (r.error) { failed = true; loaded = true; return; }
      failed = false;
      items = (r.data || []).filter(o => o.is_published || isAdmin());
      const ids = items.map(o => o.id);
      views = new Map();
      if (ids.length) {
        const v = await sb.from('ae_opinion_views').select('opinion_id,views').in('opinion_id', ids);
        if (!v.error) for (const row of v.data || []) views.set(row.opinion_id, Number(row.views) || 0);
      }
      loaded = true; status('');
    })();
    try { await loading; } finally { loading = null; finishEntrance?.(); }
    render();
    openDeepLink();
  }

  // ---------- Listado ----------
  // Las noticias son referencias a los artículos originales: no se copian a
  // ae_opinions, no cambian la fecha de publicación ni pierden sus comentarios.
  function sportNews() {
    const source = typeof articles !== 'undefined' && Array.isArray(articles) ? articles : [];
    const sports = {'NFL':'nfl', 'Fútbol':'futbol', 'Fútbol Americano Colegial':'colegial', 'Colegial':'colegial', 'Ciclismo':'ciclismo', 'Tenis':'tenis'};
    return source.filter(a => a && sports[a.category])
      .map(a => ({
        id: a.id,
        sport: sports[a.category],
        article: a,
        title: a.title || 'Sin título',
        summary: a.summary || '',
        body: a.body || '',
        image: a.image || '',
        image_focus_x: a.image_focus_x,
        image_focus_y: a.image_focus_y,
        author: a.author || 'CAM Sports',
        created_at: a.createdAt,
        readTime: a.readTime,
        is_published: true,
        featured: false,
        is_news: true
      }));
  }

  // Única lista editorial: misma noticia y misma columna nunca aparecen dos veces.
  const storyKey = o => (o.sport || '') + ':' + String(o.title || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const publishedDate = o => Number.isFinite(Date.parse(o.created_at)) ? Date.parse(o.created_at) : 0;
  const latestFirst = (a,b) => publishedDate(b)-publishedDate(a) || String(b.id).localeCompare(String(a.id));
  function visible() {
    const unique=new Map();
    // Una columna original conserva su portada y fecha si la noticia se enlaza
    // también en Opiniones. Nunca sustituir una pieza destacada por un duplicado.
    for(const o of [...items,...sportNews()].filter(o=>active==='todas'||o.sport===active)){
      const key=storyKey(o);
      const previous=unique.get(key);
      if(!previous||(
        (previous.is_news&&!o.is_news)||
        (Boolean(previous.is_news)===Boolean(o.is_news)&&latestFirst(o,previous)<0)
      ))unique.set(key,o);
    }
    return [...unique.values()].sort(latestFirst);
  }

  function renderTabs() {
    const root = $('aeOpinionsTabs'); if (!root) return;
    root.replaceChildren();
    for (const [key, label] of [['todas', 'Todas'], ...SPORTS]) {
      const b = el('button', null, 'ae-opinions-tab');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.sport = key;
      b.setAttribute('aria-selected', String(active === key));
      b.tabIndex = active === key ? 0 : -1;
      b.append(el('span', label));
      b.addEventListener('click', () => selectSport(key));
      b.addEventListener('keydown', e => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const tabs = [...root.querySelectorAll('[role=tab]')]; let i = tabs.indexOf(b);
        i = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        selectSport(tabs[i].dataset.sport); root.querySelector('[aria-selected=true]')?.focus();
      });
      root.append(b);
    }
    // Degradados de los bordes: decorativos, fuera del orden de las pestañas.
    for (const side of ['start', 'end']) {
      const fade = el('span', null, 'cam-act-tabs-fade is-' + side);
      fade.setAttribute('aria-hidden', 'true');
      side === 'start' ? root.prepend(fade) : root.append(fade);
    }
    const selected = root.querySelector('[aria-selected=true]');
    if (selected) {
      // La pestaña elegida queda a la vista dentro de la barra, sin mover la página.
      const left = selected.offsetLeft - 16, right = selected.offsetLeft + selected.offsetWidth + 16;
      if (left < root.scrollLeft) root.scrollLeft = Math.max(0, left);
      else if (right > root.scrollLeft + root.clientWidth) root.scrollLeft = right - root.clientWidth;
    }
    syncTabsChrome();
  }

  // Degradado en el borde de la barra cuando hay más pestañas fuera de la vista.
  function syncTabsChrome() {
    const root = $('aeOpinionsTabs'); if (!root) return;
    const max = root.scrollWidth - root.clientWidth;
    const fade = [];
    if (root.scrollLeft > 4) fade.push('start');
    if (root.scrollLeft < max - 4) fade.push('end');
    root.dataset.camFade = fade.join(' ');
    // La barra queda fija bajo la cabecera cuando esta también es fija (escritorio).
    const header = document.querySelector('body > header, header');
    let top = 0;
    if (header) {
      const pos = getComputedStyle(header).position;
      if (pos === 'sticky' || pos === 'fixed') top = Math.max(0, Math.round(header.getBoundingClientRect().height));
    }
    $('aeOpinions')?.style.setProperty('--cam-act-sticky-top', top + 'px');
    syncTabsStuck();
  }
  // Solo cuando la barra está pegada arriba lleva fondo propio (el contenido pasa por debajo).
  let stuckQueued = false;
  function syncTabsStuck() {
    stuckQueued = false;
    const root = $('aeOpinionsTabs'), section = $('aeOpinions');
    if (!root || !section || section.hidden) return;
    const top = parseFloat(section.style.getPropertyValue('--cam-act-sticky-top')) || 0;
    const stuck = root.getBoundingClientRect().top <= top + 0.5 && section.getBoundingClientRect().top < top - 1;
    root.classList.toggle('is-stuck', stuck);
  }
  function queueTabsStuck() {
    if (stuckQueued || $('aeOpinions')?.hidden) return;
    stuckQueued = true;
    requestAnimationFrame(syncTabsStuck);
  }

  function selectSport(key) {
    if (active === key) return;
    active = key;
    render();
    // Si la barra ya está pegada arriba, volver al inicio del contenido nuevo.
    const section = $('aeOpinions'), tabs = $('aeOpinionsTabs');
    if (!section || !tabs) return;
    const top = parseFloat(getComputedStyle(section).getPropertyValue('--cam-act-sticky-top')) || 0;
    const start = section.getBoundingClientRect().top + window.scrollY - top;
    if (window.scrollY > start + 2) window.scrollTo({ top: start, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function media(o, cls) {
    const box = el('div', null, cls);
    const url = safeImage(o.image);
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.style.objectPosition = clamp(o.image_focus_x ?? 50) + '% ' + clamp(o.image_focus_y ?? 50) + '%';
      img.addEventListener('error', () => { img.remove(); box.classList.add('is-empty'); box.append(el('span', SPORT_NAME[o.sport] || 'Opinión', 'ae-opinion-media-mark')); }, { once: true });
      box.append(img);
    } else {
      box.classList.add('is-empty');
      box.append(el('span', SPORT_NAME[o.sport] || 'Opinión', 'ae-opinion-media-mark'));
    }
    return box;
  }

  function meta(o) {
    const m = el('p', null, 'ae-opinion-meta');
    m.append(el('span', SPORT_NAME[o.sport] || '', 'ae-opinion-sport'));
    const when = timeEl(o.created_at);
    if (when) m.append(when);
    m.append(el('span', o.readTime || readMinutes(o.body) + ' min de lectura', 'ae-opinion-read'));
    // Casi todo son noticias: solo se marca lo que es distinto (columnas y borradores).
    if (!o.is_news) {
      if (!o.is_published) m.append(el('span', 'Borrador', 'ae-opinion-flag'));
      else if (o.featured) m.append(el('span', 'Destacada', 'ae-opinion-flag is-featured'));
      else m.append(el('span', 'Opinión', 'ae-opinion-flag is-column'));
    }
    return m;
  }

  function card(o, lead, compact = false, tile = false) {
    const a = el('article', null, 'ae-opinion-card' + (lead ? ' is-lead' : '') + (compact ? ' is-compact' : '') + (tile ? ' is-tile' : '') + (o.is_published ? '' : ' is-draft'));
    const b = el('button', null, 'ae-opinion-open');
    b.type = 'button';
    b.setAttribute('aria-label', (o.is_news ? 'Leer noticia: ' : 'Leer opinión: ') + o.title);
    b.addEventListener('click', () => {
      if (o.is_news) {
        // Abrir la noticia original con sus votos, comentarios y enlace.
        if (typeof openArticleModal === 'function') openArticleModal(o.id);
      } else {
        openReader(o.id, b);
      }
    });
    const text = el('div', null, 'ae-opinion-text');
    text.append(meta(o), el('h3', o.title, 'ae-opinion-title'), el('p', excerpt(o), 'ae-opinion-excerpt'));
    if (showsByline(o.author)) text.append(el('p', 'Por ' + o.author, 'ae-opinion-author'));
    b.append(media(o, 'ae-opinion-media'), text);
    a.append(b);
    // Shared article controls stay outside the story button: each action has
    // its own keyboard target and keeps the original article's live counts.
    const article = o.article || sportNews().find(news => storyKey(news) === storyKey(o))?.article;
    if (article && typeof renderArticleInteractions === 'function') {
      const actions = el('div', null, 'cam-actualidad-news-actions');
      actions.innerHTML = renderArticleInteractions(article);
      a.append(actions);
    }
    return a;
  }

  const sectionHeader=(title,caption)=>{
    const header=el('header',null,'ae-opinions-section-head');
    header.append(el('h3',title));
    if(caption)header.append(el('p',caption));
    return header;
  };
  const sportLabel=s=>SPORT_NAME[s]||({football:'Fútbol',laliga:'LaLiga',premier:'Premier League',
    ligamx:'Liga MX',champions:'Champions League',general:'General'})[s]||s||'Deporte';
  const takeSport=t=>['football','laliga','premier','ligamx','champions'].includes(t.sport)?'futbol':
    t.sport==='nfl'?'nfl':t.sport==='colegial'?'colegial':'general';
  const takeVotes=t=>[Math.max(0,Number(t.upvotes)||0),Math.max(0,Number(t.downvotes)||0)];
  // Barra fina «a favor / en contra»; los números siguen en los botones de voto.
  function voteMeter(up,down){
    const meter=el('span',null,'cam-act-meter'+(up+down?'':' is-empty'));
    meter.setAttribute('aria-hidden','true');
    meter.style.setProperty('--cam-favor',(up+down?Math.round(up*100/(up+down)):50)+'%');
    meter.append(el('span',null,'cam-act-meter-fill'));
    return meter;
  }
  function takeRow(t, compact=false, rank=0){
    const wrap=el('article',null,'ae-opinions-take'+(compact?' is-compact':'')+(rank?' is-ranked':''));
    wrap.dataset.takeId=String(t.id);
    if(rank){const n=el('span',String(rank),'cam-act-rank');n.setAttribute('aria-hidden','true');wrap.append(n);}
    const body=el('div',null,'ae-opinions-take-content');
    const tag=el('p',compact?'Take de la comunidad':sportLabel(t.sport),'ae-opinions-take-tag');
    const title=el('button',t.title||'Leer opinión','ae-opinions-take-open');
    title.type='button';
    title.addEventListener('click',()=>window.aeTakeReplies?.open(t));
    const heading=el('h4');heading.append(title);
    const by=el('div',null,'ae-opinions-take-by');
    const author=el('button','@'+(t.author||'Aficionado'),'ae-opinions-take-author');
    author.type='button';
    author.addEventListener('click',()=>window.openAePublicProfile?.(t.author_id));
    by.append(author);
    const when=timeEl(t.created_at);
    if(when)by.append(when);
    body.append(tag,heading,by);
    if(!compact&&t.body)body.append(el('p',String(t.body).slice(0,170)+(String(t.body).length>170?'…':''),'ae-opinions-take-excerpt'));
    wrap.append(body);
    const actions=el('div',null,'ae-opinions-take-actions');
    const [up,down]=takeVotes(t);
    const voteButton=(value,glyph,count)=>{
      const b=el('button',null,'ae-opinions-take-vote '+(value===1?'is-up':'is-down'));
      b.append(el('span',glyph,'cam-act-vote-glyph'),el('strong',String(count)));
      b.type='button';b.setAttribute('aria-pressed',String(Number(t.my_vote)===value));
      b.setAttribute('aria-label',(value===1?'Votos favorables: ':'Votos contrarios: ')+count+'. Votar.');
      b.disabled=voteBusy;
      b.addEventListener('click',()=>voteTake(t,value));
      return b;
    };
    const votes=el('div',null,'cam-act-votes');
    votes.append(voteButton(1,'▲',up),voteMeter(up,down),voteButton(-1,'▼',down));
    actions.append(votes);
    const replies=takeReplies.get(String(t.id));
    const reply=el('button',null,'ae-opinions-take-reply');
    const bubble=el('i',null,'fa-regular fa-comment');bubble.setAttribute('aria-hidden','true');
    reply.append(bubble,el('span',replies===undefined?'Respuestas —':replies+' '+(replies===1?'respuesta':'respuestas')));
    reply.type='button';reply.setAttribute('aria-label','Abrir conversación: '+(t.title||'Take'));
    reply.addEventListener('click',()=>window.aeTakeReplies?.open(t));
    actions.append(reply);
    wrap.append(actions);
    return wrap;
  }
  // Bloques grises mientras llega el contenido (texto real para lectores de pantalla).
  function skeleton(kind,count,label){
    const box=el('div',null,'cam-act-skeleton is-'+kind);
    box.append(el('p',label,'cam-act-sr'));
    for(let i=0;i<count;i++){
      const row=el('div',null,'cam-act-skeleton-item');row.setAttribute('aria-hidden','true');
      row.append(el('span',null,'cam-act-skel-media'),el('span',null,'cam-act-skel-line'),el('span',null,'cam-act-skel-line is-short'));
      box.append(row);
    }
    return box;
  }
  async function voteTake(t,value){
    if(voteBusy)return;
    const sb=client();if(!sb)return;
    try{
      const session=await sb.auth.getUser();
      const user=session.data?.user;
      if(!user){window.openUserAuthModal?.();return;}
      if(String(user.id)===String(t.author_id))return;
      voteBusy=true;
      const r=await sb.rpc('ae_vote_free_take',{p_take_id:t.id,p_value:value});
      if(r.error)throw r.error;
      await loadTakes(true);
      document.dispatchEvent(new Event('ae:takes-updated'));
    }catch(e){status('No se pudo registrar el voto: '+(e.message||'Error'),true);}
    finally{voteBusy=false;renderTakes();}
  }
  async function loadTakes(force=false){
    if(takesLoading)return takesLoading;
    if(takesLoaded&&!force)return;
    const sb=client();if(!sb)return;
    const seq=++takeRequest;
    const finishEntrance=window.camPageLoader?.begin?.();
    takesLoading=(async()=>{
      try{
        const feed=await sb.rpc('ae_public_take_feed',{p_sport:'all'});
        if(feed.error)throw feed.error;
        const all=(feed.data||[]).filter(t=>t?.id&&t?.title);
        // La RPC de conteos admite hasta 30 identificadores por llamada.
        const chunks=[];
        for(let i=0;i<all.length;i+=30)chunks.push(all.slice(i,i+30).map(t=>t.id));
        const counts=await Promise.all(chunks.map(ids=>sb.rpc('ae_public_take_reply_counts',{p_take_ids:ids})));
        if(seq!==takeRequest)return;
        const nextReplies=new Map();
        counts.forEach((res,i)=>{
          if(res.error)return;
          for(const id of chunks[i])nextReplies.set(String(id),0);
          for(const row of res.data||[])nextReplies.set(String(row.take_id),Math.max(0,Number(row.reply_count)||0));
        });
        communityTakes=all;
        takeReplies=nextReplies;
        takesLoaded=true;
        renderTakes();
      }catch(error){
        if(seq!==takeRequest)return;
        const block=$('aeOpinionsDebatedContent');
        if(block&&!takesLoaded)block.replaceChildren(el('p','Los debates no están disponibles por ahora. Las columnas siguen accesibles.','ae-opinions-empty'));
      }
    })();
    try{await takesLoading;}finally{takesLoading=null;finishEntrance?.();}
  }
  function renderTakes(){
    const target=$('aeOpinionsDebatedContent'),sportTarget=$('aeOpinionsSports');
    if(!target||!sportTarget)return;
    target.replaceChildren();
    const known=communityTakes.filter(t=>takeReplies.has(String(t.id)));
    const candidates=known.filter(t=>active==='todas'||takeSport(t)===active);
    const sorted=[...candidates].sort((a,b)=>
      (takeReplies.get(String(b.id))-takeReplies.get(String(a.id)))||
      ((Number(b.upvotes)||0)+(Number(b.downvotes)||0))-((Number(a.upvotes)||0)+(Number(a.downvotes)||0))||
      latestFirst(a,b));
    const debated=sorted.filter(t=>takeReplies.get(String(t.id))>0).slice(0,5);
    if(debated.length){
      debated.forEach((t,i)=>target.append(takeRow(t,false,i+1)));
    }else if(takesLoaded){
      target.append(el('p',known.length?'Aún no hay discusiones con respuestas en este deporte.':'Todavía no hay debates publicados con respuestas verificadas.','ae-opinions-empty'));
    }else target.append(skeleton('rows',3,'Consultando los debates de la comunidad…'));
    const leftovers=communityTakes.filter(t=>!debated.some(d=>String(d.id)===String(t.id)));
    const latest=visible();
    const front=pickCover(latest),remaining=latest.filter(o=>!front.includes(o));
    const editorialRemainder=remaining.slice(6);
    sportTarget.replaceChildren();
    if(active!=='todas')return;
    const bySport=new Map();
    for(const [key,label] of SPORTS){
      const story=editorialRemainder.filter(o=>o.sport===key);
      // Primero los Takes con conversación; después, los más recientes.
      const sportTakes=leftovers.filter(t=>takeSport(t)===key)
        .sort((a,b)=>((takeReplies.get(String(b.id))||0)-(takeReplies.get(String(a.id))||0))||latestFirst(a,b))
        .slice(0,3);
      if(story.length||sportTakes.length)bySport.set(key,{key,label,story,sportTakes});
    }
    if(!bySport.size)return;
    const sportsHeading = sectionHeader('Actualidad por deporte','Columnas y conversaciones reunidas por tema, sin duplicar la portada.');
    sportsHeading.dataset.camOpinionsBanner = 'sports';
    sportTarget.append(sportsHeading);
    const grid=el('div',null,'ae-opinions-sport-grid');
    for(const entry of bySport.values()){
      const section=el('section',null,'ae-opinions-sport-block');
      section.dataset.sport=entry.key;
      const head=el('div',null,'cam-act-sport-head');
      const title=el('h4',entry.label);
      const see=el('button',null,'ae-opinions-sport-link');
      see.append(el('span','Ver todo'),el('span',' ›','cam-act-chevron'));
      see.type='button';see.setAttribute('aria-label','Ver todo de '+entry.label);
      see.addEventListener('click',()=>{
        selectSport(entry.key);$('aeOpinionsTabs')?.querySelector('[aria-selected=true]')?.focus();
      });
      head.append(title,see);
      // Una fila que se desliza de lado: columnas y Takes del mismo deporte.
      const rail=el('div',null,'cam-act-rail');
      rail.setAttribute('role','group');rail.setAttribute('aria-label',entry.label+': desliza para ver más');
      for(const o of entry.story) rail.append(card(o,false,true,true));
      for(const t of entry.sportTakes)rail.append(takeRow(t,true));
      section.append(head,rail);grid.append(section);
    }
    sportTarget.append(grid);
    window.camOpinionsBanners?.refresh();
  }
  function pickCover(stories){
    const publicStories=stories.filter(o=>o.is_published);
    return [...publicStories].sort((a,b)=>(Number(Boolean(b.featured))-Number(Boolean(a.featured)))||latestFirst(a,b)).slice(0,3);
  }
  function render(){
    const root=$('aeOpinions');if(!root)return;
    renderTabs();
    const list=$('aeOpinionsList');if(!list)return;
    list.replaceChildren();
    list.setAttribute('aria-busy',String(!loaded));
    const shown=visible();
    if(!loaded&&!shown.length){list.append(skeleton('front',3,'Cargando actualidad…'));return;}
    if(failed){
      const box=el('div',null,'ae-opinions-empty');
      const retry=el('button','Reintentar','ae-opinions-button is-secondary');retry.type='button';
      retry.addEventListener('click',()=>{loaded=false;render();load(true);});
      box.append(el('p','No se pudieron cargar las columnas editoriales. Las noticias siguen disponibles.'),retry);
      list.append(box);
    }
    if(!shown.length){
      const empty=el('div',null,'ae-opinions-empty');
      empty.append(el('h3','Todavía no hay publicaciones'+(active==='todas'?'':' de '+SPORT_NAME[active])),
        el('p',isAdmin()?'Pulsa «Escribir opinión» para publicar la primera.':'La redacción publicará aquí sus próximas columnas.'));
      list.append(empty);
    }else{
      const cover=pickCover(shown);
      if(cover.length){
        const section=el('section',null,'ae-opinions-front');
        section.append(sectionHeader('En portada','El análisis que marca la conversación.'));
        const grid=el('div',null,'ae-opinions-front-grid');
        grid.append(card(cover[0],true));
        if(cover.length>1){
          // En el teléfono las otras dos se deslizan de lado; en el ordenador van debajo.
          const rail=el('div',null,'cam-act-front-rail');
          for(const o of cover.slice(1))rail.append(card(o,false,false,true));
          grid.append(rail);
        }
        section.append(grid);list.append(section);
      }
      const recent=shown.filter(o=>!cover.includes(o)).slice(0,6);
      if(recent.length){
        const section=el('section',null,'ae-opinions-recent');
        section.append(sectionHeader('Últimas publicaciones','Publicaciones en orden de fecha, de más recientes a más antiguas.'));
        const rows=el('div',null,'ae-opinions-recent-list');
        for(const o of recent)rows.append(card(o,false,true));
        section.append(rows);list.append(section);
      }
    }
    renderTakes();
  }

  // ---------- Lectura ----------
  function openReader(id, opener) {
    const o = items.find(x => x.id === id); if (!o) return;
    reading = o;
    const d = $('aeOpinionReader');
    const body = $('aeOpinionReaderBody'); body.replaceChildren();
    const head = el('header', null, 'ae-opinion-reader-head');
    head.append(meta(o), el('h2', o.title, 'ae-opinion-reader-title'));
    if ((o.summary || '').trim()) head.append(el('p', o.summary.trim(), 'ae-opinion-reader-summary'));
    const by = el('p', null, 'ae-opinion-reader-by');
    const count = views.get(o.id) || 0;
    by.append(el('span', 'Por ' + o.author), el('span', dateText(o.created_at)));
    if (count) by.append(el('span', count + (count === 1 ? ' lectura' : ' lecturas')));
    head.append(by);
    body.append(head);
    if (safeImage(o.image)) body.append(media(o, 'ae-opinion-reader-media'));
    const text = el('div', null, 'ae-opinion-reader-text');
    for (const para of String(o.body).trim().split(/\n\s*\n/)) {
      const p = el('p');
      para.split('\n').forEach((line, i) => { if (i) p.append(document.createElement('br')); p.append(document.createTextNode(line)); });
      text.append(p);
    }
    body.append(text);
    const tools = $('aeOpinionReaderAdmin'); tools.hidden = !isAdmin();
    d.dataset.opener = '';
    d._opener = opener || null;
    if (!d.open) d.showModal();
    d.scrollTop = 0; body.scrollTop = 0;
    $('aeOpinionReaderClose').focus();
    try { const u = new URL(location.href); u.searchParams.set('opinion', o.id); history.replaceState(history.state, '', u); } catch {}
    if (o.is_published) {
      const sb = client();
      sb?.rpc('ae_bump_opinion_view', { p_opinion_id: o.id }).then(r => { if (!r?.error) views.set(o.id, (views.get(o.id) || 0) + 1); }, () => {});
    }
  }

  function closeReader() {
    const d = $('aeOpinionReader');
    if (d.open) d.close();
  }

  function onReaderClosed() {
    const d = $('aeOpinionReader');
    reading = null;
    try { const u = new URL(location.href); if (u.searchParams.has('opinion')) { u.searchParams.delete('opinion'); history.replaceState(history.state, '', u); } } catch {}
    const opener = d._opener; d._opener = null;
    if (opener && opener.isConnected) opener.focus();
  }

  async function share() {
    if (!reading) return;
    const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('opinion', reading.id);
    const data = { title: reading.title, text: reading.title + ' · CAM Sports', url: u.toString() };
    const note = $('aeOpinionReaderNote');
    try {
      if (navigator.share) { await navigator.share(data); return; }
      await navigator.clipboard.writeText(data.url);
      note.textContent = 'Enlace copiado.';
    } catch (e) { if (e?.name !== 'AbortError') note.textContent = 'No se pudo compartir. Copia la dirección de la página.'; }
    setTimeout(() => { note.textContent = ''; }, 3000);
  }

  function openDeepLink() {
    if (!pendingDeepLink || !loaded) return;
    const id = pendingDeepLink; pendingDeepLink = null;
    if (items.some(o => o.id === id)) openReader(id, null);
  }

  // ---------- Edición (solo administradores) ----------
  function fillSportOptions() {
    const s = $('aeOpinionSport'); if (!s || s.options.length) return;
    for (const [key, label] of SPORTS) { const o = el('option', label); o.value = key; s.append(o); }
  }

  function updatePreview() {
    const url = safeImage($('aeOpinionImage').value.trim()) || $('aeOpinionImagePreview').dataset.localUrl || '';
    const box = $('aeOpinionImagePreview'); const img = box.querySelector('img');
    box.hidden = !url;
    if (url) {
      img.src = url;
      img.style.objectPosition = $('aeOpinionFocusX').value + '% ' + $('aeOpinionFocusY').value + '%';
    }
    $('aeOpinionFocusFields').hidden = !url;
  }

  function counter(input, out) {
    const n = $(input), c = $(out); if (!n || !c) return;
    const max = n.maxLength > 0 ? n.maxLength : null;
    c.textContent = n.value.length + (max ? ' / ' + max : '');
  }

  function openEditor(o) {
    if (!isAdmin()) return;
    fillSportOptions();
    editing = o || null;
    const f = $('aeOpinionForm'); f.reset();
    $('aeOpinionEditorTitle').textContent = o ? 'Editar opinión' : 'Escribir opinión';
    $('aeOpinionSport').value = o?.sport || (active !== 'todas' ? active : 'nfl');
    $('aeOpinionTitle').value = o?.title || '';
    $('aeOpinionSummary').value = o?.summary || '';
    $('aeOpinionBody').value = o?.body || '';
    $('aeOpinionAuthor').value = o?.author || adminName() || 'Redacción';
    $('aeOpinionImage').value = o?.image || '';
    $('aeOpinionFile').value = '';
    const prev = $('aeOpinionImagePreview');
    if (prev.dataset.localUrl) { URL.revokeObjectURL(prev.dataset.localUrl); delete prev.dataset.localUrl; }
    $('aeOpinionFocusX').value = o?.image_focus_x ?? 50;
    $('aeOpinionFocusY').value = o?.image_focus_y ?? 50;
    $('aeOpinionFeatured').checked = Boolean(o?.featured);
    $('aeOpinionPublished').checked = o ? Boolean(o.is_published) : true;
    $('aeOpinionFormError').textContent = '';
    $('aeOpinionSave').textContent = o ? 'Guardar cambios' : 'Publicar';
    counter('aeOpinionTitle', 'aeOpinionTitleCount'); counter('aeOpinionSummary', 'aeOpinionSummaryCount'); counter('aeOpinionBody', 'aeOpinionBodyCount');
    syncSaveLabel();
    updatePreview();
    const d = $('aeOpinionEditor');
    if (!d.open) d.showModal();
    $('aeOpinionTitle').focus();
  }

  function syncSaveLabel() {
    const published = $('aeOpinionPublished').checked;
    $('aeOpinionSave').textContent = editing ? 'Guardar cambios' : (published ? 'Publicar' : 'Guardar borrador');
  }

  async function uploadImage(file) {
    if (!IMAGE_TYPES[file.type]) throw Error('La imagen debe ser JPG, PNG o WebP.');
    if (file.size > MAX_ORIGINAL) throw Error('La imagen supera 25 MB.');
    if (window.camCompressImage) file = await window.camCompressImage(file);
    if (file.size > MAX_IMAGE) throw Error('La imagen supera 8 MB.');
    const sb = client();
    if (!sb?.storage) throw Error('La subida de imágenes no está disponible. Pega un enlace HTTPS.');
    const name = 'opinions/' + crypto.randomUUID() + '.' + IMAGE_TYPES[file.type];
    const r = await sb.storage.from('article-images').upload(name, file, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (r.error) throw Error('No se pudo guardar la imagen: ' + r.error.message);
    const url = sb.storage.from('article-images').getPublicUrl(r.data?.path || name).data?.publicUrl || '';
    if (!safeImage(url)) throw Error('La imagen se subió, pero no se obtuvo un enlace válido.');
    return url;
  }

  async function save(e) {
    e.preventDefault();
    if (!isAdmin()) return;
    const err = $('aeOpinionFormError'); err.textContent = '';
    const btn = $('aeOpinionSave');
    const title = $('aeOpinionTitle').value.trim(), body = $('aeOpinionBody').value.trim();
    if (title.length < 5) { err.textContent = 'El título necesita al menos 5 caracteres.'; $('aeOpinionTitle').focus(); return; }
    if (body.length < 20) { err.textContent = 'El texto necesita al menos 20 caracteres.'; $('aeOpinionBody').focus(); return; }
    let image = $('aeOpinionImage').value.trim();
    if (image && !safeImage(image)) { err.textContent = 'El enlace de la imagen debe empezar por https://'; $('aeOpinionImage').focus(); return; }
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Guardando…';
    try {
      const file = $('aeOpinionFile').files?.[0];
      if (file) image = await uploadImage(file);
      const args = {
        p_sport: $('aeOpinionSport').value,
        p_title: title,
        p_summary: $('aeOpinionSummary').value.trim(),
        p_body: body,
        p_author: $('aeOpinionAuthor').value.trim() || 'Redacción',
        p_image: image || null,
        p_image_focus_x: clamp($('aeOpinionFocusX').value),
        p_image_focus_y: clamp($('aeOpinionFocusY').value),
        p_featured: $('aeOpinionFeatured').checked,
        p_is_published: $('aeOpinionPublished').checked
      };
      const r = editing
        ? await client().rpc('ae_update_opinion', { p_opinion_id: editing.id, ...args })
        : await client().rpc('ae_publish_opinion', args);
      if (r.error) throw Error(r.error.message || 'No se pudo guardar.');
      const id = r.data || editing?.id;
      $('aeOpinionEditor').close();
      active = args.p_sport === active || active === 'todas' ? active : args.p_sport;
      await load(true);
      status(args.p_is_published ? 'Opinión publicada.' : 'Borrador guardado. Solo lo ven los administradores.');
      if (id && items.some(o => o.id === id)) openReader(id, null);
    } catch (x) {
      err.textContent = x.message || 'No se pudo guardar. Tu texto sigue aquí.';
    } finally {
      btn.disabled = false; if (btn.textContent === 'Guardando…') btn.textContent = label;
    }
  }

  async function remove() {
    if (!reading || !isAdmin()) return;
    if (!window.confirm('¿Borrar definitivamente «' + reading.title + '»? Esta acción no se puede deshacer.')) return;
    const id = reading.id;
    const r = await client().rpc('ae_delete_opinion', { p_opinion_id: id });
    if (r.error) { $('aeOpinionReaderNote').textContent = r.error.message || 'No se pudo borrar.'; return; }
    closeReader();
    items = items.filter(o => o.id !== id);
    render(); status('Opinión borrada.');
  }

  // Opinadores distinguidos reutiliza el panel original de Inicio. Aquí solo se
  // añade, dentro de Actualidad, la barra a favor / en contra de cada comentario
  // (fuera de Actualidad está oculta); votos, enlaces y respuestas no cambian.
  let communityQueued = false;
  function enhanceCommunity() {
    communityQueued = false;
    const slot = $('aeOpinionsCommunitySlot'); if (!slot) return;
    for (const entry of slot.querySelectorAll('.ae-community-scroll-entry')) {
      const upButton = entry.querySelector('.ae-community-vote.is-up');
      if (!upButton) continue;
      const up = Number(upButton.querySelector('strong')?.textContent) || 0;
      const down = Number(entry.querySelector('.ae-community-vote.is-down strong')?.textContent) || 0;
      const favor = (up + down ? Math.round(up * 100 / (up + down)) : 50) + '%';
      let meter = entry.querySelector('.cam-act-meter');
      if (!meter) { meter = voteMeter(up, down); upButton.after(meter); }
      else if (meter.style.getPropertyValue('--cam-favor') !== favor) {
        meter.style.setProperty('--cam-favor', favor);
        meter.classList.toggle('is-empty', !(up + down));
      }
    }
  }
  function watchCommunity() {
    const slot = $('aeOpinionsCommunitySlot');
    if (!slot || typeof MutationObserver !== 'function') return;
    new MutationObserver(() => {
      if (communityQueued) return;
      communityQueued = true;
      requestAnimationFrame(enhanceCommunity);
    }).observe(slot, { childList: true, subtree: true });
    enhanceCommunity();
  }

  // ---------- Integración con la navegación ----------
  function show() {
    render();
    enhanceCommunity();
    window.camOpinionsBanners?.refresh();
    if(!loaded)load();
    void loadTakes();
  }

  function bind() {
    // La acción de crear opinión vive ahora en Publicar (+), no en la cabecera de Opiniones.
    $('aeOpinionsWrite')?.addEventListener('click', () => {
      if (!isAdmin()) return;
      if (typeof window.closePublishModal === 'function') window.closePublishModal();
      openEditor(null);
    });
    document.addEventListener('ae:takes-updated',()=>{
      if(!$('aeOpinions')?.hidden)void loadTakes(true);
    });
    $('aeOpinionsTabs')?.addEventListener('scroll', syncTabsChrome, { passive: true });
    window.addEventListener('resize', () => { if (!$('aeOpinions')?.hidden) syncTabsChrome(); }, { passive: true });
    window.addEventListener('scroll', queueTabsStuck, { passive: true });
    $('aeOpinionReaderClose')?.addEventListener('click', closeReader);
    $('aeOpinionReaderShare')?.addEventListener('click', share);
    $('aeOpinionReaderEdit')?.addEventListener('click', () => { const o = reading; closeReader(); openEditor(o); });
    $('aeOpinionReaderDelete')?.addEventListener('click', remove);
    const reader = $('aeOpinionReader');
    reader?.addEventListener('close', onReaderClosed);
    reader?.addEventListener('click', e => { if (e.target === reader) closeReader(); });
    const editor = $('aeOpinionEditor');
    $('aeOpinionCancel')?.addEventListener('click', () => editor.close());
    $('aeOpinionEditorClose')?.addEventListener('click', () => editor.close());
    editor?.addEventListener('cancel', e => {
      const dirty = $('aeOpinionTitle').value.trim() || $('aeOpinionBody').value.trim();
      if (dirty && !window.confirm('¿Cerrar sin guardar? Se perderá lo que has escrito.')) e.preventDefault();
    });
    $('aeOpinionForm')?.addEventListener('submit', save);
    $('aeOpinionPublished')?.addEventListener('change', syncSaveLabel);
    for (const [i, c] of [['aeOpinionTitle', 'aeOpinionTitleCount'], ['aeOpinionSummary', 'aeOpinionSummaryCount'], ['aeOpinionBody', 'aeOpinionBodyCount']])
      $(i)?.addEventListener('input', () => counter(i, c));
    for (const id of ['aeOpinionImage', 'aeOpinionFocusX', 'aeOpinionFocusY']) $(id)?.addEventListener('input', updatePreview);
    $('aeOpinionFile')?.addEventListener('change', () => {
      const prev = $('aeOpinionImagePreview'); const f = $('aeOpinionFile').files?.[0];
      if (prev.dataset.localUrl) { URL.revokeObjectURL(prev.dataset.localUrl); delete prev.dataset.localUrl; }
      $('aeOpinionFormError').textContent = '';
      if (f) {
        if (!IMAGE_TYPES[f.type] || f.size > MAX_ORIGINAL) { $('aeOpinionFormError').textContent = 'La imagen debe ser JPG, PNG o WebP de hasta 25 MB.'; $('aeOpinionFile').value = ''; }
        else { prev.dataset.localUrl = URL.createObjectURL(f); $('aeOpinionImage').value = ''; }
      }
      updatePreview();
    });
  }

  function init() {
    bind();
    watchCommunity();
    try {
      const id = new URLSearchParams(location.search).get('opinion');
      if (id && /^[0-9a-f-]{36}$/i.test(id)) {
        pendingDeepLink = id;
        if (typeof filterByCategory === 'function') setTimeout(() => filterByCategory('Opiniones'), 0);
      }
    } catch {}
  }
  // Also initialize when this module arrives after DOMContentLoaded.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();

  window.aeOpinions = {
    show,
    rerender: () => { if (!$('aeOpinions')?.hidden) { loaded ? load(true) : show(); } },
    reload: () => load(true),
    refreshNews: () => { if (!$('aeOpinions')?.hidden) render(); }
  };
})();
