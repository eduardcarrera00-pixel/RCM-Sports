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
  const separator=weekly?/\n+|;\s*|\s+[|•]\s+|\s+\+\s+(?!\d)/:/\n+|;\s*|\s+[|]\s+|\s+\+\s+(?!\d)|\s+\/\s+(?=\d+[.)]\s)/;
  const legs=raw.flatMap(l=>String(l?.selection||'').replace(/\\n/g,'\n').split(separator).map(selection=>({
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
   result:{won:'Pick acertado',lost:'Pick revisado · No acertado',void:'Pick anulado'}[state]||'Pendiente de resultado',
   state:['won','lost','void'].includes(state)?state:'pending',
   verified:!weekly&&p.moderation_status==='approved'&&odds(p.american_odds)!=='—',
   review:!weekly&&p.moderation_status!=='approved'?(p.moderation_status==='rejected'?'Cuota rechazada':'Cuota en revisión'):'',legs};
 }
 function urlFor(p){const u=new URL(BASE);if(p.kind==='take')u.searchParams.set('t',pack(p.author_id)+'.'+pack(p.id));else u.searchParams.set(p.kind==='weekly'?(p.state==='pending'?'e':'r'):'p',pack(p.id));return u.href;}
 const headline=p=>(p.kind==='take'?'Take de '+p.author:p.kind==='weekly'?'Pick del editor':'Pick de '+p.author)+' · CAM SPORTS';
 const quota=p=>p.verified?'Cuota verificada · '+p.odds:'Cuota '+p.odds+(p.review?' · '+p.review:p.kind==='weekly'?' · Editorial':'');
 const invitation=p=>p.kind==='take'?'¿De acuerdo o tienes otra lectura?':p.state==='won'?'Aquí lo que se canta, se baila.':p.state==='lost'?'También se da la cara cuando no sale.':p.state==='void'?'Este no cuenta en el marcador.':'Sobre la mesa. ¿Lo sigues o lo debates?';
 function caption(p){if(p.kind==='take')return [headline(p),p.title,p.body,urlFor(p)].filter(Boolean).join('\n\n');return [headline(p),p.result,p.title,...p.legs.map(l=>[l.event,l.selection].filter(Boolean).join(' · ')),quota(p),invitation(p),urlFor(p)].filter(Boolean).join('\n\n');}
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
 // Take cards intentionally use the same «La cita» layout in both site themes.
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
 // It is always whole, verbatim sentences of the author (never generated text)
 // and the card labels it as a summary. Short enough to read at a glance: the
 // first sentence, plus the second only while both stay within 200 characters.
 const takeSummary=body=>{
  const first=takeFragments(body)[0]||'';
  const ends=[...first.matchAll(/[.!?](?:["”’»])?(?=\s|$)/g)].map(m=>m.index+m[0].length);
  if(!ends.length)return first;
  const end=ends.length>1&&ends[1]<=200?ends[1]:ends[0];
  return first.slice(0,end);
 };
 let takeFonts=null;
 function prepareTakeFonts(){
  if(!document.fonts?.load)return null;
  if(!takeFonts)takeFonts=Promise.all([
   document.fonts.load('600 80px "Playfair Display"'),
   document.fonts.load('italic 600 80px "Playfair Display"'),
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
 // «La cita»: the Take as a centred quotation on CAM night blue, identical in
 // both site themes. Logo on top, link at the foot, everything else centred
 // between them. Title and text are the author's own words, never rewritten.
 // Each format keeps logo and text inside the area its network leaves visible
 // (left, right, top = logo top, link = link baseline); the blue still reaches
 // every edge. Instagram Stories cover ~250 px at the top and bottom. TikTok
 // covers its tabs at the top, the caption and sound at the bottom (~660 px)
 // and the action column on the right (180 px), so its text sits higher and
 // narrower but still centred. The feed post is 4:5 and the profile grid trims
 // it to 3:4 (~34 px per side), well outside the margins.
 const TAKE_FORMATS=[
  ['story','Historia','Instagram · 9:16'],
  ['tiktok','TikTok','Vertical · 9:16'],
  ['post','Publicación','Feed de Instagram · 4:5'],
  ['card','X','Horizontal · 16:9']
 ];
 const TAKE_FILE={story:'historia',tiktok:'tiktok',post:'publicacion',card:'x'};
 const TAKE_CARD={
  bg:'#0B2233',ink:'#F3EBDD',muted:'#C2CDD4',gold:'#BE9270',label:'#B79A76',line:'#2E4A5E',
  story:{h:1920,left:96,right:984,top:290,link:1630,ruleGap:62,logoW:220,logoGap:76,foot:64,quote:260,title:128,grow:148,extra:40,author:38,meta:24,linkFont:26,mark:84},
  tiktok:{h:1920,left:180,right:900,top:262,link:1254,ruleGap:56,logoW:190,logoGap:56,foot:54,quote:230,title:112,grow:124,extra:37,author:35,meta:23,linkFont:25,mark:76},
  post:{h:1350,left:96,right:984,top:78,link:1296,ruleGap:50,logoW:168,logoGap:48,foot:46,quote:200,title:102,grow:124,extra:34,author:32,meta:21,linkFont:22,mark:68},
  card:{h:608,left:84,right:996,top:38,link:-34,ruleGap:40,logoW:112,logoGap:22,foot:24,quote:140,title:76,extra:27,author:27,meta:16,linkFont:17,mark:56}
 };
 const takeSize=value=>TAKE_FORMATS.some(([size])=>size===value)?value:'card';
 // Phones usually share to Instagram or TikTok; computers more often to X.
 const takeDefaultSize=()=>{try{return matchMedia('(max-width: 760px), (hover: none) and (pointer: coarse)').matches?'story':'card';}catch{return 'card';}};
 // Same words and order as wrap(), with the narrowest width that keeps the line
 // count: centred lines look even instead of one long line over a short one.
 function balancedWrap(ctx,value,width){
  const lines=wrap(ctx,value,width,Infinity);if(lines.length<2)return lines;
  const widest=Math.max(...clean(value,10000).split(' ').map(word=>ctx.measureText(word).width));
  if(widest>=width)return lines;
  let lo=Math.max(widest,width*.5),hi=width;
  if(wrap(ctx,value,lo,Infinity).length===lines.length)return wrap(ctx,value,lo,Infinity);
  for(let i=0;i<14&&hi-lo>1;i++){const mid=(lo+hi)/2;if(wrap(ctx,value,mid,Infinity).length===lines.length)hi=mid;else lo=mid;}
  return wrap(ctx,value,hi,Infinity);
 }
 function renderTakeCard(p,options={}){
  const size=takeSize(options.size),w=1080;
  const mode=options.mode||'title',extra=mode==='summary'?takeSummary(p.body):mode==='fragment'?takeFragments(p.body)[options.fragment||0]||'':'';
  // Horizontal is 16:9 for X; a card with text needs a little more height.
  const T=TAKE_CARD,L=T[size],h=size==='card'&&extra?760:L.h;
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');if(!c)throw Error('Este navegador no permite generar la imagen. Prueba descargarla desde otro navegador.');
  // Opaque colour reaches every edge, including the corners. Transparent
  // padding could be flattened to white by a receiving social application.
  const cx=(L.left+L.right)/2,maxWidth=L.right-L.left;
  c.fillStyle=T.bg;c.fillRect(0,0,w,h);
  if(!takeLogo)throw Error('El logo oficial todavía no está listo.');
  const logoH=L.logoW*takeLogo.naturalHeight/takeLogo.naturalWidth;
  c.drawImage(takeLogo,cx-L.logoW/2,L.top,L.logoW,logoH);
  const linkY=L.link<0?h+L.link:L.link,ruleY=linkY-L.ruleGap;
  const top=L.top+logoH+L.logoGap,space=ruleY-L.foot-top;
  const spacing=(px,em)=>{try{c.letterSpacing=Math.round(px*em*10)/10+'px';}catch{}};
  const centre=(text,y)=>{c.textAlign='left';c.fillText(text,Math.round(cx-c.measureText(text).width/2),y);};
  const titleFont=size=>'italic 600 '+size+'px "Playfair Display", Georgia, serif';
  const quoteFont=size=>'600 '+size+'px "Playfair Display", Georgia, serif';
  const textFont=size=>'400 '+size+'px "Libre Baskerville", Georgia, serif';
  const nameFont=size=>'700 '+size+'px "Libre Baskerville", Georgia, serif';
  const metaFont=size=>'600 '+size+'px Arial, sans-serif';
  const username=p.author.replace(/^@/,'')||'Aficionado';
  const date=options.showDate===false||!p.date?'':p.date.split('-').reverse().join('/');
  const prefix=('Take · '+(p.competition||'Deportes')).toLocaleUpperCase('es');
  const label=mode==='summary'?'RESUMEN DEL TAKE':'FRAGMENTO ORIGINAL';
  const scale={compact:.86,large:1.14}[options.textSize]||1;
  // Prefer a slightly smaller title when it saves a line: «Lamine Yamal /
  // Balón de Oro 2026» reads better than three short broken lines.
  const titleWidth=size=>maxWidth-Math.round(size*.25);
  // On tall formats a short Take may grow (up to L.grow) while the whole block
  // stays within ~72 % of its space: a poster, not a small block lost in blue.
  const base=Math.round(L.title*scale);let start=Math.round((L.grow||L.title)*scale);
  {c.font=titleFont(start);let count=wrap(c,p.title,titleWidth(start),Infinity).length,best=start;
   for(let size=start-1;size>=Math.round(start*.85);size--){c.font=titleFont(size);const n=wrap(c,p.title,titleWidth(size),Infinity).length;if(n<count){count=n;best=size;}}
   start=best;}
  let fit=null;
  for(let title=start;title>=22;title--){
   const k=title/L.title,quote=Math.max(56,Math.round(L.quote*Math.min(1,k)));
   const extraSize=Math.max(20,Math.min(L.extra,Math.round(title*.42))),author=Math.max(20,Math.min(L.author,Math.round(title*.4))),meta=Math.max(14,Math.min(L.meta,Math.round(title*.26)));
   c.font=quoteFont(quote);const qm=c.measureText('“');
   const ascent=Number.isFinite(qm.actualBoundingBoxAscent)&&qm.actualBoundingBoxAscent>0?qm.actualBoundingBoxAscent:quote*.72;
   const descent=Number.isFinite(qm.actualBoundingBoxDescent)?qm.actualBoundingBoxDescent:-quote*.4;
   const quoteH=Math.max(quote*.2,ascent+descent);
   // Italic capitals lean past their measured width: leave them room.
   c.font=titleFont(title);const titleLines=balancedWrap(c,p.title,titleWidth(title));
   c.font=textFont(extraSize);const extraLines=extra?balancedWrap(c,extra,Math.min(maxWidth,860)):[];
   c.font=nameFont(author);const authorLines=wrap(c,username,maxWidth,Infinity);
   // Keep the date as its own piece of text; break the line only if needed.
   c.font=metaFont(meta);spacing(meta,.18);
   const oneLine=c.measureText(prefix+(date?' · '+date:'')).width<=maxWidth;
   const metaLines=oneLine?[[prefix+(date?' · ':''),date]]:[...wrap(c,prefix,maxWidth,Infinity).map(t=>[t,'']),...(date?[['',date]]:[])];
   spacing(meta,0);
   const gap=Math.round(title*.34),titleLead=title*1.12,extraLead=extraSize*1.55;
   const block=quoteH+gap+titleLines.length*titleLead
    +(extra?gap*1.2+meta+meta*.9+extraLines.length*extraLead:0)
    +gap*1.4+2+gap*.8+authorLines.length*author*1.3+meta*.7+metaLines.length*meta*1.6;
   fit={title,quote,extraSize,author,meta,ascent,quoteH,titleLines,extraLines,authorLines,metaLines,gap,titleLead,extraLead,block};
   if(block<=(title>base?space*.72:space))break;
  }
  if(!fit||fit.block>space)throw Error('Este texto necesita más espacio. Elige otro fragmento o la Historia de Instagram.');
  const F=fit;let y=top+(space-F.block)/2;
  c.fillStyle=T.gold;c.font=quoteFont(F.quote);centre('“',y+F.ascent);y+=F.quoteH+F.gap;
  c.fillStyle=T.ink;c.font=titleFont(F.title);
  for(const line of F.titleLines){centre(line,y+F.title*.9);y+=F.titleLead;}
  if(extra){
   y+=F.gap*1.2;c.fillStyle=T.label;c.font=metaFont(F.meta);spacing(F.meta,.18);centre(label,y+F.meta);spacing(F.meta,0);y+=F.meta+F.meta*.9;
   c.fillStyle=T.muted;c.font=textFont(F.extraSize);
   for(const line of F.extraLines){centre(line,y+F.extraSize*1.12);y+=F.extraLead;}
  }
  y+=F.gap*1.4;c.fillStyle=T.gold;c.fillRect(Math.round(cx-L.mark/2),Math.round(y),L.mark,2);y+=2+F.gap*.8;
  c.fillStyle=T.ink;c.font=nameFont(F.author);
  for(const line of F.authorLines){centre(line,y+F.author*.95);y+=F.author*1.3;}
  y+=F.meta*.7;c.fillStyle=T.label;c.font=metaFont(F.meta);spacing(F.meta,.18);
  for(const [text,day] of F.metaLines){
   const a=text?c.measureText(text).width:0,b=day?c.measureText(day).width:0,x=Math.round(cx-(a+b)/2);
   c.textAlign='left';if(text)c.fillText(text,x,y+F.meta);if(day)c.fillText(day,x+a,y+F.meta);y+=F.meta*1.6;
  }
  spacing(F.meta,0);
  c.fillStyle=T.line;c.fillRect(L.left,ruleY,maxWidth,2);
  c.fillStyle=T.muted;c.font=metaFont(L.linkFont);spacing(L.linkFont,.08);centre('camsports.github.io',linkY);spacing(L.linkFont,0);
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
  const content=make('div',null,'cam-pick-share-content');
  // Where it will be shared decides the format: each network gets its own
  // canvas and safe area, so a story fills the screen instead of a strip.
  const destinations=make('div',null,'cam-take-share-destinations');destinations.setAttribute('role','group');destinations.setAttribute('aria-labelledby','camTakeShareWhere');
  const where=make('p','¿Dónde lo vas a compartir?','cam-take-share-destinations-title');where.id='camTakeShareWhere';
  const choices=make('div',null,'cam-take-share-destination-grid');destinations.append(where,choices);
  const destinationButtons=TAKE_FORMATS.map(([value,name,detail])=>{
   const b=make('button',null,'cam-take-share-destination');b.type='button';b.dataset.size=value;b.setAttribute('aria-pressed','false');
   b.append(make('span',name),make('small',detail));choices.append(b);return b;
  });
  const hint=make('p','Pulsa «Compartir imagen» y elige la app en el menú del teléfono. Si no recibe la imagen, descárgala y adjúntala; el enlace se copia aparte.','cam-pick-share-hint');
  const status=make('p','', 'cam-pick-share-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const download=make('a','Descargar imagen','cam-pick-share-download');download.hidden=true;
  const linkButton=make('button','Copiar enlace'),textButton=make('button','Copiar texto');linkButton.type=textButton.type='button';
  linkButton.onclick=()=>copy(urlFor(p),status,'Enlace copiado.');textButton.onclick=()=>copy(caption(p),status,'Texto y enlace copiados.');
  const utilities=make('div',null,'cam-pick-share-utilities');utilities.append(download,linkButton);
  const label=make('label','Texto para tu publicación','cam-pick-share-caption-label');const text=make('textarea');text.value=caption(p);text.readOnly=true;text.rows=5;text.setAttribute('aria-label','Texto y enlace de la publicación');label.append(text);
  // «La cita» shows the author's first words under the title when the Take has text.
  const withText=takeFragments(p.body).length>0,initialSize=takeDefaultSize();
  const defaults=()=>({mode:withText?'summary':'title',size:initialSize,showDate:true,fragment:0,textSize:'auto'});
  let takeOptions=defaults();
  const editor=make('section',null,'cam-take-share-editor');editor.setAttribute('aria-label','Personalizar la ficha del Take');
  editor.append(make('strong','Personaliza tu ficha','cam-take-share-editor-title'));
  const field=(name,control)=>{const label=make('label',name,'cam-take-share-field');label.append(control);editor.append(label);return label;};
  const modeSelect=make('select');for(const [value,name] of [['title','Solo título'],['summary','Con resumen'],['fragment','Con fragmento']]){const option=make('option',name);option.value=value;modeSelect.append(option);}
  field('Contenido de la ficha',modeSelect);
  const textSizeSelect=make('select');for(const [value,name] of [['auto','Automático'],['compact','Pequeño'],['large','Grande']]){const option=make('option',name);option.value=value;textSizeSelect.append(option);}
  field('Tamaño del texto',textSizeSelect);
  const fragmentSelect=make('select'),pieces=takeFragments(p.body);
  pieces.forEach((piece,i)=>{const option=make('option','Fragmento '+(i+1)+': '+piece.slice(0,44)+(piece.length>44?'…':''));option.value=String(i);fragmentSelect.append(option);});
  const fragmentLabel=field('Fragmento del texto original',fragmentSelect);fragmentLabel.classList.add('cam-take-share-fragment');fragmentLabel.hidden=true;
  const selectionNote=make('p','','cam-take-share-selection');selectionNote.hidden=true;editor.append(selectionNote);
  if(!pieces.length){modeSelect.querySelector('option[value="summary"]').disabled=true;modeSelect.querySelector('option[value="fragment"]').disabled=true;}
  modeSelect.value=takeOptions.mode;
  const dateLabel=make('label',null,'cam-take-share-checkbox'),dateToggle=make('input');dateToggle.type='checkbox';dateToggle.checked=true;dateLabel.append(dateToggle,make('span','Mostrar fecha'));editor.append(dateLabel);
  const reset=make('button','Restablecer diseño','cam-take-share-reset');reset.type='button';editor.append(reset);
  const syncDestination=()=>destinationButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.size===takeOptions.size)));
  destinationButtons.forEach(b=>b.onclick=()=>{if(takeOptions.size===b.dataset.size)return;takeOptions.size=b.dataset.size;syncDestination();refresh();});
  modeSelect.onchange=()=>{takeOptions.mode=modeSelect.value;fragmentLabel.hidden=modeSelect.value!=='fragment';refresh();};
  fragmentSelect.onchange=()=>{takeOptions.fragment=Number(fragmentSelect.value)||0;refresh();};
  dateToggle.onchange=()=>{takeOptions.showDate=dateToggle.checked;refresh();};
  textSizeSelect.onchange=()=>{takeOptions.textSize=textSizeSelect.value;refresh();};
  reset.onclick=()=>{takeOptions=defaults();modeSelect.value=takeOptions.mode;fragmentSelect.value='0';fragmentLabel.hidden=true;textSizeSelect.value='auto';dateToggle.checked=true;syncDestination();refresh();};
  syncDestination();
  const details=make('details',null,'cam-take-share-caption');details.append(make('summary','Texto y enlace del Take'),label,textButton);
  content.append(destinations,editor,hint,details);layout.append(preview,content);
  const shareButton=make('button','Compartir imagen','cam-take-share-primary');shareButton.type='button';shareButton.disabled=true;utilities.prepend(shareButton);
  const bar=make('div',null,'cam-take-share-bar');bar.append(utilities,status);dialog.replaceChildren(top,intro,layout,bar);
  if(!dialog.open)dialog.showModal();exit.focus({preventScroll:true});dialog.scrollTop=0;

  let file=null,generation=0,imageOnly=false,sharingPending=false;
  const ready=()=>{shareButton.disabled=!file||sharingPending;};
  function nativeShare(){
   if(!file||sharingPending)return;
   let fileSharing=false;try{fileSharing=typeof navigator.share==='function'&&Boolean(navigator.canShare?.({files:[file]}));}catch{}
   if(fileSharing){
    let sharing;const current=generation;
    let data={files:[file],title:headline(p),text:p.title,url:urlFor(p)};
    // Instagram and TikTok often filter out combined text/file shares. Hand
    // them the image; the separate copy action retains the original permalink.
    let combined=false;try{combined=navigator.canShare(data);}catch{}
    if(imageOnly||takeOptions.size!=='card'||!combined)data={files:[file]};
    // Keep the native share invocation within the user's tap (iOS activation).
    const failure=e=>{
     if(ticket!==request||current!==generation)return;
     if(e?.name==='AbortError'){status.textContent='Puedes volver a compartir cuando quieras.';return;}
     if(data.text){imageOnly=true;shareButton.textContent='Compartir solo imagen';status.textContent='No se pudo enviar la imagen con el enlace. Pulsa «Compartir solo imagen» o descarga el PNG.';}
     else status.textContent='Descarga la imagen y adjúntala en la aplicación. También puedes copiar el enlace.';
    };
    try{sharing=navigator.share(data);}catch(e){failure(e);return;}
    sharingPending=true;ready();
    Promise.resolve(sharing).then(()=>{if(ticket===request&&current===generation)status.textContent='Imagen entregada al menú de compartir. Completa la publicación en la aplicación elegida.';})
    .catch(failure).finally(()=>{sharingPending=false;if(ticket===request)ready();});
   }else status.textContent='Descarga la imagen; tu navegador no permite enviarla directamente. Adjúntala en la aplicación y usa «Copiar enlace» si lo necesitas.';
  }
  shareButton.onclick=nativeShare;
  function refresh(){
   const current=++generation;file=null;ready();download.hidden=true;download.removeAttribute('href');release();
   download.download='cam-sports-take-'+p.id+'-'+TAKE_FILE[takeSize(takeOptions.size)]+'.png';
   if(selectionNote){selectionNote.hidden=takeOptions.mode==='title';selectionNote.textContent=takeOptions.mode==='summary'?'Resumen extractivo automático: selección de frases del Take, sin texto añadido.':takeFragments(p.body)[takeOptions.fragment]||'';}
   preview.replaceChildren(make('p','Preparando tarjeta…'));preview.setAttribute('aria-busy','true');status.textContent='';
   const draw=()=>{if(ticket!==request||current!==generation||!dialog.open)return;try{
    const canvas=renderCard(p,takeOptions);
    canvas.toBlob(blob=>{
     if(ticket!==request||current!==generation||!dialog.open)return;
     if(!blob){preview.replaceChildren(make('p','No se pudo preparar la imagen. Puedes copiar el texto o el enlace.'));preview.setAttribute('aria-busy','false');return;}
     resource=URL.createObjectURL(blob);const img=make('img');img.src=resource;img.alt='Ficha para compartir ('+TAKE_FORMATS.find(([size])=>size===takeSize(takeOptions.size)).slice(1).join(', ')+'): '+p.title+' · '+p.author;img.width=canvas.width;img.height=canvas.height;
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
 // Confirmed settlement and moderation are separate: a review check never
 // marks a lost or pending Pick as a win.
 const pickStatus=p=>({pending:'◷ Pendiente de resultado',won:'✓ Acertado',lost:'✓ Revisado · No acertado',void:'— Anulado'}[p.state]);
 function pickColumns(leg){
  const parts=leg.selection.split(/\s+[·•]\s+/),original=parts.shift();
  let choice=original,market=[...parts,leg.market,leg.line&&!leg.selection.includes(leg.line)?'Línea '+leg.line:''].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');
  // Translate only explicit, recognized labels; never infer a missing market,
  // change a line, or write the readable presentation back to the saved Pick.
  if(/^MONEYLINE\s*\(?(?:3[- ]WAY|3 VIAS)\)?$/i.test(market))market='Ganador · 3 vías';
  else if(/^MONEYLINE$/i.test(market))market='Ganador';
  else if(/^BOTH TEAMS TO SCORE$/i.test(market)){market='Ambos equipos marcan';if(/^YES$/i.test(choice))choice='Sí';else if(/^NO$/i.test(choice))choice='No';}
  else if(/^OVER\/UNDER(?:\s+\d+(?:[.,]\d+)?\s+GOALS?)?$/i.test(market)){
   const match=choice.match(/^(Over|Under)\s+(\d+(?:[.,]\d+)?)\s+Goals?$/i);
   if(match){market='Total de goles';choice=(/^over$/i.test(match[1])?'Más de ':'Menos de ')+match[2];}
  }
  return {market:market||'Selección',choice};
 }
 // Stories have their own stacked composition and readable type scale. They
 // are not a compact table centred on an otherwise empty portrait canvas.
 function pickStoryPages(p,options){
  const measure=document.createElement('canvas').getContext('2d');if(!measure)throw Error('Este navegador no permite generar imágenes.');
  const wrapAt=(text,font,width=808)=>{measure.font=font;return wrap(measure,text,width,Infinity);};
  const events=[...new Set(p.legs.map(l=>l.event).filter(Boolean))],common=events.length===1&&p.legs.every(l=>l.event===events[0])?events[0]:'';
  const sport=wrapAt(p.competition||'PICKS','400 28px Arial, sans-serif',888);
  const title=wrapAt(common||p.title,'600 64px "Playfair Display", Georgia, serif',888);
  const titleY=420+sport.length*36,top=titleY+(title.length-1)*76+62;
  const author=wrapAt('Por '+p.author,'600 32px Arial, sans-serif',888),footer=1324-(author.length-1)*38,capacity=footer-48-top;
  if(capacity<180)throw Error('El encabezado es demasiado largo para una historia. Acorta el título del Pick antes de compartirlo.');
  const choiceSize=p.legs.length===1?84:p.legs.length===2?64:p.legs.length===3?56:48;
  const entries=[];
  function addLines(lines,analysis=false){
   let content=[],height=64;
   const flush=()=>{if(content.length)entries.push({lines:content,height,analysis});content=[];height=64;};
   for(const line of lines){if(height+line.step>capacity)flush();content.push(line);height+=line.step;}
   flush();
  }
  for(const leg of p.legs){
   const values=pickColumns(leg),lines=[];
   const add=(value,font,step,muted)=>wrapAt(value,font).forEach(text=>lines.push({text,font,step,muted}));
   if(!common&&leg.event)add(leg.event,'600 28px Arial, sans-serif',36,true);
   add(values.market,'400 26px Arial, sans-serif',34,true);
   add(values.choice,'600 '+choiceSize+'px Arial, sans-serif',choiceSize+12,false);
   addLines(lines);
  }
  if(options.showAnalysis&&p.analysis){
   const fragment=takeFragments(p.analysis)[options.fragments[pickKey(p)]||0]||'';
   addLines([
    {text:'ANÁLISIS · FRAGMENTO ORIGINAL',font:'600 24px Arial, sans-serif',step:34,muted:true},
    ...wrapAt(fragment,'400 30px Arial, sans-serif').map(text=>({text,font:'400 30px Arial, sans-serif',step:42,muted:false}))
   ],true);
  }
  const pages=[];let rows=[],used=0;
  const flush=()=>{if(rows.length)pages.push(rows);rows=[];used=0;};
  for(const entry of entries){if(used&&used+entry.height+18>capacity)flush();if(rows.length)used+=18;rows.push(entry);used+=entry.height;}
  flush();return pages.map((rows,index)=>({p,w:1080,h:1920,story:true,sport,title,titleY,top,footer,author,rows,index,total:pages.length}));
 }
 function renderPickStoryPage(page,options,position,count){
  const {p,sport,title,titleY,top,footer,author,rows}=page,canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
  const c=canvas.getContext('2d');if(!c||!takeLogo)throw Error('No se pudo preparar la ficha con el logo oficial.');
  const left=96,right=984,width=888;
  c.fillStyle='#073B83';c.fillRect(0,0,1080,1920);
  c.drawImage(takeLogo,right-156,282,156,156*takeLogo.naturalHeight/takeLogo.naturalWidth);
  c.fillStyle='#fff';c.font='600 28px Arial, sans-serif';c.fillText(p.legs.length>1?'COMBINADA · '+p.legs.length+' SELECCIONES':p.kind==='weekly'?'PICK DEL EDITOR':'PICK INDIVIDUAL',left,308);
  c.fillStyle='#B8CAE0';c.font='400 28px Arial, sans-serif';sport.forEach((line,i)=>c.fillText(line,left,382+i*36));
  c.fillStyle='#fff';c.font='600 64px "Playfair Display", Georgia, serif';title.forEach((line,i)=>c.fillText(line,left,titleY+i*76));
  const rule=at=>{c.strokeStyle='#BE9270';c.lineWidth=2;c.beginPath();c.moveTo(left,at);c.lineTo(right,at);c.stroke();};
  const capacity=footer-48-top,used=rows.reduce((n,r)=>n+r.height,0)+Math.max(0,rows.length-1)*18;
  const extra=Math.min(rows.length===1?180:56,Math.max(0,(capacity-used)/rows.length));
  let y=top+Math.max(0,(capacity-used-extra*rows.length)/2);
  for(const row of rows){
   const height=row.height+extra;c.fillStyle='#0A3470';
   if(c.roundRect){c.beginPath();c.roundRect(left,y,width,height,24);c.fill();}else c.fillRect(left,y,width,height);
   c.fillStyle='#BE9270';c.fillRect(left,y+28,4,height-56);
   let baseline=y+32+extra/2;
   for(const line of row.lines){baseline+=line.step;c.fillStyle=line.muted?'#B8CAE0':'#fff';c.font=line.font;c.fillText(line.text,left+40,baseline-8);}
   y+=height+18;
  }
  rule(footer);
  const hasOdds=options.showOdds&&p.odds!=='—';
  if(hasOdds){
   c.fillStyle='#B8CAE0';c.font='600 24px Arial, sans-serif';c.fillText(p.legs.length>1?'CUOTA TOTAL':'CUOTA',left,footer+38);
   let size=84;for(;size>28;size--){c.font='600 '+size+'px Arial, sans-serif';if(c.measureText(p.odds).width<=400)break;}
   c.fillStyle='#fff';c.fillText(p.odds,left,footer+130);
   if(p.review){c.fillStyle='#B8CAE0';c.font='400 23px Arial, sans-serif';c.fillText(p.review,left,footer+166);}
  }
  c.font='600 28px Arial, sans-serif';c.fillStyle=p.state==='lost'?'#F3C6A2':'#fff';
  wrap(c,pickStatus(p),hasOdds?440:width,Infinity).forEach((line,i)=>c.fillText(line,hasOdds?544:left,footer+82+i*36));
  c.fillStyle='#fff';c.font='600 32px Arial, sans-serif';author.forEach((line,i)=>c.fillText(line,left,footer+204+i*38));
  const authorExtra=(author.length-1)*38;
  if(options.showDate&&p.date){c.fillStyle='#B8CAE0';c.font='400 26px Arial, sans-serif';c.fillText(p.date.split('-').reverse().join('/'),left,footer+246+authorExtra);}
  c.fillStyle='#B8CAE0';c.font='400 24px Arial, sans-serif';c.fillText('camsports.github.io',left,1610);
  if(count>1){c.textAlign='right';c.fillText('IMAGEN '+(position+1)+' / '+count,right,1610);c.textAlign='left';}
  return canvas;
 }
 function pickPages(p,options){
  if(options.size==='story')return pickStoryPages(p,options);
  const w=1080,h=options.size==='card'?700:1080;
  const measure=document.createElement('canvas').getContext('2d');if(!measure)throw Error('Este navegador no permite generar imágenes.');
  const wrapAt=(text,font,width)=>{measure.font=font;return wrap(measure,text,width,Infinity);};
  const events=[...new Set(p.legs.map(l=>l.event).filter(Boolean))],common=events.length===1&&p.legs.every(l=>l.event===events[0])?events[0]:'';
  const header=64;
  const title=wrapAt(common||p.title,'600 36px Arial, sans-serif',948);
  const sport=wrapAt(p.competition||'PICKS','400 26px Arial, sans-serif',948);
  const tableTop=header+76+sport.length*32+title.length*44+14;
  const dateVisible=options.showDate&&p.date;
  let authorFont=25;for(;authorFont>18;authorFont--){measure.font='600 '+authorFont+'px Arial, sans-serif';if(measure.measureText('Por '+p.author).width<=(dateVisible?690:948))break;}
  const authorExtra=Math.max(0,wrapAt('Por '+p.author,'600 '+authorFont+'px Arial, sans-serif',dateVisible?690:948).length-1)*20;
  const footer=h-140-authorExtra,bottom=footer-82,top=tableTop+40,capacity=bottom-top;
  if(capacity<100)throw Error('El encabezado necesita más espacio. Elige el formato vertical.');
  const entries=[];
  for(const leg of p.legs){
   const values=pickColumns(leg),left=wrapAt(values.market,'400 28px Arial, sans-serif',420),right=wrapAt(values.choice,'600 32px Arial, sans-serif',454);
   const context=common?[]:wrapAt(leg.event,'400 25px Arial, sans-serif',948);
   const total=Math.max(left.length,right.length),contextHeight=context.length*31;
   // Long entries continue as readable table rows on additional images.
   const maxLines=Math.max(1,Math.floor((capacity-contextHeight-28)/40));
   if(contextHeight+68>capacity)throw Error('Este partido necesita más espacio. Elige el formato vertical.');
   for(let i=0;i<total;i+=maxLines){const market=left.slice(i,i+maxLines),selection=right.slice(i,i+maxLines);entries.push({context,market,selection,height:contextHeight+Math.max(market.length,selection.length)*40+24});}
  }
  if(options.showAnalysis&&p.analysis){const fragment=takeFragments(p.analysis)[options.fragments[pickKey(p)]||0]||'',lines=wrapAt(fragment,'400 28px Arial, sans-serif',948),max=Math.max(1,Math.floor((capacity-70)/37));for(let i=0;i<lines.length;i+=max)entries.push({analysis:lines.slice(i,i+max),height:50+lines.slice(i,i+max).length*37});}
  const pages=[];let rows=[],used=0;
  const flush=()=>{if(rows.length){pages.push(rows);rows=[];used=0;}};
  for(const entry of entries){if(used&&used+entry.height>capacity)flush();rows.push(entry);used+=entry.height;}
  flush();return pages.map((rows,index)=>{
   const used=rows.reduce((n,r)=>n+r.height,0),compactFooter=top+used+36,shift=Math.max(0,(footer-compactFooter)/2);
   return {p,w,h,header:header+shift,title,sport,top:top+shift,tableTop:tableTop+shift,bottom:compactFooter+shift-36,footer:compactFooter+shift,rows,index,total:pages.length};
  });
 }
 function renderPickPage(page,options,position,count){
  if(page.story)return renderPickStoryPage(page,options,position,count);
  const {p,w,h,header,title,sport,top,tableTop,bottom,footer,rows}=page,canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const c=canvas.getContext('2d');if(!c||!takeLogo)throw Error('No se pudo preparar la ficha con el logo oficial.');
  const margin=66,right=1014,choiceX=560;
  c.fillStyle='#073B83';c.fillRect(0,0,w,h);
  c.drawImage(takeLogo,right-120,header-18,120,120*takeLogo.naturalHeight/takeLogo.naturalWidth);
  c.fillStyle='#fff';c.font='600 28px Arial, sans-serif';c.fillText(p.legs.length>1?'COMBINADA · '+p.legs.length+' SELECCIONES':p.kind==='weekly'?'PICK DEL EDITOR':'PICK INDIVIDUAL',margin,header+16);
  let y=header+76;c.fillStyle='#B8CAE0';c.font='400 26px Arial, sans-serif';for(const line of sport){c.fillText(line,margin,y);y+=32;}
  c.fillStyle='#fff';c.font='600 36px Arial, sans-serif';for(const line of title){c.fillText(line,margin,y+6);y+=44;}
  const rule=(at,color='#BE9270')=>{c.strokeStyle=color;c.lineWidth=1.5;c.beginPath();c.moveTo(margin,at);c.lineTo(right,at);c.stroke();};
  c.fillStyle='#B8CAE0';c.font='600 23px Arial, sans-serif';c.fillText('MERCADO',margin,tableTop);c.fillText('SELECCIÓN',choiceX,tableTop);rule(tableTop+20);
  // Square and horizontal exports retain the approved compact table.
  y=top;
  for(const row of rows){
   if(row.analysis){c.fillStyle='#B8CAE0';c.font='600 22px Arial, sans-serif';c.fillText('ANÁLISIS · FRAGMENTO ORIGINAL',margin,y+24);y+=50;c.fillStyle='#fff';c.font='400 28px Arial, sans-serif';for(const line of row.analysis){c.fillText(line,margin,y+28);y+=37;}continue;}
   c.fillStyle='#B8CAE0';c.font='400 25px Arial, sans-serif';for(const event of row.context){c.fillText(event,margin,y+25);y+=31;}
   const start=y;
   c.fillStyle='#B8CAE0';c.font='400 28px Arial, sans-serif';row.market.forEach((line,i)=>c.fillText(line,margin,start+32+i*40));
   c.fillStyle='#fff';c.font='600 32px Arial, sans-serif';row.selection.forEach((line,i)=>c.fillText(line,choiceX,start+32+i*40));
   y=start+Math.max(row.market.length,row.selection.length)*40+24;rule(y-10,'#3B6094');
  }
  rule(footer);
  c.fillStyle='#fff';c.font='600 32px Arial, sans-serif';if(options.showOdds&&p.odds!=='—')c.fillText((p.legs.length>1?'Cuota total ':'Cuota ')+p.odds,margin,footer+48);
  // Long loss/pending labels wrap within their own right-hand summary column.
  c.font='600 25px Arial, sans-serif';c.fillStyle=p.state==='lost'?'#F3C6A2':'#fff';c.textAlign='right';wrap(c,pickStatus(p),454,Infinity).forEach((line,i)=>c.fillText(line,right,footer+46+i*30));c.textAlign='left';
  if(options.showOdds&&p.review&&p.odds!=='—'){c.fillStyle='#B8CAE0';c.font='400 21px Arial, sans-serif';c.fillText(p.review,margin,footer+76);}
  const date=options.showDate&&p.date?p.date.split('-').reverse().join('/'):'';
  let font=25;for(;font>18;font--){c.font='600 '+font+'px Arial, sans-serif';if(c.measureText('Por '+p.author).width<=(date?690:948))break;}
  c.font='600 '+font+'px Arial, sans-serif';c.fillStyle='#fff';wrap(c,'Por '+p.author,date?690:948,Infinity).forEach((line,i)=>c.fillText(line,margin,footer+110+i*20));
  if(date){c.font='400 23px Arial, sans-serif';c.textAlign='right';c.fillText(date,right,footer+110);c.textAlign='left';}
  if(count>1){c.fillStyle='#B8CAE0';c.font='400 21px Arial, sans-serif';c.textAlign='right';c.fillText('IMAGEN '+(position+1)+' / '+count,right,header+84);c.textAlign='left';}
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
  const format=make('select');for(const [value,label] of [['square','Cuadrada · Publicación'],['story','Historia vertical · 9:16'],['card','Horizontal · X']]){const option=make('option',label);option.value=value;format.append(option);}
  const formatBar=make('div',null,'cam-picks-share-format'),formatNote=make('p',null,'cam-pick-share-hint');formatNote.setAttribute('aria-live','polite');formatBar.append(field('Formato',format),formatNote);
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
  const layout=make('div',null,'cam-pick-share-layout'),content=make('div',null,'cam-pick-share-content');content.append(editor,actions,hint,details);layout.append(formatBar,preview,navigation,single,content);
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
   let data={files,title:rows.length===1?headline(rows[0]):'Picks · CAM SPORTS',text:rows.map(p=>p.title+'\n'+p.result+'\n'+urlFor(p)).join('\n\n')};
   if(rows.length===1)data.url=urlFor(rows[0]);
   try{if(imageOnly||network==='Instagram'||network==='TikTok'||!navigator.canShare(data))data={files};}catch{data={files};}
   const fail=error=>{if(ticket!==request||current!==generation)return;if(error?.name==='AbortError'){status.textContent='Puedes volver a compartir cuando quieras.';return;}if(data.text){imageOnly=true;status.textContent='No se pudo enviar la imagen con el enlace. Vuelve a pulsar Compartir para enviar solo la imagen o descarga el PNG.';}else status.textContent='No se pudo enviar la imagen. Descarga el PNG y adjúntalo en la aplicación.';};
   let result;try{result=navigator.share(data);}catch(error){fail(error);return;}
   sharing=true;enabled();Promise.resolve(result).then(()=>{if(ticket===request&&current===generation)status.textContent='Imagen entregada al menú de compartir. Completa la publicación en la aplicación elegida.';}).catch(fail).finally(()=>{sharing=false;if(ticket===request)enabled();});
  }
  async function refresh(){
   formatNote.textContent=options.size==='story'?'1080 × 1920 · Para historias de Instagram, Facebook y WhatsApp.':options.size==='card'?'1080 × 700 · Para publicaciones en X.':'1080 × 1080 · Para publicaciones cuadradas.';
   const current=++generation;items=[];position=0;release();enabled();download.hidden=all.hidden=single.hidden=navigation.hidden=true;download.removeAttribute('href');all.removeAttribute('href');text.value=captionText();status.textContent='';preview.setAttribute('aria-busy','true');preview.replaceChildren(make('p','Preparando fichas…'));
   const active=()=>ticket===request&&current===generation&&dialog.open;
   if(!selected.size){preview.replaceChildren(make('p','Elige al menos un Pick para compartir.'));preview.setAttribute('aria-busy','false');return;}
   try{
    await prepareTakeArtwork();if(!active())return;
    const plans=chosen().flatMap(p=>pickPages(p,options)),prepared=[];
    for(const [index,plan] of plans.entries()){
     const canvas=renderPickPage(plan,options,index,plans.length);
     const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!active())return;if(!blob)throw Error('No se pudo generar el PNG. Inténtalo de nuevo.');
     const name='cam-sports-'+(plan.p.kind==='weekly'?'pick-del-dia':'pick')+'-'+plan.p.id+(options.size==='story'?'-historia':'')+(plans.length>1?'-'+(index+1):'')+'.png';
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
