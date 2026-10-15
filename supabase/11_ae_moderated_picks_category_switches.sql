
create table if not exists public.ae_category_visibility(category text primary key check(category in ('NBA','Tenis','Ciclismo')),visible boolean not null default false,changed_at timestamptz not null default now());
insert into public.ae_category_visibility(category,visible) values ('NBA',false),('Tenis',false),('Ciclismo',false) on conflict(category) do nothing;
alter table public.ae_category_visibility enable row level security;
revoke all on public.ae_category_visibility from public,anon,authenticated;
grant select on public.ae_category_visibility to anon,authenticated;
drop policy if exists ae_category_visibility_read on public.ae_category_visibility;
create policy ae_category_visibility_read on public.ae_category_visibility for select to anon,authenticated using(true);
create or replace function public.ae_set_category_visibility(p_category text,p_visible boolean) returns boolean language plpgsql security definer set search_path='' as $f$
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_category not in ('NBA','Tenis','Ciclismo') or p_visible is null then raise exception 'Categoría inválida'; end if;
 update public.ae_category_visibility set visible=p_visible,changed_at=now() where category=p_category; return found;
end $f$;
revoke all on function public.ae_set_category_visibility(text,boolean) from public,anon,authenticated;
grant execute on function public.ae_set_category_visibility(text,boolean) to authenticated;

alter table public.ae_community_picks add column if not exists moderation_status text not null default 'pending',add column if not exists reviewed_at timestamptz,add column if not exists reviewed_by uuid references auth.users(id);
update public.ae_community_picks set moderation_status='approved' where moderation_status='pending';
alter table public.ae_community_picks drop constraint if exists ae_community_picks_moderation_status_check;
alter table public.ae_community_picks add constraint ae_community_picks_moderation_status_check check(moderation_status in ('pending','approved','rejected'));
alter table public.ae_community_picks drop constraint if exists ae_community_picks_american_odds_check;
alter table public.ae_community_picks add constraint ae_community_picks_american_odds_check check(abs(american_odds) between 100 and 100000);
do $mig$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ae_pick_prepare';
 if f is null or position('if combined<2 then raise exception' in f)=0 or position('new.decimal_odds:=combined; new.american_odds:=round((combined-1)*100)::integer;' in f)=0 then raise exception 'Validator unexpectedly changed';end if;
 f:=replace(f,'if combined<2 then raise exception ''La cuota total debe ser al menos +100''; end if;','if combined<=1 then raise exception ''Cuota combinada inválida''; end if;');
 f:=replace(f,'new.decimal_odds:=combined; new.american_odds:=round((combined-1)*100)::integer;','new.decimal_odds:=combined; new.american_odds:=case when combined>=2 then round((combined-1)*100)::integer else -round(100/(combined-1))::integer end; new.moderation_status:=''pending''; new.reviewed_at:=null; new.reviewed_by:=null;');
 execute f;
end $mig$;

create or replace function public.ae_moderate_community_pick(p_pick_id uuid,p_approve boolean) returns text language plpgsql security definer set search_path='' as $f$
declare next_status text;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 if p_approve is null then raise exception 'Decisión requerida';end if;
 next_status:=case when p_approve then 'approved' else 'rejected' end;
 update public.ae_community_picks set moderation_status=next_status,reviewed_at=now(),reviewed_by=auth.uid()
 where id=p_pick_id and not hidden and moderation_status<>next_status;
 if not found then raise exception 'El Pick no existe o ya tiene ese estado';end if;
 return next_status;
end $f$;
revoke all on function public.ae_moderate_community_pick(uuid,boolean) from public,anon,authenticated;
grant execute on function public.ae_moderate_community_pick(uuid,boolean) to authenticated;
drop policy if exists ae_pick_read on public.ae_community_picks;
create policy ae_pick_read on public.ae_community_picks for select to public using(
 (not hidden and moderation_status='approved') or
 (user_id=auth.uid()) or (select public.rcm_is_editor()));
drop policy if exists ae_vote_insert on public.ae_pick_votes;
create policy ae_vote_insert on public.ae_pick_votes for insert to authenticated with check(
 user_id=auth.uid() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and exists(select 1 from public.ae_community_picks p where p.id=pick_id and not p.hidden and p.moderation_status='approved' and p.user_id<>auth.uid()));
drop policy if exists ae_vote_update on public.ae_pick_votes;
create policy ae_vote_update on public.ae_pick_votes for update to authenticated using(user_id=auth.uid()) with check(
 user_id=auth.uid() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and exists(select 1 from public.ae_community_picks p where p.id=pick_id and not p.hidden and p.moderation_status='approved' and p.user_id<>auth.uid()));
