-- CAM SPORTS · Perfil: resumen y pestaña «Mi Party» (3 nov 2026).
--
-- Dos lecturas, una por pestaña:
--   · cam_profile_overview(p_user): nombre, cifras, mejor Take, mejor Pick y
--     posiciones en las quinielas y en los parties de quiniela visibles.
--   · cam_profile_party(p_user): parties, quiniela compacta y los 3 últimos
--     pronósticos resueltos.
-- Solo devuelven lo que ya puede ver un visitante: sin Takes ni Picks ocultos,
-- sin borradores, Picks solo pendientes de revisión o aprobados, pronósticos
-- de quiniela solo de partidos terminados, parties solo los marcados para el
-- perfil (el propio perfil ve también los ocultos) y el id de un party solo
-- para quien ya es miembro.

-- Posición en la clasificación histórica de cada quiniela (la misma que
-- enseña la quiniela). Fútbol: las cuatro competiciones juntas.
create function public.cam_profile_quiniela_standing(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_year integer := extract(year from now())::integer;
  v_nfl jsonb;
  v_football jsonb;
begin
  with lb as (select * from public.cam_nfl_leaderboard('all', v_year, null, null))
  select jsonb_build_object('position', lb.rank_position, 'of', (select count(*) from lb),
                            'points', lb.points, 'hits', lb.hits, 'resolved', lb.resolved)
    into v_nfl
    from lb where lb.user_id = p_user;
  with lb as (select * from public.cam_football_leaderboard('all', v_year, null, null, null))
  select jsonb_build_object('position', lb.rank_position, 'of', (select count(*) from lb),
                            'points', lb.points, 'hits', lb.hits, 'resolved', lb.resolved)
    into v_football
    from lb where lb.user_id = p_user;
  return jsonb_build_object('nfl', v_nfl, 'football', v_football);
end;
$$;

-- ---------------------------------------------------------------------------
-- Pestaña «Perfil»
-- ---------------------------------------------------------------------------
create function public.cam_profile_overview(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_card jsonb;
  v_takes jsonb;
  v_take jsonb;
  v_picks jsonb;
  v_pick jsonb;
  v_quiniela jsonb;
  v_parties jsonb;
begin
  select jsonb_build_object(
           'user_id', u.id,
           'username', coalesce(nullif(left(a.username, 40), ''), nullif(left(u.raw_user_meta_data->>'username', 40), ''), 'Aficionado'),
           'joined_month', to_char(date_trunc('month', u.created_at at time zone 'America/Toronto'), 'YYYY-MM'))
    into v_card
    from auth.users u left join public.ae_auth_accounts a on a.user_id = u.id
   where u.id = p_user and not coalesce(u.is_anonymous, false);
  if v_card is null then
    return null;
  end if;

  -- Takes públicos: cuántos y su apoyo.
  select jsonb_build_object('count', count(*), 'up', coalesce(sum(t.up), 0), 'down', coalesce(sum(t.down), 0))
    into v_takes
    from (select (select count(*) from public.ae_free_take_votes v where v.take_id = ft.id and v.value = 1) as up,
                 (select count(*) from public.ae_free_take_votes v where v.take_id = ft.id and v.value = -1) as down
            from public.ae_free_takes ft
           where ft.user_id = p_user and not ft.hidden) t;

  -- Mejor Take: el acertado con más puntos (ae_take_score_rows, también
  -- «¿Quién será campeón?»); si hay empate, el más reciente.
  select jsonb_build_object(
           'kind', 'best', 'type', case when ft.id is null then 'champion' else 'take' end,
           'id', s.take_id, 'title', s.title, 'points', s.points, 'scored_at', s.scored_at,
           'sport', coalesce(ft.sport, q.competition), 'competition', coalesce(ft.competition, q.competition),
           'body', coalesce(ft.body, s.body), 'created_at', coalesce(ft.created_at, tp.created_at, s.scored_at),
           'upvotes', (select count(*) from public.ae_free_take_votes v where v.take_id = ft.id and v.value = 1),
           'downvotes', (select count(*) from public.ae_free_take_votes v where v.take_id = ft.id and v.value = -1),
           'my_vote', (select v.value from public.ae_free_take_votes v where v.take_id = ft.id and v.user_id = v_viewer))
    into v_take
    from public.ae_take_score_rows('all', 'all') s
    left join public.ae_free_takes ft on ft.id = s.take_id and ft.user_id = p_user
    left join public.ae_take_questions q on q.id = s.take_id
    left join public.ae_take_predictions tp on tp.question_id = s.take_id and tp.user_id = p_user
   where s.user_id = p_user and s.outcome = 'won'
   order by s.points desc, s.scored_at desc
   limit 1;

  -- Si no tiene ninguno acertado: el Take con más votos netos.
  if v_take is null then
    select jsonb_build_object(
             'kind', 'supported', 'type', 'take', 'id', t.id, 'title', t.title,
             'net', t.up - t.down, 'upvotes', t.up, 'downvotes', t.down, 'my_vote', t.my_vote,
             'sport', t.sport, 'competition', t.competition, 'body', t.body, 'created_at', t.created_at)
      into v_take
      from (select ft.id, ft.title, ft.body, ft.sport, ft.competition, ft.created_at,
                   (select count(*) from public.ae_free_take_votes v where v.take_id = ft.id and v.value = 1) as up,
                   (select count(*) from public.ae_free_take_votes v where v.take_id = ft.id and v.value = -1) as down,
                   (select v.value from public.ae_free_take_votes v where v.take_id = ft.id and v.user_id = v_viewer) as my_vote
              from public.ae_free_takes ft
             where ft.user_id = p_user and not ft.hidden) t
     order by t.up - t.down desc, t.up desc, t.created_at desc, t.id desc
     limit 1;
  end if;

  -- Picks públicos (los de ae_pick_feed): cuántos, aciertos y fallos.
  select jsonb_build_object('count', count(*),
                            'won', count(*) filter (where p.outcome = 'won'),
                            'lost', count(*) filter (where p.outcome = 'lost'))
    into v_picks
    from public.ae_community_picks p
   where p.user_id = p_user and not p.hidden and p.moderation_status in ('pending','approved');

  -- Mejor Pick: reglas de ae_pick_result_ranking (aprobado, visible, con
  -- resultado), el acertado con más puntos.
  select jsonb_build_object('kind', 'best', 'id', p.id, 'title', p.title, 'legs', p.legs,
                            'american_odds', p.american_odds, 'result_points', p.result_points,
                            'outcome', p.outcome, 'created_at', p.created_at)
    into v_pick
    from public.ae_community_picks p
   where p.user_id = p_user and not p.hidden and p.moderation_status = 'approved'
     and p.outcome = 'won' and p.settled_at is not null
   order by p.result_points desc, p.created_at desc, p.id desc
   limit 1;
  if v_pick is null then
    select jsonb_build_object('kind', 'last', 'id', p.id, 'title', p.title, 'legs', p.legs,
                              'american_odds', p.american_odds, 'result_points', p.result_points,
                              'outcome', p.outcome, 'created_at', p.created_at)
      into v_pick
      from public.ae_community_picks p
     where p.user_id = p_user and not p.hidden and p.moderation_status in ('pending','approved')
     order by p.created_at desc, p.id desc
     limit 1;
  end if;

  -- Quinielas y parties de quiniela visibles en el perfil (los 3 mejores).
  v_quiniela := public.cam_profile_quiniela_standing(p_user);
  with shown as (
    select m.party_id from public.cam_party_members m
      join public.cam_parties pa on pa.id = m.party_id
     where m.user_id = p_user and m.show_on_profile and pa.kind = 'quiniela'
  ), st as (
    select s.party_id, s."position", s.member_count
      from public.cam_party_standings(array(select sh.party_id from shown sh), 'all') s
     where s.user_id = p_user
  )
  select coalesce(jsonb_agg(x.data order by x.pos, x.name), '[]'::jsonb)
    into v_parties
    from (select st."position" as pos, pa.name,
                 jsonb_build_object(
                   'id', case when public.cam_party_is_member(pa.id) or public.rcm_is_editor() then pa.id end,
                   'name', pa.name, 'sport', pa.sport, 'position', st."position", 'member_count', st.member_count) as data
            from st join public.cam_parties pa on pa.id = st.party_id
           order by st."position", pa.name
           limit 3) x;

  return v_card || jsonb_build_object(
    'takes', v_takes || jsonb_build_object('top', v_take),
    'picks', v_picks || jsonb_build_object('top', v_pick),
    'quiniela', v_quiniela || jsonb_build_object('parties', v_parties));
end;
$$;

-- ---------------------------------------------------------------------------
-- Pestaña «Mi Party»
-- ---------------------------------------------------------------------------
create function public.cam_profile_party(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_own boolean := v_viewer is not null and v_viewer = p_user;
  v_parties jsonb;
  v_recent jsonb;
  v_last text;
begin
  if not exists (select 1 from auth.users u where u.id = p_user and not coalesce(u.is_anonymous, false)) then
    return null;
  end if;

  -- Parties: el propio perfil los ve todos; los demás, solo los marcados.
  with shown as (
    select m.party_id, m.show_on_profile, m.joined_at, pa.kind
      from public.cam_party_members m
      join public.cam_parties pa on pa.id = m.party_id
     where m.user_id = p_user and (v_own or m.show_on_profile)
  ), st as (
    select s.party_id, s."position", s.member_count
      from public.cam_party_standings(array(select sh.party_id from shown sh), 'all') s
     where s.user_id = p_user
  ), wk as (
    select s.party_id, s."position"
      from public.cam_party_standings(array(select sh.party_id from shown sh where sh.kind = 'quiniela'), 'week') s
     where s.user_id = p_user
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', case when v_own or public.cam_party_is_member(pa.id) or public.rcm_is_editor() then pa.id end,
           'name', pa.name, 'kind', pa.kind, 'sport', pa.sport,
           'member_count', st.member_count, 'position', st."position", 'week_position', wk."position",
           'show_on_profile', case when v_own then sh.show_on_profile end,
           'is_owner', case when v_own then pa.owner_id = p_user end)
           order by (pa.kind = 'quiniela') desc, sh.joined_at desc), '[]'::jsonb)
    into v_parties
    from shown sh
    join public.cam_parties pa on pa.id = sh.party_id
    left join st on st.party_id = pa.id
    left join wk on wk.party_id = pa.id;

  -- Los 3 últimos pronósticos resueltos (solo partidos terminados: lo mismo
  -- que ya enseñan cam_nfl_public_pick_breakdown y cam_football_public_pick_breakdown).
  select coalesce(jsonb_agg(r.data order by r.kickoff desc), '[]'::jsonb)
    into v_recent
    from (
      select u.kickoff, u.data from (
        select g.kickoff, jsonb_build_object(
                 'sport', 'nfl', 'competition', 'nfl', 'home_name', th.name, 'away_name', ta.name,
                 'pick_label', case when p.team_id = g.home_id then th.name else ta.name end,
                 'state', case when p.team_id = g.winner_id then 'won' else 'lost' end,
                 'points', p.awarded_points, 'home_score', g.home_score, 'away_score', g.away_score,
                 'kickoff', g.kickoff) as data
          from public.cam_nfl_picks p
          join public.cam_nfl_games g on g.id = p.game_id
          left join public.nfl_teams th on th.id = g.home_id
          left join public.nfl_teams ta on ta.id = g.away_id
         where p.user_id = p_user and g.status = 'final' and g.winner_id is not null
        union all
        select g.kickoff, jsonb_build_object(
                 'sport', 'football', 'competition', g.competition,
                 'home_name', coalesce(th.short_name, th.name), 'away_name', coalesce(ta.short_name, ta.name),
                 'pick_label', case p.pick when 'home' then coalesce(th.short_name, th.name)
                                           when 'away' then coalesce(ta.short_name, ta.name) else 'Empate' end,
                 'state', case when p.pick = g.outcome then 'won' else 'lost' end,
                 'points', p.awarded_points, 'home_score', g.home_score, 'away_score', g.away_score,
                 'kickoff', g.kickoff) as data
          from public.cam_football_picks p
          join public.cam_football_games g on g.id = p.game_id
          left join public.cam_football_teams th on th.id = g.home_id
          left join public.cam_football_teams ta on ta.id = g.away_id
         where p.user_id = p_user and g.status = 'final' and g.outcome is not null
      ) u
      order by u.kickoff desc
      limit 3
    ) r;

  -- Para «Jugar esta semana»: la quiniela de su último pronóstico (solo el propio perfil).
  if v_own then
    select x.sport into v_last from (
      select 'nfl' as sport, p.updated_at from public.cam_nfl_picks p where p.user_id = p_user
      union all
      select 'football', p.updated_at from public.cam_football_picks p where p.user_id = p_user
    ) x order by x.updated_at desc limit 1;
  end if;

  return jsonb_build_object(
    'own', v_own,
    'parties', v_parties,
    'quiniela', public.cam_profile_quiniela_standing(p_user),
    'recent', v_recent,
    'last_sport', v_last);
end;
$$;

revoke all on function public.cam_profile_quiniela_standing(uuid) from public, anon, authenticated;
revoke all on function public.cam_profile_overview(uuid) from public;
revoke all on function public.cam_profile_party(uuid) from public;
grant execute on function public.cam_profile_overview(uuid) to anon, authenticated;
grant execute on function public.cam_profile_party(uuid) to anon, authenticated;
