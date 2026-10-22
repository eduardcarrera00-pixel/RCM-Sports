/* CAM SPORTS: encuadre avanzado opcional para logos y fondos editables. */
(() => {
'use strict';
if (window.camImageVisual) return;
const base={size:100,zoom:100,x:50,y:50,fit:'auto',ratio:'auto',customRatio:1};
const limit=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(+v)?+v:min));
const mode=()=>innerWidth<=767?'mobile':'desktop';
const settings=(json,device=mode())=>({...base,...(json?.[device]||(device==='mobile'?json?.desktop:null)||{})});
const ratios={'16:9':'16 / 9','4:3':'4 / 3','1:1':'1','4:5':'4 / 5','9:16':'9 / 16'};
function bg(p){
  if(!p)return null;
  let size=p.fit==='original'?'auto':p.fit==='contain'?'contain':p.fit==='cover'?'cover':null;
  if(p.zoom!==100||p.size!==100||p.fit==='custom') size=Math.round(p.zoom*p.size/100)+'% auto';
  return {size,pos:p.x+'% '+p.y+'%'};
}
function img(node,row){
  const marked=node.dataset.camVisualApplied==='1';
  const p=row?.visual?settings(row.visual):null;
  if(!p&&!marked)return;
  const set=(name,value)=>value?node.style.setProperty(name,value):node.style.removeProperty(name);
  if(!p){
    for(const n of ['scale','transform','transform-origin','object-fit','aspect-ratio'])set(n,'');
    delete node.dataset.camVisualApplied;return;
  }
  set('scale',p.size===100?'':String(p.size/100));
  set('transform',p.zoom===100?'':'scale('+(p.zoom/100)+')');
  set('transform-origin',p.x+'% '+p.y+'%');
  set('object-fit',p.fit==='auto'?'':p.fit==='original'?'none':p.fit==='custom'?'contain':p.fit);
  set('aspect-ratio',p.ratio==='custom'?String(limit(p.customRatio,.2,5)):p.ratio==='original'?'auto':ratios[p.ratio]||'');
  set('object-position',p.x+'% '+p.y+'%');
  node.dataset.camVisualApplied='1';
}
const style=document.createElement('style');
style.textContent=[
'.cam-visual-editor{padding:12px;margin:10px 0;border:1px solid var(--ds-line,#a8b6bf);background:var(--ds-surface-soft,#f3ebdd);color:var(--ds-text,#0a3268);font:12px/1.4 Inter,system-ui,sans-serif}',
'.cam-visual-editor h3{font:600 18px Newsreader,Georgia,serif;margin:0 0 8px}',
'.cam-visual-editor label{display:grid;gap:4px;margin:7px 0;min-width:0}',
'.cam-visual-editor button{border:1px solid #8298ac;background:transparent;color:inherit;padding:5px 8px;cursor:pointer;min-height:34px}',
'.cam-visual-editor button[aria-pressed=true]{background:#073b83;color:#fff}',
'.cam-visual-editor input[type=range]{width:100%;accent-color:#073b83}',
'.cam-visual-editor select,.cam-visual-editor input[type=number]{width:100%;min-height:35px;color:inherit;background:transparent;border:1px solid #8298ac}',
'.cam-visual-row{display:grid;grid-template-columns:34px minmax(0,1fr) 46px 34px;gap:5px;align-items:center}',
'.cam-visual-preset,.cam-visual-device,.cam-visual-actions{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0}',
'.cam-visual-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
'.cam-visual-help{font-size:11px;opacity:.8;line-height:1.5}',
'.cam-site-image-preview{touch-action:none;cursor:grab}',
'html.dark .cam-visual-editor{background:#0a202e;color:#f3ebdd;border-color:#49606c}',
'html.dark .cam-visual-editor select{background:#0a202e}',
'@media(max-width:450px){.cam-visual-grid{grid-template-columns:1fr}}'
].join('\n');
const inject=()=>document.head.appendChild(style);
if(document.head)inject();else document.addEventListener('DOMContentLoaded',inject,{once:true});
let ui=null, context=null, notify=null, panel=null;
const fields={};
const row=(k,label,min,max,step)=>'<label>'+label+'<span class="cam-visual-row"><button type="button" data-step="'+k+':-'+step+'">−</button><input data-f="'+k+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'"><output data-out="'+k+'"></output><button type="button" data-step="'+k+':'+step+'">+</button></span></label>';
function display(){
  if(!context)return;
  const p=settings(context.draft,context.device);
  for(const k of Object.keys(base))fields[k].value=p[k];
  panel.querySelectorAll('[data-device]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.device===context.device)));
  fields.ratio.disabled=context.kind!=='img'||/^(marca\.logo|nav\.|cabecera\.)/.test(context.key);
  panel.querySelector('[data-help]').textContent=context.kind==='img'?
    'El tamaño afecta la imagen visible sin mover el resto de la página. Zoom y posición se ajustan aparte.':
    'En fondos, el tamaño y zoom afectan al arte, no a las dimensiones del cuadro, para proteger textos y botones.';
  labels();
}
function labels(){
  for(const k of ['size','zoom','x','y'])panel.querySelector('[data-out="'+k+'"]').textContent=fields[k].value+'%';
  panel.querySelector('[data-custom]').hidden=fields.ratio.value!=='custom';
}
function persist(){
  if(!context)return;
  const p={};
  for(const k of Object.keys(base)){
    const x=fields[k].value;
    p[k]=k==='fit'||k==='ratio'?x:limit(x,k==='size'?50:k==='zoom'?25:k==='customRatio'?.2:0,k==='size'?200:k==='zoom'?300:k==='customRatio'?5:100);
  }
  context.draft[context.device]=p;
  labels();
}
function attach(editUI,change){
  if(panel)return;
  ui=editUI;notify=change;
  panel=document.createElement('section');panel.className='cam-visual-editor';
  panel.innerHTML='<h3>Encuadre y zoom</h3><div class="cam-visual-device"><button type="button" data-device="desktop">Ordenador</button><button type="button" data-device="mobile">Móvil</button></div>'+
   row('size','Tamaño',50,200,5)+row('zoom','Zoom',25,300,5)+
   '<div class="cam-visual-grid">'+row('x','Posición horizontal',0,100,1)+row('y','Posición vertical',0,100,1)+
   '<label>Ajuste<select data-f="fit"><option value="auto">Actual</option><option value="contain">Ajustar (sin recortar)</option><option value="cover">Rellenar</option><option value="original">Original</option><option value="custom">Personalizado</option></select></label>'+
   '<label>Formato<select data-f="ratio"><option value="auto">Actual</option><option value="16:9">16:9</option><option value="4:3">4:3</option><option value="1:1">1:1</option><option value="4:5">4:5</option><option value="9:16">9:16</option><option value="original">Original</option><option value="custom">Personalizado</option></select></label></div>'+
   '<label data-custom hidden>Relación personalizada<input data-f="customRatio" type="number" min=".2" max="5" step=".05"></label>'+
   '<p class="cam-visual-help" data-help></p>'+
   '<div class="cam-visual-preset"><button type="button" data-preset="x:0">Izquierda</button><button type="button" data-preset="x:50">Centro X</button><button type="button" data-preset="x:100">Derecha</button><button type="button" data-preset="y:0">Arriba</button><button type="button" data-preset="y:50">Centro Y</button><button type="button" data-preset="y:100">Abajo</button></div>'+
   '<div class="cam-visual-actions"><button type="button" data-reset="zoom">Restablecer zoom</button><button type="button" data-reset="position">Centrar</button><button type="button" data-reset="all">Restablecer encuadre</button></div>';
  ui.focusBox.insertAdjacentElement('afterend',panel);
  for(const c of panel.querySelectorAll('[data-f]')){
    fields[c.dataset.f]=c;
    c.addEventListener('input',()=>{persist();notify()});
    c.addEventListener('change',()=>{persist();notify()});
  }
  panel.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||!context)return;
    if(b.dataset.device){persist();context.device=b.dataset.device;display();notify();return}
    if(b.dataset.step){const [k,d]=b.dataset.step.split(':');fields[k].value=limit(+fields[k].value + +d,+fields[k].min,+fields[k].max)}
    else if(b.dataset.preset){const [k,v]=b.dataset.preset.split(':');fields[k].value=v}
    else if(b.dataset.reset){
      if(b.dataset.reset==='all'){delete context.draft[context.device];display();notify();return}
      if(b.dataset.reset==='zoom')fields.zoom.value=100;
      if(b.dataset.reset==='position'){fields.x.value=50;fields.y.value=50}
    }else return;
    persist();notify();
  });
  let drag=null;
  ui.preview.addEventListener('pointerdown',e=>{
    if(!context||(e.pointerType==='mouse'&&e.button!==0))return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,fx:+fields.x.value,fy:+fields.y.value};
    try{ui.preview.setPointerCapture(e.pointerId)}catch{}
  });
  ui.preview.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId)return;
    fields.x.value=Math.round(limit(drag.fx+100*(e.clientX-drag.x)/Math.max(1,ui.preview.clientWidth),0,100));
    fields.y.value=Math.round(limit(drag.fy+100*(e.clientY-drag.y)/Math.max(1,ui.preview.clientHeight),0,100));
    persist();notify();
  });
  for(const ev of ['pointerup','pointercancel'])ui.preview.addEventListener(ev,e=>{if(drag?.id===e.pointerId)drag=null});
}
function open(key,kind,visual){context={key,kind,device:mode(),draft:visual?JSON.parse(JSON.stringify(visual)):{}};display()}
function preview(box,editing){
  if(!context)return;
  const p=settings(context.draft,context.device), sizing=bg(p);
  if(p.fit!=='auto')box.style.backgroundSize=p.fit==='original'?'auto':p.fit==='custom'?'contain':p.fit;
  if(sizing.size)box.style.backgroundSize=sizing.size;
  box.style.backgroundPosition=sizing.pos;
  const ratio=p.ratio==='custom'?String(limit(p.customRatio,.2,5)):p.ratio==='original'?String(editing.aspect):ratios[p.ratio];
  if(ratio)box.style.aspectRatio=ratio;
  box.classList.toggle('is-contain',p.fit==='contain');
}
window.camImageVisual=Object.freeze({settings,bg,img,attach,open,preview,get:()=>context&&Object.keys(context.draft).length?context.draft:null});
})();
