/* CAM SPORTS · El editor enriquecido solo se necesita al publicar noticias.
 * 18 nov 2026: junto a él se carga la opción «NFL · Power Rankings» (10 cajas). */
(() => {
  'use strict';
  const base=new URL('.',document.currentScript?.src||new URL('assets/',location.href));
  const src=new URL('ae-news-editor.js?v=20261024-on-demand-1',base).href;
  const rankingsSrc=new URL('cam-power-rankings-publish.js?v=20261118-power-rankings-cajas-1',base).href;
  const load=(url,ready)=>new Promise(resolve=>{
    const tag=document.createElement('script');
    tag.async=true;
    tag.src=url;
    tag.onload=()=>resolve(Boolean(ready()));
    tag.onerror=()=>{tag.remove();resolve(false);};
    document.head.append(tag);
  });
  let request=null,rankings=null;
  function ensure(){
    // Si falla, el formulario de siempre sigue: solo no aparece la opción de las cajas.
    if(!window.camPowerRankingsPublish&&!rankings)rankings=load(rankingsSrc,()=>window.camPowerRankingsPublish).then(ok=>{if(!ok)rankings=null;return ok;});
    if(window.aeNewsEditor)return Promise.all([true,rankings]).then(()=>true);
    if(request)return request;
    request=Promise.all([load(src,()=>window.aeNewsEditor),rankings]).then(([success])=>{
      if(!success)request=null; // Keep the textarea fallback and permit another try.
      return success;
    });
    return request;
  }
  window.camAdminNewsEditorLoader=Object.freeze({ensure});
})();
