/* Public Pick/Take sharing. No credentials, screenshot uploads or automatic social posts. */
(() => {
 'use strict';
 const BASE='https://camsports.github.io/';
 const ASSETS=new URL('.',document.currentScript?.src||new URL('assets/cam-pick-share.js',document.baseURI));
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
 const SHARE_DISPLAY=typeof FontFace==='function'?'CAM Share Playfair':'Playfair Display';
 const SHARE_TEXT=typeof FontFace==='function'?'CAM Share Baskerville':'Libre Baskerville';
 let takeFonts=null,takeLogo=null;
 function prepareTakeFonts(){
  if(!document.fonts?.load)return null;
  if(!takeFonts){
   // Private family names keep canvas exports independent of lazy stylesheets,
   // theme changes and other faces registered under the site's family names.
   const fonts=typeof FontFace==='function'?Promise.all([
    [SHARE_DISPLAY,'playfair-display-latin-600-normal.woff2','600'],
    [SHARE_TEXT,'libre-baskerville-latin-400-normal.woff2','400'],
    [SHARE_TEXT,'libre-baskerville-latin-700-normal.woff2','700']
   ].map(async([family,file,weight])=>{
    const face=await new FontFace(family,'url("'+new URL('fonts/'+file,ASSETS).href+'")',{weight}).load();document.fonts.add(face);
   })):Promise.all([
    document.fonts.load('600 80px "Playfair Display"'),
    document.fonts.load('400 32px "Libre Baskerville"'),
    document.fonts.load('700 32px "Libre Baskerville"')
   ]).then(loaded=>{if(loaded.some(f=>!f.length))throw Error('fonts');});
   takeFonts=fonts.catch(()=>{takeFonts=null;throw Error('No se pudieron cargar las fuentes. Vuelve a preparar la ficha.');});
  }
  return takeFonts;
 }
 function prepareTakeAssets(){
  if(!takeLogo)takeLogo=new Promise((resolve,reject)=>{
   const logo=new Image();
   logo.onload=()=>resolve(logo);
   logo.onerror=()=>{takeLogo=null;reject(Error('No se pudo cargar el logo. Vuelve a preparar la ficha.'));};
   logo.src=new URL('cam-sports-logo-completo.webp',ASSETS).href;
  });
  return Promise.all([takeLogo,prepareTakeFonts()]).then(([logo])=>({logo}));
 }
 // Measured text blocks can also be used by future Pick templates. Never clip
 // text or reduce it below a mobile-readable minimum to force an export.
 function fitShareBlocks(c,blocks,width,height){
  for(let step=0;step<=40;step++){
   const ratio=1-step/40;
   const measured=blocks.map(b=>{
    const size=Math.round(b.min+(b.max-b.min)*ratio);
    const font=b.weight+' '+size+'px '+b.family;
    c.font=font;const lines=wrap(c,b.text,width,Infinity);
    return {...b,size,font,lines,height:lines.length*size*b.leading};
   });
   const total=measured.reduce((sum,b)=>sum+b.gap+b.height,0);
   if(total<=height)return {blocks:measured,height:total};
  }
  throw Error('El texto necesita más espacio para seguir siendo legible. Acorta la explicación, elige otro fragmento o usa Historia 9:16.');
 }
 const sameTakeText=(a,b)=>clean(a,10000).normalize('NFC').toLocaleLowerCase('es').replace(/[\p{P}\p{S}]/gu,'')===clean(b,10000).normalize('NFC').toLocaleLowerCase('es').replace(/[\p{P}\p{S}]/gu,'');
 function renderTakeCard(p,options={},assets){
  const portrait=options.size==='story',w=1080,h=portrait?1920:options.size==='square'?1080:1350;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');if(!c)throw Error('Este navegador no permite generar la imagen. Prueba descargarla desde otro navegador.');
  c.fillStyle='#073B83';c.fillRect(0,0,w,h);
  // Stories leave 280px above and 350px below all essential content. A wider
  // right inset protects the action rail; the feed uses its own composition.
  const margin=82,right=portrait?936:998,maxWidth=right-margin;
  const logoTop=portrait?280:76,logoWidth=248;
  c.drawImage(assets.logo,margin,logoTop,logoWidth,logoWidth*assets.logo.naturalHeight/assets.logo.naturalWidth);
  c.textAlign='right';c.textBaseline='top';c.fillStyle='#F3EBDD';
  c.font='700 25px "'+SHARE_TEXT+'", Georgia, serif';
  const competition=wrap(c,p.competition,460,Infinity);
  competition.forEach((line,i)=>c.fillText(line,right,logoTop+34+i*34));c.textAlign='left';
  const ruleY=logoTop+160;
  c.strokeStyle='#BE9270';c.lineWidth=2;c.beginPath();c.moveTo(margin,ruleY);c.lineTo(right,ruleY);c.stroke();

  const mode=options.mode||'title';
  let main=mode==='summary'?takeSummary(p.body):mode==='fragment'?takeFragments(p.body)[options.fragment||0]||'':'';
  if(sameTakeText(main,p.title))main='';
  const explanation=clean(options.explanation,240);
  const date=options.showDate===false||!p.date?'':'Take guardado en '+p.date.split('-').reverse().join('/');
  c.font='700 30px "'+SHARE_TEXT+'", Georgia, serif';
  const author=wrap(c,p.author,maxWidth,Infinity),authorHeight=author.length*40;
  const footerY=h-(portrait?350:76)-authorHeight-(date?52:0)-24;
  const baseTop=ruleY+46,textSpace=footerY-46-baseTop;
  const scale={compact:.86,large:1.14}[options.textSize]||1;
  const blocks=[{text:p.title,family:'"'+SHARE_DISPLAY+'", Georgia, serif',weight:600,min:main?38:44,max:Math.round((main?60:explanation?94:112)*scale),leading:1.18,gap:0,color:'#FFFFFF'}];
  const contentLabel=main&&(mode==='summary'?'RESUMEN DEL TAKE':takeFragments(p.body).length>1?'FRAGMENTO ORIGINAL':'');
  if(contentLabel)blocks.push({text:contentLabel,family:'"'+SHARE_TEXT+'", Georgia, serif',weight:700,min:18,max:20,leading:1.25,gap:28,color:'#DDC5AD'});
  if(main)blocks.push({text:main,family:'"'+SHARE_TEXT+'", Georgia, serif',weight:400,min:40,max:Math.round((explanation?58:68)*scale),leading:1.3,gap:contentLabel?16:36,color:'#FFFFFF'});
  if(explanation)blocks.push({text:explanation,family:'"'+SHARE_TEXT+'", Georgia, serif',weight:400,min:30,max:34,leading:1.4,gap:40,color:'#F3EBDD'});
  const fitted=fitShareBlocks(c,blocks,maxWidth,textSpace);
  let y=baseTop+Math.max(0,(textSpace-fitted.height)*(explanation ? .12 : .24));
  for(const b of fitted.blocks){
   y+=b.gap;c.fillStyle=b.color;c.font=b.font;
   for(const line of b.lines){c.fillText(line,margin,y);y+=b.size*b.leading;}
  }
  // No explanation block or reserved gap exists when the input is empty.
  c.strokeStyle='#BE9270';c.lineWidth=2;c.beginPath();c.moveTo(margin,footerY);c.lineTo(right,footerY);c.stroke();
  c.fillStyle='#FFFFFF';c.font='700 30px "'+SHARE_TEXT+'", Georgia, serif';
  author.forEach((line,i)=>c.fillText(line,margin,footerY+24+i*40));
  if(date){c.fillStyle='#F3EBDD';c.font='400 26px "'+SHARE_TEXT+'", Georgia, serif';c.fillText(date,margin,footerY+24+authorHeight+14);}
  return canvas;
 }

 function renderCard(p,options,assets){
  if(p.kind==='take')return renderTakeCard(p,options,assets);
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
  if(!dialog){dialog=make('dialog',null,'cam-pick-share-dialog');dialog.id='camPickShareDialog';dialog.setAttribute('aria-labelledby','camPickShareTitle');document.body.append(dialog);dialog.addEventListener('close',()=>{if(dialog.open)return;request++;release();restoreFocus?.focus?.({preventScroll:true});});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});}
  dialog.classList.toggle('cam-take-share-dialog',p.kind==='take');
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
  const defaults=()=>({mode:p.body&&!sameTakeText(p.body,p.title)?'fragment':'title',size:'feed',showDate:true,fragment:0,textSize:'auto',explanation:''});
  let takeOptions=defaults();
  let editor=null,modeSelect=null,fragmentLabel=null,fragmentSelect=null,sizeSelect=null,dateToggle=null,textSizeSelect=null,selectionNote=null,shareButton=null,explanationInput=null,explanationCount=null,sizeNote=null;
  if(p.kind==='take'){
   editor=make('section',null,'cam-take-share-editor');editor.setAttribute('aria-label','Personalizar la ficha del Take');
   const title=make('strong','Personaliza tu ficha','cam-take-share-editor-title');editor.append(title);
   const field=(name,control)=>{const label=make('label',name,'cam-take-share-field');label.append(control);editor.append(label);return label;};
   modeSelect=make('select');for(const [value,name] of [['title','Solo título'],['summary','Con resumen'],['fragment','Título y Take']]){const option=make('option',name);option.value=value;modeSelect.append(option);}modeSelect.value=takeOptions.mode;
   field('Contenido de la ficha',modeSelect);
   fragmentSelect=make('select');const pieces=takeFragments(p.body);
   pieces.forEach((piece,i)=>{const option=make('option','Fragmento '+(i+1)+' de '+pieces.length);option.value=String(i);fragmentSelect.append(option);});
   fragmentLabel=field('Fragmento del texto original',fragmentSelect);fragmentLabel.classList.add('cam-take-share-fragment');fragmentLabel.hidden=takeOptions.mode!=='fragment'||pieces.length<2;
   selectionNote=make('p','','cam-take-share-selection');selectionNote.hidden=true;editor.append(selectionNote);
   if(!pieces.length){modeSelect.querySelector('option[value="summary"]').disabled=true;modeSelect.querySelector('option[value="fragment"]').disabled=true;}
   sizeSelect=make('select');for(const [value,name] of [['feed','Publicación 4:5'],['story','Historia 9:16'],['square','Cuadrada 1:1']]){const option=make('option',name);option.value=value;sizeSelect.append(option);}
   sizeNote=make('span','1080 × 1350 px','cam-take-share-explanation-hint');field('Formato',sizeSelect).append(sizeNote);
   textSizeSelect=make('select');for(const [value,name] of [['auto','Automático'],['compact','Pequeño'],['large','Grande']]){const option=make('option',name);option.value=value;textSizeSelect.append(option);}
   field('Tamaño del texto',textSizeSelect);
   explanationInput=make('textarea');explanationInput.rows=3;explanationInput.maxLength=240;explanationInput.className='cam-take-share-explanation';
   explanationInput.setAttribute('aria-describedby','camTakeShareExplanationHint camTakeShareExplanationCount');
   const explanationLabel=field('Tu explicación (opcional)',explanationInput);explanationLabel.classList.add('cam-take-share-explanation-field');
   const explanationHint=make('span','Solo aparece en esta ficha. Tu Take original se conserva.','cam-take-share-explanation-hint');explanationHint.id='camTakeShareExplanationHint';
   explanationCount=make('span','0 / 240','cam-take-share-explanation-count');explanationCount.id='camTakeShareExplanationCount';
   explanationLabel.append(explanationHint,explanationCount);
   const dateLabel=make('label',null,'cam-take-share-checkbox');dateToggle=make('input');dateToggle.type='checkbox';dateToggle.checked=true;dateLabel.append(dateToggle,make('span','Mostrar fecha'));editor.append(dateLabel);
   const reset=make('button','Restablecer diseño','cam-take-share-reset');reset.type='button';editor.append(reset);
   content.prepend(editor);
   modeSelect.onchange=()=>{takeOptions.mode=modeSelect.value;fragmentLabel.hidden=modeSelect.value!=='fragment'||pieces.length<2;refresh();};
   fragmentSelect.onchange=()=>{takeOptions.fragment=Number(fragmentSelect.value)||0;refresh();};
   sizeSelect.onchange=()=>{takeOptions.size=sizeSelect.value;sizeNote.textContent='1080 × '+({story:1920,square:1080}[sizeSelect.value]||1350)+' px';refresh();};
   dateToggle.onchange=()=>{takeOptions.showDate=dateToggle.checked;refresh();};
   textSizeSelect.onchange=()=>{takeOptions.textSize=textSizeSelect.value;refresh();};
   explanationInput.oninput=()=>{takeOptions.explanation=explanationInput.value.slice(0,240);explanationCount.textContent=takeOptions.explanation.length+' / 240';refresh();};
   reset.onclick=()=>{takeOptions=defaults();modeSelect.value=takeOptions.mode;fragmentSelect.value='0';fragmentLabel.hidden=takeOptions.mode!=='fragment'||pieces.length<2;sizeSelect.value='feed';sizeNote.textContent='1080 × 1350 px';textSizeSelect.value='auto';dateToggle.checked=true;explanationInput.value='';explanationCount.textContent='0 / 240';refresh();};
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
   const current=++generation;file=null;ready();download.hidden=true;download.removeAttribute('href');
   if(selectionNote){const pieces=takeFragments(p.body);selectionNote.hidden=takeOptions.mode==='title'||takeOptions.mode==='fragment'&&pieces.length<2;selectionNote.textContent=takeOptions.mode==='summary'?'Resumen extractivo automático: selección de frases del Take, sin texto añadido.':'Fragmento '+(takeOptions.fragment+1)+' de '+pieces.length+'. '+(pieces[takeOptions.fragment]||'');}
   if(!preview.querySelector('img'))preview.replaceChildren(make('p','Preparando tarjeta…'));preview.setAttribute('aria-busy','true');status.textContent='';
   const failed=error=>{if(ticket!==request||current!==generation||!dialog.open)return;release();preview.replaceChildren(make('p',error.message));preview.setAttribute('aria-busy','false');status.textContent=error.message;};
   const draw=assets=>{if(ticket!==request||current!==generation||!dialog.open)return;try{
    const canvas=renderCard(p,takeOptions,assets);
    canvas.toBlob(blob=>{
     if(ticket!==request||current!==generation||!dialog.open)return;
     if(!blob){failed(Error('No se pudo preparar la imagen. Puedes copiar el texto o el enlace.'));return;}
     release();
     resource=URL.createObjectURL(blob);const img=make('img');img.src=resource;img.alt='Ficha para compartir: '+p.title+' · '+p.author;img.width=canvas.width;img.height=canvas.height;
     preview.replaceChildren(img);preview.setAttribute('aria-busy','false');
     file=new File([blob],download.download,{type:'image/png'});download.href=resource;download.hidden=false;ready();
    },'image/png');
   }catch(error){failed(error);}};
   if(p.kind==='take')prepareTakeAssets().then(draw).catch(failed);else draw();
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
