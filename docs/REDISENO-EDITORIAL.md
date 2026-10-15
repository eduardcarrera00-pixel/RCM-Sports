# AE SPORTS — portada editorial

Base: eduardcarrera00-pixel/RCM-Sports main, 4355f01.

Esta entrega es una fase visual revisable, no la implementación completa del documento de producto.

## Cambios
- Identidad AE SPORTS, paleta crema/azul/nogal/terracota y tipografía editorial.
- Hero con fotografía de la noticia más reciente y acceso real al artículo; noticias completas debajo.
- Tarjetas rectangulares y controles suaves; tres noticias por fila en escritorio.
- Ranking de portada con seis equipos reales, orden por columnas (1–3 / 4–6), logos de 44 px, edición y enlace al Top 10. En móvil los logos son de 36 px.
- Comentarios más apoyado y más cuestionado desde la RPC existente, con enlaces y votos reales.
- Se ocultan la encuesta demostrativa, el boletín de demostración y el módulo que confundía likes con lecturas.
- Se restaura el movimiento del ranking NFL en móvil, con control de pausa y respeto a movimiento reducido.
- No hay cambios de tablas, políticas, credenciales ni migraciones.

## Dependencias pendientes
Main no contiene Champions ni el sistema comunitario de Picks. Esos desarrollos viven en otras ramas y requieren revisión/integración separada. El panel de Pick de la Semana muestra un estado vacío explícito y un acceso a publicaciones de Picks; NO selecciona un ganador semanal ni inventa equipos, cuotas o votos. Falta conectarlo al sistema definitivo y construir su presentación con datos publicados. Tampoco se implementan aquí Takes, registro sin correo, administración de categorías ni APIs deportivas.

La portada usa la fotografía ya publicada en la noticia; no copia la fotografía del screenshot ni incorpora un logo oficial no disponible. Se conserva el símbolo existente junto al nombre AE SPORTS.

## Validación
- Sintaxis de scripts inline y community.js: correcta.
- IDs HTML únicos: correcto.
- tests/editorial.cjs: seis equipos, diez en lista completa, edición, estados vacíos y limpieza de datos anteriores.
- La expectativa del hero en la prueba de navegador existente se adapta al enlace editorial de la noticia.
- Sin navegador habilitado: NO se verificó visualmente escritorio/móvil ni se ejecutaron flujos de producción. El PR debe permanecer en borrador hasta revisar ambas vistas y sus integraciones.

## Recuperación
Revertir el commit de este PR. No modifica datos persistidos.
