# CAM SPORTS banner audit · 23 October 2026

The shared banner frame lives in `assets/cam-banner-system.css`, registered first
in `assets/style-sources.json`. Its named important layer precedes the legacy
rounded layer, avoiding increasingly specific overrides and accidental pill
shapes. Existing stylesheet order and the generated bundle workflow are retained.

## Presentation rules

- Standalone banners and their containing panels use a 20 px radius. Integrated
  headers meet the card edges and are clipped by the outer panel. Trending
  article buttons and their parent rows share a 14 px radius.
- Equivalent card headings share 120 px minimum height, or 104 px in narrow
  columns. Features grow with their text rather than clipping it. Container
  queries also cover narrow desktop sidebars.
- Day headings use `#073B83`, night headings `#0A3268`, with white titles and
  ivory supporting text. Day content panels retain `#F3EBDD`.
- Titles remain Playfair Display Semibold; supporting text is Libre Baskerville.
  The previously approved 13 px Picks section headings are retained.
- Artwork has a separate reserved area. Flat illustrations are fitted to their
  visible bounds, including transparent margins, and high-contrast flat canvases
  can be composited as ivory ink. Photographic or unreadable sources remain
  full-width backdrops. Original atlas cell crops are retained.

## Editor and navigation

`assets/ae-site-images.js` retains the existing saved image keys, source URLs,
theme variants and X/Y focus. No image files or database records are rewritten.
The editor still exposes one pencil per placement. NFL Takes and NFL Quiniela
have independent editable placements instead of inheriting the Rankings stadium.
Returning from a sports section to Opiniones explicitly reveals the reused
Opinadores panel, whose previous hidden state otherwise survived navigation.

## Verification

Browser inspection covered Home, Picks, NFL, Fútbol and Opiniones at 320, 390,
768 and 1280 px, across day and night. Visible banner measurements showed no
horizontal or vertical text overflow. Paired opinion and chef headers shared
their height, and Trending backgrounds were clipped to their rectangular frame.

The existing image-manager, opinion-banner, mobile-navigation, community-Picks,
Pick-history and season-prediction regression suites passed. Browser interaction
used the real application and public data; no test publications, votes or Picks
were written.
