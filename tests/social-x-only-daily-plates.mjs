import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const rows=async(sql,params=[])=>(await db.query(sql,params)).rows;
const scalar=async(sql,params=[])=>Object.values((await rows(sql,params))[0])[0];
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function public.rcm_is_editor() returns boolean language sql as $$select false$$;
create schema vault;
create table vault.secrets(name text,decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.secrets;
create schema net;
create table net.calls(id bigint generated always as identity,body jsonb);
create table net._http_response(id bigint,status_code int,timed_out boolean,error_msg text,content text);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds int)
 returns bigint language plpgsql as $$declare n bigint; begin
 insert into net.calls(body) values(body) returning id into n; return n; end$$;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table articles(id uuid primary key,title text,summary text,image text,is_public boolean);
create table ae_editorial_weekly_picks(id uuid primary key,title text,event_name text,
 selection text,american_odds int,is_published boolean,expires_at timestamptz,
 image_url text,banner_url text,image_path text,banner_path text);
create table nfl_rankings(id int primary key,edition text,team_ids text[]);
create table nfl_teams(id text primary key,name text);
create table champions_rankings(id uuid primary key,edition text,team_ids text[],season text);
create table champions_clubs(id text,season text,name text);
create table ae_community_picks(id uuid primary key,author text,title text,legs jsonb,
 american_odds int,created_at timestamptz,hidden boolean default false,
 moderation_status text default 'approved',outcome text default 'pending');
create table ae_pick_votes(pick_id uuid,value smallint);
create view ae_pick_feed as select p.*,
 (select count(*) from ae_pick_votes v where v.pick_id=p.id and v.value=1) as upvotes,
 (select count(*) from ae_pick_votes v where v.pick_id=p.id and v.value=-1) as downvotes,
 (select coalesce(sum(v.value),0) from ae_pick_votes v where v.pick_id=p.id) as score
 from ae_community_picks p where not hidden and moderation_status in ('pending','approved');
