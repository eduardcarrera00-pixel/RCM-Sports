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
    const anchor=document.createComment('Picks de la semana · columna de escritorio');
    preview.before(anchor);
    const trendingAnchor=document.createComment('Lo más leído · columna de escritorio');
    trending.before(trendingAnchor);
    const footer=document.createElement('aside');
    footer.id='aeHomeTrendingMobileFooter';footer.setAttribute('aria-label','Lo más leído');
    footer.hidden=true;main.append(footer);
    const mobile=window.matchMedia('(max-width: 760px)');
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
        if(trendingAnchor.nextSibling!==trending)trendingAnchor.after(trending);
        footer.hidden=true;
      }
    }
    // Touch uses native scrolling. Mouse dragging keeps links clickable on taps.
    for(const list of preview.querySelectorAll('.cam-home-plate-list')){
      let drag=null,suppressClick=false;
      list.addEventListener('pointerdown',event=>{
        if(event.pointerType!=='mouse'||event.button!==0)return;
        drag={id:event.pointerId,y:event.clientY,top:list.scrollTop,moved:false};
        suppressClick=false;
      });
      list.addEventListener('pointermove',event=>{
        if(!drag||drag.id!==event.pointerId)return;
        const delta=event.clientY-drag.y;
        if(!drag.moved&&Math.abs(delta)<5)return;
        if(!drag.moved){drag.moved=true;list.setPointerCapture?.(event.pointerId);list.classList.add('is-dragging');}
        list.scrollTop=drag.top-delta;event.preventDefault();
      });
      const end=()=>{suppressClick=Boolean(drag?.moved);drag=null;list.classList.remove('is-dragging');};
      list.addEventListener('pointerup',end);list.addEventListener('pointercancel',end);
      list.addEventListener('pointerleave',()=>{if(drag&&!drag.moved)drag=null;});
      list.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},true);
      list.addEventListener('dragstart',event=>event.preventDefault());
    }
    window.camHomeLayout=Object.freeze({sync});sync();
    new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
    mobile.addEventListener?.('change',sync);window.addEventListener('pageshow',sync);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
