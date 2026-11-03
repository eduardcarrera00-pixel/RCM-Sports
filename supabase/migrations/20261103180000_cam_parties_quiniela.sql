-- CAM SPORTS · Parties de quiniela (3 nov 2026).
--
-- Un party puede ser ahora de Quiniela, además de Picks o Takes.
-- Puntos: los de siempre, del libro de cuentas de las quinielas
-- (cam_nfl_picks / cam_football_picks), sin fórmula nueva: cada acierto suma
-- awarded_points y solo cuentan partidos con resultado final, como en
-- cam_nfl_leaderboard y cam_football_leaderboard.
-- Dentro de un party solo cuentan los partidos que empiezan después de que el
-- miembro entró. Periodos: «Esta semana» (la semana NFL y la jornada de fútbol
-- vigentes, las mismas que enseña cada quiniela), «Este mes» y «Total».
-- Privacidad: la elección de cada miembro solo se ve cuando el partido ya
-- empezó (el cierre de la quiniela es el inicio del partido). Las tablas de
-- pronósticos siguen privadas por RLS.

alter table public.cam_parties drop constraint cam_parties_kind_check;
alter table public.cam_parties add constraint cam_parties_kind_check
  check (kind in ('quiniela','picks','takes'));

-- ---------------------------------------------------------------------------
-- «Esta semana»: partidos de la semana NFL vigente y de la jornada vigente de
-- cada competición de fútbol, con las mismas reglas que las quinielas
-- (cam-nfl-quiniela.js chooseWeek y cam-football-quiniela.js chooseRound).
-- ---------------------------------------------------------------------------
create function public.cam_quiniela_week_games()
returns table(sport text, game_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with nfl_season as (
    -- Temporada NFL: la del año, o la del anterior en enero y febrero.
    select coalesce(
      (select g.season from public.cam_nfl_games g
        where g.season = extract(year from now() at time zone 'UTC')::int
                         - case when extract(month from now() at time zone 'UTC') < 3 then 1 else 0 end
        limit 1),
      (select max(g.season) from public.cam_nfl_games g)) as s
  ), nfl_week as (
    -- La primera semana con algún partido sin terminar (6 h tras el inicio).
    select coalesce(
      (select min(g.week) from public.cam_nfl_games g join nfl_season ns on g.season = ns.s
        where g.kickoff + interval '6 hours' >= now()),
      (select max(g.week) from public.cam_nfl_games g join nfl_season ns on g.season = ns.s)) as w
  ), fb_season as (
    -- Temporada de fútbol: empieza en julio.
    select g.competition,
           coalesce(max(g.season) filter (where g.season = extract(year from now() at time zone 'UTC')::int
                                          - case when extract(month from now() at time zone 'UTC') < 7 then 1 else 0 end),
                    max(g.season)) as s
      from public.cam_football_games g
     group by g.competition
  ), fb_round as (
    -- La primera jornada con un partido abierto; si no, la primera sin
    -- terminar (4 h tras el inicio); si no, la última.
    select fs.competition, fs.s,
           coalesce(
             (select min(g.matchday) from public.cam_football_games g
               where g.competition = fs.competition and g.season = fs.s and g.status = 'scheduled'
                 and g.picks_open and g.kickoff > now() and g.odds_locked_at is not null),
             (select min(g.matchday) from public.cam_football_games g
               where g.competition = fs.competition and g.season = fs.s
                 and g.kickoff + interval '4 hours' >= now()),
             (select max(g.matchday) from public.cam_football_games g
               where g.competition = fs.competition and g.season = fs.s)) as md
      from fb_season fs
  )
  select 'nfl'::text, g.id
    from public.cam_nfl_games g, nfl_season ns, nfl_week nw
   where g.season = ns.s and g.week = nw.w
  union all
  select 'football'::text, g.id
    from public.cam_football_games g
    join fb_round r on r.competition = g.competition and r.s = g.season and r.md = g.matchday;
$$;
comment on function public.cam_quiniela_week_games() is
  'Partidos de la semana NFL y de la jornada de fútbol vigentes (uso interno de Parties).';

-- Filas de puntos de las quinielas: un pronóstico por partido terminado.
-- p_period: 'week' (semana/jornada vigente), 'month' (mes de Toronto del
-- partido) o 'all'.
create function public.cam_quiniela_score_rows(p_period text)
returns table(sport text, game_id text, user_id uuid, kickoff timestamptz, points numeric, won boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with week as (
    select w.sport, w.game_id from public.cam_quiniela_week_games() w where p_period = 'week'
  )
  select 'nfl'::text, g.id, p.user_id, g.kickoff, p.awarded_points::numeric, p.team_id = g.winner_id
    from public.cam_nfl_picks p
    join public.cam_nfl_games g on g.id = p.game_id
   where g.status = 'final' and g.winner_id is not null
     and (p_period = 'all'
          or (p_period = 'month'
              and date_trunc('month', g.kickoff at time zone 'America/Toronto')
                  = date_trunc('month', now() at time zone 'America/Toronto'))
          or (p_period = 'week' and exists (select 1 from week w where w.sport = 'nfl' and w.game_id = g.id)))
  union all
  select 'football'::text, g.id, p.user_id, g.kickoff, p.awarded_points::numeric, p.pick = g.outcome
    from public.cam_football_picks p
    join public.cam_football_games g on g.id = p.game_id
   where g.status = 'final' and g.outcome is not null
     and (p_period = 'all'
          or (p_period = 'month'
              and date_trunc('month', g.kickoff at time zone 'America/Toronto')
                  = date_trunc('month', now() at time zone 'America/Toronto'))
          or (p_period = 'week' and exists (select 1 from week w where w.sport = 'football' and w.game_id = g.id)));
$$;
comment on function public.cam_quiniela_score_rows(text) is
  'Filas de puntos de las quinielas NFL y Fútbol, mismas reglas que sus clasificaciones (uso interno de Parties).';

-- ---------------------------------------------------------------------------
-- Puntos de cada party: nueva rama de Quiniela. Picks y Takes no cambian
-- (no tienen «Esta semana»).
-- ---------------------------------------------------------------------------
create or replace function public.cam_party_score_rows(p_party_ids uuid[], p_period text)
returns table(party_id uuid, user_id uuid, points numeric, won boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with parties as (
    select pa.id, pa.kind, pa.sport from public.cam_parties pa where pa.id = any(p_party_ids)
  ), members as (
    select m.party_id, m.user_id, m.joined_at
      from public.cam_party_members m join parties pa on pa.id = m.party_id
  ), take_sports as (
    select distinct pa.sport from parties pa where pa.kind = 'takes' and p_period in ('month','all')
  ), take_rows as (
    select ts.sport, s.user_id, s.take_id, s.outcome, s.points
      from take_sports ts
      cross join lateral public.ae_take_score_rows(ts.sport, p_period) s
  ), pick_rows as (
    select r.*
      from (select 1 from parties pa where pa.kind = 'picks' and p_period in ('month','all') limit 1) x
      cross join lateral public.ae_pick_score_rows(p_period) r
  ), quiniela_rows as (
    select q.*
      from (select 1 from parties pa where pa.kind = 'quiniela' limit 1) x
      cross join lateral public.cam_quiniela_score_rows(p_period) q
  )
  select m.party_id, m.user_id, t.points::numeric, t.outcome = 'won'
    from take_rows t
    join parties pa on pa.kind = 'takes' and pa.sport = t.sport
    join members m on m.party_id = pa.id and m.user_id = t.user_id
    left join public.ae_free_takes ft on ft.id = t.take_id and ft.user_id = t.user_id
    left join public.ae_take_predictions tp on tp.question_id = t.take_id and tp.user_id = t.user_id
   where coalesce(ft.created_at, tp.created_at) >= m.joined_at
  union all
  select m.party_id, m.user_id, r.points, r.outcome = 'won'
    from pick_rows r
    join members m on m.user_id = r.user_id
    join parties pa on pa.id = m.party_id and pa.kind = 'picks'
   where r.created_at >= m.joined_at
     and (pa.sport = 'all' or pa.sport = public.cam_pick_sport(r.legs))
  union all
  select m.party_id, m.user_id, q.points, q.won
    from quiniela_rows q
    join members m on m.user_id = q.user_id
    join parties pa on pa.id = m.party_id and pa.kind = 'quiniela'
   where q.kickoff >= m.joined_at
     and (pa.sport = 'all' or pa.sport = q.sport);
$$;

-- ---------------------------------------------------------------------------
-- Crear: el tipo Quiniela también vale.
-- ---------------------------------------------------------------------------
create or replace function public.cam_party_create(p_name text, p_kind text, p_sport text default 'all')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.cam_party_require_user();
  v_name text := public.cam_party_clean_name(p_name);
  v_sport text := coalesce(nullif(p_sport, ''), 'all');
  v_id uuid;
  v_code text;
begin
  if p_kind is null or p_kind not in ('quiniela','picks','takes') then
    raise exception 'Elige si el party es de Quiniela, Picks o Takes.' using errcode = '22023';
  end if;
  if v_sport not in ('all','football','nfl') then
    raise exception 'Deporte no válido.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cam_party_user:' || v_user::text, 0));
  if (select count(*) from public.cam_parties pa where pa.owner_id = v_user) >= 10 then
    raise exception 'Ya tienes 10 parties creados. Borra alguno para crear otro.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cam_party_members m where m.user_id = v_user) >= 20 then
    raise exception 'Ya estás en 20 parties. Sal de alguno para crear otro.' using errcode = 'P0001';
  end if;
  loop
    v_code := public.cam_party_new_code_value();
    begin
      insert into public.cam_parties(name, kind, sport, code, owner_id, created_by)
      values (v_name, p_kind, v_sport, v_code, v_user, v_user)
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- Otro party se quedó el mismo código en ese instante: probar otro.
    end;
  end loop;
  insert into public.cam_party_members(party_id, user_id) values (v_id, v_user);
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- ---------------------------------------------------------------------------
-- Mis parties: además, la posición de esta semana en los de Quiniela.
-- ---------------------------------------------------------------------------
create or replace function public.cam_party_mine()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v jsonb;
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;
  with mine as (
    select m.party_id, m.joined_at, m.show_on_profile, pa.kind
      from public.cam_party_members m
      join public.cam_parties pa on pa.id = m.party_id
     where m.user_id = v_user
  ), st as (
    select s.party_id, s."position", s.member_count, s.points
      from public.cam_party_standings(array(select mi.party_id from mine mi), 'all') s
     where s.user_id = v_user
  ), wk as (
    select s.party_id, s."position"
      from public.cam_party_standings(array(select mi.party_id from mine mi where mi.kind = 'quiniela'), 'week') s
     where s.user_id = v_user
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pa.id, 'name', pa.name, 'kind', pa.kind, 'sport', pa.sport, 'code', pa.code,
           'is_owner', pa.owner_id = v_user, 'member_count', st.member_count,
           'position', st."position", 'points', st.points, 'week_position', wk."position",
           'show_on_profile', mi.show_on_profile, 'joined_at', mi.joined_at)
           order by mi.joined_at desc), '[]'::jsonb)
    into v
    from mine mi
    join public.cam_parties pa on pa.id = mi.party_id
    left join st on st.party_id = pa.id
    left join wk on wk.party_id = pa.id;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clasificación: los de Quiniela traen también «Esta semana» (week).
