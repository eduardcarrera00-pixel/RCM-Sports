# Capturas para cotejar momios

En Cocina Picks, el usuario empieza eligiendo una captura del boleto completo o,
para una combinada de dos selecciones, una captura por selección. El OCR local
crea el borrador sin escribir previamente deporte, partido, pronóstico ni cuota.
Se conservan el mercado, hándicap/línea y periodo cuando se distinguen. Partido,
selección completa, deporte y momio se muestran como campos de solo lectura: no
se permite reasignar una cuota a otra apuesta desde el formulario. Para cambiarlos
se necesita otra captura. Un cambio programático invalida el resultado completo.

El usuario puede escribir libremente su análisis y debe revisar partido,
pronóstico y fecha antes de publicar. No se le pide introducir ni confirmar el
momio. La fecha ISO reconocida queda bloqueada; si no se lee una fecha ISO se pide
indicarla, sin asumir que el evento se juega hoy. Un deporte sin identificación
inequívoca se clasifica como «Otros». No se inventa el partido ni el mercado.
El comprobante de lectura permanece solo en memoria y se pierde al recargar:
recuperar un borrador de texto requiere volver a importar la captura.

Los nuevos Picks cotejados se publican sin esperar aprobación manual de la cuota.
Su etiqueta dice «Momio cotejado con captura». El resultado deportivo y los puntos
siguen dependiendo del proceso de liquidación existente. Los Picks anteriores no
se actualizan ni se aprueban retroactivamente. Las versiones anteriores del cliente
pueden seguir enviando Picks por el flujo pendiente para mantener compatibilidad.

## Alcance y límites

El formato simple continúa en pruebas, con una o dos selecciones y cuota total
mínima +100. Los boletos Same Game Parlay+ completos se describen al final.
Reconoce cuotas americanas con signo, decimales y fraccionarias; no interpreta
cifras enteras sin signo como cuotas americanas. Rechaza datos incompletos,
alternativas ambiguas, cuotas de baja confianza y totales incompatibles. Puede
abstenerse con capturas válidas de casas o diseños que todavía no reconoce.
No se adivinan equipos por apodos ni se usan los dos equipos del encabezado como
selección. Las cuotas automáticas necesitan confianza OCR de al menos 85; ese
valor no es una probabilidad ni garantiza exactitud. El extractor es conservador:
requiere evento y selección con mercado reconocible. Los boletos que mezclan
selecciones desactivadas y activas pueden rechazarse; no se elige una combinación
solo porque su producto coincida con el total. Tampoco se inventan cuotas de
selecciones si solo aparece el total de la combinada.

No consulta una casa de apuestas, no acredita una apuesta real y no autentica la
imagen. El cotejo se ejecuta en el cliente y su declaración se podría fabricar
mediante un cliente modificado. La base de datos comprueba la correspondencia de
esa declaración con las selecciones; esto no constituye una verificación externa.

## Privacidad y carga

Tesseract, su worker, el núcleo WASM y los idiomas inglés/español están fijados y
alojados junto a la web. Se descargan al elegir una captura, no al cargar Picks.
La primera lectura descarga aproximadamente 9 MB y puede tardar en móviles.

La imagen no se transmite a Supabase ni a un proveedor OCR, no se muestra en el
feed y no se almacena en localStorage, IndexedDB ni Storage. El selector se vacía,
los bitmaps se cierran, los canvases se vacían y el worker se termina tras leer,
cancelar o fallar. Esto libera las referencias de la aplicación; no elimina el
archivo original del dispositivo ni promete borrado físico de memoria. El motor
usa `cacheMethod: 'none'`; la caché HTTP puede conservar los recursos públicos del
motor, no la captura.

Se envía con el Pick solo la declaración del cotejo: evento, selección, momio,
confianza y, si existe, total. El trigger la compara y la sustituye por método,
versión y fecha. No persisten las lecturas ni el texto OCR completo. Ningún
privilegio de actualización permite cambiar la evidencia, el Pick ni la cuota.

## Validación

`npm run test:capture` verifica parser, vinculación de selección/cuota, importes y
hándicaps, combinadas, redondeo, confirmación, invalidación al editar, limpieza,
cancelaciones, RLS, compatibilidad y publicación del compositor. Las pruebas de
base de datos usan PostgreSQL embebido; la migración se aplica dos veces para
comprobar idempotencia.

La carpeta de pruebas original contiene 24 capturas públicas de documentación de
cinco casas. No son capturas de usuarios beta ni 24 formatos independientes: hay
imágenes relacionadas de una misma secuencia. Diez carecen de datos suficientes;
otras contienen más de dos selecciones, fuera del compositor actual. Se evalúan
las cuatro capturas reservadas por casa sin ajustar el parser a su OCR. Los
resultados históricos del cotejador anterior se registran en `pick-capture-benchmark.json` (no miden la nueva importación automática): se aceptaron cuatro
de las nueve capturas completas con una o dos selecciones y ninguna de las dos
completas con una o dos selecciones reservadas por casa. Ninguna de las diez
capturas incompletas se aceptó. Una abstención no se
contabiliza como un acierto. Este corpus no acredita compatibilidad general y se
necesitan más capturas de uso real antes de ampliar las promesas del lector.

