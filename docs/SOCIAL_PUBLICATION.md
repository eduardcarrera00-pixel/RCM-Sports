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
- Vencimiento: **19 de noviembre de 2026** (30 días predeterminados).
  Debe sustituirse antes de esa fecha para mantener los envíos.
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
