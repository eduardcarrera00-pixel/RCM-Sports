# AE SPORTS — implementación, pruebas e instalación

Entrega de desarrollo: 14 de octubre de 2026. Repositorio `eduardcarrera00-pixel/RCM-Sports`, rama `feature/champions-power-rankings`, PR #2. Esta guía sustituye las instrucciones de Picks simples de `CHAMPIONS-Y-PICKS.md`.

## Estado real

El código está preparado para revisión y pruebas de instalación. **No está activada la liga en producción**: no se han aplicado migraciones, desplegado funciones, contratado proveedor, cambiado DNS ni fusionado el PR. No hay partidos/cuotas ficticios en la aplicación; los fixtures solo existen en `tests/`.

Lectura anónima del proyecto configurado en `index.html` y `site.config.json`: `champions_rankings`, `champions_clubs`, `pick_editions`, `ae_events` y `ae_seasons` devolvieron HTTP 404 / PGRST205 durante esta entrega. La consulta NFL tuvo timeout en esa comprobación. Un 404 de PostgREST indica que la relación no está disponible en su esquema expuesto; no sustituye una inspección SQL del propietario. Si se instalaron las migraciones en otro proyecto, comprobar primero la URL, las políticas y la caché de esquema. No se escribió en Supabase real.

## Funciones incluidas

- Identidad textual AE SPORTS, favicon tipográfico, imagen social PNG 1200×630, etiquetas de portada y páginas estáticas por artículo. Se conserva el símbolo verde existente; no se introduce un logo definitivo nuevo sin aprobación.
- Rankings NFL/Champions independientes, diez posiciones y logos, borrador, publicación, control de conflictos y lectura pública. Catálogo UEFA 2026/27 de la entrega anterior. Sin botón de pausa, fecha visible, desplegable de lista o barra de desplazamiento.
- Causa móvil corregida: la regla `max-width:640px` desactivaba la animación. Ahora funciona en todos los tamaños; se evita también el hover persistente táctil. Dos grupos idénticos, desplazamiento de −50%, GPU y velocidad constante. Teclado/toque permiten navegación manual; movimiento reducido deja el carrusel estático. La lista para lectores de pantalla evita anunciar duplicados.
- Liga gratuita de puntos virtuales: NFL moneyline (`game/ml`); Champions 1X2 (`reg/ml3way`). No depósitos, retiros, apuestas reales, premios ni combinadas.
- Encuentros desplegables, cuota histórica, puntos potenciales, confirmación explícita irreversible, recibo permanente, pendientes e historial paginado. Login reutiliza la cuenta existente y regresa a la confirmación; nunca confirma automáticamente.
- Top 10 con filtros combinables General/NFL/Fútbol y semana/temporada/histórico, posición propia fuera del Top 10, puntos negativos y perfil por deporte. MEJOR PICK automático exige WIN y cuota positiva máxima. Mejor pick personal se calcula en todo su historial, no solo la página visible.
- Dos Picks de la Semana procedentes de ofertas oficiales, visibles primero al entrar en Picks. Los aciertos editoriales son independientes del récord y desaparecen del módulo público si una corrección revoca el WIN.
- Panel administrativo: temporadas/semanas, límites futuros, destacados, títulos/descripciones/artículo relacionado, cierre de ofertas, revisión de resultados, datos y registros de sincronización. Para intercambiar dos posiciones editoriales ocupadas, retirar una y volver a asignarla. Nunca permite editar cuotas o picks aceptados.
- Worker privado: resultados antes que nuevas ofertas, revalidación periódica, errores en el panel, límite estimado de consumo, reintentos mediante cron y compensaciones auditables. Administradores pueden solicitar nueva consulta de resultados antiguos desde el panel.

Las publicaciones, comentarios, respuestas, likes, votos, cuentas, tablas NFL y datos de Picks simples permanecen en sus tablas. La votación simple anterior se conserva como historial de datos, pero ya no se ofrece como participación en la nueva liga ni se convierte artificialmente en puntos.

## Reglas implementadas

