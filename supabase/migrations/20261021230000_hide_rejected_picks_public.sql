-- CAM SPORTS: rejected odds must never appear in any public Pick surface.
-- Tested against the Supabase staging schema on 2026-10-21.
-- Apply to production with the normal migration process; no Picks are deleted.
-- Keep the same columns, ordering, vote counts and security_invoker semantics.
create or replace view public.ae_pick_feed with (security_invoker = true) as
select
 p.id, p.user_id, p.author, p.title, p.explanation, p.legs,
 p.decimal_odds, p.american_odds, p.created_at, p.publication_day, p.hidden,
 ((p.created_at at time zone 'America/Toronto') >= date_trunc('week',now() at time zone 'America/Toronto')) as is_current_week,
 (select count(*) from public.ae_pick_votes v where v.pick_id=p.id and v.value=1) as upvotes,
 (select count(*) from public.ae_pick_votes v where v.pick_id=p.id and v.value=-1) as downvotes,
 (select coalesce(sum(v.value),0::bigint) from public.ae_pick_votes v where v.pick_id=p.id) as score,
 (select coalesce(max(v.value)::integer,0) from public.ae_pick_votes v where v.pick_id=p.id and v.user_id=auth.uid()) as my_vote,
 (select count(*) from public.ae_pick_comments c where c.pick_id=p.id and not c.hidden) as comments_count,
 p.moderation_status, p.event_date, p.outcome, p.settled_at,
 p.result_points, p.capture_check
from public.ae_community_picks p
where not p.hidden and p.moderation_status in ('pending','approved');

-- Public Pick reads exclude rejects even for their author; editors can still
-- access the underlying table for moderation and audit, never via the feed view.
alter policy ae_pick_read on public.ae_community_picks
 using ((not hidden and moderation_status in ('pending','approved'))
   or (select public.rcm_is_editor()));

-- Direct API reads of comments/votes must also exclude rejected picks.
alter policy ae_vote_read on public.ae_pick_votes
 using (
   exists (select 1 from public.ae_community_picks p
     where p.id=pick_id and not p.hidden
       and p.moderation_status in ('pending','approved'))
   or (select public.rcm_is_editor())
 );
alter policy ae_comment_read on public.ae_pick_comments
 using (
   (not hidden and exists (select 1 from public.ae_community_picks p
     where p.id=pick_id and not p.hidden
       and p.moderation_status in ('pending','approved')))
   or (select public.rcm_is_editor())
 );
-- Existing settlement and ranking RPCs already require
-- moderation_status='approved'; no points/history mutation is necessary.
