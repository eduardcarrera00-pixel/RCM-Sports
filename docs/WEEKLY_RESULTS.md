# Resultados del Pick de la Semana

En Picks, el equipo editorial tiene el panel **Administrar · Resultados del Pick de la Semana**. Incluye picks anteriores/vencidos, con páginas de 30 y actualización manual del estado de envío.

- **Aprobar · Acertado**: requiere confirmar la decisión; guarda el resultado y prepara la publicación citada de X y el aviso habitual de TikTok. La cita de X apunta al tuit original si su URL de publicación está registrada.
- **Denegar · No acertado**: guarda el fallo sin publicación en redes.
- Una decisión confirmada no se puede cambiar ni repetir desde estos controles. La selección y sus datos quedan protegidos frente a edición. Un segundo envío de la misma petición devuelve el resultado guardado y no duplica avisos.
- El enlace `?weeklyResult=<uuid>` mantiene visible el resultado y su selección original aunque se publique otro Pick o venza el anterior.
- Solo administradores pueden resolver y consultar el panel. Los lectores únicamente pueden leer el resultado público, sin datos del administrador ni acceso a la cola o claves.

## X: publicar citando el Pick original

Los aciertos nuevos se publican automáticamente con «✅ Pick acertado · Pick de la Semana» y el enlace al tuit original. X muestra el Pick original dentro de un recuadro, como cita. No se adjunta otra foto (`assets: []` en Buffer). La imagen que aparece dentro del recuadro pertenece al Pick original.

Si no se dispone de la URL original confirmada, X queda en estado `manual_reply` para revisión: no se publica un aviso suelto. Los resultados existentes no se reencolan. El botón manual de cita solo se ofrece cuando corresponde esa revisión, para no duplicar los envíos automáticos.

## Instalación y comprobación

Aplicar `supabase/20_cam_weekly_results.sql` después de `19_cam_social_publication.sql`, y luego `21_cam_weekly_x_text_reply.sql` y `22_cam_weekly_x_quote.sql`. No cambia resultados de picks existentes ni los aprueba automáticamente. La integración social y el cron existentes siguen gestionando los envíos independientes y sus errores.

`tests/weekly-results.sql` verifica resultados, permisos, ausencia de envíos al fallar, snapshots, duplicados, inmutabilidad y picks vencidos dentro de una transacción que se revierte. Desactiva los envíos solo dentro de esa transacción. No publica pruebas en redes.

`node tests/weekly-results-ui.mjs` verifica los controles, confirmación, doble clic, recuperación tras perder una respuesta, lectores, enlace público y respuesta preparada. La nueva comprobación de GitHub Actions también ejecuta la regresión social y del editor de noticias.
