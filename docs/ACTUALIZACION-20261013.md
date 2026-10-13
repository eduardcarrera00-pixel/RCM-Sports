# RCM Sports — actualización del 13 de octubre de 2026

Repositorio activo: https://github.com/eduardcarrera00-pixel/RCM-Sports

Base revisada: `d5c36d37ddae171d8b1ef9c12574b7440f07a1cc` (`main`). Rama: `fix/rankings-navigation-20261013`.

Este documento sustituye las instrucciones de instalación anteriores para **esta actualización**. Los documentos ENTREGA y REVISION-SUPABASE se conservan como antecedentes; sus referencias al repositorio anterior no se deben seguir.

## Hallazgos y alcance

- GitHub Pages devolvió exactamente el HTML de main durante la inspección. No se encontró una diferencia de despliegue en ese momento; no se descarta la caché particular de un navegador.
- La API pública real devolvió HTTP 200 y `[]` al consultar `nfl_rankings`, y los 32 equipos del catálogo. El RPC `rcm_publish_ranking` existe: una solicitud sin sesión y sin equipos fue rechazada con `RCM: solo administradores`. No se publicaron datos de prueba en producción.
- La ausencia de filas para el visitante **no distingue** entre no tener ninguna edición publicada y una política RLS que la oculta. No se accedió a borradores privados, cuentas administradoras, SQL Editor ni al esquema completo de producción. La causa exacta del incidente sigue pendiente del diagnóstico 04 y de publicar con una cuenta real.
- Hay un defecto confirmado en el frontend anterior: `loadRanking()` capturaba los errores sin propagarlos; `saveRanking()` mostraba éxito aunque fallara esa lectura. Se corrige comprobando la edición y las diez posiciones con un cliente independiente sin sesión. Los mensajes ahora incluyen el error real de Supabase. Guardar borrador sigue siendo una operación separada.
- La publicación SQL existente ya hace una operación atómica con comprobación de administrador, diez equipos distintos, bloqueo y detección de conflictos. Se conserva: no se reemplazan políticas de producción a ciegas.
- Los likes de artículos dependían de localStorage. En producción no existen aún `article_likes`, `rcm_article_totals` ni `articles.football_team` (404/columna ausente comprobados). Se incluye migración aditiva 03, sin ejecutarla en producción.
- La encuesta y el formulario de boletín son demostraciones locales: el boletín ahora aclara que no guarda correos ni suscribe. En la encuesta, ahora se indica junto a sus cifras. La lista «Más leído» se basa en likes, no en medición de lecturas. El registro usa el mecanismo existente usuario + contraseña con dirección interna; no se modifica Auth.
- `assets/assets/community.js` es una copia idéntica del script anterior y no la carga index.html. Se conserva sin usar; el archivo activo que debe editarse es `assets/community.js`. `Comentarios` también es un archivo histórico, no el punto de entrada.

## Cambios

- Menú: Todos → Picks → NFL → Fútbol → Colegial → NBA → Tenis → Ciclismo. NBA acepta publicaciones guardadas como Básquetbol y como NBA, sin reescribir las anteriores.
- Fútbol: Todo Fútbol, FC Barcelona, Real Madrid, Manchester United; filtro compatible con búsqueda y reinicio al cambiar de categoría. Selector de equipo al crear/editar. Las noticias antiguas permanecen sin equipo y accesibles en Todo Fútbol.
- Orden por fecha de creación, incluso después de editar una noticia antigua. La portada destaca la más reciente.
- Likes: una fila por usuario/artículo, activación y retirada idempotentes, RLS de propietario, conteos compartidos y actualización cada 30 segundos con pestaña visible. No se importan contadores locales de autoría imposible de comprobar; las copias locales antiguas no se borran.
- Tarjetas: comentario más apoyado a partir de votos reales y likes compartidos, sin autor en el resumen de tarjeta. Se mantiene la autoría del artículo.
- Rankings: lectura pública independiente antes de confirmar éxito, errores reales, borradores, reordenación, animación, pausa y lista completa conservados. Recursos comunitarios versionados para renovar la caché.

## Instalación: pasos sencillos, en este orden

**No hacer merge todavía. No volver a ejecutar 01 solamente para instalar estos cambios: ese archivo importa ejemplos históricos.**

