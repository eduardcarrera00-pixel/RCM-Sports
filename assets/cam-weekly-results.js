/* CAM Sports · Admin-confirmed editorial results; no automatic guesses. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const admin=()=>typeof currentAdmin!=='undefined'&&!!currentAdmin;
 const odds=n=>(Number(n)>0?'+':'')+String(n);
 const outcome=r=>r?.outcome==='won'?'✅ Pick acertado':r?.outcome==='lost'?'Pick no acertado':'Pendiente de confirmar';
 const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
 let panel,list,status,previous,next,offset=0,loading=false,busy=false,sessionEpoch=0;
 const results=new Map();
 const originalX=url=>/^https:\/\/(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+\/status\/([0-9]+)$/.exec(url||'');
 function replyUrl(result){
   const match=originalX(result.original_x_url);if(!match)return null;
   const u=new URL('https://twitter.com/intent/tweet');
   u.searchParams.set('in_reply_to',match[1]);
   u.searchParams.set('text',['✅ Pick acertado',result.event_name,result.selection+' · Cuota '+odds(result.american_odds),result.link].join('\n'));
   return u.href;
 }
 function link(url,text){
   const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
 }
 function socialSummary(row){
   if(row.outcome!=='won')return row.outcome==='lost'?'No se publica un aviso en redes.':'';
   if(!row.social?.length)return 'Resultado guardado; no hay canales de redes habilitados.';
   const labels={queued:'en cola',submitting:'enviando',accepted:'procesando',published:'publicado',failed:'error: revisar Buffer',uncertain:'pendiente de revisión en Buffer',cancelled:'envío cancelado'};
   return row.social.map(d=>(d.network==='twitter'?'X':'TikTok')+': '+(labels[d.status]||d.status)).join(' · ');
 }
 function decorate(){
   document.querySelectorAll('.cam-weekly-result-badge').forEach(n=>n.remove());
   for(const host of document.querySelectorAll('[data-cam-weekly-id]')){
     const result=results.get(host.dataset.camWeeklyId);
     if(!result)continue;
     const badge=el('p',outcome(result),'cam-weekly-result-badge');badge.setAttribute('role','status');host.prepend(badge);
   }
 }
 async function readPublic(id){
   if(!validId(id)||typeof db==='undefined'||!db)return null;
   const {data,error}=await db.rpc('cam_weekly_pick_result',{p_pick_id:id});
   if(error)throw error;
   if(data)results.set(id,data);else results.delete(id);
   return data;
 }
 function renderRow(row){
   const card=el('article',null,'cam-weekly-review-row');
   card.append(el('h4',row.title),el('p',row.event_name),el('p',row.selection+' · Cuota '+odds(row.american_odds)),el('strong',outcome(row)));
   if(!row.is_published||new Date(row.expires_at)<=new Date())card.append(el('small','Pick anterior o vencido. Puedes confirmar su resultado igualmente.'));
   if(row.outcome){
     card.append(el('p',socialSummary(row),'cam-weekly-review-note'));
     for(const d of row.social||[]){
       if(d.status==='published'&&/^https:\/\/(?:twitter\.com|x\.com|tiktok\.com|www\.tiktok\.com)\//.test(d.url||''))card.append(link(d.url,'Ver publicación en '+(d.network==='twitter'?'X':'TikTok')));
     }
     const result=results.get(row.id);
     const prepared=result&&replyUrl(result);
     if(row.outcome==='won'&&prepared){
       card.append(link(prepared,'Responder en X (manual)'));
       card.append(el('small','Abre una respuesta preparada al tuit original. El aviso automático de X es una publicación separada; publica esta respuesta solo si también quieres añadirla al hilo.'));
     }
   }else{
     const actions=el('div',null,'cam-weekly-review-actions');
     for(const [value,label] of [['won','Aprobar · Acertado'],['lost','Denegar · No acertado']]){
       const button=el('button',label);button.type='button';button.disabled=busy;
       button.onclick=()=>resolve(row,value);actions.append(button);
     }
     card.append(actions);
   }
   return card;
 }
 async function refreshAdmin(){
   if(!admin()||loading||busy||typeof db==='undefined'||!db)return;
   const epoch=sessionEpoch;loading=true;status.textContent='Cargando Picks…';
   try{
     const {data,error}=await db.rpc('cam_admin_weekly_results',{p_offset:offset});
     if(error)throw error;if(epoch!==sessionEpoch||!admin())return;
     const rows=data||[];
     await Promise.all(rows.filter(r=>r.outcome).map(r=>readPublic(r.id)));
     if(epoch!==sessionEpoch||!admin())return;
     list.replaceChildren(...rows.map(renderRow));
     status.textContent=rows.length?'Confirma el resultado solo después de comprobar el partido. La decisión no se puede cambiar desde estos botones.':'No hay Picks en esta página.';
     previous.disabled=offset===0;next.disabled=rows.length<30;decorate();
   }catch(error){
     if(epoch===sessionEpoch&&admin())status.textContent='No se pudo cargar: '+(error.message||'Error de conexión');
   }finally{loading=false;}
 }
 async function resolve(row,value){
   if(busy||!admin())return;
   const message=value==='won'?
     '¿Confirmas que «'+row.selection+'» acertó? Se compartirá “✅ Pick acertado” en X y TikTok. En X será un aviso separado con enlace al tuit original. No se puede deshacer desde estos botones.':
     '¿Confirmas que «'+row.selection+'» no acertó? Se guardará como fallado y no se compartirá. No se puede deshacer desde estos botones.';
   if(!confirm(message))return;
   let messageAfter='';
   busy=true;panel.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Guardando resultado…';
   try{
     const {data,error}=await db.rpc('cam_resolve_weekly_pick',{p_pick_id:row.id,p_outcome:value});
     if(error)throw error;
     if(data)results.set(row.id,data);
     messageAfter=value==='won'?'Acierto confirmado. Consulta el estado de envío de X y TikTok en este panel.':'Pick marcado como no acertado.';
   }catch(error){
     // Read back the immutable result before offering any retry after a lost response.
     try{
       const saved=await readPublic(row.id);
       if(saved){messageAfter='Resultado confirmado: '+outcome(saved)+'.';return;}
     }catch{}
     messageAfter='No se pudo confirmar: '+(error.message||'Error de conexión')+'. Actualiza el estado antes de reintentar.';
   }finally{
     busy=false;panel.querySelectorAll('button').forEach(b=>b.disabled=false);
     await refreshAdmin();decorate();if(messageAfter&&admin())status.textContent=messageAfter;
   }
 }
 function syncAdmin(){
   if(!panel)return;panel.hidden=!admin();
   if(!admin()){
     sessionEpoch++;list.replaceChildren();offset=0;status.textContent='';
   }else if(panel.open)refreshAdmin();
 }
 async function showShared(){
   const id=new URLSearchParams(location.search).get('weeklyResult');if(!validId(id))return;
   const host=$('camWeeklySharedResult');if(!host)return;host.hidden=false;host.replaceChildren(el('p','Cargando resultado del Pick…'));
   if(typeof filterByCategory==='function')filterByCategory('Picks');
   try{
     const result=await readPublic(id);
     if(!result){host.replaceChildren(el('p','Este Pick todavía no tiene un resultado confirmado.'));return;}
     host.replaceChildren(el('h3',outcome(result)),el('h4',result.title),el('p',result.event_name),el('p',result.selection+' · Cuota '+odds(result.american_odds)));
     if(/^https:\/\//.test(result.image_url||'')){const image=el('img');image.src=result.image_url;image.alt='Imagen original del Pick de la Semana';image.loading='lazy';host.prepend(image);}
     host.append(el('small','Resultado confirmado por el equipo editorial de CAM Sports.'));
     if(originalX(result.original_x_url))host.append(link(result.original_x_url,'Ver el Pick original en X'));
   }catch{host.replaceChildren(el('p','No se pudo cargar el resultado. Recarga la página para comprobarlo.'));}
   host.scrollIntoView?.({behavior:'auto',block:'start'});
 }
 async function refreshPublic(){
   const ids=[...new Set([...document.querySelectorAll('[data-cam-weekly-id]')].map(n=>n.dataset.camWeeklyId))];
   await Promise.all(ids.map(id=>readPublic(id).catch(()=>null)));decorate();
 }
 function init(){
   const adminHost=$('aeWeeklyPickAdmin');if(!adminHost||typeof db==='undefined'||!db)return;
   panel=el('details',null,'ae-takes-admin ae-weekly-admin cam-weekly-review');panel.id='camWeeklyResultsAdmin';panel.hidden=!admin();
   const summary=el('summary','Administrar · Resultados del Pick de la Semana');
   const intro=el('p','Aprobar confirma un acierto y lo comparte en X y TikTok. Denegar registra un fallo sin compartirlo.','cam-weekly-review-note');
   const reload=el('button','Actualizar resultados y envíos');reload.type='button';reload.onclick=()=>refreshAdmin();
   list=el('div');list.id='camWeeklyResultsList';
   status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
   const pages=el('div',null,'cam-weekly-review-actions');
   previous=el('button','Más recientes');next=el('button','Anteriores');previous.type=next.type='button';previous.disabled=true;
   previous.onclick=()=>{offset=Math.max(0,offset-30);refreshAdmin();};next.onclick=()=>{offset+=30;refreshAdmin();};pages.append(previous,next);
   panel.append(summary,intro,reload,list,pages,status);adminHost.after(panel);
   panel.addEventListener('toggle',()=>{if(panel.open)refreshAdmin();});
   const result=el('section',null,'ae-weekly-card cam-weekly-shared-result');result.id='camWeeklySharedResult';result.hidden=true;
   result.setAttribute('aria-label','Resultado del Pick de la Semana');$('picksFeaturedCard')?.before(result);
   document.addEventListener('cam:weekly-render',()=>{decorate();refreshPublic();if(panel.open)refreshAdmin();});
   if(typeof window.updateAeWeeklyAdmin==='function'){
     const original=window.updateAeWeeklyAdmin;
     window.updateAeWeeklyAdmin=function(...args){const returned=original.apply(this,args);syncAdmin();return returned;};
   }
   db.auth.onAuthStateChange(()=>setTimeout(syncAdmin,100));
   document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncAdmin();refreshPublic();}});
   syncAdmin();refreshPublic();showShared();
 }
 window.camWeeklyResults={replyUrl,socialSummary};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