Se comprobó previamente en Chromium la lectura real del caso simple MOM-018,
confirmación, publicación contra un backend simulado, limpieza y ocho tamaños/
temas del formulario. La salida real del caso combinado MOM-022 permitió corregir
la separación de selecciones y el total en líneas distintas. La prueba sobre esa
salida OCR reproduce la combinada +329. No se publicó ningún Pick de prueba real.

## Importación automática: comprobaciones adicionales

`npm run test:capture` comprueba que se puede empezar con un formulario vacío,
que el momio solo cambia al importar otra imagen, que cambiar evento, selección,
deporte o cuota invalida el comprobante y que el análisis permanece libre.
Incluye importación de mercados y hándicaps sin confundirlos con cuotas o importes.
La base de datos ya enlaza evento, selección y cuota; esta ampliación no cambia
permisos, políticas, tablas ni el formato del comprobante existente.

`npm run test:capture:browser` prueba OCR real sobre recibos **generados para las
pruebas**, publicación contra backend simulado, importación simple/combinada,
campos de solo lectura y ocho tamaños/temas. Puede usar `AE_CHROMIUM_PATH` para
un Chromium instalado. Esas pruebas no acreditan compatibilidad con todas las
casas. La revisión con capturas públicas reales aceptó MOM-018 y rechazó MOM-022:
el OCR del segundo recibo mezcla selecciones visibles activas e inactivas y,
en otra segmentación, pierde la cuota de una selección. Esa abstención es
intencional; no se presenta como una lectura correcta.

Comprobación final del 19 de octubre: importación OCR simple/combinada en
Chromium, ocho combinaciones de tamaño y tema, y pruebas de perfiles, noticias y
borradores. En la base pública, una transacción revertida comprobó publicación
simple +150, combinada +329 y rechazo al cambiar la selección sin cambiar su
lectura. No quedaron Picks temporales; la imagen no formó parte de las peticiones.

## Boletos con Same Game Parlay y promociones

La importación de boletos con «Includes: … Same Game Parlay … + … selection»
conserva la combinada completa como un único Pick con su cuota total. Une cada
jugador/selección con su mercado y partido; no asigna la cuota del grupo a cada
jugador ni multiplica las cuotas internas para sustituir el total del boleto.
Las etiquetas Bonus Bet, Profit Boost y Super Sub no son selecciones.

Cuando se detectan el precio amarillo aumentado y el precio anterior tachado,
se vuelve a leer solo la zona del original. Requiere una lectura de alta confianza,
sin discrepancia con otra lectura clara. La cuota se mantiene automática: ni los
porcentajes de boost ni el stake, pago o saldo se usan para reconstruirla.
No se mezclan dos boletos completos como si fueran una sola apuesta.

Se permiten decoraciones y partes de una tarjeta previa recortadas. Si falta el
total original se muestra un resumen parcial, se pide una captura donde se lea
ese total y no se habilita publicar. No se presenta una recuperación parcial como
una importación completa. Se siguen admitiendo una o dos selecciones del formato
anterior; los boletos anidados admiten hasta veinte condiciones leídas dentro de
una única apuesta. Esta es compatibilidad con esa estructura, no con cualquier
captura o casa.

Las pruebas con las dos capturas aportadas por el usuario recuperaron las cinco
condiciones del boleto de fútbol a +737, excluyendo +1104, y las seis condiciones
del boleto NFL cuyo total está recortado. Las imágenes y su OCR completo se usan
solo en las pruebas locales y no forman parte del repositorio ni de la base.
`AE_CAPTURE_USER_FIXTURES` permite comprobar de nuevo esas capturas localmente;
las pruebas habituales incluyen ejemplos generados y texto de regresión.

## Boletos «Momios / Apuesta total» (Playdoit y casas similares) · 20 oct 2026

El historial de Playdoit muestra cada selección como «Selección … momio», debajo el
mercado («Penalti en el encuentro») y después «Partido … 20/10 • 14:00», seguido de
«Momios», «Apuesta total» y «Ganancia Total». `extractMomiosTicket` lee ese bloque
de abajo arriba desde «Momios», de modo que las filas de mercado visibles encima del
boleto («Sí 2.75 · No 1.40») no se toman como la apuesta. Une las filas que el OCR
separa (selección/momio, partido/fecha), exige confianza ≥ 85 en los momios,
comprueba que el producto de las selecciones coincide con «Momios» y rechaza los
boletos ya resueltos (ganada, perdida, cancelada…). La fecha DD/MM sin año toma el
año más cercano a hoy. Una selección Sí/No se publica como «Mercado: Sí».
Prueba: `node tests/pick-momios-parser.cjs` (datos inventados con esa estructura).

## Lectura avanzada con IA: modelo

Google retiró `gemini-2.5-flash` y la lectura avanzada devolvía 404 desde el 20 oct.
`ae-read-ticket` usa ahora `AE_TICKET_MODEL` o el alias `gemini-flash-latest`; si el
modelo responde 404, consulta la lista de modelos y usa el Flash más reciente que
admita `generateContent`, y lo recuerda mientras la función siga activa. El modelo
usado se guarda en `ae_pick_capture_reads.model`.
