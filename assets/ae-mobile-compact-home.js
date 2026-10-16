/* AE SPORTS · Home mobile preview expansion; never mutates publications or votes. */
(()=> {
  'use strict';
  function setup(){
    const controls=[
      {button:'aeMobileNewsMore',target:'articlesGrid',className:'ae-mobile-expanded'}
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
  // Portada móvil: la clasificación real ya entrega hasta tres Takes.
  // Uno a la vista; gesto nativo vertical, con altura según texto real.
  function setupSwipeTakes(){
    const mobile=window.matchMedia('(max-width:760px)');
    for(const [id,label] of [['aeTopTakesPositive','Genios'],['aeTopTakesNegative','Anoetos']]){
      const list=document.getElementById(id);
      const button=document.querySelector('.ae-mobile-takes-more[aria-controls="'+id+'"]');
      if(!list||!button)continue;
      list.tabIndex=0;
      list.setAttribute('role','region');
      list.setAttribute('aria-label',label+': los puestos 1, 2 y 3. Desliza hacia abajo para ver el siguiente.');
      button.removeAttribute('aria-expanded');
      button.setAttribute('aria-label','Ver siguiente puesto de '+label);
      button.textContent='Desliza ↓';
      function sync(){
        const items=[...list.children].filter(el=>el.classList.contains('ae-top-take'));
        if(!mobile.matches||!items.length){
          list.style.removeProperty('--ae-takes-swipe-height');
          button.hidden=items.length<2;
          return;
        }
        const height=Math.max(170,...items.map(item=>{
          const content=item.querySelector('.ae-top-take-content');
          return Math.ceil(content?.scrollHeight||0)+25;
        }));
        list.style.setProperty('--ae-takes-swipe-height',height+'px');
        button.hidden=items.length<2;
      }
      button.addEventListener('click',()=>{
        if(!mobile.matches)return;
        const items=[...list.children].filter(el=>el.classList.contains('ae-top-take'));
        if(items.length<2)return;
        const itemHeight=list.clientHeight||196;
        const current=Math.round(list.scrollTop/itemHeight);
        list.scrollTo({
          top:((current+1)%items.length)*itemHeight,
          behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'
        });
      });
      new MutationObserver(()=>requestAnimationFrame(sync)).observe(list,{childList:true});
      mobile.addEventListener('change',sync);
      window.addEventListener('resize',sync,{passive:true});
      requestAnimationFrame(sync);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setup();setupSwipeTakes();},{once:true});
  else {setup();setupSwipeTakes();}
})();
