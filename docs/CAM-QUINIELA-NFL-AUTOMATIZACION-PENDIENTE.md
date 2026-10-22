# CAM SPORTS — Automatización completa de jornadas NFL
**Estado: PENDIENTE. Implementar DESPUÉS de que se integre y verifique la Quiniela NFL base en la actualización actualmente en curso.**

> Este documento es una especificación, no una implementación. No activar tareas programadas ni publicar modificaciones hasta integrar primero la implementación base, comprobar accesos a proveedores y validar staging.

## Resultado esperado
La quiniela prepara y abre jornadas de forma autónoma; recibe cambios de calendario y resultados oficiales; cierra picks al comenzar cada partido; liquida puntos y rankings sin duplicados; conserva el historial; prepara la próxima semana sin que un admin acceda ni se redepliegue GitHub Pages.

## Dependencia y ruta de trabajo
1. Esperar a que la actualización actual de Quiniela NFL esté incorporada y sus migraciones/frontend/pruebas estén estables.
2. Leer el esquema y reglas de puntos **reales** de la Quiniela NFL resultante; integrar sin crear un sistema de picks paralelo ni cambiar otras tablas.
3. Desarrollar en una nueva rama de implementación y **Supabase staging**; entregar PR separado. Producción solamente tras aprobación, proveedores activos y verificación.
4. Situación observada el 22/oct/2026: todavía no se ve un módulo o tablas de `quiniela` en `main` ni en `RCM-Sports-Staging`. Volver a comprobar tras terminar la actualización.
5. Mantener el login por usuario (sin exigir email), catálogo existente de logos (`assets/nfl-teams.js`), sistema de rankings, estilos día/noche y compatibilidad móvil/desktop.

## Proveedores (bloqueantes para activar)
- Preferido **SportsDataIO**, sujeto a contrato y verificación de endpoints NFL de temporada, fase y semana oficial, calendario completo, equipos e IDs, kickoff, estado (scheduled/live/final/postponed/cancelled), resultados oficiales y correcciones. Ver: https://sportsdata.io/developers/api-documentation/nfl
- Probabilidades: **The Odds API** u otra fuente autorizada de moneyline `h2h` NFL anterior al comienzo. Ver: https://the-odds-api.com/liveapi/guides/v4/ . Verificar plan, límites, derechos de exhibición, libro o criterio de consenso, estabilidad y cobertura.
- Validar **claves reales** y presupuesto de llamadas antes de activar. Nunca inventar cuotas, scores, probabilidades o fechas. Nunca filtrar secretos en JavaScript público, GitHub, errores o logs.
- Mapear identificadores externos al catálogo de equipos ya presente; **mostrar logos existentes al escoger cada ganador, sin descargarlos otra vez.**
- Las probabilidades tomadas de odds americanas se calculan de modo reproducible y, si se requiere, se ajustan para quitar margen (vig). Congelar fuente, cuotas, cálculo, momento y puntos para cada equipo antes de abrir y **respetar la fórmula de puntuación ya aprobada en la Quiniela base**.

## Backend, datos y programaciones
- Migraciones versionadas **aditivas** y funciones de Supabase Edge; `Supabase Cron` / `pg_cron` para ejecutarlas con autenticación servidor a servidor.
- **Cada hora:** sincronizar temporada oficial, fase, semana actual/siguiente, fixtures, IDs, cambios de kickoff y estados. Preparar siguiente semana.
- **Cada 10 min durante actividad NFL:** consultar resultados, liquidar Final confirmados y procesar correcciones. Saltar consultas innecesarias fuera del periodo activo y respetar rate limits con backoff.
- Identidad única de cada fixture y semana: `provider + external_game_id`, temporada, fase y semana (no únicamente fecha). Upserts sin borrar picks; guardar `last_attempt`, `last_success`, `sync_status`, errores y versión de origen.
- Estados de jornada como `preparing`, `ready`, `open`, `in_progress`, `settling`, `closed` y `sync_pending` (adaptar a esquema base).
- Validar contra lista **completa** de partidos oficiales para la fase/semana. Solo abrir cuando estén completos y haya puntos y probabilidad reales congelados; nunca exponer una quiniela parcial.
- Abrir jornada siguiente en función de temporada/fase/semana y estados oficiales, nunca solo por calendario. Dejar jornada anterior visible en historial.
- Los datos cacheados sostienen la UI ante pérdida de red; mostrar timestamp de última actualización válida y estado pendiente sin borrar registros.

