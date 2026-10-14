-- SOLO LECTURA; ejecutar como propietario tras 07 y 08.
begin read only;
select season,count(*) clubs,count(*) filter(where participating) active from public.champions_clubs group by season;
select id,season,edition,cardinality(team_ids) positions,published_at from public.champions_rankings order by published_at desc;
select e.id,e.edition,e.starts_at,e.closes_at,count(p.id) options from public.pick_editions e left join public.sports_picks p on p.edition_id=e.id group by e.id order by e.starts_at desc;
select edition_id,user_id,count(*) from public.pick_votes group by edition_id,user_id having count(*)>1;
select id,outcome,featured_order from public.sports_picks where featured_order is not null and outcome<>'won';
select * from public.rcm_pick_performance;
select 'articles' tabla,count(*) registros from public.articles union all select 'comments',count(*) from public.comments union all select 'comment_votes',count(*) from public.comment_votes union all select 'article_likes',count(*) from public.article_likes union all select 'editors',count(*) from public.editors;
select id,edition,team_ids,updated_at from public.nfl_rankings;
commit;
