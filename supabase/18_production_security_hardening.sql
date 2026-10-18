-- AE SPORTS | Production security hardening (applied 2026-10-17)
--
-- Purpose: prevent anonymous writes and leaks of unpublished articles without
-- changing the UI or reads of existing public news, legacy comments and votes.
--
-- This is a manual, repeatable hardening script for the existing production schema.
-- Production project: zahuhmvmqvxaunqebqaa.
-- It was applied through the Supabase SQL executor on 2026-10-17; do not
-- confuse it with a pending migration. Review schema differences before staging use.
--
-- Verification performed after application with SET LOCAL ROLE anon:
--   public.articles visible = 8, public.comments visible = 16,
--   public.comment_votes visible = 12.
-- Authenticated editor ability to execute rcm_publish_ranking is preserved.
--
-- Important: legacy comments without a matching article are kept visible to
-- preserve historical community widgets. There is no INSERT policy that allows
-- a new comment on an absent/unpublished article.
--
BEGIN;

-- Multiple PERMISSIVE RLS policies compose as OR; a legacy "true" read
-- policy overrode the publication guard.
DROP POLICY IF EXISTS "Todos pueden leer publicaciones" ON public.articles;
DROP POLICY IF EXISTS "Anyone can read comments" ON public.comments;
DROP POLICY IF EXISTS "Comentarios visibles para todos" ON public.comments;
DROP POLICY IF EXISTS "Anyone can read comment votes" ON public.comment_votes;

-- Old user INSERT / voting policies that bypass stricter article checks.
DROP POLICY IF EXISTS "Registered users can post comments" ON public.comments;
DROP POLICY IF EXISTS "Usuarios autenticados pueden comentar" ON public.comments;
DROP POLICY IF EXISTS "Visitors can cast their own votes" ON public.comment_votes;
DROP POLICY IF EXISTS "Visitors can change their own votes" ON public.comment_votes;

-- Restrictive RLS: even if a future permissive policy is overly broad,
-- an unpublished article remains hidden from non-editor users.
DROP POLICY IF EXISTS ae_articles_publication_guard ON public.articles;
CREATE POLICY ae_articles_publication_guard
ON public.articles AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (is_public OR (SELECT public.rcm_is_editor()));

-- Legacy/orphan comments were previously public and are needed for existing
-- community views. Existing unpublished articles and their comments are hidden.
ALTER POLICY rcm_comments_read ON public.comments
USING (
  EXISTS (SELECT 1 FROM public.articles a
          WHERE (a.id::text=article_id OR a.legacy_id=article_id) AND a.is_public)
  OR NOT EXISTS (SELECT 1 FROM public.articles a
                 WHERE a.id::text=article_id OR a.legacy_id=article_id)
);
ALTER POLICY rcm_comments_read_guard ON public.comments
USING (
  EXISTS (SELECT 1 FROM public.articles a
          WHERE (a.id::text=article_id OR a.legacy_id=article_id) AND a.is_public)
  OR NOT EXISTS (SELECT 1 FROM public.articles a
                 WHERE a.id::text=article_id OR a.legacy_id=article_id)
);
DROP POLICY IF EXISTS ae_comments_publication_guard ON public.comments;
CREATE POLICY ae_comments_publication_guard
ON public.comments AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (
  EXISTS (SELECT 1 FROM public.articles a
          WHERE (a.id::text=article_id OR a.legacy_id=article_id)
            AND (a.is_public OR (SELECT public.rcm_is_editor())))
  OR NOT EXISTS (SELECT 1 FROM public.articles a
                 WHERE a.id::text=article_id OR a.legacy_id=article_id)
);

DROP POLICY IF EXISTS ae_comment_votes_publication_guard ON public.comment_votes;
CREATE POLICY ae_comment_votes_publication_guard
ON public.comment_votes AS RESTRICTIVE FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.comments c WHERE c.id=comment_id));

-- Anonymous visitors only need to READ comments and votes, not mutate them.
REVOKE INSERT, UPDATE, DELETE, TRIGGER, REFERENCES
ON public.comments, public.comment_votes FROM anon;

-- The following RPCs are not used by anonymous readers.
-- Keeping authenticated EXECUTE on ranking/voting functions preserves normal use.
REVOKE EXECUTE ON FUNCTION public.rcm_publish_ranking(text, text[], timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rcm_set_comment_vote(text, integer) FROM PUBLIC, anon;

-- Trigger-only functions are not public RPC endpoints.
REVOKE EXECUTE ON FUNCTION public.rcm_check_comment_parent() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rcm_validate_ranking() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ae_pick_event_date_guard() FROM PUBLIC, anon, authenticated;

-- Strip stale guest privileges on a retired CSV table and read-only views.
REVOKE ALL PRIVILEGES ON TABLE public."CSV" FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
ON TABLE public.rcm_article_totals, public.rcm_comment_totals FROM anon;

COMMIT;

-- Post-deployment read-only checks:
-- SELECT tablename, policyname, permissive, cmd FROM pg_policies
-- WHERE schemaname='public' AND tablename IN ('articles','comments','comment_votes');
-- SELECT has_table_privilege('anon','public.comments','INSERT'),
--        has_table_privilege('anon','public.comment_votes','UPDATE');
-- BEGIN; SET LOCAL ROLE anon;
-- SELECT count(*) FROM public.articles;
-- SELECT count(*) FROM public.comments;
-- SELECT count(*) FROM public.comment_votes;
-- COMMIT;
