-- CAM SPORTS | «Arma tu cuadro» antes de la liguilla: cada aficionado elige a los
-- 8 equipos que cree que clasificarán. Se cierra al empezar la última jornada
-- (hora del servidor). Cuando el administrador abre la liguilla, el mismo recuadro
-- pasa a ser el cuadro con puntos (cam_liguilla_picks) con los 8 reales.
-- La tabla de la Liga MX se guarda aquí: como mucho una lectura de ESPN por hora y
-- solo cuando alguien abre Liga MX. Sin temporizadores ni cron nuevos.
-- «Mi liguilla» sale en el perfil (cam_profile_overview → 'liguilla').

create table if not exists public.cam_liguilla_standings (
 season integer not null check (season between 2020 and 2100),
 team_id text not null references public.cam_football_teams(id),
 rank smallint not null check (rank between 1 and 40),
 played smallint not null check (played between 0 and 60),
 points smallint not null check (points between 0 and 180),
 goal_diff smallint not null check (goal_diff between -150 and 150),
 fetched_at timestamptz not null default now(),
 primary key (season, team_id)
);

-- Una ventana por torneo (Apertura, Clausura): ESPN numera los dos con la misma temporada.
create table if not exists public.cam_liguilla_qualifier_window (
 id bigint generated always as identity primary key,
 competition text not null default 'ligamx' check (competition = 'ligamx'),
 season integer not null check (season between 2020 and 2100),
 name text not null check (length(name) between 3 and 60),
 closes_at timestamptz not null,
 unique (season, name)
);

