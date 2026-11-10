-- ESPN publica rank, partidos, puntos y diferencia como números con decimales ("1.0").
create or replace function public.cam_liguilla_admin_table()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare response extensions.http_response; j jsonb;
begin
 if auth.uid() is null or not public.rcm_is_editor() then raise exception 'Solo administradores'; end if;
 response := extensions.http_get('https://site.api.espn.com/apis/v2/sports/soccer/mex.1/standings');
 if response.status <> 200 then raise exception 'ESPN no respondió (HTTP %)', response.status; end if;
 j := response.content::jsonb;
 return (
   select coalesce(jsonb_agg(item order by (item->>'rank')::integer nulls last), '[]'::jsonb) from (
     select jsonb_build_object('team_id', e->'team'->>'id', 'name', e->'team'->>'displayName',
       'rank', round((st->>'rank')::numeric)::integer,
       'played', round((st->>'gamesPlayed')::numeric)::integer,
       'points', round((st->>'points')::numeric)::integer,
       'goal_diff', round((st->>'pointDifferential')::numeric)::integer) item
     from jsonb_array_elements(j->'children'->0->'standings'->'entries') e
     cross join lateral (select jsonb_object_agg(s->>'name', s->'value') st from jsonb_array_elements(e->'stats') s) x
   ) q);
end $$;
revoke all on function public.cam_liguilla_admin_table() from public, anon, authenticated;
grant execute on function public.cam_liguilla_admin_table() to authenticated;