1. En GitHub, abre la rama/PR de esta entrega y revisa los cambios. Deja `main` como fuente de Pages.
2. Abre tu proyecto Supabase → SQL Editor → nueva consulta. Copia `supabase/00_inspeccion_solo_lectura.sql` y ejecútalo. Después ejecuta **por separado** `supabase/04_diagnostico_rankings_solo_lectura.sql`. Son lecturas, no migraciones. Si algún objeto falta, detente y comparte el error.
3. Compara `published_rows` con el resultado bajo `role anon`: si ambos son cero, no hay edición publicada; si hay una fila como propietario y cero como anon, hay que revisar las políticas de lectura. `draft_rows > 0` solo demuestra que existen borradores. No prueba una publicación. Conserva también la definición real del RPC y sus permisos para revisarlos.
4. Guarda un respaldo de articles, comments, comment_votes, editors, nfl_rankings y nfl_ranking_drafts, además del esquema/políticas. Si ya existe article_likes, inclúyela y revisa compatibilidad antes de continuar. No compartas contraseñas, claves privadas ni respaldos con datos de usuarios.
5. Tras revisar el esquema y decidir aplicar la mejora, ejecuta **solo** `supabase/03_equipos_y_likes.sql`. La transacción añade la columna, tabla, políticas y funciones; no cambia usuarios ni registros existentes. Si falla, detente: no quites comprobaciones para forzarla. Ejecuta después `05_verificacion_equipos_likes_solo_lectura.sql`.
6. Prueba la rama antes de fusionar. Puedes descargarla con Code → Download ZIP, extraerla y abrir una terminal en la carpeta. Si tienes Python, ejecuta `py -m http.server 8000` y visita `http://localhost:8000`. Esta copia usa Supabase real: cualquier publicación, voto o comentario se guarda realmente. Identifica el contenido de prueba.
7. Como administrador: abre NFL → Editar ranking, selecciona diez equipos y una edición, guarda borrador y confirma que el visitante aún ve la edición anterior. Pulsa Publicar las diez posiciones; abre una ventana privada sin sesión y verifica orden, edición y persistencia después de recargar. Si aparece un error, copia el mensaje completo; la operación puede haberse guardado aunque fallara la confirmación. Reabre el editor antes de reintentar para cargar su versión actual.
8. Con dos cuentas lectoras, comprueba comentarios, respuestas, cambio/retirada de votos, likes y cierre de sesión. Crea/edita una noticia de cada equipo. Cambia imagen/categoría y comprueba que mantiene ID, enlace y comentarios. Repite en móvil.
9. Cuando estas comprobaciones estén bien y autorices la publicación, fusiona el PR con Merge pull request. Espera a que el despliegue de Pages termine y repite el caso NFL en la URL pública. Esta entrega no hace merge ni cambia la configuración de Pages.

## Recuperación sin pérdida de datos

03 está dentro de una transacción: ante un error previo al commit no queda aplicada parcialmente. Si el frontend nuevo falla tras el despliegue, revierte el **commit de frontend** en un nuevo PR. Deja `football_team`, `article_likes`, las funciones y vistas de 03 en la base: el frontend anterior ignora esos objetos y conservarlos evita perder la actividad nueva. El frontend antiguo vuelve a usar likes locales; por eso esta recuperación es temporal. No borres la columna ni la tabla, ni restaures un respaldo antiguo encima de comentarios nuevos. Para retirar definitivamente 03 haría falta exportar los datos nuevos y preparar otra migración revisada.

## Validación

Las pruebas SQL usan PGlite con roles/RLS reales dentro de una base aislada. Las de navegador usan Chromium y un transporte Supabase simulado compartido entre contextos; **no prueban persistencia en tu proyecto real**.

- `npm ci`: completado.
- `npm run build:css`: completado (aviso de Browserslist desactualizado, sin error).
- `npm run test:database` y `npm run test:database:observed`: pasan. Migraciones repetibles, votos anteriores, reglas de propiedad, lectores/admin, rankings atómicos/conflictos, likes compartidos e idempotentes, artículos ocultos y equipos válidos.
- `npx playwright install chromium`: falló por descarga incompleta. Se usa un Chromium alternativo instalado fuera del repositorio para ejecutar la suite; no cambia package-lock.
- Navegador: pasan dos sesiones lectoras, respuestas, votos positivos/negativos/cambio/retirada/fallo/recarga/salida, likes compartidos, enlaces/historial, login sobre artículo, edición de imagen preservando ID/contenido, borrador/publicación, errores y lectura pública, orden NFL tras recarga, menú y alias NBA, crear/editar/filtrar equipos y persistencia simulada, búsqueda, ancho móvil y movimiento reducido. Las imágenes externas y los servicios reales están bloqueados intencionalmente en la suite.

## Límites pendientes

La publicación real de NFL, las cuentas reales, el esquema/privilegios privados y las políticas existentes requieren las comprobaciones de arriba. No se puede afirmar que la migración 01 esté íntegramente aplicada solo porque algunas tablas y el RPC respondan. La edición de imágenes conserva la función existente por URL; no existía carga de archivos a Storage en esta versión y no se añadió. La recuperación automática de contraseñas y las vistas previas sociales por artículo siguen fuera de alcance. No se han borrado datos, ejecutado migraciones remotas, cambiado cuentas, fusionado ramas ni publicado la web.
