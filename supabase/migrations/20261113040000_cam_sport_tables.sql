-- CAM SPORTS | Clasificación y mejores anotadores en «El marcador» (13 nov 2026).
-- NFL (por divisiones, con el puesto de playoff) y las cuatro ligas de Fútbol
-- (LaLiga, Premier, Liga MX y Champions): tabla y goleadores de ESPN.
-- Una tarea programada lee ESPN como mucho una vez por hora y guarda una copia
-- compacta; la web solo lee esa copia (una llamada por competición y visita).
-- Si ESPN falla o cambia de formato, se sigue enseñando la última copia buena.
-- Nunca se inventan equipos, puntos ni goles.

create schema if not exists cam_sport_tables_private;
revoke all on schema cam_sport_tables_private from public, anon, authenticated;

create table if not exists public.cam_sport_tables (
 competition text primary key check (competition in ('nfl', 'laliga', 'premier', 'ligamx', 'champions')),
 standings jsonb,
 standings_at timestamptz,
 leaders jsonb,
 leaders_at timestamptz,
 checked_at timestamptz not null default now()
);
alter table public.cam_sport_tables enable row level security;
revoke all on public.cam_sport_tables from public, anon, authenticated;
-- Se lee solo con public.cam_sport_tables_get().

-- ---------------------------------------------------------------- ESPN
create or replace function cam_sport_tables_private.fetch_json(p_url text)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare response extensions.http_response;
begin
 perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '10000');
 response := extensions.http_get(p_url);
 if response.status <> 200 then return null; end if;
 return response.content::jsonb;
exception when others then
 return null;
end $$;

