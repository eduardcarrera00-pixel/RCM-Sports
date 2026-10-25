import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {PGlite} from '@electric-sql/pglite';

const manifest=JSON.parse(fs.readFileSync('assets/social-videos/pick-template-manifest.json','utf8'));
const catalog=JSON.parse(fs.readFileSync('assets/social-videos/pick-template-tracks.json','utf8'));
assert.equal(manifest.version,1);assert.equal(manifest.clips.length,30);
assert.equal(new Set(manifest.clips.map(c=>c.file)).size,30);
for(const clip of manifest.clips){
  assert.ok(catalog.tracks.some(t=>t.slug===clip.track_slug&&t.license==='CC0'));
  assert.equal(clip.file,`pick-v1-safe-${clip.image_key}-${clip.track_slug}.mp4`);
  const path='assets/social-videos/'+clip.file,bytes=fs.readFileSync(path);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),clip.sha256);
  assert.equal(bytes.length,clip.bytes);
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries',
    'format=duration:stream=codec_type,codec_name,avg_frame_rate,width,height','-of','json',path],{encoding:'utf8'}));
  const video=info.streams.find(s=>s.codec_type==='video'),audio=info.streams.find(s=>s.codec_type==='audio');
  assert.equal(video.codec_name,'h264');assert.equal(audio.codec_name,'aac');
  assert.equal(video.width,720);assert.equal(video.height,1280);assert.equal(video.avg_frame_rate,'30/1');
  assert.ok(Number(info.format.duration)>=7.9&&Number(info.format.duration)<=8.2);
}

const db=new PGlite();
await db.exec(`
create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create function public.rcm_is_editor() returns boolean language sql stable as $$select false$$;
create schema vault;create table vault.secrets(name text,decrypted_secret text);
create view vault.decrypted_secrets as select * from vault.secrets;
create schema net;
create table net.calls(id bigint generated always as identity primary key,body jsonb);
create table net.checks(id bigint generated always as identity(start with 1000) primary key,url text,headers jsonb);
create table net._http_response(id bigint,status_code int,timed_out boolean,error_msg text,content text,headers jsonb,content_type text);
create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$
declare n bigint;begin insert into net.calls(body)values(body)returning id into n;return n;end$$;
create function net.http_get(url text,headers jsonb,timeout_milliseconds int) returns bigint language plpgsql as $$
declare n bigint;begin insert into net.checks(url,headers)values(url,headers)returning id into n;return n;end$$;
create schema cron;create function cron.schedule(text,text,text)returns bigint language sql as $$select 1::bigint$$;
create table public.articles(id uuid primary key,title text,summary text,image text,is_public boolean);
create table public.ae_editorial_weekly_picks(id uuid primary key,title text,event_name text,selection text,american_odds int,is_published boolean,expires_at timestamptz,image_url text,banner_url text,image_path text,banner_path text);
create table public.nfl_rankings(id int primary key,edition text,team_ids text[]);
create table public.nfl_teams(id text primary key,name text);
create table public.champions_rankings(id uuid primary key,edition text,team_ids text[],season text);
create table public.champions_clubs(id text,season text,name text);
`);
for(const file of ['supabase/19_cam_social_publication.sql','supabase/20_cam_social_tiktok_music.sql',
  'supabase/21_cam_social_tiktok_mime_fallback.sql',
  'supabase/migrations/20261021154636_cam_instagram_music_publication.sql',
  'supabase/migrations/20261022192000_cam_social_rotating_cc0_music.sql'])await db.exec(fs.readFileSync(file,'utf8'));
await db.exec(`insert into cam_social.channels(network,channel_id)values('twitter','test-x'),('instagram','test-ig'),('tiktok','test-tk');
insert into vault.secrets values('cam_buffer_api_key','TEST_ONLY');
update cam_social.settings set enabled=true,activated_at=now()-interval '1 minute';`);
const migration=fs.readFileSync('supabase/migrations/20261025195044_cam_pick_ready_social_videos.sql','utf8');
await db.exec(migration);await db.exec(migration);
const safeMigration=fs.readFileSync('supabase/migrations/20261025201928_cam_social_safe_frame.sql','utf8');
await db.exec(safeMigration);await db.exec(safeMigration);
const rows=async(sql,args)=>(await db.query(sql,args)).rows;
const one=async(sql,args)=>(await rows(sql,args))[0];
assert.equal((await one('select pick_media_cache_enabled from cam_social.settings')).pick_media_cache_enabled,false,'Assets cannot activate themselves before deployment');
assert.equal((await one('select count(*)::int n from cam_social.ready_pick_videos')).n,30);
const id='00000000-0000-0000-0000-000000000991',key='weekly:'+id;
await db.query(`insert into ae_editorial_weekly_picks(id,title,event_name,selection,american_odds,is_published,expires_at)
 values($1,'Pick nuevo','Equipo A vs Equipo B','Equipo A gana',150,true,now()+interval '1 day')`,[id]);
