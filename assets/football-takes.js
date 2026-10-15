/* AE SPORTS · Admin-curated Picks. Freeform Takes are separate. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const leagues = {laliga:'LaLiga',premier:'Premier League',ligamx:'Liga MX',champions:'Champions League',nfl:'NFL',colegial:'Fútbol colegial'};
 let league = 'all', period = 'all', questions = [], options = [], mine = [], pending = false, request = 0, rankingMode = 'general';
 const el = (tag, content, cls) => {const n=document.createElement(tag); if(content!==undefined) n.textContent=String(content); if(cls)n.className=cls;return n;};
 const message = txt => {$('takesStatus').textContent=txt;};
 function optionList(q) {return options.filter(o=>o.question_id===q.id);}
 function isOpen(q) {return q.status==='open' && new Date(q.closes_at).getTime()>Date.now();}
 function formatClose(s) {return new Intl.DateTimeFormat('es',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(s));}
 function btn(text,action,cls='ae-take-button'){const n=el('button',text,cls);n.type='button';n.onclick=action;return n;}
 function renderCard(q) {
   const box=el('article',undefined,'ae-take-card');
   const label=el('div',(leagues[q.competition]||'Deportes')+' · '+(q.period==='weekly'?'Semanal':'Temporada')+' · '+q.points+' puntos','ae-take-overline');
   const title=el('h3',q.prompt);
   const info=el('p',q.status==='settled'?'Resultado confirmado':isOpen(q)?'Cierra el '+formatClose(q.closes_at):'Predicción cerrada','ae-take-info');
   const choices=el('div',undefined,'ae-take-choices');
   const existing=mine.find(x=>x.question_id===q.id);
   optionList(q).forEach(o=>{
     const chosen=existing?.option_id===o.id;
     const winner=q.status==='settled' && q.correct_option_id===o.id;
     const text=o.label+(chosen?' · Tu elección':'')+(winner?' · Correcta':'');
     const b=btn(text,()=>submit(q,o));
     b.disabled=pending || !isOpen(q) || Boolean(existing);
     if(chosen)b.classList.add('ae-take-selected');
     if(winner)b.classList.add('ae-take-win');
     choices.append(b);
   });
   if(existing && q.status==='settled'){
     const earned=el('p','Puntos obtenidos: +'+existing.awarded_points,'ae-take-award');
     box.append(label,title,info,choices,earned);
   } else box.append(label,title,info,choices);
   if(typeof currentAdmin!=='undefined'&&currentAdmin && q.status==='open'){
     const admin=el('div',undefined,'ae-take-admin-actions');
     if(!isOpen(q)){
       const select=el('select');select.setAttribute('aria-label','Resultado oficial de '+q.prompt);
       const empty=el('option','Selecciona el resultado oficial');empty.value='';select.append(empty);
       optionList(q).forEach(o=>{const n=el('option',o.label);n.value=o.id;select.append(n);});
       admin.append(select,btn('Validar resultado',async()=>{
         if(!select.value || pending)return;
         if(!confirm('¿Confirmar este resultado oficial y repartir los puntos?'))return;
         await adminAction('ae_settle_take',{p_question_id:q.id,p_option_id:select.value},'Resultado confirmado');
       }));
     }
     admin.append(btn('Anular Pick',async()=>{if(confirm('¿Anular este Pick sin otorgar puntos?'))await adminAction('ae_void_take',{p_question_id:q.id},'Pregunta anulada');},'ae-take-minor'));
     box.append(admin);
   }
   return box;
 }
 function renderQuestions(){
   const target=$('takesQuestions');target.replaceChildren();
   const visible=questions.filter(q=>(league==='all'||q.competition===league) && (period==='all'||q.period===period))
       .filter(q=>q.status!=='void').sort((a,b)=>(isOpen(b)?1:0)-(isOpen(a)?1:0)||new Date(a.closes_at)-new Date(b.closes_at));
   $('takesCount').textContent=visible.length+' Picks';
   if(!visible.length)target.append(el('p','Todavía no hay Picks publicados para esta selección.','ae-take-empty'));
   else visible.forEach(q=>target.append(renderCard(q)));
   document.querySelectorAll('[data-takes-league]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.takesLeague===league)));
   document.querySelectorAll('[data-takes-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.takesPeriod===period)));
   $('takesAdmin').hidden=!(typeof currentAdmin!=='undefined'&&currentAdmin);
 }
 async function submit(q,o){
   if(pending)return;
   if(!db)return message('La conexión no está disponible.');
   const session=await db.auth.getUser();
   if(!session.data?.user){if(typeof openUserAuthModal==='function')openUserAuthModal();return;}
   if(!confirm('Guardar tu Pick: '+o.label+'\nNo podrás cambiarlo después.'))return;
   pending=true;renderQuestions();
   try{
     const r=await db.rpc('ae_submit_take',{p_question_id:q.id,p_option_id:o.id});
     if(r.error)throw r.error;
     message('¡Pick registrado! Se validará cuando finalice el evento.');
     await load();
   }catch(e){message(e.message||'No se pudo registrar la predicción.');}
   finally{pending=false;renderQuestions();}
 }
 async function adminAction(name,args,success){
   pending=true;renderQuestions();
   try{const r=await db.rpc(name,args);if(r.error)throw r.error;message(success);await load();}
   catch(e){message(e.message||'No se pudo guardar.');}
   finally{pending=false;renderQuestions();}
 }
 async function renderLeaderboard(){
   const target=$('takesLeaderboard');target.replaceChildren();
   const r=await db.rpc('ae_take_leaderboard',{p_scope:rankingMode});
   if(r.error){target.append(el('p','Clasificación temporalmente no disponible.'));return;}
   if(!r.data?.length){target.append(el('p','La clasificación empezará al validarse los primeros Picks.','ae-take-empty'));return;}
   const ol=el('ol',undefined,'ae-take-leaderboard-list');
   r.data.forEach((x,i)=>{const li=el('li');li.append(el('span',String(i+1).padStart(2,'0'),'ae-take-number'),el('span',x.username,'ae-take-name'),el('strong',x.points+' pts'));ol.append(li);});
   target.append(ol);
 }
 async function load(){
   if(!db)return message('No se pudo conectar con AE SPORTS.');
   const seq=++request;
   try{
     const q=await db.from('ae_take_questions').select('*').neq('status','void').order('closes_at',{ascending:true}).limit(300);
     if(q.error)throw q.error;
     if(seq!==request)return;
     questions=q.data||[];
     const ids=questions.map(x=>x.id);
     const session=await db.auth.getUser();
     const results=await Promise.all([
       ids.length?db.from('ae_take_options').select('id,question_id,label').in('question_id',ids):Promise.resolve({data:[],error:null}),
       session.data?.user?db.from('ae_take_predictions').select('question_id,option_id,awarded_points').eq('user_id',session.data.user.id):Promise.resolve({data:[],error:null})
     ]);
     if(seq!==request)return;
     if(results[0].error)throw results[0].error;
     if(results[1].error)throw results[1].error;
     options=results[0].data||[];mine=results[1].data||[];
     message('');
     renderQuestions();await Promise.all([renderPopular(),renderLeaderboard()]);
   }catch(e){message('No pudimos cargar los Picks. '+(e.message||'Inténtalo más tarde.'));}
 }
 async function create(e){
   e.preventDefault();if(pending)return;
   const f=e.currentTarget;
   const opts=f.elements.options.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
   const selectedLeague=f.elements.competition.value;
   const close=new Date(f.elements.closes.value);
   if(!Number.isFinite(close.getTime()))return message('Introduce una fecha de cierre válida.');
   pending=true;f.querySelector('[type=submit]').disabled=true;
   try{
     const r=await db.rpc('ae_create_take',{
       p_competition:f.elements.competition.value,p_period:f.elements.period.value,
       p_prompt:f.elements.prompt.value,p_closes_at:close.toISOString(),
       p_points:Number(f.elements.points.value),p_options:opts});
     if(r.error)throw r.error;
     f.reset();league=selectedLeague;period='all';
     message('Pick publicado. Ya pueden participar los usuarios.');
     await load();
   }catch(err){message(err.message||'No se pudo publicar el Pick.');}
   finally{pending=false;f.querySelector('[type=submit]').disabled=false;}
 }
 function visibility(){
   const root=$('footballTakes');if(!root)return;
   root.hidden=typeof currentCategory==='undefined'||currentCategory!=='Picks';
   if(!root.hidden)load();
 }
 window.renderPicksVisibility=visibility;

 async function renderPopular(){
   const target=$('picksPopular');if(!target||!db)return;
   const result=await db.rpc('ae_pick_top_choices',{p_limit:3});
   if(result.error){target.replaceChildren(el('li','No pudimos cargar los picks más votados.'));return;}
   target.replaceChildren();
   if(!result.data?.length){target.append(el('li','El Top 3 aparecerá cuando la comunidad empiece a elegir sus Picks.'));return;}
   result.data.forEach((choice,i)=>{
     const li=el('li',undefined,'ae-popular-item');
     li.append(el('span',String(i+1).padStart(2,'0'),'ae-popular-position'));
     const copy=el('div',undefined,'ae-popular-copy');
     copy.append(el('small',leagues[choice.competition]||choice.competition),el('strong',choice.option_label),el('span',choice.question_prompt));
     li.append(copy,el('span',choice.votes+' votos','ae-popular-votes'));
     target.append(li);
   });
 }
 document.addEventListener('DOMContentLoaded',()=>{
   document.querySelectorAll('[data-takes-league]').forEach(b=>b.addEventListener('click',()=>{league=b.dataset.takesLeague;renderQuestions();}));
   document.querySelectorAll('[data-takes-period]').forEach(b=>b.addEventListener('click',()=>{period=b.dataset.takesPeriod;renderQuestions();}));
   document.querySelectorAll('[data-takes-rank]').forEach(b=>b.addEventListener('click',()=>{rankingMode=b.dataset.takesRank;document.querySelectorAll('[data-takes-rank]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));renderLeaderboard();}));
   $('takesCreateForm')?.addEventListener('submit',create);
   $('takesReload')?.addEventListener('click',load);
   db?.auth.onAuthStateChange(()=>setTimeout(()=>{if(typeof currentCategory!=='undefined'&&currentCategory==='Picks')load();},150));
   visibility();
   if(typeof currentCategory==='undefined'||currentCategory!=='Picks') load();
 });
})();