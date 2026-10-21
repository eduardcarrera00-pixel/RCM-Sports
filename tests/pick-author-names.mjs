import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
await db.exec(`
 create role anon;create role authenticated;
 create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function public.rcm_is_editor() returns boolean language sql stable as $$select auth.uid()='${id(1)}'::uuid$$;
 grant usage on schema public,auth to anon,authenticated;
 insert into auth.users values ('${id(1)}','{}'),('${id(2)}','{}'),('${id(3)}','{"username":"NombreAnterior"}'),('${id(4)}','{"username":"  ","display_name":"Nombre visible"}');
 create table public.ae_auth_accounts(user_id uuid unique references auth.users,username text primary key);
 alter table public.ae_auth_accounts enable row level security;
 revoke all on public.ae_auth_accounts from public,anon,authenticated;
 insert into public.ae_auth_accounts values ('${id(1)}','eduardcarrera00'),('${id(2)}','lector_registrado');
`);
await db.exec(fs.readFileSync('supabase/migrations/20261015060954_community_picks.sql','utf8'));
// Match the result columns used by the current ranking functions.
await db.exec(`alter table ae_community_picks add moderation_status text default 'approved',add outcome text default 'pending',add settled_at timestamptz,
 add result_points numeric generated always as (case when outcome='won' then american_odds/100.0 when outcome='lost' then -american_odds/100.0 else 0 end) stored;`);
const rankings=fs.readFileSync('supabase/migrations/20261021020000_champion_picks_to_takes.sql','utf8').split('-- 2)')[0];
await db.exec(rankings);
const legs=JSON.stringify([{sport:'NFL',event:'Equipo A vs Equipo B',selection:'Equipo A gana',odds:150}]);
async function user(n,claims={}){
 await db.exec(`reset role;set role ${n?'authenticated':'anon'};`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[n?id(n):'',JSON.stringify(claims)]);
}
async function post(title){return (await db.query('insert into ae_community_picks(title,legs) values($1,$2) returning *',[title,legs])).rows[0];}
// Reproduce the exact problem: an admin and a reader have registered names,
// but their session metadata is absent and the stored author becomes Usuario.
await user(1);const adminPick=await post('Pick del administrador');assert.equal(adminPick.author,'Usuario');
await user(2);const readerPick=await post('Pick del lector');assert.equal(readerPick.author,'Usuario');
await db.query('insert into ae_pick_comments(pick_id,body) values($1,$2)',[adminPick.id,'Un comentario anterior']);
await db.exec(`reset role;update ae_community_picks set outcome=case when user_id='${id(1)}' then 'won' else 'lost' end,settled_at=now();`);
const state=async()=> (await db.query("select id,to_jsonb(p)-'author' as data from ae_community_picks p order by id")).rows;
const before=await state();
const migration=fs.readFileSync('supabase/migrations/20261021203818_pick_author_account_names.sql','utf8');
await db.exec(migration);await db.exec(migration);
assert.deepEqual(await state(),before,'Repairing names preserves every other Pick field, points and result');
assert.equal((await db.query('select author from ae_pick_comments')).rows[0].author,'lector_registrado');
await user(0);
for(const period of ['month','all'])for(const fn of ['ae_pick_result_ranking','ae_pick_result_ranking_worst']){
 const r=(await db.query(`select * from ${fn}($1)`,[period])).rows;
 assert.equal(r.find(x=>x.user_id===id(1)).username,'eduardcarrera00');
 assert.equal(r.find(x=>x.user_id===id(2)).username,'lector_registrado');
 assert.equal(Number(r.find(x=>x.user_id===id(1)).points),1.5);
 assert.equal(Number(r.find(x=>x.user_id===id(2)).points),-1.5);
}
assert.deepEqual((await db.query('select author from ae_pick_feed order by author')).rows.map(r=>r.author),['eduardcarrera00','lector_registrado']);
await assert.rejects(()=>post('Visitante'),/permission/);
await user(1,{user_metadata:{username:'nombre_suplantado'}});
await assert.rejects(()=>db.query('select * from ae_auth_accounts'),/permission/);
await assert.rejects(()=>db.query('select ae_private.pick_public_author()'),/permission/);
// Remove only local fixtures so a fresh Pick can be inserted under the old
// daily uniqueness rule. No production records are created by these tests.
await db.exec('reset role;delete from ae_pick_comments;delete from ae_community_picks;');
for(const [n,name] of [[1,'eduardcarrera00'],[2,'lector_registrado'],[3,'NombreAnterior'],[4,'Nombre visible']]){
 await user(n,{user_metadata:{username:'nombre_suplantado'}});
 const p=await post('Pick con sesión antigua '+n);assert.equal(p.author,name);assert.equal(p.user_id,id(n));
 const c=(await db.query('insert into ae_pick_comments(pick_id,body) values($1,$2) returning author,user_id',[p.id,'Comentario con sesión antigua'])).rows[0];
 assert.equal(c.author,name);assert.equal(c.user_id,id(n));
}
await user(3,{is_anonymous:true});await assert.rejects(()=>db.query('insert into ae_pick_comments(pick_id,body) values($1,$2)',[adminPick.id,'Anónimo']),/Inicia sesión/);
await db.close();
console.log('PASS: missing admin/reader metadata reproduced; names repaired across monthly/all-time best/worst rankings, history/feed and comments; points unchanged; stale/spoofed JWT names ignored; private accounts protected.');
