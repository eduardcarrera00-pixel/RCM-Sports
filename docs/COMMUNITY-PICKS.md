# Picks comunitarios — implementación inicial

## Qué incluye
- Publicación de una o dos selecciones declaradas, título y explicación.
- Cuota americana individual positiva o negativa; cálculo decimal multiplicativo y total americano en el servidor, mínimo +100. Los mercados del mismo partido por nombre normalizado se rechazan; sin proveedor no se garantizan correlaciones ni identidades de eventos.
- Un Pick por cuenta y día calendario de America/Toronto, con restricción única. Ocultar el Pick no libera el cupo; no hay permiso para borrarlo ni cambiar su contenido.
- Upvote/downvote, cambio y retirada de voto. El servidor bloquea votos propios.
- Comentarios y respuestas, relación de padre restringida al mismo Pick. Se muestran hasta 200 comentarios por detalle.
- Feed ordenado por balance de votos o fecha, Top 3 por votos positivos, más cuestionado por votos negativos, Pick semanal por votos positivos dentro de la semana de Toronto. Empates: fecha más antigua e ID, deterministas.
- Enlaces permanentes ?pick=UUID y moderación de Picks/comentarios para editores existentes.
- Mantiene el código de la votación semanal de dos opciones en un desplegable de Picks, separado del Pick comunitario destacado.

## Datos y despliegue
Migración aditiva 20261015060954_community_picks.sql aplicada a staging (vsejmawuvgwlijluuflp) y producción (zahuhmvmqvxaunqebqaa). Crea ae_community_picks, ae_pick_votes, ae_pick_comments y ae_pick_feed. No modifica tablas anteriores. Usa RLS, grants por columna, vista security_invoker y trigger invoker; no añade funciones security_definer. Los administradores siguen definidos por rcm_is_editor().

## Verificación
- PGlite, tests/community-picks.mjs: cuotas, permisos, límite diario, inmutabilidad, votos propios/cambio/retirada, respuestas y moderación.
- Happy DOM, tests/community-picks-ui.mjs: formulario, combinación, publicación con transporte simulado, texto sin HTML ejecutable, enlace/detalle, comentario, acceso a sesión y visibilidad por categoría. Happy DOM no es una comprobación visual de navegador.
- Staging real: transacción con dos usuarios temporales, publicación +400, voto y comentario; ROLLBACK final, sin datos persistidos.
- Producción: lectura anónima del feed mediante rol SQL y API REST. No se publicaron Picks de prueba en producción.
- Advisors de seguridad: sin hallazgos en los objetos nuevos; advertencias existentes sobre funciones security_definer anteriores y configuración Auth no se modificaron. Referencia de revisión: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Pendiente revisión visual de escritorio/móvil y flujo con sesión real en navegador.

## Límites explícitos
No verifica cuotas, partidos, fechas de eventos o resultados externamente. No hay pagos ni apuestas. La cuota y el partido son declarados por el usuario. No incorpora logos de equipos sin catálogo validado.
No modifica el registro actual ni resuelve todavía el registro sin correo, recuperación, APIs, Takes, denuncias ni histórico administrado de Picks acertados.
El esquema de producción observado no contiene pick_editions/sports_picks ni champions_rankings/champions_clubs; las integraciones anteriores muestran sus estados vacíos si faltan esos esquemas. No se copian datos de staging a producción automáticamente.

## Recuperación
Revertir los archivos de interfaz del PR. Conservar las tablas nuevas para no perder publicaciones. No eliminar tablas si ya hay datos de usuarios.

## Ejecución local
npm ci
npm run test:picks
