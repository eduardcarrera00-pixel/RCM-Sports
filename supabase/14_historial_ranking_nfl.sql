-- Optional additive migration: real previous NFL edition for position arrows.
-- Run only after backup + staging review. Does not delete/reset existing data.
-- The FIRST subsequent new edition archives today's ranking; earlier editions cannot be reconstructed.
begin;
create table if not exists public.nfl_ranking_history (
    id bigint generated always as identity primary key,
    edition text not null,
    team_ids text[] not null check (cardinality(team_ids) = 10),
    replaced_at timestamptz not null default clock_timestamp()
);
alter table public.nfl_ranking_history enable row level security;
revoke all on public.nfl_ranking_history from public, anon, authenticated;
grant select on public.nfl_ranking_history to anon, authenticated;
drop policy if exists ae_ranking_history_read on public.nfl_ranking_history;
create policy ae_ranking_history_read on public.nfl_ranking_history
    for select to anon, authenticated using (true);
create or replace function public.ae_archive_nfl_ranking()
returns trigger language plpgsql security definer set search_path='' as $$
begin
    if old.edition is distinct from new.edition then
        insert into public.nfl_ranking_history (edition,team_ids,replaced_at)
        values (old.edition, old.team_ids,clock_timestamp());
    end if;
    return new;
end $$;
revoke all on function public.ae_archive_nfl_ranking() from public, anon, authenticated;
drop trigger if exists ae_archive_nfl_ranking_trigger on public.nfl_rankings;
create trigger ae_archive_nfl_ranking_trigger
before update on public.nfl_rankings
for each row execute function public.ae_archive_nfl_ranking();
commit;