create table if not exists public.cam_liguilla_qualifier_picks (
 window_id bigint not null references public.cam_liguilla_qualifier_window(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 team_ids text[] not null check (cardinality(team_ids) = 8),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (window_id, user_id)
);
create index if not exists cam_liguilla_qualifier_picks_user_idx on public.cam_liguilla_qualifier_picks(user_id);

alter table public.cam_liguilla_standings enable row level security;
alter table public.cam_liguilla_qualifier_window enable row level security;
alter table public.cam_liguilla_qualifier_picks enable row level security;
revoke all on public.cam_liguilla_standings, public.cam_liguilla_qualifier_window, public.cam_liguilla_qualifier_picks
 from public, anon, authenticated;
grant select on public.cam_liguilla_qualifier_picks to authenticated;
create policy cam_liguilla_qualifier_picks_own on public.cam_liguilla_qualifier_picks for select to authenticated
 using (user_id = (select auth.uid()));
-- Tabla y ventana se leen por RPC; las elecciones se escriben por RPC con la hora del servidor.

-- Apertura 2026: la jornada 17 empieza el vie 20 nov a las 19:00 (Ciudad de México),
-- Puebla–San Luis (ESPN 401877054). El administrador puede moverla si cambia el horario.
insert into public.cam_liguilla_qualifier_window(season, name, closes_at)
values (2026, 'Apertura 2026', '2026-11-21 01:00:00+00')
on conflict (season, name) do nothing;

-- El cuadro libre de la comunidad deja de usarse (un solo cuadro): solo lectura y escritura
-- de la propia fila, sin borrar ni vaciar la tabla.
revoke all on public.cam_liguilla_fan_brackets from authenticated;
grant select, insert, update on public.cam_liguilla_fan_brackets to authenticated;

-- ---------------------------------------------------------------- Tabla de ESPN
create or replace function cam_football_private.refresh_standings(p_season integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare response extensions.http_response; j jsonb; n integer := 0;
begin
 -- Una sola lectura a la vez y como mucho una por hora.
 if not pg_try_advisory_xact_lock(hashtext('cam-liguilla-standings')) then return false; end if;
 if exists (select 1 from public.cam_liguilla_standings s where s.season = p_season
            and s.fetched_at > now() - interval '55 minutes') then return false; end if;
 begin
   perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '4000');
   response := extensions.http_get('https://site.api.espn.com/apis/v2/sports/soccer/mex.1/standings');
   if response.status <> 200 then return false; end if;
   j := response.content::jsonb;
   with rows as (
     select e->'team'->>'id' team_id,
       round((st->>'rank')::numeric)::smallint rank_value,
       round((st->>'gamesPlayed')::numeric)::smallint played,
       round((st->>'points')::numeric)::smallint points,
       round((st->>'pointDifferential')::numeric)::smallint goal_diff
     from jsonb_array_elements(j->'children'->0->'standings'->'entries') e
     cross join lateral (select jsonb_object_agg(s->>'name', s->'value') st from jsonb_array_elements(e->'stats') s) x
   )
   insert into public.cam_liguilla_standings(season, team_id, rank, played, points, goal_diff, fetched_at)
   select p_season, r.team_id, r.rank_value, r.played, r.points, r.goal_diff, now()
   from rows r
   where r.rank_value is not null and r.played is not null and r.points is not null and r.goal_diff is not null
     and exists (select 1 from public.cam_football_teams t where t.id = r.team_id)
   on conflict (season, team_id) do update set rank = excluded.rank, played = excluded.played,
     points = excluded.points, goal_diff = excluded.goal_diff, fetched_at = excluded.fetched_at;
   get diagnostics n = row_count;
 exception when others then
   -- ESPN caído o con otro formato: se sigue enseñando la última tabla guardada.
   return false;
 end;
 return n > 0;
end $$;

-- «Clasificado» si menos de 8 rivales pueden alcanzarle; «eliminado» si al menos 8
-- ya tienen más puntos de los que él puede sumar. Con la fase regular terminada
-- manda el puesto de la tabla (desempates incluidos).
create or replace function cam_football_private.standings_status(p_season integer)
returns table(team_id text, rank smallint, played smallint, points smallint, goal_diff smallint, status text)
language sql stable set search_path = '' as $$
 with s as (select * from public.cam_liguilla_standings x where x.season = p_season),
 n as (select greatest(count(*) - 1, 0)::integer total from s),
 m as (select s.*, s.points + 3 * greatest(n.total - s.played, 0) maxp, n.total from s, n),
 done as (select coalesce(bool_and(m.played >= m.total), false) finished from m)
 select a.team_id, a.rank, a.played, a.points, a.goal_diff,
   case when (select finished from done) then case when a.rank <= 8 then 'in' else 'out' end
        when (select count(*) from m b where b.team_id <> a.team_id and b.points > a.maxp) >= 8 then 'out'
        when (select count(*) from m b where b.team_id <> a.team_id and b.maxp >= a.points) < 8 then 'in'
        else 'alive' end
 from m a order by a.rank;
$$;

-- La ventana de «mis 8» que corresponde a una liguilla ya abierta.
create or replace function cam_football_private.window_for(p_liguilla bigint)
returns bigint language sql stable set search_path = '' as $$
 select w.id from public.cam_liguilla l join public.cam_liguilla_qualifier_window w on w.season = l.season
 where l.id = p_liguilla and w.closes_at <= l.starts_at
 order by (w.name = l.name) desc, w.closes_at desc limit 1;
$$;

-- ---------------------------------------------------------------- Lectura pública
create or replace function public.cam_liguilla_candidates(p_season integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare w public.cam_liguilla_qualifier_window%rowtype; me uuid := auth.uid(); fetched timestamptz; opened boolean;
begin
 select * into w from public.cam_liguilla_qualifier_window x where x.season = p_season order by x.closes_at desc limit 1;
 if not found then return null; end if;
 select max(s.fetched_at) into fetched from public.cam_liguilla_standings s where s.season = p_season;
 if fetched is null or fetched < now() - interval '1 hour' then
   perform cam_football_private.refresh_standings(p_season);
   select max(s.fetched_at) into fetched from public.cam_liguilla_standings s where s.season = p_season;
 end if;
 opened := exists (select 1 from public.cam_liguilla l where cam_football_private.window_for(l.id) = w.id);
 return jsonb_build_object(
   'window', jsonb_build_object('id', w.id, 'name', w.name, 'season', w.season, 'closes_at', w.closes_at,
     'open', statement_timestamp() < w.closes_at and not opened, 'opened', opened,
     'server_time', statement_timestamp()),
   'fetched_at', fetched,
   'teams', (select coalesce(jsonb_agg(jsonb_build_object('team_id', s.team_id, 'name', t.name,
       'short_name', t.short_name, 'abbreviation', t.abbreviation, 'logo', t.logo, 'rank', s.rank,
       'played', s.played, 'points', s.points, 'goal_diff', s.goal_diff, 'status', s.status) order by s.rank), '[]'::jsonb)
     from cam_football_private.standings_status(p_season) s join public.cam_football_teams t on t.id = s.team_id),
   'mine', case when me is null then null else
     (select to_jsonb(q.team_ids) from public.cam_liguilla_qualifier_picks q where q.window_id = w.id and q.user_id = me) end,
   'players', (select count(*) from public.cam_liguilla_qualifier_picks q where q.window_id = w.id));
end $$;

create or replace function public.cam_liguilla_save_qualifiers(p_window bigint, p_teams text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); w public.cam_liguilla_qualifier_window%rowtype; bad text; chosen text[];
begin
 if me is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Inicia sesión'; end if;
 select * into w from public.cam_liguilla_qualifier_window where id = p_window;
 if not found then raise exception 'La liguilla no está disponible'; end if;
 if statement_timestamp() >= w.closes_at
    or exists (select 1 from public.cam_liguilla l where cam_football_private.window_for(l.id) = w.id) then
   raise exception 'Ya se cerró: empezó la última jornada'; end if;
 select array_agg(distinct x) into chosen from unnest(coalesce(p_teams, '{}'::text[])) x where x is not null and x <> '';
 if coalesce(cardinality(p_teams), 0) <> 8 or coalesce(cardinality(chosen), 0) <> 8 then
   raise exception 'Elige exactamente 8 equipos distintos'; end if;
 if exists (select 1 from public.cam_liguilla_standings s where s.season = w.season) then
   select string_agg(coalesce(t.short_name, x.id), ', ' order by x.id) into bad
   from unnest(chosen) x(id)
   left join cam_football_private.standings_status(w.season) st on st.team_id = x.id
   left join public.cam_football_teams t on t.id = x.id
   where st.team_id is null or st.status = 'out';
   if bad is not null then raise exception 'Estos equipos ya no pueden clasificar: %', bad; end if;
 elsif exists (select 1 from unnest(chosen) x(id) where not exists (select 1 from public.cam_football_teams t where t.id = x.id)) then
   raise exception 'Equipo desconocido';
 end if;
 insert into public.cam_liguilla_qualifier_picks(window_id, user_id, team_ids) values (w.id, me, p_teams)
 on conflict (window_id, user_id) do update set team_ids = excluded.team_ids, updated_at = now();
 return jsonb_build_object('saved', 8, 'closes_at', w.closes_at);
end $$;

-- ---------------------------------------------------------------- Perfil
-- Lo propio se ve siempre; lo de otros, cuando ya no se puede cambiar.
create or replace function public.cam_liguilla_profile(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare own boolean := auth.uid() is not null and auth.uid() = p_user;
 w public.cam_liguilla_qualifier_window%rowtype; l public.cam_liguilla%rowtype; has_l boolean := false;
 q text[]; teams jsonb; bracket jsonb; qopen boolean; hits integer; wid bigint;
begin
 select * into l from public.cam_liguilla order by starts_at desc limit 1;
 has_l := found;
 select * into w from public.cam_liguilla_qualifier_window order by closes_at desc limit 1;
 -- Un torneo nuevo recogiendo «mis 8» manda sobre la liguilla anterior.
 if w.id is not null and has_l and w.closes_at > l.starts_at then has_l := false; end if;
 if has_l then
   wid := cam_football_private.window_for(l.id);
   select * into w from public.cam_liguilla_qualifier_window where id = wid;
 end if;
 if w.id is null and not has_l then return null; end if;
 if w.id is not null then
   select x.team_ids into q from public.cam_liguilla_qualifier_picks x where x.window_id = w.id and x.user_id = p_user;
 end if;
 qopen := w.id is not null and not has_l and statement_timestamp() < w.closes_at;
 if q is not null and (own or not qopen) then
   select jsonb_agg(jsonb_build_object('team_id', x.id, 'name', t.name, 'short_name', t.short_name,
       'abbreviation', t.abbreviation, 'logo', t.logo,
       'status', case when has_l then case when s.team_id is not null then 'in' else 'out' end
                      else coalesce(st.status, 'alive') end) order by x.ord)
     into teams
   from unnest(q) with ordinality x(id, ord)
   left join public.cam_football_teams t on t.id = x.id
   left join public.cam_liguilla_seeds s on has_l and s.liguilla_id = l.id and s.team_id = x.id
   left join cam_football_private.standings_status(w.season) st on not has_l and st.team_id = x.id;
   select count(*) filter (where e->>'status' = 'in') into hits from jsonb_array_elements(teams) e;
 end if;
 if has_l and (own or statement_timestamp() >= l.closes_at)
    and exists (select 1 from public.cam_liguilla_picks p where p.liguilla_id = l.id and p.user_id = p_user) then
   select jsonb_build_object(
     'champion', (select jsonb_build_object('team_id', p.team_id, 'name', t.name, 'short_name', t.short_name,
         'logo', t.logo, 'points', p.points, 'awarded', p.awarded_points, 'settled', p.settled_at is not null)
       from public.cam_liguilla_picks p join public.cam_football_teams t on t.id = p.team_id
       where p.liguilla_id = l.id and p.user_id = p_user and p.stage = 'champion'),
     'finalists', (select coalesce(jsonb_agg(jsonb_build_object('team_id', p.team_id, 'short_name', t.short_name,
         'awarded', p.awarded_points, 'settled', p.settled_at is not null) order by p.slot), '[]'::jsonb)
       from public.cam_liguilla_picks p join public.cam_football_teams t on t.id = p.team_id
       where p.liguilla_id = l.id and p.user_id = p_user and p.stage = 'final'),
     'semis', (select coalesce(jsonb_agg(jsonb_build_object('team_id', p.team_id, 'short_name', t.short_name,
         'awarded', p.awarded_points, 'settled', p.settled_at is not null) order by p.slot), '[]'::jsonb)
       from public.cam_liguilla_picks p join public.cam_football_teams t on t.id = p.team_id
       where p.liguilla_id = l.id and p.user_id = p_user and p.stage = 'semis'),
     'picks', (select count(*) from public.cam_liguilla_picks p where p.liguilla_id = l.id and p.user_id = p_user),
     'points', (select coalesce(sum(p.awarded_points), 0) from public.cam_liguilla_picks p where p.liguilla_id = l.id and p.user_id = p_user),
     'alive', (select coalesce(sum(p.points) filter (where p.settled_at is null), 0) from public.cam_liguilla_picks p where p.liguilla_id = l.id and p.user_id = p_user),
     'hits', (select count(*) filter (where p.awarded_points > 0) from public.cam_liguilla_picks p where p.liguilla_id = l.id and p.user_id = p_user))
   into bracket;
 end if;
 if teams is null and bracket is null and not (own and (qopen or (has_l and statement_timestamp() < l.closes_at))) then
   return null; end if;
 return jsonb_build_object(
   'name', case when has_l then l.name else w.name end,
   'season', case when has_l then l.season else w.season end,
   'own', own,
   'phase', case when has_l then case when statement_timestamp() < l.closes_at then 'bracket_open' else 'bracket' end
                 when qopen then 'qualifiers_open' else 'qualifiers_closed' end,
   'closes_at', case when has_l then l.closes_at else w.closes_at end,
   'qualifiers', case when teams is null then null else jsonb_build_object('teams', teams, 'hits', hits, 'decided', has_l) end,
   'bracket', bracket);
end $$;

-- El resumen del perfil lleva también «Mi liguilla» (sin otra llamada desde la web).
do $do$
declare d text := pg_get_functiondef('public.cam_profile_overview(uuid)'::regprocedure);
begin
 if position('cam_liguilla_profile' in d) > 0 then return; end if;
 d := replace(d, $r$'quiniela', v_quiniela || jsonb_build_object('parties', v_parties));$r$,
   $r$'quiniela', v_quiniela || jsonb_build_object('parties', v_parties),
    'liguilla', public.cam_liguilla_profile(p_user));$r$);
 if position('cam_liguilla_profile' in d) = 0 then raise exception 'No se encontró el final de cam_profile_overview'; end if;
 execute d;
end $do$;

-- El estado de la liguilla lleva «mis 8» para enseñar cuántos acerté.
do $do$
declare d text := pg_get_functiondef('public.cam_liguilla_state(integer)'::regprocedure);
begin
 if position('qualifier_picks' in d) > 0 then return; end if;
 d := replace(d, $r$'mine', case when me is null then null else jsonb_build_object($r$,
   $r$'mine', case when me is null then null else jsonb_build_object(
     'qualifiers', (select to_jsonb(q.team_ids) from public.cam_liguilla_qualifier_picks q
       where q.window_id = cam_football_private.window_for(l.id) and q.user_id = me),$r$);
 if position('qualifier_picks' in d) = 0 then raise exception 'No se encontró «mine» en cam_liguilla_state'; end if;
 execute d;
end $do$;

revoke all on function cam_football_private.refresh_standings(integer), cam_football_private.standings_status(integer),
 cam_football_private.window_for(bigint) from public, anon, authenticated;
revoke all on function public.cam_liguilla_candidates(integer), public.cam_liguilla_save_qualifiers(bigint, text[]),
 public.cam_liguilla_profile(uuid) from public, anon, authenticated;
grant execute on function public.cam_liguilla_candidates(integer), public.cam_liguilla_profile(uuid) to anon, authenticated;
grant execute on function public.cam_liguilla_save_qualifiers(bigint, text[]) to authenticated;
notify pgrst, 'reload schema';
