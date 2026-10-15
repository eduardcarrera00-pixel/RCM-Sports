/* Community Picks: real persistence, server-enforced rules, no wagering/payments. */
(() => {
'use strict';
let loaded=false,request=0,limit=20,posting=false;
const $=id=>document.getElementById(id);
function el(tag,text,cls){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b;}
function message(error){return error?.code==='23505'?'Ya publicaste tu Pick de hoy. Podrás publicar otro mañana (hora de Toronto).':error?.message||'No pudimos completar la operación. Inténtalo de nuevo.';}
async function account(){if(!db)throw Error('Sin conexión.');const r=await db.auth.getUser();if(r.error)throw r.error;if(!r.data.user){closeDetail();openUserAuthModal();return null;}return r.data.user;}
function link(id){const u=new URL(location.href);u.searchParams.delete('article');u.searchParams.delete('comment');u.searchParams.set('pick',id);u.hash='';return u.href;}
function open(id){history.pushState({},'',link(id));showDetail(id);}
function card(p,compact=false){
 const n=el('article',null,'cp-card');n.append(el('p',p.author+' · '+new Date(p.created_at).toLocaleDateString('es'),'cp-meta'));
 const title=el('h3');const a=el('a',p.title);a.href=link(p.id);a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();open(p.id);};title.append(a);n.append(title);
 for(const leg of p.legs||[]){n.append(el('p',leg.sport+' · '+leg.event,'cp-meta'),el('p',leg.selection));}
 n.append(el('strong','Cuota +'+p.american_odds+' · '+Number(p.decimal_odds).toFixed(2)+' decimal','cp-odds'),el('small','Cuota declarada · No verificada'));
 if(p.explanation)n.append(el('p',p.explanation,'cp-explanation'));
 const controls=el('div',null,'cp-actions');
 for(const [value,label,count] of [[1,'▲',p.upvotes],[-1,'▼',p.downvotes]]){
 const b=button(label+' '+count,()=>vote(p,value,b));b.setAttribute('aria-label',(value===1?'Apoyar':'Cuestionar')+' Pick de '+p.author);b.setAttribute('aria-pressed',String(Number(p.my_vote)===value));controls.append(b);}
 controls.append(el('span','Balance '+p.score),button('Respuestas · '+p.comments_count,()=>open(p.id)));n.append(controls);
 if(currentAdmin&&!compact)n.append(button('Ocultar Pick',async()=>{const r=await db.from('ae_community_picks').update({hidden:true}).eq('id',p.id);if(r.error)notifyCommunity(message(r.error),true);else{closeDetail();load();}}));
 return n;
}
async function vote(p,value,b){b.disabled=true;try{const user=await account();if(!user)return;if(user.id===p.user_id)throw Error('No puedes votar tu propio Pick.');
 let q;if(Number(p.my_vote)===value)q=db.from('ae_pick_votes').delete().eq('pick_id',p.id).eq('user_id',user.id);
 else if(Number(p.my_vote))q=db.from('ae_pick_votes').update({value}).eq('pick_id',p.id).eq('user_id',user.id);
 else q=db.from('ae_pick_votes').insert({pick_id:p.id,value});
 const r=await q;if(r.error)throw r.error;await load();if($('cpDialog')?.open)await showDetail(p.id);
 }catch(e){notifyCommunity(message(e),true);}finally{b.disabled=false;}}
async function load(){
 if(!db)return;const seq=++request;const order=$('cpSort')?.value||'score';
 try{const [feed,top,worst,weekly]=await Promise.all([
 db.from('ae_pick_feed').select('*').order(order,{ascending:false}).order('created_at',{ascending:false}).order('id').range(0,limit-1),
 db.from('ae_pick_feed').select('*').gt('upvotes',0).order('upvotes',{ascending:false}).order('created_at').order('id').range(0,2),
 db.from('ae_pick_feed').select('*').gt('downvotes',0).order('downvotes',{ascending:false}).order('created_at').order('id').range(0,0),
 db.from('ae_pick_feed').select('*').eq('is_current_week',true).gt('upvotes',0).order('upvotes',{ascending:false}).order('created_at').order('id').range(0,0)]);
 if(seq!==request)return;for(const r of [feed,top,worst,weekly])if(r.error)throw r.error;
 $('cpFeed').replaceChildren(...feed.data.map(p=>card(p)));$('cpStatus').textContent=feed.data.length?'':'Todavía no hay Picks. Comparte el primero.';
 $('cpMore').hidden=feed.data.length<limit;
 $('cpTop').replaceChildren(...top.data.map(p=>card(p,true)));if(!top.data.length)$('cpTop').append(el('p','Los Picks con votos positivos aparecerán aquí.'));
 $('cpWorst').replaceChildren(...worst.data.map(p=>card(p,true)));if(!worst.data.length)$('cpWorst').append(el('p','Todavía no hay Picks con votos negativos.'));

 loaded=true;
 }catch(e){if(seq!==request)return;for(const id of ['cpFeed','cpTop','cpWorst'])$(id).replaceChildren();$('cpMore').hidden=true;$('cpStatus').textContent='No pudimos cargar los Picks. '+message(e);}
}
function field(label,type='text'){const wrap=el('label',label);const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.required=true;wrap.append(input);return {wrap,input};}
function buildComposer(){
 const form=$('cpForm'),title=field('Título del Pick'),explanation=field('Tu explicación (opcional)','textarea');title.input.maxLength=160;title.input.minLength=3;explanation.input.required=false;explanation.input.maxLength=2000;form.append(title.wrap,explanation.wrap);
 const legs=el('div',null,'cp-legs'),rows=[];const output=el('output',''),status=el('p','', 'cp-status');status.setAttribute('role','status');
 function values(){return rows.map(r=>({sport:r.sport.input.value.trim(),event:r.event.input.value.trim(),selection:r.selection.input.value.trim(),odds:Number(r.odds.input.value)}));}
 function calculate(){const valid=values().every(l=>Number.isInteger(l.odds)&&Math.abs(l.odds)>=100&&Math.abs(l.odds)<=100000);const decimal=values().reduce((v,l)=>v*(l.odds>0?1+l.odds/100:1+100/Math.abs(l.odds)),1);output.textContent=valid?'Cuota combinada: '+(decimal>=2?'+'+Math.round((decimal-1)*100):'inferior al mínimo +100')+' · '+decimal.toFixed(2)+' decimal':'Introduce cuotas americanas, por ejemplo +150 o -110.';return valid&&decimal>=2;}
 const add=button('Añadir segunda selección',()=>addRow());
 function addRow(){if(rows.length>=2)return;const box=el('fieldset');box.append(el('legend','Selección '+(rows.length+1)));const row={box};for(const [key,label] of [['sport','Deporte'],['event','Partido (equipos)'],['selection','Pronóstico'],['odds','Cuota americana (+150, -110)']]){row[key]=field(label);row[key].input.maxLength=key==='odds'?7:key==='selection'?200:key==='sport'?40:160;if(key==='odds')row[key].input.pattern='[+-]?[0-9]{3,6}';box.append(row[key].wrap);}rows.push(row);if(rows.length===2)box.append(button('Quitar segunda selección',()=>{rows.pop();box.remove();add.hidden=false;calculate();}));legs.append(box);add.hidden=rows.length===2;}
 addRow();form.append(legs,add,output,el('p','Una publicación por día (Toronto). Las cuotas son declaradas y no se verifican con una casa de apuestas. No combines selecciones del mismo partido. Una vez publicado, no podrás editar el Pick.','cp-meta'));
 const confirm=el('label','He revisado las selecciones y la cuota.');const checkbox=el('input');checkbox.type='checkbox';checkbox.required=true;confirm.prepend(checkbox);form.append(confirm);
 const submit=el('button','Publicar Pick');submit.type='submit';form.append(submit,status);form.addEventListener('input',calculate);
 form.onsubmit=async e=>{e.preventDefault();if(posting)return;status.textContent='';try{const user=await account();if(!user)return;if(!calculate())throw Error('Revisa las cuotas: el total mínimo es +100.');posting=true;submit.disabled=true;const r=await db.from('ae_community_picks').insert({title:title.input.value.trim(),explanation:explanation.input.value.trim(),legs:values()}).select('id').single();if(r.error)throw r.error;form.reset();calculate();await load();status.textContent='Pick publicado.';open(r.data.id);}catch(e){status.textContent=message(e);}finally{posting=false;submit.disabled=false;}};
 calculate();
}
function closeDetail(){const d=$('cpDialog');if(d)d.close();}
async function showDetail(id){
 if(!/^[0-9a-f-]{36}$/i.test(id))return;
 let dialog=$('cpDialog');if(!dialog){dialog=el('dialog',null,'rcm-dialog cp-dialog');dialog.id='cpDialog';dialog.setAttribute('aria-label','Pick y respuestas');document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();const u=new URL(location.href);u.searchParams.delete('pick');history.replaceState({},'',u);});}
 dialog.replaceChildren(button('Cerrar',closeDetail),el('p','Cargando Pick…'));if(!dialog.open)dialog.showModal();
 try{const [pick,comments]=await Promise.all([db.from('ae_pick_feed').select('*').eq('id',id).maybeSingle(),db.from('ae_pick_comments').select('*').eq('pick_id',id).eq('hidden',false).order('created_at').limit(200)]);
 if(!dialog.isConnected||new URL(location.href).searchParams.get('pick')!==id)return;
 if(pick.error||comments.error)throw pick.error||comments.error;dialog.replaceChildren(button('Cerrar',closeDetail));if(!pick.data){dialog.append(el('p','Este Pick no está disponible.'));return;}dialog.append(card(pick.data));
 const share=el('a','Enlace permanente');share.href=link(id);dialog.append(share,el('h3','Conversación'));
 const replyStatus=el('p',''),form=el('form'),body=field('Tu comentario','textarea');body.input.maxLength=2000;let parent=null;
 const cancel=button('Cancelar respuesta',()=>{parent=null;replyStatus.textContent='';cancel.hidden=true;});cancel.hidden=true;
 const names=new Map(comments.data.map(c=>[c.id,c.author]));
 for(const c of comments.data){const item=el('article',null,'cp-comment');item.append(el('strong',c.author));if(c.parent_id)item.append(el('small','En respuesta a '+(names.get(c.parent_id)||'un comentario anterior')));item.append(el('p',c.body));item.append(button('Responder',()=>{parent=c.id;replyStatus.textContent='Respondiendo a '+c.author;cancel.hidden=false;body.input.focus();}));if(currentAdmin)item.append(button('Ocultar comentario',async()=>{const r=await db.from('ae_pick_comments').update({hidden:true}).eq('id',c.id);if(r.error)notifyCommunity(message(r.error),true);else showDetail(id);}));dialog.append(item);}
 if(!comments.data.length)dialog.append(el('p','Abre la conversación.'));
 if(comments.data.length===200)dialog.append(el('p','Se muestran los primeros 200 comentarios.'));
 const send=el('button','Enviar respuesta');send.type='submit';form.append(replyStatus,cancel,body.wrap,send);form.onsubmit=async e=>{e.preventDefault();send.disabled=true;try{if(!await account())return;const r=await db.from('ae_pick_comments').insert({pick_id:id,parent_id:parent,body:body.input.value.trim()});if(r.error)throw r.error;await load();await showDetail(id);}catch(e){notifyCommunity(message(e),true);}finally{send.disabled=false;}};dialog.append(form);
 }catch(e){dialog.replaceChildren(button('Cerrar',closeDetail),el('p',message(e)));}
}
window.renderCommunityPicksVisibility=()=>{const root=$('communityPicks');if(!root)return;root.hidden=currentCategory!=='Takes';document.querySelector('.editorial-layout').hidden=currentCategory==='Picks'||currentCategory==='Takes';if(!root.hidden&&!loaded)load();};
document.addEventListener('DOMContentLoaded',()=>{buildComposer();renderCommunityPicksVisibility();load();const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);$('cpSort').onchange=()=>{limit=20;load();};$('cpMore').onclick=()=>{limit+=20;load();};if(db)db.auth.onAuthStateChange(()=>setTimeout(()=>{load();const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);},0));});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
window.addEventListener('popstate',()=>{const id=new URL(location.href).searchParams.get('pick');if(id)showDetail(id);else closeDetail();});
})();
