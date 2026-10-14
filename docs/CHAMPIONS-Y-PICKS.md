# Champions y Picks — entrega anterior

> La liga AE SPORTS sustituye en la interfaz la votación simple descrita aquí. Se conservan sus tablas y votos históricos. Para la instalación actual consulta [AE-SPORTS.md](AE-SPORTS.md).

Rama: `feature/champions-power-rankings`. No se fusiona ni se migra producción automáticamente.

## Implementado

- NFL conserva tablas, RPC, borradores, logos y publicación. Solo muestra la edición; desaparecen pausa y fecha visibles. El teclado, rueda o toque detienen el desplazamiento y habilitan navegación manual; se respeta movimiento reducido.
- Champions aparece en Todo Fútbol antes de las publicaciones, y se oculta al filtrar un club. Diez clubes distintos, orden manual, borrador privado por administrador, publicación atómica, control de conflictos y comprobación con cliente anónimo. Cada publicación conserva la anterior.
- Catálogo de 36 participantes UEFA 2026/27, con identificadores y escudos del directorio oficial. No se publica ningún ranking de ejemplo. `assets/champions-clubs.json` documenta el catálogo y sirve a las pruebas; producción lo lee de Supabase.
- Dos Picks de la Semana, programables por inicio/cierre. Borrador privado, publicación atómica, enlaces a artículos Picks y edición nueva sin borrar votos anteriores. Un voto por cuenta/edición, cambio idempotente, selección después de recargar y pendientes de login en memoria hasta autenticarse.
- Historial público de ediciones. Resultados pendientes/acertados/fallados/anulados, explicación y fecha. Cinco posiciones destacadas opcionales; sin datos aparecen estados vacíos.
- Correcciones de picks con control de versión y auditoría antes/después. Resolver un pick cierra toda su votación. Desmarcar un destacado conserva el historial. Las posiciones son únicas: para intercambiar dos ocupadas, desmarca una primero.
- Vista por deporte `rcm_pick_performance`: denominador únicamente acertados + fallados.

## Archivos

`index.html`, `assets/community.js`, `assets/community.css`, nuevo `assets/sports.js`, catálogo `assets/champions-clubs.json`; SQL `06` a `09`; pruebas `tests/database.mjs`, `tests/browser.cjs`, `tests/sports-database.mjs`, `tests/sports-browser.cjs` y esta guía.

## Instalación segura

1. Mantener la web actual. En Supabase, ejecutar **solo** `supabase/06_diagnostico_champions_picks.sql`. Guardar los resultados. Verificar que existe `rcm_is_editor()`, `articles.id` UUID y la migración de likes. Si algo difiere, detenerse y adaptar antes de instalar.
2. Respaldar el proyecto con el mecanismo de backups de Supabase o `pg_dump` con credenciales privadas en el entorno local. Incluir esquema, datos, auth y, por separado, archivos de Storage si hay imágenes subidas. Una exportación CSV parcial no es un respaldo completo. Restaurar la copia en un proyecto de pruebas y verificar cuentas, publicaciones, comentarios, votos, likes y NFL. No enviar credenciales al repositorio.
3. En ese proyecto de pruebas ejecutar, en orden: `07_champions_y_picks.sql`, `08_catalogo_champions_2026_27.sql`, `09_verificacion_champions_picks.sql`. Cada instalación es transaccional; los scripts son reejecutables y no borran datos. **No volver a ejecutar 01**: contiene importaciones históricas.
4. Probar la rama contra el proyecto de pruebas. Cambiar URL y clave **publicable** en una copia local de `index.html`, sin subir ese cambio de entorno. Nunca usar service-role en el navegador.
5. Completar las pruebas reales indicadas abajo. Comparar conteos y NFL con el diagnóstico inicial.
6. Con respaldo y pruebas aprobadas, aplicar 07, 08 y 09 en producción. El código anterior tolera esas tablas adicionales.
7. Revisar y fusionar el PR desde GitHub, desplegar Pages y comprobar que se cargó `sports.js?v=20261013-3`. No fusionar antes de tener las tablas.
8. Ante un problema de interfaz, revertir el commit del frontend. Conservar las nuevas tablas y sus datos; no ejecutar DROP como rollback.

