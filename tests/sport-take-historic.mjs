import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
await db.exec(`
  create role anon; create role authenticated; create schema auth;
  grant usage on schema public to anon,authenticated;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
  create table public.ae_auth_accounts(user_id uuid primary key,username text);
  create table public.ae_free_takes(id uuid primary key,user_id uuid,sport text,
    competition text,title text,body text,created_at timestamptz,hidden boolean default false);
  create table public.ae_take_results(take_id uuid primary key,outcome text,points integer,scored_at timestamptz);
  create table public.ae_free_take_votes(take_id uuid,value smallint);
  alter table public.ae_free_takes enable row level security;
  alter table public.ae_take_results enable row level security;
  alter table public.ae_free_take_votes enable row level security;
  alter table public.ae_auth_accounts enable row level security;
  insert into auth.users values ('00000000-0000-0000-0000-000000000001','{"username":"nombre_anterior"}');
  insert into public.ae_auth_accounts values ('00000000-0000-0000-0000-000000000001','nombre_actual');
`);
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_sport_take_historic.sql'));
await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
const id=n=>'10000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function take(n,sport,points,outcome='won',hidden=false,when='2026-01-01'){
  await db.query(`insert into public.ae_free_takes values ($1,'00000000-0000-0000-0000-000000000001',$2,'','Título','Texto',$3,$4)`,[id(n),sport,when,hidden]);
  if(outcome)await db.query('insert into public.ae_take_results values ($1,$2,$3,$4)',[id(n),outcome,points,when]);
}
const record=sport=>db.query('select * from public.ae_sport_take_historic($1)',[sport]);
assert.equal((await record('nfl')).rows.length,0,'No fabricated record');
await take(1,'nfl',17);
await take(2,'premier',12);
await take(3,'nfl',20,'won',true);
await take(4,'nfl',20,'lost');
await take(5,'nfl',20,null);
await take(6,'general',20);
await take(7,'colegial',20);
await take(8,'nfl',17,'won',false,'2026-10-01');
await take(9,'nfl',0);
// The winning Take predates 200 newer posts and is not limited to the current month.
for(let n=10;n<215;n++)await take(n,'nfl',1,'won',false,'2026-11-01');
await db.exec(`insert into public.ae_free_take_votes values ('${id(1)}',1),('${id(1)}',1),('${id(1)}',-1); set role anon;`);
let r=(await record('nfl')).rows[0];
assert.equal(r.id,id(1));
assert.equal(r.points,17);
assert.equal(r.author,'nombre_actual');
assert.equal(Number(r.upvotes),2);
assert.equal(Number(r.downvotes),1);
assert.equal((await record('football')).rows[0].id,id(2));
assert.equal((await record('all')).rows.length,0,'Unrecognized scope cannot broaden the query');
assert.equal((await record(null)).rows.length,0);
await assert.rejects(()=>db.query('select * from public.ae_free_takes'),/permission denied/);
await assert.rejects(()=>db.query('select * from public.ae_auth_accounts'),/permission denied/);
await db.exec('reset role; set role authenticated;');
assert.equal((await record('nfl')).rows[0].id,id(1));
await db.exec('reset role;');
// All Fútbol categories participate in a single sport record.
let n=220;
for(const league of ['football','laliga','premier','ligamx','champions']){
  await take(n,league,13+(n-220));
  assert.equal((await record('football')).rows[0].id,id(n));
  n++;
}
await db.query('update public.ae_free_takes set hidden=true where id=$1',[id(224)]);
assert.equal((await record('football')).rows[0].id,id(223),'Moderation immediately removes the record');
await db.query('update public.ae_take_results set outcome=$1,points=0 where take_id=$2',['lost',id(1)]);
assert.equal((await record('nfl')).rows[0].id,id(8),'Corrections recompute the winner');
console.log('PASS: all-history sport records, football leagues, first-confirmed tie, current author, moderation, corrections and anonymous least-privilege access.');
await db.close();