-- Todo en una sola llamada; cambiar de periodo no vuelve a llamar.
-- ---------------------------------------------------------------------------
create or replace function public.cam_party_ranking(p_party uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_header jsonb := public.cam_party_header(p_party);
  v_owner uuid;
  v_period text;
  v jsonb;
begin
  if v_header is null or not (public.cam_party_is_member(p_party) or public.rcm_is_editor()) then
    raise exception 'Solo los miembros pueden ver este party.' using errcode = '42501';
  end if;
  v_owner := (v_header->>'owner_id')::uuid;
  v := jsonb_build_object('party', v_header);
  foreach v_period in array case when v_header->>'kind' = 'quiniela'
                                 then array['week','month','all'] else array['month','all'] end loop
    v := v || jsonb_build_object(case v_period when 'all' then 'total' else v_period end, (
      select coalesce(jsonb_agg(jsonb_build_object(
               'user_id', s.user_id, 'username', s.username, 'joined_at', s.joined_at,
               'points', s.points, 'correct', s.correct, 'attempts', s.attempts, 'position', s."position",
               'is_owner', s.user_id = v_owner, 'is_me', s.user_id = v_user)
               order by s."position"), '[]'::jsonb)
        from public.cam_party_standings(array[p_party], v_period) s));
  end loop;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actividad: nueva rama de Quiniela. Solo partidos que ya empezaron (nunca se
-- ve una elección antes del cierre) y que empezaron después de entrar.
-- Filtro 'pending' = en juego; 'resolved' = con resultado.
-- ---------------------------------------------------------------------------
create or replace function public.cam_party_activity(p_party uuid, p_filter text default 'all',
  p_member uuid default null, p_before timestamptz default null, p_before_key text default null,
  p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_party public.cam_parties%rowtype;
  v_filter text := coalesce(nullif(p_filter, ''), 'all');
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_now timestamptz := statement_timestamp();
  v_items jsonb;
  v_more boolean;
begin
  select * into v_party from public.cam_parties pa where pa.id = p_party;
  if not found or not (public.cam_party_is_member(p_party) or public.rcm_is_editor()) then
    raise exception 'Solo los miembros pueden ver este party.' using errcode = '42501';
  end if;
  if v_filter not in ('all','pending','resolved') then
    raise exception 'Filtro no válido.' using errcode = '22023';
  end if;

  with mem as (
    select m.user_id, m.joined_at,
           coalesce(nullif(left(a.username, 40), ''),
                    nullif(left(u.raw_user_meta_data->>'username', 40), ''),
                    nullif(left(u.raw_user_meta_data->>'display_name', 40), ''),
                    'Aficionado')::text as username
      from public.cam_party_members m
      left join auth.users u on u.id = m.user_id
      left join public.ae_auth_accounts a on a.user_id = m.user_id
     where m.party_id = p_party and (p_member is null or m.user_id = p_member)
  ), items as (
    -- Picks públicos (los mismos que muestra la web: visibles, sin rechazar).
    select p.created_at as at, p.id::text as key, p.user_id, p.outcome <> 'pending' as resolved,
           jsonb_build_object(
             'type', 'pick', 'id', p.id, 'key', p.id::text, 'user_id', p.user_id, 'username', mem.username,
             'title', p.title, 'legs', (select coalesce(jsonb_agg(l.value order by l.ordinality), '[]'::jsonb)
                                         from jsonb_array_elements(case when jsonb_typeof(p.legs) = 'array'
                                              then p.legs else '[]'::jsonb end) with ordinality l
                                        where l.ordinality <= 4),
             'legs_count', case when jsonb_typeof(p.legs) = 'array' then jsonb_array_length(p.legs) else 0 end,
             'american_odds', p.american_odds, 'state', p.outcome,
             'points', case when p.outcome <> 'pending' then p.result_points end,
             'moderation_status', p.moderation_status,
             'created_at', p.created_at, 'settled_at', p.settled_at) as data
      from public.ae_community_picks p
      join mem on mem.user_id = p.user_id
     where v_party.kind = 'picks'
       and not p.hidden and p.moderation_status in ('pending','approved')
       and p.created_at >= mem.joined_at
       and (v_party.sport = 'all' or v_party.sport = public.cam_pick_sport(p.legs))
    union all
    -- Takes públicos (no ocultos) con su resultado si ya se puntuaron.
    select t.created_at, t.id::text, t.user_id, r.take_id is not null,
           jsonb_build_object(
             'type', 'take', 'id', t.id, 'key', t.id::text, 'user_id', t.user_id, 'username', mem.username,
             'title', t.title, 'body', left(t.body, 400), 'sport', t.sport, 'competition', t.competition,
             'state', coalesce(r.outcome, 'pending'), 'points', r.points, 'scored_at', r.scored_at,
             'created_at', t.created_at,
             'upvotes', (select count(*) from public.ae_free_take_votes v where v.take_id = t.id and v.value = 1),
             'downvotes', (select count(*) from public.ae_free_take_votes v where v.take_id = t.id and v.value = -1),
             'my_vote', (select v.value from public.ae_free_take_votes v where v.take_id = t.id and v.user_id = v_user))
      from public.ae_free_takes t
      join mem on mem.user_id = t.user_id
      left join public.ae_take_results r on r.take_id = t.id
     where v_party.kind = 'takes'
       and not t.hidden
       and t.created_at >= mem.joined_at
       and (v_party.sport = 'all'
            or (v_party.sport = 'nfl' and t.sport = 'nfl')
            or (v_party.sport = 'football' and t.sport in ('football','laliga','premier','ligamx','champions')))
    union all
    -- «¿Quién será campeón?»: también es un Take (ya se ve en los perfiles públicos).
    select p.created_at, q.id::text || ':' || p.user_id::text, p.user_id,
           q.status = 'settled' and q.settled_at is not null,
           jsonb_build_object(
             'type', 'champion', 'id', q.id, 'key', q.id::text || ':' || p.user_id::text,
             'user_id', p.user_id, 'username', mem.username,
             'title', 'Campeón · ' || o.label, 'body', q.prompt, 'competition', q.competition,
             'state', case when q.status = 'settled' and q.settled_at is not null
                           then case when coalesce(p.awarded_points, 0) > 0 then 'won' else 'lost' end
                           else 'pending' end,
             'points', case when q.status = 'settled' and q.settled_at is not null
                            then coalesce(p.awarded_points, 0)
                            else coalesce(o.points, q.points) end,
             'created_at', p.created_at, 'settled_at', q.settled_at) as data
      from public.ae_take_predictions p
      join mem on mem.user_id = p.user_id
      join public.ae_take_questions q on q.id = p.question_id
      join public.ae_take_options o on o.id = p.option_id
     where v_party.kind = 'takes'
       and q.period = 'season' and q.status <> 'void'
       and p.created_at >= mem.joined_at
       and (v_party.sport = 'all'
            or (v_party.sport = 'nfl' and q.competition = 'nfl')
            or (v_party.sport = 'football' and q.competition in ('laliga','premier','ligamx','champions')))
    union all
    -- Quiniela NFL: solo partidos que ya empezaron.
    select g.kickoff, 'nfl:' || g.id || ':' || p.user_id::text, p.user_id,
           (g.status = 'final' and g.winner_id is not null) or g.status in ('tie','cancelled'),
           jsonb_build_object(
             'type', 'quiniela', 'id', g.id, 'key', 'nfl:' || g.id || ':' || p.user_id::text,
             'user_id', p.user_id, 'username', mem.username, 'sport', 'nfl', 'competition', 'nfl',
             'home_name', th.name, 'away_name', ta.name,
             'pick', case when p.team_id = g.home_id then 'home' else 'away' end,
             'pick_label', case when p.team_id = g.home_id then th.name else ta.name end,
             'status', g.status, 'home_score', g.home_score, 'away_score', g.away_score,
             'state', case when g.status = 'final' and g.winner_id is not null
                           then case when p.team_id = g.winner_id then 'won' else 'lost' end
                           when g.status in ('tie','cancelled') then 'void'
                           else 'pending' end,
             'points', case when g.status = 'final' and g.winner_id is not null then p.awarded_points
                            when g.status in ('tie','cancelled') then 0
                            when p.team_id = g.home_id then g.points_home
                            else g.points_away end,
             'created_at', g.kickoff, 'kickoff', g.kickoff) as data
      from public.cam_nfl_picks p
      join mem on mem.user_id = p.user_id
      join public.cam_nfl_games g on g.id = p.game_id
      left join public.nfl_teams th on th.id = g.home_id
      left join public.nfl_teams ta on ta.id = g.away_id
     where v_party.kind = 'quiniela' and v_party.sport in ('all','nfl')
       and g.kickoff <= v_now
       and g.kickoff >= mem.joined_at
    union all
    -- Quiniela de Fútbol (1X2): solo partidos que ya empezaron.
    select g.kickoff, 'football:' || g.id || ':' || p.user_id::text, p.user_id,
           (g.status = 'final' and g.outcome is not null) or g.status = 'cancelled',
           jsonb_build_object(
             'type', 'quiniela', 'id', g.id, 'key', 'football:' || g.id || ':' || p.user_id::text,
             'user_id', p.user_id, 'username', mem.username, 'sport', 'football', 'competition', g.competition,
             'home_name', coalesce(th.short_name, th.name), 'away_name', coalesce(ta.short_name, ta.name),
             'pick', p.pick,
             'pick_label', case p.pick when 'home' then coalesce(th.short_name, th.name)
                                       when 'away' then coalesce(ta.short_name, ta.name)
                                       else 'Empate' end,
             'status', g.status, 'home_score', g.home_score, 'away_score', g.away_score,
             'state', case when g.status = 'final' and g.outcome is not null
                           then case when p.pick = g.outcome then 'won' else 'lost' end
                           when g.status = 'cancelled' then 'void'
                           else 'pending' end,
             'points', case when g.status = 'final' and g.outcome is not null then p.awarded_points
                            when g.status = 'cancelled' then 0
                            else case p.pick when 'home' then g.points_home
                                             when 'draw' then g.points_draw
                                             else g.points_away end end,
             'created_at', g.kickoff, 'kickoff', g.kickoff) as data
      from public.cam_football_picks p
      join mem on mem.user_id = p.user_id
      join public.cam_football_games g on g.id = p.game_id
      left join public.cam_football_teams th on th.id = g.home_id
      left join public.cam_football_teams ta on ta.id = g.away_id
     where v_party.kind = 'quiniela' and v_party.sport in ('all','football')
       and g.kickoff <= v_now
       and g.kickoff >= mem.joined_at
  ), page as (
    select i.*, row_number() over (order by i.at desc, i.key desc) as rn
      from items i
     where (v_filter = 'all' or (v_filter = 'resolved') = i.resolved)
       and (p_before is null or (i.at, i.key) < (p_before, coalesce(p_before_key, '')))
     order by i.at desc, i.key desc
     limit v_limit + 1
  )
  select coalesce(jsonb_agg(pg.data order by pg.rn) filter (where pg.rn <= v_limit), '[]'::jsonb),
         count(*) > v_limit
    into v_items, v_more
    from page pg;

  return jsonb_build_object('items', v_items, 'more', coalesce(v_more, false));
end;
$$;

-- Las funciones internas no se pueden llamar desde la web.
revoke all on function public.cam_quiniela_week_games() from public, anon, authenticated;
revoke all on function public.cam_quiniela_score_rows(text) from public, anon, authenticated;
