/* CAM SPORTS · El editor enriquecido solo se necesita al publicar noticias. */
(() => {
  'use strict';
  const src=new URL('ae-news-editor.js?v=20261024-on-demand-1',
    new URL('.',document.currentScript?.src||new URL('assets/',location.href))).href;
  let request=null;
  function ensure(){
    if(window.aeNewsEditor)return Promise.resolve(true);
    if(request)return request;
    request=new Promise(resolve=>{
      const tag=document.createElement('script');
      tag.async=true;
      tag.src=src;
      tag.onload=()=>resolve(Boolean(window.aeNewsEditor));
      tag.onerror=()=>{tag.remove();resolve(false);};
      document.head.append(tag);
    }).then(success=>{
      if(!success)request=null; // Keep the textarea fallback and permit another try.
      return success;
    });
    return request;
  }
  window.camAdminNewsEditorLoader=Object.freeze({ensure});
})();
