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
 await mobile.emulateMedia({reducedMotion:'no-preference'});
 await mobile.evaluate(()=>{filterByCategory('Fútbol');filterByTeam('');return refreshChampions();});
 assert.equal(await mobile.locator('#championsTrack').evaluate(e=>getComputedStyle(e).animationName),'rcm-scroll');
 const first=await mobile.locator('#championsTrack').evaluate(e=>getComputedStyle(e).transform);
 await mobile.waitForTimeout(150);assert.notEqual(await mobile.locator('#championsTrack').evaluate(e=>getComputedStyle(e).transform),first);
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await mobile.emulateMedia({reducedMotion:'reduce'});assert.equal(await mobile.locator('#championsTrack').evaluate(e=>getComputedStyle(e).animationName),'none');
 const tablet=await newPage({width:768,height:1024});await tablet.goto('http://127.0.0.1:8765/RCM-Sports/');await tablet.waitForFunction(()=>sports.ranking?.edition==='Jornada 3');await tablet.evaluate(()=>filterByCategory('Fútbol'));assert.equal(await tablet.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 console.log('PASS Champions browser: admin draft/publish, public reload, clubs/logos, categories, automatic mobile motion, reduced motion, tablet/mobile overflow.');
}
module.exports={backend,run};