`);
await db.exec(fs.readFileSync('supabase/19_cam_social_publication.sql','utf8'));
await db.exec(`alter table cam_social.channels drop constraint channels_network_check;
 insert into cam_social.channels values('twitter','test-x',true),
 ('instagram','test-ig',true),('tiktok','test-tt',true);
 insert into cam_social.events values('legacy','articles',
 '00000000-0000-0000-0000-000000000001',null,'{}',now());
 insert into cam_social.deliveries(event_key,network,status)
 values('legacy','twitter','published'),('legacy','instagram','published'),
 ('legacy','tiktok','queued');`);
const migration=fs.readFileSync('supabase/migrations/20261109123349_cam_social_x_only_daily_plates.sql','utf8');
await db.exec(migration);
assert.deepEqual(await rows('select network,enabled from cam_social.channels order by network'),[
 {network:'instagram',enabled:false},{network:'tiktok',enabled:false},{network:'twitter',enabled:true}
]);
assert.deepEqual(await rows('select network,status from cam_social.deliveries order by network'),[
 {network:'instagram',status:'published'},{network:'tiktok',status:'cancelled'},
 {network:'twitter',status:'published'}
]);

const day=await scalar("select (now() at time zone 'America/Toronto')::date::text");
const at=async(time)=>scalar("select ($1::date+$2::time) at time zone 'America/Toronto'",[day,time]);
const at11=await at('11:00'),at15=await at('15:00');
const queue=async(kind,time)=>scalar('select cam_social.queue_daily_plate($1,$2::timestamptz)',[kind,time]);
assert.equal((await queue('best',at11)).status,'paused');
await db.exec("update cam_social.settings set enabled=true,activated_at=now()-interval '30 days'");
assert.equal((await queue('best',await at('10:59:59'))).status,'outside_window');
assert.equal((await queue('best',await at('12:00:00'))).status,'outside_window');
assert.equal((await queue('worst',await at('14:59:59'))).status,'outside_window');
assert.equal((await queue('worst',await at('16:00:00'))).status,'outside_window');
assert.equal((await queue('best',at11)).status,'no_candidate');
assert.equal((await queue('worst',at15)).status,'no_candidate');
await assert.rejects(()=>queue('something-else',at11),/Expected best or worst/);
// DST changes must keep local 11:00 and 15:00, not a fixed UTC hour.
assert.equal((await queue('best','2027-03-14T14:59:59Z')).status,'outside_window');
assert.equal((await queue('best','2027-03-14T15:00:00Z')).status,'no_candidate');
assert.equal((await queue('worst','2027-11-07T19:59:59Z')).status,'outside_window');
assert.equal((await queue('worst','2027-11-07T20:00:00Z')).status,'no_candidate');

const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const addPick=async(n,up,down,options={})=>{
 const created=options.created??await at('01:00');
 await db.query(`insert into ae_community_picks(id,author,title,legs,american_odds,
 created_at,hidden,moderation_status,outcome) values($1,$2,$3,$4,250,$5,$6,$7,$8)`,
 [id(n),'fan_'+n,'Partido '+n,JSON.stringify([{selection:'A gana'},{selection:'Más de 2 goles'}]),
 created,options.hidden??false,options.moderation??'approved',options.outcome??'pending']);
 for(const [value,count] of [[1,up],[-1,down]])
  await db.query('insert into ae_pick_votes select $1,$2::smallint from generate_series(1,$3::int)',[id(n),value,count]);
};
// Net score outranks raw likes; primary votes, age and UUID break ties.
await addPick(10,8,6);
await addPick(11,5,2);
await addPick(12,6,3,{created:await at('02:00')});
await addPick(13,6,3,{outcome:'lost'});
await addPick(14,6,3);
await addPick(20,2,6);
await addPick(21,1,4);
await addPick(90,100,0,{hidden:true});
await addPick(91,0,100,{moderation:'rejected'});
await addPick(92,100,0,{created:'2020-01-01T00:00:00Z'});
await addPick(93,0,100,{created:'2020-01-01T00:00:00Z'});
await addPick(94,0,0);
const best=await queue('best',at11),worst=await queue('worst',at15);
assert.equal(best.status,'queued');assert.equal(best.pick_id,id(13));
assert.equal(worst.status,'queued');assert.equal(worst.pick_id,id(20));
const daily=await rows("select * from cam_social.events where source_table='daily_plate' order by edition");
assert.equal(daily.length,2);
assert.equal(daily[0].payload.score,3);
assert.ok(daily.every(e=>e.payload.x_text.includes('por votos')));
assert.ok(daily.every(e=>e.payload.x_text.endsWith(e.payload.link)));
assert.ok(daily.every(e=>e.payload.link.endsWith('?s=picks&pick='+e.source_id)));
assert.ok(daily.every(e=>Array.from(e.payload.x_text.split('\n').slice(0,-1).join('\n')).length<=120));
assert.ok(daily.every(e=>e.payload.selection==='A gana + Más de 2 goles'));
assert.equal(await scalar("select count(*)::int from cam_social.deliveries where event_key like 'daily-plate:%' and network<>'twitter'"),0);
assert.equal((await queue('best',at11)).status,'already_queued');
assert.equal((await queue('worst',at15)).status,'already_queued');
assert.equal(await scalar("select count(*)::int from cam_social.deliveries where event_key like 'daily-plate:%'"),2);
await db.exec(migration);
assert.equal((await queue('best',at11)).status,'already_queued','Reapplying must preserve daily idempotency');

// The insertion guard still blocks legacy video producers if flags drift.
await db.exec("update cam_social.channels set enabled=true where network='instagram';");
await db.query("insert into cam_social.deliveries(event_key,network) values($1,'instagram')",[best.event_key]);
assert.equal(await scalar("select count(*)::int from cam_social.deliveries where event_key like 'daily-plate:%' and network='instagram'"),0);
// Independently verify the dispatcher against an already queued legacy row.
await db.exec("alter table cam_social.deliveries disable trigger cam_social_00_x_only_delivery");
await db.query("insert into cam_social.deliveries(event_key,network) values($1,'instagram')",[best.event_key]);
await db.exec(`alter table cam_social.deliveries enable trigger cam_social_00_x_only_delivery;
 insert into vault.secrets values('cam_buffer_api_key','TEST_ONLY');
 update cam_social.deliveries set available_at=now()-interval '1 second' where status='queued';
 select cam_social.dispatch();`);
assert.equal(await scalar('select count(*)::int from net.calls'),2);
assert.ok((await rows('select body from net.calls')).every(c=>c.body.variables.input.channelId==='test-x'));
await db.exec('select cam_social.dispatch(); select cam_social.dispatch()');
assert.equal(await scalar('select count(*)::int from net.calls'),2,'Cron/retries must not duplicate an uncertain send');

// A removed Pick is no longer publishable, and public roles cannot operate it.
assert.equal(await scalar('select cam_social.source_visible(e) from cam_social.events e where event_key=$1',[best.event_key]),true);
await db.query('update ae_community_picks set hidden=true where id=$1',[best.pick_id]);
assert.equal(await scalar('select cam_social.source_visible(e) from cam_social.events e where event_key=$1',[best.event_key]),false);
assert.equal(await scalar("select has_function_privilege('anon','cam_social.queue_daily_plate(text,timestamptz)','execute')"),false);
assert.equal(await scalar("select has_function_privilege('authenticated','cam_social.queue_daily_plate(text,timestamptz)','execute')"),false);
assert.equal(await scalar("select prosecdef from pg_proc where oid='cam_social.queue_daily_plate(text,timestamptz)'::regprocedure"),false);
await db.exec('set role anon');
await assert.rejects(()=>queue('best',at11),/permission denied/);
await db.close();

const workflow=fs.readFileSync('.github/workflows/cam-social-video.yml','utf8');
assert.ok(workflow.includes('workflow_dispatch:'));
assert.ok(!/^  (schedule|push):/m.test(workflow));
console.log('PASS: X-only policy, preserved history, weekly vote leaders and ties, DST/time windows, empty tables, idempotency, direct Pick links, removal guard, no duplicate sends, private execution and manual video worker.');
