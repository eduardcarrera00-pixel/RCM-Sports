-- CAM Sports · Publicaciones promocionales diarias (21 oct 2026)
--
-- Dos publicaciones al día, a las 8:00 y a las 18:00 hora de Toronto, en todos
-- los canales activos de cam_social.channels (hoy X, TikTok e Instagram).
-- Cada publicación toma un mensaje de la biblioteca cam_social.promos que
-- explica cómo funciona la página (Picks, Takes, campeones, noticias...).
--
-- Usa la misma cola que noticias y Picks: deduplicación por evento y red,
-- límites de Buffer, MP4 con música original para TikTok/Instagram y
-- tratamiento de errores inciertos sin reenvíos automáticos.
--
-- El evento se crea hasta 45 minutos antes de la hora para que el vídeo esté
-- listo; las entregas quedan con available_at = hora exacta, así que nada sale
-- antes de las 8:00 / 18:00. El horario respeta el cambio de hora (EDT/EST).

create table if not exists cam_social.promos(
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  theme text not null check (theme in ('picks','takes','campeon','noticias','opiniones','rankings','prestigio','comunidad')),
  kicker text not null check (char_length(kicker) between 3 and 40),
  -- Titular del vídeo. Con needs_news, {noticia} se sustituye por el titular real.
  headline text not null check (char_length(headline) between 8 and 110),
  -- Texto de X sin enlace (el enlace se añade al final).
  x_text text not null check (char_length(x_text) between 20 and 230),
  -- Texto para TikTok e Instagram.
  caption text not null check (char_length(caption) between 20 and 1500),
  hashtags text not null default '#CAMSports',
  link text not null default 'https://camsports.github.io/' check (link ~ '^https://camsports\.github\.io/'),
  needs_news boolean not null default false,
  active boolean not null default true,
  active_until timestamptz,
  times_used int not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists cam_social.promo_slots(
  slot text primary key check (slot ~ '^[a-z0-9-]{2,20}$'),
  local_time time not null unique,
  images text[] not null default array['https://camsports.github.io/assets/cam-sports-logo.jpeg'],
  enabled boolean not null default true
);

alter table cam_social.promos enable row level security;
alter table cam_social.promo_slots enable row level security;
revoke all on cam_social.promos, cam_social.promo_slots from public,anon,authenticated;

insert into cam_social.promo_slots(slot,local_time,images) values
 ('manana','08:00',array['https://camsports.github.io/assets/cam-header-terrace-day.jpg',
                         'https://camsports.github.io/assets/cam-footer-village-day.jpg']),
 ('tarde','18:00',array['https://camsports.github.io/assets/cam-header-terrace-night.jpg',
                        'https://camsports.github.io/assets/cam-footer-village-night.jpg'])
on conflict (slot) do nothing;

-- Los Takes promocionales siguen visibles mientras su mensaje esté activo.
create or replace function cam_social.source_visible(p_event cam_social.events)
returns boolean language plpgsql stable set search_path='' as $$
begin
 case p_event.source_table
 when 'articles' then return exists(select 1 from public.articles where id::text=p_event.source_id and is_public);
 when 'ae_editorial_weekly_picks' then return exists(select 1 from public.ae_editorial_weekly_picks
   where id::text=p_event.source_id and is_published and expires_at>now());
 when 'ae_editorial_weekly_pick_results' then return exists(select 1 from cam_social.weekly_results
   where pick_id::text=p_event.source_id and outcome='won');
 when 'nfl_rankings' then return exists(select 1 from public.nfl_rankings where id::text=p_event.source_id and edition=p_event.edition);
 when 'champions_rankings' then return exists(select 1 from public.champions_rankings where id::text=p_event.source_id and edition=p_event.edition);
 when 'promo' then return exists(select 1 from cam_social.promos where id=p_event.source_id and active);
 else return false;
 end case;
end $$;

-- El renderer recibe además el estilo y el antetítulo (campos ya públicos).
create or replace function public.cam_social_video_jobs(max_jobs integer default 8)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('event_key',j.event_key,
   'title',j.payload->>'title','image_url',j.payload->>'image_url',
   'style',coalesce(j.payload->>'style','news'),'kicker',j.payload->>'kicker')
   order by j.created_at),'[]'::jsonb)
 from (
   select e.event_key,e.payload,e.created_at
   from cam_social.events e
   join cam_social.settings s on s.id=true
   where s.enabled and s.activated_at is not null
     and e.created_at>=s.activated_at and cam_social.source_visible(e)
     and exists (
       select 1 from cam_social.deliveries d
       join cam_social.channels c using(network)
       where d.event_key=e.event_key and d.network in ('tiktok','instagram')
         and d.status='queued' and c.enabled
     )
   order by e.created_at
   limit greatest(1,least(coalesce(max_jobs,8),12))
 ) j;
