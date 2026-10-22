# La Quiniela NFL | CAM SPORTS

## Estado y alcance

Frontend, tablas y funciones de puntuación independientes de Takes, autenticación CAM SPORTS, editor, clasificaciones y perfil. Añade una sección **solo al final de NFL**. Nunca sustituye los rankings existentes.

La integración importa calendario y resultados reales desde la API de marcadores ESPN (no oficial ni garantizada por contrato) y cuotas moneyline verificadas desde The Odds API (si está configurada). Al faltar cuotas, la quiniela de ese partido **permanece cerrada** hasta que un administrador aporte dos cuotas reales. No hay resultados, probabilidades ni usuarios ficticios en producción.

Temporada regular: jornadas 1–18, con nflverse como fuente principal. Los playoffs se sincronizan a partir del calendario ESPN confirmado: 19 = Wild Card (postemporada 1), 20 = Divisional (2), 21 = Conferencias (3), 22 = Super Bowl (5); se excluye el Pro Bowl. La validación evita crear partidos cuando el proveedor no los confirma.

## Preparar producción

1. Revisar y aplicar en producción `supabase/migrations/20261022170000_cam_nfl_quiniela.sql`, `supabase/migrations/20261022180000_cam_nfl_cron_vault.sql` y `supabase/migrations/20261022190000_cam_nfl_public_pick_breakdown.sql`, en este orden. **No** ejecutarlas otra vez en Staging; allí ya se probaron los cambios correspondientes.
2. Desplegar `supabase/functions/cam-nfl-sync/index.ts` como `cam-nfl-sync`, con verificación JWT desactivada **solo porque** el código verifica la sesión, permisos de `editors` y el secreto propio de cron antes de utilizar `service_role`.
3. Utilizar el token generado de forma privada por `cam_nfl_cron_vault.sql` y validado por `cam_nfl_validate_cron` (solo service_role); no copiarlo en GitHub. `THE_ODDS_API_KEY` es opcional si nflverse facilita cuotas moneyline reales. Supabase proporciona internamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Nunca publicar claves privadas.
4. Instalar `supabase/production/enable_cam_nfl_sync_cron.sql` después de desplegar la función y las migraciones. Programa una consulta cada hora, más comprobaciones cada 10 minutos en ventanas de partidos; se omiten duplicados cuando ya existe el automatizador `cam-nfl-auto-*`. El workflow de GitHub queda únicamente como disparo manual opcional, no como programador paralelo.
5. Desde una cuenta administradora, abrir la sección NFL y usar **Sincronizar NFL** para revisar los partidos de la semana. La función normaliza las abreviaturas de los equipos y descarta datos que no puede verificar. Si hay cuotas verificadas, congela probabilidades y puntos antes de abrir cada encuentro. Como opción alternativa, introducir ambas cuotas americanas reales en los controles del partido.
6. Comprobar manualmente una semana importada, probar el guardado con una cuenta registrada y verificar en la base de datos el resultado, los puntos y la clasificación después de un evento oficialmente finalizado.

El sincronizador importa la semana corriente, anterior y siguiente en una ejecución automática. Las invocaciones manuales de administradores pueden especificar temporada y semana. Los resultados provisionales no puntúan; los definitivos y sus correcciones se procesan mediante trigger SQL transaccional e idempotente.

## Reglas de puntos y seguridad

`p = probabilidad implícita normalizada`; `puntos = max(2, min(12, round(2 / p)))`. Ejemplos: 80 % → 3 puntos, 50 % → 4 puntos, 25 % → 8 puntos. Un fallo suma 0; un empate o anulación suma 0 y no computa como fallo. Las probabilidades se congelan una sola vez antes de que haya selecciones.

Los pronósticos se escriben solo vía `cam_nfl_save_pick`, que consulta la hora del **servidor**, bloquea la fila, verifica la sesión, el partido y el equipo. RLS deja a cada usuario consultar solo sus selecciones. Los visitantes solo consultan partidos y tablas agregadas. Las tablas de resultados, probabilidades y auditoría no conceden modificaciones a clientes. Los administradores se validan mediante `rcm_is_editor()`.

Los rankings usan solo resultados finales con ganador, y agrupan cada mes por fecha de partido en horario `America/New_York`, incluso cuando la temporada cruza de año. Los puntos de quiniela permanecen independientes de Savant, Rookie, Genios, Anoetos y Picks.

## Proveedor, disponibilidad y limitaciones

