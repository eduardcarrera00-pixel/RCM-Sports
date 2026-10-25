create policy "ae_pick_insert" on public.ae_community_picks as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false))));
create policy "ae_pick_read" on public.ae_community_picks as PERMISSIVE for SELECT to "public" using ((((NOT hidden) AND (moderation_status = ANY (ARRAY['pending'::text, 'approved'::text]))) OR ( SELECT rcm_is_editor() AS rcm_is_editor)));
create policy "ae_pick_moderate" on public.ae_community_picks as PERMISSIVE for UPDATE to "authenticated" using (( SELECT rcm_is_editor() AS rcm_is_editor)) with check (( SELECT rcm_is_editor() AS rcm_is_editor));
create policy "ae_opinions_delete" on public.ae_opinions as PERMISSIVE for DELETE to "public" using (rcm_is_editor());
create policy "ae_opinions_insert" on public.ae_opinions as PERMISSIVE for INSERT to "public" with check ((rcm_is_editor() AND (created_by = auth.uid())));
create policy "ae_opinions_read" on public.ae_opinions as PERMISSIVE for SELECT to "public" using ((is_published OR rcm_is_editor()));
create policy "ae_opinions_update" on public.ae_opinions as PERMISSIVE for UPDATE to "public" using (rcm_is_editor()) with check (rcm_is_editor());
create policy "ae_comment_insert" on public.ae_pick_comments as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false)) AND (EXISTS ( SELECT 1
   FROM ae_community_picks p
  WHERE ((p.id = ae_pick_comments.pick_id) AND (NOT p.hidden))))));
create policy "ae_comment_read" on public.ae_pick_comments as PERMISSIVE for SELECT to "public" using ((((NOT hidden) AND (EXISTS ( SELECT 1
   FROM ae_community_picks p
  WHERE ((p.id = ae_pick_comments.pick_id) AND (NOT p.hidden) AND (p.moderation_status = ANY (ARRAY['pending'::text, 'approved'::text])))))) OR ( SELECT rcm_is_editor() AS rcm_is_editor)));
create policy "ae_comment_moderate" on public.ae_pick_comments as PERMISSIVE for UPDATE to "authenticated" using (( SELECT rcm_is_editor() AS rcm_is_editor)) with check (( SELECT rcm_is_editor() AS rcm_is_editor));
create policy "ae_vote_delete" on public.ae_pick_votes as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "ae_vote_insert" on public.ae_pick_votes as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false)) AND (EXISTS ( SELECT 1
   FROM ae_community_picks p
  WHERE ((p.id = ae_pick_votes.pick_id) AND (NOT p.hidden) AND (p.moderation_status = ANY (ARRAY['pending'::text, 'approved'::text])) AND (p.outcome = 'pending'::text) AND (p.event_date >= ((now() AT TIME ZONE 'America/Toronto'::text))::date) AND (p.user_id <> ( SELECT auth.uid() AS uid)))))));
create policy "ae_vote_read" on public.ae_pick_votes as PERMISSIVE for SELECT to "public" using (((EXISTS ( SELECT 1
   FROM ae_community_picks p
  WHERE ((p.id = ae_pick_votes.pick_id) AND (NOT p.hidden) AND (p.moderation_status = ANY (ARRAY['pending'::text, 'approved'::text]))))) OR ( SELECT rcm_is_editor() AS rcm_is_editor)));
create policy "ae_vote_update" on public.ae_pick_votes as PERMISSIVE for UPDATE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false)) AND (EXISTS ( SELECT 1
   FROM ae_community_picks p
  WHERE ((p.id = ae_pick_votes.pick_id) AND (NOT p.hidden) AND (p.moderation_status = ANY (ARRAY['pending'::text, 'approved'::text])) AND (p.outcome = 'pending'::text) AND (p.event_date >= ((now() AT TIME ZONE 'America/Toronto'::text))::date) AND (p.user_id <> ( SELECT auth.uid() AS uid)))))));
create policy "rcm_like_guard" on public.article_likes as RESTRICTIVE for ALL to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false)))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false)) AND (EXISTS ( SELECT 1
   FROM articles a
  WHERE ((a.id = article_likes.article_id) AND a.is_public)))));
create policy "rcm_like_owner" on public.article_likes as PERMISSIVE for ALL to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false)))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (NOT COALESCE(((auth.jwt() ->> 'is_anonymous'::text))::boolean, false)) AND (EXISTS ( SELECT 1
   FROM articles a
  WHERE ((a.id = article_likes.article_id) AND a.is_public)))));
create policy "Solo editores pueden eliminar" on public.articles as PERMISSIVE for DELETE to "authenticated" using ((EXISTS ( SELECT 1
   FROM editors
  WHERE (editors.user_id = ( SELECT auth.uid() AS uid)))));
create policy "rcm_articles_delete" on public.articles as PERMISSIVE for DELETE to "authenticated" using (rcm_is_editor());
create policy "rcm_articles_delete_guard" on public.articles as RESTRICTIVE for DELETE to "anon","authenticated" using (rcm_is_editor());
create policy "Solo editores pueden publicar" on public.articles as PERMISSIVE for INSERT to "authenticated" with check (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM editors
  WHERE (editors.user_id = ( SELECT auth.uid() AS uid))))));
