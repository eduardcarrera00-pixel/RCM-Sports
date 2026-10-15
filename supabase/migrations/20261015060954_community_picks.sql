begin;
create table public.ae_community_picks (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 author text not null default 'Usuario',
 title text not null check(length(btrim(title)) between 3 and 160),
 explanation text not null default '' check(length(explanation)<=2000),
 legs jsonb not null,
 decimal_odds numeric not null,
 american_odds integer not null check(american_odds>=100),
 created_at timestamptz not null default now(),
 publication_day date not null default (now() at time zone 'America/Toronto')::date,
 hidden boolean not null default false,
 unique(user_id,publication_day)
);
create table public.ae_pick_votes (
 pick_id uuid not null references public.ae_community_picks(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 value smallint not null check(value in (-1,1)),
 primary key(pick_id,user_id)
);
create table public.ae_pick_comments (
 id uuid primary key default gen_random_uuid(),
 pick_id uuid not null references public.ae_community_picks(id) on delete cascade,
 parent_id uuid,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 author text not null default 'Usuario',
 body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(),
 hidden boolean not null default false,
 unique(id,pick_id),
 foreign key(parent_id,pick_id) references public.ae_pick_comments(id,pick_id)
);
create index ae_picks_created on public.ae_community_picks(created_at desc);
create index ae_votes_user on public.ae_pick_votes(user_id);
create index ae_comments_pick on public.ae_pick_comments(pick_id,created_at);
create index ae_comments_parent on public.ae_pick_comments(parent_id,pick_id);
create index ae_comments_user on public.ae_pick_comments(user_id);
create function public.ae_pick_prepare() returns trigger language plpgsql set search_path='' as $$
declare leg jsonb; odds numeric; combined numeric:=1; seen text[]:='{}'; event_key text;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Inicia sesión para participar'; end if;
 new.user_id:=auth.uid(); new.created_at:=now();
 new.author:=left(coalesce(nullif(auth.jwt()->'user_metadata'->>'username',''),'Usuario'),40);
 new.hidden:=false;
 if tg_table_name='ae_community_picks' then
  new.publication_day:=(now() at time zone 'America/Toronto')::date;
  if jsonb_typeof(new.legs) is distinct from 'array' then raise exception 'Selecciona uno o dos pronósticos'; end if;
  if jsonb_array_length(new.legs) not between 1 and 2 then raise exception 'Selecciona uno o dos pronósticos'; end if;
  for leg in select * from jsonb_array_elements(new.legs) loop
   if coalesce(length(btrim(leg->>'event')),0) not between 3 and 160 or coalesce(length(btrim(leg->>'selection')),0) not between 2 and 200 or coalesce(length(leg->>'sport'),0) not between 2 and 40 then raise exception 'Completa deporte, partido y selección'; end if;
   if coalesce(leg->>'odds','') !~ '^[+-]?[0-9]{3,6}$' then raise exception 'Cuota americana inválida'; end if;
   odds:=(leg->>'odds')::numeric;
   if abs(odds)<100 or abs(odds)>100000 then raise exception 'Cuota fuera de rango'; end if;
   event_key:=lower(regexp_replace(btrim(leg->>'event'),'\s+',' ','g'));
   if event_key=any(seen) then raise exception 'No se combinan selecciones del mismo partido sin una cuota verificada'; end if;
   seen:=array_append(seen,event_key);
   combined:=combined*case when odds>0 then 1+odds/100 else 1+100/abs(odds) end;
  end loop;
  if combined<2 then raise exception 'La cuota total debe ser al menos +100'; end if;
  new.decimal_odds:=combined; new.american_odds:=round((combined-1)*100)::integer;
 end if;
 return new;
end $$;
revoke all on function public.ae_pick_prepare() from public,anon,authenticated;
create trigger ae_pick_prepare before insert on public.ae_community_picks for each row execute function public.ae_pick_prepare();
create trigger ae_comment_prepare before insert on public.ae_pick_comments for each row execute function public.ae_pick_prepare();
alter table public.ae_community_picks enable row level security;
alter table public.ae_pick_votes enable row level security;
alter table public.ae_pick_comments enable row level security;
revoke all on public.ae_community_picks,public.ae_pick_votes,public.ae_pick_comments from public,anon,authenticated;
grant select on public.ae_community_picks,public.ae_pick_votes,public.ae_pick_comments to anon,authenticated;
grant insert(title,explanation,legs) on public.ae_community_picks to authenticated;
grant update(hidden) on public.ae_community_picks to authenticated;
grant insert(pick_id,value),update(value),delete on public.ae_pick_votes to authenticated;
grant insert(pick_id,parent_id,body) on public.ae_pick_comments to authenticated;
grant update(hidden) on public.ae_pick_comments to authenticated;
create policy ae_pick_read on public.ae_community_picks for select using(not hidden or (select public.rcm_is_editor()));
create policy ae_pick_insert on public.ae_community_picks for insert to authenticated with check(user_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
create policy ae_pick_moderate on public.ae_community_picks for update to authenticated using((select public.rcm_is_editor())) with check((select public.rcm_is_editor()));
create policy ae_vote_read on public.ae_pick_votes for select using(exists(select 1 from public.ae_community_picks p where p.id=pick_id and not p.hidden));
create policy ae_vote_insert on public.ae_pick_votes for insert to authenticated with check(user_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and exists(select 1 from public.ae_community_picks p where p.id=pick_id and not p.hidden and p.user_id<>(select auth.uid())));
create policy ae_vote_update on public.ae_pick_votes for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and exists(select 1 from public.ae_community_picks p where p.id=pick_id and not p.hidden and p.user_id<>(select auth.uid())));
create policy ae_vote_delete on public.ae_pick_votes for delete to authenticated using(user_id=(select auth.uid()));
create policy ae_comment_read on public.ae_pick_comments for select using((not hidden or (select public.rcm_is_editor())) and exists(select 1 from public.ae_community_picks p where p.id=pick_id and not p.hidden));
create policy ae_comment_insert on public.ae_pick_comments for insert to authenticated with check(user_id=(select auth.uid()) and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and exists(select 1 from public.ae_community_picks p where p.id=pick_id and not p.hidden));
create policy ae_comment_moderate on public.ae_pick_comments for update to authenticated using((select public.rcm_is_editor())) with check((select public.rcm_is_editor()));
create view public.ae_pick_feed with(security_invoker=true) as
select p.*, (p.created_at at time zone 'America/Toronto') >= date_trunc('week', now() at time zone 'America/Toronto') as is_current_week,
 (select count(*) from public.ae_pick_votes v where v.pick_id=p.id and v.value=1) as upvotes,
 (select count(*) from public.ae_pick_votes v where v.pick_id=p.id and v.value=-1) as downvotes,
 (select coalesce(sum(v.value),0) from public.ae_pick_votes v where v.pick_id=p.id) as score,
 (select coalesce(max(v.value),0) from public.ae_pick_votes v where v.pick_id=p.id and v.user_id=auth.uid()) as my_vote,
 (select count(*) from public.ae_pick_comments c where c.pick_id=p.id and not c.hidden) as comments_count
from public.ae_community_picks p where not p.hidden;
revoke all on public.ae_pick_feed from public,anon,authenticated;
grant select on public.ae_pick_feed to anon,authenticated;
commit;
