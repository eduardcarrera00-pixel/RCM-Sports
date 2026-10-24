/* AE SPORTS — Archivo de noticias, categorías + búsqueda.
 * Reutiliza exclusivamente "articles" de la fuente editorial existente.
 * No consulta tablas extra, no duplica notas ni modifica sus datos. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const categories = new Set(['Todas','Picks','NFL','Fútbol']);
  const mobile = window.matchMedia('(max-width:760px)');
  let category = 'Todas', term = '', shown = 18, opener = null;
  const simplify = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const normalizeCategory = value =>
    typeof categoryKey === 'function' ? categoryKey(value) : value;
  const allArticles = () => (typeof articles === 'undefined' ? [] : articles);
  const modal = () => $('aeNewsArchiveDialog');
  const element = (tag, text, cls) => {
    const node = document.createElement(tag);
    if(text !== undefined) node.textContent = String(text);
    if(cls) node.className = cls;
    return node;
  };
  function archiveLink(id){
    const url = new URL(location.href);
    url.searchParams.set('article', String(id));
    url.searchParams.delete('comment');
    url.searchParams.delete('pick');
    url.hash = '';
    return url.href;
  }
  function openArticle(article, event){
    if(event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey))return;
    event?.preventDefault();
    modal()?.close();
    if(typeof openArticleModal === 'function')openArticleModal(article.id);
  }
  function articleCard(article){
    const card=element('article',undefined,'ae-news-archive-card');
    const link=element('a',undefined,'ae-news-archive-card-link');
    link.href=archiveLink(article.id);
    link.addEventListener('click',event=>openArticle(article,event));
    if(article.image){
      const img=element('img');img.src=article.image;
      const pos=key=>{const n=Number(article?.[key]);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):50;};
      const focus=pos('image_focus_x')+'% '+pos('image_focus_y')+'%';
      const zoom=Number(article?.image_zoom_pct);
      const zoomPct=Number.isFinite(zoom)?Math.max(1,Math.min(300,Math.round(zoom))):100;
      img.style.setProperty('--ae-image-focus',focus);
      img.style.setProperty('--ae-image-zoom',String(zoomPct/100));
      img.alt='';img.loading='lazy';img.decoding='async';
      img.addEventListener('error',()=>img.remove());
      link.append(img);
    }
    const copy=element('div',undefined,'ae-news-archive-card-copy');
    copy.append(element('span',normalizeCategory(article.category)||'Deportes','ae-news-archive-card-category'));
    copy.append(element('h3',article.title||'Sin título'));
    if(article.summary)copy.append(element('p',article.summary));
    copy.append(element('small',article.date||new Date(article.createdAt).toLocaleDateString('es')));
    link.append(copy);
    card.append(link);
    return card;
  }
  function render(){
    const grid=$('aeNewsArchiveGrid'),status=$('aeNewsArchiveStatus'),more=$('aeNewsArchiveMore');
    if(!grid||!status||!more)return;
    const filtered=allArticles()
      .filter(a=>a&&a.id!=null&&(category==='Todas'||normalizeCategory(a.category)===category))
      .filter(a=>!term||simplify([a.title,a.summary,a.category,a.team,a.author].join(' ')).includes(term))
      .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)||String(a.id).localeCompare(String(b.id)));
    grid.replaceChildren(...filtered.slice(0,shown).map(articleCard));
    const total=filtered.length;
    if(total===0){
      grid.append(element('p',term?'No encontramos noticias con esa búsqueda. Prueba otra palabra o categoría.':'Todavía no hay noticias en esta categoría.','ae-news-archive-empty'));
    }
    status.textContent=total ? 'Mostrando '+Math.min(shown,total)+' de '+total+' '+(total===1?'noticia':'noticias') : 'Sin resultados';
    more.hidden=total<=shown;
    document.querySelectorAll('[data-ae-archive-filter]').forEach(b=>{
      b.setAttribute('aria-pressed',String(b.dataset.aeArchiveFilter===category));
    });
  }
  // El archivo de cada deporte en el teléfono es una lista directa de noticias:
  // la categoría ya está definida, por lo que no necesita buscar ni filtrar.
  function updateArchivePresentation(){
    const sportMobile = mobile.matches && (category === 'NFL' || category === 'Fútbol');
    const filters = modal()?.querySelector('.ae-news-archive-filters');
    if(filters) filters.style.display = sportMobile ? 'none' : '';
    const title = $('aeNewsArchiveTitle');
    if(title) title.textContent = sportMobile ? 'Noticias de '+category : 'Todas las noticias';
    const description = $('aeNewsArchiveDescription');
    if(description) description.textContent = sportMobile
      ? 'Todas las noticias de '+category+', de las más recientes a las más antiguas.'
      : 'Todas nuestras publicaciones, de las más recientes a las más antiguas.';
    return sportMobile;
  }
  function openArchive(requested='Todas',trigger=null){
    const dialog=modal();
    if(!dialog)return;
    opener=trigger||document.activeElement;
    category=categories.has(requested)?requested:'Todas';
    term='';shown=18;
    const input=$('aeNewsArchiveSearch');
    if(input)input.value='';
    const sportMobile = updateArchivePresentation();
    render();
    if(!dialog.open){
      if(typeof dialog.showModal==='function')dialog.showModal();
      else dialog.setAttribute('open','');
    }
    if(sportMobile) $('aeNewsArchiveClose')?.focus({preventScroll:true});
    else input?.focus({preventScroll:true});
  }
  window.aeOpenNewsArchive=openArchive;
  window.aeRefreshNewsArchive=()=>{if(modal()?.open)render();};
  function init(){
    mobile.addEventListener('change',()=>{if(modal()?.open)updateArchivePresentation();});
    document.addEventListener('click',event=>{
      const trigger=event.target.closest('[data-ae-news-category]');
      if(!trigger)return;
      event.preventDefault();
      openArchive(trigger.dataset.aeNewsCategory,trigger);
    });
    document.querySelectorAll('[data-ae-archive-filter]').forEach(button=>
      button.addEventListener('click',()=>{
        category=button.dataset.aeArchiveFilter;
        shown=18;
        render();
      })
    );
    $('aeNewsArchiveSearch')?.addEventListener('input',event=>{
      term=simplify(event.target.value);
      shown=18;
      render();
    });
    $('aeNewsArchiveMore')?.addEventListener('click',()=>{
      shown+=18;
      render();
    });
    $('aeNewsArchiveClose')?.addEventListener('click',()=>modal()?.close());
    modal()?.addEventListener('click',event=>{
      if(event.target===modal())modal()?.close();
    });
    modal()?.addEventListener('close',()=>{
      if(opener?.isConnected && !document.getElementById('articleModal')?.classList.contains('hidden')){
        // Si un artículo se ha abierto, mantener el foco en ese contenido.
        return;
      }
      opener?.focus?.({preventScroll:true});
    });
  }
  // The first archive interaction can happen after DOMContentLoaded.
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();