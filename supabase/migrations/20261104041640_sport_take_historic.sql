-- Public hall-of-fame record, independent of the recent feed's 200-row limit.
-- The privileged reader lives outside the exposed API schema. It intentionally
-- permits anonymous reads of one visible, confirmed winning Take; no account
-- secrets or unreviewed/hidden Takes are returned. Source tables remain private.
create schema if not exists cam_take_records;
revoke all on schema cam_take_records from public;
grant usage on schema cam_take_records to anon, authenticated;

create or replace function cam_take_records.sport_historic(p_sport text)
returns table (
  id uuid, author_id uuid, author text, sport text, competition text,
  title text, body text, created_at timestamptz,
  upvotes bigint, downvotes bigint, points integer
)
language sql stable security definer
set search_path = ''
as $function$
  with winner as materialized (
    select t.id, t.user_id, t.sport, t.competition, t.title, t.body,
           t.created_at, r.points::integer as points
    from public.ae_free_takes t
    join public.ae_take_results r on r.take_id = t.id
    where not t.hidden and r.outcome = 'won' and r.points > 0
      and ((p_sport = 'nfl' and t.sport = 'nfl')
        or (p_sport = 'football' and t.sport in ('football','laliga','premier','ligamx','champions')))
    -- Match the home record: retain the first confirmed winner in a tie.
    order by r.points desc, r.scored_at asc nulls last, t.created_at asc, t.id
    limit 1
  )
  select w.id, w.user_id,
         coalesce(nullif(left(a.username,40),''),
                  nullif(left(u.raw_user_meta_data->>'username',40),''),
                  nullif(left(u.raw_user_meta_data->>'display_name',40),''),'Aficionado')::text,
         w.sport,
         coalesce(nullif(trim(w.competition),''),
           case w.sport when 'nfl' then 'NFL' when 'laliga' then 'LaLiga'
             when 'premier' then 'Premier League' when 'ligamx' then 'Liga MX'
             when 'champions' then 'Champions League' else 'Fútbol' end)::text,
         w.title, w.body, w.created_at,
         (select count(*) from public.ae_free_take_votes v where v.take_id = w.id and v.value = 1),
         (select count(*) from public.ae_free_take_votes v where v.take_id = w.id and v.value = -1),
         w.points
  from winner w
  join auth.users u on u.id = w.user_id
  left join public.ae_auth_accounts a on a.user_id = w.user_id;
$function$;
revoke all on function cam_take_records.sport_historic(text) from public;
grant execute on function cam_take_records.sport_historic(text) to anon, authenticated;

create or replace function public.ae_sport_take_historic(p_sport text)
returns table (
  id uuid, author_id uuid, author text, sport text, competition text,
  title text, body text, created_at timestamptz,
  upvotes bigint, downvotes bigint, points integer
)
language sql stable security invoker
set search_path = ''
as $function$
  select * from cam_take_records.sport_historic(p_sport);
$function$;
revoke all on function public.ae_sport_take_historic(text) from public;
grant execute on function public.ae_sport_take_historic(text) to anon, authenticated;
comment on function public.ae_sport_take_historic(text) is
  'Highest-scoring visible winning Take across all history of NFL or Fútbol, including its leagues; public read-only record.';
