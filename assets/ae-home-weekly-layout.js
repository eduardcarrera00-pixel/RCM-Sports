/* AE SPORTS · Un único Pick editorial con el mismo nodo y la misma carga de Supabase.
   Móvil (portada): debajo del hero. Escritorio/otras secciones: barra editorial original. */
(() => {
  'use strict';
  function setup(){
    const pick=document.querySelector('.editorial-layout aside .editorial-pick');
    const hero=document.getElementById('heroSection');
    if(!pick || !hero || !pick.parentNode)return;
    const anchor=document.createComment('Posición original del Pick editorial');
    pick.parentNode.insertBefore(anchor,pick);
    const mobile=window.matchMedia('(max-width: 760px)');
    function sync(){
      const shouldMove=mobile.matches && document.body.classList.contains('ae-is-home');
      if(shouldMove){
        if(pick.previousElementSibling!==hero)hero.insertAdjacentElement('afterend',pick);
      }else if(anchor.parentNode && anchor.nextSibling!==pick){
        anchor.parentNode.insertBefore(pick,anchor.nextSibling);
      }
    }
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
    if(mobile.addEventListener)mobile.addEventListener('change',sync);
    else if(mobile.addListener)mobile.addListener(sync);
    window.addEventListener('pageshow',sync);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();