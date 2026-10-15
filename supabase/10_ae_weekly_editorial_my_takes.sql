-- AE SPORTS · Pick editorial semanal y perfil privado de Takes.
create table if not exists public.ae_editorial_weekly_picks(
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(trim(title)) between 5 and 160),
 event_name text not null check (char_length(trim(event_name)) between 3 and 160),
 selection text not null check (char_length(trim(selection)) between 2 and 180),
 american_odds integer not null check (american_odds between 100 and 100000 or american_odds between -100000 and -100),
 analysis text not null check (char_length(trim(analysis)) between 12 and 2400),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 created_by uuid not null references auth.users(id),
 is_published boolean not null default false
);
create index if not exists ae_editorial_weekly_published
 on public.ae_editorial_weekly_picks(is_published,created_at desc);
alter table public.ae_editorial_weekly_picks enable row level security;
revoke all on public.ae_editorial_weekly_picks from public,anon,authenticated;
grant select on public.ae_editorial_weekly_picks to anon,authenticated;
drop policy if exists ae_editorial_weekly_public_read on public.ae_editorial_weekly_picks;
create policy ae_editorial_weekly_public_read on public.ae_editorial_weekly_picks
 for select to anon,authenticated using (is_published);

create or replace function public.ae_publish_editorial_weekly_pick(
 p_title text,p_event_name text,p_selection text,p_american_odds integer,
 p_analysis text,p_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $pick$
declare new_id uuid;
begin
 if auth.uid() is null or not public.rcm_is_editor() then
  raise exception 'Solo un administrador puede publicar el Pick de la Semana';
 end if;
 if p_title is null or char_length(trim(p_title)) not between 5 and 160
 or p_event_name is null or char_length(trim(p_event_name)) not between 3 and 160
 or p_selection is null or char_length(trim(p_selection)) not between 2 and 180
 or p_analysis is null or char_length(trim(p_analysis)) not between 12 and 2400
 or p_american_odds is null or not (p_american_odds between 100 and 100000 or p_american_odds between -100000 and -100)
 or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '30 days'
 then raise exception 'Revisa los datos, la cuota y el cierre del Pick';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(1910026);
 update public.ae_editorial_weekly_picks set is_published=false where is_published;
 insert into public.ae_editorial_weekly_picks(title,event_name,selection,american_odds,analysis,expires_at,created_by,is_published)
 values(trim(p_title),trim(p_event_name),trim(p_selection),p_american_odds,trim(p_analysis),p_expires_at,auth.uid(),true)
 returning id into new_id;
 return new_id;
end $pick$;

-- Authenticated owner-only read. The client never chooses a user ID.
create or replace function public.ae_my_free_takes()
returns table(id uuid,sport text,title text,body text,created_at timestamptz,
 hidden boolean,upvotes bigint,downvotes bigint)
language plpgsql stable security definer set search_path='' as $takes$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   raise exception 'Inicia sesión para ver tu perfil';
 end if;
 return query
 select t.id,t.sport,t.title,t.body,t.created_at,t.hidden,
 (select count(*) from public.ae_free_take_votes v where v.take_id=t.id and v.value=1)::bigint,
 (select count(*) from public.ae_free_take_votes v where v.take_id=t.id and v.value=-1)::bigint
 from public.ae_free_takes t
 where t.user_id=auth.uid()
 order by t.created_at desc,t.id desc limit 200;
end $takes$;

revoke all on function public.ae_publish_editorial_weekly_pick(text,text,text,integer,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.ae_publish_editorial_weekly_pick(text,text,text,integer,text,timestamptz) to authenticated;
revoke all on function public.ae_my_free_takes() from public,anon,authenticated;
grant execute on function public.ae_my_free_takes() to authenticated;
notify pgrst,'reload schema';