# Conector MCP de CAM Sports (consulta y administración)

Desde el 30 oct 2026. Servidor MCP remoto para usar CAM Sports dentro de Claude: el
dueño pregunta en cualquier chat y Claude consulta los datos en vivo de la web. Desde el
4 nov 2026 también administra (herramientas `admin_*`), con las mismas reglas que la web.

- Código: `supabase/functions/cam-mcp/index.ts` (Edge Function `cam-mcp`, `verify_jwt = false`,
  sin dependencias; MCP «Streamable HTTP» sin sesiones).
- Migraciones: `supabase/migrations/20261030150000_cam_mcp_analytics_summary.sql` y
  `20261104150000_cam_mcp_admin.sql` (administración).
- Dirección: `https://zahuhmvmqvxaunqebqaa.supabase.co/functions/v1/cam-mcp`
- Prueba sin red: `npm run test:mcp`. SQL de la administración: `bash tests/cam-mcp-admin-sql.sh`
  (PostgreSQL local; `CAM_MCP_PG="host=… port=… user=postgres"`).

## Acceso
Solo con la clave privada del dueño (no está en el repositorio; el código guarda su
huella SHA-256 en `ACCESS_KEY_SHA256`). Se envía como `Authorization: Bearer <clave>`
(recomendado), al final de la ruta (`…/cam-mcp/<clave>`) o como `?key=<clave>`.
Sin clave responde 401.

Para cambiar la clave: generar una nueva, sustituir la huella en `ACCESS_KEY_SHA256`
y volver a publicar la función. La anterior deja de valer al instante.

## Datos
Todo se lee con la clave publicable de Supabase, así que las reglas RLS deciden lo
mismo que para un visitante (sin borradores, Takes ocultos ni elecciones privadas de
quiniela). Única excepción: la herramienta `visitas` usa la clave secreta para
`cam_mcp_analytics_summary()`, de solo lectura y ejecutable solo por `service_role`.

## Herramientas
`resumen`, `buscar_noticias`, `leer_noticia`, `opiniones`, `takes`, `leer_take`,
`clasificacion_takes`, `picks`, `clasificacion_picks`, `power_rankings`, `quiniela`,
`clasificacion_quiniela`, `quien_sera_campeon`, `visitas`, `perfil_jugador`.

Fechas en hora de Toronto; enlaces con el mismo formato corto que la web
(`?t=` Takes, `?p=` Picks, `?e=`/`?r=` Pick de la semana, `?opinion=`).

Si una tabla o función pública cambia de nombre o de columnas, hay que actualizar
también este conector y su prueba.

## Administración (desde el 4 nov 2026)
Las herramientas `admin_*` llaman con la clave secreta a `public.cam_mcp_admin(acción, argumentos)`,
ejecutable solo por `service_role`. Esa función:

- Actúa como la cuenta de `cam_mcp_private.config` (la del dueño): pone sus «claims» solo durante
  la transacción, así `auth.uid()` es esa cuenta y las funciones de la web siguen comprobando
  `rcm_is_editor()` por dentro. Si la cuenta deja de estar en `editors`, no hace nada.
- Solo llama a una lista cerrada de funciones de la web (`allowed` en `cam_mcp_private.run`) y a
  unas pocas acciones propias para lo que la web hace directamente en tablas (noticias, ocultar
  Picks y comentarios, mensajes y pausa de las promociones de redes).
- Registra cada cambio en `cam_mcp_private.admin_log`, también los fallidos (el cambio se deshace,
  el registro queda). Las consultas no se registran. Se ve con `admin_consultar` → registro.

Herramientas: `admin_pendientes` y `admin_consultar` (solo consulta) y `admin_takes`,
`admin_campeon`, `admin_matriz`, `admin_quiniela`, `admin_picks`, `admin_pick_editor`,
`admin_noticia`, `admin_opinion`, `admin_power_rankings`, `admin_redes`, `admin_sitio`,
`admin_parties` (cambian la web; marcadas como no de solo lectura para que Claude pida permiso).

Para quitarle la administración sin tocar la consulta:
`revoke execute on function public.cam_mcp_admin(text, jsonb) from service_role;`