| Regla | Comportamiento |
|---|---|
| Fuente | SportsGameOdds; únicamente `byBookmaker.draftkings`, nunca consenso `bookOdds` |
| Oferta | Primer conjunto completo válido: dos selecciones NFL o tres UCL; una oferta por selección/evento |
| Igualdad | La cuota inicial queda congelada para todos, incluso si la casa la cambia después |
| Ventana | Se publica como máximo 48 h antes; snapshot máximo 48 h |
| Frescura | Cotización del proveedor y última verificación dentro de 20 min; tolerancia futura 1 min |
| Cierre | Cinco minutos antes de la hora oficial, validado por PostgreSQL |
| Semana | Lunes 00:00 UTC a lunes siguiente; las horas se muestran en zona local |
| Límite | Cinco picks por cuenta/semana, un pick por encuentro; admin configura 1–20 solo para semanas futuras |
| Horario modificado | Cierra nuevas entradas y exige revisión; conserva cuota y semana originales |
| Mercado retirado/API caída | Desactiva la oferta o vence su verificación; conserva picks aceptados |
| Empate NFL | PUSH; pendiente de ratificar reglas exactas de la casa antes de activar |
| Fútbol | Solo resultado de `results.reg`, 90 minutos + añadido; nunca sustituye por `game` |
| Suspensión/cancelación | UNDER_REVIEW/PENDING; no se inventa una liquidación sin regla/evidencia verificadas |
| Corrección | Nuevo resultado, nueva liquidación, diferencia en ledger; nunca reescribe lo anterior |
| Desempate ranking | Puntos ↓, aciertos ↓, fallos ↑, primer pick ↑, UUID de usuario ↑ |
| Desempate récord | Cuota positiva ↓, aceptación ↑, UUID del pick ↑ |

Puntos en aritmética `numeric` PostgreSQL: positiva /100; negativa 100/abs(cuota); redondeo a dos decimales. WIN suma, LOSS resta; PUSH/VOID/CANCELLED cero. La confirmación no puede enviar puntos. Los estados excepcionales existen en SQL, pero el adaptador no liquida cancelaciones/VOID automáticamente hasta disponer de las reglas exactas aprobadas. Los casos no verificables quedan registrados para revisión.

Las cuotas extremas pueden dominar la clasificación y favorecer estrategias de mucha varianza. No se modifica la fórmula solicitada. Un máximo de cuota o una categoría separada de récord serían cambios futuros de reglas, con aprobación previa y sin efectos retroactivos.

## Modelo y seguridad

`ae_competitions → ae_events → ae_offers → ae_picks → ae_settlements → ae_ledger`. Temporadas/semanas fijan las reglas. `ae_results` conserva evidencia normalizada, fuente, fingerprint, marcador, período y versión; no publica un volcado del proveedor. `ae_spotlights` y `ae_highlights` son selección editorial. `ae_audit`, `ae_sync_log`, `ae_recheck_queue` y `ae_sync_lock` registran operaciones y coordinación.

RLS en todas las tablas nuevas. Usuarios solo consultan sus participaciones y ledger; salida pública de clasificaciones con nombres públicos y sin correo ni metadatos privados. No hay escrituras directas desde navegador. RPC validan auth/admin; `ae_ingest`, `ae_settle`, uso y bloqueo del worker solo se conceden a `service_role`. El bloqueo por usuario y evento evita carreras; índices únicos y request UUID permiten repetir una petición sin crear otro pick. Triggers impiden modificar picks, resultados, liquidaciones, ledger y campos históricos de ofertas.

El cierre administrativo persiste frente a futuras sincronizaciones. Retirarlo no abre la oferta: exige otra verificación. Los cambios administrativos guardan actor, motivo, fecha y datos antes/después cuando corresponde. La cola de revisión vuelve a consultar al proveedor; no acepta un marcador escrito por un usuario.

Los límites por cuenta reducen abuso, pero no acreditan que varias cuentas pertenezcan a personas distintas. Mantener los límites de Auth/Supabase y valorar CAPTCHA y moderación si aparece abuso; no se cambió el sistema de acceso existente. La agregación pública calcula sobre picks indexados: medir con volumen real antes de escalar a decenas de miles de usuarios; se puede materializar sin cambiar el ledger.

## Instalación, con autorización de producción pendiente

