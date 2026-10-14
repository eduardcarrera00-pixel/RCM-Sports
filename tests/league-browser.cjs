// Isolated transport fixtures. Production never imports this file.
const state={picks:[],fail:false};
const start=new Date(Date.now()+3600000).toISOString(),close=new Date(Date.now()+3300000).toISOString();
const offers=['NFL','UCL'].flatMap((competition,i)=>(i?['home','draw','away']:['home','away']).map((selection,j)=>({id:`offer-${i}-${j}`,event_id:'event-'+i,competition,home:'Local de prueba',away:'Visitante de prueba',starts_at:start,closes_at:close,selection,american:150,points:1.5,open:true})));
function backend(q){
 if(q.rpc?.startsWith('ae_')){
 if(state.fail)return {error:{message:'offline'}};
 if(q.rpc==='ae_offer_board')return {data:offers};
 if(q.rpc==='ae_my_picks')return {data:state.picks.filter(p=>p.user===q.user)};
 if(q.rpc==='ae_public_highlights')return {data:[]};
 if(q.rpc==='ae_stats')return {data:{top:[],me:q.user&&state.picks.some(p=>p.user===q.user)?{position:11,points:0,total:1,wins:0,losses:0,pending:1,accuracy:null}:null,best:null}};
 if(q.rpc==='ae_confirm_pick'){
 if(!q.user)return {error:{message:'Inicia sesión'}};
 const o=offers.find(o=>o.id===q.args.p_offer);
 const old=state.picks.find(p=>p.user===q.user&&p.request===q.args.p_request);if(old)return {data:old.id};
 if(state.picks.some(p=>p.user===q.user&&p.event_id===o.event_id))return {error:{message:'Ya confirmaste un pick de este encuentro'}};
 const p={...o,id:'receipt-'+state.picks.length,user:q.user,request:q.args.p_request,potential:o.points,points:0,state:'PENDING',accepted_at:new Date().toISOString()};state.picks.push(p);return {data:p.id};
 }
 return {data:null};
 }
 if(q.table==='ae_spotlights')return {data:{offer_ids:[offers[0].id,offers[2].id]}};
 if(q.table?.startsWith('ae_'))return {data:[]};return null;
}
async function run({one,two,mobile,newPage,assert,login}){
 await one.evaluate(()=>{filterByCategory('Picks');return refreshLeague();});
 await one.locator('#aeEvents summary').first().click();
 assert.equal(await one.locator('#aeEvents .rcm-pick-card').count(),5);assert.equal(await one.locator('#picksOptions .rcm-pick-card').count(),2);
 await one.locator('#aeEvents button').first().click();assert.equal(state.picks.length,0);assert.match(await one.locator('#sportsDialog').innerText(),/quedará bloqueado/);
 await one.getByRole('button',{name:'Cerrar',exact:true}).click();assert.equal(state.picks.length,0);
 await one.locator('#aeEvents button').first().click();await one.getByRole('button',{name:'Confirmar definitivamente'}).click();await one.waitForFunction(()=>document.querySelector('#sportsDialog [role=status]').textContent.includes('Recibo:'));
 assert.equal(state.picks.length,1);await one.getByRole('button',{name:'Cerrar',exact:true}).click();assert.equal(await one.locator('#aeMine .rcm-pick-card').count(),1);
 assert.match(await one.locator('#aeMyRank').innerText(),/11/);
 await one.reload();await one.waitForFunction(()=>league.mine.length===1);await one.evaluate(()=>filterByCategory('Picks'));await one.locator('#aeEvents summary').first().click();assert.match(await one.locator('#aeMine').innerText(),/receipt-0/);
 await one.locator('#aeEvents button').nth(1).click();await one.getByRole('button',{name:'Confirmar definitivamente'}).click();await one.waitForFunction(()=>document.querySelector('#sportsDialog [role=status]').textContent.includes('Ya confirmaste'));assert.equal(state.picks.length,1);await one.getByRole('button',{name:'Cerrar',exact:true}).click();
 const guest=await newPage();await guest.goto('http://127.0.0.1:8765/RCM-Sports/');await guest.waitForFunction(()=>league.offers.length===5);await guest.locator('#picksOptions button').first().click();await guest.locator('#userAuthUsername').fill('carol');await guest.locator('#userAuthPassword').fill('password123');await guest.locator('#userAuthModal button[type=submit]').click();await guest.locator('#sportsDialog').waitFor();assert.equal(state.picks.length,1);
 await guest.getByRole('button',{name:'Confirmar definitivamente'}).click();await guest.waitForFunction(()=>league.mine.length===1);assert.equal(state.picks.length,2);assert.equal(state.picks[0].american,state.picks[1].american);
 await guest.getByRole('button',{name:'Cerrar',exact:true}).click();await guest.evaluate(()=>handleUserLogout());await guest.waitForFunction(()=>!currentUser&&league.mine.length===0);
 await one.locator('#aeSport').selectOption('UCL');await one.waitForFunction(()=>document.querySelectorAll('#aeEvents article').length===3);
 await one.locator('#aePeriod').selectOption('all');await one.waitForFunction(()=>leagueFilter().p_from===null);
 state.fail=true;await one.evaluate(()=>refreshLeague());assert.equal(await one.locator('#aeEvents button').count(),0);assert.match(await one.locator('#aeStatus').innerText(),/no se pudo conectar/);state.fail=false;
 await one.evaluate(()=>refreshLeague());await one.evaluate(()=>openLeagueAdmin());assert.match(await one.locator('#sportsDialog').innerText(),/Cerrar ofertas/);await one.getByRole('button',{name:'Cerrar',exact:true}).click();
 for(const [width,height]of [[390,844],[844,390],[768,1024]]){await mobile.setViewportSize({width,height});await mobile.evaluate(()=>{filterByCategory('Picks');return refreshLeague();});assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await one.screenshot({path:'/tmp/ae-league-desktop.png',fullPage:true});await mobile.setViewportSize({width:390,height:844});await mobile.screenshot({path:'/tmp/ae-league-mobile.png',fullPage:true});
 console.log('PASS league browser (mock transport): explicit confirmation/cancel, receipt/reload, login resumes without auto-confirm, shared odds, duplicate rejection, own rank outside top10, filters, logout privacy, outage, admin, responsive desktop/tablet/mobile/landscape.');
}
module.exports={backend,run};
