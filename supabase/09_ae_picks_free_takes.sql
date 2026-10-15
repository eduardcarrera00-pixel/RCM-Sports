-- AE SPORTS: community Takes and curated Pick competitions. Preserve prior prediction data.
alter table public.ae_take_questions drop constraint if exists ae_take_questions_competition_check;
alter table public.ae_take_questions add constraint ae_take_questions_competition_check check (competition in ('laliga','premier','ligamx','champions','nfl','colegial'));
create or replace function public.ae_create_take(p_competition text,p_period text,p_prompt text,p_closes_at timestamptz,p_points int,p_options text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare q uuid; opt text;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_competition is null or p_competition not in ('laliga','premier','ligamx','champions','nfl','colegial')
 or p_period is null or p_period not in ('weekly','season')
 or p_prompt is null or length(trim(p_prompt)) not between 10 and 220
 or p_closes_at is null or p_closes_at <= now()
 or p_points is null or p_points not between 1 and 100
 or p_options is null or cardinality(p_options) not between 2 and 16 or array_ndims(p_options) <> 1
 or exists(select 1 from unnest(p_options) x where x is null or length(trim(x)) not between 1 and 100)
 or (select count(distinct lower(trim(x))) from unnest(p_options) x) <> cardinality(p_options)
 then raise exception 'Datos de pregunta inválidos'; end if;
 insert into public.ae_take_questions(competition,period,prompt,closes_at,points,created_by)
 values(p_competition,p_period,trim(p_prompt),p_closes_at,p_points,auth.uid()) returning id into q;
 foreach opt in array p_options loop
 insert into public.ae_take_options(question_id,label) values(q,trim(opt));
 end loop;
 return q;
end $$;

create table if not exists public.ae_free_takes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 sport text not null check(sport in ('laliga','premier','ligamx','champions','nfl','colegial','general')),
 title text not null check(length(trim(title)) between 5 and 160),
 body text not null check(length(trim(body)) between 15 and 1800),
 created_at timestamptz not null default now(),
 hidden boolean not null default false
);
create index if not exists ae_free_takes_recent on public.ae_free_takes(created_at desc);
create index if not exists ae_free_takes_user on public.ae_free_takes(user_id,created_at desc);
create table if not exists public.ae_free_take_votes (
 take_id uuid not null references public.ae_free_takes(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 value smallint not null check(value in (-1,1)),
 primary key(take_id,user_id)
);
alter table public.ae_free_takes enable row level security;
alter table public.ae_free_take_votes enable row level security;
revoke all on public.ae_free_takes,public.ae_free_take_votes from public,anon,authenticated;

create or replace function public.ae_post_free_take(p_sport text,p_title text,p_body text)
returns uuid language plpgsql security definer set search_path='' as $free$
declare me uuid := auth.uid(); saved uuid;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión'; end if;
 if p_sport is null or p_sport not in ('laliga','premier','ligamx','champions','nfl','colegial','general')
  or p_title is null or length(trim(p_title)) not between 5 and 160
  or p_body is null or length(trim(p_body)) not between 15 and 1800 then raise exception 'Revisa el título, contenido y deporte'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(me::text));
 if (select count(*) from public.ae_free_takes where user_id=me and created_at>now()-interval '24 hours')>=5
 then raise exception 'Máximo cinco Takes en 24 horas'; end if;
 insert into public.ae_free_takes(user_id,sport,title,body) values(me,p_sport,trim(p_title),trim(p_body))
 returning id into saved;
 return saved;
end $free$;

create or replace function public.ae_vote_free_take(p_take_id uuid,p_value smallint)
returns smallint language plpgsql security definer set search_path='' as $free$
declare me uuid := auth.uid(); present smallint;
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión'; end if;
 if p_value is null or p_value not in (-1,1) then raise exception 'Voto inválido'; end if;
 if not exists(select 1 from public.ae_free_takes where id=p_take_id and not hidden and user_id<>me)
 then raise exception 'No puedes votar este Take'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(me::text||':'||p_take_id::text));
 select value into present from public.ae_free_take_votes where take_id=p_take_id and user_id=me;
 if present=p_value then
  delete from public.ae_free_take_votes where take_id=p_take_id and user_id=me;
  return 0;
 end if;
 insert into public.ae_free_take_votes(take_id,user_id,value) values(p_take_id,me,p_value)
 on conflict(take_id,user_id) do update set value=excluded.value;
 return p_value;
end $free$;

create or replace function public.ae_free_takes_feed(p_sport text default 'all')
returns table(id uuid,sport text,title text,body text,created_at timestamptz,author text,upvotes bigint,downvotes bigint,my_vote smallint)
language sql stable security definer set search_path='' as $free$
 select t.id,t.sport,t.title,t.body,t.created_at,
 coalesce(nullif(left(u.raw_user_meta_data->>'username',40),''),'Aficionado')::text,
 (select count(*) from public.ae_free_take_votes v where v.take_id=t.id and v.value=1)::bigint,
 (select count(*) from public.ae_free_take_votes v where v.take_id=t.id and v.value=-1)::bigint,
 (select v.value from public.ae_free_take_votes v where v.take_id=t.id and v.user_id=(select auth.uid()))
 from public.ae_free_takes t join auth.users u on u.id=t.user_id
 where not t.hidden and (p_sport='all' or t.sport=p_sport)
 order by t.created_at desc,t.id desc limit 100;
$free$;

create or replace function public.ae_hide_free_take(p_take_id uuid)
returns boolean language plpgsql security definer set search_path='' as $free$
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 update public.ae_free_takes set hidden=true where id=p_take_id and hidden=false;
 return found;
end $free$;

revoke all on function public.ae_post_free_take(text,text,text) from public,anon,authenticated;
revoke all on function public.ae_vote_free_take(uuid,smallint) from public,anon,authenticated;
revoke all on function public.ae_free_takes_feed(text) from public,anon,authenticated;
revoke all on function public.ae_hide_free_take(uuid) from public,anon,authenticated;
grant execute on function public.ae_post_free_take(text,text,text) to authenticated;
grant execute on function public.ae_vote_free_take(uuid,smallint) to authenticated;
grant execute on function public.ae_free_takes_feed(text) to anon,authenticated;
grant execute on function public.ae_hide_free_take(uuid) to authenticated;
notify pgrst,'reload schema';
