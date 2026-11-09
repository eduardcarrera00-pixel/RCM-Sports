/* CAM SPORTS · one compact home module; the full editorial Pick stays in Picks. */
(() => {
  'use strict';
  function setup(){
    const preview=document.getElementById('camHomePicks');
    const hero=document.getElementById('heroSection');
    const main=document.getElementById('mainContent');
    const trending=document.querySelector('.editorial-trending');
    const community=document.querySelector('.editorial-community');
    if(!preview||!hero||!main||!trending)return;
    const anchor=document.createComment('Picks de la comunidad · columna de escritorio');
    preview.before(anchor);
    const trendingAnchor=document.createComment('Lo más leído · columna de escritorio');
    // Escritorio (8 nov 2026): si la página abrió en Actualidad, Lo más leído ya está en
    // su hueco; su sitio de la portada es #aeHomeSidebarFeatures, no ese hueco.
    const trendingHome=document.getElementById('aeHomeSidebarFeatures');
    const mobile=window.matchMedia('(max-width: 760px)');
    if(!mobile.matches&&trendingHome&&trending.closest('#aeOpinionsTrendingSlot'))trendingHome.append(trendingAnchor);
    else trending.before(trendingAnchor);
    const footer=document.createElement('aside');
    footer.id='aeHomeTrendingMobileFooter';footer.setAttribute('aria-label','Lo más leído');
    footer.hidden=true;main.append(footer);
    function sync(){
      const home=document.body.classList.contains('ae-is-home');
      preview.hidden=!home;
      if(mobile.matches&&home){
        const mobileHome=document.getElementById('camHomeJornada');
        if(mobileHome){if(preview.parentNode!==mobileHome)mobileHome.append(preview);}
        else if(preview.nextElementSibling!==hero)hero.before(preview);
        if(community?.parentNode&&footer.nextElementSibling!==community)community.before(footer);
        if(trending.parentNode!==footer)footer.append(trending);
        footer.hidden=false;
      }else{
        if(anchor.nextSibling!==preview)anchor.after(preview);
        // Escritorio (8 nov 2026): Actualidad lleva Lo más leído en su propio hueco
        // (syncOpinionHighlights en index.html); antes se devolvía aquí a la portada y
        // Actualidad se quedaba sin él al llegar desde otra sección. El teléfono no cambia.
        const slot=!mobile.matches&&document.body.classList.contains('ae-is-opinions')?document.getElementById('aeOpinionsTrendingSlot'):null;
        if(slot){if(trending.parentNode!==slot)slot.append(trending);}
        else if(trendingAnchor.nextSibling!==trending)trendingAnchor.after(trending);
        footer.hidden=true;
      }
    }
    // Touch uses native scrolling. Mouse dragging keeps links clickable on taps.
    for(const list of preview.querySelectorAll('.cam-home-plate-list')){
      let drag=null,suppressClick=false;
      list.addEventListener('pointerdown',event=>{
        if(event.pointerType!=='mouse'||event.button!==0)return;
        drag={id:event.pointerId,x:event.clientX,left:list.scrollLeft,moved:false};
        suppressClick=false;
      });
      list.addEventListener('pointermove',event=>{
        if(!drag||drag.id!==event.pointerId)return;
        const delta=event.clientX-drag.x;
        if(!drag.moved&&Math.abs(delta)<5)return;
        if(!drag.moved){drag.moved=true;list.setPointerCapture?.(event.pointerId);list.classList.add('is-dragging');}
        list.scrollLeft=drag.left-delta;event.preventDefault();
      });
      const end=()=>{suppressClick=Boolean(drag?.moved);drag=null;list.classList.remove('is-dragging');};
      list.addEventListener('pointerup',end);list.addEventListener('pointercancel',end);
      list.addEventListener('pointerleave',()=>{if(drag&&!drag.moved)drag=null;});
      list.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},true);
      list.addEventListener('dragstart',event=>event.preventDefault());
      list.addEventListener('keydown',event=>{
        if(event.target!==list||event.ctrlKey||event.metaKey||event.altKey)return;
        const step=(list.firstElementChild?.getBoundingClientRect().width||164)+10;
        const destinations={ArrowLeft:list.scrollLeft-step,ArrowRight:list.scrollLeft+step,Home:0,End:list.scrollWidth-list.clientWidth};
        if(!(event.key in destinations))return;
        event.preventDefault();suppressClick=false;list.scrollLeft=destinations[event.key];
      });
    }
    window.camHomeLayout=Object.freeze({sync});sync();
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
    mobile.addEventListener?.('change',sync);window.addEventListener('pageshow',sync);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
