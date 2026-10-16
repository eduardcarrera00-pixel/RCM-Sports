/* AE SPORTS · NFL mobile compact controls.
   No ranking logic here: Power Rankings keep the original automatic ticker. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  function bindToggle(button,list,expandedClass,allLabel){
    if(!button||!list||button.dataset.aeNflCompactBound==='true')return;
    button.dataset.aeNflCompactBound='true';
    button.addEventListener('click',()=>{
      if(!document.body.classList.contains('ae-is-nfl'))return;
      const expanded=list.classList.toggle(expandedClass);
      button.setAttribute('aria-expanded',String(expanded));
      button.replaceChildren(document.createTextNode(expanded?'Ver menos ':'Ver todos '));
      if(allLabel && !expanded)button.replaceChildren(document.createTextNode(allLabel+' '));
      const arrow=document.createElement('span');
      arrow.setAttribute('aria-hidden','true');
      arrow.textContent=expanded?'↑':'→';
      button.append(arrow);
    });
  }
  function setup(){
    document.querySelectorAll('#aeSportTakeLeaders .ae-football-leaders-more').forEach(button=>{
      bindToggle(button,$(button.getAttribute('aria-controls')),'ae-nfl-expanded','Ver todos');
    });
    bindToggle($('aeFootballMoreTakes'),$('freeTakesFeed'),'ae-nfl-expanded','Ver todos los Takes');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();