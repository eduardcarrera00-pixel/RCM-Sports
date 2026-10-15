/* AE SPORTS · Editorial Weekly Pick is separate from community point predictions. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const make=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(cls)n.className=cls;return n;};
 const odds=n=>(n>0?'+':'')+String(n);
 let refreshing=false,active=null,submitting=false;
 function createCard(p,isPreview){
   const box=make('article',undefined,isPreview?'ae-weekly-card ae-weekly-preview':'ae-weekly-card');
   if(isPreview){
     const photoUrl=window.aeEditorialMedia?.publicUrl(p.image_path);
     if(photoUrl&&!window.aeEditorialMedia?.publicUrl(p.banner_path)){const photo=make('img',undefined,'ae-weekly-home-thumbnail');photo.src=photoUrl;photo.alt='Imagen del Pick editorial';photo.loading='lazy';box.append(photo);}
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
   const photoUrl=window.aeEditorialMedia?.publicUrl(p.image_path);
   if(photoUrl){const photo=make('img',undefined,'ae-weekly-inline-photo');photo.src=photoUrl;photo.alt='Imagen del Pick de la Semana';photo.loading='lazy';expanded.append(photo);}
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
   const url=window.aeEditorialMedia?.publicUrl(active?.banner_path);
   if(!url)return;
   const banner=make('img',undefined,'ae-weekly-home-banner');
   banner.src=url;
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
     const url=window.aeEditorialMedia?.publicUrl(active?.banner_path);
     if(url){const banner=make('img',undefined,'ae-weekly-banner');banner.src=url;banner.alt='';banner.loading='lazy';featured.prepend(banner);}
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
       .select('id,title,event_name,selection,american_odds,analysis,expires_at,created_at,banner_path,image_path')
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
 function adminVisibility(){
   const d=$('aeWeeklyPickAdmin');if(d)d.hidden=!(typeof currentAdmin!=='undefined'&&currentAdmin);
 }
 async function publish(e){
   e.preventDefault();if(submitting)return;
   const form=e.currentTarget,status=$('aeWeeklyPickAdminStatus'),send=form.querySelector('[type=submit]');
   const raw=form.elements.american_odds.value.trim();
   if(!/^[+-]?\d{3,6}$/.test(raw)){status.textContent='Introduce una cuota americana válida, por ejemplo +150 o -110.';return;}
   const oddsValue=Number(raw);if(!Number.isInteger(oddsValue)||Math.abs(oddsValue)<100||Math.abs(oddsValue)>100000){status.textContent='La cuota debe ser al menos +100 o -100, en valor absoluto.';return;}
   const expires=new Date(form.elements.expires_at.value);
   if(!Number.isFinite(expires.getTime())||expires.getTime()<=Date.now()){status.textContent='Elige un cierre futuro.';return;}
   submitting=true;send.disabled=true;status.textContent='Validando publicación…';
   try{
     if(!confirm('¿Publicar el Pick editorial y sustituir el anterior?'))return;
     status.textContent='Guardando imágenes…';
     const banner=await window.aeEditorialMedia.upload(form.elements.banner_file?.files?.[0],'weekly/banner');
     const image=await window.aeEditorialMedia.upload(form.elements.image_file?.files?.[0],'weekly/article');
     status.textContent='Publicando Pick editorial…';
     const {error}=await db.rpc('ae_publish_editorial_weekly_pick_visual',{
       p_title:form.elements.title.value.trim(),p_event_name:form.elements.event_name.value.trim(),
       p_selection:form.elements.selection.value.trim(),p_american_odds:oddsValue,
       p_analysis:form.elements.analysis.value.trim(),p_expires_at:expires.toISOString(),
       p_banner_path:banner,p_image_path:image
     });
     if(error)throw error;
     status.textContent='Pick de la Semana publicado correctamente.';
     form.reset();await load();
   }catch(err){status.textContent=err.message||'No se pudo publicar.';}
   finally{submitting=false;send.disabled=false;}
 }
 function renderNews(){
   const list=$('picksNewsList');if(!list)return;list.replaceChildren();
   const source=typeof articles==='undefined'?[]:articles;
   const matches=source.filter(a=>a && typeof categoryKey==='function' && categoryKey(a.category)==='Picks')
     .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,4);
   if(!matches.length){list.append(make('p','Todavía no hay noticias de Picks. Las próximas publicaciones aparecerán aquí.','ae-picks-news-empty'));return;}
   for(const article of matches){
     const card=make('article',undefined,'ae-picks-news-card');
     const btn=make('button',undefined,'ae-picks-news-open');btn.type='button';
     btn.setAttribute('aria-label','Leer: '+article.title);
     if(article.image){
       const img=make('img');img.loading='lazy';img.alt='';img.src=typeof safeImageURL==='function'?safeImageURL(article.image):'';btn.append(img);
     }
     const copy=make('div',undefined,'ae-picks-news-copy');copy.append(make('span','PICKS · ANÁLISIS','ae-picks-news-label'),make('h4',article.title));
     if(article.summary)copy.append(make('p',article.summary));
     btn.append(copy);btn.addEventListener('click',()=>{if(typeof openArticleModal==='function')openArticleModal(article.id);});
     card.append(btn);list.append(card);
   }
 }
 window.renderAePicksNews=renderNews;
 window.refreshEditorialWeeklyPick=load;
 window.updateAeWeeklyAdmin=adminVisibility;
 document.addEventListener('DOMContentLoaded',()=>{
   $('aeWeeklyPickForm')?.addEventListener('submit',publish);
   adminVisibility();load();renderNews();
   if((typeof db!=='undefined' && db))db.auth.onAuthStateChange(()=>setTimeout(adminVisibility,100));
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 });
})();