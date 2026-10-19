# AE SPORTS · Fase 5 — auditoría de conflictos y deduplicación conservadora

**Estado:** rama de mantenimiento, PR #71 en borrador; no publicada.

## Qué se ha comprobado

La web incluye estilos editoriales antiguos y modernos, media queries
diferenciadas para móviles, tabletas y ordenadores, y varios temas de color.
Que un selector aparezca repetido **no significa** que el CSS deba borrarse:
hay sobrescrituras deliberadas que garantizan el diseño actual.

La herramienta nueva `scripts/css-conflict-inventory.mjs` es **solo de
lectura** y recorre las hojas en el orden de carga real de `index.html`,
expandiendo las fuentes originales del paquete `ae-editorial-bundle.css`.
Se puede ejecutar con:

- `npm run css:conflicts`: resumen legible.
- `npm run css:conflicts -- --json`: inventario estructurado.

Se ejecuta también durante `CSS maintenance checks` en GitHub Actions.

### Línea base antes de retirar duplicados

| Métrica de auditoría | Resultado |
| --- | ---: |
| Fuentes CSS en secuencia de carga expandida | 130 |
| Reglas analizadas | 8 116 |
| Declaraciones analizadas | 30 718 |
| Reglas literalmente repetidas en un mismo contexto | 11 |
| Declaraciones exactamente repetidas dentro de una regla | 0 |
| Pares selector/propiedad con valores distintos | 1 177 |

**Importante:** los 1 177 pares son casos para revisar, *no* 1 177 errores,
ni representan necesariamente diferencias visibles; pueden pertenecer a
variantes responsive, temas o ajustes artísticos intencionados.

## Cambios CSS efectivos de esta tanda

Solo se quitaron las **copias anteriores** de tres reglas completas
idénticas que estaban dentro del mismo archivo y contexto `@media` o raíz.
Se mantuvo su definición posterior, que determina el valor efectivo:

1. `assets/ae-mobile-compact-home.css`: duplicación de la visibilidad
   de `.ae-mobile-theme-caption`.
2. `assets/ae-take-rankings-palette.css`: duplicación del `min-width:0`
   de los ítems de Takes destacados.
3. `assets/ae-admin-publish-plus-small-mobile.css`: duplicación del
   `display:none` en la etiqueta de la herramienta admin móvil.

No se modificaron los valores CSS, el orden de otras reglas, ningún
elemento HTML, datos, imágenes, JavaScript ni el paquete editorial generado.
Se añadió un control específico a `tests/css-stability.mjs` para asegurar
que las tres declaraciones finales continúan presentes una sola vez.

## Casos deliberadamente NO modificados

- Reglas para los Power Rankings de NFL y Champions con alternativas
  móviles y dinámicas.
- Ajustes de contraste día/noche y tokens de portada.
- Cascadas que modifican tamaños de botones, Takes y noticias según
  el ancho de pantalla.
- Reglas que comparten selector pero difieren en declaración o condición.

Estos cambios requieren primero calcular estilos efectivos para diferentes
estados del componente y luego comparar capturas completas y pruebas reales.
Eliminar una regla solo por su nombre o aparente redundancia pondría en
riesgo el diseño aprobado.

## Validación y siguiente objetivo

`CSS maintenance checks` compara 40 escenarios visuales estáticos
(4 secciones × 5 anchos × 2 temas), ejecuta la comprobación CSS, recompila
el paquete para verificar su integridad y valida Picks, Takes, sesiones y
borradores. Además, conviene probar manualmente componentes desplegados,
formularios y accesos de administración.

La fase siguiente de esta misma línea de trabajo será auditar un componente
por vez con estilos computados y captura de estados reales, empezando por
cabecera/navegación y luego Picks, sin eliminar sobrescrituras intencionales.
