# AE SPORTS · Guía visual v1

### Perfil más claro · 4 nov 2026

Cuatro pestañas: Perfil · Takes · Picks · Mi Party. «Mis jornadas» va al final de
«Mi Party» (perfil propio); «Ver mis jornadas» y `?tab=quiniela` abren Mi Party y
bajan hasta ellas. La cabecera no lleva antetítulo; el foco inicial va al nombre
(no al botón de cerrar). Bajo el nombre, hasta tres etiquetas con lo que destaca
(puesto en la quiniela, perfil de riesgo, campeones, acierto o apoyo), solo con
datos. En un perfil ajeno el botón principal es «Invitar a mi party» (abre «Mis
parties» de quiniela) y compartir queda como icono. En el resumen, «Ver todo ›» va
junto al nombre de cada tarjeta; el Take enseña dos líneas de texto y sus votos, y
solo se llama «más apoyado» si alguien lo apoyó. Debajo, los campeones elegidos.
El perfil propio cambia las tarjetas vacías por «Primeros pasos» (Take, quiniela,
Pick y party); con todo hecho, desaparece. En un perfil ajeno la quiniela va
primero si va en el podio.

### Jornadas en el perfil · 3 nov 2026

Las vistas principales de Quiniela NFL y Fútbol abren automáticamente la jornada
vigente. La pestaña de partidos se llama «Partidos» y los selectores de jornadas
anteriores se trasladan al perfil propio, en «Mi Quiniela». «Ver mis jornadas»
abre ese historial con el deporte elegido. Permite consultar pronósticos guardados
por competición, temporada y jornada, con marcador, acierto, fallo, anulado o
estado pendiente. Los datos se cargan solo al abrir esa pestaña, con paginación
y las políticas de propietario existentes. «Mi Party» mantiene su pestaña.

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

## Revisión de tipografía y esquinas (23 oct 2026)
La referencia posterior aprobada usa Playfair Display Semibold en títulos
principales, Libre Baskerville en encabezados secundarios y radios graduados
de 14 a 42 px. `assets/cam-rounded-editorial.css` aplica estas formas a la
interfaz. Esta decisión sustituye las referencias anteriores a Newsreader
y a la geometría recta; los fondos de portada y pie se mantienen.

## Tokens y capa de armonía (20 oct 2026)
Los valores de color, tipografía, espaciado, forma y estados están en
`assets/ae-tokens.css` y se documentan en `docs/tokens.md`. La cabecera y el pie
usan el azul de marca #284A71 (día) / #1C2D40 (noche). `assets/ae-armonia.css`
unifica pestañas, botones, etiquetas, estados vacíos, foco, áreas táctiles y
ritmo vertical. El build (`node scripts/build-editorial-css.mjs`) ya no necesita
Tailwind.

## Banners compartidos · 25 oct 2026

`assets/cam-banner-system.css` define la paleta de todos los banners mediante
`--cam-banner-fill`, `--cam-banner-title`, `--cam-banner-copy` y `--cam-banner-ink`.
Noche: fondo #0B2233, títulos e ilustraciones #F3EBDD, descripciones #C2CDD4.
Día: fondo #F3EBDD, títulos e ilustraciones #0A3268, descripciones #56616C.
Los acentos son #B79A76 de noche y #8D8174 de día.

El renderer convierte los lienzos planos de ilustraciones guardadas en una
imagen RGBA transparente con `cam-banner-artwork.js`. Conserva su URL original
y el encuadre para el editor; la tinta depende del tema real (`html.dark`).
No usar filtros ni mezcla screen para ocultar recuadros. Las fotos y los
escudos no se recolorean. Un archivo que contiene solo un fondo no se muestra
como un pequeño logo. Mejores/Peores Platos tienen fondo liso e iconos SVG
independientes, sin el atlas anterior. Opiniones no reutiliza una imagen del
tema contrario cuando falta una variante.

### Ajustes de ilustraciones y estados

Popular/Unpopular Takes de Home en modo día usan SVG individuales. Se retiran
únicamente las dos URLs antiguas que contenían mármol y el borde de libros
usado como pequeño icono de conocimiento. Las nuevas sustituciones del editor
conservan sus claves y funcionan de forma independiente en cada tema. Los SVG
monocromos propios se usan directamente como máscara vectorial, sin rasterizar.
En modo noche, Demuestra tu conocimiento (Home/NFL/Fútbol) conserva fondo liso
y una sola columna de texto. La cabecera de Quiniela NFL no lleva balón en
ningún tema; Quiniela de Fútbol mantiene su ilustración. Los estados vacíos
de Popular/Unpopular ajustan su altura al mensaje; las listas con contenido
conservan su altura y desplazamiento. Los selectores de quiniela toman su
contraste de la paleta real del banner.

