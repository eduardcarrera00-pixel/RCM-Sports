# Compartir Takes

El editor de `assets/cam-pick-share.js` genera un PNG local a partir del Take
que recibe el flujo de perfil existente. No actualiza la publicación, sus
votos, comentarios ni ningún dato de Supabase. Picks y Pick del Editor
conservan sus generadores y opciones.

La imagen azul #073B83 utiliza Playfair Display 600 y Libre Baskerville
servidas desde los archivos de fuentes existentes. La exportación espera
a que se carguen. La vista previa, la descarga y Web Share utilizan los
mismos bytes PNG, en 1080 × 1080 o 1080 × 1920. El formato vertical reserva
280 px arriba, 420 px abajo y espacio para los controles laterales de TikTok.
Son márgenes conservadores; la interfaz de cada plataforma puede cambiar.

Por defecto se muestran el título original, autor y día de publicación,
con la misma zona horaria del navegador que utiliza la publicación original.
El resumen es extractivo: selecciona hasta dos frases iniciales del Take,
sin añadir información, y aparece identificado como resumen. Los fragmentos
son porciones contiguas del texto original; el usuario puede elegirlos,
pero no editarlos. El tamaño visual, formato y fecha solo afectan al PNG.

`Compartir imagen` llama a Web Share desde el toque, después de preparar el
archivo. Instagram y TikTok reciben un archivo solo; el enlace puede copiarse
por separado. El botón general incluye texto/enlace cuando `canShare` lo
admite y ofrece un segundo toque de archivo solo si falla esa combinación.
Una cancelación no se anuncia como publicación. Sin soporte de archivos,
se ofrecen descarga y copia del enlace. El botón X de Takes nunca abre un
compositor de texto presentándolo como si tuviera la imagen adjunta.

Verificación: `npm run test:sharing`, `npm run test:sharing:browser` y
`CAM_SHARE_BROWSER=webkit node tests/pick-sharing-takes-browser.cjs`.
El último comprueba el motor WebKit con tamaño y parámetros de iPhone.
Las pruebas nativas usan un receptor simulado: verifican activación y bytes
del archivo, sin abrir ni publicar en cuentas sociales. La aceptación final
por una aplicación y el menú de un iPhone físico requieren prueba manual.
