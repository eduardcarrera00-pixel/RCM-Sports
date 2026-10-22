import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create function public.rcm_is_editor() returns boolean language sql stable as $$select false$$;
create schema vault; create table vault.secrets(name text,decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.secrets;
create schema net;
create table net.calls(id bigint generated always as identity primary key,body jsonb);
create table net.checks(id bigint generated always as identity (start with 1000) primary key,url text,headers jsonb);
create table net._http_response(id bigint,status_code int,timed_out boolean,error_msg text,content text,headers jsonb,content_type text);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds int)
 returns bigint language plpgsql as $$
 declare n bigint; begin insert into net.calls(body) values(body) returning id into n; return n; end $$;
create function net.http_get(url text,headers jsonb,timeout_milliseconds int)
 returns bigint language plpgsql as $$
 declare n bigint; begin insert into net.checks(url,headers) values(url,headers) returning id into n; return n; end $$;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
create table public.articles(id uuid primary key,title text,summary text,image text,is_public boolean);
create table public.ae_editorial_weekly_picks(id uuid primary key,title text,event_name text,selection text,american_odds int,is_published boolean,expires_at timestamptz,image_url text,banner_url text,image_path text,banner_path text);
create table public.nfl_rankings(id int primary key,edition text,team_ids text[]);
create table public.nfl_teams(id text primary key,name text);
create table public.champions_rankings(id uuid primary key,edition text,team_ids text[],season text);
create table public.champions_clubs(id text,season text,name text);
`);
for (const file of [
 'supabase/19_cam_social_publication.sql',
 'supabase/20_cam_social_tiktok_music.sql',
 'supabase/21_cam_social_tiktok_mime_fallback.sql',
 'supabase/migrations/20261021154636_cam_instagram_music_publication.sql'
]) await db.exec(fs.readFileSync(file,'utf8'));
const query = async sql => (await db.query(sql)).rows;
const one = async sql => (await query(sql))[0];
await db.exec(`
insert into cam_social.channels(network,channel_id) values
  ('twitter','test-x'),('tiktok','test-tiktok'),('instagram','test-instagram');
insert into vault.secrets values('cam_buffer_api_key','TEST_ONLY');
update cam_social.settings set enabled=true,activated_at=now()-interval '2 minutes';
`);
// A previously published event is immutable and must never be resent.
const old='00000000-0000-0000-0000-000000000800';
await db.query('insert into articles values($1,$2,$3,$4,true)',
 [old,'Historical story','Summary','https://example.com/pic.jpg']);
await db.exec("update cam_social.deliveries set status='published' where event_key='article:"+old+"'");
const countOld = (await one("select count(*)::int as count from cam_social.deliveries where event_key='article:"+old+"'")).count;
await db.exec(fs.readFileSync('supabase/migrations/20261022192000_cam_social_rotating_cc0_music.sql','utf8'));
assert.equal((await one("select count(*)::int as n from cam_social.deliveries where event_key='article:"+old+"' and music_track_slug is not null")).n,0,'Historical deliveries are not changed');
assert.equal((await one("select count(*)::int as n from cam_social.music_tracks where enabled")).n,10);

const ids=[];
for(let n=1;n<=6;n++) {
  const id='00000000-0000-0000-0000-'+String(900+n).padStart(12,'0');
  ids.push(id);
  await db.query('insert into articles values($1,$2,$3,$4,true)',
    [id,'Sports story '+n,'Summary','https://example.com/pic.jpg']);
}
const events=await query("select event_key,network,music_track_slug from cam_social.deliveries where event_key<>'article:"+old+"' order by id");
const clips=events.filter(e=>e.network!=='twitter');
assert.equal(clips.length,12);
assert.ok(events.filter(e=>e.network==='twitter').every(e=>e.music_track_slug===null),'X never receives a music assignment');
assert.ok(clips.every(e=>e.music_track_slug));
assert.equal(new Set(clips.slice(0,10).map(e=>e.music_track_slug)).size,10,'Use every track before repeating one');
for(const id of ids){
  const p=clips.filter(e=>e.event_key==='article:'+id);
  assert.equal(p.length,2);
  assert.notEqual(p[0].music_track_slug,p[1].music_track_slug,'IG and TikTok use separate tracks');
}
const jobs=(await one('select public.cam_social_video_jobs(12) as jobs')).jobs;
assert.equal(jobs.length,12,'One rendering job per delivery, not per event');
for(const job of jobs) {
  const delivery=clips.find(d=>d.event_key===job.event_key && d.network===job.network);
  assert.equal(job.track_slug,delivery.music_track_slug);
  assert.match(job.music_url,/^https:\/\/en\.freepd\.cn\/api\/music\/[a-fA-F0-9]+$/);
}
const checks=await query("select url from net.checks order by id");
for(const id of ids) {
  const key='article:'+id;
  const suffix=net=>crypto.createHash('md5').update(key+':'+net).digest('hex')+'.mp4';
  const ig='https://camsports.github.io/assets/social-videos/'+suffix('instagram');
  const tk='https://camsports.github.io/assets/social-videos/'+suffix('tiktok');
  assert.notEqual(ig,tk);
  assert.ok(checks.some(c=>c.url===ig),'Instagram checks the network-specific video');
  assert.ok(checks.some(c=>c.url===tk),'TikTok checks the network-specific video');
}
assert.equal((await one("select count(*)::int as n from cam_social.deliveries where event_key='article:"+old+"'")).n,countOld);
const xCalls=await query('select body from net.calls');
assert.ok(xCalls.length>0 && xCalls.every(c=>c.body.variables.input.assets[0].image),'X retains its original image');
await db.exec('set role anon');
const publicJobs=(await one('select public.cam_social_video_jobs() as jobs')).jobs;
assert.ok(publicJobs.every(j=>['event_key','image_url','kicker','music_url','network','style','title','track_slug'].every(k=>Object.hasOwn(j,k))));
await assert.rejects(()=>db.query('select * from cam_social.music_tracks'),/permission denied/);
await assert.rejects(()=>db.query('select * from cam_social.deliveries'),/permission denied/);
await db.close();
console.log('PASS: 10-track no-repeat rotation, distinct IG/TikTok audio, per-network MP4 URLs, stable history, X unchanged and denied private reads.');
