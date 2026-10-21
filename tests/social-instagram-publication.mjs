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
await db.exec(fs.readFileSync('supabase/21_cam_social_tiktok_mime_fallback.sql', 'utf8'));

const migration = fs.readFileSync('supabase/migrations/20261021154636_cam_instagram_music_publication.sql','utf8');
const rows = async sql => (await db.query(sql)).rows;
const scalar = async sql => Object.values((await rows(sql))[0])[0];
const insertArticle = async (id, published=true) => db.query('insert into articles values($1,$2,$3,$4,$5)',[
 id,'CAM Sports noticia','Resumen','https://example.com/photo.jpg',published
]);
await db.exec("insert into cam_social.channels(network,channel_id) values('twitter','test-x'),('tiktok','test-tiktok'); insert into vault.secrets values('cam_buffer_api_key','TEST_ONLY'); update cam_social.settings set enabled=true,activated_at=now()-interval '1 minute';");
const oldId = '00000000-0000-0000-0000-000000000901';
await insertArticle(oldId);
await db.exec(migration);
assert.equal(await scalar("select count(*)::int from cam_social.channels where network='instagram'"),0,'Migration cannot invent or activate an unconnected Instagram account');
assert.equal(await scalar('select count(*)::int from cam_social.deliveries'),2,'Migration does not backfill history');
await db.exec("insert into cam_social.channels(network,channel_id) values('instagram','test-ig');");
const id = '00000000-0000-0000-0000-000000000902';
await insertArticle(id);
assert.equal(await scalar(`select count(*)::int from cam_social.deliveries where event_key='article:${id}'`),3);
assert.equal(await scalar('select count(*)::int from net.calls'),2,'Only X sends before video verification');
const jobs = await scalar('select public.cam_social_video_jobs()');
assert.equal(jobs.length,2,'Shared MP4 jobs are deduplicated per event');
assert.equal(jobs.filter(j=>j.event_key==='article:'+id).length,1);
const checks = await rows(`select c.*,d.network from net.checks c join cam_social.deliveries d on d.video_check_request_id=c.id where d.event_key='article:${id}'`);
assert.equal(checks.length,2);
assert.equal(checks[0].url,checks[1].url,'Instagram reuses the same MP4 as TikTok');
const filename=crypto.createHash('md5').update('article:'+id).digest('hex')+'.mp4';
assert.ok(checks[0].url.endsWith(filename));
for(const c of checks) await db.query('insert into net._http_response(id,status_code,headers) values($1,200,$2)',[c.id,{'Content-Type':'text/html'}]);
await db.exec(`update cam_social.deliveries set available_at=now() where event_key='article:${id}'; select cam_social.dispatch();`);
assert.equal(await scalar('select count(*)::int from net.calls'),2,'An HTML 200 response is not a playable music MP4');
await db.exec(`update cam_social.deliveries set available_at=now() where event_key='article:${id}'; select cam_social.dispatch();`);
const verified=await rows(`select c.id from net.checks c join cam_social.deliveries d on d.video_check_request_id=c.id where d.event_key='article:${id}'`);
for(const c of verified) await db.query('insert into net._http_response(id,status_code,content_type) values($1,206,$2)',[c.id,'video/mp4']);
await db.exec(`update cam_social.deliveries set available_at=now() where event_key='article:${id}'; select cam_social.dispatch();`);
const calls=(await rows('select * from net.calls order by id')).map(c=>c.body.variables.input);
const ig=calls.find(c=>c.channelId==='test-ig');
const tk=calls.find(c=>c.channelId==='test-tiktok');
assert.ok(ig && tk);
assert.deepEqual(ig.metadata,{instagram:{type:'reel',shouldShareToFeed:true}});
assert.equal(ig.mode,'shareNow');
assert.equal(ig.schedulingType,'automatic');
assert.equal(ig.assets[0].video.url,tk.assets[0].video.url);
assert.equal(ig.assets[0].video.metadata.thumbnailOffset,2000);
assert.equal(ig.assets[0].image,undefined);
assert.ok(ig.text.includes('Resumen'));
assert.equal(calls[1].assets[0].video,undefined,'X retains its image');
const count=calls.length;
await db.exec(`update articles set title='Corrección' where id='${id}'; select cam_social.dispatch(); select cam_social.dispatch();`);
assert.equal(await scalar('select count(*)::int from net.calls'),count,'Editing or dispatching twice does not duplicate deliveries');
// A timeout stays uncertain on Instagram, while TikTok can independently succeed.
const requests=await rows(`select request_id,network from cam_social.deliveries where event_key='article:${id}' and network in ('tiktok','instagram')`);
for(const d of requests){
 if(d.network==='instagram') await db.query('insert into net._http_response(id,status_code,timed_out) values($1,null,true)',[d.request_id]);
 else await db.query('insert into net._http_response(id,status_code,content) values($1,200,$2)',[d.request_id,JSON.stringify({data:{createPost:{post:{id:'tk-real-mock',status:'sent'}}}})]);
}
await db.exec('select cam_social.dispatch();');
assert.equal(await scalar(`select status from cam_social.deliveries where event_key='article:${id}' and network='instagram'`),'uncertain');
assert.equal(await scalar(`select status from cam_social.deliveries where event_key='article:${id}' and network='tiktok'`),'published');
await db.exec("update cam_social.channels set enabled=false where network='tiktok';");
const onlyIg = '00000000-0000-0000-0000-000000000903';
await insertArticle(onlyIg);
assert.ok((await scalar('select public.cam_social_video_jobs()')).some(j=>j.event_key==='article:'+onlyIg),'Instagram video renders when TikTok is disabled');
await db.exec(`update articles set is_public=false where id='${onlyIg}'; update cam_social.deliveries set available_at=now() where event_key='article:${onlyIg}'; select cam_social.dispatch();`);
assert.equal(await scalar(`select status from cam_social.deliveries where event_key='article:${onlyIg}' and network='instagram'`),'cancelled');
assert.ok(!(await scalar('select public.cam_social_video_jobs()')).some(j=>j.event_key==='article:'+onlyIg));
const draft='00000000-0000-0000-0000-000000000904';
await insertArticle(draft,false);
assert.equal(await scalar(`select count(*)::int from cam_social.events where source_id='${draft}'`),0,'Drafts never leak into video jobs');
await db.exec('set role anon;');
const publicJobs=await scalar('select public.cam_social_video_jobs()');
assert.ok(publicJobs.every(j=>Object.keys(j).sort().join(',')==='event_key,image_url,title'));
await assert.rejects(()=>db.query('select * from cam_social.channels'),/permission denied/);
await assert.rejects(()=>db.query('select cam_social.dispatch()'),/permission denied/);
await db.close();
console.log('PASS: Instagram automatic Reel+feed, verified shared music MP4, no backfill/duplicates, independent channels, Instagram-only rendering, visibility and permissions.');
