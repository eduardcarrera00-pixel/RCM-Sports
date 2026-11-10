-- La liguilla solo mira sus propias fechas (45 días desde el primer saque; la final
-- de diciembre con Toluca cabe de sobra). Así los partidos del Clausura, que ESPN
-- cuenta en la misma temporada, nunca se enlazan ni disparan recálculos.
create or replace function cam_football_private.link_games(p_liguilla bigint)
returns integer language plpgsql set search_path = '' as $$
declare l public.cam_liguilla%rowtype; n1 integer; n2 integer;
begin
 select * into l from public.cam_liguilla where id = p_liguilla;
 update public.cam_liguilla_series s set leg1_id = (
   select g.id from public.cam_football_games g
   where g.competition = l.competition and g.season = l.season
     and g.kickoff >= l.starts_at - interval '2 hours' and g.kickoff < l.starts_at + interval '45 days'
     and g.home_id = s.low_id and g.away_id = s.high_id and g.status <> 'cancelled'
     and not exists (select 1 from public.cam_liguilla_series o where o.leg1_id = g.id or o.leg2_id = g.id)
   order by g.kickoff limit 1)
 where s.liguilla_id = p_liguilla and s.leg1_id is null;
 get diagnostics n1 = row_count;
 update public.cam_liguilla_series s set leg2_id = (
   select g.id from public.cam_football_games g
   where g.competition = l.competition and g.season = l.season
     and g.kickoff >= l.starts_at - interval '2 hours' and g.kickoff < l.starts_at + interval '45 days'
     and g.home_id = s.high_id and g.away_id = s.low_id and g.status <> 'cancelled'
     and not exists (select 1 from public.cam_liguilla_series o where o.leg1_id = g.id or o.leg2_id = g.id)
   order by g.kickoff limit 1)
 where s.liguilla_id = p_liguilla and s.leg2_id is null;
 get diagnostics n2 = row_count;
 return n1 + n2;
end $$;

create or replace function cam_football_private.on_game()
returns trigger language plpgsql security definer set search_path = '' as $$
declare l_id bigint;
begin
 if new.competition <> 'ligamx' then return new; end if;
 select l.id into l_id from public.cam_liguilla l
 where l.competition = new.competition and l.season = new.season
   and new.kickoff >= l.starts_at - interval '2 hours' and new.kickoff < l.starts_at + interval '45 days'
 order by l.starts_at desc limit 1;
 if l_id is null then return new; end if;
 if tg_op = 'UPDATE' and (new.home_id, new.away_id, new.kickoff, new.status, new.home_score, new.away_score,
     new.probability_home, new.odds_source) is not distinct from (old.home_id, old.away_id, old.kickoff, old.status,
     old.home_score, old.away_score, old.probability_home, old.odds_source) then return new; end if;
 perform cam_football_private.refresh(l_id);
 return new;
end $$;
revoke all on function cam_football_private.link_games(bigint), cam_football_private.on_game() from public, anon, authenticated;
