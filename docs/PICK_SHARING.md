# Compartir Picks y Takes en redes

Los Picks públicos de la comunidad tienen un botón **Compartir** en el feed,
el detalle, el historial y las tarjetas del perfil. Los botones existentes del
Pick del editor, en Inicio y en Picks, abren el mismo panel. Tras publicar un Pick,
el usuario puede compartirlo desde su tarjeta; nunca se envía automáticamente.

Los perfiles propios y públicos también incluyen **Compartir** en Mejor Take,
Peor Take, Unpopular Take/Más popular y Takes recientes. Los Takes ocultos por
moderación no se comparten. Se conservan título, texto, deporte y atribución
al autor. La tarjeta muestra una vista previa; «Copiar texto» conserva todo el
Take. Su enlace `?perfil=AUTOR&take=ID` abre la conversación de ese Take desde
el perfil, también sin iniciar sesión. Si ya no está público, se muestra un
aviso de indisponibilidad. Nunca se publican borradores ni datos de la cuenta.

La opción elegida por el propietario es compartir desde un botón, sin conectar
cuentas ni solicitar credenciales. X abre su compositor oficial con texto y un
enlace permanente. Instagram y TikTok usan el menú nativo del dispositivo para
entregar una tarjeta PNG; el usuario elige una app disponible y termina de
publicar en ella. El navegador no puede forzar un destino en ese menú ni saber
si la red terminó de publicar. Si no admite compartir archivos o no aparece la
app, se ofrece descargar la tarjeta, copiar el texto y copiar el enlace.

La tarjeta de 1080 × 1350 muestra autor, título, selecciones, cuota, estado y
fecha del evento. Indica cuando una cuota sigue en revisión. Las combinadas de
más de tres selecciones muestran una vista previa rotulada; el texto conserva
todas las selecciones y enlaza al Pick completo. Para el Pick editorial se usa
la atribución CAM SPORTS y el enlace `?weeklyPick=...`; para la comunidad,
`?pick=...`. Los enlaces siempre apuntan al dominio canónico y no heredan
parámetros privados de la página actual.

Se dibuja una imagen nueva con los campos públicos: no se usa la captura de
la apuesta, no se muestran importes ni se envían datos de comprobación OCR.
La imagen se genera localmente y se liberan sus URLs al cerrar el panel. Los
archivos se preparan antes de pulsar un destino para conservar el permiso de
usuario que exige Web Share. Cancelar no produce otra acción ni un mensaje de
publicación exitosa.

Código: `assets/cam-pick-share.js`; estilos en el bundle editorial.
Pruebas: `npm run test:sharing`, `npm run test:sharing:browser`,
regresiones de Picks, perfil y editor. Las pruebas no publican en redes reales.
