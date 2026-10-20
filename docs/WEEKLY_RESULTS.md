# Resultados del Pick de la Semana

En Picks, el equipo editorial tiene el panel **Administrar · Resultados del Pick de la Semana**. Incluye picks anteriores/vencidos, con páginas de 30 y actualización manual del estado de envío.

- **Aprobar · Acertado**: requiere confirmar la decisión; guarda el resultado y prepara un aviso «✅ Pick acertado» para X y TikTok con la imagen original. El aviso de X enlaza al tuit original si su URL de publicación está registrada.
- **Denegar · No acertado**: guarda el fallo sin publicación en redes.
- Una decisión confirmada no se puede cambiar ni repetir desde estos controles. La selección y sus datos quedan protegidos frente a edición. Un segundo envío de la misma petición devuelve el resultado guardado y no duplica avisos.
- El enlace `?weeklyResult=<uuid>` mantiene visible el resultado y su selección original aunque se publique otro Pick o venza el anterior.
- Solo administradores pueden resolver y consultar el panel. Los lectores únicamente pueden leer el resultado público, sin datos del administrador ni acceso a la cola o claves.

## X: aviso automático y respuesta manual

La API pública actual de Buffer no incluye un campo de respuesta a un tuit existente en `TwitterPostMetadataInput`; permite crear hilos nuevos, no añadir una respuesta a un tuit anterior. Por ello el aviso automático es una publicación independiente con enlace al original. **Responder en X (manual)** abre el composer oficial con `in_reply_to` y «✅ Pick acertado»; el administrador debe publicarla allí si quiere añadirla al hilo. Esta respuesta manual es adicional al aviso automático. No se presenta como enviada ni se genera de forma oculta.

Referencia oficial: https://developers.buffer.com/reference.html#input-TwitterPostMetadataInput

## Instalación y comprobación

Aplicar `supabase/20_cam_weekly_results.sql` después de `19_cam_social_publication.sql`. No cambia resultados de picks existentes ni los aprueba automáticamente. La integración social y el cron existentes siguen gestionando los envíos independientes y sus errores.

`tests/weekly-results.sql` verifica resultados, permisos, ausencia de envíos al fallar, snapshots, duplicados, inmutabilidad y picks vencidos dentro de una transacción que se revierte. Desactiva los envíos solo dentro de esa transacción. No publica pruebas en redes.

`node tests/weekly-results-ui.mjs` verifica los controles, confirmación, doble clic, recuperación tras perder una respuesta, lectores, enlace público y respuesta preparada. La nueva comprobación de GitHub Actions también ejecuta la regresión social y del editor de noticias.
