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

## Activación pendiente de la cuenta

El 20 de octubre de 2026 Buffer mostró **Get started by verifying your email**
en su página API. Se reenvió la verificación y después Buffer habilitó el botón
**New Key**. No se creó ni se guardó ninguna clave de Buffer durante la
preparación: esa creación requiere la confirmación del propietario.

Para activar:

1. Crear la clave personal en Buffer con la aprobación exigida por el navegador.
2. Guardarla exclusivamente en Supabase Vault con nombre `cam_buffer_api_key`.
   No ponerla en GitHub, archivos de la web ni mensajes de diagnóstico.
3. Comprobar mediante la API los dos canales observados en Buffer y su capacidad
   de publicación automática. Configurar `cam_social.channels` con esos IDs.
4. Activar `cam_social.settings.enabled=true, activated_at=now()`.
   No cambiar `activated_at` en una pausa/reanudación normal: ese campo es el
   inicio de la integración. No hay importación de publicaciones antiguas.
5. Publicar una prueba explícita y verificar **Sent** y el enlace real en cada
   red. Crear un objeto en Buffer no demuestra que se publicó en la red.

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
