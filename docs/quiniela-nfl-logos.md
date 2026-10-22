# La Quiniela NFL — reutilización de logos

Esta pieza es **independiente del desarrollo de La Quiniela**. No reemplaza
`assets/nfl-teams.js`, no descarga imágenes y no modifica otros módulos NFL.

## Integración al terminar la pantalla de La Quiniela

1. Cargar `assets/nfl-teams.js` **antes de**
   `assets/cam-nfl-quiniela-logos.js` en el HTML.
2. Los estilos de La Quiniela se integraron en el bloque existente
   `<style id="cam-nfl-quiniela-theme">` de `index.html`, sin añadir una
   petición CSS nueva ni modificar el bundle editorial. La hoja
   `assets/cam-nfl-quiniela-logos.css` queda como fuente aislada de referencia
   para mantenimiento. No duplicarla en `style-sources.json` sin retirar
   primero la copia integrada en la página.
3. Renderizar **el mismo componente** en jornadas, resumen, historial,
   resultados y desglose de clasificación, con ambas imágenes siempre
   presentes y `selectedTeamId` para mostrar la elección.
4. Cuando la API proporcione el catálogo de equipos, ejecutar
   `CamNFLQuinielaTeams.registerProviderTeams(equiposDeLaAPI)`.
   Las abreviaturas más frecuentes ya están normalizadas. Los ID
   numéricos de proveedores no se deben asumir.
5. Guardar los picks con el `id` canónico del equipo devuelto por
   `CamNFLQuinielaTeams.getTeamId(...)`.

Ejemplo (creación de nodos, **sin** insertar HTML sin sanear):

```js
const ui = window.CamNFLQuinielaTeams;
const match = ui.createMatchup(
  { AwayTeam: game.away_team, HomeTeam: game.home_team },
  {
    selectedTeamId: userPick?.team_id ?? null,
    interactive: game.canPick,
    locked: !game.canPick,
    pickResult: userPick?.result ?? null, // 'correct', 'incorrect', 'void'
    onSelect: canonicalTeamId => savePick(game.id, canonicalTeamId)
  }
);
container.replaceChildren(match);
```

Para la **vista del historial** usar `interactive: false`, `locked: true`.
Para la **jornada abierta** usar `interactive: true` y la función `onSelect`.
La etiqueta de resultado solo aparece si se pasa `pickResult`.

## Verificaciones

- `node tests/cam-nfl-quiniela-logos.mjs` prueba los 32 logos y los estados.
- La prueba de navegador final debe comprobar selecciones, bloqueo y resultados
  en modos día/noche, escritorio/móvil, y que el catálogo NFL usado en los
  Power Rankings no cambie.
- Si una API envía un equipo desconocido, se muestra «Equipo por confirmar»
  con `data-unknown-team`, nunca se asigna el escudo de otro equipo.
- Si una URL existente no carga, se marca `data-logo-error` (atributo
  real: `data-logo-error` derivado de `dataset.logoError`) para
  diagnosticar el problema, sin descargar assets alternativos.
