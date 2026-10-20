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
 // A struck original quote may disappear from full-screen OCR. Read that small
 // region again; yellow highlighting + a horizontal strike distinguish it from
 // the increased quote. Never reverse a boost percentage or derive odds from cash.
 async function originalTicketPrice(canvas,data,job,aborted){
  const lines=window.aePickCaptureParser.linesFrom(data);
  const header=lines.find(l=>/\b\d+\s*leg\s+same game parlay/i.test(l.text));
  if(!header?.bbox||!header.words?.length)return;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  const yellow=box=>{
   const x=Math.max(0,box.x0-3),y=Math.max(0,box.y0-3),w=Math.min(canvas.width-x,box.x1-box.x0+6),h=Math.min(canvas.height-y,box.y1-box.y0+6);
   const pixels=context.getImageData(x,y,w,h).data;let n=0;
   for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i+1]>120&&pixels[i+2]<110)n++;
   return n/(pixels.length/4)>.32;
  };
  const boosted=header.words.find(w=>/^[+-]\d{3,6}$/.test(w.text.trim())&&w.bbox&&yellow(w.bbox));
  if(!boosted)return;
  data.hasBoostedTicketPrice=true;
  const b=boosted.bbox,height=b.y1-b.y0;
  const labelEnd=header.words.filter(w=>/parlay/i.test(w.text)&&w.bbox).at(-1)?.bbox.x1??0;
  const left=Math.max(labelEnd+2,b.x0-(b.x1-b.x0)*1.4);
  const original=header.words.filter(w=>w.bbox&&w.bbox.x1<b.x0&&w.bbox.x0>labelEnd+2&&w.bbox.x0>left).at(-1);
  // OCR can omit the struck word entirely: the visible gap after the ticket
  // label and before the yellow quote is still a bounded region to re-read.
  const box=original?.bbox??{x0:left,x1:b.x0-4,y0:b.y0,y1:b.y1},pad=Math.max(3,Math.round(height*.18));
  const x=Math.round(Math.max(0,left,box.x0-pad)),y=Math.max(0,box.y0-pad),width=Math.round(Math.min(canvas.width,b.x0-3,box.x1+pad)-x),h=Math.min(canvas.height-y,box.y1-box.y0+pad*2);
  if(width<12)return;
  const pixels=context.getImageData(x,y,width,h),rows=[],corners=[0,width-1,(h-1)*width,h*width-1].map(p=>(pixels.data[p*4]+pixels.data[p*4+1]+pixels.data[p*4+2])/3).sort((a,b)=>a-b),background=(corners[1]+corners[2])/2;
  for(let r=0;r<h;r++){
   let count=0;for(let c=0;c<width;c++){const i=(r*width+c)*4;if(Math.abs((pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3-background)>40)count++;}
   if(count>width*.65&&r>h*.25&&r<h*.75)rows.push(r);
  }
  if(!rows.length)return;
  const crop=document.createElement('canvas');job.canvases.add(crop);crop.width=width*4;crop.height=h*4;
  const ctx=crop.getContext('2d',{alpha:false});ctx.drawImage(canvas,x,y,width,h,0,0,crop.width,crop.height);
  const small=document.createElement('canvas');job.canvases.add(small);small.width=width;small.height=h;const s=small.getContext('2d',{alpha:false});
  const seen=[];
  try{
   for(const [pass,mode] of ['13','13','7'].entries()){
    await job.worker.setParameters({tessedit_pageseg_mode:mode,tessedit_char_whitelist:'+-0123456789'});
    const scan=await Promise.race([job.worker.recognize(crop,{}, {text:true}),aborted]);
    const text=scan.data.text.trim(),value=window.aePickCaptureParser.odds(text);
    if(value&&/^[+-]\d{3,6}$/.test(text)&&scan.data.confidence>=85)seen.push({text,value,confidence:scan.data.confidence});
    if(pass===0){
     // Normalise contrast for both light and dark screenshots.
     for(let i=0;i<pixels.data.length;i+=4){const value=Math.abs((pixels.data[i]+pixels.data[i+1]+pixels.data[i+2])/3-background)>40?255:0;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value;}
     s.putImageData(pixels,0,0);ctx.drawImage(small,0,0,width,h,0,0,crop.width,crop.height);
    }else if(pass===1){
     // Erase only the long strike rows; retain surrounding glyph pixels.
     s.fillStyle='#000';for(const row of rows)s.fillRect(0,row,width,1);
     ctx.drawImage(small,0,0,width,h,0,0,crop.width,crop.height);
    }
   }
   if(seen.length&&Math.max(...seen.map(s=>s.confidence))>=92&&new Set(seen.map(s=>s.value.american)).size===1&&seen[0].value.decimal<window.aePickCaptureParser.odds(boosted.text).decimal)
    data.ticketPriceEvidence={visible:seen[0].text,confidence:Math.floor(Math.min(...seen.map(s=>s.confidence))),headerY:header.bbox.y0};
  }finally{
   crop.width=crop.height=1;job.canvases.delete(crop);
   small.width=small.height=1;job.canvases.delete(small);
   if(job.worker)await job.worker.setParameters({tessedit_char_whitelist:''});
  }
 }
 function mount({form,getPicks,applyImport,onChange=()=>{}}){
  let result=null,signature='',active=null,sequence=0;
  const fingerprint=()=>JSON.stringify({picks:getPicks().map(p=>({sport:p.sport,event:p.event,selection:p.selection,odds:Number(p.odds)})),date:result?.eventDate?form.elements.namedItem('event_date')?.value:''});
  const panel=node('section',null,'cp-capture');panel.setAttribute('aria-labelledby','cpCaptureTitle');
  const title=node('h3','Sube la captura de tu apuesta','cp-capture-title');title.id='cpCaptureTitle';
  const intro=node('p','El deporte, el partido, el pronóstico y el momio se rellenan automáticamente. Después revisas la fecha y, si quieres, nos cuentas por qué elegiste ese pick.','cp-capture-intro');
  const picker=node('button','Subir captura','cp-capture-picker'),input=document.createElement('input');picker.type='button';picker.setAttribute('aria-describedby','cpCaptureHelp cpCaptureStatus');
  input.type='file';input.id='cpCaptureFile';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.hidden=true;picker.addEventListener('click',()=>input.click());
  const help=node('p','Incluye el partido, el pronóstico, el momio y la fecha del evento si aparece. Una captura completa o una por selección · PNG, JPG o WebP · hasta 8 MB por imagen. La imagen no se guarda.','cp-capture-help');help.id='cpCaptureHelp';
  const status=node('p','','cp-capture-status');status.id='cpCaptureStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const privacy=node('div',null,'cp-capture-privacy');privacy.hidden=true;privacy.setAttribute('role','status');privacy.setAttribute('aria-live','polite');privacy.setAttribute('aria-atomic','true');
  const privacyIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');privacyIcon.setAttribute('viewBox','0 0 32 32');privacyIcon.setAttribute('aria-hidden','true');privacyIcon.classList.add('cp-capture-privacy-icon');
  privacyIcon.innerHTML='<g class="cp-capture-privacy-file"><path d="M9 3h10l6 6v20H7V3h2ZM19 3v7h6M11 15h10M11 20h7"/></g><path class="cp-capture-privacy-check" d="m8 16 5 5L24 10"/>';
  const privacyCopy=node('div',null,'cp-capture-privacy-copy'),privacyTitle=node('strong'),privacyText=node('p');privacyCopy.append(privacyTitle,privacyText);
  const privacySteps=node('ol',null,'cp-capture-privacy-steps');privacySteps.setAttribute('aria-hidden','true');
  privacySteps.append(...['Lectura','Descarte','Completado'].map(text=>node('li',text)));
  privacy.append(privacyIcon,privacyCopy,privacySteps);
  const summary=node('ul',null,'cp-capture-readings');summary.hidden=true;
  const confirmation=node('label',null,'cp-capture-confirm'),check=document.createElement('input');check.type='checkbox';check.id='cpCaptureConfirm';
  const confirmationText=node('span','Confirmo que hice esta apuesta, revisé el partido y el pronóstico y comprobé la fecha del evento.');
  confirmation.append(check,confirmationText);confirmation.hidden=true;
  const cancel=node('button','Cancelar lectura','cp-capture-cancel');cancel.type='button';cancel.hidden=true;
  panel.append(title,intro,picker,input,help,privacy,status,summary,cancel);
  form.prepend(panel);form.classList.add('cp-capture-first');
  form.querySelector('.cp-compose-footer').before(confirmation);
  const isCurrent=job=>active===job&&!job.cancelled;
  function showPrivacy(state){
   const copy={reading:['Leyendo en tu dispositivo','La captura se procesa aquí, sin subir la imagen.'],discarding:['Descartando captura…','Liberando la imagen y cerrando el lector.'],complete:['Captura descartada','La imagen no se ha subido ni guardado. Al publicar, solo guardamos los datos de tu pick.'],unconfirmed:['No se pudo confirmar el descarte','Recarga esta página para cerrar el lector antes de volver a intentarlo.']};
   privacy.hidden=false;privacy.dataset.state=state;privacyTitle.textContent=copy[state][0];privacyText.textContent=copy[state][1];
   const current={reading:0,discarding:1,complete:3,unconfirmed:1}[state];
   Array.from(privacySteps.children).forEach((step,index)=>{step.dataset.state=index<current?'complete':index===current?'active':'pending';});
  }
  function updateDateConfirmation(){
   const value=form.elements.namedItem('event_date')?.value,stamp=Date.parse(value+'T12:00:00Z');
   const date=Number.isFinite(stamp)?new Intl.DateTimeFormat('es',{dateStyle:'long',timeZone:'UTC'}).format(new Date(stamp)):'';
   confirmationText.textContent='Confirmo que hice esta apuesta, revisé el partido y el pronóstico y comprobé la fecha del evento'+(date?': '+date+'.':'.');
  }
  function dispose(job){
   if(!job)return Promise.resolve(true);
   if(job.disposal)return job.disposal;
   clearTimeout(job.timer);job.files=[];
   for(const canvas of job.canvases){canvas.width=1;canvas.height=1;}job.canvases.clear();
   for(const url of job.urls)URL.revokeObjectURL(url);job.urls.clear();
   const worker=job.worker;job.worker=null;
   let closed=Promise.resolve(true);
   try{if(worker)closed=Promise.resolve(worker.terminate()).then(()=>true,()=>false);}catch{closed=Promise.resolve(false);}
   job.disposal=Promise.all([closed,job.imageTask]).then(([discarded])=>discarded);
   return job.disposal;
  }
  function stop(){
   const job=active;if(!job)return;
   job.cancelled=true;active=null;job.abort?.(Error('Lectura cancelada.'));dispose(job);
   input.value='';input.disabled=false;picker.disabled=false;cancel.hidden=true;cancel.disabled=false;panel.removeAttribute('aria-busy');
   return job;
  }
  function clear(message='Elige una captura para importar tu apuesta y su momio.',showDiscard=false){
   const job=stop(),revision=++sequence;result=null;signature='';check.checked=false;confirmation.hidden=true;summary.hidden=true;summary.replaceChildren();privacy.hidden=true;
   input.value='';picker.textContent='Subir captura';panel.dataset.state='empty';status.textContent=message;applyImport(null);onChange();
   if(showDiscard&&job){
    showPrivacy('discarding');
    void dispose(job).then(discarded=>{if(sequence===revision&&!active)showPrivacy(discarded?'complete':'unconfirmed');});
   }
  }
  function invalidate(){
   if(result&&signature!==fingerprint())clear('La apuesta cambió. Importa otra captura para mantener unidos partido, pronóstico y momio.');
  }
  async function read(){
   let files=Array.from(input.files||[]);input.value='';if(!files.length)return;
   clear();
   if(files.length>2){
    files=[];status.textContent='Usa una captura completa o una imagen por cada una de las dos selecciones.';return;
   }
   if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8*1024*1024||!f.size)){
    files=[];status.textContent='Usa imágenes PNG, JPG o WebP de hasta 8 MB cada una.';return;
   }
   const job={id:++sequence,files,worker:null,canvases:new Set(),urls:new Set(),cancelled:false,abort:null,timer:null};files=[];active=job;
   const aborted=new Promise((_,reject)=>{job.abort=reject;});
   input.disabled=true;picker.disabled=true;cancel.hidden=false;cancel.disabled=false;panel.setAttribute('aria-busy','true');panel.dataset.state='reading';showPrivacy('reading');status.textContent='Preparando el lector en tu dispositivo…';
   job.timer=setTimeout(()=>{
    if(!isCurrent(job))return;clear('La lectura tardó demasiado. Prueba una captura más pequeña o más nítida.',true);
   },90000);
   let prepared=null,failure='';
   try{
    const T=await Promise.race([engine(),aborted]);
    if(!isCurrent(job))return;
    const pending=T.createWorker('eng+spa',1,{workerPath:vendor+'worker.min.js',corePath:vendor+'tesseract-core-lstm.wasm.js',langPath:vendor.replace(/\/$/,''),workerBlobURL:false,cacheMethod:'none',logger:m=>{
     if(isCurrent(job)&&m.status==='recognizing text')status.textContent='Leyendo la captura… '+Math.round((Number(m.progress)||0)*100)+'%';
    },errorHandler:()=>{}});
    pending.then(worker=>{if(!isCurrent(job))void worker.terminate().catch(()=>{});}).catch(()=>{});
    job.worker=await Promise.race([pending,aborted]);if(!isCurrent(job))return;
    const readings=[];let total=null,eventDate='';
    for(let i=0;i<job.files.length;i++){
     const rendering=imageCanvas(job.files[i],job);job.imageTask=rendering.catch(()=>{});
     const canvas=await Promise.race([rendering,aborted]);
     let compared,bestPartial;
     for(const mode of ['6','11']){
      await job.worker.setParameters({tessedit_pageseg_mode:mode,preserve_interword_spaces:'1'});
      let scanned=await Promise.race([job.worker.recognize(canvas,{}, {text:true,blocks:true}),aborted]);
      if(!isCurrent(job))return;
      await originalTicketPrice(canvas,scanned.data,job,aborted);
      compared=window.aePickCaptureParser.extract(scanned.data);scanned=null;
      if(compared.partial&&(!bestPartial||compared.partial.event.length>bestPartial.partial.event.length))bestPartial=compared;
      if(compared.ok)break;
     }
     if(!compared.ok&&bestPartial)compared=bestPartial;
     canvas.width=1;canvas.height=1;job.canvases.delete(canvas);job.files[i]=null;
     if(!compared.ok){
      if(compared.partial){
       const item=node('li');item.append(node('small',compared.partial.selectionCount+' selecciones recuperadas'),node('strong',compared.partial.event),node('span',compared.partial.selection));summary.replaceChildren(item);summary.hidden=false;
      }
      throw Error(compared.reason);
     }
     if(job.files.length>1&&compared.readings.length!==1)throw Error('Para dos imágenes, usa una captura de cada selección, sin otras apuestas.');
     if(job.files.length>1&&compared.readings.some(r=>r.selectionCount))throw Error('Usa una sola captura de la combinada completa. No combinamos boletos distintos.');
     if(eventDate&&compared.eventDate&&eventDate!==compared.eventDate)throw Error('Las capturas tienen fechas distintas. Usa el boleto de la misma combinada.');
     readings.push(...compared.readings);if(compared.total)total=compared.total;if(compared.eventDate)eventDate=compared.eventDate;
    }
    if(!isCurrent(job))return;
    prepared={readings,total,eventDate};
   }catch(error){
    if(isCurrent(job))failure=error?.message||'No pudimos leer la captura. Prueba otra.';
   }finally{
    if(isCurrent(job)){panel.dataset.state='discarding';showPrivacy('discarding');cancel.disabled=true;status.textContent=failure||'Lectura terminada. Descartando la captura…';}
    const discarded=await dispose(job);
    if(isCurrent(job)){
     active=null;input.value='';input.disabled=false;picker.disabled=false;cancel.hidden=true;cancel.disabled=false;panel.removeAttribute('aria-busy');showPrivacy(discarded?'complete':'unconfirmed');
     if(discarded&&prepared){
      result=prepared;applyImport(result);signature=fingerprint();
      panel.dataset.state='matched';status.textContent='Tu pick está preparado. Revisa los datos y confirma la fecha del evento para publicar.';picker.textContent='Cambiar captura';updateDateConfirmation();
      summary.replaceChildren(...prepared.readings.map((r,i)=>{
       const item=node('li');
       item.append(node('small',(r.selectionCount?r.selectionCount+' selecciones · ':prepared.readings.length>1?'Selección '+(i+1)+' · ':'')+(r.sport||'Otros')),node('strong',r.event),node('span',r.selection),node('span',(r.originalBeforeBoost?'Momio original, sin boost · ':'Momio automático · ')+(r.odds>0?'+':'')+r.odds,'cp-capture-odds'));
       return item;
      }));
      summary.hidden=false;confirmation.hidden=false;
     }else{
      result=null;panel.dataset.state='error';status.textContent=discarded?failure:'No pudimos cerrar el lector. Recarga la página antes de volver a intentarlo.';
     }
     onChange();
    }
   }
  }
  input.addEventListener('change',()=>void read());
  cancel.addEventListener('click',()=>clear('Lectura cancelada.',true));
  form.addEventListener('input',event=>{if(event.target!==check){invalidate();if(event.target.name==='event_date'){check.checked=false;updateDateConfirmation();}}onChange();});
  form.addEventListener('click',event=>{if(event.target.closest('.cp-compose-modes,.cp-compose-remove,.cp-compose-add'))invalidate();});
  form.addEventListener('reset',()=>clear());
  form.closest('dialog')?.addEventListener('close',()=>{if(active)clear('Lectura cancelada al cerrar. Añade otra captura para continuar.');});
  window.addEventListener('pagehide',()=>clear());
  return {
   clear,invalidate,
   hasImport(){return !!result&&signature===fingerprint();},
   isConfirmed(){return !!result&&signature===fingerprint()&&check.checked;},
   getTotal(){return result&&signature===fingerprint()?result.total:null;},
   proof(){
    invalidate();
    if(active)throw Error('Espera a que termine la lectura de la captura.');
    if(!result)throw Error('Añade una captura legible para comprobar el momio antes de publicar.');
    if(!check.checked)throw Error('Confirma que has revisado el partido, el pronóstico y la fecha. El momio es automático.');
    return {version:1,method:'on_device_ocr',confirmed:true,readings:result.readings.map(({event,selection,odds,confidence})=>({event,selection,odds,confidence})),total:result.total};
   }
  };
 }
 window.aePickCapture={mount};
})();