## Selección, bloqueo y puntos
- Garantizar pronóstico individual por usuario/partido, usando identidad del backend y RLS apropiado. Comprobar en **servidor y dentro de la transacción** `now() < kickoff_oficial` y estado abierto al guardar/editar. No confiar en el reloj del usuario ni en ejecución puntual del cron.
- Al empezar juego, selecciones quedan bloqueadas; movimientos de hora antes del partido se sincronizan y se aplica una política documentada de reprogramación sin permitir edición retroactiva.
- Solo liquidar cuando proveedor confiable indique **Final**. Determinar ganador de resultado confirmado, compararlo con cada pick y asignar puntos de dificultad **congelada**; ajustar ranking de jornada y acumulado.
- Idempotencia real: restricciones únicas + transacción/ledger + control de concurrencia. Reprocesar cron, Webhooks o reintentos nunca duplica puntos.
- Correcciones oficiales: historial auditable, versión de resultado y asiento compensatorio; recalcular ranking sin borrar auditoría.

## Casos especiales
- **Aplazamiento:** conservar picks, actualizar fecha/estado y bloqueo; no reabrir luego de kickoff original de manera automática sin política explícita.
- **Cancelado / no-contest:** anular evento, 0 puntos y excluir de aciertos computables.
- **Empate:** en formato binario de elegir ganador, no hay pronóstico ganador; marcar empate y 0 puntos a ambos (validar con reglas de quiniela base antes de activar).
- **Suspendido/indeterminado:** mantener pendiente, no liquidar por marcador provisional. Intervención administrativa excepcional debe dejar quién, qué y por qué.

## Protección y observabilidad
- Secretos vía Supabase Secrets/Vault, nunca `service_role` en cliente. RLS en toda tabla expuesta; controles de privilegios mínimos en RPC/funciones; autorización admin servidor.
- Reintentos seguros con backoff para 429, 5xx y timeouts, deduplicación y alertas a admins si fallos persisten; proveedor caído **no** elimina jornadas ni adjudica resultados.
- Métricas: actividad de cron, cuotas del proveedor, sincronización por semana, partidas pendientes, liquidaciones, correcciones, discrepancias de calendarios y tasa de error.
- Opción admin extraordinaria de reparación/sincronización manual con auditoría; no operación manual ordinaria.

## Verificación de aceptación (staging)
- [ ] Simulación íntegra Semana A abierta → picks → kickoff bloquea cada juego en backend → finales confirmados → puntos/rankings → archivado → Semana B abre automáticamente.
- [ ] Ningún juego duplicado; no se pierden picks ni puntos existentes con migración o reconexión.
- [ ] El cron repetido, dos procesos simultáneos y replay de un Final dan **un único** asiento de liquidación.
- [ ] Corrección oficial crea compensación correcta y deja trazabilidad.
- [ ] Aplazado, cancelado, empatado, sin cuotas y suspensión tienen reglas comprobadas; nunca datos inventados.
- [ ] Pruebas de 429, latencia, API sin respuesta, desfase de zona horaria, cruce regular/postemporada y temporada nueva.
- [ ] Las selecciones siempre muestran logos de ambos equipos de assets actuales.
- [ ] Desktop/móvil y día/noche, historial, totales/ranking semanal y acumulado correctos.
- [ ] Configuración de proveedor/licencia, secretos, costos, cron y recuperación documentados; sin secretos en diff.
- [ ] Evidencias de ejecución staging y revisión de seguridad antes de habilitar producción.

**No cambiar la apariencia actual ni los sistemas de Picks/Takes ajenos a esta Quiniela salvo donde la integración sea imprescindible.**
