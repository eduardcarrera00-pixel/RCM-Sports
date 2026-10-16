/* AE SPORTS · NFL: muestra dos posiciones bajo el líder y permite
   recorrer la clasificación existente. Ningún dato, voto o RPC se modifica. */
(() => {
  'use strict';
  function init(){
    const list=document.getElementById('rankingList');
    const back=document.getElementById('aeNflRankingPrevious');
    const next=document.getElementById('aeNflRankingNext');
    if(!list || !back || !next)return;
    let firstIndex=1; // #1 se muestra en nflRankOne, fuera de la franja.
    function paint(){
      const teams=Array.from(list.children).filter(n=>n.nodeType===1);
      const eligible=Math.max(0,teams.length-1);
      const lastStart=Math.max(1,teams.length-1);
      if(firstIndex>lastStart)firstIndex=Math.max(1,lastStart-(lastStart-1)%2);
      for(const [i,node] of teams.entries()){
        node.classList.toggle('ae-nfl-window-current',i>=firstIndex && i<firstIndex+2);
      }
      list.classList.toggle('ae-nfl-window-ready',eligible>0);
      back.disabled=firstIndex<=1 || !eligible;
      next.disabled=firstIndex+2>=teams.length || !eligible;
      back.setAttribute('aria-label','Ver las posiciones anteriores de NFL');
      next.setAttribute('aria-label','Ver las siguientes posiciones de NFL');
    }
    back.addEventListener('click',()=>{
      firstIndex=Math.max(1,firstIndex-2);
      paint();
    });
    next.addEventListener('click',()=>{
      const total=list.children.length;
      if(firstIndex+2<total)firstIndex+=2;
      paint();
    });
    const observer=new MutationObserver(mutations=>{
      if(mutations.some(m=>m.type==='childList')){
        firstIndex=1;paint();
      }
    });
    observer.observe(list,{childList:true});
    paint();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();