### Tamaño visible de los símbolos · 2 nov 2026

Todos los banners comparten un espacio de 80 × 56 px en escritorio y 64 × 44 px
en móvil. `cam-banner-artwork.js` mide la silueta real, elimina la influencia del
margen vacío del archivo y centra el dibujo. Los símbolos horizontales aprovechan
el ancho adicional para igualar el peso visual de Popular Takes, conservando sus
proporciones. Los SVG propios se siguen mostrando como vectores; las fotografías
y los originales editables conservan sus colores y su identidad. Los recortes de
atlas se analizan por celda, con caché independiente para cada variante.

## Cabecera e iconos compartidos · 2 nov 2026

`assets/cam-header-system.css`, primera fuente del bundle editorial, concentra
la geometría y el acabado bronce de cabecera y barra móvil en la capa
`cam-header`. Sustituye las antiguas hojas de iconos atenuados, navegación
personalizada, acceso artístico y alineación de controles. Las reglas inline
anteriores de sol/luna y avisos ya no se publican.

Los dibujos aprobados de Picks, NFL y Fútbol conservan sus formas; sus viewBox
se ajustan a la silueta pintada, con un trazo principal de 1.55. Opiniones usa
ahora la misma burbuja SVG en escritorio y móvil, con ese mismo grosor de línea,
degradado y proporciones; ya no depende del WebP diferente de escritorio.
La cabecera usa símbolos de 24 px dentro de un marco de 32 × 32 px; el dock
móvil conserva su contorno circular de 37 px con símbolos de 23 px. Las áreas
de interacción miden al menos 44 × 44 px.

Usuario, sol, luna y campana comparten símbolos SVG y el mismo degradado bronce.
El estado claro de la barra inferior usa un bronce más oscuro sobre marfil;
la cabecera conserva el fondo ilustrado azul y la marca oficial de ambos
modos. Las etiquetas, separación, hover, selección y foco salen del mismo
sistema. El contador de avisos es absoluto y no ocupa espacio junto a la
campana. Se mantienen los IDs, eventos, ocultación según sesión y navegación
inferior originales; el selector de tema ya no tiene un círculo exclusivo.

## Contraste de cabecera · 3 nov 2026

El modo claro aplica una sombra de contorno azul oscuro muy fina a la silueta
SVG de los cuatro deportes, al sol/luna y a los controles de sesión. El modo
oscuro conserva el degradado sin sombreado adicional. El control de tema mantiene
sus nombres accesibles dinámicos (Activar modo claro/oscuro), pero solo muestra
el pictograma: se retira la etiqueta visual «Modo». El espaciado conserva el
marco invisible de la segunda línea para alinear los símbolos con el menú.

## Navegación del teléfono · 3 nov 2026

La barra inferior del teléfono es la de una aplicación: **Inicio · NFL · Fútbol ·
Picks · Opiniones**, con Opiniones siempre al final. Reutiliza los botones reales de la
cabecera (Inicio es el filtro «Todos», oculto en escritorio) y conserva Perfil como botón estable de la cabecera, que
abre el perfil propio o, sin sesión, el acceso. Las cinco pestañas usan
símbolos de 22 px sin círculo de fondo; la selección se marca en la pestaña.
Tocar otra vez la sección activa sube al principio.

Dentro de NFL y Fútbol, una barra de pestañas fija bajo la cabecera muestra un
apartado cada vez: **Noticias · Takes · Quiniela · Clasificación** (Power
Rankings en Noticias y Top 10 de usuarios en Clasificación; «¿Quién será campeón?» en
Quiniela). Picks tiene **Picks · Historial · Chefs**. No se mueve ni se copia
ningún módulo: `assets/cam-mobile-sections.js` solo marca la pestaña en `<body>`
y `assets/cam-mobile-bottom-nav.css` oculta el resto. Cada sección tiene su
dirección (`?s=nfl&v=quiniela`): cambiar de sección suma un paso al botón Atrás
del teléfono y cambiar de pestaña no. Un atajo que lleva a un módulo (Top 10,
Pick del editor) abre antes su pestaña. El escritorio no cambia.
Pruebas: `python3 -B tests/mobile-sections.py` y `node tests/mobile-bottom-nav-browser.cjs`.

### Noticias deportivas · 3 nov 2026

En NFL y Fútbol, los Power Rankings encabezan Noticias. Después aparecen el
encabezado de noticias, una vista previa de la última publicación y el carrusel
de las siguientes tres, sin repetir la última. `cam-sport-news.css` comparte la
presentación de la vista previa entre ambos deportes y temas. Clasificación
conserva las tablas de usuarios; los accesos a Power Rankings abren Noticias.

## Perfil · 3 nov 2026

