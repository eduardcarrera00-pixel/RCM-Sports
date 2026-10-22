import fs from 'node:fs';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema cam_social;
create table cam_social.events(event_key text primary key,source_table text,source_id text,
  edition text,payload jsonb,created_at timestamptz default now());
create table cam_social.promos(id text primary key,theme text,active boolean default true);
create table public.articles(id uuid primary key,category text);
`);
await db.exec(fs.readFileSync('supabase/migrations/20261022145552_cam_social_brand_rotation.sql','utf8'));
await db.exec("insert into cam_social.promos(id,theme) values('t1','takes'),('r1','rankings');");
const insert = async (key, table, id) => db.query(
  `insert into cam_social.events(event_key,source_table,source_id,payload)
   values($1,$2,$3,'{"title":"Brand check","image_url":"https://example.com/original.png"}'::jsonb)`,
  [key,table,id]
);
for (const key of ['take-1','take-2','take-3']) await insert(key,'promo','t1');
const takes = (await db.query("select payload from cam_social.events where source_table='promo' and source_id='t1' order by event_key")).rows.map(x=>x.payload);
assert.deepEqual(takes.map(x=>x.brand_image_key),['community','takes','community']);
assert.ok(takes.every(x=>x.brand_theme==='takes' && x.image_url.startsWith('https://camsports.github.io/assets/social-brand/')));
assert.ok(takes.every(x=>x.original_image_url==='https://example.com/original.png'));

await db.exec("insert into public.articles values('00000000-0000-0000-0000-000000000001','NFL'),('00000000-0000-0000-0000-000000000002','Fútbol');");
await insert('nfl-story','articles','00000000-0000-0000-0000-000000000001');
await insert('football-story','articles','00000000-0000-0000-0000-000000000002');
const stories = (await db.query("select event_key,payload->>'brand_theme' as theme from cam_social.events where source_table='articles' order by event_key")).rows;
assert.deepEqual(stories,[{event_key:'football-story',theme:'football'},{event_key:'nfl-story',theme:'nfl'}]);
await insert('ranking','promo','r1');
assert.equal((await db.query("select payload->>'brand_theme' as theme from cam_social.events where event_key='ranking'")).rows[0].theme,'rankings');
console.log('PASS: topic routing, image alternation, original-media audit and branded URLs.');
