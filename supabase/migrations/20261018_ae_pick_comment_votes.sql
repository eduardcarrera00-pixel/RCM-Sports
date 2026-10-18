-- AE SPORTS: votos y recuento de respuestas en comentarios de Picks.
-- Los votos son por usuario, se leen agrupados y se escriben mediante una RPC autenticada.
create table if not exists public.ae_pick_comment_votes (
  comment_id uuid not null references public.ae_pick_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
alter table public.ae_pick_comment_votes enable row level security;
-- No se exponen identidades de votantes mediante select directo;
-- el agregado público verifica que el Pick y su comentario sean visibles.
revoke all on public.ae_pick_comment_votes from anon, authenticated;
create index if not exists ae_pick_comments_visible_parent_idx
  on public.ae_pick_comments (pick_id, parent_id) where not hidden;

create or replace function public.ae_pick_comment_vote_totals(p_pick_id uuid)
returns table (
  comment_id uuid,
  upvotes bigint,
  downvotes bigint,
  my_vote integer,
  reply_count bigint,
  reply_people bigint
)
language sql stable security definer
set search_path = ''
as $$
  select c.id,
    count(v.comment_id) filter (where v.value = 1),
    count(v.comment_id) filter (where v.value = -1),
    coalesce(max(v.value) filter (where v.user_id = (select auth.uid())), 0)::integer,
    (select count(*) from public.ae_pick_comments r
      where r.pick_id = c.pick_id and r.parent_id = c.id and not r.hidden),
    (select count(distinct r.user_id) from public.ae_pick_comments r
      where r.pick_id = c.pick_id and r.parent_id = c.id and not r.hidden)
  from public.ae_pick_comments c
  join public.ae_community_picks p on p.id = c.pick_id
  left join public.ae_pick_comment_votes v on v.comment_id = c.id
  where c.pick_id = p_pick_id and not c.hidden and not p.hidden
    and (
      p.moderation_status in ('pending','approved')
      or p.user_id = (select auth.uid())
      or public.rcm_is_editor()
    )
  group by c.id, c.pick_id;
$$;
revoke all on function public.ae_pick_comment_vote_totals(uuid) from public;
grant execute on function public.ae_pick_comment_vote_totals(uuid) to anon, authenticated;

create or replace function public.ae_set_pick_comment_vote(p_comment_id uuid, p_vote integer)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Inicia sesión para votar comentarios.';
  end if;
  if p_vote is null or p_vote not in (-1,0,1) then
    raise exception 'Voto inválido.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_comment_id::text, 0));
  if not exists (
    select 1
    from public.ae_pick_comments c
    join public.ae_community_picks p on p.id = c.pick_id
    where c.id = p_comment_id and not c.hidden and not p.hidden
      and c.user_id <> actor
      and (
        p.moderation_status in ('pending','approved')
        or p.user_id = actor
        or public.rcm_is_editor()
      )
  ) then
    raise exception 'Comentario no disponible o no puedes votar tu comentario.';
  end if;
  if p_vote = 0 then
    delete from public.ae_pick_comment_votes
    where comment_id = p_comment_id and user_id = actor;
  else
    insert into public.ae_pick_comment_votes(comment_id,user_id,value)
    values(p_comment_id,actor,p_vote)
    on conflict(comment_id,user_id) do update set value = excluded.value;
  end if;
end;
$$;
revoke all on function public.ae_set_pick_comment_vote(uuid,integer) from public;
grant execute on function public.ae_set_pick_comment_vote(uuid,integer) to authenticated;
