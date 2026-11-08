import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
await db.exec(`
create role anon;create role authenticated;create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create table public.ae_auth_accounts(user_id uuid primary key,username text);
create table public.ae_community_picks(user_id uuid,hidden boolean,moderation_status text,outcome text,result_points numeric,settled_at timestamptz);
create table public.cam_nfl_games(id text primary key,season int,week int,status text,home_id text,away_id text,winner_id text,home_score int,away_score int,points_home int,points_away int,kickoff timestamptz);
create table public.cam_nfl_picks(game_id text,user_id uuid,team_id text,awarded_points int not null default 0 constraint cam_nfl_picks_awarded_points_check check(awarded_points between 0 and 12),settled_at timestamptz,primary key(game_id,user_id));
create table public.cam_football_games(id text primary key,season int,matchday int,competition text,status text,home_id text,away_id text,outcome text,home_score int,away_score int,points_home int,points_draw int,points_away int,kickoff timestamptz);
create table public.cam_football_picks(game_id text,user_id uuid,pick text,awarded_points int not null default 0 constraint cam_football_picks_awarded_points_check check(awarded_points between 0 and 12),settled_at timestamptz,primary key(game_id,user_id));
create table public.cam_nfl_laurels(user_id uuid,game_id text);
create table public.cam_nfl_audit(game_id text,action text,actor_id uuid,detail jsonb);
create table public.cam_football_audit(game_id text,action text,actor_id uuid,detail jsonb);
`);
for(let n=1;n<=5;n++){
 await db.query('insert into auth.users(id) values($1)',[uid(n)]);
 await db.query('insert into public.ae_auth_accounts values($1,$2)',[uid(n),'reader_'+n]);
}
const start=(await db.query("select date_trunc('month',now() at time zone 'America/Toronto')::date::text m")).rows[0].m;
await db.query(`insert into public.cam_nfl_games values
 ('n1',2026,9,'final','H','A','H',21,10,3,9,$1::date+interval '18 hours'),
 ('n2',2026,9,'final','H','A','H',21,10,12,2,$1::date+interval '1 day 18 hours'),
 ('n3',2026,9,'tie','H','A',null,21,21,4,4,$1::date+interval '2 days 18 hours'),
 ('n4',2026,9,'scheduled','H','A',null,null,null,4,4,$1::date+interval '27 days 18 hours')`,[start]);
await db.query(`insert into public.cam_football_games values
 ('f1',2026,10,'laliga','final','H','A','home',2,1,3,7,10,$1::date+interval '18 hours'),
 ('f2',2026,10,'premier','final','H','A','draw',1,1,3,7,10,$1::date+interval '1 day 18 hours')`,[start]);
