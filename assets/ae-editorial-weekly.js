/* AE SPORTS · Editorial Weekly Pick is separate from community point predictions. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const make=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(cls)n.className=cls;return n;};
 const odds=n=>(n>0?'+':'')+String(n);
 let refreshing=false,active=null,submitting=false;
 function createCard(p,isPreview){
   const box=make('article',undefined,isPreview?'ae-weekly-card ae-weekly-preview':'ae-weekly-card');
   box.append(make('p','AE SPORTS · PICK EDITORIAL','ae-weekly-kicker'),make('h3',p.title,'ae-weekly-title'));
   box.append(make('p',p.event_name,'ae-weekly-event'));
   const row=make('div',undefined,'ae-weekly-selection');row.append(make('strong',p.selection),make('span','Cuota '+odds(p.american_odds),'ae-weekly-odds'));box.append(row);
   const analysis=make('p',p.analysis,'ae-weekly-analysis');box.append(analysis);
   box.append(make('small','Cuota publicada por AE SPORTS; no verificada en tiempo real. Sin apuestas en esta página.','ae-weekly-disclaimer'));
   if(isPreview){
     const go=make('button','Ver Pick completo →','ae-weekly-link');go.type='button';go.addEventListener('click',()=>{
       if(typeof filterByCategory==='function')filterByCategory('Picks');
       $('picksFeatured')?.scrollIntoView({behavior:'smooth',block:'start'});
     });box.append(go);
   }
   return box;
 }
 function render(){
   for(const [id,preview] of [['cpWeekly',true],['picksFeaturedCard',false]]){
     const area=$(id);if(!area)continue;
     area.replaceChildren();
     if(active)area.append(createCard(active,preview));
     else area.append(make('p','AE SPORTS todavía no ha publicado un Pick editorial para esta semana.','ae-weekly-empty'));
   }
 }
 async function load(){
   if(refreshing||!window.db)return;
   refreshing=true;
   try{
     const {data,error}=await db.from('ae_editorial_weekly_picks')
       .select('id,title,event_name,selection,american_odds,analysis,expires_at,created_at')
       .eq('is_published',true).order('created_at',{ascending:false}).limit(1);
     if(error)throw error;
     active=data?.[0]&&new Date(data[0].expires_at).getTime()>Date.now()?data[0]:null;
     render();
   }catch(e){
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
   submitting=true;send.disabled=true;status.textContent='Publicando…';
   try{
     if(!confirm('¿Publicar el Pick editorial y sustituir el anterior?'))return;
     const {error}=await db.rpc('ae_publish_editorial_weekly_pick',{
       p_title:form.elements.title.value.trim(),p_event_name:form.elements.event_name.value.trim(),
       p_selection:form.elements.selection.value.trim(),p_american_odds:oddsValue,
       p_analysis:form.elements.analysis.value.trim(),p_expires_at:expires.toISOString()
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
   if(window.db)db.auth.onAuthStateChange(()=>setTimeout(adminVisibility,100));
   document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
 });
})();