-- Valor numérico de una estadística de ESPN ("12.0", 12, "-3"); null si no lo es.
create or replace function cam_sport_tables_private.num(p jsonb)
returns numeric language sql immutable set search_path = '' as $$
 select case when jsonb_typeof(p) = 'number' then (p #>> '{}')::numeric
             when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then (p #>> '{}')::numeric
        end;
$$;

-- ESPN escribe WSH; el catálogo de la web usa WAS.
create or replace function cam_sport_tables_private.nfl_id(p text)
returns text language sql immutable set search_path = '' as $$
 select case upper(p) when 'WSH' then 'WAS' else upper(p) end;
$$;

-- Fútbol · tabla: {season, group, rows:[{rank, team_id, abbr, name, logo, played, won, draw, lost, gd, pts, note}]}
create or replace function cam_sport_tables_private.soccer_standings(j jsonb)
returns jsonb language sql immutable set search_path = '' as $$
 with node as (select j->'children'->0 c),
 rows as (
   select jsonb_build_object(
     'rank', round(cam_sport_tables_private.num(st->'rank')),
     'team_id', e->'team'->>'id',
     'abbr', e->'team'->>'abbreviation',
     'name', coalesce(e->'team'->>'shortDisplayName', e->'team'->>'displayName'),
     'logo', case when e->'team'->'logos'->0->>'href' like 'https://%' then e->'team'->'logos'->0->>'href' end,
     'played', round(cam_sport_tables_private.num(st->'gamesPlayed')),
     'won', round(cam_sport_tables_private.num(st->'wins')),
     'draw', round(cam_sport_tables_private.num(st->'ties')),
     'lost', round(cam_sport_tables_private.num(st->'losses')),
     'gd', round(cam_sport_tables_private.num(st->'pointDifferential')),
     'pts', round(cam_sport_tables_private.num(st->'points')),
     'note', e->'note'->>'description') r,
     cam_sport_tables_private.num(st->'rank') o
   from node, jsonb_array_elements(case when jsonb_typeof(node.c->'standings'->'entries') = 'array'
                                        then node.c->'standings'->'entries' else '[]'::jsonb end) e
   cross join lateral (select jsonb_object_agg(s->>'name', s->'value') st from jsonb_array_elements(e->'stats') s) x
   where e->'team'->>'id' is not null and cam_sport_tables_private.num(st->'rank') is not null
     and cam_sport_tables_private.num(st->'points') is not null
 )
 select case when (select count(*) from rows) >= 4 then jsonb_build_object(
   'season', (select c->'standings'->>'seasonDisplayName' from node),
   'group', (select c->>'name' from node),
   'rows', (select jsonb_agg(r order by o) from rows)) end;
$$;

-- Fútbol · goleadores: [{name, team_id, team, goals, apps}] (los 15 primeros de ESPN)
create or replace function cam_sport_tables_private.soccer_leaders(j jsonb)
returns jsonb language sql immutable set search_path = '' as $$
 with list as (
   select x->'leaders' l from jsonb_array_elements(case when jsonb_typeof(j->'stats') = 'array' then j->'stats' else '[]'::jsonb end) x
   where x->>'name' = 'goalsLeaders' limit 1
 ),
 rows as (
   select jsonb_build_object(
     'name', a->'athlete'->>'displayName',
     'team_id', a->'athlete'->'team'->>'id',
     'team', a->'athlete'->'team'->>'name',
     'goals', round(cam_sport_tables_private.num(a->'value')),
     'apps', (select round(cam_sport_tables_private.num(s->'value')) from jsonb_array_elements(
               case when jsonb_typeof(a->'athlete'->'statistics') = 'array' then a->'athlete'->'statistics' else '[]'::jsonb end) s
             where s->>'name' = 'appearances' limit 1)) r, o
   from list, jsonb_array_elements(case when jsonb_typeof(list.l) = 'array' then list.l else '[]'::jsonb end) with ordinality t(a, o)
   where o <= 15 and a->'athlete'->>'displayName' is not null and cam_sport_tables_private.num(a->'value') is not null
 )
 select case when (select count(*) from rows) > 0 then (select jsonb_agg(r order by o) from rows) end;
$$;

-- NFL · tabla: {conferences:[{name:'AFC', divisions:[{name:'AFC East', teams:[{id, w, l, t, seed, diff}]}]}]}
create or replace function cam_sport_tables_private.nfl_standings(j jsonb)
returns jsonb language sql immutable set search_path = '' as $$
 with teams as (
   select c.ord conf_ord, c.v->>'abbreviation' conf, d.ord div_ord, d.v->>'name' division,
     jsonb_build_object(
       'id', cam_sport_tables_private.nfl_id(e->'team'->>'abbreviation'),
       'w', round(cam_sport_tables_private.num(st->'wins')),
       'l', round(cam_sport_tables_private.num(st->'losses')),
       't', coalesce(round(cam_sport_tables_private.num(st->'ties')), 0),
       'seed', round(cam_sport_tables_private.num(st->'playoffSeed')),
       'diff', round(cam_sport_tables_private.num(st->'differential'))) team,
     cam_sport_tables_private.num(st->'playoffSeed') seed,
     cam_sport_tables_private.num(st->'winPercent') pct
   from jsonb_array_elements(case when jsonb_typeof(j->'children') = 'array' then j->'children' else '[]'::jsonb end) with ordinality c(v, ord)
   cross join lateral jsonb_array_elements(case when jsonb_typeof(c.v->'children') = 'array' then c.v->'children' else '[]'::jsonb end) with ordinality d(v, ord)
   cross join lateral jsonb_array_elements(case when jsonb_typeof(d.v->'standings'->'entries') = 'array' then d.v->'standings'->'entries' else '[]'::jsonb end) e
   cross join lateral (select jsonb_object_agg(s->>'name', s->'value') st from jsonb_array_elements(e->'stats') s) x
   where e->'team'->>'abbreviation' is not null and cam_sport_tables_private.num(st->'wins') is not null
     and cam_sport_tables_private.num(st->'losses') is not null
 ),
 divisions as (
   select conf_ord, conf, div_ord, jsonb_build_object('name', division,
     'teams', jsonb_agg(team order by seed nulls last, pct desc nulls last)) div
   from teams group by conf_ord, conf, div_ord, division
 ),
 conferences as (
   select conf_ord, jsonb_build_object('name', conf, 'divisions', jsonb_agg(div order by div_ord)) c
   from divisions group by conf_ord, conf
 )
 select case when (select count(*) from teams) >= 28 and (select count(*) from conferences) = 2
   then jsonb_build_object('conferences', (select jsonb_agg(c order by conf_ord) from conferences)) end;
$$;

-- NFL · anotadores (touchdowns): [{name, team, pos, rush, rec, ret, td}] (los 15 primeros de ESPN)
create or replace function cam_sport_tables_private.nfl_leaders(j jsonb)
returns jsonb language sql immutable set search_path = '' as $$
 with names as (
   select c->'names' n from jsonb_array_elements(case when jsonb_typeof(j->'categories') = 'array' then j->'categories' else '[]'::jsonb end) c
   where c->>'name' = 'scoring' limit 1
 ),
 idx as (
   select (select i - 1 from names, jsonb_array_elements_text(names.n) with ordinality y(v, i) where v = 'rushingTouchdowns') rush,
          (select i - 1 from names, jsonb_array_elements_text(names.n) with ordinality y(v, i) where v = 'receivingTouchdowns') rec,
          (select i - 1 from names, jsonb_array_elements_text(names.n) with ordinality y(v, i) where v = 'returnTouchdowns') ret,
          (select i - 1 from names, jsonb_array_elements_text(names.n) with ordinality y(v, i) where v = 'totalTouchdowns') td
 ),
 rows as (
   select jsonb_build_object(
     'name', a->'athlete'->>'displayName',
     'team', cam_sport_tables_private.nfl_id(a->'athlete'->>'teamShortName'),
     'pos', a->'athlete'->'position'->>'abbreviation',
     'rush', coalesce(round(cam_sport_tables_private.num(sc->'values'->(idx.rush::int))), 0),
     'rec', coalesce(round(cam_sport_tables_private.num(sc->'values'->(idx.rec::int))), 0),
     'ret', coalesce(round(cam_sport_tables_private.num(sc->'values'->(idx.ret::int))), 0),
     'td', round(cam_sport_tables_private.num(sc->'values'->(idx.td::int)))) r, o
   from idx,
     jsonb_array_elements(case when jsonb_typeof(j->'athletes') = 'array' then j->'athletes' else '[]'::jsonb end) with ordinality t(a, o)
   cross join lateral (select c sc from jsonb_array_elements(a->'categories') c where c->>'name' = 'scoring' limit 1) s
   where o <= 15 and idx.td is not null and a->'athlete'->>'displayName' is not null
     and cam_sport_tables_private.num(sc->'values'->(idx.td::int)) is not null
 )
 select case when (select count(*) from rows) > 0 then (select jsonb_agg(r order by o) from rows) end;
$$;

-- ---------------------------------------------------------------- Actualizar
create or replace function cam_sport_tables_private.refresh(p_competition text, p_force boolean default false)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare slug text; s jsonb; l jsonb;
begin
 if p_competition not in ('nfl', 'laliga', 'premier', 'ligamx', 'champions') then return false; end if;
 -- Una sola lectura a la vez por competición y como mucho una por hora.
 if not pg_try_advisory_xact_lock(hashtext('cam-sport-tables:' || p_competition)) then return false; end if;
 if not coalesce(p_force, false) and exists (select 1 from public.cam_sport_tables t
     where t.competition = p_competition and t.checked_at > now() - interval '50 minutes') then return false; end if;
 if p_competition = 'nfl' then
   begin
     s := cam_sport_tables_private.nfl_standings(cam_sport_tables_private.fetch_json(
       'https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3'));
   exception when others then s := null; end;
   begin
     l := cam_sport_tables_private.nfl_leaders(cam_sport_tables_private.fetch_json(
       'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete?category=scoring&sort=scoring.totalTouchdowns:desc&limit=15'));
   exception when others then l := null; end;
 else
   slug := case p_competition when 'laliga' then 'esp.1' when 'premier' then 'eng.1'
                              when 'ligamx' then 'mex.1' when 'champions' then 'uefa.champions' end;
   begin
     s := cam_sport_tables_private.soccer_standings(cam_sport_tables_private.fetch_json(
       'https://site.api.espn.com/apis/v2/sports/soccer/' || slug || '/standings'));
   exception when others then s := null; end;
   begin
     l := cam_sport_tables_private.soccer_leaders(cam_sport_tables_private.fetch_json(
       'https://site.api.espn.com/apis/site/v2/sports/soccer/' || slug || '/statistics'));
   exception when others then l := null; end;
 end if;
 insert into public.cam_sport_tables as t (competition, standings, standings_at, leaders, leaders_at, checked_at)
 values (p_competition, s, case when s is not null then now() end, l, case when l is not null then now() end, now())
 on conflict (competition) do update set
   standings = coalesce(excluded.standings, t.standings),
   standings_at = coalesce(excluded.standings_at, t.standings_at),
   leaders = coalesce(excluded.leaders, t.leaders),
   leaders_at = coalesce(excluded.leaders_at, t.leaders_at),
   checked_at = excluded.checked_at;
 return s is not null or l is not null;
end $$;

create or replace function cam_sport_tables_private.refresh_all()
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare c text; n integer := 0;
begin
 foreach c in array array['nfl', 'ligamx', 'champions', 'laliga', 'premier'] loop
   if cam_sport_tables_private.refresh(c) then n := n + 1; end if;
 end loop;
 return n;
end $$;

revoke all on all functions in schema cam_sport_tables_private from public, anon, authenticated;

-- ---------------------------------------------------------------- Lectura pública
create or replace function public.cam_sport_tables_get(p_competition text)
returns jsonb language sql stable security definer set search_path = '' as $$
 select jsonb_build_object('competition', t.competition,
   'standings', t.standings, 'standings_at', t.standings_at,
   'leaders', t.leaders, 'leaders_at', t.leaders_at)
 from public.cam_sport_tables t where t.competition = p_competition;
$$;
revoke all on function public.cam_sport_tables_get(text) from public;
grant execute on function public.cam_sport_tables_get(text) to anon, authenticated;

-- Cada hora (minuto 41, lejos de las otras tareas). Sin red en la petición del visitante.
select cron.unschedule(jobid) from cron.job where jobname = 'cam-sport-tables-hourly';
select cron.schedule('cam-sport-tables-hourly', '41 * * * *', 'select cam_sport_tables_private.refresh_all()');
