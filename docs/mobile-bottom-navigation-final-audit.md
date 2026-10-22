# CAM SPORTS — Auditoría final de la barra inferior móvil

**Estado actualizado (22 oct 2026): IMPLEMENTACIÓN INTEGRADA EN PR #100; QA FINAL INCOMPLETA. No constituye aprobación ni despliegue.**

La primera revisión encontró que la barra todavía no estaba en main. Ahora el PR #100 combina la implementación del PR #101 (navegación inferior móvil) con la auditoría Chromium y los últimos cambios de main. Se reutilizan los botones reales, sin clonar navegación. Las mejoras de orientación y las pruebas se han incorporado solo a la rama del PR; producción continúa sin cambios.

## Evidencia disponible

- La nueva navegación pasó sus pruebas dedicadas de DOM e interacción básica con Happy DOM.
- Chromium: 4/4 escenarios de escritorio (1024/1366 px, claro/oscuro) correctos en ejecuciones previas.
- Tras evitar el diálogo inicial de bienvenida durante la prueba, Chromium comprobó con éxito pulsaciones táctiles de las cuatro categorías y su estado activo; el siguiente check del logo falló por un selector del test que apuntaba al header antiguo, ya corregido. La última ejecución completa continúa pendiente.
- La prueba de Picks/compartir presenta un error heredado que también se observó en el PR #101 original, no provocado por la barra; no alterar Picks sin un diagnóstico aislado.
- Verificación física de iOS/Android, safe areas, teclado y sesiones autenticadas: **pendiente**. Cero regresiones en producción todavía no certificado.

## Orden obligatorio

1. [Hecho en la rama] Integrar barra inferior exclusiva de teléfonos; conservar navegación escritorio sin clones.
2. [Hecho en la rama] Aplicar compatibilidad día/noche, rotación de teléfonos y safe-area CSS.
3. [Hecho] Combinar PR #101 y main; corregir selectores desactualizados del propio test sin bajar exigencias.
4. [Pendiente] Confirmar workflow verde, revisar capturas, validar físicamente safe areas y flujos protegidos. **No fusionar sin completar y documentar la verificación.**

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

**Estado real:** se integró el código de la nueva barra en esta rama de QA, no en producción. Pruebas Chromium y de lógica ejecutadas parcialmente, con última auditoría completa pendiente. Las validaciones físicas/credenciales siguen abiertas. No declarar aprobado hasta comprobarlas.
