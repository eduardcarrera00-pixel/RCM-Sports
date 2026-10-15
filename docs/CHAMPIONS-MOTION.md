# Continuación sobre la portada publicada

Base: main 839bf592ee260428b0627fedcb5b8e4e8b2201d6 (PR #3 ya integrado).

Champions incorpora un carrusel automático con los diez equipos publicados. Utiliza dos grupos visuales idénticos para cerrar el bucle; la lista accesible mantiene exactamente diez equipos. El preview de portada conserva seis equipos. La edición, los logos, los nombres y las flechas siguen procediendo del módulo existente.

Se mantiene la lista estática completa. El carrusel se oculta si se solicita movimiento reducido, se pausa al enfocar la sección con teclado o al pasar el puntero y no muestra datos de una carga anterior tras errores. No hay botón adicional de pausa ni barra de desplazamiento en este carrusel.

Pruebas ejecutadas:
- node tests/champions-motion.cjs: integración con transporte simulado, seis/diez equipos, orden de ambos grupos, edición y limpieza de datos con errores/vacíos.
- node tests/editorial.cjs: preview NFL y estados vacíos.
- node --check assets/champions.js y git diff --check.

No se ejecutó navegador ni se verificó visualmente la animación en un dispositivo real. No se modifican Supabase ni sus datos. El panel de Picks actual sigue siendo una votación semanal de dos opciones, no el sistema pendiente de publicaciones comunitarias diarias.

Recuperación: revertir este PR, sin migraciones.
