/* Public Pick sharing. No credentials, screenshot uploads or automatic social posts. */
(() => {
 'use strict';
 const BASE='https://camsports.github.io/';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const clean=(value,max=240)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
 const odds=value=>{if(value==null||value==='')return '—';const n=Number(value);return Number.isFinite(n)?(n>0?'+':'')+n:'—';};
 let dialog=null,restoreFocus=null,resource=null,request=0;
 function model(p,kind='community'){
  if(!p||!UUID.test(String(p.id)))throw Error('No se puede compartir este Pick.');
  const weekly=kind==='weekly';
  const legs=weekly?[{event:p.event_name,selection:p.selection}]:Array.isArray(p.legs)?p.legs.slice(0,50):[];
  const outcome={won:'Acertado',lost:'Fallado',void:'Anulado'}[p.outcome]||'Pendiente';
  return {id:String(p.id).toLowerCase(),kind:weekly?'weekly':'community',
   title:clean(p.title||p.event_name||'Pick',160),author:weekly?'CAM SPORTS':'@'+clean(p.author||'Aficionado',60).replace(/^@/,''),
   odds:odds(p.american_odds),date:/^\d{4}-\d{2}-\d{2}$/.test(p.event_date||'')?p.event_date:'',
   result:weekly?'Pick editorial':outcome,
   review:!weekly&&p.moderation_status!=='approved'?'Cuota en revisión':'',
   legs:legs.map(l=>({event:clean(l?.event||l?.sport||'Evento',160),selection:clean(l?.selection||'Consulta el pronóstico completo',280)}))};
 }
 function urlFor(p,source){const u=new URL(BASE);u.searchParams.set(p.kind==='weekly'?'weeklyPick':'pick',p.id);if(source){u.searchParams.set('utm_source',source);u.searchParams.set('utm_medium','share');u.searchParams.set('utm_campaign',p.kind==='weekly'?'pick-del-dia':'pick-comunidad');}return u.href;}
 function caption(p,source){return [(p.kind==='weekly'?'Pick del editor':'Pick de '+p.author)+' · CAM SPORTS',p.title,...p.legs.map(l=>l.event+' · '+l.selection),'Cuota '+p.odds+(p.review?' · '+p.review:''),p.result,urlFor(p,source)].filter(Boolean).join('\n');}
 function xUrl(p){const u=new URL('https://twitter.com/intent/tweet');u.searchParams.set('text',clean((p.kind==='weekly'?'Pick del editor':p.author+' comparte su Pick')+' · '+p.title+' · Cuota '+p.odds+(p.review?' (en revisión)':''),170));u.searchParams.set('url',urlFor(p,'x'));return u.href;}
 function wrap(ctx,value,width,maxLines){
  const lines=[];let line='';
  for(const word of clean(value,1000).split(' ')){
   // Split long, unbroken words too; user content must stay inside the image.
   let pieces=[''];for(const char of word){const i=pieces.length-1;if(ctx.measureText(pieces[i]+char).width>width&&pieces[i])pieces.push(char);else pieces[i]+=char;}
   for(const piece of pieces){const next=line?line+' '+piece:piece;if(ctx.measureText(next).width>width&&line){lines.push(line);line=piece;}else line=next;}
  }
  if(line)lines.push(line);
  const clipped=lines.length>maxLines,visible=lines.slice(0,maxLines);
  if(clipped){let last=visible[visible.length-1];while(last&&ctx.measureText(last+'…').width>width)last=last.slice(0,-1);visible[visible.length-1]=last+'…';}
  return visible;
 }
 function renderCard(p){
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
  const c=canvas.getContext('2d');if(!c)throw Error('Este navegador no permite crear la tarjeta. Puedes copiar el enlace.');
  const ink='#273b49',muted='#566876',bronze='#855b43';
  c.fillStyle='#eeebe4';c.fillRect(0,0,1080,1350);
  c.fillStyle='#fffcf8';c.fillRect(40,40,1000,1270);
  c.fillStyle='#102b3e';c.fillRect(40,40,1000,178);
  c.fillStyle='#f4e8db';c.font='bold 53px Georgia,serif';c.fillText('CAM SPORTS',88,123);
  c.fillStyle='#d6b179';c.font='600 22px Arial,sans-serif';c.fillText(p.kind==='weekly'?'PICK DEL EDITOR':'AQUÍ LO QUE SE CANTA, SE BAILA.',90,177);
  c.fillStyle=bronze;c.font='600 24px Arial,sans-serif';c.fillText(clean(p.author,48),90,276);
  c.fillStyle=ink;c.font='bold 46px Georgia,serif';wrap(c,p.title,900,2).forEach((l,i)=>c.fillText(l,90,341+i*55));
  c.strokeStyle='#d9d9d0';c.lineWidth=2;c.beginPath();c.moveTo(90,427);c.lineTo(990,427);c.stroke();
  let y=479;
  for(const [i,l] of p.legs.slice(0,3).entries()){
   c.fillStyle=bronze;c.font='600 22px Arial,sans-serif';c.fillText(String(i+1).padStart(2,'0'),90,y);
   c.fillStyle=muted;c.font='25px Arial,sans-serif';wrap(c,l.event,824,2).forEach((s,n)=>c.fillText(s,150,y+n*31));
   c.fillStyle=ink;c.font='bold 31px Georgia,serif';wrap(c,l.selection,824,2).forEach((s,n)=>c.fillText(s,150,y+70+n*37));
   y+=178;
  }
  c.fillStyle=muted;c.font='22px Arial,sans-serif';
  const more=p.legs.length>3?`3 de ${p.legs.length} selecciones · Pick completo en el enlace`:'Pronóstico completo y conversación en el enlace';
  c.fillText(more,90,1038);
  c.fillStyle='#102b3e';c.fillRect(90,1071,900,122);c.fillStyle='#f4e8db';c.font='22px Arial,sans-serif';c.fillText('CUOTA TOTAL',118,1110);c.font='bold 52px Georgia,serif';c.fillText(p.odds,118,1167);
  c.font='600 25px Arial,sans-serif';c.textAlign='right';c.fillText(p.review||p.result,960,1140);c.textAlign='left';
  c.fillStyle=muted;c.font='22px Arial,sans-serif';c.fillText(p.date?'Evento · '+p.date:'El deporte también se debate.',90,1241);
  c.fillStyle=bronze;c.font='600 22px Arial,sans-serif';c.textAlign='right';c.fillText('camsports.github.io',990,1241);c.textAlign='left';
  return canvas;
 }
 async function copy(text,status,success){
  try{
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
   else {const input=make('textarea');input.value=text;input.readOnly=true;input.style.cssText='position:fixed;opacity:0';dialog.append(input);input.select();const ok=document.execCommand?.('copy');input.remove();if(!ok)throw Error('clipboard');}
   status.textContent=success;
  }catch{status.textContent='Selecciona y copia el enlace o el texto que aparece debajo.';}
 }
 function release(){if(resource){URL.revokeObjectURL(resource);resource=null;}}
 function close(){request++;if(dialog?.open)dialog.close();release();restoreFocus?.focus?.({preventScroll:true});}
 function show(pick,{kind='community',opener=document.activeElement}={}){
  let p;try{p=model(pick,kind);}catch(error){if(typeof notifyCommunity==='function')notifyCommunity(error.message,true);return;}
  restoreFocus=opener;release();const ticket=++request;
  if(!dialog){dialog=make('dialog',null,'cam-pick-share-dialog');dialog.id='camPickShareDialog';dialog.setAttribute('aria-labelledby','camPickShareTitle');document.body.append(dialog);dialog.addEventListener('close',()=>{request++;release();restoreFocus?.focus?.({preventScroll:true});});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});}
  const top=make('div',null,'cam-pick-share-heading');const heading=make('h2',p.kind==='weekly'?'Comparte el Pick del editor':'Comparte este Pick');heading.id='camPickShareTitle';top.append(heading);
  const exit=make('button','Cerrar','cam-pick-share-close');exit.type='button';exit.onclick=close;top.append(exit);
  const intro=make('p','Llévalo a tus redes y que empiece el debate.','cam-pick-share-intro');
  const layout=make('div',null,'cam-pick-share-layout');const preview=make('div',null,'cam-pick-share-preview');preview.setAttribute('aria-busy','true');preview.append(make('p','Preparando tarjeta…'));
  const content=make('div',null,'cam-pick-share-content');const actions=make('div',null,'cam-pick-share-networks');actions.setAttribute('aria-label','Opciones para compartir');
  const x=make('a','X','cam-pick-share-network');x.href=xUrl(p);x.target='_blank';x.rel='noopener noreferrer';x.setAttribute('aria-label','Abrir publicación preparada en X');
  const ig=make('button','Instagram','cam-pick-share-network'),tk=make('button','TikTok','cam-pick-share-network');ig.type=tk.type='button';ig.disabled=tk.disabled=true;actions.append(x,ig,tk);
  const hint=make('p','En Instagram y TikTok eliges la app desde el menú de tu teléfono. Si no aparece, descarga la tarjeta y súbela allí.','cam-pick-share-hint');
  const status=make('p','', 'cam-pick-share-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const download=make('a','Descargar tarjeta','cam-pick-share-download');download.hidden=true;download.download=`cam-sports-${p.kind==='weekly'?'pick-del-dia':'pick'}-${p.id}.png`;
  const linkButton=make('button','Copiar enlace'),textButton=make('button','Copiar texto');linkButton.type=textButton.type='button';
  linkButton.onclick=()=>copy(urlFor(p),status,'Enlace copiado.');textButton.onclick=()=>copy(caption(p),status,'Texto y enlace copiados.');
  const utilities=make('div',null,'cam-pick-share-utilities');utilities.append(download,linkButton,textButton);
  const label=make('label','Texto para tu publicación','cam-pick-share-caption-label');const text=make('textarea');text.value=caption(p);text.readOnly=true;text.rows=5;text.setAttribute('aria-label','Texto y enlace de la publicación');label.append(text);
  content.append(actions,hint,utilities,status,label);layout.append(preview,content);dialog.replaceChildren(top,intro,layout);
  if(!dialog.open)dialog.showModal();exit.focus({preventScroll:true});dialog.scrollTop=0;
  let file=null;
  for(const [button,network] of [[ig,'Instagram'],[tk,'TikTok']])button.onclick=()=>{
   // The File is prepared before this click to preserve the browser's user activation.
   if(!file)return;
   let fileSharing=false;try{fileSharing=typeof navigator.share==='function'&&Boolean(navigator.canShare?.({files:[file]}));}catch{}
   if(fileSharing){
    let sharing;try{sharing=navigator.share({files:[file]});}catch{status.textContent='Descarga la tarjeta y súbela a '+network+'.';return;}
    Promise.resolve(sharing).then(()=>{if(ticket===request)status.textContent='La tarjeta se entregó al menú de compartir. Termina la publicación en la app que elijas.';}).catch(e=>{if(ticket===request)status.textContent=e?.name==='AbortError'?'Puedes volver a compartir cuando quieras.':'Descarga la tarjeta y súbela a '+network+'.';});
   }else status.textContent='Descarga la tarjeta, abre '+network+' y elígela desde tu galería. Puedes copiar el texto con el botón de arriba.';
  };
  try{
   const canvas=renderCard(p);
   canvas.toBlob(blob=>{
    if(ticket!==request||!dialog.open)return;
    if(!blob){preview.replaceChildren(make('p','No se pudo preparar la imagen. Puedes copiar el texto o el enlace.'));preview.setAttribute('aria-busy','false');return;}
    resource=URL.createObjectURL(blob);const img=make('img');img.src=resource;img.alt='Tarjeta para compartir: '+p.title+' · Cuota '+p.odds;img.width=1080;img.height=1350;preview.replaceChildren(img);preview.setAttribute('aria-busy','false');
    file=new File([blob],download.download,{type:'image/png'});download.href=resource;download.hidden=false;ig.disabled=tk.disabled=false;
   },'image/png');
  }catch(error){preview.replaceChildren(make('p',error.message));preview.setAttribute('aria-busy','false');}
 }
 function button(p,options={}){
  const b=make('button','Compartir','cam-pick-share-button');b.type='button';b.setAttribute('aria-label','Compartir Pick: '+clean(p.title||p.event_name||'Pick',160));
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M15 3h6v6M21 3 10 14M10 5H4v16h16v-6');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');icon.append(path);b.prepend(icon);
  b.onclick=e=>{e.preventDefault();e.stopPropagation();show(p,{...options,opener:b});};return b;
 }
 window.CamPickShare=Object.freeze({open:show,button});
})();