create or replace view public.ae_pick_feed as
select p.id,p.user_id,p.author,p.title,p.explanation,p.legs,p.decimal_odds,p.american_odds,p.created_at,p.publication_day,p.hidden,
 (p.created_at at time zone 'America/Toronto')>=date_trunc('week',now() at time zone 'America/Toronto') as is_current_week,
 (select count(*) from public.ae_pick_votes v where v.pick_id=p.id and v.value=1)::bigint as upvotes,
 (select count(*) from public.ae_pick_votes v where v.pick_id=p.id and v.value=-1)::bigint as downvotes,
 (select coalesce(sum(v.value),0) from public.ae_pick_votes v where v.pick_id=p.id)::bigint as score,
 (select coalesce(max(v.value)::int,0) from public.ae_pick_votes v where v.pick_id=p.id and v.user_id=auth.uid()) as my_vote,
 (select count(*) from public.ae_pick_comments c where c.pick_id=p.id and not c.hidden)::bigint as comments_count,
 p.moderation_status
from public.ae_community_picks p where not p.hidden and (p.moderation_status='approved' or p.user_id=auth.uid() or (select public.rcm_is_editor()));

create table if not exists public.ae_pick_week_awards(
 week_start date not null,pick_id uuid not null references public.ae_community_picks(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 rank_position int not null check(rank_position between 1 and 10),
 points int not null check(points between 1 and 10),
 final_score bigint not null,awarded_at timestamptz not null default now(),
 primary key(week_start,pick_id),unique(week_start,rank_position));
alter table public.ae_pick_week_awards enable row level security;
revoke all on public.ae_pick_week_awards from public,anon,authenticated;
grant select on public.ae_pick_week_awards to anon,authenticated;
drop policy if exists ae_pick_awards_read on public.ae_pick_week_awards;
create policy ae_pick_awards_read on public.ae_pick_week_awards for select to anon,authenticated using(true);

create or replace function public.ae_community_pick_week_top(p_week_start date default null)
returns table(rank_position int,pick_id uuid,user_id uuid,author text,title text,score bigint,upvotes bigint,points int,finalized boolean)
language sql stable security definer set search_path='' as $f$
 with params as (select coalesce(p_week_start,date_trunc('week',now() at time zone 'America/Toronto')::date) as d),
 ratings as (
 select p.id,p.user_id,p.author,p.title,p.created_at,coalesce(sum(v.value),0)::bigint as score,
 count(v.pick_id) filter(where v.value=1)::bigint as upvotes
 from public.ae_community_picks p cross join params s left join public.ae_pick_votes v on v.pick_id=p.id
 where not p.hidden and p.moderation_status='approved'
 and (p.created_at at time zone 'America/Toronto')::date>=s.d
 and (p.created_at at time zone 'America/Toronto')::date<s.d+7
 group by p.id),
 ordered as (select row_number() over(order by score desc,upvotes desc,created_at asc,id asc)::int as n,id,user_id,author,title,score,upvotes from ratings where score>0),
 live as (select o.n,o.id,o.user_id,o.author,o.title,o.score,o.upvotes,(11-o.n)::int,false from ordered o where o.n<=10),
 stored as (select a.rank_position,a.pick_id,a.user_id,p.author,p.title,a.final_score,
  (select count(*) from public.ae_pick_votes v where v.pick_id=a.pick_id and v.value=1)::bigint,
  a.points,true from public.ae_pick_week_awards a join params s on s.d=a.week_start join public.ae_community_picks p on p.id=a.pick_id)
 select * from stored union all select * from live where not exists(select 1 from stored) order by 1;
$f$;
revoke all on function public.ae_community_pick_week_top(date) from public,anon,authenticated;
grant execute on function public.ae_community_pick_week_top(date) to anon,authenticated;
create or replace function public.ae_finalize_community_pick_week(p_week_start date) returns int language plpgsql security definer set search_path='' as $f$
declare n int;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores';end if;
 if p_week_start is null or extract(isodow from p_week_start)<>1 or p_week_start>=date_trunc('week',now() at time zone 'America/Toronto')::date then
 raise exception 'Solo semanas completas de lunes a domingo';end if;
 perform pg_catalog.pg_advisory_xact_lock(20261015);
 if exists(select 1 from public.ae_pick_week_awards where week_start=p_week_start) then raise exception 'Semana ya cerrada';end if;
 insert into public.ae_pick_week_awards(week_start,pick_id,user_id,rank_position,points,final_score)
 select p_week_start,r.pick_id,r.user_id,r.rank_position,r.points,r.score from public.ae_community_pick_week_top(p_week_start) r where r.score>0 and not r.finalized;
 get diagnostics n=row_count;return n;
end $f$;
revoke all on function public.ae_finalize_community_pick_week(date) from public,anon,authenticated;
grant execute on function public.ae_finalize_community_pick_week(date) to authenticated;
create or replace function public.ae_community_pick_totals()
returns table(user_id uuid,username text,points bigint,awarded_picks bigint)
language sql stable security definer set search_path='' as $f$
select a.user_id,coalesce(nullif(max(p.author),''),'Aficionado')::text,sum(a.points)::bigint,count(*)::bigint
from public.ae_pick_week_awards a join public.ae_community_picks p on p.id=a.pick_id
group by a.user_id order by sum(a.points) desc,count(*) desc,a.user_id limit 100;
$f$;
revoke all on function public.ae_community_pick_totals() from public,anon,authenticated;
grant execute on function public.ae_community_pick_totals() to anon,authenticated;
notify pgrst,'reload schema';
