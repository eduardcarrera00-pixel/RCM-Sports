import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
await db.exec(`
create role anon; create role authenticated; create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function public.rcm_is_editor() returns boolean language sql stable as $$
  select auth.uid()='00000000-0000-0000-0000-000000000003'::uuid $$;
grant usage on schema public,auth to anon,authenticated;
create table public.ae_free_takes(id uuid primary key,user_id uuid not null references auth.users(id),sport text not null,
 title text not null,body text not null,created_at timestamptz not null default now(),hidden boolean not null default false);
alter table public.ae_free_takes enable row level security;
revoke all on public.ae_free_takes from public,anon,authenticated;
insert into auth.users values
('00000000-0000-0000-0000-000000000001','{"username":"NFL Fan"}'),
('00000000-0000-0000-0000-000000000002','{"username":"Futbol Fan"}'),
('00000000-0000-0000-0000-000000000003','{"username":"Editor"}');
insert into public.ae_free_takes(id,user_id,sport,title,body) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','nfl','NFL A','Predicción'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','football','Fútbol A','Predicción'),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','nfl','NFL B','Predicción');`);
await db.exec(fs.readFileSync('supabase/migrations/20261016205000_manual_take_results_and_rankings.sql','utf8'));
async function as(n){await db.exec(`reset role;set role ${n?'authenticated':'anon'};select set_config('request.jwt.claim.sub','${n?'00000000-0000-0000-0000-00000000000'+n:''}',false)`);}
const score=(take,outcome,points)=>db.query('select public.ae_score_free_take($1,$2,$3) as points',[`10000000-0000-0000-0000-00000000000${take}`,outcome,points]);
const ranking=(sport,period)=>db.query('select * from public.ae_take_result_ranking($1,$2)',[sport,period]);
await as(0);
assert.equal((await ranking('all','all')).rows.length,0);
await assert.rejects(()=>db.query('select * from public.ae_take_review_queue($1)',['nfl']),/permission denied/);
await as(1);
await assert.rejects(()=>score(1,'won',100),/Solo administradores/);
await assert.rejects(()=>db.query('update public.ae_take_results set points=100'),/permission denied/);
await as(3);
await assert.rejects(()=>score(1,'won',101),/acierto vale/);
await assert.rejects(()=>score(1,'lost',10),/fallo vale/);
await score(1,'won',100);
await score(2,'won',30);
await score(3,'lost',0);
assert.equal(Number((await ranking('nfl','all')).rows[0].points),100);
assert.equal(Number((await ranking('football','all')).rows[0].points),30);
assert.equal((await ranking('all','all')).rows.length,2);
assert.equal((await db.query('select * from public.ae_take_review_queue($1)',['nfl'])).rows.length,2);
await db.exec('reset role');
await assert.rejects(()=>db.query("update public.ae_free_takes set sport='football' where title='NFL A'"),/ya puntuado/);
await db.exec("update public.ae_take_results set scored_at=now()-interval '2 months' where points=100");
await as(3);
assert.equal(Number((await ranking('nfl','month')).rows[0].points),0);
await score(1,'won',70);
assert.equal(Number((await ranking('nfl','all')).rows[0].points),70);
assert.equal(Number((await ranking('nfl','month')).rows[0].points),70);
await db.exec('reset role');
await db.exec("update public.ae_free_takes set hidden=true where title='NFL A'");
assert.equal(Number((await ranking('nfl','all')).rows[0].points),0);
await as(0);
assert.equal((await ranking('football','all')).rows[0].username,'Futbol Fan');
console.log('PASS: admin-only scoring, 0–100 validation, sport separation, corrections, hidden Takes, public rankings and category lock.');
await db.close();
