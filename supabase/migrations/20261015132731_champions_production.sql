begin;
create table public.champions_clubs (
 season text not null, id text not null, name text not null, logo text,
 participating boolean not null default true, primary key(season,id)
);
create table public.champions_rankings (
 id uuid primary key default gen_random_uuid(), season text not null,
 edition text not null check(length(trim(edition))>0), team_ids text[] not null check(cardinality(team_ids)=10),
 published_at timestamptz not null default now()
);
alter table public.champions_clubs enable row level security;
alter table public.champions_rankings enable row level security;
revoke all on public.champions_clubs,public.champions_rankings from public,anon,authenticated;
grant select on public.champions_clubs,public.champions_rankings to anon,authenticated;
grant all on public.champions_clubs,public.champions_rankings to service_role;
create policy champions_clubs_public_read on public.champions_clubs for select to anon,authenticated using(true);
create policy champions_rankings_public_read on public.champions_rankings for select to anon,authenticated using(true);
insert into public.champions_clubs(season,id,name,logo,participating) values
('2026/27','50129','AEK Athens','https://img.uefa.com/imgml/TP/teams/logos/70x70/50129.png',true),
('2026/27','52280','Arsenal','https://img.uefa.com/imgml/TP/teams/logos/70x70/52280.png',true),
('2026/27','52683','Aston Villa','https://img.uefa.com/imgml/TP/teams/logos/70x70/52683.png',true),
('2026/27','50124','Atlético de Madrid','https://img.uefa.com/imgml/TP/teams/logos/70x70/50124.png',true),
('2026/27','52758','Borussia Dortmund','https://img.uefa.com/imgml/TP/teams/logos/70x70/52758.png',true),
('2026/27','50080','Barcelona','https://img.uefa.com/imgml/TP/teams/logos/70x70/50080.png',true),
('2026/27','50037','Bayern München','https://img.uefa.com/imgml/TP/teams/logos/70x70/50037.png',true),
('2026/27','59333','Bodø/Glimt','https://img.uefa.com/imgml/TP/teams/logos/70x70/59333.png',true),
('2026/27','50043','Club Brugge','https://img.uefa.com/imgml/TP/teams/logos/70x70/50043.png',true),
('2026/27','79946','Como','https://img.uefa.com/imgml/TP/teams/logos/70x70/79946.png',true),
('2026/27','52692','Fenerbahçe','https://img.uefa.com/imgml/TP/teams/logos/70x70/52692.png',true),
('2026/27','52749','Feyenoord','https://img.uefa.com/imgml/TP/teams/logos/70x70/52749.png',true),
('2026/27','50067','Galatasaray','https://img.uefa.com/imgml/TP/teams/logos/70x70/50067.png',true),
('2026/27','50138','Inter','https://img.uefa.com/imgml/TP/teams/logos/70x70/50138.png',true),
('2026/27','63405','LASK','https://img.uefa.com/imgml/TP/teams/logos/70x70/63405.png',true),
('2026/27','2603790','Leipzig','https://img.uefa.com/imgml/TP/teams/logos/70x70/2603790.png',true),
('2026/27','52277','Lens','https://img.uefa.com/imgml/TP/teams/logos/70x70/52277.png',true),
('2026/27','75797','Lille','https://img.uefa.com/imgml/TP/teams/logos/70x70/75797.png',true),
('2026/27','7889','Liverpool','https://img.uefa.com/imgml/TP/teams/logos/70x70/7889.png',true),
('2026/27','52919','Manchester City','https://img.uefa.com/imgml/TP/teams/logos/70x70/52919.png',true),
('2026/27','52682','Manchester United','https://img.uefa.com/imgml/TP/teams/logos/70x70/52682.png',true),
('2026/27','50136','Napoli','https://img.uefa.com/imgml/TP/teams/logos/70x70/50136.png',true),
('2026/27','52747','Paris Saint-Germain','https://img.uefa.com/imgml/TP/teams/logos/70x70/52747.png',true),
('2026/27','50064','Porto','https://img.uefa.com/imgml/TP/teams/logos/70x70/50064.png',true),
('2026/27','50062','PSV','https://img.uefa.com/imgml/TP/teams/logos/70x70/50062.png',true),
('2026/27','52265','Real Betis','https://img.uefa.com/imgml/TP/teams/logos/70x70/52265.png',true),
('2026/27','50051','Real Madrid','https://img.uefa.com/imgml/TP/teams/logos/70x70/50051.png',true),
('2026/27','50137','Roma','https://img.uefa.com/imgml/TP/teams/logos/70x70/50137.png',true),
('2026/27','52797','Slovan Bratislava','https://img.uefa.com/imgml/TP/teams/logos/70x70/52797.png',true),
('2026/27','2609356','Sabah','https://img.uefa.com/imgml/TP/teams/logos/70x70/2609356.png',true),
('2026/27','52707','Shakhtar Donetsk','https://img.uefa.com/imgml/TP/teams/logos/70x70/52707.png',true),
('2026/27','52498','Slavia Praha','https://img.uefa.com/imgml/TP/teams/logos/70x70/52498.png',true),
('2026/27','50149','Sporting CP','https://img.uefa.com/imgml/TP/teams/logos/70x70/50149.png',true),
('2026/27','50107','Stuttgart','https://img.uefa.com/imgml/TP/teams/logos/70x70/50107.png',true),
('2026/27','52319','Viking','https://img.uefa.com/imgml/TP/teams/logos/70x70/52319.png',true),
('2026/27','70691','Villarreal','https://img.uefa.com/imgml/TP/teams/logos/70x70/70691.png',true);
-- Preserve the approved staging edition/order/date, generate a new production row ID.
insert into public.champions_rankings(season,edition,team_ids,published_at) values
('2026/27','Jornada 1',ARRAY['50080','50138','63405','75797','50037','52692','50067','52683','52797','7889'],'2026-10-14T03:44:17.126511+00:00');
commit;