El perfil se ordena como el de una app (Instagram, X o Sleeper): arriba la
inicial en un círculo bronce como foto, **@usuario** como título y «Miembro desde
…»; debajo, **Editar perfil** (solo el propio) y **Compartir perfil** (enlace
`?perfil=`). Una fila de cifras (Takes · Picks · Acierto · Apoyo) lleva a su
pestaña, y las pestañas (Mis Takes · Mis Picks · Mi Quiniela; en perfiles
públicos, Takes · Picks · Quiniela) quedan fijas al bajar. En el teléfono el
perfil ocupa la pantalla completa. La cabecera compacta usa un acento bronce
junto al rótulo CAM SPORTS y botones con iconos para editar, compartir y cerrar.

**Editar perfil** es una pantalla propia (con «‹ Perfil» para volver; Escape
también vuelve): cambio de nombre de usuario con comprobación en vivo
(disponible / ocupado / formato), confirmación que explica que se inicia sesión
con el nombre nuevo, y la sección Cuenta (código de recuperación y cerrar
sesión). Reglas en la base de datos (`supabase/migrations/20261103130000_cam_username_change.sql`):
3–30 letras minúsculas, números o «_», un cambio cada 30 días, se puede volver
una vez al nombre anterior durante 7 días y el nombre anterior queda reservado
30 días para su dueño. Picks, comentarios y avisos ya publicados pasan al nombre
nuevo. Estilos: `assets/cam-profile-app.css`. Pruebas: `python3 -B tests/profile-edit.py`
y `bash tests/username-change.sh` (PostgreSQL local).


### Inicio y carga del perfil · 3 nov 2026

En Inicio móvil, el Pick del editor precede a la última noticia y a los
carruseles. El preview NFL se oculta solo en Inicio móvil; los rankings
completos permanecen en Noticias NFL. El preview Champions conserva su sitio
en la columna inferior, después de las noticias. Lo más leído precede
inmediatamente a Opinadores distinguidos, reutilizando ambos módulos reales.

El perfil abre su estado de carga en el primer toque. La sesión se lee una
sola vez para pintar la interfaz y se actualiza desde los eventos de Auth;
las consultas privadas siguen autorizadas en Supabase. Takes y Picks aparecen
independientemente cuando llegan, sin esperar el nombre público ni cambiar
la pestaña elegida. Cerrar sesión invalida las respuestas pendientes.
Pruebas: `node tests/profile-loading.mjs`, `node tests/home-mobile-order.mjs`
y `node tests/mobile-bottom-nav.mjs`.

## Consolidación de estilos · 4 nov 2026

La entrega mantiene el orden original de reglas y los límites entre estilos
inline y scripts, con 11 hojas CSS propias en lugar de 28. Los componentes
editables siguen en sus archivos de origen; los dos manifiestos indican dónde
compila cada uno. Regenerar con `npm run build:styles` y comprobar con
`npm run test:performance`. El compresor conserva colores, valores y prioridades.
Se retiraron cinco hojas antiguas de cabecera sin referencias activas.

La comparación previa a la publicación conserva 31 propiedades CSS de todos los elementos de la interfaz
entre el CSS original y consolidado, en las cinco secciones, día/noche y anchos
360, 390, 768 y 1366 px. El único cambio de geometría intencional es el aviso
compacto del Pick del editor cuando está vacío o falla su carga; la ficha vigente
mantiene su diseño. Los mensajes distinguen Picks activos de su historial.
Las fichas de Takes para X se exportan a 1200 × 675 (16:9) en todos los modos de
texto, centrando la composición original sin deformarla. Historia, TikTok,
publicación y Foto conservan sus dimensiones y comportamiento.

### NFL y Fútbol · La semana · 4 nov 2026

Ambos deportes abren **La semana · Takes · Noticias** en móvil. La cabecera de
La semana muestra solo el título: sin la edición NFL ni el resumen de horarios.
El duelo separa el botón principal «Publicar mi take sobre este duelo» de las
selecciones de quiniela. No lleva «Tu opinión». Las tarjetas inferiores van
bajo «Juega la quiniela», sin explicación adicional; conservan «Participar en
la quiniela →». Sigue la quiniela completa. El editor (NFL) y el marcador cierran
la pestaña, después de ella, sin adelantar resultados lunes o martes.

Fútbol reutiliza el selector de ligas, el calendario, equipos y elecciones de
su quiniela. El duelo y las tarjetas corresponden a la competición y jornada
vigentes, con local/empate/visitante y sus puntos publicados. Cambiar de liga
conserva lo guardado; una respuesta atrasada no sustituye la competición actual.
Power Rankings sigue completo en Noticias. Los enlaces antiguos `v=quiniela`
abren La semana y los accesos a partidos enfocan el día y la tarjeta correctos.
La composición de escritorio se conserva.
