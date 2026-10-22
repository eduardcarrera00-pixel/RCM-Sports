-- Curated CAM SPORTS social illustrations. Only newly created events are changed;
-- sent or queued posts retain their original media and delivery state.
create table if not exists cam_social.brand_images (
  theme text not null,
  slug text not null,
  image_url text not null,
  active boolean not null default true,
  primary key (theme, slug),
  constraint brand_images_theme_check check (theme in
    ('football','nfl','picks','takes','rankings','champions','noticias',
     'opiniones','comunidad','campeon','prestigio')),
  constraint brand_images_url_check check
    (image_url ~ '^https://camsports[.]github[.]io/assets/social-brand/[a-z-]+[.]jpg$')
);
alter table cam_social.brand_images enable row level security;
revoke all on cam_social.brand_images from public, anon, authenticated;

insert into cam_social.brand_images(theme,slug,image_url)
select mapping.theme, mapping.slug,
       'https://camsports.github.io/assets/social-brand/'||mapping.slug||'.jpg'
from (values
 ('football','football'),('football','champion'),('football','champions'),
 ('nfl','nfl'),('nfl','rankings'),
 ('picks','picks'),('picks','champion'),('picks','football'),
 ('takes','takes'),('takes','community'),
 ('rankings','rankings'),('rankings','nfl'),('rankings','champions'),
 ('champions','champions'),('champions','rankings'),('champions','football'),
 ('noticias','news'),('noticias','football'),('noticias','nfl'),
 ('opiniones','takes'),('opiniones','news'),('opiniones','community'),
 ('comunidad','community'),('comunidad','takes'),('comunidad','picks'),
 ('campeon','champion'),('campeon','football'),('campeon','champions'),
 ('prestigio','rankings'),('prestigio','community'),('prestigio','champions')
) as mapping(theme,slug)
on conflict (theme,slug) do update set image_url=excluded.image_url;

create or replace function cam_social.brand_event_image()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
  topic text; selected cam_social.brand_images; original_url text;
begin
  case new.source_table
    when 'articles' then
      select case when a.category ilike '%NFL%' then 'nfl'
                  when a.category ilike '%fútbol%' or a.category ilike '%futbol%' then 'football'
                  else 'noticias' end into topic
      from public.articles a where a.id::text=new.source_id;
    when 'nfl_rankings' then topic:='rankings';
    when 'champions_rankings' then topic:='champions';
    when 'ae_editorial_weekly_picks','ae_editorial_weekly_pick_results' then topic:='picks';
    when 'promo' then
      select case p.theme
        when 'takes' then 'takes' when 'picks' then 'picks'
        when 'rankings' then 'rankings' when 'campeon' then 'campeon'
        when 'opiniones' then 'opiniones' when 'comunidad' then 'comunidad'
        when 'prestigio' then 'prestigio' else 'noticias' end into topic
      from cam_social.promos p where p.id=new.source_id;
    else return new;
  end case;
  topic:=coalesce(topic,'noticias');
  -- Serialize picks for one theme so adjacent posts cannot take the same image.
  perform pg_advisory_xact_lock(hashtext(topic),20261022);
  select b.* into selected from cam_social.brand_images b
  left join lateral (
    select max(e.created_at) as last_used
    from cam_social.events e
    where e.payload->>'brand_theme'=topic and e.payload->>'brand_image_key'=b.slug
  ) usage on true
  where b.theme=topic and b.active
  order by usage.last_used nulls first,b.slug
  limit 1;
  if not found then return new; end if;
  original_url:=new.payload->>'image_url';
  new.payload:=new.payload||jsonb_build_object(
    'image_url',selected.image_url,
    'brand_theme',topic,
    'brand_image_key',selected.slug,
    'original_image_url',original_url);
  return new;
end $function$;
revoke all on function cam_social.brand_event_image() from public,anon,authenticated;
drop trigger if exists cam_social_brand_event_image on cam_social.events;
create trigger cam_social_brand_event_image before insert on cam_social.events
for each row execute function cam_social.brand_event_image();
