# CAM SPORTS — La Quiniela NFL

## Estado de entrega (22 de octubre de 2026)

La Quiniela está desarrollada en un Pull Request **pendiente de revisión y fusión**. Las tablas y la Edge Function se han instalado **solo en Supabase Staging**. El entorno público de producción **no está activado**. No presentar como automático en producción hasta validar credenciales, jobs, sincronización real y despliegue.

La sección figura **al final de NFL** y no aparece en Picks, Fútbol ni Home. Mantiene el diseño editorial día/noche y el sistema de usuarios existente. No toca el cómputo de Picks, Takes, Savant, Rookie, Genios ni Anoetos.

## Arquitectura

- `index.html`: encabezado, selector de temporada/jornada, partidos, resumen de selecciones, historial y clasificaciones, panel administrativo, integración con perfiles.
- `assets/cam-nfl-quiniela.js`: interacción, guardado de selecciones parciales, persistencia con RPC, historial, perfil, ranking semanal/mensual/temporada y detalle de picks resueltos.
- `assets/nfl-teams.js` y `assets/cam-nfl-quiniela-logos.js`: catálogo **existente** de 32 escudos NFL, normalización de IDs y componente de visitante/local/selección. No se descargan ni duplican logos.
- `supabase/migrations/20261022170000_cam_nfl_quiniela.sql`: partidos, puntos congelados, picks, auditoría, validación servidor, RLS, liquidación idempotente y rankings.
- `supabase/migrations/20261022190000_cam_nfl_quiniela_cron_and_breakdown.sql`: Supabase Cron con Vault y desglose público **solo de pronósticos resueltos**.
- `supabase/functions/cam-nfl-sync/index.ts`: importación de calendario y marcadores desde ESPN, más probabilidades moneyline verificadas cuando hay proveedor configurado.

**Datos:** ESPN ofrece un endpoint público no oficial y sin SLA; SportsDataIO es una alternativa preferible para operación empresarial, pero requiere acceso y licencia que no se han acreditado. The Odds API es independiente para cuotas reales. No se generan pronósticos, probabilidades ni resultados ficticios. Confirmar los términos de uso de cada proveedor antes de producción.

## Fases NFL

Temporada regular: semanas 1–18. Playoffs: 19 = Wild Card (ESPN postseason 1), 20 = Divisional (2), 21 = Finales de conferencia (3), 22 = Super Bowl (5). La semana 4 de postemporada en ESPN (Pro Bowl) queda fuera. Si ESPN cambia su calendario de playoffs, revisar el mapeo antes del lanzamiento. En temporada baja no se generan juegos ficticios: se conservan los históricos.

## Puntos, bloqueo y seguridad

Probabilidad `p` = probabilidad implícita moneyline normalizada; puntos congelados `max(2, min(12, round(2/p)))`. Pronóstico acertado = puntos asignados, fallado/empatado/cancelado = 0. Los empates o anulaciones no cuentan como fallo. Las cuotas se congelan antes de abrir el partido y permanecen iguales para todos los participantes.

El cierre de un partido se controla en `cam_nfl_save_pick` con hora de servidor, RLS, `user_id=auth.uid()` y bloqueo de fila. No existe un INSERT/UPDATE directo para los usuarios. El resultado oficial recalcula por trigger en forma idempotente y las correcciones administrativas quedan auditadas. Las selecciones pendientes sobreviven localmente hasta guardarse; solo los picks confirmados en Supabase cuentan.

Las clasificaciones independientes ordenan puntos, aciertos y efectividad. Los detalles de pronósticos de otros usuarios se consultan mediante `cam_nfl_public_pick_breakdown` y **solo incluyen partidos finalizados, empatados o cancelados**; no exponen predicciones anticipadas de rivales.

La Edge Function requiere una sesión real de administrador o token cron de por lo menos 32 caracteres. Un secreto vacío **no autoriza** invocaciones.

## Pasos para producción

1. Revisar con pruebas de regresión la rama de integración y fusionarla con la implementación base; publicar desde el repositorio principal cuando esté aprobada.
2. Aplicar en **producción** las dos migraciones SQL, en orden cronológico. No volver a aplicarlas en Staging; allí ya están instaladas.
3. Desplegar la Edge Function `cam-nfl-sync`. Requiere `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; mantener `verify_jwt=false` **solo** porque el propio código valida tanto el administrador como el secreto del cron antes de usar la service key. Restringir roles y auditar.
4. En Supabase Edge Secrets configurar `CAM_NFL_CRON_SECRET`, valor aleatorio de al menos 32 caracteres; debe coincidir con el token secreto que se guardará en Vault. Configurar `THE_ODDS_API_KEY` si existe una suscripción válida; de lo contrario los partidos nuevos seguirán **cerrados** hasta cargar cuotas moneyline reales y auditadas desde administración.
5. Guardar **solo en Supabase Vault** los secretos `cam_nfl_sync_url` (URL HTTPS del proyecto terminado en `/functions/v1/cam-nfl-sync`) y `cam_nfl_cron_token` (mismo `CAM_NFL_CRON_SECRET`). Por ejemplo, desde un entorno administrativo y **sin almacenar secretos en Git**:
   ```sql
   select vault.create_secret(
     'https://REF-DEL-PROYECTO.supabase.co/functions/v1/cam-nfl-sync',
     'cam_nfl_sync_url'
   );
   -- En una sesión segura: crear también cam_nfl_cron_token con el valor real.
   ```
6. Comprobar `cron.job`: cada hora a minuto 7 y cada 10 minutos durante ventanas de partido; **no duplicar** tareas existentes `cam-nfl-auto-hourly`/`cam-nfl-auto-results`. La migración evita crear tareas paralelas cuando estas ya están presentes. `.github/workflows/cam-nfl-sync.yml` queda como **disparo manual de emergencia**, sin agenda duplicada.
7. Confirmar que una ejecución real ha importado temporada, jornada y todos los enfrentamientos; validar 32 logos, cuotas, selecciones, bloqueo individual y resultados oficiales. Comprobar `cron.job_run_details` y `net._http_response` mediante consultas administrativas cuando corresponda.
8. Ejecutar los tests y revisar estilos día/noche, móvil/escritorio, perfiles, rankings y módulos existentes. Confirmar publicación de GitHub Pages en `https://camsports.github.io/`.

**Sin el token y las claves del proveedor no afirmar sincronización operativa.** La función `cam_nfl_cron_dispatch` no realiza llamadas si faltan los secretos de Vault. Si el proveedor está caído, se conservan los últimos datos; no se aprueba ninguna cuota o resultado inventado.

## Tests

- `node tests/cam-nfl-quiniela-logos.mjs` — 32 logos canónicos y mapeos externos, selección, bloqueo y resultados.
- `node tests/nfl-quiniela-browser.cjs` — Chromium en móvil/escritorio y día/noche, logos en partido/resumen/historial, guardado, perfil y ausencia de overflow horizontal.
- En Staging: crear y liquidar picks dentro de una transacción revertida; comprobar idempotencia, corrección, empate y el RPC de resultados públicos. El despliegue a producción y una integración real del proveedor siguen siendo verificaciones separadas.
