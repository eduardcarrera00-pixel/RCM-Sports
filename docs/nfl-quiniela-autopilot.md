# CAM SPORTS — Quiniela NFL: automatización independiente de GitHub

ESTADO (22/oct/2026): Código preparado en rama dependiente de PR #97. Tres migraciones adicionales aplicadas en Supabase Staging, Edge Function cam-nfl-auto desplegada en Staging. Control de automatización DESACTIVADO hasta configurar y comprobar proveedores. No está en producción.

## Orden de integración
1. Integrar la Quiniela base (PR #97), incluyendo tablas, página y pruebas.
2. Integrar los logos existentes (PR #96); resolver cambios concurrentes y respetar el catálogo de 32 logos. No bajar ni generar logos.
3. Integrar la rama autopilot, y ejecutar en orden:
   - supabase/migrations/20261022190000_cam_nfl_autopilot.sql
   - supabase/migrations/20261022191000_cam_nfl_phase_and_lock.sql
   - supabase/migrations/20261022192000_cam_nfl_admin_alerts.sql
4. Desplegar cam-nfl-auto/index.ts con verify_jwt=false SOLO porque verifica un secreto del servidor >=32 caracteres en cada solicitud. Desplegar también la versión modificada de cam-nfl-sync/index.ts, que impide mezclar ESPN con SportsDataIO al activar la automatización.
5. Verificar claves reales, permisos de API, límites, licencia y cobertura; después habilitar en el proyecto autorizado.

## Proveedores
SportsDataIO NFL: CurrentSeason, CurrentWeek, Timeframes/current, Timeframes/upcoming, Schedules/2026REG (y PRE/POST), ScoresByWeek/2026REG/7 (incluidas fases correspondientes). Fuente: https://sportsdata.io/developers/api-documentation/nfl. Requiere validar la suscripción NFL. La prueba gratuita no garantiza acceso a estas APIs.
The Odds API: /v4/sports/americanfootball_nfl/odds?regions=us&markets=h2h&oddsFormat=american. Fuente: https://the-odds-api.com/liveapi/guides/v4/. Verificar licencia y cuotas. Nunca inventar probabilidades, calendarios o resultados.

## Secretos: fuera del repositorio
Secrets de la Edge Function:
- SPORTSDATAIO_API_KEY (acceso real y autorizado NFL)
- THE_ODDS_API_KEY (cuotas moneyline)
- CAM_NFL_CRON_SECRET (aleatorio criptográfico, al menos 32 caracteres)
- SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY gestionados por la plataforma

En Supabase Vault: cam_nfl_edge_url = URL completa de función https://<project-ref>.supabase.co/functions/v1/cam-nfl-auto; cam_nfl_cron_secret = mismo valor de CAM_NFL_CRON_SECRET. Crear usando las herramientas administrativas de Supabase, nunca insertar claves en GitHub o SQL versionado.

## Frecuencia
- cam-nfl-auto-hourly: minuto 07 de cada hora; consulta fase/jornada oficial actual, anterior y siguiente, partidos, cambios de horario, cuotas y resultados, e intenta abrir semanas completas.
- cam-nfl-auto-results: cada 10 minutos, pero solo envía HTTP si hay partidos activos o próximos.
- Ambos trabajos usan Supabase Cron + pg_net; no necesitan visitas ni redeploy de GitHub Pages.
- Mientras cam_nfl_automation_control.enabled=false, las funciones programadas salen sin llamadas HTTP externas ni consumo de API.
- El workflow de GitHub ya no tiene programación periódica; queda únicamente disparo manual legado.

Tras validar TODO, ejecutar en la base del entorno que corresponda:
    update public.cam_nfl_automation_control
      set enabled=true, updated_at=now()
    where singleton=true;
Para pausar, poner enabled=false.

## Garantías
- RLS: partidos de jornadas pendientes no visibles para usuarios; editor puede inspeccionarlos.
- Identidad estable del partido SportsDataIO y fase PRE/REG/POST; no mezclar playoffs semana 1 con regular semana 1.
- Apertura solo si la semana tiene el número completo de juegos oficiales, todos tienen matchup válido, kickoff UTC futuro, cuotas reales y puntos congelados.
- Reprogramaciones conservan pick_lock_at: hora más temprana conocida; el servidor no reabre juegos anteriormente bloqueados.
- Un pick por usuario y partido; hora de inicio y semana publicada verificadas dentro de transacción del servidor.
- Resultados finales confirman ganador; trigger existente liquida sin duplicar. Cambios oficiales recalculan y auditan. Empates y cancelaciones: cero. Ningún resultado provisional puntúa.
- Historial de semanas y puntos persiste, sin modificar Picks/Takes de otras secciones.
- Pérdida de proveedor: nunca eliminar registros; conservar última información, estado pendiente, logs y reintento. Tras 3 fallos consecutivos crear un aviso visible a editores en CAM SPORTS. No hay alertas por email externas configuradas.

## Verificación de Staging
Ejecutada la prueba tests/cam-nfl-autopilot.sql dentro de BEGIN/ROLLBACK:
Semana A incompleta no abre -> cuotas completas -> abre -> usuario pronostica -> final -> puntos -> mismo final no duplica -> corrección -> empate y cancelación -> se cierra A -> se abre B -> pick histórico persiste -> 3 fallos generan un solo aviso.
Se comprobaron también dos cron instalados y estado enabled=false.

PENDIENTE para producción: probar respuestas reales de SportsDataIO y The Odds API con las claves válidas, fase/playoffs/nueva temporada, consumo 429, Cron+Vault+HTTP de extremo a extremo, móviles y escritorio con la combinación final de PR #97 y #96. No activar antes de superar estos controles y revisar los costos/licencias.

## Reversión
Desactivar cam_nfl_automation_control.enabled. NO borrar tabla ni registros históricos ni puntuaciones. Inspeccionar cam_nfl_sync_runs y cam_nfl_admin_alerts, corregir servicio y reanudar tras verificar.
