import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const migration = fs.readFileSync('supabase/migrations/20261024162230_cam_football_automatic_points.sql','utf8');
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
create function public.rcm_is_editor() returns boolean language sql stable as $$select auth.uid()='00000000-0000-0000-0000-000000000003'::uuid$$;
create table public.ae_auth_accounts(user_id uuid,username text);
grant usage on schema public,auth to anon,authenticated,service_role;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
`);
for (const path of ['20261023172015_cam_football_quiniela_tables.sql','20261023172113_cam_football_quiniela_functions.sql']) {
  await db.exec(fs.readFileSync('supabase/migrations/'+path,'utf8'));
}
await db.exec(`
insert into cam_football_teams(id,name,short_name,abbreviation) values('1','Local','Local','LOC'),('2','Visitante','Visitante','VIS');
insert into cam_football_games(id,competition,season,matchday,home_id,away_id,kickoff,status,
 probability_home,probability_draw,probability_away,points_home,points_draw,points_away,odds_source,odds_locked_at)
 values('900000001','laliga',2026,1,'1','2',now()-interval '1 day','final',.5,.25,.25,4,8,8,'legacy',now()-interval '2 days');
insert into cam_football_picks(game_id,user_id,pick,awarded_points,settled_at)
 values('900000001','00000000-0000-0000-0000-000000000001','draw',8,now());
`);
const legacy = (await db.query("select to_jsonb(g) game,(select jsonb_agg(p) from cam_football_picks p) picks from cam_football_games g where id='900000001'")).rows;
await db.exec(migration);
await db.exec(fs.readFileSync("supabase/migrations/20261024173013_cam_football_espn_odds.sql","utf8"));
assert.deepEqual((await db.query("select to_jsonb(g) game,(select jsonb_agg(p) from cam_football_picks p) picks from cam_football_games g where id='900000001'")).rows,legacy,'Migration preserves history exactly');
await db.exec(`grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;
insert into cam_football_games(id,competition,season,matchday,home_id,away_id,kickoff,opening_mode)
 select '90000000'||n,'laliga',2026,2,'1','2',now()+interval '1 day',case when n=4 then 'closed' else 'auto' end from generate_series(2,8)n;