$$;
revoke all on function public.cam_social_video_jobs(integer) from public,anon,authenticated;
grant execute on function public.cam_social_video_jobs(integer) to anon,authenticated;

-- Crea, como mucho, una publicación por franja y día. p_now solo sirve para pruebas.
create or replace function cam_social.queue_promos(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 tz constant text:='America/Toronto';
 s cam_social.settings; sl cam_social.promo_slots; p cam_social.promos;
 local_day date; target timestamptz; k text; last_theme text;
 news_id uuid; news_title text; news_image text;
 title text; xt text; cap text; link text; image text; n int; created jsonb:='[]'::jsonb;
begin
 if not pg_try_advisory_xact_lock(20261021,8) then return '{"busy":true}'::jsonb; end if;
 select * into s from cam_social.settings where id;
 if not found or not s.enabled or s.activated_at is null then return '{"paused":true}'::jsonb; end if;
 local_day:=(p_now at time zone tz)::date;

 for sl in select * from cam_social.promo_slots where enabled order by local_time loop
   target:=(local_day+sl.local_time) at time zone tz;
   -- Ventana: de 45 min antes a 30 min después (cubre retrasos del cron).
   continue when p_now<target-interval '45 minutes' or p_now>=target+interval '30 minutes';
   k:='promo:'||to_char(local_day,'YYYY-MM-DD')||':'||sl.slot;
   continue when exists(select 1 from cam_social.events where event_key=k);

   select a.id,cam_social.plain(a.title),a.image into news_id,news_title,news_image
   -- Ni recién compartida (la noticia ya salió sola al publicarse) ni antigua.
   from public.articles a where a.is_public
     and a.created_at>p_now-interval '5 days' and a.created_at<p_now-interval '6 hours'
     and nullif(cam_social.plain(a.title),'') is not null
   order by a.created_at desc limit 1;

   select q.theme into last_theme from cam_social.promos q
   where q.last_used_at is not null order by q.last_used_at desc limit 1;

   -- El mensaje menos usado; nunca el mismo tema dos veces seguidas si hay alternativa.
   select * into p from cam_social.promos q
   where q.active and (q.active_until is null or q.active_until>target)
     and (not q.needs_news or news_id is not null)
   order by (q.theme is not distinct from last_theme), q.last_used_at nulls first, random()
   limit 1;
   continue when not found;

   link:=p.link; image:=sl.images[1+(extract(doy from local_day)::int % greatest(1,cardinality(sl.images)))];
   title:=p.headline; xt:=p.x_text; cap:=p.caption;
   if p.needs_news then
     title:=replace(title,'{noticia}',left(news_title,100));
     xt:=replace(xt,'{noticia}',left(news_title,110));
     cap:=replace(cap,'{noticia}',news_title);
     link:='https://camsports.github.io/?article='||news_id;
     if cam_social.image_url(news_image)<>'https://camsports.github.io/assets/cam-sports-logo.jpeg' then image:=news_image; end if;
   end if;

   insert into cam_social.events(event_key,source_table,source_id,edition,payload,created_at)
   values(k,'promo',p.id,sl.slot,jsonb_build_object(
     'title',left(title,110),
     'kicker',p.kicker,
     'style','promo',
     -- Texto en español sin enlace ≤ 240 + enlace t.co (23): siempre < 280.
     'x_text',left(xt,240)||E'\n'||link,
     'tiktok_text',left(cap,1500)||E'\n\nEntra a camsports.github.io\n'||p.hashtags,
     'instagram_text',left(cap,1500)||E'\n\nEntra a camsports.github.io\n'||p.hashtags,
     'image_url',cam_social.image_url(image),
     'link',link),p_now)
   on conflict do nothing;
   get diagnostics n=row_count;
   continue when n=0;

   insert into cam_social.deliveries(event_key,network,available_at)
   select k,c.network,target from cam_social.channels c where c.enabled
   on conflict do nothing;

   update cam_social.promos set times_used=times_used+1,last_used_at=p_now where id=p.id;
   created:=created||jsonb_build_object('event',k,'promo',p.id,'at',target);
 end loop;
 return jsonb_build_object('created',created);
end $$;
revoke all on function cam_social.queue_promos(timestamptz) from public,anon,authenticated;

-- pg_cron trabaja en UTC: estas horas cubren 7:15–8:30 y 17:15–18:30 en Toronto
-- tanto en horario de verano (UTC-4) como de invierno (UTC-5).
do $$ begin
 if exists(select 1 from pg_namespace where nspname='cron') then
   perform cron.schedule('cam-social-promos','*/5 11-13,21-23 * * *','select cam_social.queue_promos();');
 end if;
end $$;

-- Biblioteca inicial de mensajes. Rotan del menos usado al más usado, sin
-- repetir tema dos veces seguidas. Para pausar uno: active=false.
-- Para añadir más, basta con insertar filas nuevas en cam_social.promos.
insert into cam_social.promos(id,theme,kicker,headline,x_text,caption,hashtags,needs_news,active_until) values
('picks-pickster','picks','COCINA PICKS',
 '¿Ya pusiste tu Pick de hoy?',
 '¿Ya pusiste tu Pick de hoy? 🍳 En CAM Sports cada pronóstico queda guardado y su resultado se valida solo. Acierta, sube en la tabla y compite por ser el mejor pickster.',
 E'¿Ya pusiste tu Pick de hoy?\n\nEn CAM Sports cada pronóstico queda guardado con fecha y hora, y el resultado se valida solo. Acierta, sube en la tabla y compite por ser el mejor pickster de la comunidad.',
 '#CAMSports #Picks #Pronosticos #NFL #Futbol',false,null),
('picks-chef','picks','¿ERES CHEF?',
 '¿Eres Chef? Demuéstralo con tu Pick.',
 '¿Eres Chef? Cocina tu Pick en CAM Sports y entra a la tabla de Mejores Chefs. Y si se te quema el plato… también hay tabla para eso 👀',
 E'¿Eres Chef? 👨‍🍳\n\nCocina tu Pick en CAM Sports y entra a la tabla de Mejores Chefs. Y si se te quema el plato… también hay tabla de Peores Chefs. Aquí cada pronóstico cuenta.',
 '#CAMSports #Picks #Pronosticos #Apuestas #Deportes',false,null),
('picks-pruebas','picks','COCINA PICKS',
 'Nada de "yo lo dije" sin pruebas.',
 'Nada de "yo lo dije" sin pruebas. En CAM Sports tu Pick queda registrado con fecha y hora, y el resultado se valida solo. Tus aciertos hablan por ti.',
 E'Nada de "yo lo dije" sin pruebas.\n\nEn CAM Sports tu Pick queda registrado con fecha y hora, y el resultado se valida solo. Tus aciertos hablan por ti, y tu historial también.',
 '#CAMSports #Picks #Pronosticos #NFL #Futbol',false,null),
('picks-racha','picks','COCINA PICKS',
 'Una racha no se presume: se registra.',
 'Una racha no se presume: se registra. Publica tus Picks en CAM Sports y deja que la tabla diga quién sabe de verdad.',
 E'Una racha no se presume: se registra. 📈\n\nPublica tus Picks en CAM Sports y deja que la tabla diga quién sabe de verdad. Mejores Chefs arriba, Peores Chefs abajo. ¿Dónde vas a quedar tú?',
 '#CAMSports #Picks #Pronosticos #Deportes',false,null),
('picks-mesa','picks','LA MESA DE LA COMUNIDAD',
 '¿Qué está cocinando la comunidad?',
 '¿Qué está cocinando la comunidad? Mira los Picks en CAM Sports, compáralos con el tuyo y súmate a la mesa. ¿Quién servirá el mejor plato de la semana?',
 E'¿Qué está cocinando la comunidad? 🍽️\n\nMira los Picks en CAM Sports, compáralos con el tuyo y súmate a la mesa. Cada semana hay un mejor plato… y uno que mejor ni recordar.',
 '#CAMSports #Picks #Comunidad #Pronosticos',false,null),
('takes-historia','takes','TAKES',
 '¿Quieres quedar para la historia?',
 '¿Quieres quedar para la historia? Deja tu Take en CAM Sports. Se guarda con fecha para que, cuando se cumpla, lo puedas presumir con pruebas 🏛️',
 E'¿Quieres quedar para la historia? 🏛️\n\nDeja tu Take en CAM Sports. Se guarda con fecha para que, cuando se cumpla, lo puedas presumir con pruebas. Los que nadie vio venir valen más.',
 '#CAMSports #Takes #NFL #Futbol #Prediccion',false,null),
('takes-dificultad','takes','TAKES',
 'Mientras más difícil, más vale.',
 'En CAM Sports no todos los Takes valen lo mismo: uno fácil vale poco y uno casi imposible, hasta 20 puntos. ¿Te atreves con el que nadie ve venir?',
 E'Mientras más difícil, más vale.\n\nEn CAM Sports cada Take se puntúa según su dificultad: uno fácil vale poco y uno casi imposible, hasta 20 puntos. ¿Te atreves con el que nadie ve venir?',
 '#CAMSports #Takes #Prediccion #NFL #Futbol',false,null),
('takes-legendario','takes','SALÓN DE LA FAMA',
 '¿Tienes un Take legendario?',
 'Un Take de 15 puntos o más que se cumple es Legendario: entra al Salón de la Fama con su medalla Epic Prediction. ¿Cuál es el tuyo?',
 E'¿Tienes un Take legendario? 🏅\n\nEn CAM Sports, un Take de 15 puntos o más que se cumple entra al Salón de la Fama con su medalla Epic Prediction. Los audaces se recuerdan.',
 '#CAMSports #Takes #SalonDeLaFama #Prediccion',false,null),
('takes-amigo','takes','TAKES',
 'Sé el que sí lo puede demostrar.',
 'Todos tenemos un amigo que "lo dijo". Sé el que lo puede demostrar: guarda tus Takes en CAM Sports y presúmelos cuando se cumplan.',
 E'Todos tenemos un amigo que "lo dijo". 🙄\n\nSé el que lo puede demostrar: guarda tus Takes en CAM Sports y presúmelos cuando se cumplan, con fecha y todo.',
 '#CAMSports #Takes #NFL #Futbol',false,null),
('takes-genios','takes','TAKES',
 '¿Genio o Anoeto?',
 '¿Genio o Anoeto? En CAM Sports tus Takes deciden en qué tabla apareces. Publica el tuyo y que el tiempo dé el veredicto.',
 E'¿Genio o Anoeto? 🤔\n\nEn CAM Sports tus Takes deciden en qué tabla apareces: el Top 10 de Genios o la de Anoetos. Publica el tuyo y que el tiempo dé el veredicto.',
 '#CAMSports #Takes #Ranking #Deportes',false,null),
('prestigio-perfil','prestigio','PERFIL DE PRESTIGIO',
 '¿Conservador, Atrevido o Visionario?',
 'Tu perfil de prestigio en CAM Sports dice qué tipo de opinador eres: Conservador, Equilibrado, Atrevido o Visionario. ¿Cuál te toca a ti?',
 E'¿Conservador, Atrevido o Visionario?\n\nTu perfil de prestigio en CAM Sports mide el riesgo de tus Takes, tus hazañas y tus Takes legendarios. Descubre qué tipo de opinador eres.',
 '#CAMSports #Takes #Perfil #Deportes',false,null),
('campeon-ligas','campeon','¿QUIÉN SERÁ CAMPEÓN?',
 '¿Quién será campeón? Elige ya.',
 '¿Quién gana LaLiga, la Premier, la Champions, la Liga MX y la NFL? Elige a tu campeón en CAM Sports: una sola oportunidad, y mientras menos favorito, más puntos 🏆',
 E'¿Quién será campeón? 🏆\n\nLaLiga, Premier, Champions, Liga MX y NFL: elige a tu campeón en CAM Sports. Solo tienes una oportunidad, y mientras menos favorito sea tu equipo, más puntos ganas si aciertas.',
 '#CAMSports #LaLiga #PremierLeague #Champions #LigaMX #NFL',false,'2026-10-31 04:00:00+00'),
('campeon-cierre','campeon','ÚLTIMA LLAMADA',
 'Las predicciones de campeón cierran el 30 de octubre.',
 'Las predicciones de campeón cierran el 30 de octubre. Eliges una vez, sin cambios. Acierta con un equipo poco favorito y suma hasta 20 puntos.',
 E'Última llamada ⏳\n\nLas predicciones de campeón de CAM Sports cierran el 30 de octubre. Eliges una vez, sin cambios, y si aciertas con un equipo poco favorito sumas hasta 20 puntos.',
 '#CAMSports #LaLiga #PremierLeague #Champions #LigaMX #NFL',false,'2026-10-31 04:00:00+00'),
('noticias-ultima','noticias','¿YA LEÍSTE ESTO?',
 '{noticia}',
 '¿Ya leíste la última en CAM Sports? 📰 «{noticia}»',
 E'¿Ya leíste la última en CAM Sports? 📰\n\n«{noticia}»\n\nLéela completa en nuestra web.',
 '#CAMSports #Noticias #Deportes',true,null),
('noticias-calma','noticias','PARA LEER CON CALMA',
 '{noticia}',
 'Para leer con calma: «{noticia}». Historias que importan, en CAM Sports.',
 E'Para leer con calma ☕\n\n«{noticia}»\n\nHistorias que importan, en CAM Sports.',
 '#CAMSports #Noticias #Deportes',true,null),
('noticias-general','noticias','HISTORIAS QUE IMPORTAN',
 'El deporte, contado con calma.',
 'NFL, fútbol, colegial, tenis y ciclismo, contados con calma. ¿Ya leíste las últimas noticias? Están en CAM Sports.',
 E'El deporte, contado con calma. 📰\n\nNFL, fútbol, colegial, tenis y ciclismo. ¿Ya leíste las últimas noticias? Están en CAM Sports.',
 '#CAMSports #Noticias #NFL #Futbol #Tenis #Ciclismo',false,null),
('opiniones-piensa','opiniones','OPINIONES',
 'El juego también se piensa.',
 'El juego también se piensa. Lee las Opiniones de CAM Sports: NFL, fútbol, colegial, ciclismo y tenis, con firma y sin gritos.',
 E'El juego también se piensa. ✍️\n\nLee las Opiniones de CAM Sports: NFL, fútbol, colegial, ciclismo y tenis, con firma y sin gritos.',
 '#CAMSports #Opinion #NFL #Futbol',false,null),
('opiniones-debate','opiniones','OPINIONES',
 '¿De acuerdo o en contra?',
 '¿De acuerdo o en contra? Lee una Opinión en CAM Sports y compártela con quien tenga que leerla. El buen debate empieza por escrito.',
 E'¿De acuerdo o en contra?\n\nLee una Opinión en CAM Sports y compártela con quien tenga que leerla. El buen debate empieza por escrito.',
 '#CAMSports #Opinion #Debate #Deportes',false,null),
('rankings-nfl','rankings','POWER RANKINGS NFL',
 'Nuestro Top 10 de la NFL. ¿Estás de acuerdo?',
 'Nuestro Top 10 de la NFL está en CAM Sports. ¿Falta alguien? ¿Sobra alguien? Míralo y defiende tu ranking con un Take 🏈',
 E'Nuestro Top 10 de la NFL 🏈\n\n¿Falta alguien? ¿Sobra alguien? Míralo en CAM Sports y defiende tu ranking con un Take.',
 '#CAMSports #NFL #PowerRankings',false,null),
('rankings-champions','rankings','POWER RANKINGS CHAMPIONS',
 '¿Quién manda en Europa?',
 '¿Quién manda en Europa? Revisa el Top 10 de la Champions en CAM Sports y deja tu Take si crees que nos equivocamos ⚽',
 E'¿Quién manda en Europa? ⚽\n\nRevisa el Top 10 de la Champions en CAM Sports y deja tu Take si crees que nos equivocamos.',
 '#CAMSports #ChampionsLeague #Futbol #PowerRankings',false,null),
('comunidad-calma','comunidad','CAM SPORTS',
 'Deporte con calma, debate con nivel.',
 'Un lugar para leer, predecir y debatir de deporte sin ruido: Picks, Takes, noticias y opiniones. Eso es CAM Sports.',
 E'Deporte con calma, debate con nivel.\n\nUn lugar para leer, predecir y debatir de deporte sin ruido: Picks, Takes, noticias y opiniones. Eso es CAM Sports.',
 '#CAMSports #Deportes #NFL #Futbol',false,null),
('comunidad-cuenta','comunidad','CAM SPORTS',
 'Crea tu cuenta y empieza a sumar.',
 'Crear tu cuenta en CAM Sports toma un minuto. Desde ahí, cada Pick y cada Take que publiques cuenta para tu historial.',
 E'Crea tu cuenta y empieza a sumar.\n\nEn CAM Sports registrarte toma un minuto. Desde ahí, cada Pick y cada Take que publiques cuenta para tu historial y tus rankings.',
 '#CAMSports #Picks #Takes #Deportes',false,null),
('comunidad-temporada','comunidad','CAM SPORTS',
 'La temporada es larga. Tu historial también.',
 'Cada temporada deja historias. Que la tuya quede registrada: Picks, Takes y medallas en tu perfil de CAM Sports.',
 E'La temporada es larga. Tu historial también.\n\nCada temporada deja historias. Que la tuya quede registrada: Picks, Takes y medallas en tu perfil de CAM Sports.',
 '#CAMSports #Picks #Takes #NFL #Futbol',false,null)
on conflict (id) do nothing;
