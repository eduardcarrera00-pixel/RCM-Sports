export async function testLeague({db,asUser,assert,fs}){
 await db.exec("reset role;create role service_role bypassrls;alter table auth.users add column raw_user_meta_data jsonb default '{}';update auth.users set raw_user_meta_data=jsonb_build_object('username','reader-'||right(id::text,1));");
 const migration=fs.readFileSync(new URL('../supabase/11_ae_league.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 const q=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
 const now=new Date();const monday=new Date(now);monday.setUTCHours(0,0,0,0);monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));
 const begin=monday.toISOString(),end=new Date(+monday+7*86400000).toISOString();
 await asUser(3,`select ae_configure_season('test','${begin}','${new Date(+monday+364*86400000).toISOString()}','Temporada de pruebas')`);
 const week=(await asUser(3,`select ae_configure_week('test','${begin}',5,'Semana de pruebas') id`)).rows[0].id;
 await assert.rejects(()=>asUser(3,`select ae_configure_week('test','${begin}',10,'Cambiar limite')`),/iniciada/);
 await assert.rejects(()=>asUser(1,`select ae_configure_week('test','${end}',5,'No autorizado')`));
 await db.exec('reset role');
 for(const [odds,expected] of [[504,5.04],[-110,.91],[-200,.5],[100,1],[150,1.5],[1000,10]])assert.equal(Number((await db.query(`select ae_points(${odds}) n`)).rows[0].n),expected);
 await assert.rejects(()=>db.query('select ae_points(0)'));await assert.rejects(()=>db.query('select ae_points(-99)'));
 const start=new Date(Math.min(Date.now()+3600000,+monday+7*86400000-600000)).toISOString();
 const makeEvent=(id,competition='NFL')=>({id,competition,home_id:'H-'+id,away_id:'A-'+id,home:'Home '+id,away:'Away '+id,starts_at:start,status:'OPEN'});
 const offers=(competition='NFL',homeOdds=150)=>['home',...(competition==='UCL'?['draw']:[]),'away'].map((selection,i)=>({selection,odd_id:'points-'+selection+'-'+(competition==='NFL'?'game-ml-':'reg-ml3way-')+selection,period:competition==='NFL'?'game':'reg',market:competition==='NFL'?'ml':'ml3way',american:i===0?homeOdds:-110,bookmaker:'draftkings',provider_updated_at:new Date().toISOString(),available:true}));
 for(let i=1;i<=7;i++){await db.exec('reset role');await db.query(`select ae_ingest(${q(makeEvent('game'+i))},${q(offers('NFL',i===2?504:150))},'version-${i}')`);}
 await assert.rejects(()=>asUser(1,`select ae_ingest(${q(makeEvent('hack'))},${q(offers())},'hack')`));
 let board=(await asUser(0,'select ae_offer_board() b')).rows[0].b;assert.equal(board.length,14);
 const o=board.find(x=>x.event_id==='game1'&&x.selection==='home');assert.equal(o.points,1.5);
 const req=n=>`80000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const p1=(await asUser(1,`select ae_confirm_pick('${o.id}','${req(1)}') id`)).rows[0].id;
 const p2=(await asUser(2,`select ae_confirm_pick('${o.id}','${req(1)}') id`)).rows[0].id;
 assert.equal((await asUser(1,`select ae_confirm_pick('${o.id}','${req(1)}') id`)).rows[0].id,p1);
 await assert.rejects(()=>asUser(1,`select ae_confirm_pick('${board.find(x=>x.event_id==='game1'&&x.selection==='away').id}','${req(2)}')`),/Ya confirmaste/);
 await db.exec('reset role');await db.query(`select ae_ingest(${q(makeEvent('game1'))},${q(offers('NFL',130))},'changed-external')`);
 assert.equal((await asUser(0,'select ae_offer_board() b')).rows[0].b.find(x=>x.id===o.id).american,150);
 await assert.rejects(()=>asUser(1,`update ae_offers set american=10000 where id='${o.id}'`));
 await db.exec('reset role');await assert.rejects(()=>db.query(`update ae_offers set american=10000 where id='${o.id}'`),/congeladas/);
 await assert.rejects(()=>asUser(1,`delete from ae_picks where id='${p1}'`));
 for(let i=2;i<=5;i++){const id=board.find(x=>x.event_id==='game'+i&&x.selection==='home').id;await asUser(1,`select ae_confirm_pick('${id}','${req(i)}')`);}
 await assert.rejects(()=>asUser(1,`select ae_confirm_pick('${board.find(x=>x.event_id==='game6').id}','${req(6)}')`),/Límite semanal/);
 await assert.rejects(()=>asUser(0,`select ae_confirm_pick('${o.id}','${req(99)}')`));
 await db.exec('reset role');await db.query("update ae_offers set verified_at=now()-interval '1 hour' where event_id='game7'");
 await assert.rejects(()=>asUser(2,`select ae_confirm_pick('${board.find(x=>x.event_id==='game7').id}','${req(99)}')`),/desactualizada/);
 await db.exec('reset role');await db.query("update ae_events set starts_at=now()-interval '1 hour' where id='game6'");
 await assert.rejects(()=>asUser(2,`select ae_confirm_pick('${board.find(x=>x.event_id==='game6').id}','${req(99)}')`));
 const evidence={provider:'sportsgameodds',finalized:true};
 const settle=(id,version,h,a,state='FINAL',period='game')=>`select ae_settle('${id}','${version.padEnd(20,'_')}','${period}','H-${id}','A-${id}',${h},${a},'${state}',${q(evidence)})`;
 await db.exec('reset role');await db.query("update ae_events set starts_at=now()-interval '1 hour' where id in('game1','game2','game3','game4','game5')");
 await assert.rejects(()=>asUser(3,settle('game1','v1',3,1)));
 await db.exec('reset role');await db.query(settle('game1','v1',3,1));await db.query(settle('game1','v1',3,1));
 assert.equal((await db.query(`select count(*)::int n from ae_ledger where pick_id='${p1}'`)).rows[0].n,1);
 await db.query(settle('game1','v2',0,1));assert.equal(Number((await db.query(`select sum(delta) n from ae_ledger where pick_id='${p1}'`)).rows[0].n),-1.5);
 await db.query(settle('game1','v1',3,1));assert.equal(Number((await db.query(`select sum(delta) n from ae_ledger where pick_id='${p1}'`)).rows[0].n),1.5);
 assert.equal((await db.query(`select count(*)::int n from ae_ledger where pick_id='${p1}'`)).rows[0].n,3);
 await db.query(settle('game2','v1',3,1));let mine=(await asUser(1,'select ae_my_picks() p')).rows[0].p;assert.equal(mine.find(x=>x.event_id==='game2').points,5.04);
 await db.exec('reset role');await db.query(settle('game2','v2',0,1));mine=(await asUser(1,'select ae_my_picks() p')).rows[0].p;assert.equal(mine.find(x=>x.event_id==='game2').points,-5.04);
 await db.exec('reset role');await db.query(settle('game3','push',3,3));await db.query(settle('game4','void',0,0,'VOID'));await db.query(settle('game5','cancel',0,0,'CANCELLED'));
 mine=(await asUser(1,'select ae_my_picks() p')).rows[0].p;for(const id of ['game3','game4','game5'])assert.equal(mine.find(p=>p.event_id===id).points,0);
 const stats=(await asUser(0,"select ae_stats('NFL',null,null) s")).rows[0].s;assert.equal(stats.top.length,2);assert.equal(stats.top[0].username,'reader-2');assert.equal(stats.best.american,150);assert.equal(stats.me,null);assert.ok(!JSON.stringify(stats).includes('raw_user_meta_data'));
 assert.equal((await asUser(1,"select ae_stats('UCL',null,null) s")).rows[0].s.top.length,0);
 await assert.rejects(()=>asUser(1,`select ae_curate('spotlights',${q({ids:[o.id,o.id]})},'Duplicados')`));
 await asUser(3,`select ae_curate('highlight',${q({pick_id:p1,position:1,title:'Ganador',description:'Verificado'})},'Destacar ganador')`);
 assert.equal((await asUser(0,'select ae_public_highlights() h')).rows[0].h.length,1);
 await db.exec('reset role');await db.query(settle('game1','v3',0,1));assert.equal((await asUser(0,'select ae_public_highlights() h')).rows[0].h.length,0);

 // Genuine SQL rankings with more than ten users, negative odds and soccer regulation.
 await db.exec('reset role');await db.query(`select ae_ingest(${q(makeEvent('ucl','UCL'))},${q(offers('UCL'))},'soccer-regulation')`);
 const soccer=(await asUser(0,'select ae_offer_board() b')).rows[0].b.find(o=>o.event_id==='ucl'&&o.selection==='draw');
 await asUser(2,`select ae_confirm_pick('${soccer.id}','${req(80)}')`);
 await db.exec('reset role');await db.query("update ae_events set starts_at=now()-interval '1 hour' where id='ucl'");
 await assert.rejects(()=>db.query(settle('ucl','wrong-period',1,1,'FINAL','game')),/período/);
 await db.query(settle('ucl','reg-draw',1,1,'FINAL','reg'));
 assert.equal((await asUser(2,'select ae_my_picks() p')).rows[0].p.find(p=>p.event_id==='ucl').points,.91);
 await db.exec('reset role');await db.query(settle('ucl','reg-away',0,1,'FINAL','reg'));
 assert.equal((await asUser(2,'select ae_my_picks() p')).rows[0].p.find(p=>p.event_id==='ucl').points,-.91);
 for(let n=4;n<=15;n++){
 await db.exec('reset role');await db.query(`insert into auth.users(id,raw_user_meta_data) values('00000000-0000-0000-0000-${String(n).padStart(12,'0')}',${q({username:'reader-'+n})})`);
 }
 // Reopen a separate future fixture; all these users receive the same offer.
 await db.exec('reset role');await db.query(`select ae_ingest(${q(makeEvent('rankgame'))},${q(offers())},'rank-fixture')`);
 const rankOffer=(await asUser(0,'select ae_offer_board() b')).rows[0].b.find(o=>o.event_id==='rankgame'&&o.selection==='home');
 for(let n=4;n<=15;n++)await asUser(n,`select ae_confirm_pick('${rankOffer.id}','${req(200+n)}')`);
 let outside=(await asUser(15,'select ae_stats() s')).rows[0].s;assert.equal(outside.top.length,10);assert.ok(outside.me.position>10);assert.equal(outside.me.username,'reader-15');
 // Admin hold survives provider refresh and requires revalidation after release.
 await asUser(3,"select ae_hold_event('rankgame',true,'Revisar encuentro')");
 await db.exec('reset role;set role service_role');await db.query(`select ae_ingest(${q(makeEvent('rankgame'))},${q(offers())},'refresh-on-hold')`);
 await assert.rejects(()=>asUser(2,`select ae_confirm_pick('${rankOffer.id}','${req(300)}')`),/revisión/);
 await asUser(3,"select ae_hold_event('rankgame',false,'Volver a verificar')");
 await assert.rejects(()=>asUser(2,`select ae_confirm_pick('${rankOffer.id}','${req(300)}')`));
 await db.exec('reset role;set role service_role');await db.query(`select ae_ingest(${q(makeEvent('rankgame'))},${q(offers())},'verified-again')`);
 await asUser(2,`select ae_confirm_pick('${rankOffer.id}','${req(300)}')`);
 await assert.rejects(()=>asUser(1,"select ae_hold_event('rankgame',true,'Sin permisos')"));
 await db.exec('reset role');
 const after=(await asUser(2,'select ae_my_picks() p')).rows[0].p.at(-1);
 assert.equal((await asUser(2,`select ae_my_picks('${after.accepted_at}','${after.id}') p`)).rows[0].p.length,0);
 console.log('PASS extended league SQL: regulation-only UCL draw win/loss at -110, top10 and own rank outside it, tie order, service role, administrative hold/revalidation, cursor history.');
 console.log('PASS AE league SQL: frozen odds, two users, idempotency, immutable receipts, unique event, five picks/week, deadline/staleness, permissions, points +504/-110 formula, push/void/cancel, compensating corrections including return to original, filters, best pick, verified highlights.');
}
