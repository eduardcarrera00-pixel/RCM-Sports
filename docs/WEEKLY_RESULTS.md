# Resultados del Pick de la Semana

En Picks, el equipo editorial tiene el panel **Administrar · Resultados del Pick de la Semana**. Incluye picks anteriores/vencidos, con páginas de 30 y actualización manual del estado de envío.

- **Aprobar · Acertado**: requiere confirmar la decisión; guarda el resultado y prepara la respuesta de texto para X y el aviso habitual de TikTok. La respuesta de X apunta al tuit original si su URL de publicación está registrada.
- **Denegar · No acertado**: guarda el fallo sin publicación en redes.
- Una decisión confirmada no se puede cambiar ni repetir desde estos controles. La selección y sus datos quedan protegidos frente a edición. Un segundo envío de la misma petición devuelve el resultado guardado y no duplica avisos.
- El enlace `?weeklyResult=<uuid>` mantiene visible el resultado y su selección original aunque se publique otro Pick o venza el anterior.
- Solo administradores pueden resolver y consultar el panel. Los lectores únicamente pueden leer el resultado público, sin datos del administrador ni acceso a la cola o claves.

## X: respuesta de texto al Pick original

**Responder en X (manual)** abre el composer oficial con `in_reply_to` y exactamente «✅ Pick acertado · Pick de la Semana». No adjunta foto, selección, cuota ni enlace. El administrador debe publicarla allí. Abrirla no marca la respuesta como enviada. El estado de X se muestra como «respuesta preparada: publicar en X».

La API pública actual de Buffer no permite responder a un tuit existente. Por eso no se crea una publicación independiente en X al aprobar; la entrega queda en `manual_reply`, fuera del despacho automático. Las publicaciones normales de picks/noticias y el aviso de TikTok siguen su flujo existente.

Referencia oficial: https://developers.buffer.com/reference.html#input-TwitterPostMetadataInput

## Instalación y comprobación

Aplicar `supabase/20_cam_weekly_results.sql` después de `19_cam_social_publication.sql`, y luego `21_cam_weekly_x_text_reply.sql`. No cambia resultados de picks existentes ni los aprueba automáticamente. La integración social y el cron existentes siguen gestionando los envíos independientes y sus errores.

`tests/weekly-results.sql` verifica resultados, permisos, ausencia de envíos al fallar, snapshots, duplicados, inmutabilidad y picks vencidos dentro de una transacción que se revierte. Desactiva los envíos solo dentro de esa transacción. No publica pruebas en redes.

`node tests/weekly-results-ui.mjs` verifica los controles, confirmación, doble clic, recuperación tras perder una respuesta, lectores, enlace público y respuesta preparada. La nueva comprobación de GitHub Actions también ejecuta la regresión social y del editor de noticias.
