/* AE SPORTS · Editorial Weekly Pick is separate from community point predictions. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const make=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(cls)n.className=cls;return n;};
 const odds=n=>(n>0?'+':'')+String(n);
 const framedPosition=(p,prefix)=>{
   const x=Number(p?.[prefix+'_focus_x']),y=Number(p?.[prefix+'_focus_y']);
   return (Number.isFinite(x)?Math.max(0,Math.min(100,x)):50)+'% '+
          (Number.isFinite(y)?Math.max(0,Math.min(100,y)):50)+'%';
 };
 const editorialUrl=(path,url)=>{
   const uploaded=window.aeEditorialMedia?.publicUrl(path);
   if(uploaded)return uploaded;
   try{
     const u=new URL(url);
     return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';
   }catch{return '';}
 };
 let refreshing=false,active=null,submitting=false,editing=null,uncertainSave=null;
 function createCard(p,isPreview){
   const box=make('article',undefined,isPreview?'ae-weekly-card ae-weekly-preview':'ae-weekly-card');
   if(isPreview){
     const photoUrl=editorialUrl(p.image_path,p.image_url);
     const bannerUrl=editorialUrl(p.banner_path,p.banner_url);
     if(photoUrl&&!bannerUrl){const photo=make('img',undefined,'ae-weekly-home-thumbnail');photo.src=photoUrl;photo.style.setProperty('--ae-image-focus',framedPosition(p,'image'));photo.alt='Imagen del Pick editorial';photo.loading='lazy';box.append(photo);}
     // El banner sigue intacto en escritorio; en el diseño móvil usamos
     // una miniatura auténtica del Pick sin duplicar sus datos.
     if(bannerUrl){const thumb=make('img',undefined,'ae-weekly-mobile-banner-thumb');thumb.src=photoUrl||bannerUrl;thumb.style.setProperty('--ae-image-focus',framedPosition(p,photoUrl?'image':'banner'));thumb.alt='Imagen del Pick de la Semana';thumb.loading='lazy';box.append(thumb);}
     const go=()=>{
       if(typeof filterByCategory==='function')filterByCategory('Picks');
       const detail=$('picksFeaturedCard')?.querySelector('details');
       if(detail)detail.open=true;
       $('picksFeatured')?.scrollIntoView({behavior:'smooth',block:'start'});
     };
     box.setAttribute('role','button');box.tabIndex=0;
     box.setAttribute('aria-label','Leer Pick de la Semana: '+p.title);
     box.addEventListener('click',go);
     box.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();go();}});
     box.append(make('h3',p.title,'ae-weekly-title'),make('p',p.event_name,'ae-weekly-event'));
     const selection=make('div',undefined,'ae-weekly-selection');
     selection.append(make('strong',p.selection),make('span','Cuota '+odds(p.american_odds),'ae-weekly-odds'));
     box.append(selection,make('span','Ver análisis completo →','ae-weekly-link'));
     return box;
   }
   const details=make('details',undefined,'ae-weekly-expandable');
   const summary=make('summary',undefined,'ae-weekly-expand-summary');
   summary.append(make('strong',p.title,'ae-weekly-title'));
   summary.append(make('span',p.selection,'ae-weekly-compact-selection'));
   summary.append(make('span','Cuota '+odds(p.american_odds),'ae-weekly-odds'));
   summary.append(make('span','Ver análisis y detalles ↓','ae-weekly-expand-hint'));
   const expanded=make('div',undefined,'ae-weekly-expanded-content');
   const photoUrl=editorialUrl(p.image_path,p.image_url);
   if(photoUrl){const photo=make('img',undefined,'ae-weekly-inline-photo');photo.src=photoUrl;photo.style.setProperty('--ae-image-focus',framedPosition(p,'image'));photo.alt='Imagen del Pick de la Semana';photo.loading='lazy';expanded.append(photo);}
   expanded.append(make('p',p.event_name,'ae-weekly-event'),make('p',p.analysis,'ae-weekly-analysis'));
   expanded.append(make('small','Cuota publicada por AE SPORTS; no verificada en tiempo real. Sin apuestas en esta página.','ae-weekly-disclaimer'));
   details.append(summary,expanded);box.append(details);
   return box;
 }
 function renderHomeBanner(){
   const panel=document.querySelector('.editorial-pick');
   if(!panel)return;
   panel.querySelector('.ae-weekly-home-banner')?.remove();
   panel.classList.remove('ae-home-weekly-banner');
   const url=editorialUrl(active?.banner_path,active?.banner_url);
   if(!url)return;
   const banner=make('img',undefined,'ae-weekly-home-banner');
   banner.src=url;
   banner.style.setProperty('--ae-image-focus',framedPosition(active,'banner'));
   banner.alt='';
   banner.setAttribute('aria-hidden','true');
   banner.loading='lazy';
   banner.addEventListener('error',()=>{
     banner.remove();
     panel.classList.remove('ae-home-weekly-banner');
   },{once:true});
   panel.prepend(banner);
   panel.classList.add('ae-home-weekly-banner');
 }
 function render(){
   renderHomeBanner();
   const featured=$('picksFeatured');
   if(featured){
     featured.querySelector('.ae-weekly-banner')?.remove();
     const url=editorialUrl(active?.banner_path,active?.banner_url);
     if(url){const banner=make('img',undefined,'ae-weekly-banner');banner.src=url;banner.style.setProperty('--ae-image-focus',framedPosition(active,'banner'));banner.alt='';banner.loading='lazy';featured.prepend(banner);}
   }
   for(const [id,preview] of [['cpWeekly',true],['picksFeaturedCard',false]]){
     const area=$(id);if(!area)continue;
     area.replaceChildren();
     if(active)area.append(createCard(active,preview));
     else area.append(make('p','AE SPORTS todavía no ha publicado un Pick editorial para esta semana.','ae-weekly-empty'));
   }
 }
 async function load(){
   if(refreshing||!(typeof db!=='undefined' && db))return;
   refreshing=true;
   try{
     const {data,error}=await db.from('ae_editorial_weekly_picks')
       .select('id,title,event_name,selection,american_odds,analysis,expires_at,created_at,banner_path,image_path,banner_url,image_url,banner_focus_x,banner_focus_y,image_focus_x,image_focus_y,edited_at')
       .eq('is_published',true).order('created_at',{ascending:false}).limit(1);
     if(error)throw error;
     active=data?.[0]&&new Date(data[0].expires_at).getTime()>Date.now()?data[0]:null;
     render();
   }catch(e){
     active=null;
     renderHomeBanner();
     $('picksFeatured')?.querySelector('.ae-weekly-banner')?.remove();
     for(const id of ['cpWeekly','picksFeaturedCard']){$(id)?.replaceChildren(make('p','No se pudo cargar el Pick editorial.','ae-weekly-empty'));}
   }finally{refreshing=false;adminVisibility();}
 }
 const localDatetime=iso=>{
   const d=new Date(iso);
   if(!Number.isFinite(d.getTime()))return '';
   const pad=n=>String(n).padStart(2,'0');
   return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
 };
 const editNetworkError=error=>/failed to fetch|fetch failed|load failed|networkerror|network request|err_network|timeout|connection lost|conexión|conectar/i
   .test(String(error?.message||error||''));
 const editableFields='id,title,event_name,selection,american_odds,analysis,expires_at,banner_focus_x,banner_focus_y,image_focus_x,image_focus_y,edited_at,is_published,banner_path,image_path,banner_url,image_url';
 const checkSavedEdit=async(savedEdit,params)=>{
   const {data,error}=await db.from('ae_editorial_weekly_picks')
     .select(editableFields).eq('id',savedEdit.id).maybeSingle();
   if(error)throw error;
   if(!data)return false;
   const oldTime=savedEdit.expectedEditedAt;
   if(!data.edited_at || (oldTime&&new Date(data.edited_at).getTime()<=new Date(oldTime).getTime()))return false;
   for(const [dbKey,paramKey] of [
     ['title','p_title'],['event_name','p_event_name'],['selection','p_selection'],
     ['analysis','p_analysis'],['american_odds','p_american_odds'],
     ['banner_focus_x','p_banner_focus_x'],['banner_focus_y','p_banner_focus_y'],
     ['image_focus_x','p_image_focus_x'],['image_focus_y','p_image_focus_y']
   ]){
     if(String(data[dbKey])!==String(params[paramKey]))return false;
   }
   if(new Date(data.expires_at).getTime()!==new Date(params.p_expires_at).getTime())return false;
   if(params.p_banner_path&&data.banner_path!==params.p_banner_path)return false;
   if(params.p_image_path&&data.image_path!==params.p_image_path)return false;
   if(params.p_banner_url&&data.banner_url!==params.p_banner_url)return false;
   if(params.p_image_url&&data.image_url!==params.p_image_url)return false;
   return true;
 };
 const checkButton=()=>$('aeWeeklyCheckSave');
 const setCheckVisible=visible=>{const b=checkButton();if(b)b.hidden=!visible;};
 async function finishSave(isEditing,recovered=false){
   uncertainSave=null;
   setCheckVisible(false);
   editing=null;
   const form=$('aeWeeklyPickForm');
   form?.reset();
   updateEditorLabels();
   const status=$('aeWeeklyPickAdminStatus');
   if(status)status.textContent=recovered?
     'Confirmado en Supabase: los cambios sí se habían guardado. Ya están aplicados al Pick de la Semana.':
     isEditing?'Cambios guardados correctamente en el Pick de la Semana.':'Pick de la Semana publicado correctamente.';
   await load();
 }
 async function manuallyCheckSave(){
   const status=$('aeWeeklyPickAdminStatus'), b=checkButton();
   const item=uncertainSave;
   if(!item || !status || !editing)return;
   if(b)b.disabled=true;
   status.textContent='Comprobando si la edición quedó guardada en Supabase…';
   try{
     if(await checkSavedEdit(item.edit,item.params)){
       await finishSave(true,true);
     }else{
       status.textContent='Todavía no se han confirmado estos cambios. Se conserva todo el formulario. Comprueba la conexión antes de volver a guardar.';
     }
   }catch{
     status.textContent='No se pudo conectar con Supabase para verificar el guardado. El formulario sigue intacto; inténtalo cuando tengas conexión.';
   }finally{if(b)b.disabled=false;}
 }
 function adminVisibility(){
   const admin=typeof currentAdmin!=='undefined'&&Boolean(currentAdmin);
   const panel=$('aeWeeklyPickAdmin');
   if(panel)panel.hidden=!admin;
   const button=$('aeWeeklyEditButton');
   if(button)button.hidden=!(admin&&active);
   if(!admin&&editing)cancelEdit();
 }
 function updateEditorLabels(){
   const isEditing=Boolean(editing);
   const save=$('aeWeeklySaveButton');
   if(save)save.textContent=isEditing?'Guardar cambios':'Publicar Pick de la Semana';
   const cancel=$('aeWeeklyCancelEdit');if(cancel)cancel.hidden=!isEditing;
   const note=$('aeWeeklyEditorMode');if(note)note.hidden=!isEditing;
   const summary=$('aeWeeklyAdminSummary');
   if(summary)summary.textContent=isEditing?'Administrar · Editando Pick de la Semana':'Administrar · Publicar Pick de la Semana';
 }
 function cancelEdit(){
   if(submitting)return;
   uncertainSave=null;
   setCheckVisible(false);
   editing=null;
   const form=$('aeWeeklyPickForm');
   form?.reset();
   updateEditorLabels();
   const status=$('aeWeeklyPickAdminStatus');
   if(status)status.textContent='';
 }
 function startEdit(){
   if(submitting||!(typeof currentAdmin!=='undefined'&&currentAdmin)||!active)return;
   const p=active,form=$('aeWeeklyPickForm');
   if(!form)return;
   editing={id:p.id,expectedEditedAt:p.edited_at||null};
   uncertainSave=null;
   setCheckVisible(false);
   form.elements.title.value=p.title||'';
   form.elements.event_name.value=p.event_name||'';
   form.elements.selection.value=p.selection||'';
   form.elements.american_odds.value=odds(p.american_odds);
   form.elements.expires_at.value=localDatetime(p.expires_at);
   form.elements.analysis.value=p.analysis||'';
   for(const name of ['banner_file','image_file','banner_url','image_url']){
     if(form.elements[name])form.elements[name].value='';
   }
   const framing=window.aeImageFraming;
   framing?.setExisting('banner',editorialUrl(p.banner_path,p.banner_url));
   framing?.set('banner',p.banner_focus_x??50,p.banner_focus_y??50);
   framing?.setExisting('weekly',editorialUrl(p.image_path,p.image_url));
   framing?.set('weekly',p.image_focus_x??50,p.image_focus_y??50);
   updateEditorLabels();
   const status=$('aeWeeklyPickAdminStatus');
   if(status)status.textContent='Modifica lo necesario y guarda. Las fotos actuales se conservan si no eliges una nueva.';
   const panel=$('aeWeeklyPickAdmin');
   panel.hidden=false;
   panel.open=true;
   panel.scrollIntoView?.({behavior:'smooth',block:'start'});
   form.elements.title.focus({preventScroll:true});
 }
 async function publish(e){
   e.preventDefault();if(submitting)return;
   const form=e.currentTarget,status=$('aeWeeklyPickAdminStatus'),send=form.querySelector('[type=submit]');
   if(!(typeof currentAdmin!=='undefined'&&currentAdmin)){status.textContent='Solo administradores';return;}
   const raw=form.elements.american_odds.value.trim();
   if(!/^[+-]?\d{3,6}$/.test(raw)){status.textContent='Introduce una cuota americana válida, por ejemplo +150 o -110.';return;}
   const oddsValue=Number(raw);
   if(!Number.isInteger(oddsValue)||Math.abs(oddsValue)<100||Math.abs(oddsValue)>100000){status.textContent='La cuota debe ser al menos +100 o -100, en valor absoluto.';return;}
   const expires=new Date(form.elements.expires_at.value);
   if(!Number.isFinite(expires.getTime())||expires.getTime()<=Date.now()){status.textContent='Elige un cierre futuro.';return;}
   const isEditing=Boolean(editing), editSnapshot=editing?{...editing}:null;
   if(!confirm(isEditing?'¿Guardar los cambios en este Pick de la Semana? La publicación conservará su identidad.':'¿Publicar el Pick editorial y sustituir el anterior?'))return;
   submitting=true;send.disabled=true;uncertainSave=null;setCheckVisible(false);
   let stage='banner',rpcAttempted=false,attemptedParams=null;
   status.textContent='Preparando imágenes…';
   try{
     const banner=await window.aeEditorialMedia.upload(form.elements.banner_file?.files?.[0],'weekly/banner');
     stage='imagen';
     const image=await window.aeEditorialMedia.upload(form.elements.image_file?.files?.[0],'weekly/article');
     const bannerTyped=form.elements.banner_url.value.trim();
     const imageTyped=form.elements.image_url.value.trim();
     const bannerUrl=banner?null:(bannerTyped?window.aeImageFraming?.safeUrl(bannerTyped):null);
     const imageUrl=image?null:(imageTyped?window.aeImageFraming?.safeUrl(imageTyped):null);
     if(bannerTyped&&!banner&&!bannerUrl)throw Error('El banner necesita un enlace HTTPS válido.');
     if(imageTyped&&!image&&!imageUrl)throw Error('La imagen necesita un enlace HTTPS válido.');
     const bannerFocus=window.aeImageFraming?.get('banner')||{x:50,y:50};
     const imageFocus=window.aeImageFraming?.get('weekly')||{x:50,y:50};
     const params={
       p_title:form.elements.title.value.trim(),p_event_name:form.elements.event_name.value.trim(),
       p_selection:form.elements.selection.value.trim(),p_american_odds:oddsValue,
       p_analysis:form.elements.analysis.value.trim(),p_expires_at:expires.toISOString(),
       p_banner_path:banner,p_image_path:image,
       p_banner_url:bannerUrl,p_image_url:imageUrl,
       p_banner_focus_x:bannerFocus.x,p_banner_focus_y:bannerFocus.y,
       p_image_focus_x:imageFocus.x,p_image_focus_y:imageFocus.y
     };
     if(isEditing){
       params.p_pick_id=editSnapshot.id;
       params.p_expected_edited_at=editSnapshot.expectedEditedAt;
     }
     stage='guardar';
     attemptedParams=params;
     status.textContent=isEditing?'Guardando cambios en Supabase…':'Publicando Pick editorial…';
     const rpc=isEditing?'ae_update_editorial_weekly_pick':'ae_publish_editorial_weekly_pick_visual_v2';
     rpcAttempted=true;
     const {error}=await db.rpc(rpc,params);
     if(error){
       if(isEditing&&editNetworkError(error)){
         uncertainSave={edit:editSnapshot,params};
       }
       throw error;
     }
     await finishSave(isEditing);
   }catch(err){
     if(isEditing&&rpcAttempted&&editNetworkError(err)&&uncertainSave===null){
       // The server may have saved a transaction even if the browser lost its response.
       // Checking the exact fields and revision prevents dangerous duplicate retries.
       uncertainSave={edit:editSnapshot,params:attemptedParams};
     }
     if(isEditing&&rpcAttempted&&editNetworkError(err)){
       if(uncertainSave?.params){
         try{
           if(await checkSavedEdit(uncertainSave.edit,uncertainSave.params)){
             await finishSave(true,true);
             return;
           }
         }catch{}
         setCheckVisible(true);
       }
       status.textContent='No se pudo confirmar la respuesta de Supabase. Puede ser un problema temporal de conexión. Tus cambios siguen aquí; pulsa «Comprobar si se guardó» antes de volver a guardar.';
     }else if(editNetworkError(err)){
       status.textContent='No se pudo conectar con Supabase durante '+(stage==='banner'?'la subida del banner':stage==='imagen'?'la subida de la imagen':'la publicación')+'. Los datos del formulario siguen aquí. Comprueba la conexión e inténtalo de nuevo.';
     }else{
       status.textContent=err?.message||'No se pudo guardar. Conservamos los cambios del formulario.';
     }
   }finally{submitting=false;send.disabled=false;}
 }
 function renderNews(){
   const list=$('picksNewsList'),lead=$('picksNewsLead');
   if(!list)return;
   list.replaceChildren();
   // "articles" es el listado real de index.html, no window.articles.
   const source=typeof articles==='undefined'?[]:articles;
   const newest=source.filter(a=>a && typeof categoryKey==='function' && categoryKey(a.category)==='Picks')
     .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)||String(a.id).localeCompare(String(b.id)))[0];
   if(lead){
     lead.textContent=newest?.title||'';
     lead.hidden=!newest;
   }
   if(!newest){
     list.append(make('p','Todavía no hay noticias de Picks. Las próximas publicaciones aparecerán aquí.','ae-picks-news-empty'));
     return;
   }
   // Titular arriba; fotografía en toda la tarjeta. Si falla, se muestra
   // el titular dentro de la tarjeta como alternativa legible.
   const card=make('article',undefined,'ae-picks-news-card ae-picks-news-feature');
   const btn=make('button',undefined,'ae-picks-news-open');
   btn.type='button';
   btn.setAttribute('aria-label','Leer noticia: '+newest.title);
   const imageUrl=newest.image && typeof safeImageURL==='function'?safeImageURL(newest.image):'';
   if(imageUrl){
     const img=make('img');img.loading='lazy';img.decoding='async';img.alt='';img.src=imageUrl;
     img.style.setProperty('--ae-image-focus',(Number.isFinite(Number(newest.image_focus_x))?Math.max(0,Math.min(100,Number(newest.image_focus_x))):50)+'% '+(Number.isFinite(Number(newest.image_focus_y))?Math.max(0,Math.min(100,Number(newest.image_focus_y))):50)+'%');
     card.classList.add('has-photo');
     img.addEventListener('error',()=>{
       img.remove();
       card.classList.remove('has-photo');
     });
     btn.append(img);
   }
   const copy=make('div',undefined,'ae-picks-news-copy');
   copy.append(make('span','PICKS · ANÁLISIS','ae-picks-news-label'));
   copy.append(make('h4',newest.title,'ae-picks-news-in-card-title'));
   copy.append(make('span','Leer noticia →','ae-picks-news-read'));
   btn.append(copy);
   btn.addEventListener('click',()=>{if(typeof openArticleModal==='function')openArticleModal(newest.id);});
   card.append(btn);list.append(card);
 }
 window.renderAePicksNews=renderNews;
 window.refreshEditorialWeeklyPick=load;
 window.updateAeWeeklyAdmin=adminVisibility;
 document.addEventListener('DOMContentLoaded',()=>{
   $('aeWeeklyPickForm')?.addEventListener('submit',publish);
   $('aeWeeklyEditButton')?.addEventListener('click',startEdit);
   $('aeWeeklyCancelEdit')?.addEventListener('click',cancelEdit);
   $('aeWeeklyCheckSave')?.addEventListener('click',manuallyCheckSave);
   updateEditorLabels();
   adminVisibility();load();renderNews();
   if((typeof db!=='undefined' && db))db.auth.onAuthStateChange(()=>setTimeout(adminVisibility,100));
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 });
})();