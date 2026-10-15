# Acceso mediante usuario y contraseña

El formulario usa la Edge Function `username-auth` y Supabase Auth para verificar contraseñas y guardar sesiones. El registro crea una dirección interna aleatoria y confirmada; no requiere correo ni envía mensajes. Las ocho cuentas anteriores se vincularon por su nombre existente; los tres editores conservan sus permisos.

Se exige confirmación y un mínimo de ocho caracteres para contraseñas nuevas. Cada cuenta recibe un código privado de recuperación de 256 bits, mostrado para que lo guarde el usuario. En la base solo se conserva SHA-256. La recuperación consume el código de forma atómica y lo sustituye. Las cuentas anteriores reciben su código al iniciar sesión y pueden renovarlo confirmando su contraseña.

Las tablas de identidad y límites tienen RLS y no conceden acceso a anon/authenticated. Solo el servicio puede consultarlas. Los límites persistentes son 300 solicitudes globales por diez minutos, 15 por identificador por diez minutos y 20 registros por hora. Son adecuados para el lanzamiento y deben revisarse al aumentar tráfico. No se confía en cabeceras de IP del cliente. El gateway exige JWT y el servicio verifica contraseña/código: la clave pública no concede acceso a cuentas.

La recuperación intenta revocar todas las sesiones de refresco. Los JWT ya emitidos siguen válidos hasta su expiración normal. Si falla la rotación o revocación, se informa que la contraseña cambió y se pide entrar para generar otro código. Perder contraseña y código impide la recuperación automática sin correo.

## Verificación del 15 de octubre de 2026

- Staging real: registro de dos cuentas temporales, acceso sin distinguir mayúsculas, cierre y nueva sesión, errores genéricos, bloqueo de acceso a identidades, publicación de Pick, voto y comentario, recuperación de un solo uso, rechazo de contraseña anterior. Cuentas de prueba eliminadas al terminar.
- DOM automatizado: discrepancia de confirmación bloqueada, sesión guardada, código mostrado y borrado al cerrar, requisitos por modo.
- Migración y función desplegadas en staging y producción; producción mantiene ocho usuarios vinculados y tres editores.
- Aviso de advisor por RLS sin políticas esperado: ambas tablas son privadas del servicio. No añadir políticas públicas para silenciarlo.
- No se ejecutó una comprobación visual en navegador en este entorno. Los mocks del test de navegador se actualizaron para el nuevo transporte.

`npm run test:auth` ejecuta el test DOM. `tests/username-auth-live.py` requiere la clave pública de staging en `AE_STAGING_ANON_KEY`; crea cuentas temporales y emite sus IDs para eliminarlas tras la prueba. Nunca ejecutarlo contra producción.

## Despliegue y reversión

Aplicar `20261015062531_username_auth.sql`, desplegar `supabase/functions/username-auth` con verificación JWT y publicar el frontend. Las variables de servicio permanecen en el runtime de Supabase. No hay credenciales de servicio en Git.

Para revertir diseño, conservar el nuevo acceso y el servicio: las nuevas cuentas usan direcciones internas aleatorias y no podrían entrar con el antiguo algoritmo usuario-a-correo. No eliminar tablas de identidad ni usuarios. El backfill corresponde a las cuentas presentes en el momento de la migración; cualquier registro por un cliente antiguo durante el corte requiere vinculación antes de retirar ese cliente.
