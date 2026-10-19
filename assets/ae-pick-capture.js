/* Capturas efímeras: OCR local, sin subidas, previews, caché de imágenes ni texto OCR persistido. */
(() => {
 'use strict';
 const scriptUrl=document.currentScript?.src||new URL('assets/ae-pick-capture.js',location.href).href;
 const vendor=new URL('vendor/ocr/',scriptUrl).href;
 let enginePromise;
 function engine(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!enginePromise)enginePromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src=vendor+'tesseract.min.js';
   script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('No se pudo iniciar el lector.'));
   script.onerror=()=>{script.remove();enginePromise=null;reject(Error('No se pudo cargar el lector. Comprueba tu conexión e inténtalo otra vez.'));};
   document.head.append(script);
  });
  return enginePromise;
 }
 function node(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
 async function imageCanvas(file,job){
  let bitmap,url,img;
  try{
   if(typeof createImageBitmap==='function')bitmap=await createImageBitmap(file);
   else{
    url=URL.createObjectURL(file);job.urls.add(url);img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('La imagen no se puede abrir. Usa PNG, JPG o WebP.'));img.src=url;});bitmap=img;
   }
   if(job.cancelled)throw Error('Lectura cancelada.');
   const w=bitmap.width||bitmap.naturalWidth,h=bitmap.height||bitmap.naturalHeight;
   if(w<180||h<100||w*h>28000000||w>12000||h>12000)throw Error('Usa una captura legible y completa de hasta 28 megapíxeles.');
   const scale=Math.min(3,Math.max(1,1400/w),5000/h,Math.sqrt(6000000/(w*h)));
   const canvas=document.createElement('canvas');job.canvases.add(canvas);
   canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);
   const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   return canvas;
  }finally{
   if(bitmap&&typeof bitmap.close==='function')bitmap.close();
   if(img){img.src='';img.onload=null;img.onerror=null;}
   if(url){URL.revokeObjectURL(url);job.urls.delete(url);}
  }
 }
 function mount({form,getPicks,onChange=()=>{}}){
  let result=null,signature='',active=null,sequence=0;
  const fingerprint=()=>JSON.stringify(getPicks().map(p=>({sport:p.sport,event:p.event,selection:p.selection,odds:Number(p.odds)})));
  const panel=node('section',null,'cp-capture');panel.setAttribute('aria-labelledby','cpCaptureTitle');
  const title=node('h3','Comprueba tu momio','cp-capture-title');title.id='cpCaptureTitle';
  const intro=node('p','Añade el boleto donde se vean el partido, tu pronóstico y la cuota. Puedes tapar tu nombre, saldo e importe.','cp-capture-intro');
  const picker=node('button','Elegir captura','cp-capture-picker'),input=document.createElement('input');picker.type='button';picker.setAttribute('aria-describedby','cpCaptureHelp cpCaptureStatus');
  input.type='file';input.id='cpCaptureFile';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.hidden=true;picker.addEventListener('click',()=>input.click());
  const help=node('p','Una captura completa o una por selección. PNG, JPG o WebP · máximo 8 MB por imagen. Lector en pruebas: algunas capturas todavía no se reconocen. La lectura se hace en tu dispositivo; la imagen no se envía ni se guarda.','cp-capture-help');help.id='cpCaptureHelp';
  const status=node('p','Primero completa tu Pick y después añade la captura.','cp-capture-status');status.id='cpCaptureStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const summary=node('ul',null,'cp-capture-readings');summary.hidden=true;
  const confirmation=node('label',null,'cp-capture-confirm'),check=document.createElement('input');check.type='checkbox';check.id='cpCaptureConfirm';
  confirmation.append(check,node('span','He revisado el partido, el pronóstico y el momio. Son correctos.'));confirmation.hidden=true;
  const cancel=node('button','Cancelar lectura','cp-capture-cancel');cancel.type='button';cancel.hidden=true;
  panel.append(title,intro,picker,input,help,status,summary,confirmation,cancel);
  form.querySelector('.cp-compose-footer').before(panel);
  const isCurrent=job=>active===job&&!job.cancelled;
  function dispose(job){
   if(!job)return;
   clearTimeout(job.timer);job.files=[];
   for(const canvas of job.canvases){canvas.width=1;canvas.height=1;}job.canvases.clear();
   for(const url of job.urls)URL.revokeObjectURL(url);job.urls.clear();
   if(job.worker){void job.worker.terminate().catch(()=>{});job.worker=null;}
  }
  function stop(){
   const job=active;if(!job)return;
   job.cancelled=true;active=null;job.abort?.(Error('Lectura cancelada.'));dispose(job);
   input.value='';input.disabled=false;picker.disabled=false;cancel.hidden=true;panel.removeAttribute('aria-busy');
  }
  function clear(message='Añade una captura para comprobar el momio de este Pick.'){
   stop();sequence++;result=null;signature='';check.checked=false;confirmation.hidden=true;summary.hidden=true;summary.replaceChildren();
   input.value='';panel.dataset.state='empty';status.textContent=message;onChange();
  }
  function invalidate(){
   if((active||result)&&signature!==fingerprint())clear('Cambiaste el Pick. Añade de nuevo la captura para cotejar los datos actualizados.');
  }
  async function read(){
   let files=Array.from(input.files||[]);input.value='';if(!files.length)return;
   clear();const picks=getPicks();
   if(picks.some(p=>p.event.length<3||p.selection.length<2||!Number.isInteger(Number(p.odds))||Math.abs(Number(p.odds))<100)){
    files=[];status.textContent='Completa el partido, el pronóstico y el momio antes de añadir la captura.';return;
   }
   if(files.length>2||(files.length>1&&files.length!==picks.length)){
    files=[];status.textContent='Usa una captura completa o una imagen por cada una de las dos selecciones.';return;
   }
   if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8*1024*1024||!f.size)){
    files=[];status.textContent='Usa imágenes PNG, JPG o WebP de hasta 8 MB cada una.';return;
   }
   signature=fingerprint();
   const job={id:++sequence,files,worker:null,canvases:new Set(),urls:new Set(),cancelled:false,abort:null,timer:null};files=[];active=job;
   const aborted=new Promise((_,reject)=>{job.abort=reject;});
   input.disabled=true;picker.disabled=true;cancel.hidden=false;panel.setAttribute('aria-busy','true');panel.dataset.state='reading';status.textContent='Preparando el lector en tu dispositivo…';
   job.timer=setTimeout(()=>{
    if(!isCurrent(job))return;clear('La lectura tardó demasiado. Prueba una captura más pequeña o más nítida.');
   },90000);
   try{
    const T=await Promise.race([engine(),aborted]);
    if(!isCurrent(job))return;
    const pending=T.createWorker('eng+spa',1,{workerPath:vendor+'worker.min.js',corePath:vendor+'tesseract-core-lstm.wasm.js',langPath:vendor.replace(/\/$/,''),workerBlobURL:false,cacheMethod:'none',logger:m=>{
     if(isCurrent(job)&&m.status==='recognizing text')status.textContent='Leyendo la captura… '+Math.round((Number(m.progress)||0)*100)+'%';
    },errorHandler:()=>{}});
    pending.then(worker=>{if(!isCurrent(job))void worker.terminate().catch(()=>{});}).catch(()=>{});
    job.worker=await Promise.race([pending,aborted]);if(!isCurrent(job))return;
    const readings=[];let total=null;
    for(let i=0;i<job.files.length;i++){
     const canvas=await Promise.race([imageCanvas(job.files[i],job),aborted]);
     const expected=job.files.length===1?picks:[picks[i]];
     let compared;
     for(const mode of ['6','11']){
      await job.worker.setParameters({tessedit_pageseg_mode:mode,preserve_interword_spaces:'1'});
      let scanned=await Promise.race([job.worker.recognize(canvas,{}, {text:true,blocks:true}),aborted]);
      if(!isCurrent(job))return;
      compared=window.aePickCaptureParser.compare(scanned.data,expected);scanned=null;
      if(compared.ok)break;
     }
     canvas.width=1;canvas.height=1;job.canvases.delete(canvas);job.files[i]=null;
     if(!compared.ok)throw Error(compared.reason);
     readings.push(...compared.readings);if(compared.total)total=compared.total;
    }
    if(!isCurrent(job)||signature!==fingerprint())return;
    result={readings,total};panel.dataset.state='matched';status.textContent='Los datos coinciden. La imagen ya se ha descartado. Revisa el resultado antes de publicar.';
    summary.replaceChildren(...readings.map((r,i)=>node('li',(picks.length>1?'Selección '+(i+1)+' · ':'')+r.event+' · '+r.selection+' · '+(r.odds>0?'+':'')+r.odds+' (leído: '+r.visible+', '+r.format+')')));
    summary.hidden=false;confirmation.hidden=false;onChange();
   }catch(error){
    if(isCurrent(job)){result=null;panel.dataset.state='error';status.textContent=(error?.message||'No pudimos leer la captura. Prueba otra.')+' La imagen se ha descartado.';}
   }finally{
    dispose(job);
    if(active===job){active=null;input.value='';input.disabled=false;picker.disabled=false;cancel.hidden=true;panel.removeAttribute('aria-busy');}
   }
  }
  input.addEventListener('change',()=>void read());
  cancel.addEventListener('click',()=>clear('Lectura cancelada. La imagen se ha descartado.'));
  form.addEventListener('input',event=>{if(event.target!==check)invalidate();});
  form.addEventListener('click',event=>{if(event.target.closest('.cp-compose-modes,.cp-compose-remove,.cp-compose-add'))invalidate();});
  form.addEventListener('reset',()=>clear());
  form.closest('dialog')?.addEventListener('close',()=>{if(active)clear('Lectura cancelada al cerrar. Añade otra captura para continuar.');});
  window.addEventListener('pagehide',()=>clear());
  return {
   clear,invalidate,
   getTotal(){return result&&signature===fingerprint()?result.total:null;},
   proof(){
    invalidate();
    if(active)throw Error('Espera a que termine la lectura de la captura.');
    if(!result)throw Error('Añade una captura legible para comprobar el momio antes de publicar.');
    if(!check.checked)throw Error('Confirma que el partido, el pronóstico y el momio leídos son correctos.');
    return {version:1,method:'on_device_ocr',confirmed:true,readings:result.readings.map(({event,selection,odds,confidence})=>({event,selection,odds,confidence})),total:result.total};
   }
  };
 }
 window.aePickCapture={mount};
})();
