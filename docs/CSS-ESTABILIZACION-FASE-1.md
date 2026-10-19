# AE SPORTS · Estabilización de CSS — fase 1

Estado: **rama de mantenimiento, sin publicación automática**.
Rama: `maintenance/css-safe-phase1-20261018`.

## Objetivo y restricciones

Organizar el CSS sin alterar ni un píxel de los diseños aprobados de AE SPORTS,
Picks, NFL, Fútbol, modo día/noche y versiones móvil/escritorio. No modificar datos,
Supabase, logotipos, iconos, ilustraciones ni lógica de comunidad.

## Inventario de carga real

El navegador carga `assets/site.css`, luego
`assets/ae-editorial-bundle.css` (76 hojas originales concatenadas en el orden de
`assets/style-sources.json`) y después las hojas individuales enlazadas en
`index.html`. El orden es parte del diseño; no mover estilos entre hojas sin
verificarlo en el navegador.

**11 hojas se cargan tanto desde el bundle como individualmente**:

1. `assets/ae-power-rankings-scenic.css`
2. `assets/ae-football-takes-scenic.css`
3. `assets/ae-football-news-debate.css`
4. `assets/ae-football-news-editorial.css`
5. `assets/ae-home-cta-icons.css`
6. `assets/ae-picks-platos-odds.css`
7. `assets/ae-mobile-polish-weekly-pick.css`
8. `assets/ae-nfl-mobile-ranking-compact.css`
9. `assets/ae-champions-mobile-ranking-compact.css`
10. `assets/ae-home-weekly-match-picks-mobile.css`
11. `assets/ae-mobile-home-takes-swipe-and-football-news.css`

Estas cargas duplicadas son **candidatas a revisión**, no eliminaciones
automáticas: la copia final puede sobrescribir valores de otros estilos.

## Cambios ejecutados en esta fase

- Eliminada una regla `#aeNotificationsBadge[hidden]{display:none!important}`
  duplicada literalmente en `assets/ae-classical-auth-buttons.css`; se conserva
  la misma regla posterior con idéntica especificidad y sin condición de media.
- Agregado `npm run css:audit`, inventario de carga y reglas por selector,
  sin modificar CSS. `npm run css:audit -- --json` da el informe estructurado.
- Agregado `npm run test:css` como control de archivos existentes y cambios
  accidentales de carga. También está incluido en `npm test`.
- Preparado GitHub Actions en la rama para comprobar CSS y suites actuales
  de publicación, acceso y borradores.

Esta fase no modifica `index.html`, `assets/style-sources.json`,
`assets/ae-editorial-bundle.css` ni los recursos de marca.

## Mapa de propiedad de componentes (provisional)

| Componente | Fuentes principales a revisar antes de cambiar |
|---|---|
| Base, tipografía, temas | `assets/site.css`, `assets/ae-visual-system.css`, `assets/ae-day-mode.css` |
| Cabecera y navegación | `assets/ae-desktop-header-layout.css`, `assets/ae-mobile-header-ranking-polish.css`, `assets/ae-classical-auth-buttons.css` |
| Portada AE Sports | `assets/ae-premium-home.css`, `assets/ae-home-focus-hierarchy.css`, `assets/ae-mobile-compact-home.css` |
| Picks y Chefs | `assets/ae-picks-dishes-order-mobile-20261018.css`, `assets/ae-picks-platos-chefs-layout-20261017.css`, `assets/ae-pick-compose-dialog.css` |
| NFL | `assets/ae-nfl-mobile-reference.css`, `assets/ae-nfl-takes-opinions-order-20261018.css`, `assets/ae-nfl-mobile-ranking-compact.css` |
| Fútbol | `assets/ae-football-mobile-redesign.css`, `assets/ae-football-news-debate.css`, `assets/ae-football-news-editorial.css` |
| Noticias y conversaciones | `assets/ae-article-actions-conversation.css`, `assets/ae-reading-accessibility.css`, `assets/ae-take-discussion-reference.css` |

Estos son puntos de entrada, no propietarios exclusivos. Muchos selectores
aún cruzan componentes, que precisamente es la deuda pendiente.

## Pruebas y riesgos conocidos

La prueba `npm run test:css` pasó en GitHub Actions en el primer CI. La
suite antigua `tests/community-picks-ui.mjs` falló antes de llegar a los demás
tests porque presupone los campos de un formulario anterior (intenta asignar
`f[6].value` cuando el composer actual ya no contiene ese campo).
Ese fallo no está causado por esta eliminación CSS; debe actualizarse por
separado y no ignorarse al dar una aprobación general.

No se han capturado ni comparado aún las 16 referencias visuales mínimas
(4 secciones × 2 tamaños × 2 temas). Por tanto **no se puede afirmar que
toda la web haya pasado una auditoría visual completa**.

## Pasos para continuar sin riesgo

1. Crear capturas visuales de `main` a 390, 768 y 1366 px, día y noche,
   con datos de prueba reproducibles; guardar referencias fuera de producción.
2. Ejecutar pruebas funcionales y reparar los tests obsoletos (sin cambiar la
   funcionalidad publicada para adaptarla a los tests).
3. Tratar las 11 dobles cargas *una por una*; modificar una sola condición de
   cascada y comparar estilos computados + screenshots.
4. Consolidar tokens CSS sin modificar valores computados y mover reglas
   solo cuando su destino esté identificado.
5. Revisar el diff completo y hacer merge únicamente con pruebas y comparaciones
   aprobadas. La web oficial sigue leyendo la rama `main`, no esta rama.

## Comandos

```bash
npm ci
npm run css:audit
npm run test:css
npm run test:auth
npm run test:drafts
node tests/pick-composer-direct.mjs
```
