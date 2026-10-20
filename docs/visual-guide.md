# AE SPORTS · Guía visual v1

Fecha: 16 de octubre de 2026. Basada en la página publicada y sus recursos actuales.
Versión visual: `guia-visual.html` en la raíz del proyecto.

## Identidad
Deporte con carácter editorial: confianza, calma, comunidad y elegancia cálida.
Conservar el corredor, el wordmark dorado y los iconos deportivos actuales. Mantener
su proporción original, sin estirarlos, añadir sombras incompatibles ni recolorearlos
por sección. El dorado artístico pertenece a la marca; el bronce identifica acciones.

## Paleta y función
| Función | Noche | Día |
|---|---|---|
| Fondo principal | #081724 | #EEEAE3 |
| Superficie de contenido | #102B3E | #FFFCF8 |
| Texto principal | #F4E8DB | #273B49 |
| Texto secundario | #C5CDD2 | #566876 |
| Acción sobre superficie | #BD8D6B | #855B43 |
| Separador | #49606C | #D9D9D0 |

Paleta consolidada a partir de los estilos existentes; las ilustraciones y los
banners fotográficos conservan variaciones propias. No usar bronce claro como texto
pequeño sobre marfil. En zonas con fotografía, usar una capa de contraste estable.
Objetivo de contraste: 4.5:1 para texto normal y 3:1 para texto grande y controles.
No depender únicamente del rojo y verde: conservar flechas, signos y etiquetas.

## Tipografía
- Newsreader, con Georgia como alternativa: titulares, secciones y nombres de tarjetas.
- Inter, con system-ui como alternativa: lectura, formularios, fechas y controles.
- Wordmark: recurso gráfico original, no una tercera fuente de interfaz.
- Escala de referencia: portada 26–39 px; sección 24–30 px; tarjeta 18–23 px;
  texto 15–17 px; extracto compacto 12–13 px; metadatos 11–12 px.
- Interlineado: titulares 1.1–1.25; lectura 1.6–1.8; información auxiliar 1.4–1.5.
- No imponer estos tamaños a rankings móviles o elementos especiales ya aprobados.
  Evitar cambios globales que alteren la composición de Fútbol, NFL o Picks.

## Espaciado y contornos
Escala: 4, 8, 12, 16, 24, 32, 48 px. Preferir 16–24 px dentro de tarjetas grandes;
12–16 px dentro de módulos compactos. Separar grupos más que elementos relacionados.
Contorno simple de 1 px, sombras suaves; geometría principalmente recta. Conservar
los pequeños radios existentes del diseño móvil aprobado. No añadir ornamentos
nuevos ni contornos dobles. Reservar 2–3 px para foco de teclado visible.

## Componentes
- Noticia: fotografía coherente, categoría, fecha/lectura, título, extracto y acciones.
  Mantener marfil también en el pie diurno; títulos completos al abrir la noticia.
- Portada: título completo en escritorio, extracto corto y dos acciones jerarquizadas.
  El contenido determina la altura; no cortar palabras para forzar un tamaño fijo.
- Botones: una acción dominante por módulo. Secundarias con contorno o texto.
  Texto real y nombre accesible; arte decorativo sin sustituir la interacción.
- Rankings: conservar logos, variaciones y movimiento automático existentes.
  No duplicar listas ni cambiar cantidades o datos desde una revisión visual.
- Cocina Picks: conservar botón artístico compacto y diálogo superpuesto. Guardar
  cierra tras éxito; un error conserva el borrador y muestra el mensaje existente.
- Takes: conservar encabezados, votos, respuestas e historial. Reservar espacio para
  títulos largos y usuarios reales; ningún texto decorativo debe tapar controles.

## Móvil, temas y estados
Revisar 360, 390, 768 y 1366 px, además de zoom de texto. Una columna cuando falte
espacio; textos largos deben envolver y los controles permanecer dentro del panel.
Objetivo táctil 44 × 44 px, con separación suficiente en controles compactos.
Revisar día y noche; carga, vacío, error, contenido largo, foco y diálogo abierto.
Respetar prefers-reduced-motion; las acciones no deben depender de hover.

## Aplicación de esta revisión
Aplicado en `assets/ae-visual-system.css`: tokens independientes; título de portada
completo en escritorio; márgenes e interlineado de noticias; extractos y comentarios
más legibles; pie marfil y acciones en bronce oscuro de día; metadatos y extractos
móviles de portada más legibles. Se conserva el diseño compacto y la expansión.

Las reglas restantes son referencia para cambios futuros, no una afirmación de que
cada componente heredado ya esté migrado a los tokens. No se modifica la base de
datos, los votos, las clasificaciones ni la composición de las secciones deportivas.

## Método para futuros cambios
1. Elegir un objetivo concreto y una pantalla con contenido real.
2. Comparar como máximo dos propuestas manteniendo el mismo contenido.
3. Revisar móvil y escritorio, día y noche, antes de extender el diseño.
4. Aplicar con componentes reales, conservar eventos y estados.
5. Verificar lectura, recortes, foco, acciones, errores y movimiento reducido.

## Mantenimiento
Añadir estilos al manifiesto y regenerar con `node scripts/build-editorial-css.mjs`.
No editar el bundle directamente. Mantener cambios visuales acotados; la guía no
autoriza eliminar funciones ni rediseñar una sección ya aprobada.

## Tokens y capa de armonía (20 oct 2026)
Los valores de color, tipografía, espaciado, forma y estados están en
`assets/ae-tokens.css` y se documentan en `docs/tokens.md`. La cabecera y el pie
usan el azul de marca #284A71 (día) / #1C2D40 (noche). `assets/ae-armonia.css`
unifica pestañas, botones, etiquetas, estados vacíos, foco, áreas táctiles y
ritmo vertical. El build (`node scripts/build-editorial-css.mjs`) ya no necesita
Tailwind.
