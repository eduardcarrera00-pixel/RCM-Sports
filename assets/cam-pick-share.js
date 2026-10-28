/* Public Pick/Take sharing. No credentials, screenshot uploads or automatic social posts. */
(() => {
 'use strict';
 const BASE='https://camsports.github.io/';
 const LOGO_URL=new URL('cam-sports-logo-completo.webp?v=20261024-lossless-1',document.currentScript?.src||new URL('assets/cam-pick-share.js',location.href)).href;
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
   const published=p.created_at?new Date(p.created_at):null;
   // Use the same local calendar day as the original Take's date on the site.
   const date=published&&!Number.isNaN(published.getTime())?[published.getFullYear(),String(published.getMonth()+1).padStart(2,'0'),String(published.getDate()).padStart(2,'0')].join('-'):'';
   return {id:String(p.id).toLowerCase(),kind:'take',author_id:String(p.author_id).toLowerCase(),
    author:'@'+clean(p.author||'Aficionado',80).replace(/^@/,''),title:String(p.title||'Take').trim(),body:String(p.body||'').trim(),
    competition:clean(p.competition||sports[p.sport]||'Deportes',60),date:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'',
    up:Math.max(0,Math.trunc(Number(p.upvotes)||0)),down:Math.max(0,Math.trunc(Number(p.downvotes)||0))};
  }
  if(p.hidden)throw Error('Este Pick no está disponible para compartir.');
  const weekly=kind==='weekly';
  const raw=weekly?[{event:p.event_name,selection:p.selection}]:Array.isArray(p.legs)?p.legs:[];
  const legs=raw.flatMap(l=>String(l?.selection||'').replace(/\\n/g,'\n').split(/\n+|;\s*|\s+[|]\s+|\s+\+\s+(?!\d)/).map(selection=>({
   event:String(l?.event||'').trim(),selection:selection.trim(),sport:String(l?.sport||'').trim(),
   market:String(l?.market||'').trim(),line:l?.line==null?'':String(l.line)
  })).filter(l=>l.selection));
  if(!legs.length)throw Error('Este Pick no tiene selecciones disponibles.');
  const settled=weekly?window.camWeeklyResults?.getResult?.(p.id):null;
  const state=settled?.outcome||p.outcome;
  const published=p.created_at?new Date(p.created_at):null;
  const date=/^\d{4}-\d{2}-\d{2}$/.test(p.publication_day||'')?p.publication_day:published&&!Number.isNaN(published.getTime())?
   [published.getFullYear(),String(published.getMonth()+1).padStart(2,'0'),String(published.getDate()).padStart(2,'0')].join('-'):'';
  return {id:String(p.id).toLowerCase(),kind:weekly?'weekly':'community',
   title:clean(p.title||p.event_name||'Pick',160),author:weekly?'CAM SPORTS':'@'+clean(p.author||'Aficionado',80).replace(/^@/,''),
   odds:odds(p.american_odds),date,
   competition:clean(p.competition||p.sport||[...new Set(legs.map(l=>l.sport).filter(Boolean))].join(' · '),240),
   analysis:String(weekly?p.analysis||'':p.explanation||'').trim(),
   result:{won:'Pick acertado',lost:'Pick no acertado',void:'Pick anulado'}[state]||'Pendiente de resultado',
   state:['won','lost','void'].includes(state)?state:'pending',
   verified:!weekly&&p.moderation_status==='approved'&&odds(p.american_odds)!=='—',
   review:!weekly&&p.moderation_status!=='approved'?(p.moderation_status==='rejected'?'Cuota rechazada':'Cuota en revisión'):'',legs};
 }
 function urlFor(p){const u=new URL(BASE);if(p.kind==='take')u.searchParams.set('t',pack(p.author_id)+'.'+pack(p.id));else u.searchParams.set(p.kind==='weekly'?(p.state==='pending'?'e':'r'):'p',pack(p.id));return u.href;}
 const headline=p=>(p.kind==='take'?'Take de '+p.author:p.kind==='weekly'?'Pick del editor':'Pick de '+p.author)+' · CAM SPORTS';
 const quota=p=>p.verified?'Cuota verificada · '+p.odds:'Cuota '+p.odds+(p.review?' · '+p.review:p.kind==='weekly'?' · Editorial':'');
 const invitation=p=>p.kind==='take'?'¿De acuerdo o tienes otra lectura?':p.state==='won'?'Aquí lo que se canta, se baila.':p.state==='lost'?'También se da la cara cuando no sale.':p.state==='void'?'Este no cuenta en el marcador.':'Sobre la mesa. ¿Lo sigues o lo debates?';
 function caption(p){if(p.kind==='take')return [headline(p),p.title,p.body,urlFor(p)].filter(Boolean).join('\n\n');return [headline(p),p.result,p.title,...p.legs.map(l=>[l.event,l.selection].filter(Boolean).join(' · ')),quota(p),invitation(p),urlFor(p)].filter(Boolean).join('\n\n');}
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
 // Take cards intentionally use the same blue editorial layout in both site themes.
 const takeFragments=body=>{
  // Every choice is a contiguous slice of the original, including punctuation
  // and internal whitespace. Never rebuild sentences or cut a word in half.
  let rest=String(body||'').trim();const parts=[];
  while(rest){
   let end=rest.length;
   if(end>280){
    const head=rest.slice(0,281),sentences=[...head.matchAll(/[.!?](?:["”’»])?(?=\s)/g)];
    const sentence=sentences.at(-1);
    const space=head.search(/\s+\S*$/);
    end=sentence&&sentence.index>65?sentence.index+sentence[0].length:space>0?space:rest.search(/\s/);
    if(end<=0)end=rest.length;
   }
   const part=rest.slice(0,end).trim();if(part)parts.push(part);
   rest=rest.slice(end).trim();
  }
  return parts;
 };
 // A brief extractive summary requires no external model or database writes.
 // Label it as a summary, never put quotation marks around generated content.
 const takeSummary=body=>{
  const first=takeFragments(body)[0]||'';
  const sentences=[...first.matchAll(/[.!?](?:["”’»])?(?=\s|$)/g)];
  const end=sentences[Math.min(1,sentences.length-1)];
  return end?first.slice(0,end.index+end[0].length):first;
 };
 let takeFonts=null;
 function prepareTakeFonts(){
  if(!document.fonts?.load)return null;
  if(!takeFonts)takeFonts=Promise.all([
   document.fonts.load('600 80px "Playfair Display"'),
   document.fonts.load('400 32px "Libre Baskerville"'),
   document.fonts.load('700 32px "Libre Baskerville"')
  ]).catch(()=>{takeFonts=null;});
  return takeFonts;
 }
 let takeLogo=null,takeLogoLoading=null;
 function prepareTakeArtwork(){
  if(!takeLogoLoading)takeLogoLoading=new Promise((resolve,reject)=>{
   const img=new Image();
   const timeout=setTimeout(()=>fail(),10000);
   function fail(){clearTimeout(timeout);img.onload=img.onerror=null;takeLogoLoading=null;reject(Error('No se pudo cargar el logo oficial. Comprueba la conexión y vuelve a abrir Compartir.'));}
   img.onload=()=>{clearTimeout(timeout);img.onload=img.onerror=null;takeLogo=img;resolve(img);};
   img.onerror=fail;img.src=LOGO_URL;
  });
  return Promise.all([prepareTakeFonts(),takeLogoLoading]);
 }
 function renderTakeCard(p,options={}){
  const portrait=options.size==='story',square=options.size==='square',w=1080;
  const mode=options.mode||'title',extra=mode==='summary'?takeSummary(p.body):mode==='fragment'?takeFragments(p.body)[options.fragment||0]||'':'';
  // Default: export the card itself, never a smaller card on a white canvas.
  const h=portrait?1920:square?1080:extra?840:566;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');if(!c)throw Error('Este navegador no permite generar la imagen. Prueba descargarla desde otro navegador.');
  // Opaque CAM blue reaches every edge, including the corners. Transparent
  // padding could be flattened to white by a receiving social application.
  c.fillStyle='#073B83';c.fillRect(0,0,w,h);
  if(!takeLogo)throw Error('El logo oficial todavía no está listo.');
  const margin=portrait?82:54,right=portrait?916:1026,maxWidth=right-margin;
  const logoTop=portrait?295:24,logoWidth=164;
  const logoHeight=logoWidth*takeLogo.naturalHeight/takeLogo.naturalWidth;
  c.drawImage(takeLogo,right-logoWidth,logoTop,logoWidth,logoHeight);
  c.textAlign='left';

  const footerY=portrait?1370:square?909:h-100,baseTop=portrait?480:square?264:155,textSpace=footerY-(portrait?70:28)-baseTop;
  const scale={compact:.86,large:1.14}[options.textSize]||1;
  let font=Math.round((extra?72:square||portrait?104:84)*scale),extraFont=36,lines=[],extraLines=[],block=0;
  for(;font>=22;font-=1){
   c.font='600 '+font+'px "Playfair Display", Georgia, serif';lines=wrap(c,p.title,maxWidth,Infinity);
   extraFont=Math.max(22,Math.min(portrait?40:34,Math.round(font*.55)));
   c.font='400 '+extraFont+'px "Libre Baskerville", Georgia, serif';extraLines=extra?wrap(c,extra,maxWidth,Infinity):[];
   block=lines.length*font*1.16+(extra?76+extraLines.length*extraFont*1.4:0);
   if(block<=textSpace)break;
  }
  if(block>textSpace)throw Error('Este texto necesita más espacio. Elige otro fragmento o el formato vertical.');
  c.fillStyle='#fff';c.font='600 '+font+'px "Playfair Display", Georgia, serif';
  // Balance a short final line without changing any words or the fitted height.
  if(!clean(p.title,10000).split(' ').some(word=>c.measureText(word).width>maxWidth)){
   for(let i=lines.length-1;i>0;i--){
    const previous=lines[i-1].split(' ');
    while(previous.length>1&&c.measureText(lines[i]).width<c.measureText(previous.join(' ')).width*.75){
     const next=previous.at(-1)+' '+lines[i];if(c.measureText(next).width>maxWidth)break;
     previous.pop();lines[i]=next;lines[i-1]=previous.join(' ');
    }
   }
  }
  let y=baseTop+(textSpace-block)/2+font;
  for(const line of lines){c.fillText(line,margin,y);y+=font*1.16;}
  if(extra){
   y+=28-font;c.fillStyle='#DDC5AD';c.font='600 21px Arial, sans-serif';
   c.fillText(mode==='summary'?'RESUMEN DEL TAKE':'FRAGMENTO ORIGINAL',margin,y);y+=30;
   c.fillStyle='#fff';c.font='400 '+extraFont+'px "Libre Baskerville", Georgia, serif';
   for(const line of extraLines){y+=extraFont*1.4;c.fillText(line,margin,y);}
  }
  c.strokeStyle='#BE9270';c.lineWidth=2;c.beginPath();c.moveTo(margin,footerY);c.lineTo(right,footerY);c.stroke();
  c.fillStyle='#fff';c.textAlign='left';c.font='400 34px "Libre Baskerville", Georgia, serif';
  c.fillText('Por',margin,footerY+75);
  let username=p.author.replace(/^@/,'')||'Aficionado';
  let nameFont=35;
  const date=options.showDate===false?'':p.date.split('-').reverse().join('/');
  const dateWidth=date?245:0;
  for(;nameFont>=20;nameFont-=1){
   c.font='700 '+nameFont+'px "Libre Baskerville", Georgia, serif';
   if(c.measureText(username).width<=maxWidth-90-dateWidth)break;
  }
  // Wrap a long username as needed instead of overlapping the publication date.
  const names=wrap(c,username,maxWidth-90-dateWidth,Infinity);
  c.font='700 '+Math.max(20,nameFont)+'px "Libre Baskerville", Georgia, serif';
  names.forEach((line,i)=>c.fillText(line,margin+72,footerY+75+i*26));
  if(date){const dateRight=Math.min(right,margin+72+c.measureText(username).width+275);c.fillStyle='#BE9270';c.fillRect(dateRight-225,footerY+37,2,43);
   c.fillStyle='#fff';c.textAlign='right';c.font='400 28px "Libre Baskerville", Georgia, serif';c.fillText(date,dateRight,footerY+75);c.textAlign='left';}
  return canvas;
 }

 function renderCard(p,options){return renderTakeCard(p,options);}
 async function copy(text,status,success){
  try{
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
   else {const input=make('textarea');input.value=text;input.readOnly=true;input.style.cssText='position:fixed;opacity:0';dialog.append(input);input.select();const ok=document.execCommand?.('copy');input.remove();if(!ok)throw Error('clipboard');}
   status.textContent=success;
  }catch{status.textContent='Selecciona y copia el enlace o el texto que aparece debajo.';}
 }
 const pickRegistry=new Map();let pickResources=[];
 function release(){if(resource){URL.revokeObjectURL(resource);resource=null;}pickResources.forEach(u=>URL.revokeObjectURL(u));pickResources=[];}
 function close(){request++;if(dialog?.open)dialog.close();release();restoreFocus?.focus?.({preventScroll:true});}
 function show(pick,{kind='community',opener=document.activeElement}={}){
  let p;try{p=model(pick,kind);}catch(error){if(typeof notifyCommunity==='function')notifyCommunity(error.message,true);return;}
  restoreFocus=opener;release();const ticket=++request;
  if(!dialog){dialog=make('dialog',null,'cam-pick-share-dialog');dialog.id='camPickShareDialog';dialog.setAttribute('aria-labelledby','camPickShareTitle');document.body.append(dialog);dialog.addEventListener('close',()=>{if(dialog.open)return;request++;release();restoreFocus?.focus?.({preventScroll:true});});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});}
  dialog.classList.toggle('cam-take-share-dialog',p.kind==='take');
  dialog.classList.toggle('cam-picks-share-dialog',p.kind!=='take');
  if(p.kind!=='take'){pickRegistry.set(p.kind+':'+p.id,p);return showPicks(p,ticket);}
  const top=make('div',null,'cam-pick-share-heading');const heading=make('h2',p.kind==='take'?'Comparte este Take':p.kind==='weekly'?'Comparte el Pick del editor':'Comparte este Pick');heading.id='camPickShareTitle';top.append(heading);
  const exit=make('button','Cerrar','cam-pick-share-close');exit.type='button';exit.onclick=close;top.append(exit);
  const intro=make('p',p.kind==='take'?'Tu Take, listo para compartir como imagen.':'Llévalo a tus redes y que empiece el debate.','cam-pick-share-intro');
  const layout=make('div',null,'cam-pick-share-layout');const preview=make('div',null,'cam-pick-share-preview');preview.setAttribute('aria-busy','true');preview.append(make('p','Preparando tarjeta…'));
  const content=make('div',null,'cam-pick-share-content');const actions=make('div',null,'cam-pick-share-networks');actions.setAttribute('aria-label','Opciones para compartir');
  const x=make('a','X','cam-pick-share-network');x.href=xUrl(p);x.target='_blank';x.rel='noopener noreferrer';x.setAttribute('aria-label','Abrir publicación preparada en X');
  if(p.kind==='take')x.setAttribute('aria-label','Compartir imagen en X');
  const ig=make('button','Instagram','cam-pick-share-network'),tk=make('button','TikTok','cam-pick-share-network');ig.type=tk.type='button';ig.disabled=tk.disabled=true;actions.append(x,ig,tk);
  const hint=make('p','Elige Instagram o TikTok desde el menú de tu teléfono. Si la app solo recibe la imagen, usa «Copiar texto» para añadir el mensaje y el enlace. También puedes descargar la tarjeta.','cam-pick-share-hint');
  const status=make('p','', 'cam-pick-share-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const download=make('a','Descargar tarjeta','cam-pick-share-download');download.hidden=true;download.download=`cam-sports-${p.kind==='take'?'take':p.kind==='weekly'?'pick-del-dia':'pick'}-${p.id}.png`;
  if(p.kind==='take')download.textContent='Descargar imagen';
  const linkButton=make('button','Copiar enlace'),textButton=make('button','Copiar texto');linkButton.type=textButton.type='button';
  linkButton.onclick=()=>copy(urlFor(p),status,'Enlace copiado.');textButton.onclick=()=>copy(caption(p),status,'Texto y enlace copiados.');
  const utilities=make('div',null,'cam-pick-share-utilities');utilities.append(download,linkButton,textButton);
  const label=make('label','Texto para tu publicación','cam-pick-share-caption-label');const text=make('textarea');text.value=caption(p);text.readOnly=true;text.rows=5;text.setAttribute('aria-label','Texto y enlace de la publicación');label.append(text);
  const defaults=()=>({mode:'title',size:'card',showDate:true,fragment:0,textSize:'auto'});
  let takeOptions=defaults();
  let editor=null,modeSelect=null,fragmentLabel=null,fragmentSelect=null,sizeSelect=null,dateToggle=null,textSizeSelect=null,selectionNote=null,shareButton=null;
  if(p.kind==='take'){
   editor=make('section',null,'cam-take-share-editor');editor.setAttribute('aria-label','Personalizar la ficha del Take');
   const title=make('strong','Personaliza tu ficha','cam-take-share-editor-title');editor.append(title);
   const field=(name,control)=>{const label=make('label',name,'cam-take-share-field');label.append(control);editor.append(label);return label;};
   modeSelect=make('select');for(const [value,name] of [['title','Solo título'],['summary','Con resumen'],['fragment','Con fragmento']]){const option=make('option',name);option.value=value;modeSelect.append(option);}
   field('Contenido de la ficha',modeSelect);
   fragmentSelect=make('select');const pieces=takeFragments(p.body);
   pieces.forEach((piece,i)=>{const option=make('option','Fragmento '+(i+1)+': '+piece.slice(0,44)+(piece.length>44?'…':''));option.value=String(i);fragmentSelect.append(option);});
   fragmentLabel=field('Fragmento del texto original',fragmentSelect);fragmentLabel.classList.add('cam-take-share-fragment');fragmentLabel.hidden=true;
   selectionNote=make('p','','cam-take-share-selection');selectionNote.hidden=true;editor.append(selectionNote);
   if(!pieces.length){modeSelect.querySelector('option[value="summary"]').disabled=true;modeSelect.querySelector('option[value="fragment"]').disabled=true;}
   sizeSelect=make('select');for(const [value,name] of [['card','Horizontal'],['square','Cuadrada'],['story','Historia']]){const option=make('option',name);option.value=value;sizeSelect.append(option);}
   field('Formato',sizeSelect);
   textSizeSelect=make('select');for(const [value,name] of [['auto','Automático'],['compact','Pequeño'],['large','Grande']]){const option=make('option',name);option.value=value;textSizeSelect.append(option);}
   field('Tamaño del texto',textSizeSelect);
   const dateLabel=make('label',null,'cam-take-share-checkbox');dateToggle=make('input');dateToggle.type='checkbox';dateToggle.checked=true;dateLabel.append(dateToggle,make('span','Mostrar fecha'));editor.append(dateLabel);
   const reset=make('button','Restablecer diseño','cam-take-share-reset');reset.type='button';editor.append(reset);
   content.prepend(editor);
   modeSelect.onchange=()=>{takeOptions.mode=modeSelect.value;fragmentLabel.hidden=modeSelect.value!=='fragment';refresh();};
   fragmentSelect.onchange=()=>{takeOptions.fragment=Number(fragmentSelect.value)||0;refresh();};
   sizeSelect.onchange=()=>{takeOptions.size=sizeSelect.value;refresh();};
   dateToggle.onchange=()=>{takeOptions.showDate=dateToggle.checked;refresh();};
   textSizeSelect.onchange=()=>{takeOptions.textSize=textSizeSelect.value;refresh();};
   reset.onclick=()=>{takeOptions=defaults();modeSelect.value='title';fragmentSelect.value='0';fragmentLabel.hidden=true;sizeSelect.value='card';textSizeSelect.value='auto';dateToggle.checked=true;refresh();};
  }
  if(p.kind==='take'){
   hint.textContent='El menú del teléfono permite elegir una app. Si no recibe imágenes, descarga el PNG y adjúntalo; puedes copiar el enlace por separado.';
   const details=make('details',null,'cam-take-share-caption');details.append(make('summary','Texto y enlace del Take'),label,textButton);
   content.append(actions,hint,details);layout.append(preview,content);
   shareButton=make('button','Compartir imagen','cam-take-share-primary');shareButton.type='button';shareButton.disabled=true;utilities.prepend(shareButton);
   const bar=make('div',null,'cam-take-share-bar');bar.append(utilities,status);dialog.replaceChildren(top,intro,layout,bar);
  }else{content.append(actions,hint,utilities,status,label);layout.append(preview,content);dialog.replaceChildren(top,intro,layout);}
  if(!dialog.open)dialog.showModal();exit.focus({preventScroll:true});dialog.scrollTop=0;

  let file=null,generation=0,imageOnly=false,sharingPending=false;
  const ready=()=>{ig.disabled=tk.disabled=!file||sharingPending;if(shareButton)shareButton.disabled=!file||sharingPending;if(p.kind==='take')x.setAttribute('aria-disabled',String(!file||sharingPending));};
  function nativeShare(network){
   if(!file||sharingPending)return;
   let fileSharing=false;try{fileSharing=typeof navigator.share==='function'&&Boolean(navigator.canShare?.({files:[file]}));}catch{}
   if(fileSharing){
    let sharing;const current=generation;
    let data={files:[file],title:headline(p),text:caption(p),url:urlFor(p)};
    if(p.kind==='take'){
     data.text=p.title;
     // Instagram and TikTok often filter out combined text/file shares. Hand
     // them the image; the separate copy action retains the original permalink.
     let combined=false;try{combined=navigator.canShare(data);}catch{}
     if(imageOnly||network==='Instagram'||network==='TikTok'||!combined)data={files:[file]};
    }
    // Keep the native share invocation within the user's tap (iOS activation).
    const failure=e=>{
     if(ticket!==request||current!==generation)return;
     if(e?.name==='AbortError'){status.textContent='Puedes volver a compartir cuando quieras.';return;}
     if(p.kind==='take'&&data.text){imageOnly=true;shareButton.textContent='Compartir solo imagen';status.textContent='No se pudo enviar la imagen con el enlace. Pulsa «Compartir solo imagen» o descarga el PNG.';}
     else status.textContent='Descarga la tarjeta y adjúntala en la aplicación. También puedes copiar el enlace.';
    };
    try{sharing=navigator.share(data);}catch(e){failure(e);return;}
    sharingPending=true;ready();
    Promise.resolve(sharing).then(()=>{if(ticket===request&&current===generation)status.textContent='Imagen entregada al menú de compartir. Completa la publicación en la aplicación elegida.';})
    .catch(failure).finally(()=>{sharingPending=false;if(ticket===request)ready();});
   }else status.textContent='Descarga la tarjeta; tu navegador no permite enviarla directamente. Adjunta el PNG en la aplicación y usa «Copiar enlace» si lo necesitas.';
  }
  if(shareButton)shareButton.onclick=()=>nativeShare('tu aplicación');
  for(const [button,network] of [[ig,'Instagram'],[tk,'TikTok']])button.onclick=()=>nativeShare(network);
  if(p.kind==='take'){
   // X Intent only transfers text. Prefer native file share; otherwise make the
   // image download explicit rather than pretending the tweet contains media.
   x.addEventListener('click',e=>{
    e.preventDefault();nativeShare('X');
   });
  }
  function refresh(){
   const current=++generation;file=null;ready();download.hidden=true;download.removeAttribute('href');release();
   if(selectionNote){selectionNote.hidden=takeOptions.mode==='title';selectionNote.textContent=takeOptions.mode==='summary'?'Resumen extractivo automático: selección de frases del Take, sin texto añadido.':takeFragments(p.body)[takeOptions.fragment]||'';}
   preview.replaceChildren(make('p','Preparando tarjeta…'));preview.setAttribute('aria-busy','true');status.textContent='';
   const draw=()=>{if(ticket!==request||current!==generation||!dialog.open)return;try{
    const canvas=renderCard(p,takeOptions);
    canvas.toBlob(blob=>{
     if(ticket!==request||current!==generation||!dialog.open)return;
     if(!blob){preview.replaceChildren(make('p','No se pudo preparar la imagen. Puedes copiar el texto o el enlace.'));preview.setAttribute('aria-busy','false');return;}
     resource=URL.createObjectURL(blob);const img=make('img');img.src=resource;img.alt='Ficha para compartir: '+p.title+' · '+p.author;img.width=canvas.width;img.height=canvas.height;
     preview.replaceChildren(img);preview.setAttribute('aria-busy','false');
     file=new File([blob],download.download,{type:'image/png'});download.href=resource;download.hidden=false;ready();
    },'image/png');
   }catch(error){preview.replaceChildren(make('p',error.message));preview.setAttribute('aria-busy','false');}};
   const artwork=p.kind==='take'?prepareTakeArtwork():null;
   if(artwork)artwork.then(draw,error=>{if(ticket!==request||current!==generation||!dialog.open)return;preview.replaceChildren(make('p',error.message));preview.setAttribute('aria-busy','false');});else draw();
  }
  refresh();

 }
 // Pick exports use the same official artwork, canvas wrapping and share dialog.
 // The registry contains only normalized public fields already rendered by the site.
 const pickKey=p=>p.kind+':'+p.id;
 function pickPages(p,options){
  const w=1080,h=options.size==='story'?1920:options.size==='card'?700:1080;
  const top=options.size==='story'?440:options.size==='card'?210:238,footer=options.size==='story'?1515:options.size==='card'?h-135:h-140,bottom=footer-(options.size==='card'?120:145),width=948;
  const measure=document.createElement('canvas').getContext('2d');
  if(!measure)throw Error('Este navegador no permite generar imágenes.');
  const groups=[];
  const lines=(text,font,size,color='#fff',gap=0)=>{
   measure.font=font;return wrap(measure,text,width,Infinity).map((text,i)=>({text,font,size,color,height:size*1.28+(i===0?gap:0),gap:i===0?gap:0}));
  };
  p.legs.forEach((leg,index)=>{
   const size=p.legs.length===1?72:46,parts=leg.selection.split(/\s+[·•]\s+/);
   const choice=parts.shift(),market=[...parts,leg.market,leg.line&&!leg.selection.includes(leg.line)?'Línea '+leg.line:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');
   const group=[];
   if(p.legs.length>1&&!leg.event)group.push(...lines('SELECCIÓN '+(index+1),'600 22px Arial, sans-serif',22,'#DDC5AD'));
   if(leg.event)group.push(...lines((p.legs.length>1?String(index+1).padStart(2,'0')+' · ':'')+leg.event,'400 29px Arial, sans-serif',29,'#fff',8));
   group.push(...lines(choice,'600 '+size+'px "Playfair Display", Georgia, serif',size,'#fff',10));
   if(market)group.push(...lines(market,'400 28px Arial, sans-serif',28,'#DDC5AD',10));
   groups.push(group);
  });
  if(options.showAnalysis&&p.analysis){
   const fragment=takeFragments(p.analysis)[options.fragments[pickKey(p)]||0]||'';
   groups.push([...lines('ANÁLISIS · FRAGMENTO ORIGINAL','600 22px Arial, sans-serif',22,'#DDC5AD'),...lines(fragment,'400 28px Arial, sans-serif',28,'#fff',12)]);
  }
  // Paginate at a readable, fixed size. A very long row continues on another
  // image; no selections are discarded or replaced with an ellipsis.
  const capacity=bottom-top,pages=[];let page=[],used=0;
  const flush=()=>{if(page.length){pages.push(page);page=[];used=0;}};
  for(const group of groups){
   const height=group.reduce((n,l)=>n+l.height,0)+20;
   if(used&&used+height>capacity)flush();
   for(const line of group){if(used+line.height>capacity)flush();page.push(line);used+=line.height;}
   used+=20;if(page.length)page[page.length-1]={...page.at(-1),height:page.at(-1).height+20};
  }
  flush();return pages.map((lines,index)=>({p,w,h,top,bottom,footer,lines,index,total:pages.length}));
 }
 function renderPickPage(page,options,position,count){
  const {p,w,h,top,bottom,footer,lines}=page,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');if(!c||!takeLogo)throw Error('No se pudo preparar la ficha con el logo oficial.');
  c.fillStyle='#073B83';c.fillRect(0,0,w,h);
  const margin=66,right=1014,story=options.size==='story',header=story?300:76;
  c.drawImage(takeLogo,right-154,header-28,154,154*takeLogo.naturalHeight/takeLogo.naturalWidth);
  c.fillStyle='#fff';c.font='600 26px Arial, sans-serif';
  // The header has reserved space for the logo and keeps the complete label.
  let sportFont=26,sportLines=[];for(;sportFont>=20;sportFont--){c.font='600 '+sportFont+'px Arial, sans-serif';sportLines=wrap(c,p.competition||'PICKS',710,Infinity);if(sportLines.length<=3)break;}
  sportLines.forEach((line,i)=>c.fillText(line,margin,header+i*(sportFont*1.2)));
  c.fillStyle='#DDC5AD';c.font='600 23px Arial, sans-serif';
  c.fillText(p.legs.length>1?'COMBINADA · '+p.legs.length+' SELECCIONES':p.kind==='weekly'?'PICK DEL EDITOR':'PICK INDIVIDUAL',margin,story?398:180);
  const height=lines.reduce((n,l)=>n+l.height,0);let y=top+Math.max(0,(bottom-top-height)/2);
  for(const line of lines){y+=line.gap+line.size;c.font=line.font;c.fillStyle=line.color;c.fillText(line.text,margin,y);y+=line.height-line.gap-line.size;}
  c.fillStyle='#fff';c.font='600 34px Arial, sans-serif';
  if(options.showOdds&&p.odds!=='—')c.fillText((p.legs.length>1?'Cuota total ':'Cuota ')+p.odds,margin,footer-86);
  c.fillStyle='#DDC5AD';c.font='400 23px Arial, sans-serif';if(options.showOdds&&p.review&&p.odds!=='—')c.fillText(p.review,margin,footer-48);
  c.textAlign='right';c.fillStyle='#fff';c.font='600 26px Arial, sans-serif';
  c.fillText({pending:'◷ Pendiente',won:'✓ Acertado',lost:'✕ Fallado',void:'— Anulado'}[p.state],right,footer-48);c.textAlign='left';
  c.strokeStyle='#BE9270';c.lineWidth=2;c.beginPath();c.moveTo(margin,footer);c.lineTo(right,footer);c.stroke();
  const date=options.showDate&&p.date?p.date.split('-').reverse().join('/'):'';
  let font=30;for(;font>20;font--){c.font='600 '+font+'px Arial, sans-serif';if(c.measureText('Por '+p.author).width<(date?690:948))break;}
  wrap(c,'Por '+p.author,date?690:948,Infinity).forEach((line,i)=>c.fillText(line,margin,footer+55+i*25));
  if(date){c.font='400 25px Arial, sans-serif';c.textAlign='right';c.fillText(date,right,footer+55);c.textAlign='left';}
  if(count>1){c.fillStyle='#DDC5AD';c.font='400 22px Arial, sans-serif';c.textAlign='right';c.fillText('IMAGEN '+(position+1)+' / '+count,right,story?398:180);c.textAlign='left';}
  return canvas;
 }
 // A standard uncompressed ZIP keeps every PNG byte-identical and avoids
 // browser restrictions on a sequence of automatic download clicks.
 async function pickZip(files){
  const encoder=new TextEncoder(),local=[],central=[];let offset=0;
  const header=(size,fill)=>{const bytes=new Uint8Array(size);fill(new DataView(bytes.buffer));return bytes;};
  for(const file of files){
   const bytes=new Uint8Array(await file.arrayBuffer()),name=encoder.encode(file.name);let crc=0xffffffff;
   for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
   crc=(crc^0xffffffff)>>>0;
   const a=header(30,v=>{v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);});
   const b=header(46,v=>{v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint32(16,crc,true);v.setUint32(20,bytes.length,true);v.setUint32(24,bytes.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);});
   local.push(a,name,bytes);central.push(b,name);offset+=a.length+name.length+bytes.length;
  }
  const centralLength=central.reduce((n,b)=>n+b.length,0);
  const end=header(22,v=>{v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralLength,true);v.setUint32(16,offset,true);});
  return new Blob([...local,...central,end],{type:'application/zip'});
 }
 function showPicks(primary,ticket){
  const defaults=()=>({size:'square',showOdds:true,showDate:true,showAnalysis:false,fragments:{}});
  let options=defaults(),selected=new Set([pickKey(primary)]),generation=0,items=[],position=0,sharing=false,imageOnly=false;
  const pool=[primary,...[...pickRegistry.values()].filter(p=>pickKey(p)!==pickKey(primary))];
  const chosen=()=>pool.filter(p=>selected.has(pickKey(p)));
  const top=make('div',null,'cam-pick-share-heading'),heading=make('h2',primary.kind==='weekly'?'Comparte el Pick del editor':'Comparte este Pick');heading.id='camPickShareTitle';
  const exit=make('button','Cerrar','cam-pick-share-close');exit.type='button';exit.onclick=close;top.append(heading,exit);
  const preview=make('div',null,'cam-pick-share-preview'),navigation=make('div',null,'cam-picks-share-pagination');
  const previous=make('button','Anterior'),counter=make('span'),next=make('button','Siguiente');previous.type=next.type='button';counter.setAttribute('aria-live','polite');navigation.append(previous,counter,next);
  const editor=make('section',null,'cam-picks-share-editor');editor.setAttribute('aria-label','Personalizar fichas de Picks');editor.append(make('strong','Personaliza tus fichas'));
  const field=(name,control)=>{control.setAttribute('aria-label',name);const label=make('label',name,'cam-picks-share-field');label.append(control);editor.append(label);return label;};
  const format=make('select');for(const [value,label] of [['square','Cuadrada'],['story','Historia'],['card','Horizontal']]){const option=make('option',label);option.value=value;format.append(option);}field('Formato',format);
  const picker=make('details',null,'cam-picks-share-picker');picker.append(make('summary','Elegir Picks · '+pool.length+' disponibles'));
  picker.append(make('p','Cada Pick conserva su autor, cuota y enlace. Los Picks independientes se exportan por separado.'));
  const checks=[];
  for(const p of pool){const label=make('label',null,'cam-picks-share-checkbox'),check=make('input');check.type='checkbox';check.checked=pickKey(p)===pickKey(primary);check.setAttribute('aria-label','Incluir Pick: '+p.title+' · '+p.author);label.append(check,make('span',p.title+' · '+p.author));picker.append(label);checks.push([check,p]);check.onchange=()=>{if(check.checked)selected.add(pickKey(p));else selected.delete(pickKey(p));syncAnalysis();refresh();};}
  editor.append(picker);
  const toggle=(label,key)=>{const row=make('label',null,'cam-picks-share-checkbox'),input=make('input');input.type='checkbox';input.checked=options[key];row.append(input,make('span',label));editor.append(row);input.onchange=()=>{options[key]=input.checked;syncAnalysis();refresh();};return input;};
  const oddsToggle=toggle('Mostrar cuota','showOdds'),dateToggle=toggle('Mostrar fecha','showDate'),analysisToggle=toggle('Mostrar análisis','showAnalysis');
  const analysisOwner=make('select'),analysisOwnerLabel=field('Análisis del Pick',analysisOwner),fragment=make('select'),fragmentLabel=field('Fragmento original',fragment),analysisNote=make('p',null,'cam-picks-share-analysis');editor.append(analysisNote);
  function syncAnalysis(){
   const rows=chosen().filter(p=>p.analysis),old=analysisOwner.value;
   analysisToggle.disabled=!rows.length;
   analysisOwner.replaceChildren(...rows.map(p=>{const o=make('option',p.title);o.value=pickKey(p);return o;}));
   if(rows.some(p=>pickKey(p)===old))analysisOwner.value=old;
   const p=rows.find(p=>pickKey(p)===analysisOwner.value)||rows[0];
   const pieces=takeFragments(p?.analysis);fragment.replaceChildren(...pieces.map((piece,i)=>{const o=make('option','Fragmento '+(i+1)+': '+piece.slice(0,55)+(piece.length>55?'…':''));o.value=String(i);return o;}));
   fragment.value=String(options.fragments[p?pickKey(p):'']||0);
   analysisOwnerLabel.hidden=fragmentLabel.hidden=analysisNote.hidden=!options.showAnalysis||!p;
   analysisNote.textContent=pieces[Number(fragment.value)]||'';
  }
  analysisOwner.onchange=syncAnalysis;fragment.onchange=()=>{options.fragments[analysisOwner.value]=Number(fragment.value);syncAnalysis();refresh();};
  format.onchange=()=>{options.size=format.value;refresh();};
  const reset=make('button','Restablecer diseño');reset.type='button';editor.append(reset);reset.onclick=()=>{options=defaults();selected=new Set([pickKey(primary)]);checks.forEach(([c,p])=>c.checked=pickKey(p)===pickKey(primary));format.value='square';oddsToggle.checked=dateToggle.checked=true;analysisToggle.checked=false;syncAnalysis();refresh();};
  const actions=make('div',null,'cam-pick-share-networks'),networks=['X','Instagram','TikTok'].map(name=>{const b=make('button',name,'cam-pick-share-network');b.type='button';b.onclick=()=>nativeShare(name);actions.append(b);return b;});
  const hint=make('p','Elige una app desde el menú del teléfono. Si no admite la imagen, descarga el PNG y adjúntalo. El enlace se puede copiar por separado.','cam-pick-share-hint');
  const details=make('details',null,'cam-picks-share-caption'),label=make('label','Texto y enlaces originales','cam-pick-share-caption-label'),text=make('textarea');text.readOnly=true;text.rows=5;label.append(text);details.append(make('summary','Texto y enlaces de los Picks'),label);
  const copyText=make('button','Copiar texto');copyText.type='button';details.append(copyText);
  const utilities=make('div',null,'cam-pick-share-utilities'),share=make('button','Compartir imagen','cam-picks-share-primary'),download=make('a','Descargar imagen','cam-pick-share-download'),all=make('a','Descargar todas (ZIP)','cam-picks-share-all'),copyLink=make('button','Copiar enlace'),single=make('button','Compartir esta imagen');
  share.type=single.type=copyLink.type='button';download.hidden=all.hidden=true;single.hidden=true;
  const status=make('p','','cam-pick-share-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const bar=make('div',null,'cam-picks-share-bar');utilities.append(share,download,copyLink,all);bar.append(utilities,status);
  const layout=make('div',null,'cam-pick-share-layout'),content=make('div',null,'cam-pick-share-content');content.append(editor,actions,hint,details);layout.append(preview,navigation,single,content);
  dialog.replaceChildren(top,make('p','Tu selección, lista para compartir como imagen.','cam-pick-share-intro'),layout,bar);
  function links(){return chosen().map(urlFor).join('\n');}
  function captionText(){return chosen().map(p=>[headline(p),p.result,...p.legs.map(l=>[l.event,l.selection,l.market,l.line].filter(Boolean).join(' · ')),options.showOdds&&p.odds!=='—'?quota(p):'',options.showDate&&p.date?p.date:'',options.showAnalysis?takeFragments(p.analysis)[options.fragments[pickKey(p)]||0]:'',urlFor(p)].filter(Boolean).join('\n\n')).join('\n\n———\n\n');}
  copyLink.onclick=()=>copy(links(),status,'Enlace'+(chosen().length>1?'s copiados.':' copiado.'));copyText.onclick=()=>copy(text.value,status,'Texto y enlaces copiados.');
  function enabled(){const disabled=!items.length||sharing;share.disabled=single.disabled=disabled;networks.forEach(b=>b.disabled=disabled);copyLink.disabled=copyText.disabled=!selected.size;}
  function showPage(){
   if(!items.length)return;const item=items[position],img=make('img');img.src=item.url;img.alt='Ficha para compartir: '+item.p.title+' · '+item.p.author+' · Imagen '+(position+1)+' de '+items.length;img.width=item.width;img.height=item.height;preview.replaceChildren(img);
   download.href=item.url;download.download=item.file.name;download.hidden=false;
   navigation.hidden=single.hidden=items.length<2;previous.disabled=position===0;next.disabled=position===items.length-1;counter.textContent='Imagen '+(position+1)+' de '+items.length;
   share.textContent=items.length>1?'Compartir '+items.length+' imágenes':'Compartir imagen';enabled();
  }
  previous.onclick=()=>{position--;showPage();};next.onclick=()=>{position++;showPage();};share.onclick=()=>nativeShare('tu aplicación');single.onclick=()=>nativeShare('tu aplicación',true);
  function nativeShare(network,one=false){
   if(!items.length||sharing)return;const files=(one?[items[position]]:items).map(i=>i.file);let supported=false;
   try{supported=typeof navigator.share==='function'&&navigator.canShare?.({files});}catch{}
   if(!supported){status.textContent=files.length>1?'Este dispositivo no admite enviar todas las imágenes juntas. Usa «Compartir esta imagen» o «Descargar todas (ZIP)».':'Descarga la imagen y adjúntala en la aplicación. Puedes copiar el enlace por separado.';return;}
   const current=generation,rows=one?[items[position].p]:chosen();
   let data={files,title:rows.length===1?headline(rows[0]):'Picks · CAM SPORTS',text:rows.map(p=>p.title+'\n'+urlFor(p)).join('\n\n')};
   if(rows.length===1)data.url=urlFor(rows[0]);
   try{if(imageOnly||network==='Instagram'||network==='TikTok'||!navigator.canShare(data))data={files};}catch{data={files};}
   const fail=error=>{if(ticket!==request||current!==generation)return;if(error?.name==='AbortError'){status.textContent='Puedes volver a compartir cuando quieras.';return;}if(data.text){imageOnly=true;status.textContent='No se pudo enviar la imagen con el enlace. Vuelve a pulsar Compartir para enviar solo la imagen o descarga el PNG.';}else status.textContent='No se pudo enviar la imagen. Descarga el PNG y adjúntalo en la aplicación.';};
   let result;try{result=navigator.share(data);}catch(error){fail(error);return;}
   sharing=true;enabled();Promise.resolve(result).then(()=>{if(ticket===request&&current===generation)status.textContent='Imagen entregada al menú de compartir. Completa la publicación en la aplicación elegida.';}).catch(fail).finally(()=>{sharing=false;if(ticket===request)enabled();});
  }
  async function refresh(){
   const current=++generation;items=[];position=0;release();enabled();download.hidden=all.hidden=single.hidden=navigation.hidden=true;download.removeAttribute('href');all.removeAttribute('href');text.value=captionText();status.textContent='';preview.setAttribute('aria-busy','true');preview.replaceChildren(make('p','Preparando fichas…'));
   const active=()=>ticket===request&&current===generation&&dialog.open;
   if(!selected.size){preview.replaceChildren(make('p','Elige al menos un Pick para compartir.'));preview.setAttribute('aria-busy','false');return;}
   try{
    await prepareTakeArtwork();if(!active())return;
    const plans=chosen().flatMap(p=>pickPages(p,options)),prepared=[];
    for(const [index,plan] of plans.entries()){
     const canvas=renderPickPage(plan,options,index,plans.length);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!active())return;if(!blob)throw Error('No se pudo generar el PNG. Inténtalo de nuevo.');
     const name='cam-sports-'+(plan.p.kind==='weekly'?'pick-del-dia':'pick')+'-'+plan.p.id+(plans.length>1?'-'+(index+1):'')+'.png';
     prepared.push({p:plan.p,blob,file:new File([blob],name,{type:'image/png'}),width:canvas.width,height:canvas.height});
    }
    const zip=prepared.length>1?await pickZip(prepared.map(i=>i.file)):null;if(!active())return;
    for(const item of prepared){item.url=URL.createObjectURL(item.blob);pickResources.push(item.url);}
    if(zip){all.href=URL.createObjectURL(zip);pickResources.push(all.href);all.download='cam-sports-picks.zip';all.hidden=false;}
    items=prepared;showPage();preview.setAttribute('aria-busy','false');
   }catch(error){if(!active())return;release();items=[];enabled();preview.replaceChildren(make('p',error.message));preview.setAttribute('aria-busy','false');}
  }
  if(!dialog.open)dialog.showModal();exit.focus({preventScroll:true});dialog.scrollTop=0;syncAnalysis();refresh();
 }

 function button(p,options={}){
  if(options.kind!=='take')try{const entry=model(p,options.kind);pickRegistry.set(entry.kind+':'+entry.id,entry);}catch{}
  const type=options.kind==='take'?'Take':'Pick';
  const b=make('button','Compartir','cam-pick-share-button');b.type='button';b.setAttribute('aria-label','Compartir '+type+': '+clean(p.title||p.event_name||type,160));
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M15 3h6v6M21 3 10 14M10 5H4v16h16v-6');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');icon.append(path);b.prepend(icon);
  b.onclick=e=>{e.preventDefault();e.stopPropagation();show(p,{...options,opener:b});};return b;
 }
 window.CamPickShare=Object.freeze({open:show,button});
})();
