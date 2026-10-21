/* AE SPORTS | Mobile homepage weekly Pick: move the ACTUAL Picks component.
   No second design, duplicate data, fixed blank space or duplicated IDs.
   Outside mobile home both original sections remain in their normal locations. */
(() => {
  'use strict';

  function setup(){
    const featured = document.getElementById('picksFeatured');
    const homePreview = document.querySelector('.editorial-layout aside .editorial-pick');
    const hero = document.getElementById('heroSection');
    const sidebarFeatures = document.getElementById('aeHomeSidebarFeatures');
    const main = document.getElementById('mainContent');
    const trending = document.querySelector('.editorial-trending');
    if(!featured || !homePreview || !hero || !sidebarFeatures || !main || !trending || !featured.parentNode || !sidebarFeatures.parentNode) return;

    // Mark the native Picks component's permanent location without cloning it.
    const picksAnchor = document.createComment('Pick del editor · posición original en Picks');
    featured.parentNode.insertBefore(picksAnchor, featured);
    const sidebarAnchor = document.createComment('Rankings de portada · posición original en la columna derecha');
    sidebarFeatures.parentNode.insertBefore(sidebarAnchor, sidebarFeatures);
    // Same Lo más leído element and article buttons on phone and desktop.
    const trendingAnchor = document.createComment('Lo más leído · ubicación original de escritorio');
    if(sidebarFeatures.contains(trending)) trending.parentNode.insertBefore(trendingAnchor,trending);
    else sidebarFeatures.appendChild(trendingAnchor);
    // Keep the <aside> ancestor used by desktop-specific editorial styling.
    const trendingMobileFooter = document.createElement('aside');
    trendingMobileFooter.id = 'aeHomeTrendingMobileFooter';
    trendingMobileFooter.className = 'ae-home-trending-mobile-footer';
    trendingMobileFooter.setAttribute('aria-label','Lo más leído');
    trendingMobileFooter.hidden = true;
    main.appendChild(trendingMobileFooter);
    const mobile = window.matchMedia('(max-width: 760px)');
    const onMobileHome = () => mobile.matches && document.body.classList.contains('ae-is-home');

    function sync(){
      if(onMobileHome()){
        if(featured.previousElementSibling !== hero) hero.insertAdjacentElement('afterend',featured);
        if(sidebarFeatures.previousElementSibling !== featured) featured.insertAdjacentElement('afterend',sidebarFeatures);
        // Relocate the REAL module after all mobile Home content, never copy it.
        if(trending.parentElement !== trendingMobileFooter) trendingMobileFooter.appendChild(trending);
        trendingMobileFooter.hidden = false;
        featured.classList.add('ae-home-native-picks');
        featured.setAttribute('role','link');
        featured.setAttribute('tabindex','0');
        featured.setAttribute('aria-label','Ir a Picks para ver el Pick del editor');
      } else {
        // Restore the SAME node (and its real contents/events) to the Picks tab.
        if(picksAnchor.parentNode && picksAnchor.nextSibling !== featured){
          picksAnchor.parentNode.insertBefore(featured,picksAnchor.nextSibling);
        }
        if(sidebarAnchor.parentNode && sidebarAnchor.nextSibling !== sidebarFeatures){
          sidebarAnchor.parentNode.insertBefore(sidebarFeatures,sidebarAnchor.nextSibling);
        }
        // All other tabs and desktop restore the original sidebar order.
        if(trendingAnchor.parentNode && trendingAnchor.nextSibling !== trending){
          trendingAnchor.parentNode.insertBefore(trending,trendingAnchor.nextSibling);
        }
        trendingMobileFooter.hidden = true;
        featured.classList.remove('ae-home-native-picks');
        featured.removeAttribute('role');
        featured.removeAttribute('tabindex');
        featured.removeAttribute('aria-label');
      }
    }

    function openPicks(event){
      if(!onMobileHome() || !featured.contains(event.target))return;
      // Share is a real action: never let the parent card steal the tap.
      if(event.target.closest?.('.ae-weekly-share'))return;
      if(event.type === 'keydown' && !['Enter',' '].includes(event.key))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(typeof filterByCategory === 'function'){
        filterByCategory('Picks');
        // Category view is visible by now; return it to its natural position.
        sync();
        document.getElementById('picksFeatured')?.scrollIntoView({block:'start',behavior:'auto'});
      }
    }

    // Capture taps before <summary> opens. On the home page a tap navigates
    // to Picks; once in Picks, the unchanged <details> expands as usual.
    featured.addEventListener('click',openPicks,true);
    featured.addEventListener('keydown',event=>{
      if(!onMobileHome())return;
      if(event.target !== featured)return; // Summary handles its own keyboard click.
      openPicks(event);
    },true);

    sync();
    const observer = new MutationObserver(() => {
      sync();
      // Football's mobile page restores shared nodes on an animation frame.
      // Apply Home placement after that work so switching tabs stays reliable.
      requestAnimationFrame(sync);
    });
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    if(mobile.addEventListener) mobile.addEventListener('change',sync);
    else if(mobile.addListener) mobile.addListener(sync);
    window.addEventListener('pageshow',sync);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();