const stamp='2026-11-02T12:00:00Z';
for(const [id,base] of [['n1',3],['n2',12],['n3',0],['n4',0]]){
 await db.query('insert into public.cam_nfl_picks values($1,$2,$3,$4,$5)',[id,uid(1),'H',base,id==='n4'?null:stamp]);
 await db.query('insert into public.cam_nfl_picks values($1,$2,$3,0,$4)',[id,uid(2),'A',id==='n4'?null:stamp]);
}
await db.query("insert into public.cam_nfl_laurels values($1,'n2')",[uid(1)]);
for(const [n,first,second] of [[1,'away','home'],[2,'home','draw'],[3,'draw','away'],[4,'home','home'],[5,'draw','draw']]){
 for(const [id,pick,won,score] of [['f1',first,'home',3],['f2',second,'draw',7]])await db.query('insert into public.cam_football_picks values($1,$2,$3,$4,$5)',[id,uid(n),pick,pick===won?score:0,stamp]);
}
const leagueFile=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_cam_monthly_leagues.sql'));
await db.exec(fs.readFileSync('supabase/migrations/'+leagueFile,'utf8').replace(/-- BEGIN HOSTED SCHEDULER[\s\S]*?-- END HOSTED SCHEDULER/,''));
for(let n=1;n<=5;n++)await db.query("insert into public.cam_league_members(user_id,competition,rank_level,best_rank,last_month) values($1,'football',3,3,$2::date-interval '1 month')",[uid(n),start]);
await db.exec(fs.readFileSync('tests/fixtures/quiniela-rankings-before-all.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261026010151_cam_quiniela_all_time_rankings.sql','utf8'));
const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_cam_quiniela_signed_scoring.sql'));
const sql=fs.readFileSync('supabase/migrations/'+file,'utf8');
await db.exec(sql);
const ledger=async table=>(await db.query('select game_id,user_id,awarded_points,settled_at from public.'+table+' order by game_id,user_id')).rows;
let nfl=await ledger('cam_nfl_picks'),football=await ledger('cam_football_picks');
assert.deepEqual(nfl.map(x=>x.awarded_points),[3,-9,24,-2,0,0,0,0],'misses lose the chosen side value, laurels double only wins, void and pending score zero');
assert.deepEqual(football.filter(x=>x.game_id==='f1').map(x=>x.awarded_points),[-10,3,-7,3,-7]);
assert.deepEqual(football.filter(x=>x.game_id==='f2').map(x=>x.awarded_points),[-3,7,-10,-3,7],'football draw wins and misses use each selected outcome value');
assert.equal(football[0].settled_at.toISOString(),new Date(stamp).toISOString(),'backfill preserves settlement dates');
await db.exec(sql);
assert.deepEqual(await ledger('cam_nfl_picks'),nfl,'reapplication never accumulates penalties');
assert.deepEqual(await ledger('cam_football_picks'),football);
const board=(await db.query("select public.cam_league_board('football') b")).rows[0].b.rows;
assert.equal(board[0].user_id,uid(2));assert.equal(board[0].points,10);assert.equal(board[0].rank_after,4);
assert.equal(board[4].user_id,uid(3));assert.equal(board[4].points,-17);assert.equal(board[4].rank_after,2,'negative result demotes the bottom monthly participant');
const leaders=(await db.query("select * from public.cam_football_leaderboard('all',2026)")).rows;
assert.equal(leaders[0].user_id,uid(2));assert.equal(Number(leaders.at(-1).points),-17,'historical ranking retains negative totals');
await db.exec(`
 create trigger nfl_settle after update of status,home_score,away_score,winner_id on public.cam_nfl_games for each row execute function public.cam_nfl_settlement_trigger();
 create trigger football_settle after update of status,home_score,away_score,outcome on public.cam_football_games for each row execute function public.cam_football_settlement_trigger();
 update public.cam_nfl_games set winner_id='A',home_score=10,away_score=21 where id='n2';
`);
nfl=await ledger('cam_nfl_picks');assert.deepEqual(nfl.filter(x=>x.game_id==='n2').map(x=>x.awarded_points),[-12,2],'correction reverses signs, losing laurel pays only base penalty');
await db.exec("update public.cam_nfl_games set winner_id='A',home_score=10,away_score=21 where id='n2'");
assert.deepEqual(await ledger('cam_nfl_picks'),nfl,'repeated result does not resettle');
await db.exec("update public.cam_nfl_games set status='scheduled',winner_id=null,home_score=null,away_score=null where id='n2'");
assert((await ledger('cam_nfl_picks')).filter(x=>x.game_id==='n2').every(x=>x.awarded_points===0&&x.settled_at===null),'reopened games clear settlement');
await db.exec("update public.cam_football_games set outcome='away',home_score=0,away_score=2 where id='f1'");
football=await ledger('cam_football_picks');assert.deepEqual(football.filter(x=>x.game_id==='f1').map(x=>x.awarded_points),[10,-3,-7,-3,-7]);
await db.exec("update public.cam_football_games set status='cancelled' where id='f1'");
assert((await ledger('cam_football_picks')).filter(x=>x.game_id==='f1').every(x=>x.awarded_points===0),'cancellation removes all gains and penalties');
await db.exec("update public.cam_football_games set status='final',outcome=null where id='f1'");
assert((await ledger('cam_football_picks')).filter(x=>x.game_id==='f1').every(x=>x.awarded_points===0&&x.settled_at===null),'missing result cannot cause a deduction');
for(const role of ['anon','authenticated']){
 assert.equal((await db.query("select has_function_privilege($1,'public.cam_nfl_settlement_trigger()','execute') ok",[role])).rows[0].ok,false);
 assert.equal((await db.query("select has_function_privilege($1,'public.cam_football_settlement_trigger()','execute') ok",[role])).rows[0].ok,false);
}
console.log('PASS: signed NFL/1X2 scoring, historical recalculation, timezone-preserving dates, laurels, corrections/reopening/voids, idempotency, negative historical and monthly standings, promotion/demotion and server-only settlement.');
await db.close();
