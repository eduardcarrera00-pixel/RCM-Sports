# AE SPORTS · Fase 4: sacar CSS de index.html sin rediseñar

**Estado:** rama `maintenance/css-safe-phase1-20261018` con PR #71 en
borrador; no modificar `main` ni el despliegue de AE SPORTS antes de la QA.

## Cambio exacto

Se han migrado **17 bloques `<style>` consecutivos** desde `index.html`
a cuatro archivos CSS cacheables. Los cuatro enlaces resultantes se han
introducido exactamente en la posición de los primeros bloques extraídos,
sin saltarse hojas de estilo o scripts intermedios.

| Archivo CSS | Bloques originales | Contenido |
| --- | ---: | --- |
| `assets/ae-inline-mobile-layout.css` | 5 | Picks en portada, ranking móvil y acciones de NFL/Fútbol |
| `assets/ae-inline-news-rankings.css` | 6 | Carruseles, noticias, Picks y clasificación de portada |
| `assets/ae-inline-brand-header.css` | 3 | Sol/luna, barra de navegación y avisos |
| `assets/ae-inline-standings-trending.css` | 3 | Genios/Anoetos, hover y Lo más leído |

El HTML pasa de **21 a 4 bloques `<style>`**. Se retiran
aproximadamente **61,5 mil caracteres de `index.html`**; los estilos
siguen existiendo en hojas externas y se cargan cuatro CSS adicionales.
Por tanto no es una reducción equivalente de todos los bytes de la
primera visita. La ventaja es el HTML más ligero, el CSS cacheable y una
división en fuentes editables para cada zona.

No se cambió ninguna declaración, media query, selector, orden de bloques,
paleta, imagen, icono ni código JavaScript. Todos los bloques migrados
carecían de URL CSS relativas que necesitaran reescritura.

## Reglas de mantenimiento

1. **Editar directamente los cuatro archivos CSS externos**. Los comentarios
   `Original <style id="...">` conservan la procedencia de cada grupo.
2. No volver a copiar sus reglas dentro de `index.html` ni modificar la
   posición de sus `<link>` sin una comparativa visual.
3. La hoja con el bloque `@layer ae-editorial-square-corners` sigue
   teniendo la misma posición relativa de declaración y el mismo contenido.
4. Los cuatro bloques inline aún presentes se dejan para otra fase porque
   están intercalados o están en zonas de mayor riesgo. No eliminarlos a ciegas.
5. `npm run test:css` comprueba el número de bloques inline, la presencia
   de los CSS extraídos, sus marcadores de origen y la ordenación de grupos.

## QA exigida antes de aprobar

- Tests CSS, compilación reproducible y verificación de ausencia de dobles
  cargas CSS.
- Validaciones de Picks, acceso y borradores.
- Capturas Chromium de AE SPORTS, Picks, NFL y Fútbol, 390, 760, 761, 768 y 1366 px,
  tema día/noche (40 capturas, cubriendo el límite de los media queries), comparadas visualmente con `main`.
- Revisión manual con contenido real (usuarios, comentarios, rankings,
  formularios y transiciones), además de 768px y Safari/iOS si se dispone
  del navegador. Las capturas estáticas no garantizan todas las interacciones.

## Próxima decisión

Después de confirmar el aspecto de la rama en el preview, revisar los
bloques inline restantes y estudiar una agrupación de los CSS que todavía
están enlazados individualmente. Priorizar métricas reales de rendimiento:
tiempo de carga, CSS transferido, renderizado y caching; no solo contar
ficheros o líneas.
