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
    if(!featured || !homePreview || !hero || !sidebarFeatures || !featured.parentNode || !sidebarFeatures.parentNode) return;

    // Mark the native Picks component's permanent location without cloning it.
    const picksAnchor = document.createComment('Pick de la Semana · posición original en Picks');
    featured.parentNode.insertBefore(picksAnchor, featured);
    const sidebarAnchor = document.createComment('Rankings de portada · posición original en la columna derecha');
    sidebarFeatures.parentNode.insertBefore(sidebarAnchor, sidebarFeatures);
    const mobile = window.matchMedia('(max-width: 760px)');
    const onMobileHome = () => mobile.matches && document.body.classList.contains('ae-is-home');

    function sync(){
      if(onMobileHome()){
        if(featured.previousElementSibling !== hero) hero.insertAdjacentElement('afterend',featured);
        if(sidebarFeatures.previousElementSibling !== featured) featured.insertAdjacentElement('afterend',sidebarFeatures);
        featured.classList.add('ae-home-native-picks');
        featured.setAttribute('role','link');
        featured.setAttribute('tabindex','0');
        featured.setAttribute('aria-label','Ir a Picks para ver el Pick de la Semana');
      } else {
        // Restore the SAME node (and its real contents/events) to the Picks tab.
        if(picksAnchor.parentNode && picksAnchor.nextSibling !== featured){
          picksAnchor.parentNode.insertBefore(featured,picksAnchor.nextSibling);
        }
        if(sidebarAnchor.parentNode && sidebarAnchor.nextSibling !== sidebarFeatures){
          sidebarAnchor.parentNode.insertBefore(sidebarFeatures,sidebarAnchor.nextSibling);
        }
        featured.classList.remove('ae-home-native-picks');
        featured.removeAttribute('role');
        featured.removeAttribute('tabindex');
        featured.removeAttribute('aria-label');
      }
    }

    function openPicks(event){
      if(!onMobileHome() || !featured.contains(event.target))return;
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
    const observer = new MutationObserver(sync);
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    if(mobile.addEventListener) mobile.addEventListener('change',sync);
    else if(mobile.addListener) mobile.addListener(sync);
    window.addEventListener('pageshow',sync);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();