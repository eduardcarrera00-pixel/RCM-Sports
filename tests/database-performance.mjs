import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const uid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const article=uid(101),pick=uid(201),comment=uid(301);
await db.exec(`
create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('is_anonymous',current_setting('test.anonymous',true)='true') $$;
grant usage on schema public,auth to anon,authenticated;
grant execute on all functions in schema auth to anon,authenticated;
create table public.editors(user_id uuid primary key);
create function public.rcm_is_editor() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.editors where user_id=(select auth.uid())) $$;
create table public.articles(id uuid primary key,created_by uuid,is_public boolean);
create table public.comments(id uuid primary key,article_id text,user_id uuid,parent_id uuid);
create table public.comment_votes(comment_id uuid,user_id uuid,value int,primary key(comment_id,user_id));
create table public.article_likes(article_id uuid,user_id uuid,primary key(article_id,user_id));
create table public.ae_community_picks(id uuid primary key,user_id uuid,hidden boolean default false,moderation_status text default 'approved',outcome text default 'pending',event_date date default current_date+10);
create table public.ae_pick_comments(id uuid primary key,pick_id uuid,user_id uuid,hidden boolean default false);
create table public.ae_pick_votes(pick_id uuid,user_id uuid,value int,primary key(pick_id,user_id));
create table public.ae_opinions(id uuid primary key,created_by uuid,is_published boolean);
create table public.ae_free_take_votes(take_id uuid,user_id uuid);
create table public.ae_pick_comment_votes(comment_id uuid,user_id uuid);
create table public.ae_take_replies(id uuid,parent_id uuid);
create table public.cam_nfl_picks(game_id text,user_id uuid,team_id text);
insert into public.editors values('${uid(3)}');
insert into public.articles values('${article}','${uid(3)}',true),('${uid(102)}','${uid(3)}',false);
insert into public.comments values('${comment}','${article}','${uid(1)}',null);
insert into public.comment_votes values('${comment}','${uid(1)}',1),('${comment}','${uid(2)}',-1);
insert into public.ae_community_picks(id,user_id)values('${pick}','${uid(1)}');
grant all on all tables in schema public to anon,authenticated;
`);
for(const name of ['editors','articles','comments','comment_votes','article_likes','ae_community_picks','ae_pick_comments','ae_pick_votes','ae_opinions'])await db.exec('alter table public.'+name+' enable row level security');
await db.exec('create policy fixture_public_comments on public.comments for select using(true)');
await db.exec(fs.readFileSync(new URL('./fixtures/performance-policies-before.sql',import.meta.url),'utf8'));
async function attempt(role,id,anonymous,sql){
 await db.exec('begin');
 try{
  await db.exec('set local role '+role);
  await db.query("select set_config('test.uid',$1,true),set_config('test.anonymous',$2,true)",[id?uid(id):'',String(anonymous)]);
  const result=await db.query(sql);return {ok:true,rows:result.rows};
 }catch(e){return {ok:false,code:e.code};}
 finally{await db.exec('rollback');}
}
const cases=[
 ['anon read','anon',null,false,'select id from public.articles order by id'],
 ['reader read','authenticated',1,false,'select id from public.articles order by id'],
 ['editor read','authenticated',3,false,'select id from public.articles order by id'],
 ['reader cannot publish','authenticated',1,false,`insert into public.articles values('${uid(109)}','${uid(1)}',true) returning id`],
 ['editor publishes','authenticated',3,false,`insert into public.articles values('${uid(109)}','${uid(3)}',true) returning id`],
 ['reader cannot edit','authenticated',1,false,`update public.articles set is_public=false where id='${article}' returning id`],
 ['editor edits','authenticated',3,false,`update public.articles set is_public=false where id='${article}' returning id`],
 ['reader cannot delete','authenticated',1,false,`delete from public.articles where id='${article}' returning id`],
 ['editor deletes','authenticated',3,false,`delete from public.articles where id='${article}' returning id`],
 ['own editor identity','authenticated',3,false,'select user_id from public.editors'],
 ['foreign editor identity','authenticated',1,false,'select user_id from public.editors'],
 ['own vote delete','authenticated',1,false,`delete from public.comment_votes where user_id='${uid(1)}' returning user_id`],
 ['foreign vote delete','authenticated',2,false,`delete from public.comment_votes where user_id='${uid(1)}' returning user_id`],
 ['owner likes','authenticated',1,false,`insert into public.article_likes values('${article}','${uid(1)}') returning user_id`],
 ['spoofed like','authenticated',2,false,`insert into public.article_likes values('${article}','${uid(1)}') returning user_id`],
 ['anonymous account like','authenticated',1,true,`insert into public.article_likes values('${article}','${uid(1)}') returning user_id`],
 ['pick owner insert','authenticated',1,false,`insert into public.ae_community_picks(id,user_id)values('${uid(209)}','${uid(1)}') returning id`],
 ['anonymous pick insert','authenticated',1,true,`insert into public.ae_community_picks(id,user_id)values('${uid(209)}','${uid(1)}') returning id`],
 ['comment owner insert','authenticated',2,false,`insert into public.ae_pick_comments(id,pick_id,user_id)values('${uid(309)}','${pick}','${uid(2)}') returning id`],
 ['anonymous comment insert','authenticated',2,true,`insert into public.ae_pick_comments(id,pick_id,user_id)values('${uid(309)}','${pick}','${uid(2)}') returning id`],
 ['other user votes','authenticated',2,false,`insert into public.ae_pick_votes values('${pick}','${uid(2)}',1) returning user_id`],
 ['self vote blocked','authenticated',1,false,`insert into public.ae_pick_votes values('${pick}','${uid(1)}',1) returning user_id`],
 ['anonymous vote blocked','authenticated',2,true,`insert into public.ae_pick_votes values('${pick}','${uid(2)}',1) returning user_id`],
 ['editor opinion','authenticated',3,false,`insert into public.ae_opinions values('${uid(401)}','${uid(3)}',true) returning id`],
 ['reader opinion blocked','authenticated',1,false,`insert into public.ae_opinions values('${uid(401)}','${uid(1)}',true) returning id`]
];
async function sample(){const out=[];for(const [name,...args]of cases)out.push([name,await attempt(...args)]);return out;}
const before=await sample();
const baseline=new Map(before);
assert.equal(baseline.get('anon read').rows.length,1,'Visitors see only the public article');
assert.equal(baseline.get('editor read').rows.length,2,'Editors also see the private article');
for(const name of ['reader cannot edit','reader cannot delete','foreign editor identity','foreign vote delete'])assert.equal(baseline.get(name).rows.length,0,name);
for(const name of ['editor publishes','editor edits','editor deletes','own vote delete','owner likes','pick owner insert','comment owner insert','other user votes','editor opinion'])assert.equal(baseline.get(name).rows.length,1,name);
const migration=fs.readFileSync(new URL('../supabase/migrations/20261025152342_optimize_public_relations_and_rls.sql',import.meta.url),'utf8');
await db.exec(migration);
assert.deepEqual(await sample(),before,'All live-policy permissions must remain identical');
const afterPolicies=(await db.query("select tablename,policyname,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows;
await db.exec(migration);
assert.deepEqual((await db.query("select tablename,policyname,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname")).rows,afterPolicies,'Migration must be repeatable');
const indexes=(await db.query("select indexname from pg_indexes where indexname like 'cam_%'")).rows;
assert.equal(indexes.length,8);
for(const [name,r]of before){if(['reader cannot publish','spoofed like','anonymous account like','anonymous pick insert','anonymous comment insert','self vote blocked','anonymous vote blocked','reader opinion blocked'].includes(name))assert.equal(r.ok,false,name);}
console.log('PASS: 25 before/after authorization cases, unchanged RLS guards, 8 indexes and idempotent migration.');
await db.close();
