# CAM SPORTS · Salud de la automatización

El sistema se implementa en `supabase/migrations/20261111014000_cam_automation_health.sql`.

## Qué se comprueba

Cada 15 minutos, `cam-automation-health` revisa 15 controles: seis tareas Cron (Picks, sincronización y resultados NFL/Fútbol, y ligas), tres respuestas HTTP válidas de funciones de sincronización/calificación y seis verificaciones de integridad de datos (Picks atrasados, moderación pendiente pasada la fecha, puntos inexistentes, quinielas finales no puntuadas y clasificación mensual estancada).

La calificación de Picks se ejecuta cada 20 minutos mediante el cron existente `ae-settle-picks`. La verificación respeta la moderación, los resultados oficiales y las RPC idempotentes. **No** modifica Picks ni asigna puntos a partir de los diagnósticos; solo detecta posibles retrasos.

## Diagnóstico interno en Supabase (SQL Editor)

```sql
select check_key,category,status,details,checked_at,first_warning_at
from cam_ops.automation_health
order by status desc, check_key;
```

Solo incidencias activas:

```sql
select check_key,details,first_warning_at
from cam_ops.automation_health
where status='warning' order by first_warning_at;
```

Inspeccionar el historial de Cron:

```sql
select j.jobname,r.status,r.start_time,r.return_message
from cron.job j join lateral (
  select status,start_time,return_message
  from cron.job_run_details where jobid=j.jobid
  order by start_time desc limit 1
) r on true
where j.jobname in (
  'ae-settle-picks','cam-nfl-hourly',
  'cam-nfl-results-every-10-min',
  'cam-football-hourly','cam-football-results-every-10-min',
  'cam-monthly-leagues','cam-automation-health'
)
order by j.jobname;
```

**Interpretación:** un `warning` es una alerta de revisión, no permiso para inventar resultados, recalificar Picks ni cambiar una clasificación. La moderación pendiente se muestra por separado de la verificación automática. Un Cron que logra encolar un HTTP puede terminar en error HTTP; por eso también se revisa la respuesta.

## Privacidad

El esquema `cam_ops` y su tabla no están expuestos a `anon` ni a `authenticated`. RLS está activo sin políticas de acceso público. Solo los operadores con acceso autorizado a la base de datos pueden leer el diagnóstico.
