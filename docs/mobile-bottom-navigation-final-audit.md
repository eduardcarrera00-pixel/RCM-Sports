# CAM SPORTS — Auditoría final de la barra inferior móvil

**Estado: BLOQUEADA POR DEPENDENCIA. No constituye aprobación ni despliegue.**

Al preparar esta auditoría (22 oct 2026), main todavía contenía los accesos Picks / NFL / Fútbol / Opiniones dentro de header nav.ae-sport-nav. No existía la barra inferior móvil integrada ni un PR específico que implementase primero la barra y después su refinamiento. Esta PR añade **solo comprobaciones**, no cambia HTML, CSS, JS funcional ni la experiencia de producción.

## Orden obligatorio

1. Integrar la barra inferior exclusiva de teléfonos; retirar de la vista móvil los cuatro botones del encabezado, manteniendo la navegación de escritorio.
2. Integrar **después** el perfeccionamiento visual día/noche; no rehacer la barra.
3. Actualizar esta rama sobre la implementación final; revisar los selectores semánticos reales si fuese necesario, sin reducir las exigencias.
4. Ejecutar el workflow, revisar las capturas y el informe, verificar manualmente las interacciones protegidas que exigen credenciales. **No fusionar esta PR ni declarar producción lista con verificaciones fallidas o incompletas.**

## Puertas automáticas

Ejecutar: node tests/mobile-bottom-navigation-audit.cjs. Usa Chromium, sirve los archivos locales y **no** escribe en Supabase.

- 375×667 (iPhone SE), 390×844 (iPhone estándar), 430×932 (Pro Max), 360×740 (Android compacto), 412×915 (Android grande), y 320×568 como estrés.
- En retrato, pruebas de día y noche; en paisaje, 667×375, 844×390 y 932×430. Escritorio 1024/1366 en ambos temas.
- Solo un nav móvil semántico con cuatro accesos en el orden establecido, iconos, etiquetas completas, superficies de al menos 40×40 px, alineación, position:fixed, anclaje al viewport y ausencia de navegación móvil duplicada en cabecera.
- El estado activo se actualiza para cada categoría, las acciones no recargan la página y el logo vuelve a Home.
- Comprobación de scroll horizontal, barra fija tras scroll, footer completamente alcanzable, modales de login, publicación y noticia por encima de la barra; existencia de Quiniela NFL, perfil y control de edición.
- Escritorio: ningún nav inferior visible, navegación superior de cuatro secciones, logo y controles de sesión presentes.
- Capturas de página completa de los casos aprobados e informe JSON; se guardan como artefacto CI.

## Comprobaciones manuales todavía obligatorias

| Área | Validación pendiente |
|---|---|
| Categorías ocultables | Alternar NBA, Tenis, Ciclismo y Colegial desde admin; comprobar que su visibilidad y el modo «Todos» se mantienen, sin afectar los cuatro accesos principales |
| iOS y Android reales | Safe area superior/inferior, home indicator, barras del navegador, zoom 200 %, letra ampliada y rotación física; Chromium emula tamaños, **no** el teclado real ni safe area de iOS |
| Teclado | Abrir inputs de Picks, Takes, login/registro y editor; confirmar que el teclado no tapa botones ni hace inaccesible el formulario |
| Flujo de Picks | Abrir OCR, editar previa, cancelar, reabrir y comprobar scroll; **no** publicar una apuesta de prueba en producción |
| Takes | Abrir compositor, escribir, cerrar/reabrir conservando borrador y verificar controles de cancelar/publicar |
| Quiniela NFL | Probar selector, resumen, guardado con usuario de test en staging, pestañas, estado de bloqueo y clasificación |
| Sesión/perfil/admin | Login, registro (staging), perfil, Modo Edición global y diálogos internos; verificar foco y cierres |
| Noticias y desplegables | Abrir/cerrar varias noticias, menú de deportes, diálogos anidados y foco/escape; confirmar z-index correcto |
| Navegación escritorio | Comparar capturas antes/después en 1024/1366, menús ocultos y sesión iniciada/sin sesión |
| Consola | Revisar todos los errores de consola relevantes de carga, interacción y accesibilidad; comparar con la línea base |

## Criterio para cerrar

Todos los checks automatizados verdes, capturas revisadas (día/noche, retrato/paisaje, escritorio), pruebas manuales marcadas como hechas por la persona que las ejecute, cero regresiones conocidas. Los errores se corrigen en código fuente existente, sin apilar reglas CSS aisladas ni cambiar otros módulos.

**Resultados reales en la fecha de preparación:** estructura de main inspeccionada; falta la dependencia de navegación inferior. No se han ejecutado pruebas de navegador reales sobre la nueva barra ni se ha podido validar el teclado/safe area físicos. Ninguna afirmación de «aprobado» procede hasta ejecutar los pasos anteriores.
