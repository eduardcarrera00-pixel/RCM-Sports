/* Rankings and picks use Supabase for every persistent change. */
const sports = {clubs:[], season:'2026/27', ranking:null, editions:[], picks:[], totals:[], pending:null, busy:false, request:0};
const outcomeLabels={pending:'Pendiente',won:'Acertado',lost:'Fallado',void:'Anulado'};
function sportsButton(text, action) {const b=node('button',text);b.type='button';b.onclick=action;return b;}
function sportsDialog(title) {
 if(document.getElementById('sportsDialog'))return null;
 const d=node('dialog',null,'rcm-dialog');d.id='sportsDialog';d.setAttribute('aria-label',title);
 const status=node('p');status.setAttribute('role','status');
 d.append(node('h2',title),status,sportsButton('Cerrar',()=>d.close()));
 d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();return {d,status};
}
function sportsField(parent,label,value='',type='text') {
 const wrap=node('label',label);const input=node(type==='textarea'?'textarea':'input');
 if(type!=='textarea')input.type=type;input.value=value??'';wrap.append(input);parent.append(wrap);return input;
}
function sportsSelect(parent,label,options,value='') {
 const wrap=node('label',label),select=node('select');options.forEach(([id,name])=>select.append(new Option(name,id)));
 select.value=value;select.setAttribute('aria-label',label);wrap.append(select);parent.append(wrap);return select;
}
async function checked(query) {const r=await query;if(r.error)throw r.error;return r.data;}
function publicSportsClient() {return window.supabase.createClient(db.supabaseUrl,db.supabaseKey,{auth:{storageKey:'rcm-public-sports-check',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
function errorText(e){return e.message?.includes('RCM_CONFLICT')?'Otro administrador publicó cambios. Cierra y reabre el editor para revisar la versión actual.':(e.message||'No se pudo confirmar la operación. Revisa tu conexión.');}
async function sportsSave(dialog,action) {
 if(dialog.d.dataset.busy)return;dialog.d.dataset.busy='1';const controls=[...dialog.d.querySelectorAll('button,input,select,textarea')];controls.forEach(x=>x.disabled=true);
 dialog.d.oncancel=e=>e.preventDefault();dialog.status.textContent='Guardando…';
 try {await action();} catch(e){dialog.status.textContent=errorText(e)+' Conservamos el formulario.';}
 finally {delete dialog.d.dataset.busy;controls.forEach(x=>x.disabled=false);dialog.d.oncancel=null;}
}
function clubNode(id,i) {
 const c=sports.clubs.find(c=>c.id===id),li=node('li',null,'rcm-team');li.append(node('strong',String(i+1)));
 if(c){const img=node('img');img.src=c.logo;img.alt='';img.width=58;img.height=58;img.onerror=()=>img.replaceWith(node('span',c.name));li.append(img,node('span',c.name));}
 else li.append(node('span','Club no disponible'));return li;
}
function renderChampions() {
 const r=sports.ranking;document.getElementById('championsEdition').textContent=r?.edition||'';
 document.getElementById('championsStatus').textContent=r?'':'Aún no hay un ranking publicado.';
 const list=document.getElementById('championsList'),track=document.getElementById('championsTrack');list.replaceChildren();track.replaceChildren();
 if(!r)return;r.team_ids.forEach((id,i)=>list.append(clubNode(id,i)));
 for(let n=0;n<2;n++){const group=node('ol',null,'rcm-track-group');group.setAttribute('aria-hidden','true');r.team_ids.forEach((id,i)=>group.append(clubNode(id,i)));track.append(group);}
}
async function refreshChampions() {
 try {
 sports.clubs=await checked(db.from('champions_clubs').select('*').eq('season',sports.season).order('name'));
 const ranks=await checked(db.from('champions_rankings').select('*').eq('season',sports.season).order('published_at',{ascending:false}).order('id',{ascending:false}).limit(1));
 sports.ranking=ranks[0]||null;renderChampions();
 }catch(e){document.getElementById('championsStatus').textContent='Ranking no disponible. '+errorText(e);}
}
async function openChampionsEditor(){
 if(!currentAdmin)return;const ui=sportsDialog('Editar Champions Power Rankings');if(!ui)return;
 try {
 await refreshChampions();
 const draft=await checked(db.from('champions_drafts').select('*').eq('user_id',currentAdmin.id).eq('season',sports.season).maybeSingle());
 const source=draft||sports.ranking;let base=draft?draft.base_id:sports.ranking?.id||null;
 const edition=sportsField(ui.d,'Jornada o edición',source?.edition||'');edition.maxLength=100;
 const ids=source?.team_ids?[...source.team_ids]:Array(10).fill('');const rows=node('div');ui.d.append(rows);
 function draw(){rows.replaceChildren();ids.forEach((id,i)=>{const row=node('div',null,'rcm-ranking-edit-row');const select=node('select');select.setAttribute('aria-label','Club en posición '+(i+1));select.append(new Option('Seleccionar club',''));
 sports.clubs.filter(c=>c.participating).forEach(c=>{const opt=new Option(c.name,c.id);opt.disabled=ids.includes(c.id)&&id!==c.id;select.append(opt);});select.value=id;select.onchange=()=>{ids[i]=select.value;draw();rows.children[i].querySelector('select').focus();};row.append(node('span',String(i+1)),select);
 for(const delta of [-1,1]){const b=sportsButton(delta<0?'↑':'↓',()=>{[ids[i],ids[i+delta]]=[ids[i+delta],ids[i]];draw();});b.disabled=i+delta<0||i+delta>9;b.setAttribute('aria-label',(delta<0?'Subir':'Bajar')+' club '+(i+1));row.append(b);}rows.append(row);});}draw();
 ui.status.textContent='El borrador es privado. Publicar guarda las diez posiciones juntas. Temporada '+sports.season;
 ui.d.append(sportsButton('Guardar borrador',()=>sportsSave(ui,async()=>{await checked(db.from('champions_drafts').upsert({user_id:currentAdmin.id,season:sports.season,edition:edition.value,team_ids:ids,base_id:base}));ui.status.textContent='Borrador privado guardado.';})),
 sportsButton('Publicar las diez posiciones',()=>sportsSave(ui,async()=>{
 const id=await checked(db.rpc('rcm_publish_champions',{p_season:sports.season,p_edition:edition.value,p_team_ids:ids,p_expected_id:base}));
 const r=await checked(publicSportsClient().from('champions_rankings').select('*').eq('id',id).maybeSingle());
 if(!r||JSON.stringify(r.team_ids)!==JSON.stringify(ids)||r.edition!==edition.value.trim())throw new Error('No se pudo verificar esta edición desde la sesión pública. Reabre el editor antes de reintentar.');
 base=id;await refreshChampions();ui.status.textContent='Ranking publicado y verificado desde una sesión sin autenticación.';
 })));
 }catch(e){ui.status.textContent=errorText(e);}
}
function activeEdition(){return sports.editions.find(e=>new Date(e.starts_at)<=new Date());}
function editionOpen(e){return e&&e.id===activeEdition()?.id&&new Date(e.starts_at)<=new Date()&&new Date(e.closes_at)>new Date();}
function pickCard(p,e,canVote=false){
 const card=node('article',null,'rcm-pick-card');card.append(node('strong',p.title),node('p',`${p.sport} · ${p.event}`),node('p',p.description));
 const total=sports.totals.find(t=>t.pick_id===p.id);if(total){
 const choice=sportsButton(`${total.my_vote?'✓ Tu selección · ':''}${Number(total.votes)} apoyos${canVote?' · Apoyar':''}`,()=>choosePick(e.id,p.id));
 choice.setAttribute('aria-pressed',String(total.my_vote));choice.disabled=!canVote||sports.busy;card.append(choice);}
 if(p.outcome!=='pending')card.append(node('span',outcomeLabels[p.outcome],'rcm-outcome'),node('p',p.result),node('p',p.resolved_at?new Date(p.resolved_at).toLocaleDateString('es'):''));
 if(p.article_id){const a=node('a','Ver análisis');a.href=articleURL(p.article_id);card.append(a);}return card;
}
function renderPicks(){
 const e=activeEdition(),box=document.getElementById('picksOptions');box.replaceChildren();
 document.getElementById('picksStatus').textContent=e?`${e.edition} · ${editionOpen(e)?'Cierra '+new Date(e.closes_at).toLocaleString('es'):'Votación cerrada'}`:'Estamos preparando los próximos picks.';
 if(e)sports.picks.filter(p=>p.edition_id===e.id).sort((a,b)=>a.position-b.position).forEach(p=>box.append(pickCard(p,e,editionOpen(e)&&p.outcome==='pending')));
 const history=document.getElementById('picksHistory');history.replaceChildren();
 sports.editions.filter(x=>x.id!==e?.id&&new Date(x.starts_at)<=new Date()).forEach(old=>{const detail=node('details');detail.append(node('summary',old.edition));sports.picks.filter(p=>p.edition_id===old.id).forEach(p=>detail.append(pickCard(p,old)));history.append(detail);});
 if(!history.children.length)history.append(node('p','Aún no hay ediciones anteriores.'));
 const best=document.getElementById('bestPicksCards');best.replaceChildren();sports.picks.filter(p=>p.outcome==='won'&&p.featured_order&&sports.editions.some(e=>e.id===p.edition_id&&new Date(e.starts_at)<=new Date())).sort((a,b)=>a.featured_order-b.featured_order).slice(0,5).forEach(p=>best.append(pickCard(p)));
 if(!best.children.length)best.append(node('p','Aquí aparecerán nuestros aciertos destacados cuando haya resultados registrados.'));
}
async function refreshPicks(){
 const request=++sports.request;
 try {
 const [editions,picks,totals]=await Promise.all([
 fetchAll(()=>db.from('pick_editions').select('*').order('starts_at',{ascending:false}).order('id')),
 fetchAll(()=>db.from('sports_picks').select('*').order('id')),
 checked(db.rpc('rcm_pick_totals'))]);
 if(request!==sports.request)return;sports.editions=editions;sports.picks=picks;sports.totals=totals||[];renderPicks();
 }catch(e){document.getElementById('picksStatus').textContent='No pudimos actualizar los picks. '+errorText(e);document.querySelectorAll('#picksOptions button').forEach(b=>b.disabled=true);}
}
async function choosePick(edition,id){
 if(!currentUser){sports.pending={edition,id};openUserAuthModal();return;}
 if(sports.busy)return;sports.busy=true;renderPicks();
 try{await checked(db.rpc('rcm_choose_pick',{p_edition_id:edition,p_pick_id:id}));sports.pending=null;await refreshPicks();}
 catch(e){notifyCommunity(errorText(e),true);}finally{sports.busy=false;renderPicks();}
}
function articleSelect(parent,value){return sportsSelect(parent,'Análisis vinculado',[['','Sin publicación vinculada'],...articles.filter(a=>a.category==='Picks'&&a.remote).map(a=>[String(a.id),a.title])],value||'');}
function optionFields(parent,source={}) {
 return {title:sportsField(parent,'Título corto',source.title),description:sportsField(parent,'Descripción',source.description,'textarea'),sport:sportsField(parent,'Deporte',source.sport),event:sportsField(parent,'Partido o evento',source.event),article_id:articleSelect(parent,source.article_id)};
}
function values(fields){return Object.fromEntries(Object.entries(fields).map(([k,input])=>[k,input.value.trim()]));}
function localDate(iso){const d=iso?new Date(iso):new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
async function openPicksEditor(){
 if(!currentAdmin)return;const ui=sportsDialog('Preparar Picks de la Semana');if(!ui)return;
 try{
 const [draft,latest]=await Promise.all([checked(db.from('pick_drafts').select('*').eq('user_id',currentAdmin.id).maybeSingle()),checked(db.from('pick_editions').select('*').order('published_at',{ascending:false}).order('id',{ascending:false}).limit(1))]);
 // A draft of an already published edition is not reused as the next week's predictions.
 const source=draft?.payload||{};let base=draft?draft.base_id:latest[0]?.id||null;
 const edition=sportsField(ui.d,'Semana o edición',source.edition);edition.maxLength=100;
 const start=sportsField(ui.d,'Inicio (tu hora local)',localDate(source.starts_at),'datetime-local');
 const close=sportsField(ui.d,'Cierre (tu hora local)',source.closes_at?localDate(source.closes_at):'','datetime-local');
 const options=[0,1].map(i=>{const f=node('fieldset');f.append(node('legend','Pick '+(i+1)));ui.d.append(f);return optionFields(f,source.options?.[i]);});
 const payload=()=>({edition:edition.value.trim(),starts_at:start.value?new Date(start.value).toISOString():null,closes_at:close.value?new Date(close.value).toISOString():null,options:options.map(values)});
 ui.status.textContent='Publicar crea una edición nueva con dos picks. Puedes programar su inicio. Resolver un resultado cierra la votación completa.';
 ui.d.append(sportsButton('Guardar borrador',()=>sportsSave(ui,async()=>{await checked(db.from('pick_drafts').upsert({user_id:currentAdmin.id,payload:payload(),base_id:base}));ui.status.textContent='Borrador privado guardado.';})),sportsButton('Publicar edición',()=>sportsSave(ui,async()=>{
 const data=payload();const id=await checked(db.rpc('rcm_publish_picks',{p_payload:data,p_expected_id:base}));base=id;
 if(new Date(data.starts_at)<=new Date()){
 const rows=await checked(publicSportsClient().from('sports_picks').select('*').eq('edition_id',id));
 if(rows.length!==2)throw new Error('No se pudo verificar la lectura pública. Reabre el editor para revisar.');
 }
 await refreshPicks();ui.status.textContent=new Date(data.starts_at)>new Date()?'Edición programada. Será pública automáticamente a la hora de inicio.':'Edición publicada y lectura pública verificada.';
 })));
 }catch(e){ui.status.textContent=errorText(e);}
}
async function openResultsEditor(){
 if(!currentAdmin)return;const ui=sportsDialog('Historial y mejores aciertos');if(!ui)return;
 await refreshPicks();
 const select=sportsSelect(ui.d,'Pick',[['','Seleccionar pick'],...sports.picks.map(p=>[p.id,`${sports.editions.find(e=>e.id===p.edition_id)?.edition||''} · ${p.title}`])]);
 const form=node('div');ui.d.append(form);
 select.onchange=()=>{form.replaceChildren();const p=sports.picks.find(p=>p.id===select.value);if(!p)return;
 const fields=optionFields(form,p);fields.outcome=sportsSelect(form,'Resultado',Object.entries(outcomeLabels),p.outcome);fields.result=sportsField(form,'Resultado real y explicación',p.result,'textarea');
 fields.resolved_at=sportsField(form,'Fecha del resultado (hora local)',p.resolved_at?localDate(p.resolved_at):'','datetime-local');
 fields.featured_order=sportsSelect(form,'Posición destacada',[['','No destacar'],...[1,2,3,4,5].map(n=>[String(n),String(n)])],String(p.featured_order||''));
 form.append(node('p','Solo los acertados pueden destacarse. Para intercambiar posiciones ocupadas, retira uno de destacados primero; el historial se conserva.'),sportsButton('Guardar resultado',()=>sportsSave(ui,async()=>{
 const data=values(fields);data.resolved_at=data.resolved_at?new Date(data.resolved_at).toISOString():null;
 await checked(db.rpc('rcm_update_pick',{p_id:p.id,p_expected_version:p.version,p_data:data}));await refreshPicks();select.onchange();ui.status.textContent='Resultado guardado. La modificación quedó registrada en el historial.';
 })));
 };
}
async function refreshSportsSession(){
 document.querySelectorAll('[data-sports-admin]').forEach(b=>b.hidden=!currentAdmin);
 if(!currentAdmin)document.getElementById('sportsDialog')?.close();
 await refreshPicks();if(currentUser&&sports.pending){const {edition,id}=sports.pending;sports.pending=null;await choosePick(edition,id);}
}
window.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('.rcm-ticker').forEach(t=>{for(const event of ['pointerdown','keydown','wheel'])t.addEventListener(event,()=>t.classList.add('manual'),{passive:true});});
 if(!db)return;refreshChampions();refreshSportsSession();
 setInterval(()=>{if(!document.hidden){refreshPicks();if(currentCategory==='Fútbol')refreshChampions();}},30000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPicks();});
});
