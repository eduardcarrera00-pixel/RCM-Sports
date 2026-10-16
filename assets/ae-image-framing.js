/* Vista previa y encuadre persistente de fotografías editoriales de AE SPORTS. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const configs = {
    banner:{file:'aeWeeklyBannerInput',url:'aeWeeklyBannerUrl',preview:'aeWeeklyBannerPreview',x:'aeWeeklyBannerX',y:'aeWeeklyBannerY'},
    weekly:{file:'aeWeeklyImageInput',url:'aeWeeklyImageUrl',preview:'aeWeeklyImagePreview',x:'aeWeeklyImageX',y:'aeWeeklyImageY'},
    news:{file:'pubImageFile',url:'pubImage',preview:'pubImagePreview',x:'pubImageFocusX',y:'pubImageFocusY'}
  };
  const blobUrls={};
  const existingUrls={};
  const limit = v => Math.max(0,Math.min(100,Number.isFinite(Number(v))?Math.round(Number(v)):50));
  const get = key => {
    const c=configs[key];
    if(!c)return {x:50,y:50};
    return {x:limit($(c.x)?.value),y:limit($(c.y)?.value)};
  };
  const safeUrl = v => {
    if(!v)return '';
    try {
      const url=new URL(v);
      return url.protocol==='https:' && !url.username && !url.password && url.hostname && url.href.length<=2048 ? url.href : '';
    }catch{return '';}
  };
  function repaint(key){
    const c=configs[key],target=c&&$(c.preview);
    if(!target)return;
    if(blobUrls[key]){URL.revokeObjectURL(blobUrls[key]);delete blobUrls[key];}
    const file=$(c.file)?.files?.[0], typed=$(c.url)?.value.trim();
    if(file && (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)){
      target.textContent='Selecciona JPG, PNG o WEBP de máximo 5 MB.';
      return;
    }
    const url=file?(blobUrls[key]=URL.createObjectURL(file)):(safeUrl(typed)||existingUrls[key]||'');
    target.replaceChildren();
    target.classList.add('ae-image-framing-preview');
    if(!url){
      target.textContent=typed?'Introduce un enlace válido que comience con https://':'Vista previa de la imagen';
      return;
    }
    const img=document.createElement('img');
    img.src=url;
    img.alt='Vista previa: ajusta la posición horizontal y vertical';
    img.style.objectPosition=get(key).x+'% '+get(key).y+'%';
    img.addEventListener('error',()=>{target.textContent='No se pudo cargar esta imagen. Revisa el enlace o el archivo.';});
    target.append(img);
  }
  function move(key){
    const img=$(configs[key]?.preview)?.querySelector('img');
    if(img)img.style.objectPosition=get(key).x+'% '+get(key).y+'%';
  }
  function set(key,x=50,y=50){
    const c=configs[key];if(!c)return;
    if($(c.x))$(c.x).value=String(limit(x));
    if($(c.y))$(c.y).value=String(limit(y));
    repaint(key);
  }
  function setExisting(key,url){
    if(!configs[key])return;
    existingUrls[key]=safeUrl(url);
    repaint(key);
  }
  function reset(key){
    existingUrls[key]='';
    set(key,50,50);
  }
  function init(){
    for(const [key,c] of Object.entries(configs)){
      $(c.file)?.addEventListener('change',()=>{
        if($(c.file)?.files?.length && $(c.url))$(c.url).value='';
        repaint(key);
      });
      $(c.url)?.addEventListener('input',()=>{
        if($(c.url)?.value.trim() && $(c.file))$(c.file).value='';
        repaint(key);
      });
      for(const id of [c.x,c.y])$(id)?.addEventListener('input',()=>move(key));
      document.querySelector('[data-ae-center="'+key+'"]')?.addEventListener('click',()=>set(key,50,50));
      repaint(key);
    }
    $('aeWeeklyPickForm')?.addEventListener('reset',()=>setTimeout(()=>{reset('banner');reset('weekly');},0));
  }
  window.aeImageFraming={get,set,setExisting,reset,repaint,safeUrl};
  document.addEventListener('DOMContentLoaded',init);
})();