1. Ejecutar `10_diagnostico_ae_solo_lectura.sql` en el proyecto correcto y guardar conteos/esquema. Revisar que `articles.id` sea UUID y exista `rcm_is_editor()`. Respaldar esquema, datos, Auth y Storage; probar restauración en un proyecto de staging.
2. Si faltan Champions/Picks históricos, seguir diagnóstico 06 y migraciones 07/08; verificar con 09. No volver a ejecutar indiscriminadamente 01 ni borrar/recrear tablas. Si ya existe otro esquema `ae_*`, comparar antes de aplicar 11.
3. En staging, aplicar `11_ae_league.sql` y ejecutar `12_verificacion_ae_solo_lectura.sql`. La migración 11 es aditiva, transaccional y probada dos veces seguidas. Comparar conteos históricos de 10.
4. Apuntar una copia local de `index.html` **y** `site.config.json` al proyecto de staging con su clave publicable. Nunca poner service-role o proveedor en frontend/GitHub. Probar con dos lectores reales y un editor.
5. En el panel crear temporada y la semana actual/próximas semanas, con lunes UTC. Sin semana no se publican ofertas. La temporada fija proveedor, casa y versión de reglas; no se ofrecen cambios retroactivos.
6. Obtener confirmación escrita del proveedor para este uso/archivo histórico, cobertura de DraftKings NFL y UCL, y reglas de liquidación. Instalar los secretos con el dashboard o CLI de Supabase, sin volcarlos a logs:
   - `SGO_API_KEY`, `AE_CRON_SECRET` aleatorio y largo.
   - `AE_PROVIDER_APPROVED=true` y `AE_BOOK_RULES_APPROVED=true` **solo tras completar las verificaciones**.
   - `AE_MONTHLY_OBJECT_BUDGET`: por defecto 2000, límite conservador de objetos registrados por esta integración; no controla otros usos de la misma cuenta ni sustituye facturación oficial.
   - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son secretos del runtime Supabase, nunca del cliente.
7. Desplegar con CLI autenticada: `supabase functions deploy ae-sync --project-ref <proyecto-staging>`. `supabase/config.toml` desactiva verificación JWT únicamente para esta función: exige su propio secreto `x-ae-cron-secret` y método POST antes de cualquier acceso externo. Comprobar que sin secreto devuelve 401.
8. Invocar una vez, revisar `ae_sync_log`, ofertas, resultados y liquidaciones reales autorizadas en staging. La función tiene máximo 12 llamadas al proveedor, 100 s de presupuesto, timeout HTTP de 15 s y lease de 4 min. Un 429 se registra y se reintenta en el siguiente ciclo. Los resultados finales se revisan durante siete días; el panel permite solicitar revisión de uno más antiguo.
9. Habilitar `pg_cron`, `pg_net` y Vault; guardar `ae_sync_url` y `ae_cron_secret` en Vault; después instalar **una sola vez** `13_schedule_TEMPLATE.sql` (cada 10 minutos). Verificar extensiones y costes en el plan concreto de Supabase. No se instaló cron durante esta entrega.
10. Tras aprobar staging, autorizar por separado migración y despliegue de producción. Cambios de backend primero; comprobar lectura anónima, confirmación con dos cuentas, mismo snapshot, cierre, resultado y corrección. Seleccionar dos destacados reales. Después fusionar el PR y activar Pages por Actions.

Rollback: pausar cron y revertir frontend/función a la versión anterior. Conservar todas las tablas y registros de liga; no hacer DROP ni borrar picks para volver atrás.

## Pruebas y límites de verificación

| Entorno | Qué se comprobó |
|---|---|
| PostgreSQL PGlite aislado | Migraciones dos veces; conservación de datos anteriores; RLS/roles; dos usuarios +150; cuota externa cambia; límites, cierre/frescura, rechazo de edición; +504 y −110, empate/void/cancel; idempotencia; compensación y retorno a resultado previo; UCL solo regulación; Top 10 y posición 12; filtros, WIN verificado, bloqueo/revalidación e historial |
| Adaptador con fixtures | Casa única, sin consenso alternativo, odds inválidas, incompletas o ambiguas; períodos NFL/UCL; resultado final; falta de regulación y cancelaciones requieren revisión |
| Worker con HTTP simulado | Secretos/autorización/configuración, ingestión, liquidación, bloqueo, límite mensual, HTTP 429, respuestas vacías de PostgREST, ausencia de credenciales en logs |
| Chromium + transporte Supabase simulado | Dos lectores, comentarios/respuestas, votos/likes, errores y reload/logout; auth, artículos e imágenes; rankings y clubes; confirmación/cancelación/recibo/reload; login no confirma; filtros; posición fuera de Top 10; fallo de servicio; panel y anchos 390, 768, 844 y escritorio |
| Generación HTML | OG específico por artículo sin JavaScript, escaping, URL canónica, imagen original, fallback seguro, rutas de subdirectorio/raíz, limpieza de páginas despublicadas |
| Entorno público | Lecturas PostgREST descritas arriba; investigación en fuentes oficiales. Sin login administrativo ni escrituras |

