import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$
    select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
  $$;
  grant usage on schema auth to authenticated;
  create table public.ae_auth_accounts(user_id uuid,username text);
  insert into auth.users values('36bbfda8-6ec6-46e3-acff-71713103990c');
  insert into public.ae_auth_accounts values('36bbfda8-6ec6-46e3-acff-71713103990c','sf_49ers');
  create table public.ae_free_takes(id uuid primary key default gen_random_uuid(),user_id uuid,
    sport text,competition text,title text,body text,created_at timestamptz default now());
  alter table public.ae_free_takes enable row level security;
  create policy own_take on public.ae_free_takes to authenticated
    using(user_id=auth.uid()) with check(user_id=auth.uid());
  grant insert,select on public.ae_free_takes to authenticated;
  create function public.ae_post_free_take(text,text,text,text) returns uuid
    language plpgsql security invoker as $$ declare saved uuid; begin
      if current_user<>'authenticated' then raise exception 'Writer must lower role'; end if;
      insert into public.ae_free_takes(user_id,sport,title,body,competition)
        values(auth.uid(),$1,$2,$3,$4) returning id into saved; return saved;
    end; $$;
  create table public.cam_nfl_games(id text primary key,status text,kickoff timestamptz,
    picks_open boolean,odds_home integer,odds_away integer,odds_source text,odds_locked_at timestamptz);
  create table public.cam_football_games(id text primary key,status text,kickoff timestamptz,
    picks_open boolean,odds_home integer,odds_away integer,odds_draw integer,odds_source text,odds_locked_at timestamptz);
  create table public.ae_community_picks(id uuid primary key default gen_random_uuid(),
    user_id uuid default auth.uid(),title text,explanation text,legs jsonb,event_date date);
  grant insert(title,explanation,legs,event_date),select on public.ae_community_picks to authenticated;
  alter table public.ae_community_picks enable row level security;
  create policy own_pick on public.ae_community_picks to authenticated
    using(user_id=auth.uid()) with check(user_id=auth.uid());
  create schema cron;
  create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261124154349_cam_low_token_live_editorial.sql',import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20261124155154_cam_editorial_validate_pick_sources.sql',import.meta.url),'utf8'));
const author='36bbfda8-6ec6-46e3-acff-71713103990c';
const payload={sport:'nfl',competition:'NFL',title:'El local ganará su próximo partido',
  thesis:'Pronóstico futuro concreto para el próximo encuentro.',
  evidence:'Dato verificado y atribuido a la fuente consultada.',
  reasoning:'Explicación del mecanismo que sostiene la predicción.',
  counterargument:'El principal riesgo podría impedir que se cumpla.',
  resolution:'Se comprobará al finalizar el próximo encuentro.',
  sources:[{url:'https://www.nfl.com/test',checked_at:new Date().toISOString()}]};
const enqueue=(key,body=payload,kind='take',publish='now()',expire="now()+interval '2 hours'")=>db.query(
  `select cam_editorial.enqueue($1,$2,$3,$4::jsonb,${publish},${expire}) as id`,[key,kind,author,JSON.stringify(body)]);
const scalar=async sql=>(await db.query(sql)).rows[0];

const first=await enqueue('test-take-1');
const repeated=await enqueue('test-take-1',{...payload,title:'This must not replace the original'});
assert.equal(first.rows[0].id,repeated.rows[0].id,'retry uses the original queue entry');
await enqueue('test-take-future',payload,'take',"now()+interval '1 hour'","now()+interval '3 hours'");
assert.deepEqual((await scalar('select cam_editorial.tick() as result')).result,{status:'ok',published:1,expired:0});
assert.equal((await scalar('select count(*)::int as n from public.ae_free_takes')).n,1);
const saved=await scalar('select user_id,body from public.ae_free_takes');
assert.equal(saved.user_id,author);
assert.match(saved.body,/Editorial CAM SPORTS\.$/);
assert.equal((await scalar('select cam_editorial.tick() as result')).result.published,0,'future and published entries stay untouched');
assert.equal((await scalar('select current_user as name')).name,'postgres','role restored');
assert.equal((await scalar("select current_setting('request.jwt.claims',true) as claims")).claims,'','claims restored');
await assert.rejects(enqueue('test-take-extra'),/Tanda diaria completa/);
await db.exec("update cam_editorial.queue set expires_at=now()-interval '1 second',publish_at=now()-interval '2 seconds' where queue_key='test-take-future'");
assert.equal((await scalar('select cam_editorial.tick() as result')).result.expired,1,'expired content is never published');
await db.exec('delete from cam_editorial.queue');
await assert.rejects(enqueue('test-weak-take',{...payload,counterargument:'No'}),/counterargument/);
await assert.rejects(enqueue('test-no-source',{...payload,sources:[]}),/fuentes/);
await db.exec("set role anon");
assert.ok((await scalar('select public.cam_read_live_revisions() as revisions')).revisions.takes);
await assert.rejects(db.query('select * from cam_editorial.queue'),/permission denied/);
await assert.rejects(db.query("update public.cam_live_revisions set revision=99"),/permission denied/);
await db.exec('reset role');
await enqueue('test-failed-take');
await db.exec('revoke execute on function public.ae_post_free_take(text,text,text,text) from public,authenticated');
for(let i=0;i<3;i++) await db.query('select cam_editorial.tick()');
assert.equal((await scalar("select status from cam_editorial.queue where queue_key='test-failed-take'")).status,'failed');
assert.equal((await scalar('select count(*)::int as n from public.ae_free_takes')).n,1,'failure does not leave partial publications');
assert.equal((await scalar('select current_user as name')).name,'postgres');
await db.exec("insert into public.cam_nfl_games values('game-1','scheduled',now()+interval '24 hours',true,-150,130,'test provider',now())");
const fixture=await scalar("select *,to_char(kickoff at time zone 'America/Toronto','YYYY-MM-DD') as event_date from public.cam_nfl_games");
const pick={title:'El local ganará el partido',explanation:'Pronóstico editorial con datos y riesgo comprobados.',
  event_date:fixture.event_date,sources:payload.sources,
  legs:[{sport:'NFL',market:'moneyline',event:'Local contra visitante',selection:'Gana local',odds:-150,
    source_game_id:'game-1',source_kickoff:fixture.kickoff.toISOString(),source_pick:'home',
    source_odds_source:fixture.odds_source,source_odds_locked_at:fixture.odds_locked_at.toISOString()}]};
const current=async p=>(await db.query('select cam_editorial.pick_is_current($1::jsonb) as valid',[JSON.stringify(p)])).rows[0].valid;
assert.equal(await current(pick),true);
await db.exec('update public.cam_nfl_games set odds_home=-155');
assert.equal(await current(pick),false,'changed odds cannot be published');
await db.exec('update public.cam_nfl_games set odds_home=-150');
await enqueue('test-valid-pick',pick,'pick');
assert.equal((await scalar('select cam_editorial.tick() as result')).result.published,1);
assert.equal((await scalar('select user_id from public.ae_community_picks')).user_id,author);
await enqueue('test-closed-pick',pick,'pick');
await db.exec("update public.cam_nfl_games set status='final'");
assert.equal((await scalar('select cam_editorial.tick() as result')).result.expired,1);
assert.equal((await scalar('select count(*)::int as n from public.ae_community_picks')).n,1,'closed fixture is not published');
await db.close();
console.log('Editorial queue: publication, role/RLS, deduplication, schedule, expiry, validation and bounded failure recovery passed.');