const legacyChecks=await rows('select * from net.checks');
assert.equal(legacyChecks.length,2,'Rollout flag preserves the existing media flow');
assert.ok(legacyChecks.every(c=>!c.url.includes('pick-v1-')));
assert.equal((await one('select count(*)::int n from net.calls')).n,1,'X posts once while videos wait');
assert.equal((await one('select public.cam_social_video_jobs(12) jobs')).jobs.length,2);
await db.exec('update cam_social.settings set pick_media_cache_enabled=true');
await db.exec(migration);
assert.equal((await one('select pick_media_cache_enabled from cam_social.settings')).pick_media_cache_enabled,true,'Reapplying cannot disable a verified rollout');
for(const image of ['picks','football','champion','custom']){
  const {url}=await one('select cam_social.ready_pick_video_url($1,$2,$3) url',['ae_editorial_weekly_picks',{brand_image_key:image},'adventure']);
  assert.ok(url.endsWith(`pick-v1-safe-${image==='custom'?'picks':image}-adventure.mp4`));
}
assert.equal((await one("select cam_social.ready_pick_video_url('articles','{}','adventure') url")).url,null,'News keep their original individual videos');
assert.equal((await one("select cam_social.ready_pick_video_url('ae_editorial_weekly_picks','{}','future-track') url")).url,null,'Unprepared future tracks fall back to the renderer');
assert.equal((await one('select public.cam_social_video_jobs(12) jobs')).jobs.length,0,'Prepared Picks do not wait for the scheduled worker');
await db.exec(`update cam_social.deliveries set available_at=now(),video_check_request_id=null,video_check_at=null
 where event_key='${key}' and network in('instagram','tiktok') and status='queued';select cam_social.dispatch();`);
let checks=await rows(`select c.*,d.network,d.music_track_slug from net.checks c join cam_social.deliveries d on d.video_check_request_id=c.id`);
assert.equal(checks.length,2);
assert.notEqual(checks[0].url,checks[1].url,'The two networks retain distinct music assignments');
for(const c of checks){
  assert.ok(c.url.endsWith(`pick-v1-safe-picks-${c.music_track_slug}.mp4`));
  assert.deepEqual(c.headers,{Range:'bytes=0-0'});
  await db.query('insert into net._http_response(id,status_code,content_type)values($1,200,$2)',[c.id,'text/html']);
}
await db.exec(`update cam_social.deliveries set available_at=now() where status='queued';select cam_social.dispatch();`);
assert.equal((await one('select count(*)::int n from net.calls')).n,1,'An unavailable or invalid MP4 cannot be published');
await db.exec(`update cam_social.deliveries set available_at=now() where status='queued';select cam_social.dispatch();`);
checks=await rows('select c.id from net.checks c join cam_social.deliveries d on d.video_check_request_id=c.id');
for(const c of checks)await db.query('insert into net._http_response(id,status_code,content_type)values($1,206,$2)',[c.id,'video/mp4']);
await db.exec(`update cam_social.deliveries set available_at=now() where status='queued';select cam_social.dispatch();`);
const calls=(await rows('select body from net.calls order by id')).map(r=>r.body.variables.input);
assert.equal(calls.length,3);
assert.ok(calls[0].assets[0].image,'X keeps its image');
for(const call of calls.slice(1)){
  assert.equal(call.schedulingType,'automatic');assert.equal(call.mode,'shareNow');
  assert.ok(call.assets[0].video.url.includes('pick-v1-'));
  assert.match(call.text,/Equipo A vs Equipo B/);assert.match(call.text,/Equipo A gana/);assert.match(call.text,/\+150/);
}
assert.deepEqual(calls.find(c=>c.channelId==='test-ig').metadata,{instagram:{type:'reel',shouldShareToFeed:true}});
await db.exec('select cam_social.dispatch();select cam_social.dispatch()');
assert.equal((await one('select count(*)::int n from net.calls')).n,3,'No duplicate sends after success or uncertain responses');
await db.exec("update ae_editorial_weekly_picks set title='Corrección de texto'");
assert.equal((await one('select count(*)::int n from net.calls')).n,3,'Edits do not republish the Pick');
const photoMigration=fs.readFileSync('supabase/migrations/20261025213843_cam_pick_photo_parlay_video.sql','utf8');
await db.exec(fs.readFileSync('supabase/migrations/20261022145552_cam_social_brand_rotation.sql','utf8'));
await db.exec(photoMigration);await db.exec(photoMigration);
const newId='00000000-0000-0000-0000-000000000992',newKey='weekly:'+newId;
await db.query(`insert into ae_editorial_weekly_picks(id,title,event_name,selection,american_odds,is_published,expires_at,image_path,banner_path)
 values($1,'Parlay','Equipo C vs Equipo D',E'Equipo C gana\\nMás de 2.5 goles\\nAmbos anotan',250,true,now()+interval '1 day','weekly/photo/actual.jpg','weekly/banner/other.jpg')`,[newId]);
