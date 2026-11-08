import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
await db.exec(`
create role anon;create role authenticated;create role service_role;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
create table public.ae_auth_accounts(user_id uuid primary key,username text);
create table public.ae_community_picks(id uuid primary key,user_id uuid,hidden boolean default false,moderation_status text default 'approved',outcome text,result_points numeric,settled_at timestamptz);
create table public.cam_nfl_games(id text primary key,status text,winner_id text,kickoff timestamptz);
create table public.cam_nfl_picks(game_id text,user_id uuid,team_id text,awarded_points int);
create table public.cam_football_games(id text primary key,status text,outcome text,kickoff timestamptz);
create table public.cam_football_picks(game_id text,user_id uuid,pick text,awarded_points int);
`);
const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_cam_monthly_leagues.sql'));
const sql=fs.readFileSync('supabase/migrations/'+file,'utf8').replace(/-- BEGIN HOSTED SCHEDULER[\s\S]*?-- END HOSTED SCHEDULER/,'');
await db.exec(sql);
await db.exec("update public.cam_league_competitions set starts_on='2025-01-01'");
for(let n=1;n<=23;n++){
 await db.query('insert into auth.users(id) values($1)',[uid(n)]);
 await db.query('insert into public.ae_auth_accounts values($1,$2)',[uid(n),'reader_'+n]);
}
const outcome=async(rank,pos,total,eligible=true,inactive=0,streak=0,available=100)=>(await db.query('select public.cam_league_outcome($1,$2,$3,$4,$5,$6,$7) x',[rank,pos,total,eligible,inactive,streak,available])).rows[0].x;
for(let p=1;p<=100;p++){
 const r=await outcome(3,p,100);
 assert.equal(r.rank,p<=20?4:p>80?2:3,'20/60/20 exact boundaries, position '+p);
}
assert.equal((await outcome(0,100,100)).rank,0,'Cobre floor');
assert.equal((await outcome(5,1,100)).rank,5,'one elite month cannot earn Leyenda');
assert.equal((await outcome(5,5,100,true,0,1)).rank,6,'two elite months earn Leyenda');
assert.equal((await outcome(5,6,100,true,0,1)).streak,0,'outside top 5 breaks streak');
assert.equal((await outcome(4,1,100,true,0,9)).streak,0,'lower ranks cannot bank a Leyenda streak');
assert.equal((await outcome(6,10,100)).rank,6,'Leyenda top 10% retention');
assert.equal((await outcome(6,11,100)).rank,5,'Leyenda outside top 10% demotion');
assert.equal((await outcome(3,null,0,false,0)).rank,3,'first inactive month pauses');
assert.equal((await outcome(3,null,0,false,1)).rank,2,'second inactive month demotes');
assert.equal((await outcome(5,null,0,false,1,1,0)).inactive,1,'offseason preserves inactivity');
assert.equal((await outcome(5,null,0,false,1,1,0)).streak,1,'offseason preserves elite streak');
assert.equal((await outcome(0,1,1)).rank,1,'one-member leagues have an ascent and no overlapping descent');
await assert.rejects(()=>outcome(10,1,10));
let pickId=1000;
async function pick(user,at,score=1,extra={}){
 const p={hidden:false,moderation_status:'approved',outcome:'won',...extra};
 await db.query('insert into public.ae_community_picks values($1,$2,$3,$4,$5,$6,$7)',[uid(++pickId),uid(user),p.hidden,p.moderation_status,p.outcome,score,at]);
}
for(let n=1;n<=20;n++){
 await db.query("insert into public.cam_league_members(user_id,competition,rank_level,best_rank,last_month) values($1,'picks',3,3,'2024-12-01')",[uid(n)]);
 for(let k=0;k<10;k++)await pick(n,'2025-01-15T18:00:00Z',21-n);
}
// Excluded records never affect totals, eligibility, position or badges.
await pick(1,'2025-01-15T18:00:00Z',999,{hidden:true});
await pick(1,'2025-01-15T18:00:00Z',999,{moderation_status:'rejected'});
await pick(1,'2025-01-15T18:00:00Z',999,{outcome:'pending'});
await pick(1,'2025-01-15T18:00:00Z',999,{outcome:'void'});
for(let k=0;k<9;k++)await pick(23,'2025-01-15T18:00:00Z',999);
// Toronto midnight, not UTC midnight, decides the month's boundary.
await pick(21,'2025-02-01T04:59:59Z',1);
await pick(21,'2025-02-01T05:00:00Z',1);
for(let k=1;k<=7;k++){
 await db.query("insert into public.cam_nfl_games values($1,'final','home',$2)",['g'+k,'2025-01-'+String(k+10).padStart(2,'0')+'T18:00:00Z']);
 if(k<=4)await db.query("insert into public.cam_nfl_picks values($1,$2,'home',3)",['g'+k,uid(21)]);
 if(k<=3)await db.query("insert into public.cam_nfl_picks values($1,$2,'home',3)",['g'+k,uid(22)]);
}
await db.exec("select cam_competitive.close_month('2025-01-01')");
const standings=(await db.query("select * from public.cam_league_standings where competition='picks' and season_month='2025-01-01' order by position nulls last")).rows;
assert.equal(standings.filter(x=>x.eligible).length,20,'minimum excludes nine-result user');
assert.equal(standings[0].resolved,10,'moderation/pending/void filters');
assert.equal(standings[0].points,'200');
assert.equal(standings.find(x=>x.user_id===uid(21)).resolved,1,'timezone boundary excludes Feb result');
assert.equal(standings.filter(x=>x.rank_after===4).length,4);
assert.equal(standings.filter(x=>x.rank_after===2).length,4);
assert.equal(standings.filter(x=>x.eligible&&x.position<=10).length,10,'exactly ten finalized badges');
const nfl=(await db.query("select * from public.cam_league_standings where competition='nfl' and season_month='2025-01-01' order by resolved desc")).rows;
assert.equal(nfl[0].required,4,'50% of 7 rounds up');
assert.equal(nfl[0].eligible,true);assert.equal(nfl[1].eligible,false);
const history=await db.query('select * from public.cam_league_history order by competition,user_id');
await db.exec("select cam_competitive.close_month('2025-01-01');select cam_competitive.refresh_month('2025-01-01')");
assert.deepEqual((await db.query('select * from public.cam_league_history order by competition,user_id')).rows,history.rows,'close and refresh cannot rewrite or duplicate final awards');
await db.exec("select cam_competitive.close_month('2025-02-01')");
assert.equal((await db.query("select inactive_months from public.cam_league_members where competition='nfl' and user_id=$1",[uid(21)])).rows[0].inactive_months,0,'offseason does not punish members');
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 assert.equal((await db.query('select public.cam_league_profile($1) p',[uid(1)])).rows[0].p.ranks.length,3,'public aggregate profile is readable');
 assert.equal((await db.query("select public.cam_league_board('picks','2025-01-01') b")).rows[0].b.rows.length,22);
 await assert.rejects(()=>db.exec("update public.cam_league_members set rank_level=6"),/permission denied/);
 await assert.rejects(()=>db.exec("delete from public.cam_league_history"),/permission denied/);
 await assert.rejects(()=>db.exec('select cam_competitive.tick()'),/permission denied/);
 await db.exec('reset role');
}
assert.equal((await db.query("select count(*)::int n from pg_class where relname like 'cam_league_%' and relkind='r' and relrowsecurity")).rows[0].n,5);
console.log('PASS: monthly percentile boundaries, eligibility, Toronto cutoff, Legend, inactivity/offseason, immutable and idempotent awards, public reads and blocked client writes.');
await db.close();
