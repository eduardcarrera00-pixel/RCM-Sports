/* AE SPORTS: editors control dormant sport categories without deleting content. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const categories=['NBA','Tenis','Ciclismo','Fútbol Americano Colegial'];
 const enabled=new Map(categories.map(x=>[x,false]));
 function apply(){
  for(const category of categories){
   const visible=enabled.get(category)===true;
   for(const n of document.querySelectorAll('[data-category]')){
    if(n.dataset.category===category){n.hidden=!visible;n.setAttribute('aria-hidden',String(!visible));}
   }
   for(const n of document.querySelectorAll('footer a[onclick], footer button[onclick]')){
    if((n.getAttribute('onclick')||'').includes("filterByCategory('"+category+"')")){
     const wrapper=n.closest('li')||n;wrapper.hidden=!visible;
    }
   }
  }
  // Recalcular el espacio de navegación únicamente con los deportes visibles.
  // 3/4: una fila, 5/6: filas centradas 3+2 o 3+3, 7: filas 4+3.
  // Nunca se reserva el hueco del deporte que un editor ha ocultado.
  // The same nav moves to <body> on phones; preserve visible-sport counts on both layouts.
  const nav=document.querySelector('nav.ae-sport-nav');
  if(nav){
   const count=Array.from(nav.querySelectorAll('.category-btn[data-category]'))
    .filter(button=>!button.hidden && button.getAttribute('aria-hidden')!=='true').length;
   const columns=count<=4?count:count<=6?3:4;
   nav.style.setProperty('--ae-visible-sport-columns',String(Math.max(1,columns)));
   nav.dataset.visibleSports=String(count);
  }
  if(!window.aeSportIsVisible(currentCategory) && typeof filterByCategory==='function')filterByCategory('Todos');
  document.body.classList.add('ae-categories-ready');
 }
 async function load(){
  if(!(typeof db!=='undefined'&&db))return;
  const {data,error}=await db.from('ae_category_visibility').select('category,visible');
  if(error){$('aeCategoryStatus') && ($('aeCategoryStatus').textContent='No se pudo cargar la configuración.');return;}
  for(const item of data||[])if(enabled.has(item.category))enabled.set(item.category,Boolean(item.visible));
  apply();draw();
 }
 function draw(){
  const panel=$('aeCategoryAdmin');if(!panel)return;
  const admin=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
  panel.hidden=!admin;
  const root=$('aeCategoryToggles');if(!root||!admin)return;
  root.replaceChildren();
  for(const category of categories){
   const label=document.createElement('label');label.className='ae-sport-toggle';
   const input=document.createElement('input');input.type='checkbox';input.checked=enabled.get(category)===true;
   const name=document.createElement('span');name.textContent=category==='Fútbol Americano Colegial'?'Colegial':category;label.append(input,name);root.append(label);
   input.addEventListener('change',async()=>{
    input.disabled=true;
    try{
      const result=await db.rpc('ae_set_category_visibility',{p_category:category,p_visible:input.checked});
      if(result.error)throw result.error;
      enabled.set(category,input.checked);$('aeCategoryStatus').textContent=category+(input.checked?' es visible.':' está oculto.');
      apply();
    }catch(e){input.checked=!input.checked;$('aeCategoryStatus').textContent=e.message||'No se pudo guardar el cambio.';}
    finally{input.disabled=false;}
   });
  }
 }
 window.aeSportIsVisible=category=>!enabled.has(category)||enabled.get(category)===true;
 window.updateAeCategoryAdmin=draw;
 document.addEventListener('DOMContentLoaded',()=>{
  apply();load();
  if(typeof db!=='undefined'&&db)db.auth.onAuthStateChange(()=>setTimeout(draw,140));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 });
})();