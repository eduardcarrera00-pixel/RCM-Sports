/* Vista previa y encuadre persistente de fotografías editoriales de AE SPORTS. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const configs = {
    banner:{file:'aeWeeklyBannerInput',url:'aeWeeklyBannerUrl',preview:'aeWeeklyBannerPreview',x:'aeWeeklyBannerX',y:'aeWeeklyBannerY'},
    weekly:{file:'aeWeeklyImageInput',url:'aeWeeklyImageUrl',preview:'aeWeeklyImagePreview',x:'aeWeeklyImageX',y:'aeWeeklyImageY'},
    news:{file:'pubImageFile',url:'pubImage',preview:'pubImagePreview',x:'pubImageFocusX',y:'pubImageFocusY',zoom:'pubImageZoom'}
  };
  const blobUrls={};
  const existingUrls={};
  const limit = v => Math.max(0,Math.min(100,Number.isFinite(Number(v))?Math.round(Number(v)):50));
  const get = key => {
    const c=configs[key];
    if(!c)return {x:50,y:50,zoom:true};
    return {
      x:limit($(c.x)?.value),
      y:limit($(c.y)?.value),
      zoom:c.zoom ? $(c.zoom)?.value !== 'nozoom' : true
    };
  };
  const safeUrl = v => {
    if(!v)return '';
    try {
      const url=new URL(v);
      return url.protocol==='https:' && !url.username && !url.password && url.hostname && url.href.length<=2048 ? url.href : '';
    }catch{return '';}
  };
  function readout(input,label){
    if(!input)return;
    let out=input.parentElement?.querySelector('output[data-ae-frame-value]');
    if(!out){
      out=document.createElement('output');
      out.dataset.aeFrameValue='';
      out.style.fontSize='11px';
      out.style.fontWeight='600';
      out.style.opacity='.72';
      out.style.alignSelf='flex-start';
      input.insertAdjacentElement('afterend',out);
    }
    out.value=String(limit(input.value));
    out.textContent=label+' '+limit(input.value)+'%';
  }
  function updateReadout(key){
    const c=configs[key];if(!c)return;
    readout($(c.x),'Horizontal');
    readout($(c.y),'Vertical');
    const zoom=$(c.zoom);
    if(zoom){
      zoom.setAttribute('aria-label','Zoom de imagen: '+(zoom.value==='nozoom'?'Sin zoom':'Zoom'));
    }
  }
  function applyFrame(key,img){
    if(!img)return;
    const state=get(key);
    img.style.objectPosition=state.x+'% '+state.y+'%';
    if(configs[key]?.zoom){
      img.style.setProperty('object-fit',state.zoom?'cover':'contain','important');
    }
    updateReadout(key);
  }
  function repaint(key){
    const c=configs[key],target=c&&$(c.preview);
    if(!target)return;
    if(blobUrls[key]){URL.revokeObjectURL(blobUrls[key]);delete blobUrls[key];}
    const file=$(c.file)?.files?.[0], typed=$(c.url)?.value.trim();
    if(file && (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)){
      target.textContent='Selecciona JPG, PNG o WEBP de máximo 5 MB.';
      updateReadout(key);
      return;
    }
    const url=file?(blobUrls[key]=URL.createObjectURL(file)):(safeUrl(typed)||existingUrls[key]||'');
    target.replaceChildren();
    target.classList.add('ae-image-framing-preview');
    if(!url){
      target.textContent=typed?'Introduce un enlace válido que comience con https://':'Vista previa de la imagen';
      updateReadout(key);
      return;
    }
    const img=document.createElement('img');
    img.src=url;
    img.alt='Vista previa: ajusta el encuadre horizontal, vertical y el zoom';
    applyFrame(key,img);
    img.addEventListener('error',()=>{target.textContent='No se pudo cargar esta imagen. Revisa el enlace o el archivo.';});
    target.append(img);
  }
  function move(key){
    const img=$(configs[key]?.preview)?.querySelector('img');
    applyFrame(key,img);
  }
  function set(key,x=50,y=50,zoom=true){
    const c=configs[key];if(!c)return;
    if($(c.x))$(c.x).value=String(limit(x));
    if($(c.y))$(c.y).value=String(limit(y));
    if(c.zoom && $(c.zoom))$(c.zoom).value=zoom===false?'nozoom':'zoom';
    repaint(key);
  }
  function setExisting(key,url){
    if(!configs[key])return;
    existingUrls[key]=safeUrl(url);
    repaint(key);
  }
  function reset(key){
    existingUrls[key]='';
    set(key,50,50,true);
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
      for(const id of [c.x,c.y]){
        $(id)?.addEventListener('input',()=>move(key));
        $(id)?.addEventListener('change',()=>move(key));
      }
      if(c.zoom){
        $(c.zoom)?.addEventListener('input',()=>move(key));
        $(c.zoom)?.addEventListener('change',()=>move(key));
      }
      document.querySelector('[data-ae-center="'+key+'"]')?.addEventListener('click',()=>set(key,50,50,get(key).zoom));
      repaint(key);
    }
    $('aeWeeklyPickForm')?.addEventListener('reset',()=>setTimeout(()=>{reset('banner');reset('weekly');},0));
  }
  window.aeImageFraming={get,set,setExisting,reset,repaint,safeUrl};
  document.addEventListener('DOMContentLoaded',init);
})();