## Probar localmente

```sh
git checkout feature/champions-power-rankings
npm ci
npx playwright install chromium
npm run test:database
npm run test:database:observed
npm run test:browser
python3 -m http.server 8000
```

Abrir `http://localhost:8000/`. **La configuración incluida apunta al Supabase real**; cambiarla por un proyecto de pruebas antes de hacer escrituras manuales. Los tests automatizados usan PostgreSQL PGlite y transporte Supabase simulado: no escriben en producción. No abrir editores ni publicar picks ficticios en producción para probar.

## Pruebas reales pendientes antes de desplegar

- Dos cuentas lectoras, un administrador y un visitante sin sesión, en navegadores separados.
- Publicar Champions con diez escudos; verificar mismos orden y edición sin sesión, tras recarga, desde otro navegador. Abrir dos editores para comprobar conflicto de publicación.
- Guardar y reabrir borradores: no deben aparecer públicamente ni a otro administrador. Verificar rechazo de escrituras directas de lectores.
- Publicar dos picks reales de prueba únicamente en staging. Seleccionar, recargar, cambiar y comprobar suma compartida sin duplicación. En visitante: seleccionar, iniciar sesión y comprobar la opción pendiente.
- Programar próxima edición, comprobar visibilidad al inicio y rechazo de votos antes de inicio/después de cierre o sustitución. Confirmar selección anterior en historial.
- Resolver, destacar, reordenar y retirar; recargar desde otra sesión. Intentar destacar perdido/anulado/pendiente y confirmar rechazo. Consultar `pick_audit` como administrador.
- Comprobar comentarios, respuestas, ambos votos, likes, enlaces compartidos, login y subcategorías. Revisar 390 px, 768 px y escritorio, movimiento reducido y navegación con teclado.

## Evidencia y límites

Pasaron `npm run test:database`, `npm run test:database:observed` y `npm run test:browser` (Chromium local mediante `RCM_CHROME_PATH`). Pasó `git diff --check`. Las 36 URLs de escudos respondieron HTTP 200 con firma PNG. Se inspeccionaron capturas de escritorio y móvil. Las pruebas SQL locales comprueban RLS/RPC y restricciones sobre ambos esquemas de fixtures; los tests de navegador simulan el transporte. **No equivalen a validar persistencia real en Supabase**.

La consulta pública de solo lectura durante el desarrollo devolvió NFL `Week 5`. Las tablas `champions_clubs` y `pick_editions` respondieron 404: no se han instalado las migraciones nuevas. No se dispone de credenciales administrativas para respaldar/restaurar el proyecto o validar escrituras reales. No se ejecutó ninguna migración de producción.

Los escudos usan URLs oficiales externas; no se inventan imágenes. La comprobación visual automatizada utiliza imágenes sustitutas para aislar la red: confirmar los diez escudos reales en staging. Para futuras temporadas, añadir filas con otro `season` en una nueva migración y cambiar `sports.season` en `assets/sports.js`. No reemplazar el catálogo anterior. La reordenación de destacados ocupados requiere retirar uno primero. Ediciones publicadas mantienen su horario salvo el cierre automático al resolver; no hay interfaz para reprogramarlas ni cancelarlas. El siguiente inicio debe ser posterior al último programado.

Fuentes de catálogo consultadas el 13-10-2026:
- https://www.uefa.com/uefachampionsleague/news/02a8-2171a88881a0-c70193b972c6-1000--meet-the-2026-27-champions-league-league-phase-teams/
- https://www.uefa.com/uefachampionsleague/clubs/
