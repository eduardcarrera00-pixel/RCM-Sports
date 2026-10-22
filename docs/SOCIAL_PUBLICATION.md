# Publicación de CAM Sports en redes

## Primera fase

`supabase/19_cam_social_publication.sql` instala una cola privada para noticias
públicas, el Pick editorial de la Semana y las ediciones de Power Rankings de
NFL y Champions. No comparte cada pick o take de los lectores. Los premios y
clasificaciones de cierre diario, semanal o mensual requieren una segunda fase
con criterios y horarios de cierre definidos.

Una publicación válida produce una entrega independiente por canal habilitado.
La operación de guardado en la web encola el envío inmediato; `pg_net` realiza
la petición después de confirmar la transacción. `pg_cron` recoge las respuestas
y revisa los pendientes cada minuto. Si falla la integración, se conserva la
publicación de la web.

Se usa la API GraphQL oficial de Buffer, `schedulingType: automatic` y
`mode: shareNow`. TikTok recibe una publicación con foto y título, X una imagen,
texto breve y enlace. No se generan vídeos en esta fase. Cuando una imagen no
es un archivo HTTPS JPG/PNG utilizable, se usa el logo actual de CAM Sports.

## Estado verificado el 20 de octubre de 2026

La integración está **activada**. El propietario autorizó crear la clave,
guardarla en Supabase y publicar la propuesta #72 en `main`.
La clave se transfirió directamente de Buffer a Supabase Vault, sin archivos
intermedios ni exposición del valor en el código o los mensajes.

- Nombre en Vault: `cam_buffer_api_key`.
- Permisos: `account:read`, `posts:read`, `posts:write`.
- Renovada el 21 de octubre de 2026 (23:23, Toronto) con vencimiento de 1 año
  (≈ octubre de 2027). La primera clave vencía el 19 de noviembre de 2026.
  En el plan gratuito solo hay una clave: regenerarla revoca la anterior al instante.
  Para cambiarla: `select vault.update_secret((select id from vault.secrets where
  name='cam_buffer_api_key'), '<clave>');` en el SQL Editor de Supabase.
- Ambos canales se verificaron por API: conectados, colas sin pausar y TikTok
  con publicación automática, sin recordatorios manuales.
- Cron operativo; integración habilitada y sin importación de contenido antiguo.

La prueba con el logo actual se envió una sola vez a cada red y se verificó
como `sent`, con enlaces reales:

- [X](https://twitter.com/CAM_SPORTS__/status/2112624067589112058)
- [TikTok](https://tiktok.com/@cam.sports.club/video/7698831081914617106)

No cambiar `activated_at` en una pausa/reanudación normal: ese campo marca el
inicio de la integración. La instalación del esquema nunca contiene la clave.
Las fotos de perfil de las cuentas no se modifican con esta integración.

## Controles y límites

- Tablas privadas con RLS y sin acceso de lectores; solo el trigger y el cron
  operan la cola. `cam_social_status()` permite consultar el estado a los admins
  autenticados y no devuelve la clave.
- Solo una entrega por contenido y red; corregir texto o guardar la misma
  edición de ranking no genera otra publicación.
- Contenido retirado, sustituido o vencido antes de enviarse se cancela.
  Retirarlo después de enviarlo no borra la publicación de la red.
- Una respuesta incierta, timeout, 5xx o error interno de Buffer requiere revisar
  Buffer antes de reenviar. No hay reintento automático que pueda duplicarlo.
- Un rechazo 429 aplaza la entrega 24 horas. Hay un límite local de 90 llamadas
  por 24 horas y 80 por 15 minutos para respetar el plan gratuito de Buffer.
  Otras herramientas que usen la misma clave también consumen sus límites.
- `accepted` significa que Buffer aceptó la publicación; `published` exige una
  respuesta con estado `sent`. La versión inicial recoge la respuesta de creación;
  los cambios posteriores de estado se revisan en Buffer.

## Validación

`node tests/social-publication.mjs` comprueba instalación pausada, borradores,
deduplicación, canales independientes, retirada de contenido, ediciones nuevas,
429, fallos inciertos, Pick vencido, rollback y permisos.
`npm run test:editor` comprueba el editor existente.

La instalación en producción se comprobó además en una transacción revertida:
una noticia produce dos entregas, la edición no duplica y no se realizan
peticiones sin clave. El cron se ejecutó correctamente con la integración
desactivada. El asesor de seguridad marca las tablas privadas sin políticas
(denegación intencional a lectores) y el RPC de estado con `SECURITY DEFINER`
(acceso intencional con comprobación interna de admin, probada con ambos roles).

Fuentes de implementación: [API de Buffer](https://developers.buffer.com/reference.html),
[publicación](https://developers.buffer.com/guides/posts-and-scheduling.html),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).



## Vídeos de TikTok con música original (octubre 2026)

Migración: `supabase/20_cam_social_tiktok_music.sql`. El canal X no cambia:
continúa recibiendo fotografía + enlace. Para TikTok, la misma noticia, Pick
editorial o edición de Power Rankings genera un MP4 vertical (8 segundos,
720 × 1280, H.264/AAC) con música instrumental sintetizada por CAM Sports.
No se extraen canciones de TikTok ni se incorporan obras comerciales.

`cam_social_video_jobs()` publica únicamente los metadatos ya públicos de
eventos que esperan un vídeo; no expone credenciales ni concede escritura. Un
GitHub Action programado (`cam-social-video.yml`) toma los trabajos, compone
los vídeos con FFmpeg y los guarda en `assets/social-videos/<md5(event_key)>.mp4`.
El publicador de `camsports.github.io` sincroniza estos archivos desde
el repositorio fuente. Buffer recibe su URL HTTPS cuando el servidor verifica
con una petición HTTP Range que el MP4 público está disponible.

**TikTok no publica silenciosamente fotos sin música:** si el vídeo todavía
no está disponible, conserva su entrega en `queued` y vuelve a comprobar.
GitHub Actions y el publicador web pueden tardar varios minutos; no es
publicación instantánea. Cuando hay un error de generación, conviene revisar
el workflow, el archivo MP4 y la cola antes de intervenir. No reintentar
solicitudes inciertas de Buffer porque se podrían duplicar. La cola anterior
`accepted` / `published` no se modifica ni vuelve a enviarse.

Validación: `node tests/social-video-publication.mjs` y
`python scripts/cam_social_make_video.py --smoke-test` (FFmpeg, Pillow).
La música es una secuencia instrumental original sintetizada sin samples
ajenos; no equivale a utilizar música del catálogo de TikTok.


## Instagram automático con música original (21 de octubre de 2026)

Migración: `supabase/migrations/20261021154636_cam_instagram_music_publication.sql`,
después de la instalación social y del MP4 de TikTok. Amplía los canales admitidos
con `instagram`; no inventa un ID de canal ni importa publicaciones antiguas.
Tras conectar y verificar **cam_sports_club** en Buffer, se configura su ID real
en `cam_social.channels`. Solo se comparten los nuevos eventos desde entonces.

El usuario eligió **Todo automático**: Instagram recibe el mismo MP4 vertical
con instrumental original incorporada que TikTok, con
`metadata.instagram: {type: "reel", shouldShareToFeed: true}`. Aparece como Reel
y en el feed. Usa el texto del evento (o `instagram_text` cuando exista). X
conserva su flujo vigente. No hay canciones comerciales ni selección automática
de música del catálogo de Instagram en este modo.

La documentación y la introspección de la API pública de Buffer consultadas
el 21 de octubre permiten consultar audio de Instagram, pero
`InstagramPostMetadataInput` no admite adjuntar el audio a `createPost`.
`stickerFields.music` es una indicación para publicación con recordatorio,
no una canción adjunta. El selector nativo de canciones que ofrece el composer
de Buffer es distinto de esta integración por API.

El worker devuelve un solo trabajo por evento aunque las dos redes esperen
el vídeo. Funciona también con Instagram como único canal de vídeo activo.
Antes de enviar cada Reel, se verifica el MP4 público; nunca se sustituye
por una foto silenciosa. Se conservan deduplicación, visibilidad, límites,
tratamiento de errores inciertos y permisos privados.

Validación: `node tests/social-instagram-publication.mjs`, regresiones sociales
existentes, `npm run test:editor` y el smoke test H.264/AAC del renderer.
La conexión OAuth de Instagram debe completarse antes de activar el canal.
Una prueba local o una respuesta `accepted` no demuestra publicación real.


## Publicaciones promocionales diarias (21 de octubre de 2026)

Migración: `supabase/migrations/20261021170000_cam_social_daily_promos.sql`
(aplicada en producción el 21 oct). Todos los días, a las **8:00 y a las 18:00
hora de Toronto**, sale una publicación sobre cómo funciona la página en todos
los canales activos de `cam_social.channels` (hoy X, TikTok e Instagram).

- `cam_social.promos`: biblioteca de mensajes (23 al iniciar) por tema: Picks,
  Takes, ¿Quién será campeón?, noticias, opiniones, Power Rankings, perfil de
  prestigio y comunidad. Cada uno tiene antetítulo y titular del vídeo, texto de
  X (≤ 230 caracteres, el enlace se añade aparte), texto de TikTok/Instagram y
  hashtags. `active=false` lo pausa; `active_until` lo retira solo (los de
  campeón se retiran tras el cierre del 30 de octubre).
- Rotación: el mensaje menos usado y nunca el mismo tema dos veces seguidas.
- Mensajes con `needs_news`: usan `{noticia}`, que se sustituye por el titular
  de la última noticia pública de los últimos 5 días (con más de 6 horas, para
  no repetir la publicación automática de la propia noticia), con su foto y su
  enlace `?article=`. Si no hay noticia reciente, no se eligen.
- `cam_social.promo_slots`: horas locales e imágenes de fondo (de día por la
  mañana, de noche por la tarde).
- `cam_social.queue_promos()`: pg_cron `cam-social-promos` la ejecuta cada 5
  minutos en las horas UTC que cubren el horario de verano y de invierno. Crea el
  evento entre 45 minutos antes y 30 minutos después de la hora, una sola vez por
  franja y día (`promo:AAAA-MM-DD:manana|tarde`). Las entregas quedan con
  `available_at` = hora exacta: el vídeo se genera antes y nada sale antes de
  las 8:00 / 18:00.
- El renderer usa el estilo `promo` (escena a pantalla completa, antetítulo
  dorado, titular grande y `CAMSPORTS.GITHUB.IO`) cuando el trabajo lo indica.
- Consumo: 2 publicaciones × 3 redes = 6 llamadas de Buffer al día, dentro del
  límite local de 90.

Validado en producción dentro de una transacción revertida: 7:00 no crea nada,
7:20 crea la de las 8:00 (12:00 UTC en EDT), repetir no duplica, 17:20 crea la
de las 18:00, tras el cambio de hora sale a las 13:00 / 23:00 UTC, 18:31 ya no
crea nada, cada publicación tiene 3 entregas y los temas rotan.

## Biblioteca visual de marca (22 de octubre de 2026)

Las publicaciones automáticas nuevas eligen una ilustración de
`assets/social-brand/` según su tema. La tabla privada `cam_social.brand_images`
mantiene el conjunto permitido para cada tema. El trigger de `cam_social.events`
guarda la imagen elegida junto con `brand_theme`, `brand_image_key` y la URL
original. La selección toma la imagen menos usada recientemente dentro del
tema, para alternar las piezas. Noticias NFL y Fútbol usan sus familias
respectivas; Picks, rankings y promociones usan su temática. Los eventos ya
creados no se reescriben.

X recibe el JPG ilustrado. Instagram y TikTok usan el mismo JPG como base de
un video 9:16 con titular y música original, sin el marco fotográfico de la
plantilla anterior. El resultado acertado de Pick conserva en X su formato
especial de cita a la publicación original. Para ampliar la biblioteca, añadir
los JPG y las filas correspondientes de `cam_social.brand_images` en una nueva
migración.

## Rotación musical CC0 para Instagram/TikTok (22 de octubre de 2026)

Migración: `supabase/migrations/20261022192000_cam_social_rotating_cc0_music.sql`.
Se retiró el arpegio artificial fijo de `compose_original_music`. Cada entrega
**nueva** de Instagram y TikTok recibe una pista de `cam_social.music_tracks`
al crearse, con elección aleatoria entre las menos usadas (bolsa barajada).
Se conservan las asignaciones para reintentos, se intenta no repetir una
pista antes de utilizar todas y se prohíbe compartir pista entre ambas redes
en el mismo evento cuando haya alternativas. Para ampliar o suspender el
catálogo basta insertar pistas autorizadas o actualizar `enabled`. No se
necesita modificar el generador, pero siempre hay que documentar su licencia.

Catálogo inicial: diez pistas **CC0** de
[FreePD](https://en.freepd.cn/music), en las familias electrónica, épica y
animada. La fuente indica permiso comercial, sincronización y modificación;
el usuario debe respetar cualquier reclamación de terceros que surja.
Se mantienen en `cam_social.music_tracks` los títulos y enlaces de prueba
de licencia. Solo se descargan las URLs exactas del dominio autorizado
`en.freepd.cn`; redirecciones y otras ubicaciones se rechazan. La música
se descarga durante el render, se normaliza a un volumen de fondo, recibe
fade in/out y se integra como AAC en el MP4 de 8 segundos. La pista de
prueba sintética existe únicamente en el `--smoke-test`: jamás se publica.

Los MP4 ahora se generan como
`assets/social-videos/<md5(event_key + ':' + network)>.mp4`, de forma
independiente para `instagram` y `tiktok`. El publicador
`cam_social.dispatch()` verifica el MP4 disponible antes de enviarlo a
Buffer y **no publica videos** sin una pista activa y un archivo disponible.
Si una pista no se puede descargar, el trabajo falla de forma visible,
sin reutilizar el antiguo sonido ni sustituirlo por una foto.

No se reescriben publicaciones antiguas, ni se vuelven a encolar entregas
`accepted` o `published`. Los tres canales mantienen sus textos,
credenciales, deduplicación, control de errores y rutina existentes; X sigue
usando fotografías. TikTok e Instagram necesitan las correspondientes
conexiones aprobadas en Buffer para completar la entrega.

Antes de activar una migración en producción ejecutar:
`node tests/social-music-rotation.mjs`,
`node tests/social-instagram-publication.mjs`,
`node tests/social-video-publication.mjs` y
`python scripts/cam_social_make_video.py --smoke-test`.
Se recomienda comprobar los primeros MP4 reales y su resultado en Buffer.