update cam_football_games set status='live' where id='900000005';
update cam_football_games set kickoff=now()-interval '1 minute' where id='900000006';`);
async function role(name,uid='') { await db.exec(`reset role; set role ${name}; select set_config('request.jwt.claim.sub','${uid}',false)`); }
async function freeze(id,odds='') { return (await db.query(`select cam_football_freeze_points('${id}'${odds}) result`)).rows[0].result; }
for(const name of ['anon','authenticated']){
 await role(name);
 await assert.rejects(()=>freeze('900000002'),/permission denied/);
 await assert.rejects(()=>db.query("select cam_football_admin_odds('900000002',100,200,300)"),/permission denied/);
}
await role('service_role');
assert.equal(await freeze('900000002',",-200,300,500,'Test provider'"),true);
let market=(await db.query("select * from cam_football_games where id='900000002'")).rows[0];
assert.equal(market.picks_open,true);
assert.ok(Math.abs(Number(market.probability_home)+Number(market.probability_draw)+Number(market.probability_away)-1)<1e-6);
assert.deepEqual([market.points_home,market.points_draw,market.points_away],[3,9,12]);
assert.equal(await freeze('900000002',',100,200,300'),false,'No repricing after publication, even with zero picks');
await assert.rejects(()=>db.query("update cam_football_games set points_home=10 where id='900000002'"),/no se pueden modificar/);
await assert.rejects(()=>db.query("update cam_football_games set odds_locked_at=null where id='900000002'"),/no se pueden modificar/);
assert.equal(await freeze('900000003'),true);
let fallback=(await db.query("select * from cam_football_games where id='900000003'")).rows[0];
assert.deepEqual([fallback.points_home,fallback.points_draw,fallback.points_away],[6,6,6]);
assert.deepEqual([fallback.odds_home,fallback.odds_draw,fallback.odds_away,fallback.probability_home,fallback.probability_draw,fallback.probability_away],[null,null,null,null,null,null]);
assert.equal(fallback.odds_source,'automatic_equal_v1');assert.equal(fallback.picks_open,true);
assert.equal(await freeze('900000004'),true);
assert.equal((await db.query("select picks_open from cam_football_games where id='900000004'")).rows[0].picks_open,false,'Manual close persists');
assert.equal(await freeze('900000005'),false,'Do not open live games');
assert.equal(await freeze('900000006'),false,'Do not open started games');
await assert.rejects(()=>freeze('900000007',',100,null,200'),/incompleto/);
await assert.rejects(()=>freeze('900000007',',-2147483648,200,300'),/inválido/);
assert.equal((await db.query("select odds_locked_at from cam_football_games where id='900000007'")).rows[0].odds_locked_at,null,'Bad market does not partially persist');
assert.equal(await freeze('900000007',',400,-200,300'),true);
const drawFavorite=(await db.query("select points_home,points_draw,points_away from cam_football_games where id='900000007'")).rows[0];
assert.ok(drawFavorite.points_draw<drawFavorite.points_home && drawFavorite.points_draw<drawFavorite.points_away,'Draw points follow probability, never a fixed intermediate value');
for(let n=1;n<=3;n++){
 await role('authenticated','00000000-0000-0000-0000-00000000000'+n);
 await db.query(`select cam_football_save_pick('900000003','${['home','draw','away'][n-1]}')`);
}
await role('service_role');
assert.equal(await freeze('900000003',',-200,300,500'),false,'Saved fallback cannot become provider points later');
await db.exec("update cam_football_games set kickoff=now()-interval '2 hours',status='final',outcome='draw',home_score=1,away_score=1,picks_open=false where id='900000003'");
let result=(await db.query("select pick,awarded_points,settled_at from cam_football_picks where game_id='900000003' order by pick")).rows;
assert.deepEqual(result.map(p=>[p.pick,p.awarded_points]),[['away',0],['draw',6],['home',0]]);
assert.ok(result.every(p=>p.settled_at));
await db.exec("update cam_football_games set status='final',outcome='draw',home_score=1,away_score=1 where id='900000003'");
assert.deepEqual((await db.query("select pick,awarded_points,settled_at from cam_football_picks where game_id='900000003' order by pick")).rows,result,'Repeated sync neither duplicates points nor resettles');
await role('anon');
const leaders=(await db.query("select * from cam_football_leaderboard('matchday',2026,'laliga',2,null)")).rows;
assert.equal(Number(leaders[0].points),6);assert.equal(Number(leaders[0].hits),1);
const profile=(await db.query("select * from cam_football_profile_summary('00000000-0000-0000-0000-000000000002',2026)")).rows[0];
assert.equal(Number(profile.points),6);
await role('service_role');
assert.equal(await freeze('900000008'),true);
assert.equal(await freeze('900000008',",-200,300,500,'ESPN: DraftKings'"),true,'Unvoted provisional equal scores gain real probabilities');
assert.equal(await freeze('900000008',",100,200,300,'ESPN: DraftKings'"),false,'Real scores remain fixed');
await role('postgres');
await db.exec(fs.readFileSync('supabase/migrations/20261024181838_cam_football_optional_admin_points.sql','utf8'));
await role('authenticated','00000000-0000-0000-0000-000000000001');
await assert.rejects(()=>db.query("select cam_football_admin_points('900000002',5,7,9)"),/Solo administradores/);
await role('authenticated','00000000-0000-0000-0000-000000000003');
await db.query("select cam_football_admin_points('900000002',5,7,9)");
await db.query("select cam_football_admin_points('900000004',3,8,10)");
await assert.rejects(()=>db.query("select cam_football_admin_points('900000003',5,7,9)"),/sin pronósticos/);
await assert.rejects(()=>db.query("select cam_football_admin_points('900000002',0,7,9)"),/enteros/);
await role('service_role');
assert.equal(await freeze('900000004',",-200,300,500,'ESPN'"),false,'Sync preserves a manual override even for fallback');
assert.equal((await db.query("select points_home from cam_football_games where id='900000004'")).rows[0].points_home,3);
await role('postgres');
await assert.rejects(()=>db.query("update cam_football_games set picks_open=true where id='900000006'"),/check constraint/);
console.log('PASS: football scoring, normalization, equal fallback, immutable snapshots, auth, closure, existing history, 1X2 settlement/idempotency, leaderboard and profile.');
await db.close();
