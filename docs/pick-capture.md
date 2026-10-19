# Capturas para cotejar momios

En Cocina Picks, el usuario completa deporte, partido, pronóstico, momio y fecha.
Después elige una captura del boleto completo o, para una combinada de dos
selecciones, una captura por selección. La lectura coteja los datos escritos,
muestra las cuotas detectadas y pide confirmar antes de publicar. Un cambio de
partido, pronóstico, deporte o momio invalida el cotejo anterior.

Los nuevos Picks cotejados se publican sin esperar aprobación manual de la cuota.
Su etiqueta dice «Momio cotejado con captura». El resultado deportivo y los puntos
siguen dependiendo del proceso de liquidación existente. Los Picks anteriores no
se actualizan ni se aprueban retroactivamente. Las versiones anteriores del cliente
pueden seguir enviando Picks por el flujo pendiente para mantener compatibilidad.

## Alcance y límites

Primera versión en pruebas, con una o dos selecciones y cuota total mínima +100.
Reconoce cuotas americanas con signo, decimales y fraccionarias; no interpreta
cifras enteras sin signo como cuotas americanas. Rechaza datos incompletos,
alternativas ambiguas, cuotas de baja confianza y totales incompatibles. Puede
abstenerse con capturas válidas de casas o diseños que todavía no reconoce.
Se pide escribir los nombres como aparecen en la captura; no se adivinan equipos
por apodos ni se confunden los dos equipos del encabezado con la selección.

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
resultados se registran en `pick-capture-benchmark.json`: se aceptaron cuatro
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
