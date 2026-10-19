# AE SPORTS · CSS: fase 2 — deduplicación comprobada

**Estado:** solo rama de mantenimiento. La web oficial y `main` no han sido modificadas.

## Cambio efectivo

En `assets/style-sources.json` se retiraron 11 fuentes CSS que también estaban
enlazadas **más tarde** en `index.html`. Se conservaron esos 11 archivos,
sus enlaces independientes, su posición final en la cascada y sus contenidos
exactos. El paquete editorial se regeneró con el compilador original del
proyecto: `node scripts/build-editorial-css.mjs`.

No se movieron bloques CSS a distintas rutas, no se modificaron imágenes,
tipografías, tokens visuales, JSX/HTML estructural ni reglas de responsive.

| Indicador | Antes | Después |
| --- | ---: | ---: |
| Fuentes del paquete editorial | 76 | 65 |
| Hojas repetidas dentro y fuera del paquete | 11 | 0 |
| Longitud del paquete compilado (caracteres) | 639 417 | 535 226 |
| Reducción del paquete | — | 16,3 % |

La reducción no significa una reducción equivalente del total de tráfico
de página: las 11 hojas siguen cargándose una vez como archivos independientes.
Reduce el trabajo CSS repetido y prepara una arquitectura más predecible.

## Por qué la deduplicación no debe alterar los estilos

Cada uno de los 11 archivos estaba incluido una vez en el bundle y otra
vez, posteriormente, como enlace CSS. Se comprobó que no contienen
`@import`, `@layer`, `@font-face`, `@property` ni definiciones de
`@keyframes`, cuyo orden o registro puede tener semánticas especiales.
La copia final de cada archivo permanece en su lugar, con la misma
especificidad, declaraciones, condiciones `@media` y URL de recursos.

La eliminación de la primera copia deja la copia de mayor precedencia
que ya determinaba el estilo final.

## Pruebas realizadas

- `npm run test:css`: aprobado.
- Regeneración del bundle y comprobación de diff vacío: aprobada.
- Pruebas de Picks, autenticación y borradores: aprobadas en GitHub Actions.
- **16 capturas estáticas idénticas en Chromium, comparando `main` y la
  rama de trabajo**: AE SPORTS, Picks, NFL y Fútbol; anchos 390 y 1366 px;
  modo día y noche. Resultados del
  [workflow de validación](https://github.com/eduardcarrera00-pixel/RCM-Sports/actions/runs/39188725080).

La prueba visual usa un servidor local, sin scripts de producción ni datos de
usuarios; evita que publicaciones o imágenes remotas variables falseen la
comparación. Es una prueba útil de diseño estático, no una auditoría de
interacción real ni de accesibilidad. Deben verificarse también formularios,
carruseles, elementos dinámicos y otras anchuras.

## Seguridad y publicación

El build automático está limitado a
`maintenance/css-safe-phase1-20261018`. La dirección oficial de Pages
sigue sincronizando exclusivamente `main`. El PR sigue en borrador.

Antes de fusionar, revisar las capturas con contenido real y comprobar
móvil, tablet y escritorio en el navegador. Mantener posibilidad de revertir
el commit de esta fase.

## Siguiente etapa recomendada

La deuda técnica restante está principalmente en los numerosos CSS
independientes y estilos en línea de `index.html`. Para consolidarlos sin
cambiar el diseño:

1. Agrupar hojas contiguas por componentes respetando estrictamente cada
   bloque `<style>` intercalado y el orden de la cascada.
2. Mover gradualmente reglas a hojas de propiedad única por componente;
   comparar estilos computados y capturas después de cada movimiento.
3. Sustituir valores repetidos por tokens únicamente cuando todos los estados
   compartan **exactamente** el mismo valor calculado.
4. No hacer la migración total en un solo commit. Revisar cada etapa
   por separado y mantener el PR en borrador hasta completarla.
