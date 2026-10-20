import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.rcm_is_editor() returns boolean language sql stable as $$select auth.uid()='00000000-0000-0000-0000-000000000001'::uuid$$;
create schema vault; create table vault.secrets(name text,decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.secrets;
create schema net;
create table net.calls(id bigint generated always as identity primary key,body jsonb,headers jsonb);
create table net._http_response(id bigint,status_code int,timed_out boolean,error_msg text,content text);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$
declare n bigint; begin insert into net.calls(body,headers) values(body,headers) returning id into n; return n; end $$;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table public.articles(id uuid primary key,title text,summary text,image text,is_public boolean);
create table public.ae_editorial_weekly_picks(id uuid primary key,title text,event_name text,selection text,american_odds int,is_published boolean,expires_at timestamptz,image_url text,banner_url text,image_path text,banner_path text);
create table public.nfl_rankings(id int primary key,edition text,team_ids text[]);
create table public.nfl_teams(id text primary key,name text);
create table public.champions_rankings(id uuid primary key,edition text,team_ids text[],season text);
create table public.champions_clubs(id text,season text,name text);
`);
const sql=fs.readFileSync('supabase/19_cam_social_publication.sql','utf8');
await db.exec(sql);
await db.exec("insert into cam_social.channels(network,channel_id) values('twitter','test-x'),('tiktok','test-tiktok');");
const article='00000000-0000-0000-0000-000000000010';
const article2='00000000-0000-0000-0000-000000000020';
const rows=async q=>(await db.query(q)).rows;
const scalar=async q=>Object.values((await rows(q))[0])[0];
// Installing or re-running the migration never publishes existing content.
await db.query('insert into articles values($1,$2,$3,$4,true)',[article,'Antes de activar','Nota antigua','https://example.com/photo.jpg']);
assert.equal(await scalar('select count(*)::int from cam_social.events'),0);
await db.exec(sql);
assert.equal(await scalar('select count(*)::int from cam_social.events'),0);
await db.exec("insert into vault.secrets values('cam_buffer_api_key','TEST_ONLY'); update cam_social.settings set enabled=true,activated_at=now();");
await db.query('insert into articles values($1,$2,$3,$4,false)',[article2,'Nueva noticia','Texto público','https://example.com/photo.jpg']);
assert.equal(await scalar('select count(*)::int from cam_social.events'),0);
await db.query('update articles set is_public=true where id=$1',[article2]);
assert.equal(await scalar('select count(*)::int from cam_social.events'),1);
assert.equal(await scalar('select count(*)::int from net.calls'),2);
const calls=await rows('select * from net.calls order by id');
assert.equal(calls[0].body.variables.input.mode,'shareNow');
assert.equal(calls[0].body.variables.input.schedulingType,'automatic');
assert.ok(calls.some(x=>x.body.variables.input.metadata?.tiktok?.title==='Nueva noticia'));
assert.ok(calls.every(x=>x.body.variables.input.assets[0].image.url==='https://example.com/photo.jpg'));
await db.query('update articles set title=$2 where id=$1',[article2,'Corregida']);
await db.exec('select cam_social.dispatch();');
assert.equal(await scalar('select count(*)::int from net.calls'),2,'Edits and cron must not duplicate submissions');
// One accepted channel never causes a retry on the other channel.
await db.query('insert into net._http_response values($1,200,false,null,$2)',[calls[0].id,JSON.stringify({data:{createPost:{__typename:'PostActionSuccess',post:{id:'buffer-1',status:'sent',externalLink:'https://x.com/test/status/1'}}}})]);
await db.query('insert into net._http_response values($1,503,false,null,$2)',[calls[1].id,'unavailable']);
await db.exec('select cam_social.dispatch(); select cam_social.dispatch();');
assert.deepEqual((await rows('select status from cam_social.deliveries order by id')).map(x=>x.status),['published','uncertain']);
assert.equal(await scalar('select count(*)::int from net.calls'),2,'Ambiguous API failures require review, not a duplicate retry');
// Queue work without a key; remove it from the site before dispatch.
await db.exec("delete from vault.secrets; update articles set is_public=false where id='"+article+"'; update articles set is_public=true where id='"+article+"';");
assert.equal(await scalar("select count(*)::int from cam_social.deliveries where status='queued'"),2);
await db.query('update articles set is_public=false where id=$1',[article]);
await db.exec("insert into vault.secrets values('cam_buffer_api_key','TEST_ONLY'); select cam_social.dispatch();");
assert.equal(await scalar("select count(*)::int from cam_social.deliveries where status='cancelled'"),2);
// Rankings: publish each edition once, including correction of the singleton NFL row.
const ids=Array.from({length:10},(_,i)=>'team'+i);
await db.query('insert into nfl_rankings values(1,$1,$2)',['Semana 7',ids]);
await db.query('update nfl_rankings set team_ids=$1 where id=1',[ids.toReversed()]);
assert.equal(await scalar("select count(*)::int from cam_social.events where source_table='nfl_rankings'"),1);
await db.query('update nfl_rankings set edition=$1 where id=1',['Semana 8']);
assert.equal(await scalar("select count(*)::int from cam_social.events where source_table='nfl_rankings'"),2);
// Definitive rate rejection safely defers retry; no parallel flood.
const latest=await scalar('select max(id) from net.calls');
await db.query('insert into net._http_response values($1,429,false,null,$2)',[latest,'{}']);
await db.exec('select cam_social.dispatch();');
assert.equal(await scalar('select paused_until>now() from cam_social.settings'),true);
// Expired weekly Picks are excluded; valid ones include the immutable shared ID.
await db.exec("update cam_social.settings set paused_until=null;");
const weekly='00000000-0000-0000-0000-000000000030';
await db.query(`insert into ae_editorial_weekly_picks(id,title,event_name,selection,american_odds,is_published,expires_at,image_path)
 values($1,'Pick editorial','A vs B','A gana',150,true,now()-interval '1 hour','weekly/article/photo.png')`,[weekly]);
assert.equal(await scalar("select count(*)::int from cam_social.events where source_table='ae_editorial_weekly_picks'"),0);
await db.query('update ae_editorial_weekly_picks set is_published=false where id=$1',[weekly]);
await db.query("update ae_editorial_weekly_picks set is_published=true,expires_at=now()+interval '1 day' where id=$1",[weekly]);
const pickEvent=(await rows("select payload from cam_social.events where source_table='ae_editorial_weekly_picks'"))[0].payload;
assert.ok(pickEvent.link.endsWith('?weeklyPick='+weekly));
assert.ok(pickEvent.tiktok_text.includes('Cuota +150'));
assert.ok(pickEvent.image_url.endsWith('/weekly/article/photo.png'));
// A rolled-back editorial transaction never leaves a social request behind.
const before=await scalar('select count(*)::int from net.calls');
await db.exec('begin');
await db.query('insert into articles values($1,$2,$3,$4,true)',['00000000-0000-0000-0000-000000000040','No publicar','Rollback','https://example.com/photo.png']);
await db.exec('rollback');
assert.equal(await scalar('select count(*)::int from net.calls'),before);
// The integration cannot be operated or inspected by readers or normal accounts.
await db.exec('set role anon;');
await assert.rejects(()=>db.query('select * from cam_social.events'),/permission denied/);
await assert.rejects(()=>db.query('select cam_social.dispatch()'),/permission denied/);
await assert.rejects(()=>db.query('select public.cam_social_status()'),/permission denied/);
await db.exec("reset role; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);");
await assert.rejects(()=>db.query('select public.cam_social_status()'),/Solo administradores/);
await db.exec("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);");
const status=await scalar('select public.cam_social_status()');
assert.equal(status.has_buffer_key,true);
assert.ok(!JSON.stringify(status).includes('TEST_ONLY'));
await db.close();
console.log('PASS: paused setup, draft publication, two independent channels, deduplication, ambiguous failure, removal, editions, rate backoff and authorization.');
