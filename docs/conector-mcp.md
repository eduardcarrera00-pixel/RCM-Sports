# Conector MCP de CAM Sports (solo consulta)

Desde el 30 oct 2026. Servidor MCP remoto para usar CAM Sports dentro de Claude: el
dueño pregunta en cualquier chat y Claude consulta los datos en vivo de la web.
No publica ni cambia nada.

- Código: `supabase/functions/cam-mcp/index.ts` (Edge Function `cam-mcp`, `verify_jwt = false`,
  sin dependencias; MCP «Streamable HTTP» sin sesiones).
- Migración: `supabase/migrations/20261030150000_cam_mcp_analytics_summary.sql`.
- Dirección: `https://zahuhmvmqvxaunqebqaa.supabase.co/functions/v1/cam-mcp`
- Prueba sin red: `npm run test:mcp`.

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
