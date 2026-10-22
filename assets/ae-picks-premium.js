/* AE SPORTS · Presentación premium y subida segura de imágenes editoriales. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 const maxSize=5*1024*1024;
 // Original permitido antes de comprimir en el navegador (fotos de móvil).
 const maxOriginal=25*1024*1024;
 const fileChecks=(file,limit=maxSize)=>{
   if(!file)return;
   if(!Object.prototype.hasOwnProperty.call(allowed,file.type))throw Error('Solo se permiten imágenes JPG, PNG o WEBP.');
   if(file.size===0||file.size>limit)throw Error('La imagen debe pesar menos de '+Math.round(limit/1048576)+' MB.');
 };
 function preview(input,targetId){
   const target=$(targetId);if(!target)return;
   const file=input?.files?.[0];
   target.replaceChildren();
   if(!file)return;
   try { fileChecks(file,maxOriginal); }catch(err){input.value='';target.textContent=err.message;return;}
   const url=URL.createObjectURL(file);
   const img=document.createElement('img');img.src=url;img.alt='Vista previa de imagen seleccionada';img.loading='lazy';
   img.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
   img.addEventListener('error',()=>URL.revokeObjectURL(url),{once:true});
   target.append(img);
 }
 async function upload(file,folder){
   if(!file)return null;
   fileChecks(file,maxOriginal);
   if(window.camCompressImage)file=await window.camCompressImage(file);
   fileChecks(file);
   if(!['weekly/banner','weekly/article','articles'].includes(folder))throw Error('Destino de imagen inválido.');
   if(typeof db==='undefined'||!db?.storage)throw Error('La conexión de imágenes no está disponible.');
   const user=await db.auth.getUser();
   if(user.error||!user.data?.user)throw Error('Inicia sesión como administrador para subir imágenes.');
   if(typeof currentAdmin==='undefined'||!currentAdmin)throw Error('Solo el equipo editorial puede subir imágenes.');
   const name=folder+'/'+crypto.randomUUID()+'.'+allowed[file.type];
   const r=await db.storage.from('article-images').upload(name,file,{contentType:file.type,cacheControl:'3600',upsert:false});
   if(r.error)throw Error('No se pudo guardar la imagen: '+r.error.message);
   return r.data?.path||name;
 }
 function publicUrl(path){
   if(!path||typeof path!=='string'||!/^(?:weekly\/(?:banner|article)\/|articles\/)[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(path))return '';
   if(typeof db==='undefined'||!db?.storage)return '';
   const result=db.storage.from('article-images').getPublicUrl(path);
   return result.data?.publicUrl||'';
 }
 /* Desktop-only community column:
    The Platos sidebar must not stretch the independent Eres Chef / latest
    Picks rows. Temporarily group those four *same* DOM nodes on desktop.
    On tablet/phone restore the original direct children (and mobile CSS).
    No publication data, event listeners or cards are recreated. */
 function arrangeCommunityDesktop(){
   const community=$('communityPicks');
   if(!community)return;
   const desktop=window.matchMedia('(min-width: 911px)');
   let leftColumn=null;
   let moderationMoved=false;
   let observer=null;
   let frame=0;
   const rail=community.querySelector(':scope > .ae-picks-rail');
   const clearHeight=()=>rail?.style.removeProperty('--ae-picks-desktop-plates-height');
   const alignBottom=()=>{
     frame=0;
     if(!desktop.matches||!leftColumn||!rail||community.hidden||!community.isConnected)return;
     // Moderation may add additional full-size editor controls. Do not
     // compress or clip that admin-only panel.
     if(rail.querySelector('#cpModeration:not([hidden])')){
       clearHeight();
       return;
     }
     const firstPick=leftColumn.querySelector('#cpFeed > .cp-card');
     // With no published predictions, preserve natural ranking heights.
     if(!firstPick){clearHeight();return;}
     // Keep the right-hand Platos column at 75% of the community frame.
     // Lists retain their own vertical scrolling; phone layout stays natural.
     const mainHeight=Math.ceil(leftColumn.getBoundingClientRect().height*.75);
     if(mainHeight>0&&Number.isFinite(mainHeight)){
       const height=mainHeight+'px';
       if(rail.style.getPropertyValue('--ae-picks-desktop-plates-height')!==height){
         rail.style.setProperty('--ae-picks-desktop-plates-height',height);
       }
     }
   };
   const schedule=()=>{
     if(frame)return;
     frame=requestAnimationFrame(alignBottom);
   };
   const stop=()=>{
     if(frame){cancelAnimationFrame(frame);frame=0;}
     observer?.disconnect();
     observer=null;
     clearHeight();
   };
   const sync=()=>{
     if(desktop.matches){
       if(leftColumn){schedule();return;}
       const nodes=[
         community.querySelector(':scope > .ae-picks-feed-heading'),
         community.querySelector(':scope > #cpStatus'),
         community.querySelector(':scope > #cpFeed'),
         community.querySelector(':scope > #cpFeedScrollHint'),
         community.querySelector(':scope > #cpFeedFooter')
       ];
       if(nodes.some(node=>!node))return;
       const column=document.createElement('div');
       column.className='ae-picks-community-main';
       community.insertBefore(column,nodes[0]);
       nodes.forEach(node=>column.appendChild(node));
       leftColumn=column;
       // Admin moderation is a separate full-width tool, not part of the
       // Platos height calculation; keep the real panel and its handlers.
       const moderation=rail?.querySelector(':scope > #cpModeration');
       const chefRankings=community.querySelector(':scope > .ae-chefs-dual-standings');
       if(moderation&&chefRankings){
         community.insertBefore(moderation,chefRankings);
         moderationMoved=true;
       }
       if(typeof ResizeObserver!=='undefined'){
         observer=new ResizeObserver(schedule);
         observer.observe(leftColumn);
       }
       schedule();
     }else if(leftColumn){
       stop();
       // Restore the same real nodes and handlers for the approved mobile
       // direct-child layout. No votes, drafts or cards are reconstructed.
       [...leftColumn.children].forEach(node=>community.insertBefore(node,leftColumn));
       leftColumn.remove();
       leftColumn=null;
       if(moderationMoved){
         const moderation=community.querySelector(':scope > #cpModeration');
         if(moderation&&rail)rail.appendChild(moderation);
         moderationMoved=false;
       }
     }
   };
   sync();
   if(desktop.addEventListener)desktop.addEventListener('change',sync);
   else if(desktop.addListener)desktop.addListener(sync);
   window.addEventListener('resize',schedule,{passive:true});
   // The feed is populated asynchronously, so a status update can occur
   // without changing the parent height. Re-align after child mutations.
   if(typeof MutationObserver!=='undefined'){
     const mutations=new MutationObserver(schedule);
     mutations.observe(community,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
   }
 }
 function initPreview(){
   for(const [id,target] of [['aeWeeklyBannerInput','aeWeeklyBannerPreview'],['aeWeeklyImageInput','aeWeeklyImagePreview'],['pubImageFile','pubImagePreview']]){
     $(id)?.addEventListener('change',event=>preview(event.target,target));
   }
   $('aeWeeklyPickForm')?.addEventListener('reset',()=>{
     for(const id of ['aeWeeklyBannerPreview','aeWeeklyImagePreview'])$(id)?.replaceChildren();
   });
 }
 window.aeEditorialMedia={upload,publicUrl};
 document.addEventListener('DOMContentLoaded',()=>{arrangeCommunityDesktop();initPreview();});
})();
