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
create table net.checks(id bigint generated always as identity primary key,url text,headers jsonb);
create table net._http_response(id bigint,status_code int,timed_out boolean,error_msg text,content text,headers jsonb);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$
declare n bigint; begin insert into net.calls(body) values(body) returning id into n; return n; end $$;
create function net.http_get(url text,headers jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$
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
await db.exec(fs.readFileSync('supabase/19_cam_social_publication.sql', 'utf8'));
await db.exec(fs.readFileSync('supabase/20_cam_social_tiktok_music.sql', 'utf8'));
await db.exec("insert into cam_social.channels(network,channel_id) values('twitter','test-x'),('tiktok','test-tiktok')");
await db.exec("insert into vault.secrets values('cam_buffer_api_key','TEST_ONLY'); update cam_social.settings set enabled=true,activated_at=now()-interval '1 minute';");
const id = '00000000-0000-0000-0000-000000000991';
const one = async sql => (await db.query(sql)).rows;
const scalar = async sql => Object.values((await one(sql))[0])[0];

await db.query('insert into articles values($1,$2,$3,$4,true)', [
  id, 'Victoria del Barça', 'La crónica', 'https://example.com/photo.jpg'
]);
const check = (await one('select * from net.checks'))[0];
assert.ok(check, 'TikTok creates an availability check first');
assert.equal(check.headers.Range, 'bytes=0-0');
const basename = crypto.createHash('md5').update('article:' + id).digest('hex') + '.mp4';
assert.equal(check.url, 'https://camsports.github.io/assets/social-videos/' + basename);
assert.equal(await scalar('select count(*)::int from net.calls'), 1, 'Only X posts immediately');
const x = (await one('select * from net.calls'))[0];
assert.ok(x.body.variables.input.assets[0].image.url.endsWith('photo.jpg'));
assert.equal(x.body.variables.input.assets[0].video, undefined);

let jobs = await scalar('select public.cam_social_video_jobs()');
assert.equal(jobs.length, 1, 'Worker receives a visible queued article');
assert.equal(jobs[0].event_key, 'article:' + id);
assert.equal(jobs[0].title, 'Victoria del Barça');

// A missing MP4 must never be posted as a TikTok photo.
await db.query('insert into net._http_response values($1,404,false,null,$2,$3)', [
  check.id, 'Not found', { 'content-type': 'text/html' }
]);
await db.exec("update cam_social.deliveries set available_at=now() where network='tiktok'; select cam_social.dispatch();");
assert.equal(await scalar('select count(*)::int from net.calls'), 1);

await db.exec("update cam_social.deliveries set available_at=now() where network='tiktok'; select cam_social.dispatch();");
const second = (await one('select * from net.checks order by id desc limit 1'))[0];
assert.notEqual(second.id, check.id);
await db.query('insert into net._http_response values($1,206,false,null,$2,$3)', [
  second.id, '', { 'content-type': 'video/mp4' }
]);
await db.exec("update cam_social.deliveries set available_at=now() where network='tiktok'; select cam_social.dispatch();");
const calls = await one('select * from net.calls order by id');
assert.equal(calls.length, 2);
assert.equal(calls[1].body.variables.input.channelId, 'test-tiktok');
assert.equal(calls[1].body.variables.input.assets[0].video.url, check.url);
assert.equal(calls[1].body.variables.input.assets[0].video.metadata.thumbnailOffset, 2000);
assert.equal(calls[1].body.variables.input.assets[0].image, undefined);
jobs = await scalar('select public.cam_social_video_jobs()');
assert.equal(jobs.length, 0, 'Submitted video is not regenerated');
await db.exec('select cam_social.dispatch(); select cam_social.dispatch();');
assert.equal(await scalar('select count(*)::int from net.calls'), 2);

await db.exec('set role anon;');
assert.equal((await scalar('select public.cam_social_video_jobs()')).length, 0);
await assert.rejects(() => db.query('select * from cam_social.events'), /permission denied/);
await db.close();
console.log('PASS: X image, TikTok verified MP4, no silent photo, no duplicates, read-only worker RPC.');
