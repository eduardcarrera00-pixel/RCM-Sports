/* AE SPORTS · Presentación premium y subida segura de imágenes editoriales. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const allowed={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 const maxSize=5*1024*1024;
 const fileChecks=file=>{
   if(!file)return;
   if(!Object.prototype.hasOwnProperty.call(allowed,file.type))throw Error('Solo se permiten imágenes JPG, PNG o WEBP.');
   if(file.size===0||file.size>maxSize)throw Error('La imagen debe pesar menos de 5 MB.');
 };
 function preview(input,targetId){
   const target=$(targetId);if(!target)return;
   const file=input?.files?.[0];
   target.replaceChildren();
   if(!file)return;
   try { fileChecks(file); }catch(err){input.value='';target.textContent=err.message;return;}
   const url=URL.createObjectURL(file);
   const img=document.createElement('img');img.src=url;img.alt='Vista previa de imagen seleccionada';img.loading='lazy';
   img.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
   img.addEventListener('error',()=>URL.revokeObjectURL(url),{once:true});
   target.append(img);
 }
 async function upload(file,folder){
   if(!file)return null;
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
   if(!path||typeof path!=='string'||!/^(?:weekly\\/(?:banner|article)\\/|articles\\/)[0-9a-f-]{36}\\.(?:jpg|png|webp)$/.test(path))return '';
   if(typeof db==='undefined'||!db?.storage)return '';
   const result=db.storage.from('article-images').getPublicUrl(path);
   return result.data?.publicUrl||'';
 }
 function arrange(){
   const root=$('footballTakes'),layout=root?.querySelector('.ae-picks-layout'),aside=layout?.querySelector('.ae-picks-rail');
   const overview=root?.querySelector('.ae-picks-overview');
   if(!layout||!aside||!overview)return;
   const news=$('picksNews'),top=overview.querySelector('.ae-picks-small-top');
   if(news)aside.insertBefore(news,aside.firstChild);
   if(top)aside.insertBefore(top,aside.querySelector('.ae-takes-side'));
   overview.remove();
   layout.classList.add('ae-premium-picks-grid');
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
 document.addEventListener('DOMContentLoaded',()=>{arrange();initPreview();});
})();