- La API ESPN utilizada es un endpoint público **no oficial** (puede cambiar o limitarse). Se recomienda migrar a un proveedor con SLA antes de depender de ella para concursos de gran escala.
- The Odds API usa una clave particular y puede requerir suscripción, límites o tarifas. El juego seguirá funcionando con configuración manual comprobada y auditada si no hay clave; **no** calculará probabilidades imaginarias.
- Si el sincronizador no corre, un administrador puede ejecutarlo desde el módulo, revisar partidos y liquidar resultados. Las correcciones quedan auditadas y recalculan los puntos existentes sin duplicarlos.
- Las selecciones temporales se conservan localmente por identificador de usuario y partido hasta guardarse; el sistema definitivo sigue siendo Supabase.
- La puesta en producción requiere migración, despliegue de Edge Function y configuración del cron/secreto. Abrir solo la rama o fusionar el frontend no activa por sí mismo la automatización.


## Sincronización totalmente automática (22 octubre 2026)

Se confirmó en Staging una sincronización HTTP 200 de **42 partidos oficiales** de 2026 (semanas 6–8), con **28 partidos futuros con cuotas reales congeladas** para semanas 7 y 8. La fuente principal ahora es el calendario de `nflverse/nfldata` (`data/games.csv`), que contiene IDs, equipos, kickoff, marcadores y moneylines; ESPN queda como alternativa si falla la descarga de nflverse. Los resultados solo se consideran definitivos al existir ambos marcadores y pasar el margen de duración definido; los resultados preliminares no puntúan.

Ya no hace falta una clave de The Odds API para abrir partidos cuando nflverse entrega ambas moneylines. La clave `THE_ODDS_API_KEY` sigue siendo **opcional** para cobertura de cuotas adicional; nunca se inventarán probabilidades. Fuente de datos: nflverse/nfldata, sujeto a la atribución CC BY 4.0.

Para activar el cron en producción: aplicar `supabase/migrations/20261022180000_cam_nfl_cron_vault.sql`, desplegar la Edge Function y aplicar `supabase/production/enable_cam_nfl_sync_cron.sql`. La migración genera el token con `gen_random_bytes` directamente en Supabase Vault. La Edge Function lo valida con una RPC privada exclusiva de `service_role`; nadie debe copiarlo a Github. Supabase Cron usa `pg_cron` y `pg_net` y funciona aun sin administradores conectados. El flujo de GitHub Actions es solo manual y no necesario para esta automatización.

## Pruebas

`node tests/nfl-quiniela-browser.cjs` comprueba con fixtures **solo de prueba** el diseño día/noche, móvil/escritorio, guardar selecciones y estadísticas del perfil en Chromium. Se ejecuta automáticamente en el Pull Request por `nfl-quiniela-tests.yml`.

En Supabase Staging se aplicó la migración y se comprobó en una transacción revertida que repetir una liquidación no suma doble, corregir el ganador recalcula el resultado y empatar lo anula. Aún deben verificarse con usuarios reales autorizados los RPC administrativos, el proveedor externo, errores de API y la sincronización programada antes de activar producción.

## Logos, resúmenes y estadísticas públicas

La Quiniela reutiliza los 32 logos ya catalogados en `assets/nfl-teams.js`. `assets/cam-nfl-quiniela-logos.js` reconoce variaciones de abreviaturas y muestra ambos escudos en las tarjetas, el resumen seleccionado, los resultados, el historial y el desglose de rankings. Los picks rivales solo se hacen públicos **tras liquidarse** mediante `cam_nfl_public_pick_breakdown`; no se muestran selecciones pendientes.

Las vistas incluyen apertura de jornada, calendario, progreso y puntos potenciales, rankings independientes y detalles semanales, en escritorio y móvil con modo día/noche. Las reglas son totalmente independientes de Takes y Picks.

El script de producción usa Supabase Cron a minuto 7 de cada hora y cada 10 minutos mientras hay partidos cercanos o en juego. Deben verificarse los resultados de `cron.job_run_details` en el proyecto de producción.

**Staging (verificado):** 42 partidos reales, 28 abiertos con cuotas congeladas y 14 finalizados. La producción permanece pendiente de migración, aprobación del Pull Request y prueba integral de proveedor y jobs.

**Pruebas propuestas:** `node tests/cam-nfl-quiniela-logos.mjs` y `node tests/nfl-quiniela-browser.cjs`. El segundo incluye las insignias en enfrentamientos, resumen e historial y las cuatro combinaciones móvil/escritorio y día/noche. Los resultados de CI deben revisarse antes de la fusión.
