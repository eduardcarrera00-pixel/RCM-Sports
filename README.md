# CAM SPORTS

Dirección pública gratuita de CAM SPORTS: **https://camsports.github.io/**

El código se mantiene en este repositorio. La publicación con la marca se configura
en [camsports/camsports.github.io](https://github.com/camsports/camsports.github.io)
y comprueba los cambios cada cinco minutos mediante GitHub Actions. GitHub puede
retrasar esas ejecuciones. Las direcciones anteriores de GitHub Pages, incluida
https://aesportsclub.github.io/, siguen disponibles con la misma fuente y datos.

Noticias deportivas y una comunidad de lectores que comentan, responden y votan.

La web se sirve con GitHub Pages. Las publicaciones, comentarios, votos y NFL Power Rankings utilizan Supabase. El ranking se prepara como borrador y se publica como un conjunto de diez posiciones. Las cuentas lectoras no reciben permisos de administración.

**Actualización 13/10/2026: revisar la [guía actual](docs/ACTUALIZACION-20261013.md) antes de hacer merge.**

Incluye navegación por equipos, likes compartidos y confirmación pública de rankings. Requiere inspeccionar el proyecto y aplicar la nueva migración `03_equipos_y_likes.sql`; no volver a ejecutar 01 sin revisar sus efectos históricos.

La [entrega anterior](docs/ENTREGA.md) es documentación histórica. Empieza por `supabase/00_inspeccion_solo_lectura.sql`; no ejecutes la migración sin revisar la estructura y los permisos existentes.

No incluyas claves privadas ni claves `service_role` en esta web estática. La clave publicable identifica el proyecto; la protección de los datos depende de Auth, RLS y las funciones SQL.

Desarrollo: `npm ci`, `npm run build:css`, `npx playwright install chromium`, `npm test`.
La hoja de estilos compilada ya está incluida: GitHub Pages no requiere npm para servir el sitio.
