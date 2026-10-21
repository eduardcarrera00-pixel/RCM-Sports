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
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 /* Pantalla de carga en dos fases: leer la captura y después borrarla. Refleja el trabajo real;
    solo garantiza un tiempo mínimo en pantalla para que cada fase se pueda leer con calma. */
 function makeOverlay(host,onCancel){
  const root=node('div',null,'cp-capture-overlay');root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','cpCaptureOverlayTitle');root.setAttribute('aria-describedby','cpCaptureOverlayText');
  const card=node('div',null,'cp-capture-overlay-card');
  const art=document.createElementNS('http://www.w3.org/2000/svg','svg');art.setAttribute('viewBox','0 0 96 112');art.setAttribute('aria-hidden','true');art.classList.add('cp-capture-overlay-art');
  art.innerHTML='<g class="cp-ov-ticket"><path class="cp-ov-paper" d="M18 6h60v94l-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6-7.5-6-7.5 6Z"/><path class="cp-ov-line" d="M30 26h36"/><path class="cp-ov-line" d="M30 40h26"/><path class="cp-ov-line" d="M30 54h36"/><path class="cp-ov-line" d="M30 68h18"/><path class="cp-ov-odds" d="M56 68h10"/></g><rect class="cp-ov-scan" x="12" y="6" width="72" height="3" rx="1.5"/><path class="cp-ov-check" d="m30 56 13 13 24-28"/>';
  const title=node('h2','','cp-capture-overlay-title');title.id='cpCaptureOverlayTitle';
  const text=node('p','','cp-capture-overlay-text');text.id='cpCaptureOverlayText';
  const meter=node('div',null,'cp-capture-overlay-meter');meter.setAttribute('role','progressbar');meter.setAttribute('aria-label','Progreso de lectura');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
  const meterBar=node('span');meter.append(meterBar);
  const steps=node('ol',null,'cp-capture-overlay-steps');
  const labels=['Leer datos','Borrar captura','Listo'];steps.append(...labels.map(label=>node('li',label)));
  const live=node('p','','cp-capture-overlay-live');live.setAttribute('aria-live','polite');
  const cancel=node('button','Cancelar','cp-capture-overlay-cancel');cancel.type='button';cancel.addEventListener('click',()=>onCancel());
  const close=node('button','Entendido','cp-capture-overlay-cancel');close.type='button';close.hidden=true;close.addEventListener('click',()=>hide());
  card.append(art,title,text,meter,steps,live,cancel,close);root.append(card);host.append(root);
  const copy={
   reading:['Leyendo tu apuesta','Buscamos el partido, tu pronóstico y el momio en la captura.'],
   discarding:['Borrando tu captura','Eliminamos la imagen de esta página. Solo nos quedamos con los datos de tu pick.'],
   complete:['Captura eliminada','No guardamos la imagen. Tu foto original sigue solo en tu dispositivo.'],
   failed:['Captura eliminada','No pudimos leer todos los datos, pero la imagen ya no está en la página. Prueba con otra captura más nítida.'],
   unconfirmed:['No pudimos confirmar el borrado','Recarga la página antes de volver a intentarlo para cerrar el lector por completo.']
  };
  let hideTimer=null;
  function show(state,{percent=null,note=''}={}){
   clearTimeout(hideTimer);root.hidden=false;root.dataset.state=state;
   if(title.textContent!==copy[state][0])live.textContent=copy[state][0];
   title.textContent=copy[state][0];text.textContent=note||copy[state][1];
   const index={reading:0,discarding:1,complete:2,failed:2,unconfirmed:1}[state];
   Array.from(steps.children).forEach((step,i)=>{step.dataset.state=i<index||((state==='complete'||state==='failed')&&i===index)?'complete':i===index?'active':'pending';});
   meter.hidden=state!=='reading';cancel.hidden=state!=='reading';close.hidden=state!=='unconfirmed';
   if(state==='reading')progress(percent);
   if(state==='unconfirmed')close.focus({preventScroll:true});
  }
  function progress(percent){
   if(percent==null){meter.dataset.mode='waiting';meterBar.style.width='';meter.removeAttribute('aria-valuenow');return;}
   const value=Math.max(0,Math.min(100,Math.round(percent)));meter.dataset.mode='value';meterBar.style.width=value+'%';meter.setAttribute('aria-valuenow',String(value));
  }
  function hide(after=0){
   clearTimeout(hideTimer);
   const run=()=>{root.hidden=true;delete root.dataset.state;meterBar.style.width='0%';};
   if(after>0)hideTimer=setTimeout(run,after);else run();
  }
  return {show,progress,hide,setNote(note){text.textContent=note;},get visible(){return !root.hidden;}};
 }
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
  let result=null,signature='',active=null,sequence=0,usedAi=false;
  const fingerprint=()=>JSON.stringify({picks:getPicks().map(p=>({sport:p.sport,event:p.event,selection:p.selection,odds:Number(p.odds)}))});
  const panel=node('section',null,'cp-capture');panel.setAttribute('aria-labelledby','cpCaptureTitle');
  const title=node('h3','Sube la captura de tu apuesta','cp-capture-title');title.id='cpCaptureTitle';
  const intro=node('p','Leemos el partido, el pronóstico y el momio. Confirma los datos antes de publicar.','cp-capture-intro');
  const picker=node('button','Subir captura','cp-capture-picker'),input=document.createElement('input');picker.type='button';picker.setAttribute('aria-describedby','cpCaptureHelp cpCaptureStatus');
  input.type='file';input.id='cpCaptureFile';input.accept='image/png,image/jpeg,image/webp';input.multiple=true;input.hidden=true;picker.addEventListener('click',()=>input.click());
  const help=node('p','PNG, JPG o WebP · máx. 8 MB por imagen. No guardamos ni publicamos la captura. Si falla la lectura local, podemos usar Google temporalmente y te avisaremos.','cp-capture-help');help.id='cpCaptureHelp';
  const status=node('p','','cp-capture-status');status.id='cpCaptureStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const privacy=node('div',null,'cp-capture-privacy');privacy.hidden=true;privacy.setAttribute('role','status');privacy.setAttribute('aria-live','polite');privacy.setAttribute('aria-atomic','true');
  const privacyIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');privacyIcon.setAttribute('viewBox','0 0 32 32');privacyIcon.setAttribute('aria-hidden','true');privacyIcon.classList.add('cp-capture-privacy-icon');
  privacyIcon.innerHTML='<g class="cp-capture-privacy-file"><path d="M9 3h10l6 6v20H7V3h2ZM19 3v7h6M11 15h10M11 20h7"/></g><path class="cp-capture-privacy-check" d="m8 16 5 5L24 10"/>';
  const privacyCopy=node('div',null,'cp-capture-privacy-copy'),privacyTitle=node('strong'),privacyText=node('p');privacyCopy.append(privacyTitle,privacyText);
  const privacySteps=node('ol',null,'cp-capture-privacy-steps');privacySteps.setAttribute('aria-hidden','true');
  privacySteps.append(...['Lectura','Descarte','Completado'].map(text=>node('li',text)));
  privacy.append(privacyIcon,privacyCopy,privacySteps);
  const shot=node('div',null,'cp-capture-shot');shot.hidden=true;const shotImage=node('img');shotImage.alt='Captura temporal durante la lectura';shot.append(shotImage);
  const progress=node('div',null,'cp-capture-progress');progress.hidden=true;progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Lectura de captura');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','100');
  const progressBar=node('span',null,'cp-capture-progress-bar');progress.append(progressBar);
  const summary=node('ul',null,'cp-capture-readings');summary.hidden=true;
  const cancel=node('button','Cancelar lectura','cp-capture-cancel');cancel.type='button';cancel.hidden=true;
  // El comprobante es temporal; este aviso acompaña al botón sin alterar el proceso.
  const proof=node('p',null,'cp-capture-proof');
  proof.append(node('strong','Aquí lo que se canta se baila.'),node('span','Pedimos tu captura como evidencia del Pick. La leemos y después la descartamos.'));
  panel.append(title,intro,picker,proof,input,shot,help,progress,privacy,status,summary,cancel);
  form.prepend(panel);form.classList.add('cp-capture-first');
  const overlay=makeOverlay(form.closest('dialog')||document.body,()=>clear('Lectura cancelada.',true));
  const isCurrent=job=>active===job&&!job.cancelled;
  const aiClient=()=>{try{const c=typeof db!=='undefined'?db:window.db;return c?.functions?.invoke?c:null;}catch{return null;}};
  async function jpeg(file,job){
   const bitmap=await createImageBitmap(file);
   try{
    const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');job.canvases.add(canvas);
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
    const data=canvas.toDataURL('image/jpeg',.86);canvas.width=1;canvas.height=1;job.canvases.delete(canvas);
    return data;
   }finally{bitmap.close?.();}
  }
  async function readWithAi(job){
   const client=aiClient();
   const session=await client.auth?.getSession?.();
   if(!session?.data?.session)throw Error('Inicia sesión para usar la lectura avanzada de capturas.');
   let images=[];
   for(const file of job.originals||[])images.push(await jpeg(file,job));
   overlay.progress(35);
   const tick=setInterval(()=>{if(isCurrent(job)){const now=Number(progress.getAttribute('aria-valuenow')||35);const next=Math.min(92,now+4);overlay.progress(next);progress.setAttribute('aria-valuenow',String(next));progressBar.style.width=next+'%';}},700);
   let response;
   try{response=await client.functions.invoke('ae-read-ticket',{body:{images}});}
   finally{clearInterval(tick);images=null;}
   let data=response.data;
   if(response.error){
    try{data=await response.error.context?.json?.();}catch{}
    throw Error(data?.error||'La lectura avanzada no está disponible ahora. Inténtalo en unos minutos.');
   }
   if(!data?.ok)throw Error(data?.reason||'No pudimos leer la captura. Prueba con otra más nítida.');
   overlay.progress(100);
   const readings=data.readings.map(r=>({...r,eventDate:r.eventDate||'',confidence:95}));
   return {readings,total:data.total||null,eventDate:data.eventDate||'',dateSource:data.dateSource||'',aiReadId:data.readId,singles:!!data.singles};
  }
  function showPrivacy(state,readFailed=false){
   const copy={reading:['Leyendo en tu dispositivo','La captura se procesa aquí, sin subir la imagen.'],discarding:['Descartando captura…','Liberando la imagen y cerrando el lector.'],complete:['Captura descartada','La imagen no se ha subido ni guardado. Al publicar, solo guardamos los datos de tu pick.'],unconfirmed:['No se pudo confirmar el descarte','Recarga esta página para cerrar el lector antes de volver a intentarlo.']};
   if(usedAi){copy.reading=['Lectura avanzada','La imagen se envía un momento al lector de Google para leerla. Nosotros no la guardamos.'];copy.complete=['Captura descartada','La imagen ya no está en la página y nosotros no la guardamos. Al publicar, solo guardamos los datos de tu pick.'];}
   privacy.hidden=false;privacy.dataset.state=state;privacyTitle.textContent=copy[state][0];privacyText.textContent=copy[state][1];
   const current={reading:0,discarding:1,complete:3,unconfirmed:1}[state];
   Array.from(privacySteps.children).forEach((step,index)=>{step.textContent=['Lectura','Descarte','Completado'][index];step.dataset.state=index<current?'complete':index===current?'active':'pending';});
   if(state==='complete'){overlay.show(readFailed?'failed':'complete');overlay.hide(readFailed?2600:1700);}else overlay.show(state);
   if(readFailed&&state==='complete'){
    privacySteps.children[0].textContent='Sin lectura';privacySteps.children[0].dataset.state='error';privacySteps.children[2].textContent='Descartada';
    privacyText.textContent='La imagen no se ha subido ni guardado. Prueba con otra captura para preparar tu pick.';
   }
  }
  function dispose(job){
   if(!job)return Promise.resolve(true);
   if(job.disposal)return job.disposal;
   clearTimeout(job.timer);job.files=[];job.originals=[];
   if(shot.dataset.job===String(job.id)){shotImage.removeAttribute('src');shot.hidden=true;delete shot.dataset.job;}
   progress.hidden=true;progressBar.style.width='0%';progress.removeAttribute('aria-valuenow');
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
   const job=stop(),revision=++sequence;if(!(showDiscard&&job))overlay.hide();result=null;signature='';summary.hidden=true;summary.replaceChildren();privacy.hidden=true;
   input.value='';picker.textContent='Subir captura';title.textContent='Sube la captura de tu apuesta';panel.dataset.state='empty';status.textContent=message;shotImage.removeAttribute('src');shot.hidden=true;progress.hidden=true;progressBar.style.width='0%';applyImport(null);onChange();
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
   usedAi=false;const job={started:Date.now(),originals:files.slice(),id:++sequence,files,worker:null,canvases:new Set(),urls:new Set(),cancelled:false,abort:null,timer:null};files=[];active=job;
   if(job.files.length===1&&typeof URL.createObjectURL==='function'){
    try{const previewUrl=URL.createObjectURL(job.files[0]);job.urls.add(previewUrl);shotImage.src=previewUrl;shot.dataset.job=String(job.id);shot.hidden=false;}catch{shot.hidden=true;}
   }
   progress.hidden=false;progressBar.style.width='0%';
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
     if(isCurrent(job)&&m.status==='recognizing text'){
     const percent=Math.max(0,Math.min(100,Math.round((Number(m.progress)||0)*100)));
     status.textContent='Leyendo tu captura… '+percent+'%';overlay.progress(percent);progressBar.style.width=percent+'%';progress.setAttribute('aria-valuenow',String(percent));
    }
    },errorHandler:()=>{}});
    pending.then(worker=>{if(!isCurrent(job))void worker.terminate().catch(()=>{});}).catch(()=>{});
    job.worker=await Promise.race([pending,aborted]);if(!isCurrent(job))return;
    const readings=[];let total=null,eventDate='',dateSource='',singles=false;
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
     if(compared.singles){if(job.files.length>1)throw Error('Sube la captura de apuestas sencillas sola: publicaremos un Pick por cada apuesta.');singles=true;}
     if(job.files.length>1&&compared.readings.length!==1)throw Error('Para dos imágenes, usa una captura de cada selección, sin otras apuestas.');
     if(job.files.length>1&&compared.readings.some(r=>r.selectionCount))throw Error('Usa una sola captura de la combinada completa. No combinamos boletos distintos.');
     if(eventDate&&compared.eventDate&&eventDate!==compared.eventDate&&readings.some(r=>compared.readings.some(other=>other.event===r.event)))throw Error('Las capturas muestran fechas distintas para el mismo partido.');
     readings.push(...compared.readings);if(compared.total)total=compared.total;
     if(compared.eventDate){
      if(eventDate&&eventDate!==compared.eventDate){eventDate=[eventDate,compared.eventDate].sort().at(-1);dateSource='last_event';}
      else if(!eventDate){eventDate=compared.eventDate;dateSource=compared.dateSource||'';}
     }
    }
    if(!isCurrent(job))return;
    prepared={readings,total,eventDate,dateSource,singles};
   }catch(error){
    if(isCurrent(job))failure=error?.message||'No pudimos leer la captura. Prueba otra.';
   }finally{
   // Lector mixto: si el lector del teléfono no puede, se intenta la lectura avanzada con IA.
   if(!prepared&&isCurrent(job)&&aiClient()&&!/cancelad/i.test(failure)){
    try{
     try{await job.worker?.terminate();}catch{}job.worker=null;usedAi=true;showPrivacy('reading');
     overlay.show('reading',{note:'Probamos con la lectura avanzada: la imagen se envía un momento al lector de Google. Nosotros no la guardamos.'});
     status.textContent='Usando la lectura avanzada…';progressBar.style.width='0%';
     const ai=await Promise.race([readWithAi(job),new Promise((_,reject)=>{const prev=job.abort;job.abort=e=>{prev?.(e);reject(e);};})]);
     if(isCurrent(job)){prepared=ai;failure='';}
    }catch(error){
     if(isCurrent(job))failure=error?.message||failure;
    }
   }
    const elapsed=Date.now()-job.started;
    if(isCurrent(job)&&elapsed<900)await wait(900-elapsed);
    if(isCurrent(job)){panel.dataset.state='discarding';showPrivacy('discarding');cancel.disabled=true;status.textContent=failure||'Lectura terminada. Descartando la captura…';}
    const [discarded]=await Promise.all([dispose(job),isCurrent(job)?wait(1100):null]);
    if(isCurrent(job)){
     active=null;input.value='';input.disabled=false;picker.disabled=false;cancel.hidden=true;cancel.disabled=false;panel.removeAttribute('aria-busy');showPrivacy(discarded?'complete':'unconfirmed',!prepared);
     if(discarded&&prepared){
      result=prepared;applyImport(result);signature=fingerprint();
      panel.dataset.state='matched';title.textContent='Captura leída';status.textContent=prepared.singles?prepared.readings.length+' apuestas sencillas leídas: se publicará un Pick por cada una.':prepared.eventDate?'Fecha del evento completada automáticamente. Revisa los datos y publica tu Pick.':'Revisa tu pick e indica la fecha del evento para publicar.';picker.textContent='Cambiar captura';
      summary.replaceChildren(...prepared.readings.map((r,i)=>{
       const item=node('li');
       item.append(node('small',(r.selectionCount?r.selectionCount+' selecciones · ':prepared.singles?'Apuesta '+(i+1)+' · ':prepared.readings.length>1?'Selección '+(i+1)+' · ':'')+(r.sport||'Otros')),node('strong',r.event),node('span',r.selection),node('span',(r.originalBeforeBoost?'Momio original, sin boost · ':'Momio automático · ')+(r.odds>0?'+':'')+r.odds,'cp-capture-odds'));
       return item;
      }));
      const preview=form.querySelector('.cp-compose-preview');summary.hidden=!!preview;
      if(preview)requestAnimationFrame(()=>{
       const dialog=form.closest('dialog');
       if(panel.dataset.state==='matched'&&!preview.hidden&&dialog?.open){dialog.scrollTop=0;preview.querySelector('h3')?.focus({preventScroll:true});}
      });
     }else{
      result=null;panel.dataset.state='error';title.textContent='No pudimos preparar tu pick';picker.textContent='Intentar otra captura';status.textContent=discarded?'Lectura incompleta. '+failure:'No pudimos cerrar el lector. Recarga la página antes de volver a intentarlo.';
     }
     onChange();
    }
   }
  }
  input.addEventListener('change',()=>void read());
  cancel.addEventListener('click',()=>clear('Lectura cancelada.',true));
  form.addEventListener('input',()=>{invalidate();onChange();});
  form.addEventListener('click',event=>{if(event.target.closest('.cp-compose-modes,.cp-compose-remove,.cp-compose-add'))invalidate();});
  form.addEventListener('reset',()=>clear());
  form.closest('dialog')?.addEventListener('close',()=>{if(active)clear('Lectura cancelada al cerrar. Añade otra captura para continuar.');});
  window.addEventListener('pagehide',()=>clear());
  return {
   clear,invalidate,
   hasImport(){return !!result&&signature===fingerprint();},
   isConfirmed(){return !!result&&signature===fingerprint();},
   getTotal(){return result&&signature===fingerprint()?result.total:null;},
   proof(){
    invalidate();
    if(active)throw Error('Espera a que termine la lectura de la captura.');
    if(!result)throw Error('Añade una captura legible para comprobar el momio antes de publicar.');
    if(result.aiReadId)return {version:1,method:'ai_vision',read_id:result.aiReadId};
    return {version:1,method:'on_device_ocr',confirmed:true,readings:result.readings.map(({event,selection,odds,confidence})=>({event,selection,odds,confidence})),total:result.total};
   },
   // Comprobante de una sola apuesta sencilla (cada una se publica como su propio Pick).
   proofFor(index){
    invalidate();
    if(active)throw Error('Espera a que termine la lectura de la captura.');
    const r=result?.singles&&result.readings[index];
    if(!r)throw Error('Añade una captura legible para comprobar el momio antes de publicar.');
    if(result.aiReadId)return {version:1,method:'ai_vision',read_id:result.aiReadId};
    return {version:1,method:'on_device_ocr',confirmed:true,readings:[{event:r.event,selection:r.selection,odds:r.odds,confidence:r.confidence}],total:null};
   }
  };
 }
 window.aePickCapture={mount};
})();
