const clubs=require('../assets/champions-clubs.json');
const state={rankings:[],drafts:{},editions:[],picks:[],votes:{},pickDrafts:{}};
function backend(q){
 const {rpc,args:a,user}=q;
 if(rpc==='rcm_pick_totals')return {data:state.picks.map(p=>({pick_id:p.id,votes:Object.values(state.votes).filter(id=>id===p.id).length,my_vote:state.votes[p.edition_id+':'+user]===p.id}))};
 if(rpc==='rcm_publish_champions'){const r={id:'rank-'+state.rankings.length,season:a.p_season,edition:a.p_edition,team_ids:a.p_team_ids,published_at:new Date().toISOString()};state.rankings.unshift(r);return {data:r.id};}
 if(rpc==='rcm_publish_picks'){const e={...a.p_payload,id:'edition-'+state.editions.length,published_at:new Date().toISOString()};state.editions.unshift(e);state.picks.push(...e.options.map((p,i)=>({...p,id:e.id+'-'+i,edition_id:e.id,position:i+1,outcome:'pending',version:1})));delete state.pickDrafts[user];return {data:e.id};}
 if(rpc==='rcm_choose_pick'){state.votes[a.p_edition_id+':'+user]=a.p_pick_id;return {data:null};}
 if(rpc==='rcm_update_pick'){const p=state.picks.find(p=>p.id===a.p_id);Object.assign(p,a.p_data,{version:p.version+1});return {data:null};}
 if(!['champions_clubs','champions_rankings','champions_drafts','pick_editions','sports_picks','pick_drafts'].includes(q.table))return null;
 if(q.op==='upsert'){(q.table==='champions_drafts'?state.drafts:state.pickDrafts)[user]=q.payload;return {data:q.payload};}
 let rows=q.table==='champions_clubs'?clubs:q.table==='champions_rankings'?state.rankings:q.table==='champions_drafts'?(state.drafts[user]?[state.drafts[user]]:[]):q.table==='pick_editions'?state.editions:q.table==='sports_picks'?state.picks:(state.pickDrafts[user]?[state.pickDrafts[user]]:[]);
 rows=rows.filter(r=>q.filters.every(([k,v])=>String(r[k])===String(v)));if(q.range)rows=rows.slice(q.range[0],q.range[1]+1);return {data:structuredClone(q.single?rows[0]||null:rows)};
}
async function run({one,two,mobile,newPage,assert}){
 await one.evaluate(()=>{closeModal();filterByCategory('Fútbol');filterByTeam('');openChampionsEditor();});
 await one.getByLabel('Jornada o edición',{exact:true}).fill('Jornada 3');
 for(let i=0;i<10;i++)await one.getByLabel('Club en posición '+(i+1),{exact:true}).selectOption(clubs[i].id);
 await one.locator('#sportsDialog').getByRole('button',{name:'Guardar borrador',exact:true}).click();await one.waitForFunction(()=>document.querySelector('#sportsDialog [role=status]').textContent.includes('Borrador privado guardado'));
 assert.equal(state.rankings.length,0);
 await one.locator('#sportsDialog').getByRole('button',{name:'Publicar las diez posiciones'}).click();await one.waitForFunction(()=>document.querySelector('#sportsDialog [role=status]').textContent.includes('sin autenticación'));
 await one.locator('#sportsDialog').getByRole('button',{name:'Cerrar',exact:true}).click();
 await two.evaluate(()=>{filterByCategory('Fútbol');filterByTeam('');return refreshChampions();});
 assert.equal(await two.locator('#championsList li').count(),10);assert.equal(await two.locator('#championsEdition').innerText(),'Jornada 3');
 await two.evaluate(()=>filterByTeam('barcelona'));assert.equal(await two.locator('#championsRankings').isVisible(),false);
 await two.reload();await two.waitForFunction(()=>sports.ranking?.edition==='Jornada 3');assert.equal(await two.locator('#championsList img').count(),10);
 await one.evaluate(()=>openPicksEditor());await one.getByLabel('Semana o edición',{exact:true}).fill('Semana 8');
 await one.getByLabel('Inicio (tu hora local)',{exact:true}).fill('2020-01-01T12:00');await one.getByLabel('Cierre (tu hora local)',{exact:true}).fill('2099-01-01T12:00');
 for(let i=0;i<2;i++){const f=one.locator('#sportsDialog fieldset').nth(i);await f.getByLabel('Título corto',{exact:true}).fill('Predicción '+i);await f.getByLabel('Deporte',{exact:true}).fill('NFL');await f.getByLabel('Partido o evento',{exact:true}).fill('Partido de prueba');}
 await one.locator('#sportsDialog').getByRole('button',{name:'Guardar borrador',exact:true}).click();await one.waitForFunction(()=>document.querySelector('#sportsDialog [role=status]').textContent.includes('Borrador privado guardado'));
 await one.locator('#sportsDialog').getByRole('button',{name:'Cerrar',exact:true}).click();await one.evaluate(()=>openPicksEditor());await one.getByLabel('Semana o edición',{exact:true}).waitFor();assert.equal(await one.getByLabel('Semana o edición',{exact:true}).inputValue(),'Semana 8');
 await one.locator('#sportsDialog').getByRole('button',{name:'Publicar edición',exact:true}).click();await one.waitForFunction(()=>document.querySelector('#sportsDialog [role=status]').textContent.includes('lectura pública verificada'));
 await one.locator('#sportsDialog').getByRole('button',{name:'Cerrar',exact:true}).click();await two.evaluate(()=>refreshPicks());assert.equal(await two.locator('#picksOptions .rcm-pick-card').count(),2);
 await one.locator('#picksOptions button').first().click();await one.waitForFunction(()=>sports.totals.some(t=>t.my_vote));
 await two.evaluate(()=>refreshPicks());assert.ok((await two.locator('#picksOptions').innerText()).includes('1 apoyos'));
 await one.reload();await one.waitForFunction(()=>sports.totals.some(t=>t.my_vote));assert.equal(await one.locator('#picksOptions button[aria-pressed=true]').count(),1);
 await one.locator('#picksOptions button').nth(1).click();await one.waitForFunction(()=>sports.totals.find(t=>t.pick_id==='edition-0-1')?.my_vote);assert.equal(Object.keys(state.votes).length,1);
 const guest=await newPage();await guest.goto('http://127.0.0.1:8765/RCM-Sports/');await guest.waitForFunction(()=>sports.totals.length===2);
 await guest.locator('#picksOptions button').first().click();await guest.locator('#userAuthUsername').fill('carol');await guest.locator('#userAuthPassword').fill('password123');await guest.locator('#userAuthModal button[type=submit]').click();await guest.waitForFunction(()=>sports.totals.some(t=>t.my_vote));
 assert.equal(await guest.locator('#picksOptions button[aria-pressed=true]').count(),1);
 await one.waitForFunction(()=>Boolean(currentAdmin));
 await one.evaluate(()=>{filterByCategory('Picks');openResultsEditor();});await one.getByLabel('Pick',{exact:true}).selectOption('edition-0-1');
 await one.getByLabel('Resultado',{exact:true}).selectOption('won');await one.getByLabel('Resultado real y explicación',{exact:true}).fill('Resultado verificado de prueba');await one.getByLabel('Posición destacada',{exact:true}).selectOption('1');
 await one.getByRole('button',{name:'Guardar resultado',exact:true}).click();await one.waitForFunction(()=>document.querySelector('#sportsDialog [role=status]').textContent.includes('Resultado guardado'));
 await one.getByRole('button',{name:'Cerrar',exact:true}).click();await two.evaluate(()=>{filterByCategory('Picks');return refreshPicks();});assert.equal(await two.locator('#bestPicksCards .rcm-pick-card').count(),1);
 await two.reload();await two.waitForFunction(()=>sports.picks.some(p=>p.outcome==='won'));assert.equal(await two.locator('#bestPicksCards .rcm-pick-card').count(),1);
 const tablet=await newPage({width:768,height:1024});await tablet.goto('http://127.0.0.1:8765/RCM-Sports/');await tablet.waitForFunction(()=>sports.editions.length===1);await tablet.evaluate(()=>filterByCategory('Fútbol'));assert.equal(await tablet.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await mobile.evaluate(()=>{filterByCategory('Fútbol');filterByTeam('');return refreshChampions();});assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await one.evaluate(()=>filterByCategory('Picks'));await one.screenshot({path:'/tmp/rcm-sports-picks.png',fullPage:true});await mobile.screenshot({path:'/tmp/rcm-sports-mobile.png',fullPage:true});
 console.log('PASS sports browser (mock transport): Champions editor/draft/publish/public read/reload/subcategory; picks draft reopened/publish/two cards/vote/change/shared counts/reload; results/featured/reload; desktop/tablet/mobile.');
}
module.exports={backend,run};