const expectedPhoto='https://zahuhmvmqvxaunqebqaa.supabase.co/storage/v1/object/public/article-images/weekly/photo/actual.jpg';
const pickJobs=(await one('select public.cam_social_video_jobs(12) jobs')).jobs;
assert.equal(pickJobs.length,2,'New Picks use individual videos even with the cache enabled');
for(const job of pickJobs){
 assert.equal(job.video_version,'pick-v2');assert.equal(job.image_url,expectedPhoto);
 assert.equal(job.selection.split('\n').length,3);assert.equal(job.american_odds,250);
 assert.equal(job.event_name,'Equipo C vs Equipo D');
}
const photoCalls=(await rows('select body from net.calls order by id')).map(r=>r.body.variables.input);
assert.equal(photoCalls.length,4);assert.equal(photoCalls[3].assets[0].image.url,expectedPhoto,'X uses the actual photograph');
const photoChecks=await rows(`select c.url,d.network from net.checks c join cam_social.deliveries d on d.video_check_request_id=c.id where d.event_key=$1`,[newKey]);
assert.equal(photoChecks.length,2);assert.ok(photoChecks.every(c=>/\/pick-v2-[a-f0-9]{32}\.mp4$/.test(c.url)));
await db.exec(`update ae_editorial_weekly_picks set selection='Edited later' where id='${newId}';select cam_social.dispatch()`);
assert.equal((await one('select count(*)::int n from net.calls')).n,4,'No duplicate sends');
assert.equal((await one('select payload from cam_social.events where event_key=$1',[newKey])).payload.selection.split('\n').length,3,'Publication snapshot remains immutable');
await db.exec(`update ae_editorial_weekly_picks set is_published=false where id='${newId}'`);
assert.equal((await one('select public.cam_social_video_jobs(12) jobs')).jobs.length,0,'Hidden Picks never leak through the public jobs RPC');
await db.exec("alter table articles add column category text;insert into articles(id,title,summary,is_public,category)values('00000000-0000-0000-0000-000000000993','Nueva noticia','Resumen',true,'NFL')");
const newsChecks=await rows("select c.url from net.checks c join cam_social.deliveries d on d.video_check_request_id=c.id where d.event_key='article:00000000-0000-0000-0000-000000000993'");
assert.equal(newsChecks.length,2);assert.ok(newsChecks.every(c=>/\/safe-v2-[a-f0-9]{32}\.mp4$/.test(c.url)),'Queued generic videos cannot reuse old unsafe files');
await db.exec('set role anon');
await assert.rejects(()=>db.query('select * from cam_social.ready_pick_videos'),/permission denied/);
await assert.rejects(()=>db.query("select cam_social.ready_pick_video_url('ae_editorial_weekly_picks','{}','adventure')"),/permission denied/);
await db.close();
console.log('PASS: 30 verified H.264/AAC clips; safe activation; automatic Pick delivery without renderer; correct captions; MP4 validation; no duplicates; news and access preserved.');
