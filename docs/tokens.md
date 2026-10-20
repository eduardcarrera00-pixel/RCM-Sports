# CAM SPORTS · Tokens de diseño

Fuente única: `assets/ae-tokens.css` (primera hoja del bundle).
Capa de armonía que los aplica: `assets/ae-armonia.css` (última hoja del bundle).
Fecha: 20 oct 2026.

## Reglas para lo nuevo

1. **Nunca un hex, rgb o tamaño suelto.** Usa `var(--ds-…)`. Si falta un token,
   añádelo en `ae-tokens.css` con su valor de día **y** de noche, y documéntalo aquí.
2. **Cada color tiene pareja de noche.** Los colores se redefinen en `html.dark`;
   el resto (espaciado, tipografía, forma) es igual en los dos temas a propósito.
3. **Hojas nuevas al manifiesto**, en `assets/style-sources.json`, nunca otro `<link>`.
   Después: `node scripts/build-editorial-css.mjs` (ya no necesita Tailwind).
4. **Especificidad.** La página carga ~50 hojas sueltas después del bundle. Las
   reglas de armonía empiezan por `html:not(#ds):not(#ds):not(#ds) body …` para
   ganar sin tocar el HTML. Copia ese patrón si añades reglas a esa capa.
5. **Contraste mínimo:** 4.5:1 en texto normal; 3:1 en texto grande, iconos y
   contornos de controles. El color nunca es la única señal (añade texto, flecha
   o icono).
6. **Táctil:** todo control mide al menos 44 × 44 px (`--ds-target-min`).

## Color

### Azul de marca (tono 212°, saturación contenida)

| Token | Valor | Uso |
|---|---|---|
| `--ds-blue-50` | #F1F5F9 | Fondo de acento muy suave |
| `--ds-blue-100` | #DFE7F1 | Tarjeta de acento (día) |
| `--ds-blue-200` | #C1D0E2 | Contorno de acento (día) |
| `--ds-blue-300` | #97B1CE | Acento sobre fondo noche |
| `--ds-blue-400` | #688FBB | — |
| `--ds-blue-500` | #416D9F | — |
| `--ds-blue-600` | #325986 | Acento de texto/iconos (día) |
| `--ds-blue-700` | **#284A71** | **Cabecera y pie, día** |
| `--ds-blue-800` | #213750 | Tarjeta de acento (noche) |
| `--ds-blue-900` | **#1C2D40** | **Cabecera y pie, noche** |
| `--ds-blue-950` | #121E2B | Texto sobre acento (noche) |

Antes la cabecera era #023787 (saturación 97 %) en los dos temas.

### Semánticos (día / noche)

| Token | Día | Noche | Uso | Contraste día · noche |
|---|---|---|---|---|
| `--ds-chrome` | #284A71 | #1C2D40 | Fondo de cabecera y pie | — |
| `--ds-on-chrome` | #F5ECDF | #F5ECDF | Texto e iconos sobre chrome | 7.8 · 12.0 |
| `--ds-on-chrome-muted` | #C9D3DE | #C5CDD2 | Texto secundario sobre chrome | 6.0 · 8.7 |
| `--ds-chrome-control` | crema 10 % | crema 7 % | Fondo de botones de la cabecera | — |
| `--ds-chrome-control-line` | crema 34 % | crema 26 % | Contorno de botones de la cabecera | — |
| `--ds-chrome-line` | crema 20 % | crema 14 % | Separadores dentro del chrome | — |
| `--ds-bg` | #EEEAE3 | #081724 | Fondo de página | — |
| `--ds-surface` | #FFFCF8 | #102B3E | Tarjetas, paneles, diálogos | — |
| `--ds-surface-soft` | #F4F0E9 | #0B2030 | Pies de tarjeta, bloques de apoyo | — |
| `--ds-surface-sunken` | #E7E2D9 | #061420 | Zonas hundidas | — |
| `--ds-line` | #D9D9D0 | #49606C | Separadores (decorativo) | — |
| `--ds-line-strong` | #8A7A6A | #6F8796 | Contorno de controles | 3.5 · 4.8 (sobre bg) |
| `--ds-text` | #273B49 | #F4E8DB | Texto principal | 9.7 · 15.0 (sobre bg) |
| `--ds-text-muted` | #566876 | #C5CDD2 | Extractos, fechas, vacíos | 4.8 · 11.3 (sobre bg) |
| `--ds-text-subtle` | #5A6873 | #A7B4BD | Atenuado | 5.6 · 6.9 (sobre surface) |
| `--ds-text-on-media` | #FFFAF2 | #FFFAF2 | Texto sobre foto con velo | — |
| `--ds-action` | #855B43 | #BD8D6B | Acciones, enlaces, indicador de pestaña | 4.9 · 6.2 (sobre bg) |
| `--ds-action-hover` | #6F4A36 | #D2A582 | Hover de acción | — |
| `--ds-action-soft` | #F3E6DA | cobre 16 % | Hover de botones secundarios | — |
| `--ds-on-action` | #FFFFFF | #081724 | Texto sobre relleno de acción | 5.9 · 6.2 |
| `--ds-gold` | #D4AE83 | #D4AE83 | Dorado de marca: solo decorativo | — |
| `--ds-accent` | #325986 | #97B1CE | Picks de la comunidad, información | 5.8 · 5.5 (sobre accent-soft) |
| `--ds-accent-soft` | #DFE7F1 | #213750 | Tarjeta de acento | — |
| `--ds-accent-softer` | #F1F5F9 | #1C2D40 | Degradado de la tarjeta de acento | — |
| `--ds-accent-line` | #C1D0E2 | #3B5675 | Contorno de acento | — |
| `--ds-on-accent` | #FFFFFF | #121E2B | Texto sobre acento | 7.2 · 7.6 |
| `--ds-success` / `-bg` | #2E6A4C / #E4F0E8 | #86C9A5 / verde 14 % | Acierto | 5.5 · >8 |
| `--ds-error` / `-bg` | #A23B2F / #F7E3DF | #F2A196 / rojo 14 % | Fallo | 5.3 · >8 |
| `--ds-warning` / `-bg` | #83561A / #F6EAD6 | #E6B873 / ámbar 14 % | Aviso | 5.3 · >8 |
| `--ds-info` / `-bg` | #325986 / #F1F5F9 | #97B1CE / azul 14 % | Información | — |
| `--ds-focus` | #855B43 | #D2A582 | Contorno de foco | 4.9 · 8.2 |
| `--ds-focus-on-chrome` | #F5ECDF | #F5ECDF | Foco en cabecera y pie | — |
| `--ds-overlay` | azul 62 % | azul 66 % | Velo sobre fotos | — |

