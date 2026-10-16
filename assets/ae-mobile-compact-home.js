/* AE SPORTS · Home mobile preview expansion; never mutates publications or votes. */
(()=> {
  'use strict';
  function setup(){
    const controls=[
      {button:'aeMobileNewsMore',target:'articlesGrid',className:'ae-mobile-expanded'},
      {button:null,target:'aeTopTakesPositive',className:'ae-mobile-expanded'},
      {button:null,target:'aeTopTakesNegative',className:'ae-mobile-expanded'}
    ];
    for(const config of controls){
      const target=document.getElementById(config.target);
      const button=config.button
        ?document.getElementById(config.button)
        :document.querySelector('.ae-mobile-takes-more[aria-controls="'+config.target+'"]');
      if(!target||!button||button.dataset.aeCompactWired==='true')continue;
      button.dataset.aeCompactWired='true';
      button.addEventListener('click',()=>{
        const expanded=target.classList.toggle(config.className);
        button.setAttribute('aria-expanded',String(expanded));
        button.replaceChildren(document.createTextNode(expanded?'Ver menos ':'Ver más '));
        if(config.button==='aeMobileNewsMore'&&!expanded){
          button.replaceChildren(document.createTextNode('Ver todas '));
        }
        const arrow=document.createElement('span');
        arrow.setAttribute('aria-hidden','true');
        arrow.textContent=expanded?'↑':'→';
        button.append(arrow);
      });
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});
  else setup();
})();
