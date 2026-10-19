# AE SPORTS · Fase 3 de estabilización CSS

**Rama aislada:** `maintenance/css-safe-phase1-20261018`
**Publicación:** NO fusionar ni desplegar hasta validar.

## Objetivo

Reducir solicitudes de CSS y establecer una fuente de estilos agrupada por
componente sin rediseñar, sin tocar JavaScript, datos, Supabase, branding, logos
ni la composición aprobada del ordenador y teléfono.

## Cambio exacto

Cuatro pares de enlaces CSS **adyacentes** en `index.html` se han sustituido
por cuatro enlaces agrupados, en las mismas posiciones del documento:

| Componente | Fuentes editables (orden conservado) | Archivo entregado |
| --- | --- | --- |
| Iconos de navegación | `ae-muted-navigation-icons.css` + `ae-custom-nav-icons.css` | `ae-navigation-icons-group.css` |
| Cabecera / admin | `ae-header-alignment-polish.css` + `ae-admin-header-compact.css` | `ae-header-alignment-group.css` |
| NFL móvil | `ae-nfl-mobile-reference.css` + `ae-nfl-mobile-telephoto.css` | `ae-nfl-mobile-group.css` |
| Perfil | `ae-profile-city-editorial.css` + `ae-profile-tabs-picks.css` | `ae-profile-editorial-group.css` |

**Reducción de solicitudes CSS: 4** (ocho solicitudes originales sustituidas
por cuatro). El volumen total de declaraciones no cambia: aquí la mejora es
de organización y solicitudes, no de eliminación de estilos activos.

Los ocho archivos fuente permanecen en el repositorio; solo se entregan
al navegador los cuatro archivos generados.

## Una única fuente para la agrupación

- `assets/component-css-groups.json`: mapa declarativo y orden de fuentes.
- `scripts/build-component-css.mjs`: produce los archivos agrupados sin
  minificar ni cambiar declaraciones.
- `npm run build:css`: también genera los grupos.
- `npm run test:css`: rechaza grupos obsoletos y enlaces duplicados.

El generador valida que cada fuente se encuentre en el mismo directorio
`assets/` que el destino para conservar rutas relativas de las imágenes.
También rechaza directivas CSS con semánticas de orden especiales
(`@import`, `@layer`, `@font-face`, etc.). Todos estos pares se
comprobaron antes de agrupar.

**Para editar estos cuatro componentes: modificar únicamente su archivo
fuente correspondiente y ejecutar `npm run build:css`; no modificar el
archivo agrupado manualmente.** Así evitamos dos fuentes de verdad.

## Validación

GitHub Actions usa Chromium para comparar las 16 referencias estáticas
(4 secciones × 2 anchos × 2 temas) de la rama principal y la rama de
mantenimiento. Ejecuta también los tests de CSS, Picks, autenticación y
borradores. La equivalencia estática no cubre de forma exhaustiva los
componentes abiertos, animaciones, datos reales o todos los navegadores.

## Pendientes

- Revisar los estilos en línea repartidos por `index.html` y las hojas
  CSS restantes, **solo** después de registrar referencias visuales para
  componentes dinámicos.
- Unificar tokens visuales únicamente cuando sus valores computados sean
  iguales para ordenador/teléfono y día/noche.
- Actualizar la prueba antigua `tests/community-picks-ui.mjs` a los campos
  reales antes de exigir el test completo como bloqueo de publicación.
- Mantener el PR en borrador hasta comprobar las interacciones reales.
