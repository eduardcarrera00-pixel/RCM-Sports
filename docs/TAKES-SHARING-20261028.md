# Fichas de Takes para redes · 28 de octubre de 2026

El listado de NFL/Fútbol, los perfiles y el detalle de cada Take abren el mismo
`CamPickShare`. El detalle añade un único botón junto al autor; cerrar la ficha
conserva la conversación y devuelve el foco al botón.

La ficha usa el logo oficial `assets/cam-sports-logo-completo.webp`, azul CAM,
Playfair Display y Libre Baskerville locales. Las fuentes del lienzo se cargan
con nombres propios para que la exportación no dependa de la carga de los
estilos de la página. Título arriba, Take debajo, autor y fecha original con
«Take guardado en». No se duplican título y cuerpo si contienen el mismo texto.

La explicación es opcional, de hasta 240 caracteres, con vista previa en vivo.
No se guarda en el Take ni escribe en la base de datos. Al vaciarla se elimina
su bloque y se recompone el contenido. Restablecer recupera el diseño inicial.

## Formatos y textos

| Formato | PNG | Márgenes del contenido |
| --- | --- | --- |
| Publicación, predeterminado | 1080 × 1350, 4:5 | 82 px a izquierda/derecha, 76 px arriba/abajo |
| Historia | 1080 × 1920, 9:16 | 280 px arriba, 350 px abajo, 82 px izquierda y 144 px derecha |
| Cuadrada, compatibilidad | 1080 × 1080, 1:1 | Conserva la opción anterior |

Los márgenes de Historia son una decisión de diseño para proteger el contenido
de las interfaces; no garantizan todas las variantes de todas las plataformas.

Se conservan los modos Solo título, Con resumen y Título y Take. Los Takes
largos permiten elegir fragmentos exactos del original; el PNG los identifica
como «FRAGMENTO ORIGINAL». El resumen extractivo también se identifica. El texto
copiable conserva el Take completo y su enlace público.

El ajuste de texto usa medidas reales, sin elipsis ni recorte del título y con
un mínimo de tamaño. Una combinación excepcional que no cabe ofrece un mensaje
para acortar la explicación, escoger otro fragmento o cambiar de formato; no
exporta un texto ilegible. No se reservan huecos para una explicación vacía.

## Verificación realizada

- `npm run test:sharing`: Picks existentes, perfiles, Takes y detalle; original
  inmutable, fecha, logo, explicación, restablecer, cancelación y generaciones
  de PNG obsoletas.
- `npm run test:picks` y `node tests/profile-compose.mjs`: integración existente.
- `node tests/football-latest-takes-ui.mjs`: listado, votos, comentarios y paginación.
- `npm run test:performance`: packs CSS y orden de cascada conservados.
- Chromium real mediante `tests/take-sharing-browser-qa.html`: 36 combinaciones;
  con/sin explicación, título de 160 caracteres, palabra sin espacios, autor
  largo, cuerpo vacío/duplicado, 4:5/9:16, anchos 320/375/390/430/768/1366 px y
  temas día/noche. Logo decodificado y fuentes reales cargadas.
- Descargas reales desde el navegador en ambos formatos: bytes idénticos a la
  vista previa. El archivo entregado al menú nativo simulado también coincide,
  y la llamada conserva la activación del clic.

| Descarga real | SHA-256 |
| --- | --- |
| 4:5 | `ff03510f90ad62aec7ea8802592414e5640181bbef1e2cb7f3ac7f464acb9d48` |
| 9:16 | `8340504a121ad20018d4e90ad18eadc2ace8b8a4407b3a630601634ea3428cd6` |

[PNG de publicación](qa/take-sharing-20261028/take-feed.png) ·
[PNG de historia](qa/take-sharing-20261028/take-story.png) ·
[Editor en escritorio](qa/take-sharing-20261028/editor-desktop.jpg)

La suite de navegador de CI queda actualizada para Chromium y WebKit; sus
resultados se consultan en la solicitud de cambios. La selección de aplicaciones
reales en el menú nativo de un iPhone físico sigue sin comprobarse en este entorno.

Sin migraciones ni configuración externa. El componente y el ajuste de bloques
quedan disponibles para una fase posterior de Picks; su diseño actual se conserva.
