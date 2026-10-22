-- Only Picks approved by moderation may contribute visible historical awards.
-- Administrators retain access through the source table for audit.
alter policy ae_pick_awards_read on public.ae_pick_week_awards using (
  exists (
    select 1 from public.ae_community_picks p
    where p.id = pick_id
      and not p.hidden
      and p.moderation_status = 'approved'
  )
  or (select public.rcm_is_editor())
);
