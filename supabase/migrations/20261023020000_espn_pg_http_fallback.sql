-- Fetch official ESPN scores from Postgres when Edge egress is blocked.
-- Only service_role can call; URL host is constant, inputs are validated.
create extension if not exists http with schema extensions;

create or replace function public.ae_pick_scoreboard_proxy(p_path text, p_date text)
returns jsonb
language plpgsql security invoker set search_path='' as $$
declare response extensions.http_response;
begin
  if p_path is null or p_path !~ '^(soccer/[a-z0-9._-]+|football/(nfl|college-football)|basketball/(nba|wnba|mens-college-basketball)|baseball/mlb|hockey/nhl)$'
    or p_date is null or p_date !~ '^[0-9]{8}$' then
    raise exception 'Invalid scoreboard request';
  end if;
  response := extensions.http_get('https://site.api.espn.com/apis/site/v2/sports/' || p_path || '/scoreboard?dates=' || p_date || '&limit=300');
  if response.status <> 200 then return null; end if;
  return response.content::jsonb;
end $$;
revoke all on function public.ae_pick_scoreboard_proxy(text,text) from public,anon,authenticated;
grant execute on function public.ae_pick_scoreboard_proxy(text,text) to service_role;
