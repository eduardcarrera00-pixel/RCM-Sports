-- AE SPORTS · Editable Champions League Power Rankings (authorised editors only)
-- Each publication is immutable; the previous edition remains available for arrows.
create table if not exists public.champions_ranking_drafts (
 user_id uuid not null references auth.users(id) on delete cascade,
 season text not null,
 edition text not null,
 team_ids text[] not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,season),
 constraint ae_champions_draft_edition check (length(trim(edition)) between 1 and 100),
 constraint ae_champions_draft_ten_slots check (cardinality(team_ids)=10)
);
alter table public.champions_ranking_drafts enable row level security;
revoke all on public.champions_ranking_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.champions_ranking_drafts to authenticated;
drop policy if exists ae_champions_draft_owner on public.champions_ranking_drafts;
create policy ae_champions_draft_owner on public.champions_ranking_drafts
for all to authenticated using (
 user_id=(select auth.uid()) and (select public.rcm_is_editor())
) with check (
 user_id=(select auth.uid()) and (select public.rcm_is_editor())
);
create or replace function public.ae_publish_champions_ranking(
 p_season text, p_edition text, p_team_ids text[], p_expected_latest_id uuid default null
) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_latest uuid; v_created uuid;
begin
 if (select auth.uid()) is null or not public.rcm_is_editor() then
   raise exception 'AE_NO_EDITOR: solo administradores pueden publicar';
 end if;
 if p_season is null or p_season <> '2026/27' then
   raise exception 'AE_SEASON: temporada no válida';
 end if;
 if p_edition is null or length(trim(p_edition)) not between 1 and 100 then
   raise exception 'AE_EDITION: escribe una jornada válida';
 end if;
 if p_team_ids is null or cardinality(p_team_ids) <> 10
     or array_ndims(p_team_ids) <> 1
     or (select count(distinct id) from unnest(p_team_ids) as id) <> 10
     or exists(
        select 1 from unnest(p_team_ids) as team_id
        where team_id is null or team_id = ''
          or not exists(select 1 from public.champions_clubs c
              where c.season=p_season and c.id=team_id and c.participating=true)
     ) then
    raise exception 'AE_TEAMS: elige diez clubes distintos de la temporada';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(74102,pg_catalog.hashtext(p_season));
 select r.id into v_latest from public.champions_rankings r
 where r.season=p_season order by r.published_at desc,r.id desc limit 1;
 if v_latest is distinct from p_expected_latest_id then
   raise exception 'AE_CONFLICT: otro editor publicó una jornada. Actualiza y vuelve a intentarlo';
 end if;
 insert into public.champions_rankings(season,edition,team_ids,published_at)
 values (p_season,trim(p_edition),p_team_ids,clock_timestamp())
 returning id into v_created;
 -- Preserve the private draft without retaining stale selections.
 insert into public.champions_ranking_drafts(user_id,season,edition,team_ids,updated_at)
 values ((select auth.uid()),p_season,trim(p_edition),p_team_ids,now())
 on conflict(user_id,season) do update
 set edition=excluded.edition,team_ids=excluded.team_ids,updated_at=now();
 return v_created;
end $$;
revoke all on function public.ae_publish_champions_ranking(text,text,text[],uuid) from public,anon,authenticated;
grant execute on function public.ae_publish_champions_ranking(text,text,text[],uuid) to authenticated;
notify pgrst,'reload schema';
