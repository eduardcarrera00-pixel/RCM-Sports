/* Public Pick/Take sharing. No credentials, screenshot uploads or automatic social posts. */
(() => {
 'use strict';
 const BASE='https://camsports.github.io/';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 // Lossless UUID encoding: no shortening service, database writes or expiring links.
 const pack=id=>btoa(String.fromCharCode(...id.replace(/-/g,'').match(/../g).map(h=>parseInt(h,16)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 function unpack(value){
  if(!/^[A-Za-z0-9_-]{22}$/.test(value||''))return null;
  try{const bytes=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'==');
   const hex=Array.from(bytes,c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('');
   const id=hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
   return UUID.test(id)&&pack(id)===value?id:null;
  }catch{return null;}
 }
 // This script loads first so existing Pick, profile and welcome handlers see
 // their normal routes. Previously shared full-length URLs continue to work.
 function expandLink(){
  const u=new URL(location.href);let route=null,key=null;
  for(const [short,full] of [['p','pick'],['e','weeklyPick'],['r','weeklyResult']]){
   const id=unpack(u.searchParams.get(short));if(id){key=short;route={[full]:id};break;}
  }
  if(!route){const parts=(u.searchParams.get('t')||'').split('.');
   if(parts.length===2){const owner=unpack(parts[0]),id=unpack(parts[1]);if(owner&&id){key='t';route={perfil:owner,take:id};}}
  }
  if(!route)return;
  u.searchParams.delete(key);for(const [name,value] of Object.entries(route))u.searchParams.set(name,value);
  history.replaceState(history.state,'',u.href);
 }
 expandLink();
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const clean=(value,max=240)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
 const odds=value=>{if(value==null||value==='')return '—';const n=Number(value);return Number.isFinite(n)?(n>0?'+':'')+n:'—';};
 let dialog=null,restoreFocus=null,resource=null,request=0;
 function model(p,kind='community'){
  if(!p||!UUID.test(String(p.id)))throw Error('No se puede compartir este Pick.');
  if(kind==='take'){
   if(p.hidden||!UUID.test(String(p.author_id)))throw Error('No se puede compartir este Take.');
   const sports={nfl:'NFL',football:'Fútbol',laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',colegial:'Fútbol colegial'};
   const date=String(p.created_at||'').slice(0,10);
   return {id:String(p.id).toLowerCase(),kind:'take',author_id:String(p.author_id).toLowerCase(),
    author:'@'+clean(p.author||'Aficionado',60).replace(/^@/,''),title:clean(p.title||'Take',160),body:clean(p.body,2000),
    competition:clean(p.competition||sports[p.sport]||'Deportes',60),date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'',
    up:Math.max(0,Math.trunc(Number(p.upvotes)||0)),down:Math.max(0,Math.trunc(Number(p.downvotes)||0))};
  }
  const weekly=kind==='weekly';
  const legs=weekly?String(p.selection||'').replace(/\\n/g,'\n').split(/\n+|\s+[|•]\s+|;\s*|\s+\+\s+(?!\d)/).map(selection=>selection.trim()).filter(Boolean).map((selection,i)=>({event:i===0?p.event_name:'',selection})):Array.isArray(p.legs)?p.legs.slice(0,50):[];
  const settled=weekly?window.camWeeklyResults?.getResult?.(p.id):null;
  const state=settled?.outcome||p.outcome;
  const outcome={won:'Pick acertado',lost:'Pick no acertado',void:'Pick anulado'}[state]||'Pendiente de resultado';
  return {id:String(p.id).toLowerCase(),kind:weekly?'weekly':'community',
   title:clean(p.title||p.event_name||'Pick',160),author:weekly?'CAM SPORTS':'@'+clean(p.author||'Aficionado',60).replace(/^@/,''),
   odds:odds(p.american_odds),date:/^\d{4}-\d{2}-\d{2}$/.test(p.event_date||'')?p.event_date:'',
   result:outcome,state:['won','lost','void'].includes(state)?state:'pending',
   verified:!weekly&&p.moderation_status==='approved'&&odds(p.american_odds)!=='—',
   review:!weekly&&p.moderation_status!=='approved'?'Cuota en revisión':'',
   legs:legs.map(l=>({event:clean(l?.event||l?.sport||(weekly?'':'Evento'),160),selection:clean(l?.selection||'Consulta el pronóstico completo',weekly?10000:280)}))};
 }
 function urlFor(p){const u=new URL(BASE);if(p.kind==='take')u.searchParams.set('t',pack(p.author_id)+'.'+pack(p.id));else u.searchParams.set(p.kind==='weekly'?(p.state==='pending'?'e':'r'):'p',pack(p.id));return u.href;}
 const headline=p=>(p.kind==='take'?'Take de '+p.author:p.kind==='weekly'?'Pick del editor':'Pick de '+p.author)+' · CAM SPORTS';
 const quota=p=>p.verified?'Cuota verificada · '+p.odds:'Cuota '+p.odds+(p.review?' · '+p.review:p.kind==='weekly'?' · Editorial':'');
 const invitation=p=>p.kind==='take'?'¿De acuerdo o tienes otra lectura?':p.state==='won'?'Aquí lo que se canta, se baila.':p.state==='lost'?'También se da la cara cuando no sale.':p.state==='void'?'Este no cuenta en el marcador.':'Sobre la mesa. ¿Lo sigues o lo debates?';
 function caption(p){if(p.kind==='take')return [headline(p),p.competition,p.title,p.body,invitation(p),urlFor(p)].filter(Boolean).join('\n\n');return [headline(p),p.result,p.title,...p.legs.map(l=>[l.event,l.selection].filter(Boolean).join(' · ')),quota(p),invitation(p),urlFor(p)].filter(Boolean).join('\n\n');}
 // Reserve the URL's 23 X characters and keep the result/verification/CTA intact
 // even when a title, author or selection is long (including wide characters).
 const weight=s=>Array.from(s).reduce((n,c)=>n+(c.codePointAt(0)>0x10ff?2:1),0);
 function fit(s,budget){if(weight(s)<=budget)return s;let out='';for(const c of s){if(weight(out+c+'…')>budget)break;out+=c;}return out.trimEnd()+'…';}
 function xUrl(p){
  const title=fit(headline(p),85),tail=p.kind==='take'?invitation(p):p.result+' · '+quota(p)+'\n'+invitation(p);
  const detail=p.kind==='take'?p.title:p.kind==='weekly'?p.title+'\n'+p.legs.map(l=>l.selection).join(' | '):(p.legs[0]?p.legs[0].event+' · '+p.legs[0].selection:p.title)+(p.legs.length>1?' · '+p.legs.length+' selecciones':'');
  const text=title+'\n'+fit(detail,256-weight(title+'\n\n'+tail))+'\n'+tail;
  const u=new URL('https://twitter.com/intent/tweet');u.searchParams.set('text',text);u.searchParams.set('url',urlFor(p));return u.href;
 }
 function wrap(ctx,value,width,maxLines){
  const lines=[];let line='';
  for(const word of clean(value,10000).split(' ')){
   // Split long, unbroken words too; user content must stay inside the image.
   let pieces=[''];for(const char of word){const i=pieces.length-1;if(ctx.measureText(pieces[i]+char).width>width&&pieces[i])pieces.push(char);else pieces[i]+=char;}
   for(const piece of pieces){const next=line?line+' '+piece:piece;if(ctx.measureText(next).width>width&&line){lines.push(line);line=piece;}else line=next;}
  }
  if(line)lines.push(line);
  const clipped=lines.length>maxLines,visible=lines.slice(0,maxLines);
  if(clipped){let last=visible[visible.length-1];while(last&&ctx.measureText(last+'…').width>width)last=last.slice(0,-1);visible[visible.length-1]=last+'…';}
  return visible;
 }
 function renderWeeklyCard(p){
  const canvas=document.createElement('canvas');canvas.width=1080;
  const c=canvas.getContext('2d');if(!c)throw Error('Este navegador no permite crear la tarjeta. Puedes copiar el texto.');
  c.font='bold 44px Georgia,serif';const title=wrap(c,p.title,900,Infinity);
  c.font='27px Arial,sans-serif';const event=wrap(c,p.legs[0]?.event||'',900,Infinity);
  c.font='bold 31px Georgia,serif';
  const selections=p.legs.map((l,i)=>wrap(c,`${i+1}. ${l.selection}`,900,Infinity));
  const end=310+title.length*54+event.length*37+44+selections.reduce((n,lines)=>n+lines.length*41+18,0);
  canvas.height=Math.max(1350,end+282);
  c.fillStyle='#eeebe4';c.fillRect(0,0,1080,canvas.height);
  c.fillStyle='#fffcf8';c.fillRect(40,40,1000,canvas.height-80);
  c.fillStyle='#102b3e';c.fillRect(40,40,1000,178);
  c.fillStyle='#f4e8db';c.font='bold 53px Georgia,serif';c.fillText('CAM SPORTS',88,123);
  c.fillStyle='#d6b179';c.font='600 22px Arial,sans-serif';c.fillText('PICK DEL EDITOR',90,177);
  let y=310;c.fillStyle='#273b49';c.font='bold 44px Georgia,serif';
  for(const line of title){c.fillText(line,90,y);y+=54;}
  c.fillStyle='#566876';c.font='27px Arial,sans-serif';
  for(const line of event){c.fillText(line,90,y);y+=37;}
  y+=44;c.fillStyle='#273b49';c.font='bold 31px Georgia,serif';
  for(const lines of selections){for(const line of lines){c.fillText(line,90,y);y+=41;}y+=18;}
  const footer=canvas.height-279;
  c.fillStyle='#102b3e';c.fillRect(90,footer,900,122);
  c.fillStyle='#f4e8db';c.font='22px Arial,sans-serif';c.fillText('CUOTA TOTAL',118,footer+39);
  c.font='bold 52px Georgia,serif';c.fillText(p.odds,118,footer+96);
  c.font='600 25px Arial,sans-serif';c.textAlign='right';c.fillText(p.result,960,footer+69);
  c.fillStyle='#855b43';c.font='600 22px Arial,sans-serif';c.fillText('camsports.github.io',990,canvas.height-109);c.textAlign='left';
  return canvas;
 }

 // Take cards intentionally use the same blue editorial layout in both site themes.
 const takeFragments=body=>{
  const source=clean(body,2000);if(!source)return [];
  const sentences=source.match(/[^.!?]+(?:[.!?]+|$)/g)?.map(s=>s.trim()).filter(Boolean)||[source];
  const parts=[];let part='';
  for(const sentence of sentences){
   if(part&&(part.length+sentence.length)>260){parts.push(part);part='';}
   if(sentence.length>320){
    if(part){parts.push(part);part='';}
    const words=sentence.split(/\s+/);let chunk='';
    for(const word of words){if(chunk&&chunk.length+word.length+1>245){parts.push(chunk);chunk='';}chunk+=(chunk?' ':'')+word;}
    if(chunk)parts.push(chunk);
   }else part+=(part?' ':'')+sentence;
  }
  if(part)parts.push(part);
  return parts.slice(0,12);
 };
 // Extractive, rather than a fabricated paraphrase: preserve the author's words.
 const takeSummary=body=>takeFragments(body).slice(0,2).join(' ').slice(0,480);
 function roundedShareBackground(c,w,h,r){
  c.fillStyle='#073B83';c.beginPath();
  if(typeof c.roundRect==='function')c.roundRect(0,0,w,h,r);
  else if(typeof c.quadraticCurveTo==='function'){
   c.moveTo(r,0);c.lineTo(w-r,0);c.quadraticCurveTo(w,0,w,r);
   c.lineTo(w,h-r);c.quadraticCurveTo(w,h,w-r,h);c.lineTo(r,h);
   c.quadraticCurveTo(0,h,0,h-r);c.lineTo(0,r);c.quadraticCurveTo(0,0,r,0);
  }else{c.fillRect(0,0,w,h);return;}
  c.closePath?.();c.fill();
 }
 function renderTakeCard(p,options={}){
  const portrait=options.size==='story',w=1080,h=portrait?1920:1080;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');if(!c)throw Error('Este navegador no permite generar la imagen. Prueba descargarla desde otro navegador.');
  roundedShareBackground(c,w,h,72);
  // White letterform logo, integrated into the same blue background (no box).
  c.textAlign='right';c.fillStyle='#fff';
  c.font='700 80px "Playfair Display", Georgia, serif';c.fillText('CAM',w-77,153);
  c.strokeStyle='#fff';c.lineWidth=3;c.beginPath();c.moveTo(w-302,168);c.lineTo(w-78,168);c.stroke();
  c.font='600 24px Inter, Arial, sans-serif';c.fillText('S P O R T S',w-80,207);c.textAlign='left';

  const mode=options.mode||'title',extra=mode==='summary'?takeSummary(p.body):mode==='fragment'?takeFragments(p.body)[options.fragment||0]||'':'';
  const footerY=h-165,baseTop=portrait?515:267,margin=82,maxWidth=w-margin*2;
  const textSpace=(portrait?footerY-125:footerY-98)-baseTop-(extra?portrait?460:275:0);
  let font=portrait?90:88,lines=[];
  for(;font>=31;font-=2){
   c.font='600 '+font+'px "Playfair Display", Georgia, serif';
   lines=wrap(c,p.title.toLocaleUpperCase('es'),maxWidth,Infinity);
   if(lines.length*font*1.16<=textSpace)break;
  }
  c.fillStyle='#fff';c.font='600 '+Math.max(font,31)+'px "Playfair Display", Georgia, serif';
  const step=Math.max(font,31)*1.16;
  // The title is visually uppercase; the original stored title remains unchanged.
  let y=baseTop+Math.max(font,31);
  for(const line of lines){c.fillText(line,margin,y);y+=step;}
  if(extra){
   y+=portrait?120:65;
   c.fillStyle='#DDC5AD';c.font='600 25px Inter, Arial, sans-serif';
   c.fillText(mode==='summary'?'RESUMEN DEL TAKE':'FRAGMENTO ORIGINAL',margin,y);y+=48;
   c.fillStyle='#fff';
   let extraFont=portrait?45:34,extraLines=[];
   for(;extraFont>=25;extraFont-=2){
    c.font='400 '+extraFont+'px "Libre Baskerville", Georgia, serif';
    extraLines=wrap(c,extra,maxWidth,Infinity);
    if(y+extraLines.length*extraFont*1.45<=(footerY-65))break;
   }
   // A summary/fragment is supplemental; crop it, never the title or attribution.
   const max=Math.max(1,Math.floor((footerY-68-y)/(Math.max(extraFont,25)*1.45)));
   c.font='400 '+Math.max(extraFont,25)+'px "Libre Baskerville", Georgia, serif';
   for(const line of wrap(c,extra,maxWidth,max)){y+=Math.max(extraFont,25)*1.45;c.fillText(line,margin,y);}
  }
  c.strokeStyle='#BE9270';c.lineWidth=3;c.beginPath();c.moveTo(margin,footerY);c.lineTo(w-margin,footerY);c.stroke();
  c.fillStyle='#fff';c.textAlign='left';c.font='400 34px "Libre Baskerville", Georgia, serif';
  c.fillText('Por',margin,footerY+75);
  let username=p.author.replace(/^@/,'')||'Aficionado';
  let nameFont=35;
  const date=options.showDate===false?'':p.date.split('-').reverse().join('/');
  const dateWidth=date?235:0;
  for(;nameFont>=20;nameFont-=1){
   c.font='700 '+nameFont+'px "Libre Baskerville", Georgia, serif';
   if(c.measureText(username).width<=w-2*margin-105-dateWidth)break;
  }
  c.fillText(username,margin+72,footerY+75);
  if(date){c.fillStyle='#BE9270';c.fillRect(w-margin-239,footerY+37,2,43);
   c.fillStyle='#fff';c.textAlign='right';c.font='400 30px "Libre Baskerville", Georgia, serif';c.fillText(date,w-margin,footerY+75);c.textAlign='left';}
  return canvas;
 }

 function renderCard(p,options){
  if(p.kind==='take')return renderTakeCard(p,options);
  if(p.kind==='weekly')return renderWeeklyCard(p);
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
  if(p.kind==='take'){
   c.fillStyle=bronze;c.font='600 25px Arial,sans-serif';c.fillText(p.competition,90,479);
   c.fillStyle=ink;c.font='34px Georgia,serif';
   const lines=wrap(c,p.body,900,11);lines.forEach((line,i)=>c.fillText(line,90,550+i*43));
   c.fillStyle=muted;c.font='22px Arial,sans-serif';c.fillText('Lee el Take completo y responde en CAM SPORTS',90,1038);
   c.fillStyle='#102b3e';c.fillRect(90,1071,900,122);c.fillStyle='#f4e8db';c.font='22px Arial,sans-serif';c.fillText('LA COMUNIDAD OPINA',118,1110);
   c.font='bold 30px Georgia,serif';c.fillText(p.up+' apoyos · '+p.down+' cuestionamientos',118,1167);
  }else{
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
  c.fillStyle='#102b3e';c.fillRect(90,1071,900,122);c.fillStyle='#f4e8db';c.font='22px Arial,sans-serif';c.fillText(p.verified?'CUOTA VERIFICADA':'CUOTA TOTAL',118,1110);c.font='bold 52px Georgia,serif';c.fillText(p.odds,118,1167);
  c.font='600 25px Arial,sans-serif';c.textAlign='right';c.fillText(p.result,960,1140);if(p.review){c.font='20px Arial,sans-serif';c.fillText(p.review,960,1175);}c.textAlign='left';
  }
  c.fillStyle=muted;c.font='22px Arial,sans-serif';c.fillText(p.date?(p.kind==='take'?'Publicado':'Evento')+' · '+p.date:'El deporte también se debate.',90,1241);
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
  if(!dialog){dialog=make('dialog',null,'cam-pick-share-dialog');dialog.id='camPickShareDialog';dialog.setAttribute('aria-labelledby','camPickShareTitle');document.body.append(dialog);dialog.addEventListener('close',()=>{if(dialog.open)return;request++;release();restoreFocus?.focus?.({preventScroll:true});});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});}
  const top=make('div',null,'cam-pick-share-heading');const heading=make('h2',p.kind==='take'?'Comparte este Take':p.kind==='weekly'?'Comparte el Pick del editor':'Comparte este Pick');heading.id='camPickShareTitle';top.append(heading);
  const exit=make('button','Cerrar','cam-pick-share-close');exit.type='button';exit.onclick=close;top.append(exit);
  const intro=make('p','Llévalo a tus redes y que empiece el debate.','cam-pick-share-intro');
  const layout=make('div',null,'cam-pick-share-layout');const preview=make('div',null,'cam-pick-share-preview');preview.setAttribute('aria-busy','true');preview.append(make('p','Preparando tarjeta…'));
  const content=make('div',null,'cam-pick-share-content');const actions=make('div',null,'cam-pick-share-networks');actions.setAttribute('aria-label','Opciones para compartir');
  const x=make('a','X','cam-pick-share-network');x.href=xUrl(p);x.target='_blank';x.rel='noopener noreferrer';x.setAttribute('aria-label','Abrir publicación preparada en X');
  const ig=make('button','Instagram','cam-pick-share-network'),tk=make('button','TikTok','cam-pick-share-network');ig.type=tk.type='button';ig.disabled=tk.disabled=true;actions.append(x,ig,tk);
  const hint=make('p','Elige Instagram o TikTok desde el menú de tu teléfono. Si la app solo recibe la imagen, usa «Copiar texto» para añadir el mensaje y el enlace. También puedes descargar la tarjeta.','cam-pick-share-hint');
  const status=make('p','', 'cam-pick-share-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const download=make('a','Descargar tarjeta','cam-pick-share-download');download.hidden=true;download.download=`cam-sports-${p.kind==='take'?'take':p.kind==='weekly'?'pick-del-dia':'pick'}-${p.id}.png`;
  const linkButton=make('button','Copiar enlace'),textButton=make('button','Copiar texto');linkButton.type=textButton.type='button';
  linkButton.onclick=()=>copy(urlFor(p),status,'Enlace copiado.');textButton.onclick=()=>copy(caption(p),status,'Texto y enlace copiados.');
  const utilities=make('div',null,'cam-pick-share-utilities');utilities.append(download,linkButton,textButton);
  const label=make('label','Texto para tu publicación','cam-pick-share-caption-label');const text=make('textarea');text.value=caption(p);text.readOnly=true;text.rows=5;text.setAttribute('aria-label','Texto y enlace de la publicación');label.append(text);
  let takeOptions={mode:'title',size:'square',showDate:true,fragment:0};
  let editor=null,modeSelect=null,fragmentLabel=null,fragmentSelect=null,sizeSelect=null,dateToggle=null;
  if(p.kind==='take'){
   editor=make('section',null,'cam-take-share-editor');editor.setAttribute('aria-label','Personalizar la ficha del Take');
   const title=make('strong','Personaliza tu ficha','cam-take-share-editor-title');editor.append(title);
   const field=(name,control)=>{const label=make('label',name,'cam-take-share-field');label.append(control);editor.append(label);return label;};
   modeSelect=make('select');for(const [value,name] of [['title','Solo título'],['summary','Título + resumen original'],['fragment','Título + fragmento']]){const option=make('option',name);option.value=value;modeSelect.append(option);}
   field('Contenido de la ficha',modeSelect);
   fragmentSelect=make('select');const pieces=takeFragments(p.body);
   pieces.forEach((piece,i)=>{const option=make('option','Fragmento '+(i+1)+': '+piece.slice(0,44)+(piece.length>44?'…':''));option.value=String(i);fragmentSelect.append(option);});
   fragmentLabel=field('Fragmento del texto original',fragmentSelect);fragmentLabel.hidden=true;
   if(!pieces.length){modeSelect.querySelector('option[value="summary"]').disabled=true;modeSelect.querySelector('option[value="fragment"]').disabled=true;}
   sizeSelect=make('select');for(const [value,name] of [['square','Publicación · 1:1'],['story','Historia / TikTok · 9:16']]){const option=make('option',name);option.value=value;sizeSelect.append(option);}
   field('Formato',sizeSelect);
   const dateLabel=make('label',null,'cam-take-share-checkbox');dateToggle=make('input');dateToggle.type='checkbox';dateToggle.checked=true;dateLabel.append(dateToggle,make('span','Mostrar fecha'));editor.append(dateLabel);
   const reset=make('button','Restablecer diseño','cam-take-share-reset');reset.type='button';editor.append(reset);
   content.prepend(editor);
   modeSelect.onchange=()=>{takeOptions.mode=modeSelect.value;fragmentLabel.hidden=modeSelect.value!=='fragment';refresh();};
   fragmentSelect.onchange=()=>{takeOptions.fragment=Number(fragmentSelect.value)||0;refresh();};
   sizeSelect.onchange=()=>{takeOptions.size=sizeSelect.value;refresh();};
   dateToggle.onchange=()=>{takeOptions.showDate=dateToggle.checked;refresh();};
   reset.onclick=()=>{takeOptions={mode:'title',size:'square',showDate:true,fragment:0};modeSelect.value='title';fragmentSelect.value='0';fragmentLabel.hidden=true;sizeSelect.value='square';dateToggle.checked=true;refresh();};
  }
  content.append(actions,hint,utilities,status,label);layout.append(preview,content);dialog.replaceChildren(top,intro,layout);
  if(!dialog.open)dialog.showModal();exit.focus({preventScroll:true});dialog.scrollTop=0;

  let file=null,generation=0;
  function nativeShare(network){
   if(!file)return;
   let fileSharing=false;try{fileSharing=typeof navigator.share==='function'&&Boolean(navigator.canShare?.({files:[file]}));}catch{}
   if(fileSharing){
    let sharing;
    // Keep the native share invocation within the user's tap (iOS activation).
    try{sharing=navigator.share({files:[file],title:headline(p),text:caption(p),url:urlFor(p)});}
    catch{status.textContent='Descarga la tarjeta y compártela desde '+network+'.';return;}
    Promise.resolve(sharing).then(()=>{if(ticket===request)status.textContent='Imagen enviada al menú de compartir. Selecciona la aplicación y completa la publicación.';})
    .catch(e=>{if(ticket===request)status.textContent=e?.name==='AbortError'?'Puedes volver a compartir cuando quieras.':'Descarga la tarjeta y compártela desde '+network+'.';});
   }else status.textContent='Descarga la tarjeta; tu navegador no permite enviarla directamente. Súbela desde '+network+'.';
  }
  for(const [button,network] of [[ig,'Instagram'],[tk,'TikTok']])button.onclick=()=>nativeShare(network);
  if(p.kind==='take'){
   // X Intent only transfers text. Prefer native file share; otherwise make the
   // image download explicit rather than pretending the tweet contains media.
   x.addEventListener('click',e=>{
    if(file&&typeof navigator.share==='function'&&navigator.canShare?.({files:[file]})){e.preventDefault();nativeShare('X');}
    else status.textContent='X abrirá el texto y el enlace. Para incluir la imagen, descárgala y adjúntala manualmente.';
   });
  }
  function refresh(){
   const current=++generation;file=null;ig.disabled=tk.disabled=true;download.hidden=true;release();
   preview.replaceChildren(make('p','Preparando tarjeta…'));preview.setAttribute('aria-busy','true');status.textContent='';
   try{
    const canvas=renderCard(p,takeOptions);
    canvas.toBlob(blob=>{
     if(ticket!==request||current!==generation||!dialog.open)return;
     if(!blob){preview.replaceChildren(make('p','No se pudo preparar la imagen. Puedes copiar el texto o el enlace.'));preview.setAttribute('aria-busy','false');return;}
     resource=URL.createObjectURL(blob);const img=make('img');img.src=resource;img.alt='Ficha para compartir: '+p.title+' · '+p.author;img.width=canvas.width;img.height=canvas.height;
     preview.replaceChildren(img);preview.setAttribute('aria-busy','false');
     file=new File([blob],download.download,{type:'image/png'});download.href=resource;download.hidden=false;ig.disabled=tk.disabled=false;
    },'image/png');
   }catch(error){preview.replaceChildren(make('p',error.message));preview.setAttribute('aria-busy','false');}
  }
  refresh();

 }
 function button(p,options={}){
  const type=options.kind==='take'?'Take':'Pick';
  const b=make('button','Compartir','cam-pick-share-button');b.type='button';b.setAttribute('aria-label','Compartir '+type+': '+clean(p.title||p.event_name||type,160));
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M15 3h6v6M21 3 10 14M10 5H4v16h16v-6');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');icon.append(path);b.prepend(icon);
  b.onclick=e=>{e.preventDefault();e.stopPropagation();show(p,{...options,opener:b});};return b;
 }
 window.CamPickShare=Object.freeze({open:show,button});
})();
