/* AE SPORTS league. All confirmation, grading and points are enforced by PostgreSQL. */
const league={offers:[],mine:[],top:[],highlights:[],featured:[],weeks:[],seasons:[],stats:{},profile:{},bySport:{},pending:null,busy:false,request:0,available:false};
const leagueStates={PENDING:'Pendiente',WIN:'Acertado',LOSS:'Fallado',VOID:'Anulado',PUSH:'Empate · 0 puntos',CANCELLED:'Cancelado',UNDER_REVIEW:'En revisión'};
function aeOdds(x){return Number(x)>0?'+'+x:String(x);}
function aeSelection(p){return p.selection==='home'?p.home:p.selection==='away'?p.away:'Empate';}
function aeDate(d){return new Date(d).toLocaleString('es',{dateStyle:'medium',timeStyle:'short'});}
function aeCard(p,offer=false){
 const card=node('article',null,'rcm-pick-card');card.append(node('strong',p.home+' vs. '+p.away),node('p',aeSelection(p)+' · '+aeOdds(p.american)),node('p',offer?`+${Number(p.points).toFixed(2)} / −${Number(p.points).toFixed(2)} AE Points`:`${leagueStates[p.state]||'Acertado'} · ${Number(p.points||0).toFixed(2)} AE Points`));
 if(offer){card.append(node('p',`${p.competition==='UCL'?'90 minutos + añadido':'Partido con overtime'} · Cierre ${aeDate(p.closes_at)}`));const b=sportsButton(p.open?'Ver y confirmar':'Cerrado',()=>openPickConfirmation(p.id));b.disabled=!p.open;card.append(b);}
 else{if(p.result)card.append(node('p','Resultado: '+p.result));if(p.accepted_at||p.date)card.append(node('p',(p.competition==='UCL'?'Fútbol':p.competition||'')+' · '+aeDate(p.accepted_at||p.date)));if(p.id)card.append(node('small','Recibo: '+p.id));}
 return card;
}
function leagueFilter(){const sport=document.getElementById('aeSport').value||null,period=document.getElementById('aePeriod').value;
 const now=new Date();const week=league.weeks.find(w=>new Date(w.starts_at)<=now&&new Date(w.ends_at)>now);const season=league.seasons.find(s=>new Date(s.starts_at)<=now&&new Date(s.ends_at)>now);
 const bounds=period==='week'?week:period==='season'?season:null;
 return {p_competition:sport,p_from:bounds?.starts_at||(period==='all'?null:'9998-01-01T00:00:00Z'),p_until:bounds?.ends_at||null};
}
async function fetchVisiblePicks(){
 const count=Math.max(1,Math.ceil(league.mine.length/100));const all=[];let cursor={};
 for(let page=0;page<count;page++){const rows=await checked(db.rpc('ae_my_picks',cursor));all.push(...(rows||[]));if(!rows||rows.length<100)break;const last=rows.at(-1);cursor={p_before:last.accepted_at,p_before_id:last.id};}
 return all;
}
async function refreshLeague(){
 if(!db)return;const request=++league.request;const userId=currentUser?.id;
 if(league.userId!==userId){league.mine=[];league.hasMore=false;league.userId=userId;league.profile={};league.bySport={};league.weekly=null;league.stats={};}
 if(!currentUser){league.mine=[];league.profile={};league.bySport={};league.weekly=null;}
 try{
 const [offers,weeks,seasons,mine,highlight,spots]=await Promise.all([checked(db.rpc('ae_offer_board')),checked(db.from('ae_weeks').select('*').order('starts_at',{ascending:false})),checked(db.from('ae_seasons').select('*').order('starts_at',{ascending:false})),currentUser?fetchVisiblePicks():Promise.resolve([]),checked(db.rpc('ae_public_highlights')),checked(db.from('ae_spotlights').select('*').eq('id',1).maybeSingle())]);
 if(request!==league.request)return;Object.assign(league,{offers:offers||[],weeks,seasons,mine:mine||[],highlights:highlight||[],featured:spots?.offer_ids||[],available:true});
 league.hasMore=(mine||[]).length>0&&(mine||[]).length%100===0;
 const [stats,profile,nfl,ucl,weekly]=await Promise.all([checked(db.rpc('ae_stats',leagueFilter())),checked(db.rpc('ae_stats',{})),checked(db.rpc('ae_stats',{p_competition:'NFL'})),checked(db.rpc('ae_stats',{p_competition:'UCL'})),checked(db.rpc('ae_stats',{...leagueFilter(),p_competition:null,p_from:weeks.find(w=>new Date(w.starts_at)<=new Date()&&new Date(w.ends_at)>new Date())?.starts_at||'9998-01-01T00:00:00Z',p_until:weeks.find(w=>new Date(w.starts_at)<=new Date()&&new Date(w.ends_at)>new Date())?.ends_at||null}))]);
 if(request!==league.request)return;Object.assign(league,{stats,profile,bySport:{NFL:nfl.me,UCL:ucl.me},weekly:weekly.me});renderLeague();
 if(currentUser&&league.pending){const id=league.pending;league.pending=null;openPickConfirmation(id);}
 }catch{if(request!==league.request)return;league.available=false;league.offers=[];league.mine=[];league.stats={};league.profile={};league.bySport={};league.weekly=null;renderLeague();document.getElementById('aeStatus').textContent='La liga aún no está configurada o no se pudo conectar. No se aceptan picks hasta verificar el servicio.';}
}
function renderLeague(){
 const weeklyPanel=document.getElementById('weeklyPicks');
 const slot=document.getElementById(currentCategory==='Picks'?'aeWeeklySlot':'aeWeeklyHome');
 if(weeklyPanel.parentElement!==slot)slot.append(weeklyPanel);
 const sport=document.getElementById('aeSport').value;
 const status=document.getElementById('aeStatus');status.textContent=league.available?(league.offers.some(o=>o.open)?'Cuotas oficiales congeladas · Fuente: SportsGameOdds / DraftKings':'No hay ofertas verificadas abiertas. Estamos preparando los próximos encuentros.'):'Servicio de liga no disponible todavía.';
 const events=document.getElementById('aeEvents');const expanded=new Set([...events.querySelectorAll('details[open]')].map(d=>d.dataset.event));events.replaceChildren();const groups=new Map();league.offers.filter(o=>!sport||o.competition===sport).forEach(o=>{if(!groups.has(o.event_id))groups.set(o.event_id,[]);groups.get(o.event_id).push(o);});
 for(const [id,offers]of groups){const e=offers[0],d=node('details',null,'ae-event');d.dataset.event=id;d.open=expanded.has(id)||groups.size===1;const summary=node('summary',e.home+' vs. '+e.away);summary.append(node('small',`${e.competition==='UCL'?'Champions League':'NFL'} · ${aeDate(e.starts_at)} · Ver selecciones`));const markets=node('div',null,'rcm-pick-grid');offers.forEach(o=>markets.append(aeCard(o,true)));d.append(summary,markets);events.append(d);}if(!events.children.length)events.append(node('p','No hay encuentros disponibles para esta selección.'));
 const mine=document.getElementById('aeMine');mine.replaceChildren();league.mine.filter(p=>(!sport||p.competition===sport)&&['PENDING','UNDER_REVIEW'].includes(p.state)).forEach(p=>mine.append(aeCard(p)));if(!mine.children.length)mine.append(node('p',currentUser?'No tienes picks pendientes.':'Inicia sesión para consultar tus picks.'));
 const rank=document.getElementById('aeLeaderboard');rank.replaceChildren();const table=node('div',null,'ae-ranking');
 for(const r of league.stats?.top||[]){const row=node('div',null,'ae-rank-row');if(r.position<=3)row.classList.add('ae-podium');row.append(node('strong',`${r.position}. ${r.username}`),node('strong',`${Number(r.points).toFixed(2)} AE Points`),node('small',`${r.wins} aciertos · ${r.losses} fallos · ${r.accuracy==null?'—':r.accuracy+'%'} acierto`));table.append(row);}rank.append(table);if(!table.children.length)rank.append(node('p','La clasificación aparecerá cuando haya participaciones.'));
 const me=league.stats?.me;document.getElementById('aeMyRank').textContent=me?`Tu posición: ${me.position} · ${Number(me.points).toFixed(2)} AE Points`:'';
 const record=document.getElementById('aeRecord');record.replaceChildren();if(league.stats?.best){record.append(node('strong',league.stats.best.username),aeCard(league.stats.best));}else record.append(node('p','Todavía no hay un pick ganador verificado con cuota positiva.'));
 const quota=document.getElementById('aeQuota');const currentWeek=league.weeks.find(w=>new Date(w.starts_at)<=new Date()&&new Date(w.ends_at)>new Date());quota.textContent=currentWeek?`Semana del ${aeDate(currentWeek.starts_at)} al ${aeDate(currentWeek.ends_at)} · ${league.weekly?.total||0}/${currentWeek.max_picks} picks utilizados (lunes 00:00 UTC)`:'El administrador debe configurar la semana competitiva.';
 const profile=document.getElementById('aeProfile');profile.replaceChildren();if(currentUser){const p=league.profile?.me;if(p)profile.append(node('p',`${Number(p.points).toFixed(2)} AE Points · Posición histórica ${p.position} · ${p.total} picks · ${p.wins} aciertos · ${p.losses} fallos · ${p.pending} pendientes · ${p.accuracy??'—'}% acierto`),node('p','Posición semanal: '+(league.weekly?.position||'—')));for(const [sport,p]of Object.entries(league.bySport))if(p)profile.append(node('p',`${sport==='UCL'?'Fútbol':sport}: ${Number(p.points).toFixed(2)} puntos · ${p.wins} aciertos / ${p.losses} fallos`));
 const ownBest=league.profile?.own_best;if(ownBest){const best=node('details');best.append(node('summary','Mi mejor pick'),aeCard(ownBest));profile.append(best);}
 for(const [state,label] of Object.entries(leagueStates)){const picks=league.mine.filter(p=>p.state===state);if(!picks.length)continue;const details=node('details');details.append(node('summary',label+' · '+picks.length));picks.forEach(p=>details.append(aeCard(p)));profile.append(details);}
 if(league.hasMore)profile.append(sportsButton('Cargar historial anterior',loadOlderPicks));}
 else profile.append(sportsButton('Iniciar sesión',openUserAuthModal));
 const weekly=document.getElementById('picksOptions');weekly.replaceChildren();const featured=league.featured.map(id=>league.offers.find(o=>o.id===id));if(featured.length===2&&featured.every(Boolean)){featured.forEach(o=>weekly.append(aeCard(o,true)));document.getElementById('picksStatus').textContent='Dos selecciones oficiales · Cuentan para tu límite semanal';}else document.getElementById('picksStatus').textContent='Estamos preparando dos selecciones verificadas.';
 document.getElementById('picksHistory').parentElement.hidden=true;
 const best=document.getElementById('bestPicksCards');best.replaceChildren();for(const p of league.highlights){const card=aeCard(p);card.prepend(node('strong',p.title));card.append(node('p',p.description));if(p.article_id){const a=node('a','Ver análisis');a.href=articleURL(p.article_id);card.append(a);}best.append(card);}if(!best.children.length)best.append(node('p','Aquí aparecerán aciertos verificados seleccionados por el equipo.'));
}
async function loadOlderPicks(){
 const last=league.mine.at(-1),userId=currentUser?.id;if(!last||league.loadingHistory)return;league.loadingHistory=true;
 try{const rows=await checked(db.rpc('ae_my_picks',{p_before:last.accepted_at,p_before_id:last.id}));if(userId!==currentUser?.id)return;league.mine=[...new Map([...league.mine,...rows].map(p=>[p.id,p])).values()];league.hasMore=rows.length===100;renderLeague();}catch(e){notifyCommunity(errorText(e),true);}finally{league.loadingHistory=false;}
}
function openPickConfirmation(id){
 const offer=league.offers.find(o=>o.id===id);if(!offer?.open)return;
 if(!currentUser){league.pending=id;openUserAuthModal();return;}
 const ui=sportsDialog('Confirmar pick oficial');if(!ui)return;
 ui.d.append(node('h3',offer.home+' vs. '+offer.away),node('p',aeSelection(offer)+' · '+aeOdds(offer.american)),node('p',`Acertado: +${Number(offer.points).toFixed(2)} · Fallado: −${Number(offer.points).toFixed(2)} AE Points`),node('p','Este pick quedará bloqueado y no podrá modificarse'),node('p','Máximo un pick por encuentro. Comprueba tu límite semanal antes de confirmar.'));
 // Stable request ID survives retries in the same confirmation dialog.
 const request=crypto.randomUUID();ui.d.append(sportsButton('Confirmar definitivamente',()=>sportsSave(ui,async()=>{const receipt=await checked(db.rpc('ae_confirm_pick',{p_offer:id,p_request:request}));ui.status.textContent='Pick confirmado. Recibo: '+receipt;await refreshLeague();ui.d.querySelectorAll('button').forEach(b=>{if(b.textContent==='Confirmar definitivamente')b.remove();});})));
}
async function openLeagueAdmin(){
 if(!currentAdmin)return;const ui=sportsDialog('Administración · Liga de Picks');if(!ui)return;
 ui.status.textContent='Gestiona configuración y selección editorial. Cuotas, picks y puntos históricos no son editables.';
 const reason=sportsField(ui.d,'Motivo de la operación');
 const section=(title)=>{const d=node('details');d.append(node('summary',title));ui.d.append(d);return d;};
 const config=section('Crear temporada y configurar semanas');const season=sportsField(config,'Temporada (identificador)','2026-27');const seasonStart=sportsField(config,'Inicio temporada UTC','2026-08-03','date'),seasonEnd=sportsField(config,'Fin temporada UTC','2027-08-02','date');
 config.append(sportsButton('Crear temporada',()=>sportsSave(ui,async()=>{await checked(db.rpc('ae_configure_season',{p_id:season.value,p_start:seasonStart.value+'T00:00:00Z',p_end:seasonEnd.value+'T00:00:00Z',p_reason:reason.value}));ui.status.textContent='Temporada creada.';await refreshLeague();})));
 const week=sportsField(config,'Lunes de la semana UTC','','date'),limit=sportsField(config,'Máximo semanal',5,'number');limit.min=1;limit.max=20;
 config.append(sportsButton('Guardar semana',()=>sportsSave(ui,async()=>{await checked(db.rpc('ae_configure_week',{p_season:season.value,p_start:week.value+'T00:00:00Z',p_limit:Number(limit.value),p_reason:reason.value}));await refreshLeague();ui.status.textContent='Semana guardada. Las reglas iniciadas quedan bloqueadas.';})));
 const spot=section('Picks de la Semana');const options=[['','Seleccionar oferta'],...league.offers.filter(o=>o.open).map(o=>[o.id,`${o.home} vs ${o.away} · ${aeSelection(o)} ${aeOdds(o.american)}`])];const a=sportsSelect(spot,'Destacado 1',options,league.featured[0]),b=sportsSelect(spot,'Destacado 2',options,league.featured[1]);spot.append(sportsButton('Publicar dos destacados',()=>sportsSave(ui,async()=>{await checked(db.rpc('ae_curate',{p_kind:'spotlights',p_data:{ids:[a.value,b.value]},p_reason:reason.value}));await refreshLeague();ui.status.textContent='Destacados publicados.';})));
 const highlights=section('Nuestros mejores aciertos');const pick=sportsField(highlights,'ID del pick verificado'),position=sportsSelect(highlights,'Posición',[['','Retirar destacado'],...[1,2,3,4,5].map(n=>[String(n),String(n)])]),title=sportsField(highlights,'Título editorial'),description=sportsField(highlights,'Descripción editorial','','textarea'),article=articleSelect(highlights,'');
 highlights.append(sportsButton('Guardar acierto destacado',()=>sportsSave(ui,async()=>{await checked(db.rpc('ae_curate',{p_kind:'highlight',p_data:{pick_id:pick.value,position:position.value,title:title.value,description:description.value,article_id:article.value},p_reason:reason.value}));await refreshLeague();ui.status.textContent='Selección editorial guardada.';})));
 const control=section('Cerrar ofertas de un encuentro');const event=sportsField(control,'ID del encuentro'),hold=sportsSelect(control,'Acción',[['true','Cerrar y bloquear nuevas participaciones'],['false','Permitir nueva verificación automática']]);control.append(sportsButton('Aplicar control de ofertas',()=>sportsSave(ui,async()=>{await checked(db.rpc('ae_hold_event',{p_event:event.value,p_hold:hold.value==='true',p_reason:reason.value}));await refreshLeague();ui.status.textContent='Control registrado. Reabrir requiere otra verificación del proveedor.';})));
 control.append(sportsButton('Solicitar revisión del resultado',()=>sportsSave(ui,async()=>{await checked(db.rpc('ae_request_recheck',{p_event:event.value,p_reason:reason.value}));ui.status.textContent='Revisión registrada. El servidor consultará de nuevo la fuente oficial.';})));
 const review=section('Ofertas, resultados, liquidaciones e incidencias');
 for(const [table,label]of [['ae_events','Encuentros'],['ae_offers','Ofertas'],['ae_picks','Participaciones'],['ae_results','Resultados y evidencia'],['ae_settlements','Liquidaciones'],['ae_sync_log','Estado API y consumo estimado'],['ae_audit','Auditoría']]){
 const d=node('details');d.append(node('summary',label));const body=node('div');d.append(body);review.append(d);d.addEventListener('toggle',async()=>{if(!d.open)return;try{const timeColumn=table==='ae_events'?'verified_at':table==='ae_offers'?'fetched_at':table==='ae_picks'?'accepted_at':'created_at';const rows=await checked(db.from(table).select('*').order(timeColumn,{ascending:false}).limit(100));body.replaceChildren();if(!rows.length)body.append(node('p','Sin registros.'));rows.forEach(r=>{const pre=node('pre',JSON.stringify(r,null,2),'ae-json');body.append(pre);});}catch(e){body.textContent=errorText(e);}});}
}
window.addEventListener('DOMContentLoaded',()=>{refreshLeague();setInterval(()=>{if(!document.hidden)refreshLeague();},30000);});
