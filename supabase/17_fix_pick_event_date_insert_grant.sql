-- AE SPORTS | 2026-10-16 | Fix "permission denied for table ae_community_picks"
-- The event_date column was added in migration 16, but migration 15
-- only allowed INSERT on title, explanation, legs. A column-level INSERT
-- requires a grant for EVERY explicitly inserted column.
--
-- Keep narrowly-scoped access: neither anonymous users nor authenticated
-- users receive broad table INSERT/UPDATE/DELETE permission.
GRANT INSERT (event_date) ON TABLE public.ae_community_picks TO authenticated;

-- This migration intentionally leaves the existing insert RLS policy,
-- ownership triggers, approved-feed rules, and all user data untouched.
