// Invoked inside the existing PostgreSQL harness; never touches production.
export async function testSports({db,asUser,assert,fs}) {
 await db.exec('reset role');
 for(const file of ['07_champions_y_picks.sql','08_catalogo_champions_2026_27.sql']) {
 const sql=fs.readFileSync(new URL('../supabase/'+file,import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
 }
 assert.equal((await asUser(0,'select * from champions_clubs')).rows.length,36);
 const clubs=(await asUser(0,"select id from champions_clubs order by id limit 10")).rows.map(r=>r.id);
 const teams="array["+clubs.map(c=>"'"+c+"'").join(',')+"]";
 await assert.rejects(()=>asUser(1,`select rcm_publish_champions('2026/27','J1',${teams},null)`));
 const rank=(await asUser(3,`select rcm_publish_champions('2026/27','J1',${teams},null) id`)).rows[0].id;
 assert.deepEqual((await asUser(0,`select team_ids from champions_rankings where id='${rank}'`)).rows[0].team_ids,clubs);
 await assert.rejects(()=>asUser(3,`select rcm_publish_champions('2026/27','J2',${teams},null)`),/RCM_CONFLICT/);
 await assert.rejects(()=>asUser(3,`select rcm_publish_champions('2025/26','J1',${teams},null)`),/diez clubes/);
 await assert.rejects(()=>asUser(3,`select rcm_publish_champions('2026/27','J2',array_fill('${clubs[0]}'::text,array[10]),'${rank}')`));
 await asUser(3,`select rcm_publish_champions('2026/27','J2',${teams},'${rank}')`);
 assert.equal((await asUser(0,'select * from champions_rankings')).rows.length,2);
 assert.equal((await asUser(0,'select * from nfl_rankings')).rows[0].edition,'Week 2');
 await asUser(3,`insert into pick_drafts values(auth.uid(),'{}',null)`);
 assert.equal((await asUser(1,'select * from pick_drafts')).rows.length,0);
 await assert.rejects(()=>asUser(1,`insert into pick_drafts values(auth.uid(),'{}',null)`));
 const payload={edition:'Semana test',starts_at:new Date(Date.now()-60000).toISOString(),closes_at:new Date(Date.now()+3600000).toISOString(),options:[1,2].map(n=>({title:'Pick '+n,description:'Test',sport:'NFL',event:'Test event',article_id:''}))};
 const sqljson=x=>"'"+JSON.stringify(x).replaceAll("'","''")+"'::jsonb";
 await assert.rejects(()=>asUser(1,`select rcm_publish_picks(${sqljson(payload)},null)`));
 await assert.rejects(()=>asUser(3,`select rcm_publish_picks(${sqljson({...payload,options:payload.options.slice(0,1)})},null)`));
 const e=(await asUser(3,`select rcm_publish_picks(${sqljson(payload)},null) id`)).rows[0].id;
 const picks=(await asUser(0,`select * from sports_picks where edition_id='${e}' order by position`)).rows;
 assert.equal(picks.length,2);assert.equal((await asUser(3,'select * from pick_drafts')).rows.length,0);
 await assert.rejects(()=>asUser(3,`select rcm_publish_picks(${sqljson(payload)},null)`),/RCM_CONFLICT/);
 await assert.rejects(()=>asUser(0,`select rcm_choose_pick('${e}','${picks[0].id}')`));
 await asUser(1,`select rcm_choose_pick('${e}','${picks[0].id}')`);await asUser(1,`select rcm_choose_pick('${e}','${picks[0].id}')`);
 await asUser(2,`select rcm_choose_pick('${e}','${picks[0].id}')`);
 assert.equal(Number((await asUser(0,'select sum(votes) n from rcm_pick_totals()')).rows[0].n),2);
 await asUser(1,`select rcm_choose_pick('${e}','${picks[1].id}')`);
 assert.deepEqual((await asUser(0,'select votes::int from rcm_pick_totals() order by pick_id')).rows.map(r=>r.votes),[1,1]);
 assert.equal((await asUser(1,'select * from pick_votes')).rows.length,1);
 await assert.rejects(()=>asUser(1,`update sports_picks set outcome='won'`));
 await assert.rejects(()=>asUser(1,`insert into pick_votes values('${e}',auth.uid(),'${picks[0].id}',now())`));
 const future={...payload,edition:'Programada',starts_at:new Date(Date.now()+7200000).toISOString(),closes_at:new Date(Date.now()+10800000).toISOString()};
 const f=(await asUser(3,`select rcm_publish_picks(${sqljson(future)},'${e}') id`)).rows[0].id;
 assert.equal((await asUser(0,`select * from pick_editions where id='${f}'`)).rows.length,0);
 const fp=(await asUser(3,`select * from sports_picks where edition_id='${f}'`)).rows[0];
 await assert.rejects(()=>asUser(1,`select rcm_choose_pick('${f}','${fp.id}')`),/cerrada/);
 await assert.rejects(()=>asUser(1,`select rcm_choose_pick('${e}','${fp.id}')`),/disponible/);
 const update={...picks[0],outcome:'won',result:'Resultado comprobado',resolved_at:new Date().toISOString(),featured_order:'1'};
 await assert.rejects(()=>asUser(1,`select rcm_update_pick('${picks[0].id}',1,${sqljson(update)})`));
 await assert.rejects(()=>asUser(3,`select rcm_update_pick('${picks[0].id}',1,${sqljson({...update,outcome:'lost'})})`));
 await asUser(3,`select rcm_update_pick('${picks[0].id}',1,${sqljson(update)})`);
 await assert.rejects(()=>asUser(1,`select rcm_choose_pick('${e}','${picks[1].id}')`),/cerrada/);
 await assert.rejects(()=>asUser(3,`select rcm_update_pick('${picks[0].id}',1,${sqljson(update)})`),/RCM_CONFLICT/);
 assert.equal((await asUser(0,"select * from sports_picks where featured_order=1")).rows[0].outcome,'won');
 assert.equal(Number((await asUser(0,'select * from rcm_pick_performance')).rows[0].win_percent),100);
 await asUser(3,`select rcm_update_pick('${picks[0].id}',2,${sqljson({...update,featured_order:''})})`);
 assert.equal((await asUser(3,'select * from pick_audit')).rows.length,2);
 assert.equal((await asUser(0,'select * from sports_picks')).rows.length,2);
 console.log('PASS sports SQL: migrations twice, 36 clubs, atomic ranking/history/conflicts, drafts private, 2 picks, shared votes/change/idempotency/ownership, scheduling, close, result permissions, featured constraints, audit and true denominator.');
}