create policy "rcm_articles_insert" on public.articles as PERMISSIVE for INSERT to "authenticated" with check (rcm_is_editor());
create policy "rcm_articles_insert_guard" on public.articles as RESTRICTIVE for INSERT to "anon","authenticated" with check (rcm_is_editor());
create policy "ae_articles_publication_guard" on public.articles as RESTRICTIVE for SELECT to "anon","authenticated" using ((is_public OR ( SELECT rcm_is_editor() AS rcm_is_editor)));
create policy "rcm_articles_read" on public.articles as PERMISSIVE for SELECT to "anon","authenticated" using ((is_public OR rcm_is_editor()));
create policy "rcm_articles_read_guard" on public.articles as RESTRICTIVE for SELECT to "anon","authenticated" using ((is_public OR rcm_is_editor()));
create policy "RCM editors can update article images" on public.articles as PERMISSIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM editors
  WHERE (editors.user_id = ( SELECT auth.uid() AS uid))))) with check ((EXISTS ( SELECT 1
   FROM editors
  WHERE (editors.user_id = ( SELECT auth.uid() AS uid)))));
create policy "Solo editores pueden editar" on public.articles as PERMISSIVE for UPDATE to "authenticated" using ((EXISTS ( SELECT 1
   FROM editors
  WHERE (editors.user_id = ( SELECT auth.uid() AS uid))))) with check ((EXISTS ( SELECT 1
   FROM editors
  WHERE (editors.user_id = ( SELECT auth.uid() AS uid)))));
create policy "rcm_articles_update" on public.articles as PERMISSIVE for UPDATE to "authenticated" using (rcm_is_editor()) with check (rcm_is_editor());
create policy "rcm_articles_update_guard" on public.articles as RESTRICTIVE for UPDATE to "anon","authenticated" using (rcm_is_editor()) with check (rcm_is_editor());
create policy "Visitors can remove their own votes" on public.comment_votes as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "rcm_votes_delete" on public.comment_votes as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "rcm_votes_delete_guard" on public.comment_votes as RESTRICTIVE for DELETE to "anon","authenticated" using (((NOT COALESCE(((( SELECT auth.jwt() AS jwt) ->> 'is_anonymous'::text))::boolean, false)) AND (user_id = ( SELECT auth.uid() AS uid))));
create policy "rcm_votes_insert" on public.comment_votes as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM comments c
  WHERE (c.id = comment_votes.comment_id)))));
create policy "rcm_votes_insert_guard" on public.comment_votes as RESTRICTIVE for INSERT to "anon","authenticated" with check (((NOT COALESCE(((( SELECT auth.jwt() AS jwt) ->> 'is_anonymous'::text))::boolean, false)) AND (user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM comments c
  WHERE (c.id = comment_votes.comment_id)))));
create policy "ae_comment_votes_publication_guard" on public.comment_votes as RESTRICTIVE for SELECT to "anon","authenticated" using ((EXISTS ( SELECT 1
   FROM comments c
  WHERE (c.id = comment_votes.comment_id))));
create policy "rcm_votes_read" on public.comment_votes as PERMISSIVE for SELECT to "anon","authenticated" using ((EXISTS ( SELECT 1
   FROM comments c
  WHERE (c.id = comment_votes.comment_id))));
create policy "rcm_votes_read_guard" on public.comment_votes as RESTRICTIVE for SELECT to "anon","authenticated" using ((EXISTS ( SELECT 1
   FROM comments c
  WHERE (c.id = comment_votes.comment_id))));
create policy "rcm_votes_update" on public.comment_votes as PERMISSIVE for UPDATE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid))) with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM comments c
  WHERE (c.id = comment_votes.comment_id)))));
create policy "rcm_votes_update_guard" on public.comment_votes as RESTRICTIVE for UPDATE to "anon","authenticated" using (((NOT COALESCE(((( SELECT auth.jwt() AS jwt) ->> 'is_anonymous'::text))::boolean, false)) AND (user_id = ( SELECT auth.uid() AS uid)))) with check (((NOT COALESCE(((( SELECT auth.jwt() AS jwt) ->> 'is_anonymous'::text))::boolean, false)) AND (user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM comments c
  WHERE (c.id = comment_votes.comment_id)))));
create policy "rcm_editor_delete_guard" on public.editors as RESTRICTIVE for DELETE to "anon","authenticated" using (false);
create policy "rcm_editor_insert_guard" on public.editors as RESTRICTIVE for INSERT to "anon","authenticated" with check (false);
create policy "Cada editor consulta su permiso" on public.editors as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "rcm_editor_read" on public.editors as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "rcm_editor_read_guard" on public.editors as RESTRICTIVE for SELECT to "anon","authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "rcm_editor_update_guard" on public.editors as RESTRICTIVE for UPDATE to "anon","authenticated" using (false) with check (false);