Ejecutar Node ≥22.18 (recomendado 24), `npm ci`, `npx playwright install chromium`, `npm test` y `npm run test:database:observed`. `RCM_CHROME_PATH` permite un Chromium ya instalado. Se añadió CI de regresión para el PR. PGlite ejecuta SQL PostgreSQL real embebido, pero no replica todos los servicios Supabase/PostgREST/Auth; la integración de staging sigue siendo necesaria.

No se ha verificado Safari físico de iPhone ni Chrome físico de Android, cuentas reales en la liga, llamada autenticada a SportsGameOdds, liquidación de un partido real, dominio nuevo/HTTPS ni tarjetas reales de WhatsApp/Discord/X tras despliegue. Las capturas y datos de pruebas no prueban funcionamiento de producción.

## Enlaces sociales y dominio

La portada contiene canonical, Open Graph y Twitter Cards con URL actual. `npm run build:social` obtiene solo artículos públicos usando clave publicable y genera `dist/articles/<id>/index.html` con título, imagen y resumen propios. El crawler recibe HTML completo sin ejecutar JS. El lector vuelve a `?article=<id>` y conserva `comment`; IDs e historial antiguos siguen funcionando. `404.html` permite al lector abrir un artículo recién publicado antes del siguiente build, aunque su tarjeta social específica requiere generación.

`.github/workflows/pages.yml` genera/despliega `dist` al actualizar main, manualmente o cada hora. El cron de GitHub puede retrasarse; para una publicación urgente ejecutar el workflow manual. Nunca se incluye un token de GitHub en el navegador. Si falla la exportación, el workflow falla antes de desplegar. Una despublicación se elimina en el siguiente build; cachés de plataformas sociales pueden tardar más.

Activar Settings → Pages → Source: GitHub Actions solo tras revisar la instalación. Verificar un artículo con `curl` sin JS, un lector y los depuradores de las plataformas. GitHub Pages no puede dar metadatos distintos a cada query antigua: los enlaces históricos conservan el contenido, pero la tarjeta personalizada requiere la URL nueva `/articles/<id>/`.

Para un dominio autorizado y adquirido:

1. Verificar titularidad con el TXT que GitHub muestra en Settings → Pages del propietario. No inventar el valor TXT. Mantenerlo tras verificar.
2. En el registrador, apex con registros A `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `www` CNAME a `eduardcarrera00-pixel.github.io` (sin `/RCM-Sports`). No crear wildcard.
3. Cambiar `site.config.json.url` a `https://dominio-aprobado/`. El build genera CNAME y URLs canónicas nuevas; con Actions configurar también el dominio en Settings → Pages. No hay CNAME de un dominio no comprado en la entrega.
4. Esperar DNS/certificado y activar Enforce HTTPS. Probar raíz, assets, artículo, `?article`, comentario y 404; mantener acceso antiguo mientras se verifica la redirección de GitHub.
5. En el **mismo** proyecto Supabase actualizar Site URL y Redirect URLs, conservando temporalmente la URL histórica. Probar login, alta, cierre de sesión y recuperación si se usa. Cuentas/datos son los mismos. Las sesiones en localStorage están aisladas por origen: no es posible transferirlas transparentemente al dominio nuevo; habrá que iniciar sesión de nuevo allí.
6. Validar DNS y HTTPS públicamente antes de anunciarlo. Fuentes: [GitHub dominio](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls).

La comparación de proveedores, condiciones, precios y dominios está en [AE-RESEARCH.md](AE-RESEARCH.md).