## Tipografía

Familias: `--ds-font-serif` (Newsreader → Georgia) para titulares;
`--ds-font-sans` (Inter → system-ui) para lectura y controles.

| Token | Tamaño | Uso |
|---|---|---|
| `--ds-text-2xs` | 11 px | Mínimo absoluto: etiquetas, cabeceras de tabla |
| `--ds-text-xs` | 12 px | Metadatos, chips, cuotas |
| `--ds-text-sm` | 13 px | Extractos, pestañas, estados vacíos |
| `--ds-text-base` | 15 px | Texto de interfaz |
| `--ds-text-md` | 17 px | Lectura larga, entradilla |
| `--ds-text-lg` | 18 → 23 px (fluido) | Títulos de tarjeta |
| `--ds-text-xl` | 20 → 27 px (fluido) | Títulos de módulo |
| `--ds-text-2xl` | 23 → 32 px (fluido) | Títulos de sección |
| `--ds-text-3xl` | 26 → 39 px (fluido) | Portada |
| `--ds-text-4xl` | 30 → 56 px (fluido) | Display |

Interlineado: `--ds-leading-title` 1.18 (nunca menos de 1.1),
`--ds-leading-snug` 1.3, `--ds-leading-ui` 1.4, `--ds-leading-body` 1.65.
Peso de titulares `--ds-weight-title` 600. Mayúsculas con `--ds-tracking-caps` .08em.

## Espaciado

`--ds-space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-6` 24 · `-8` 32 · `-12` 48 · `-16` 64 px.
Margen lateral en móvil `--ds-gutter` 16 px. Hueco entre secciones
`--ds-section-gap` 24 px (móvil) → 32 px (escritorio).

## Forma, profundidad e interacción

| Token | Valor | Uso |
|---|---|---|
| `--ds-radius` | 0 | Todo es recto |
| `--ds-radius-round` | 999 px | Solo avatares y puntos |
| `--ds-border` | 1 px | Grosor de contornos |
| `--ds-shadow-soft` | día 0 12px 32px rgba(20,35,48,.07) · noche 0 14px 36px rgba(2,13,23,.19) | Tarjetas |
| `--ds-shadow-raised` | día 0 18px 40px rgba(20,35,48,.12) · noche 0 20px 44px rgba(2,13,23,.32) | Elementos elevados |
| `--ds-focus-width` / `-offset` | 3 px / 3 px | Foco de teclado |
| `--ds-disabled-opacity` | .55 | Controles deshabilitados |
| `--ds-target-min` | 44 px | Área táctil mínima |

## Componentes unificados (en `ae-armonia.css`)

- **Pestañas**: texto 13 px/600, indicador inferior de 2 px en `--ds-action`, 44 px de alto.
  Aplica a Mensual/Histórico (portada, Takes por deporte, Chefs), LaLiga/Premier y Opiniones.
- **Botón principal dorado** («Publicar mi Take», «Mi Take»): recto, 44 px, Inter 14/600.
- **Botón secundario** («Todas las noticias», «Ver todos los Picks»): contorno `--ds-action`.
- **Controles de cabecera**: mismo marco (`--ds-chrome-control`) en los dos temas; «+» conserva el dorado.
- **Etiquetas de cuota**: misma forma (12 px/700, recta); cada sección conserva su color.
- **Estados vacíos**: Inter 13 px, `--ds-text-muted`, alineados a la izquierda.

## Pendiente (deuda conocida)

Las ~80 hojas heredadas siguen teniendo colores escritos a mano (unos 3.200 hex
distintos). La capa de armonía los cubre en los componentes visibles, pero no se
migraron uno a uno para no arriesgar cambios de aspecto. Al tocar una hoja
heredada, sustituye sus colores por tokens.
