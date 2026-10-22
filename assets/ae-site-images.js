/* CAM SPORTS · Imágenes del sitio editables por los administradores.
 *
 * Cada imagen fija del código (fondos, banners, iconos, ilustraciones) tiene una
 * clave estable en SITE_IMAGES. Si la tabla ae_site_images tiene una fila para
 * esa clave, la página usa su url y su encuadre; si no, se ve exactamente como
 * antes (la imagen del código es el valor por defecto).
 *
 * Cómo se aplica un reemplazo, sin tocar el HTML ni las hojas de estilo:
 *  - Fondos en CSS: se reescribe en sitio la declaración de cada regla que usa la
 *    imagen (CSSOM), así se respetan el orden de la cascada, los degradados, día/noche
 *    y las variables CSS.
 *  - <img>: se pone srcset con la imagen nueva; src no cambia (hay selectores como
 *    [src*="ae-sol-gold"] que dependen de él).
 *  - Recortes de un atlas (una imagen con varias escenas): estilo en línea sobre los
 *    elementos de ese recorte, conservando las demás capas del fondo.
 *
 * Administradores (tabla editors): un lápiz diminuto en la esquina de cada imagen
 * editable abre el diálogo para subir un archivo o pegar un enlace HTTPS, ajustar
 * el encuadre o restaurar la original. Escritura con ae_set_site_image y
 * ae_reset_site_image. Para el público el lápiz no existe en el DOM.
 */
(() => {
  'use strict';
  if (window.camSiteImages) return;

  const CACHE = 'cam_site_images_v1';
  const BUCKET = 'article-images';
  const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const MAX_IMAGE = 5 * 1024 * 1024; // límite del bucket (se comprueba tras optimizar)
  const MAX_ORIGINAL = 25 * 1024 * 1024; // fotos de móvil: se optimizan al subirlas
  const NIGHT = 'Noche', DAY = 'Día';

  // ---------------------------------------------------------------------------
  // Inventario. kind: 'bg' (fondo CSS) · 'img' (<img>) · 'atlas' (mosaico).
  // group + variant: misma pieza en día/noche u otras variantes (el diálogo deja
  // cambiar entre ellas).
  // ---------------------------------------------------------------------------
  const FILES = [];
  const f = (key, label, section, paths, extra) => FILES.push(Object.assign({ key, label, section, paths: [].concat(paths), kind: 'bg' }, extra || {}));
  const img = (key, label, section, paths, extra) => f(key, label, section, paths, Object.assign({ kind: 'img' }, extra));
  const pair = (base, label, section, night, day, extra) => {
    f(base + '-noche', label, section, night, Object.assign({ group: base, variant: NIGHT }, extra));
    f(base + '-dia', label, section, day, Object.assign({ group: base, variant: DAY }, extra));
  };
  const atlas = (key, label, section, path, cells, note) => f(key, label, section, path, { kind: 'atlas', cells, note });
  // Imagen incrustada en una hoja de estilos (url("data:…")): se identifica por la hoja.
  const embedded = (key, label, section, sheet, extra) => f(key, label, section, [], Object.assign({ embedded: sheet }, extra));

  // Marca y cabecera
  img('marca.logo', 'Logotipo CAM Sports', 'Cabecera, pie y bienvenida', ['assets/cam-sports-logo.webp', 'assets/cam-sports-logo.jpeg']);
  img('cabecera.tema-noche', 'Botón de tema (luna)', 'Cabecera', 'assets/icons/ae-luna-gold.webp', { group: 'cabecera.tema', variant: 'Luna' });
  img('cabecera.tema-dia', 'Botón de tema (sol)', 'Cabecera', 'assets/icons/ae-sol-gold.webp', { group: 'cabecera.tema', variant: 'Sol' });
  img('cabecera.avisos', 'Icono de avisos', 'Cabecera', 'assets/icons/ae-avisos-six-gold.webp');
  img('cabecera.perfil', 'Icono de perfil', 'Cabecera', 'assets/ui/ae-profile-mark.png');
  img('cabecera.cerrar-sesion', 'Icono de cerrar sesión', 'Cabecera', 'assets/ui/ae-logout-mark.png');
  pair('cabecera.fondo', 'Fondo de la cabecera (terraza)', 'Cabecera',
    ['assets/cam-header-terrace-night.jpg', 'assets/cam-header-terrace-night-mobile.jpg'],
    ['assets/cam-header-terrace-day.jpg', 'assets/cam-header-terrace-day-mobile.jpg']);
  pair('pie.fondo', 'Fondo del pie de página (pueblo)', 'Pie de página',
    ['assets/cam-footer-village-night.jpg', 'assets/cam-footer-village-night-mobile.jpg'],
    ['assets/cam-footer-village-day.jpg', 'assets/cam-footer-village-day-mobile.jpg']);
  // Bienvenida y acceso (cada imagen en sus tamaños: un reemplazo cambia todos)
  pair('bienvenida.fondo', 'Fondo de la bienvenida', 'Bienvenida',
    ['assets/cam-welcome-noche-oleo-960.webp', 'assets/cam-welcome-noche-oleo-1600.webp', 'assets/cam-welcome-noche.webp'],
    ['assets/cam-welcome-dia-oleo-960.webp', 'assets/cam-welcome-dia-oleo-1600.webp', 'assets/cam-welcome-dia.webp']);
  pair('acceso.fondo', 'Fondo del acceso (iniciar sesión / registrarse)', 'Acceso',
    ['assets/cam-login-background-night.webp', 'assets/cam-login-background-night-HD.webp'],
    ['assets/cam-login-background-day.webp', 'assets/cam-login-background-day-HD.webp']);
  // Navegación
  img('nav.picks', 'Icono de Picks', 'Navegación', 'assets/icons/ae-picks-gold.webp');
  img('nav.nfl', 'Icono de NFL', 'Navegación', 'assets/icons/ae-nfl-gold.webp');
  img('nav.futbol', 'Icono de Fútbol', 'Navegación', 'assets/icons/ae-futbol-gold.webp');
  img('nav.opiniones', 'Icono de Opiniones', 'Navegación', 'assets/icons/ae-opiniones-gold.webp');
  img('nav.colegial', 'Icono de Colegial', 'Navegación', 'assets/icons/ae-colegial-gold.webp');
  // Portada · Opinadores distinguidos (imágenes incrustadas en sus hojas)
  embedded('portada.opinadores-noche', 'Banner de «Opinadores distinguidos»', 'Portada', 'ae-opinadores-classical-night.css', { group: 'portada.opinadores', variant: NIGHT });
  embedded('portada.opinadores-dia', 'Banner de «Opinadores distinguidos»', 'Portada', 'ae-opinadores-classical-day.css', { group: 'portada.opinadores', variant: DAY });
  // Portada
  pair('portada.boton-lectura', 'Icono del botón de lectura', 'Portada', 'assets/icons/ae-hero-book-night.svg', 'assets/icons/ae-hero-book-day.svg');
  pair('portada.boton-picks', 'Icono del botón de Picks', 'Portada', 'assets/icons/ae-hero-picks-night.svg', 'assets/icons/ae-hero-picks-day.svg');
  f('portada.ranking-nfl', 'Fondo de la tarjeta del ranking NFL', 'Portada', 'assets/atmospheres/ae-nfl-stadium.svg');
  f('portada.ranking-champions', 'Fondo de la tarjeta del ranking Champions', 'Portada', 'assets/atmospheres/ae-football-stadium.svg');
  f('portada.comunidad-papel', 'Fondo de papel de Comunidad y Tendencias', 'Portada', 'assets/atmospheres/ae-community-editorial-paper.svg');
  f('portada.comunidad-multitud', 'Fondo de multitud de la comunidad', 'Portada', 'assets/atmospheres/ae-community-crowd.svg');
  f('portada.laurel', 'Laurel de los Takes destacados', 'Portada', 'assets/ae-community-laurel.svg');
  f('decor.pincel', 'Trazo de pincel de las cabeceras', 'Portada y Takes', 'assets/atmospheres/ae-reference-brush.svg');
  f('decor.trofeo', 'Trofeo de las cabeceras', 'Portada y Fútbol', 'assets/atmospheres/ae-reference-trophy.svg');
  atlas('portada.banners-comunidad', 'Mosaico de banners de la comunidad', 'Portada', 'assets/ae-community-banner-atlas.webp', [2, 4],
    'Mosaico de 2 columnas (noche, día) × 4 filas (Populares, Impopulares, Top Takes, Top Takes cuestionados). Cada banner también se puede cambiar por separado con su propio lápiz.');
  atlas('portada.lectores-atlas', 'Mosaico de la cabecera de lectores', 'Portada', 'assets/ae-readers-community-atlas.webp', [1, 2],
    'Dos escenas apiladas; la página muestra la de arriba.');
  f('takes.banner-comunidad', 'Banner de la comunidad de Takes', 'Takes', 'assets/ae-takes-community-banner.webp');
  pair('portada.take-escena', 'Escena del botón «Publicar Take» de la portada', 'Portada', 'assets/cam-take-scene-dark.webp', 'assets/cam-take-scene-light.webp');
  pair('portada.take-tinta', 'Tintero del botón «Publicar Take» de la portada', 'Portada', 'assets/cam-take-ink-dark.webp', 'assets/cam-take-ink-light.webp');
  f('takes.pluma', 'Pluma del título de Takes', 'Takes', 'assets/ae-feather.svg');
  // Fútbol
  pair('futbol.takes-cabecera', 'Cabecera de Takes de Fútbol (también en el perfil)', 'Fútbol', 'assets/takes/ae-football-takes-hero-night.webp', 'assets/takes/ae-football-takes-hero-day.webp');
  pair('futbol.take-barca', 'Tarjetas de Take · Barça', 'Fútbol', 'assets/takes/ae-football-take-barca-night.webp', 'assets/takes/ae-football-take-barca-day.webp');
  pair('futbol.take-champions', 'Tarjetas de Take · Champions', 'Fútbol', 'assets/takes/ae-football-take-champions-night.webp', 'assets/takes/ae-football-take-champions-day.webp');
  pair('futbol.take-laliga', 'Tarjetas de Take · LaLiga', 'Fútbol', 'assets/takes/ae-football-take-laliga-night.webp', 'assets/takes/ae-football-take-laliga-day.webp');
  pair('futbol.take-premier', 'Tarjetas de Take · Premier', 'Fútbol', 'assets/takes/ae-football-take-premier-night.webp', 'assets/takes/ae-football-take-premier-day.webp');
  f('futbol.populares', 'Fondo de «Populares»', 'Fútbol', 'assets/rankings/ae-football-popular-antagonist-20261020.webp');
  f('futbol.impopulares', 'Fondo de «Impopulares»', 'Fútbol', 'assets/rankings/ae-football-impopular-antagonist-20261020.webp');
  f('futbol.respira', 'Fondo de «Respira Fútbol»', 'Fútbol', 'assets/rankings/ae-football-respira-antagonist-20261020.webp');
  f('futbol.vende-humos', 'Fondo de «Vende Humos»', 'Fútbol', 'assets/rankings/ae-football-humos-antagonist-20261020.webp');
  f('futbol.respira-anterior', 'Fondo de «Respira Fútbol» (versión anterior)', 'Fútbol', 'assets/atmospheres/ae-respira-futbol-reference.webp');
  f('futbol.vende-humos-anterior', 'Fondo de «Vende Humos» (versión anterior)', 'Fútbol', 'assets/atmospheres/ae-vende-humos-reference.webp');
  pair('futbol.debate-calma', 'Cabecera de debate (tono tranquilo)', 'Fútbol', 'assets/atmospheres/ae-football-debate-calm-dark.svg', 'assets/atmospheres/ae-football-debate-calm-day.svg');
  pair('futbol.debate-fuego', 'Cabecera de debate (tono encendido)', 'Fútbol', 'assets/atmospheres/ae-football-debate-fire-dark.svg', 'assets/atmospheres/ae-football-debate-fire-day.svg');
  f('futbol.ranking-claro', 'Fondo claro del ranking de Fútbol', 'Fútbol', 'assets/atmospheres/ae-football-ranking-light.svg');
  pair('futbol.estadio-champions', 'Estadio Champions (noticias y rankings)', 'Fútbol', 'assets/rankings/ae-champions-stadium-night.webp', 'assets/rankings/ae-champions-stadium-day.webp');
  f('futbol.ambiente-champions', 'Ambiente Champions (tarjetas y cabeceras)', 'Fútbol y Portada', 'assets/rankings/champions-atmosphere.webp');
  // NFL
  pair('nfl.estadio', 'Estadio NFL (noticias y rankings)', 'NFL', 'assets/rankings/ae-nfl-stadium-night.webp', 'assets/rankings/ae-nfl-stadium-day.webp');
  f('nfl.ambiente', 'Ambiente NFL (tarjetas y cabeceras)', 'NFL y Portada', 'assets/rankings/nfl-atmosphere.webp');
  f('nfl.ranking-claro', 'Fondo claro del ranking NFL', 'NFL', 'assets/atmospheres/ae-nfl-ranking-light.svg');
  f('nfl.savant', 'Fondo de «Savant»', 'NFL', 'assets/rankings/ae-nfl-savant-20261019.webp');
  f('nfl.rookie', 'Fondo de «Rookie»', 'NFL', 'assets/rankings/ae-nfl-rookie-20261019.webp');
  f('nfl.savant-anterior', 'Fondo de «Savant» (versión anterior)', 'NFL', 'assets/atmospheres/ae-nfl-savant-reference.webp');
  f('nfl.rookie-anterior', 'Fondo de «Rookie» (versión anterior)', 'NFL', 'assets/atmospheres/ae-nfl-rookie-reference.webp');
  atlas('rankings.gemelos-atlas', 'Mosaico de los rankings gemelos', 'NFL y Fútbol', 'assets/rankings/ae-classical-twin-ranking-atlas.webp', [2, 4],
    'Mosaico antiguo de 2 × 4 recortes; casi todas las vistas usan ya los fondos independientes.');
  // Picks
  atlas('picks.chef-mano-atlas', 'Mosaico de la mano del chef', 'Picks', 'assets/ae-picks-chef-hand-atlas.webp', [1, 2], 'Dos escenas apiladas: arriba noche, abajo día.');
  atlas('picks.mesa-comunidad-atlas', 'Mosaico de la mesa de la comunidad', 'Picks', 'assets/ae-picks-community-table-atlas.webp', [1, 2], 'Dos escenas apiladas: arriba noche, abajo día.');
  atlas('picks.mejor-plato-atlas', 'Mosaico del mejor plato', 'Picks', 'assets/ae-picks-best-plate-atlas.webp', [1, 2], 'Dos escenas apiladas: arriba noche, abajo día.');
  atlas('picks.peor-plato-atlas', 'Mosaico del peor plato', 'Picks', 'assets/ae-picks-worst-plate-atlas.webp', [1, 2], 'Dos escenas apiladas: arriba noche, abajo día.');
  atlas('picks.archivo-noticias-atlas', 'Mosaico del archivo de noticias', 'Picks', 'assets/ae-picks-news-archive-atlas.webp', [1, 2], 'Dos escenas apiladas: arriba noche, abajo día.');
  atlas('picks.chefs-mejores-atlas', 'Mosaico de la cabecera de mejores chefs', 'Picks', 'assets/ae-chefs-best-header-atlas.webp', [1, 2], 'Dos escenas apiladas: arriba noche, abajo día.');
  atlas('picks.chefs-peores-atlas', 'Mosaico de la cabecera de peores chefs', 'Picks', 'assets/ae-chefs-worst-header-atlas.webp', [1, 2], 'Dos escenas apiladas: arriba noche, abajo día.');
  f('picks.mejores-platos', 'Escena de los mejores platos', 'Picks', 'assets/ae-best-plates-scene.webp');
  f('picks.peores-platos', 'Escena de los peores platos', 'Picks', 'assets/ae-worst-plates-scene.webp');
  pair('picks.marmol', 'Fondo de mármol de «Eres Chef»', 'Picks', 'assets/ae-chef-marble-night.webp', 'assets/ae-chef-marble-day.webp');
  f('picks.publicar', 'Ilustración del diálogo para publicar un Pick', 'Picks', 'assets/ae-pick-compose-hand-leaf.webp');
  // Noticias: foto por defecto de las noticias sin imagen
  const UNSPLASH = 'https://images.unsplash.com/';
  img('noticias.respaldo-futbol', 'Foto por defecto · Fútbol', 'Noticias sin foto', UNSPLASH + 'photo-1508098682722-e99c43a406b2', { group: 'noticias.respaldo', variant: 'Fútbol' });
  img('noticias.respaldo-nfl', 'Foto por defecto · NFL', 'Noticias sin foto', UNSPLASH + 'photo-1587280501635-68a0e82cd5ff', { group: 'noticias.respaldo', variant: 'NFL' });
  img('noticias.respaldo-colegial', 'Foto por defecto · Colegial', 'Noticias sin foto', UNSPLASH + 'photo-1566577739112-5180d4bf9390', { group: 'noticias.respaldo', variant: 'Colegial' });
  img('noticias.respaldo-basquetbol', 'Foto por defecto · Básquetbol', 'Noticias sin foto', UNSPLASH + 'photo-1546519638-68e109498ffc', { group: 'noticias.respaldo', variant: 'Básquetbol' });
  img('noticias.respaldo-tenis', 'Foto por defecto · Tenis', 'Noticias sin foto', UNSPLASH + 'photo-1622279457486-62dcc4a431d6', { group: 'noticias.respaldo', variant: 'Tenis' });
  img('noticias.respaldo-ciclismo', 'Foto por defecto · Ciclismo', 'Noticias sin foto', UNSPLASH + 'photo-1541625602330-2277a4c46182', { group: 'noticias.respaldo', variant: 'Ciclismo' });

  // Recortes de atlas que se pueden cambiar por separado. atlas = clave del mosaico,
  // theme = 'dark' | 'light' | null, selector = dónde aparece, crop = recorte original.
  const SLOTS = [];
  const slot = (key, label, section, atlasKey, theme, selector, crop, group, variant) =>
    SLOTS.push({ key, label, section, atlas: atlasKey, theme, selector, crop, group, variant, kind: 'slot' });
  const slotPair = (base, label, section, atlasKey, selector, night, day) => {
    slot(base + '-noche', label, section, atlasKey, 'dark', selector, night, base, NIGHT);
    slot(base + '-dia', label, section, atlasKey, 'light', selector, day, base, DAY);
  };
  const banner = (row) => [{ size: '200% 400%', pos: '0% ' + row, cell: [0, 0] }, { size: '200% 400%', pos: '100% ' + row, cell: [1, 0] }];
  const rows4 = ['0%', '33.333333%', '66.666667%', '100%'];
  [['portada.populares', 'Banner de «Populares»', '#aeHomeTakesPopular .ae-vote-column-heading'],
   ['portada.impopulares', 'Banner de «Impopulares»', '#aeHomeTakesUnpopular .ae-vote-column-heading'],
   ['portada.top-takes', 'Banner de «Top Takes»', '#aeHomeTopTakes .ae-top-takes-card:not(.is-questioned) .ae-top-takes-card-head'],
   ['portada.top-takes-cuestionados', 'Banner de Top Takes cuestionados', '#aeHomeTopTakes .ae-top-takes-card.is-questioned .ae-top-takes-card-head']
  ].forEach(([key, label, sel], i) => { const [n, d] = banner(rows4[i]); slotPair(key, label, 'Portada · Comunidad', 'portada.banners-comunidad', sel, n, d); });
  slot('portada.lectores', 'Cabecera de lectores (Tendencias)', 'Portada', 'portada.lectores-atlas', null, '#aeTrendingPortada > .ae-section-heading', { size: '100% 200%', pos: 'center top' });
  const stacked = { night: { size: 'auto 200%', pos: 'right top' }, day: { size: 'auto 200%', pos: 'right bottom' } };
  slotPair('picks.chef-mano', 'Mano del chef (invitación, ranking de chefs y detalle del Pick)', 'Picks', 'picks.chef-mano-atlas',
    '.ae-picks-heading-cta-row, #picksRankingTitle, #cpDialog .ae-cp-detail-hero', stacked.night, stacked.day);
  slotPair('picks.mesa-comunidad', 'Mesa de la comunidad', 'Picks', 'picks.mesa-comunidad-atlas', '#cpTitle', stacked.night, stacked.day);
  slotPair('picks.mejor-plato', 'Mejor plato', 'Picks', 'picks.mejor-plato-atlas', '.ae-chef-best, .ae-chef-best .ae-picks-rail-heading', stacked.night, stacked.day);
  slotPair('picks.peor-plato', 'Peor plato', 'Picks', 'picks.peor-plato-atlas', '.ae-chef-worst, .ae-chef-worst .ae-picks-rail-heading, #cpWorstRankingTitle', stacked.night, stacked.day);
  slotPair('picks.archivo-noticias', 'Archivo de noticias de Picks', 'Picks', 'picks.archivo-noticias-atlas', '#picksNews .ae-picks-news-heading', stacked.night, stacked.day);
  slotPair('picks.chefs-mejores', 'Cabecera de mejores chefs', 'Picks', 'picks.chefs-mejores-atlas', '.ae-chefs-art-heading', stacked.night, stacked.day);
  slotPair('picks.chefs-peores', 'Cabecera de peores chefs', 'Picks', 'picks.chefs-peores-atlas', '.ae-chefs-art-heading', stacked.night, stacked.day);

  const ENTRIES = new Map([...FILES, ...SLOTS].map(e => [e.key, e]));
  const byBasename = new Map();
  for (const e of FILES) for (const p of e.paths) {
    const b = p.split('/').pop().toLowerCase();
    if (!byBasename.has(b)) byBasename.set(b, []);
    byBasename.get(b).push({ entry: e, path: p });
  }

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const client = () => { try { return typeof db !== 'undefined' ? db : window.db; } catch { return window.db; } };
  const isAdmin = () => { try { return typeof currentAdmin !== 'undefined' && Boolean(currentAdmin); } catch { return false; } };
  const editModeOn = () => isAdmin() && window.camGlobalEditMode?.isActive() === true;
  const safeUrl = url => (typeof url === 'string' && /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?\/\S*$/.test(url) && url.length <= 2048) ? url : '';
  const cssUrl = url => 'url("' + String(url).replace(/["\\\n]/g, encodeURIComponent) + '")';
  const isDark = () => document.documentElement.classList.contains('dark');
  const OWN = 'cam-site-image-layer';
  const own = n => n && n.nodeType === 1 && (n.localName === OWN || n.id === 'camSiteImageDialog' || n.closest?.(OWN + ',#camSiteImageDialog'));

  function toURL(raw, base) {
    if (!raw || /^(data|blob):/i.test(raw)) return null;
    try { return new URL(raw, base || document.baseURI); } catch { return null; }
  }
  function sameAsset(u, path) {
    if (/^https?:/i.test(path)) { const p = toURL(path); return p && u.host === p.host && u.pathname === p.pathname; }
    return u.pathname === '/' + path || u.pathname.endsWith('/' + path);
  }
  // Clave de archivo para una URL (original del código), o null.
  const embeddedBySheet = new Map(FILES.filter(e => e.embedded).map(e => [e.embedded.toLowerCase(), e.key]));
  const dataKey = new Map(), dataByKey = new Map();
  function embeddedKeyFor(raw, base) {
    if (dataKey.has(raw)) return dataKey.get(raw);
    if (!base) return null;
    let sheet; try { sheet = new URL(base).pathname.split('/').pop().toLowerCase(); } catch { return null; }
    const key = embeddedBySheet.get(sheet);
    if (key && !dataByKey.has(key)) { dataKey.set(raw, key); dataByKey.set(key, raw); }
    return key && dataByKey.get(key) === raw ? key : null;
  }
  const keyMemo = new Map();
  function fileKeyFor(raw, base) {
    if (typeof raw === 'string' && raw.startsWith('data:')) return embeddedKeyFor(raw, base);
    const memo = (base || '') + '\u0000' + raw;
    if (keyMemo.has(memo)) return keyMemo.get(memo);
    const key = resolveKey(raw, base);
    if (keyMemo.size < 5000) keyMemo.set(memo, key);
    return key;
  }
  function resolveKey(raw, base) {
    const u = toURL(raw, base); if (!u) return null;
    const list = byBasename.get(decodeURIComponent(u.pathname.split('/').pop() || '').toLowerCase());
    if (!list) return null;
    for (const { entry, path } of list) if (sameAsset(u, path)) return entry.key;
    return null;
  }
  function splitLayers(value) {
    const out = []; let depth = 0, cur = '';
    for (const ch of String(value || '')) {
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  const URL_RE = /url\(\s*(['"]?)(.*?)\1\s*\)/g;
  const urlsIn = v => { const out = []; String(v).replace(URL_RE, (m, q, u) => { out.push(u); return m; }); return out; };

  // ---------------------------------------------------------------------------
  // Estado: filas de la base (clave → { url, focus_x, focus_y, alt })
  // ---------------------------------------------------------------------------
  let rows = new Map();
  let tableReady = null; // null: sin consultar · true/false
  function readCache() {
    try { const raw = localStorage.getItem(CACHE); if (raw) rows = toRows(JSON.parse(raw)); } catch {}
  }
  function writeCache() {
    try {
      if (rows.size) localStorage.setItem(CACHE, JSON.stringify([...rows.entries()].map(([key, r]) => Object.assign({ key }, r))));
      else localStorage.removeItem(CACHE);
    } catch {}
  }
  function toRows(list) {
    const m = new Map();
    for (const r of Array.isArray(list) ? list : []) {
      if (!r || (!ENTRIES.has(r.key) && !/^size\.[a-z0-9._-]+$/.test(r.key))) continue;
      const url = safeUrl(r.url) || null;
      const fx = Number.isInteger(r.focus_x) ? r.focus_x : null, fy = Number.isInteger(r.focus_y) ? r.focus_y : null;
      if (!url && fx == null && !r.alt && !r.visual) continue;
      m.set(r.key, { url, focus_x: fx, focus_y: fy, alt: typeof r.alt === 'string' ? r.alt : null, visual: r.visual && typeof r.visual === 'object' ? r.visual : null });
    }
    return m;
  }
  const focusOf = r => (r && r.focus_x != null && r.focus_y != null) ? r.focus_x + '% ' + r.focus_y + '%' : '';

  // ---------------------------------------------------------------------------
  // Fondos en CSS: declaraciones que usan imágenes del inventario
  // ---------------------------------------------------------------------------
  const decls = [];
  const walked = new WeakSet();
  const needsCss = () => rows.size > 0 || admin.on;
  function walkSheets() {
    for (const sheet of document.styleSheets) {
      if (walked.has(sheet)) continue;
      let list; try { list = sheet.cssRules; } catch { continue; } // hojas de otros dominios
      if (!list || !list.length) continue;
      walked.add(sheet);
      walkRules(list, sheet.href || document.baseURI);
    }
  }
  function walkRules(list, base) {
    for (const rule of list) {
      if (rule.cssRules && !rule.style) { walkRules(rule.cssRules, base); continue; }
      const st = rule.style; if (!st) continue;
      for (let i = 0; i < st.length; i++) {
        const name = st[i];
        if (name !== 'background-image' && !name.startsWith('--') && !name.endsWith('mask-image')) continue;
        const value = st.getPropertyValue(name);
        if (!value || !value.includes('url(')) continue;
        const keys = new Set();
        for (const u of urlsIn(value)) { const k = fileKeyFor(u, base); if (k) keys.add(k); }
        if (!keys.size) continue;
        decls.push({
          st, name, base, keys, original: value, priority: st.getPropertyPriority(name),
          pos: name === 'background-image' ? st.getPropertyValue('background-position') : '',
          posPriority: name === 'background-image' ? st.getPropertyPriority('background-position') : '',
          bgSize: name === 'background-image' ? st.getPropertyValue('background-size') : '',
          bgSizePriority: name === 'background-image' ? st.getPropertyPriority('background-size') : '',
          selector: rule.selectorText || ''
        });
      }
      if (rule.cssRules) walkRules(rule.cssRules, base);
    }
  }
  function applyDecls() {
    for (const d of decls) {
      let focusLayer = -1, focus = '', frameLayer = -1, frame = null;
      const layers = splitLayers(d.original).map((layer, idx) => layer.replace(URL_RE, (m, q, u) => {
        const key = fileKeyFor(u, d.base); const r = key && rows.get(key);
        const entry = key && ENTRIES.get(key);
        if (r && focusOf(r) && entry.kind !== 'atlas') { focusLayer = idx; focus = focusOf(r); }
        if (r?.visual && entry?.kind !== 'atlas') { frameLayer = idx; frame = window.camImageVisual?.bg(window.camImageVisual.settings(r.visual)) || null; if (frame) { focusLayer = idx; focus = frame.pos; } }
        return r && r.url ? cssUrl(r.url) : m;
      }));
      const changed = layers.some((l, i) => l !== splitLayers(d.original)[i]);
      const target = changed ? layers.join(', ') : d.original;
      if (d.st.getPropertyValue(d.name) !== target) d.st.setProperty(d.name, target, d.priority);
      if (d.name !== 'background-image') continue;
      let pos = d.pos;
      if (focusLayer >= 0) {
        const list = splitLayers(d.pos);
        if (!d.pos && layers.length === 1) pos = focus;
        else if (list.length === layers.length) { list[focusLayer] = focus; pos = list.join(', '); }
      }
      if (frame && frameLayer >= 0) {
        const original = splitLayers(d.bgSize);
        const sizes = Array.from({length:layers.length}, (_, i) => original[i] || original[original.length-1] || 'auto');
        if (frame.size) sizes[frameLayer] = frame.size;
        const desired = frame.size ? sizes.join(', ') : d.bgSize;
        if (d.st.getPropertyValue('background-size') !== desired) d.st.setProperty('background-size',desired,d.bgSizePriority||d.priority);
      } else if (d.st.getPropertyValue('background-size') !== d.bgSize) {
        if (d.bgSize) d.st.setProperty('background-size', d.bgSize, d.bgSizePriority || d.priority);
        else d.st.removeProperty('background-size');
      }
      const curPos = d.st.getPropertyValue('background-position');
      if (curPos !== pos) {
        if (pos) d.st.setProperty('background-position', pos, d.posPriority || d.priority);
        else d.st.removeProperty('background-position');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // <img>: srcset con la imagen nueva (src no cambia)
  // ---------------------------------------------------------------------------
  function applyImg(node) {
    const key = fileKeyFor(node.getAttribute('src'));
    const r = key ? rows.get(key) : null;
    const ds = node.dataset;
    if (key) { if (ds.siteImage !== key) ds.siteImage = key; } else if (ds.siteImage) delete ds.siteImage;
    // Imagen
    if (r && r.url) {
      const set = r.url.replace(/ /g, '%20').replace(/,/g, '%2C');
      if (node.getAttribute('srcset') !== set) node.setAttribute('srcset', set);
      ds.siteImageSrc = '1';
    } else if (ds.siteImageSrc) { node.removeAttribute('srcset'); delete ds.siteImageSrc; }
    // Encuadre
    const focus = focusOf(r);
    if (focus) { node.style.setProperty('object-position', focus); ds.siteImageFocus = '1'; }
    else if (ds.siteImageFocus) { node.style.removeProperty('object-position'); delete ds.siteImageFocus; }
    const virtual = window.camVisualSizes?.identify?.(node);
    window.camImageVisual?.img(node, r || (virtual && rows.get('size.' + virtual.key)) || null);
    // Texto alternativo (solo imágenes con significado)
    if (r && r.alt && node.getAttribute('aria-hidden') !== 'true') {
      if (ds.siteImageAlt == null) ds.siteImageAlt = node.getAttribute('alt') ?? '';
      if (node.alt !== r.alt) node.alt = r.alt;
    } else if (ds.siteImageAlt != null) { node.alt = ds.siteImageAlt; delete ds.siteImageAlt; }
  }
  function applyImgs(root) {
    if (!root || root.nodeType !== 1 || own(root)) return;
    if (root.localName === 'img') applyImg(root);
    for (const n of root.querySelectorAll?.('img') || []) applyImg(n);
  }

  // ---------------------------------------------------------------------------
  // Recortes de atlas: estilo en línea sobre los elementos del recorte
  // ---------------------------------------------------------------------------
  const SLOT_PROPS = ['background-image', 'background-size', 'background-position', 'background-repeat'];
  const slotted = new Set();
  function atlasAbs(slotEntry) { return toURL(ENTRIES.get(slotEntry.atlas).paths[0]).href; }
  function clearSlot(el) {
    for (const p of SLOT_PROPS) el.style.removeProperty(p);
    delete el.dataset.siteImageSlot; slotted.delete(el);
  }
  function layerIndexOf(el, atlasKey) {
    const layers = splitLayers(getComputedStyle(el).backgroundImage);
    for (let i = 0; i < layers.length; i++) for (const u of urlsIn(layers[i])) if (fileKeyFor(u) === atlasKey) return { i, layers };
    return null;
  }
  function expand(list, n) { const out = []; for (let i = 0; i < n; i++) out.push(list[i % list.length] || 'auto'); return out; }
  function applySlots() {
    const active = SLOTS.filter(s => rows.get(s.key)?.url);
    const keep = new Set();
    if (active.length) {
      const dark = isDark();
      for (const s of active) {
        if (s.theme && (s.theme === 'dark') !== dark) continue;
        let els; try { els = document.querySelectorAll(s.selector); } catch { continue; }
        for (const el of els) {
          if (keep.has(el)) continue;
          if (el.dataset.siteImageSlot) clearSlot(el);
          const hit = layerIndexOf(el, s.atlas); if (!hit) continue;
          const r = rows.get(s.key), cs = getComputedStyle(el), n = hit.layers.length;
          const imgs = hit.layers.slice(); imgs[hit.i] = cssUrl(r.url);
          const styleFrame = r.visual && window.camImageVisual?.bg(window.camImageVisual.settings(r.visual));
          const size = expand(splitLayers(cs.backgroundSize), n); size[hit.i] = styleFrame?.size || 'cover';
          const pos = expand(splitLayers(cs.backgroundPosition), n); pos[hit.i] = styleFrame?.pos || focusOf(r) || '50% 50%';
          const rep = expand(splitLayers(cs.backgroundRepeat), n); rep[hit.i] = 'no-repeat';
          el.style.setProperty('background-image', imgs.join(', '), 'important');
          el.style.setProperty('background-size', size.join(', '), 'important');
          el.style.setProperty('background-position', pos.join(', '), 'important');
          el.style.setProperty('background-repeat', rep.join(', '), 'important');
          el.dataset.siteImageSlot = s.key; slotted.add(el); keep.add(el);
        }
      }
    }
    for (const el of [...slotted]) if (!keep.has(el)) clearSlot(el);
  }

  function applyAll() {
    if (needsCss()) { try { walkSheets(); } catch {} }
    applyDecls();
    applyImgs(document.documentElement);
    window.camVisualSizes?.mark?.(document.documentElement);
    if (document.body) applySlots();
  }

  // ---------------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------------
  async function load() {
    const sb = client(); if (!sb?.from) return;
    try {
      const r = await sb.from('ae_site_images').select('key,url,focus_x,focus_y,alt,visual');
      if (r.error) { tableReady = false; return; }
      tableReady = true;
      rows = toRows(r.data);
      writeCache();
      applyAll();
      if (admin.on) scheduleScan();
    } catch { tableReady = false; }
  }

  // ---------------------------------------------------------------------------
  // Observación del DOM (imágenes que se pintan después, día/noche, secciones)
  // ---------------------------------------------------------------------------
  let slotTimer = 0;
  function onMutations(list) {
    let layout = false;
    for (const m of list) {
      if (own(m.target)) continue;
      if (m.type === 'childList') {
        for (const n of m.addedNodes) if (n.nodeType === 1 && !own(n)) { applyImgs(n); layout = true; if (n.localName === 'style' || n.localName === 'link') sheetsChanged(); }
        for (const n of m.removedNodes) if (n.nodeType === 1 && !own(n)) layout = true;
      } else if (m.attributeName === 'src' && m.target.localName === 'img') { applyImg(m.target); layout = true; }
      else layout = true;
    }
    if (!layout) return;
    if (SLOTS.some(s => rows.get(s.key)?.url) || slotted.size) { clearTimeout(slotTimer); slotTimer = setTimeout(applySlots, 120); }
    if (admin.on) scheduleScan();
  }
  function sheetsChanged() {
    setTimeout(() => {
      if (!needsCss()) return;
      const before = decls.length; try { walkSheets(); } catch {}
      if (decls.length !== before) applyDecls();
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Administradores: lápices
  // ---------------------------------------------------------------------------
  const admin = { on: false, layers: new Map(), pencils: new Map(), scanTimer: 0, raf: 0, tick: 0 };
  const PENCIL = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M11.1 1.9a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3l-8 8-3.3.8.8-3.3 7.5-8.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.6 3.4l3 3" stroke="currentColor" stroke-width="1.6"/></svg>';

  function layerFor(el) {
    const dlg = el.closest('dialog');
    const host = dlg && dlg.open ? dlg : document.body;
    let layer = admin.layers.get(host);
    if (!layer || !layer.isConnected) {
      layer = document.createElement(OWN);
      layer.setAttribute('aria-label', 'Editar imágenes');
      host.appendChild(layer);
      admin.layers.set(host, layer);
    }
    return layer;
  }
  // Selectores que pueden pintar una imagen del inventario, agrupados por pseudo-elemento.
  let scanPlan = null, scanPlanSize = -1;
  function selectorsForScan() {
    if (scanPlan && scanPlanSize === decls.length) return scanPlan;
    const plan = new Map([['', new Set()], ['::before', new Set()], ['::after', new Set()]]);
    for (const d of decls) {
      for (const part of splitLayers(d.selector)) {
        const pseudo = /::?before\b/.test(part) ? '::before' : /::?after\b/.test(part) ? '::after' : '';
        const s = part.replace(/::?(before|after|backdrop|placeholder|marker|selection|first-line|first-letter)\b/g, '')
          .replace(/:(hover|focus|focus-visible|focus-within|active|visited)\b/g, '').trim();
        if (s) plan.get(pseudo).add(s);
      }
    }
    for (const s of SLOTS) for (const part of splitLayers(s.selector)) plan.get('').add(part);
    scanPlanSize = decls.length;
    return (scanPlan = plan);
  }
  function queryAll(selectors) {
    const list = [...selectors];
    try { return document.querySelectorAll(list.join(',')); }
    catch {
      const out = new Set();
      for (const s of list) { try { for (const n of document.querySelectorAll(s)) out.add(n); } catch {} }
      return out;
    }
  }
  function keysOnElement(el, pseudos) {
    const found = [];
    for (const pseudo of pseudos) {
      const cs = getComputedStyle(el, pseudo || null);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal' || cs.display === 'none')) continue;
      const bg = cs.backgroundImage;
      if (!bg || bg === 'none' || !bg.includes('url(')) continue;
      for (const u of urlsIn(bg)) {
        let key = overrideKeyFor(u, el) || fileKeyFor(u);
        if (!key) continue;
        if (ENTRIES.get(key).kind === 'atlas') key = slotFor(el, key) || key;
        if (!found.includes(key)) found.push(key);
      }
    }
    return found;
  }
  function overrideKeyFor(u, el) {
    const abs = toURL(u)?.href; if (!abs) return null;
    if (el.dataset.siteImageSlot && rows.get(el.dataset.siteImageSlot)?.url && toURL(rows.get(el.dataset.siteImageSlot).url)?.href === abs) return el.dataset.siteImageSlot;
    for (const [key, r] of rows) if (r.url && ENTRIES.get(key).kind !== 'slot' && toURL(r.url)?.href === abs) return key;
    return null;
  }
  function slotFor(el, atlasKey) {
    const dark = isDark();
    for (const s of SLOTS) {
      if (s.atlas !== atlasKey || (s.theme && (s.theme === 'dark') !== dark)) continue;
      try { if (el.matches(s.selector)) return s.key; } catch {}
    }
    return null;
  }
  function scheduleScan() {
    clearTimeout(admin.scanTimer);
    admin.scanTimer = setTimeout(scan, 350);
  }
  function scan() {
    if (!admin.on) return;
    try { walkSheets(); } catch {}
    const targets = new Map();
    const add = (el, key) => { if (!targets.has(el)) targets.set(el, []); const l = targets.get(el); if (!l.includes(key)) l.push(key); };
    const wanted = new Map(); // elemento → pseudo-elementos a mirar
    for (const [pseudo, sels] of selectorsForScan()) {
      if (!sels.size) continue;
      for (const el of queryAll(sels)) {
        if (!wanted.has(el)) wanted.set(el, new Set());
        wanted.get(el).add(pseudo);
      }
    }
    for (const [el, pseudos] of wanted) {
      if (own(el) || !el.getClientRects().length) continue;
      for (const k of keysOnElement(el, pseudos)) add(el, k);
    }
    for (const n of document.querySelectorAll('img[data-site-image]')) if (!own(n)) add(n, n.dataset.siteImage);
    // Escudos de rankings y logos ajenos al inventario: mismo sistema de lápices.
    for (const item of window.camVisualSizes?.allTargets?.() || []) {
      if (own(item.el) || !item.el.getClientRects().length || ENTRIES.has(item.el.dataset.siteImage)) continue;
      const virtualKey = 'size.' + item.key;
      if (!ENTRIES.has(virtualKey)) ENTRIES.set(virtualKey,
        { key: virtualKey, label: item.label, section: 'Tamaño de logos', kind: 'size-only', paths: [] });
      add(item.el, virtualKey);
    }
    // Lápices nuevos y retirados
    const live = new Set();
    for (const [el, keys] of targets) keys.forEach((key, i) => {
      const id = key + '\u0000' + i;
      let rec = [...(admin.pencils.get(el) || [])].find(p => p.id === id);
      if (!rec) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'cam-site-image-pencil';
        b.innerHTML = PENCIL;
        const e = ENTRIES.get(key);
        b.setAttribute('aria-label', 'Editar imagen: ' + e.label);
        b.title = 'Editar imagen · ' + key;
        b.dataset.key = key;
        for (const ev of ['pointerdown', 'mousedown', 'touchstart']) b.addEventListener(ev, x => x.stopPropagation(), { passive: true });
        b.addEventListener('click', x => { x.preventDefault(); x.stopPropagation(); openEditor(key, el); });
        rec = { id, key, el, button: b, index: i, layer: null };
        if (!admin.pencils.has(el)) admin.pencils.set(el, []);
        admin.pencils.get(el).push(rec);
      }
      const layer = layerFor(el);
      if (rec.button.parentNode !== layer) layer.appendChild(rec.button);
      rec.layer = layer;
      rec.clips = clipAncestors(el, layer);
      live.add(rec);
    });
    for (const [el, recs] of admin.pencils) {
      const left = recs.filter(r => { if (live.has(r)) return true; r.button.remove(); return false; });
      if (left.length) admin.pencils.set(el, left); else admin.pencils.delete(el);
    }
    for (const [host, layer] of admin.layers) if (!layer.childElementCount || (host.localName === 'dialog' && !host.open)) { layer.remove(); admin.layers.delete(host); }
    reposition();
  }
  function clipAncestors(el, layer) {
    const out = [];
    const stop = layer.parentNode;
    for (let p = el.parentElement; p && p !== stop && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') out.push(p);
    }
    return out;
  }
  function reposition() {
    admin.raf = 0;
    if (!admin.on) return;
    const origin = new Map();
    for (const recs of admin.pencils.values()) for (const rec of recs) {
      const { el, button, layer } = rec;
      let r = el.getBoundingClientRect();
      let vis = r.width >= 10 && r.height >= 10 && el.isConnected;
      if (vis && el.checkVisibility) vis = el.checkVisibility({ visibilityProperty: true });
      let top = r.top, right = r.right, bottom = r.bottom, leftX = r.left;
      if (vis) for (const c of rec.clips) {
        const cr = c.getBoundingClientRect();
        top = Math.max(top, cr.top); bottom = Math.min(bottom, cr.bottom); leftX = Math.max(leftX, cr.left); right = Math.min(right, cr.right);
      }
      if (vis && (bottom - top < 10 || right - leftX < 10 || bottom < 0 || top > innerHeight || right < 0 || leftX > innerWidth)) vis = false;
      if (!vis) { if (!button.hidden) button.hidden = true; continue; }
      if (!origin.has(layer)) { const lr = layer.getBoundingClientRect(); origin.set(layer, [lr.left, lr.top]); }
      const [ox, oy] = origin.get(layer);
      const mini = Math.min(r.width, r.height) < 48;
      button.classList.toggle('is-mini', mini);
      const size = mini ? 14 : 18, gap = mini ? 1 : 4;
      const x = right - size - gap - rec.index * (size + 3) - ox;
      const y = top + gap - oy;
      button.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      if (button.hidden) button.hidden = false;
    }
  }
  const requestReposition = () => { if (admin.on && !admin.raf) admin.raf = requestAnimationFrame(reposition); };

  function enableAdmin() {
    if (admin.on) return;
    admin.on = true;
    document.documentElement.classList.add('cam-site-images-admin');
    addEventListener('scroll', requestReposition, { capture: true, passive: true });
    addEventListener('resize', requestReposition, { passive: true });
    admin.tick = setInterval(requestReposition, 1200);
    scan();
  }
  function disableAdmin() {
    if (!admin.on) return;
    admin.on = false;
    document.documentElement.classList.remove('cam-site-images-admin');
    removeEventListener('scroll', requestReposition, { capture: true });
    removeEventListener('resize', requestReposition);
    clearInterval(admin.tick); clearTimeout(admin.scanTimer);
    for (const layer of admin.layers.values()) layer.remove();
    admin.layers.clear(); admin.pencils.clear();
    const d = document.getElementById('camSiteImageDialog'); if (d?.open) d.close();
  }
  function refresh() { if (editModeOn()) enableAdmin(); else disableAdmin(); }

  // ---------------------------------------------------------------------------
  // Diálogo de edición
  // ---------------------------------------------------------------------------
  const ui = {};
  let editing = null; // { key, aspect, contain, decorative }
  let sizing = null; // { key, device, theme, max }
  function buildDialog() {
    if (ui.dialog) return ui.dialog;
    const d = document.createElement('dialog');
    d.id = 'camSiteImageDialog';
    d.className = 'ae-opinion-dialog ae-opinion-editor cam-site-image-dialog';
    d.setAttribute('aria-labelledby', 'camSiteImageTitle');
    d.innerHTML = `
      <form class="ae-opinion-form" novalidate>
        <div class="ae-opinion-dialog-bar">
          <h2 id="camSiteImageTitle" class="ae-opinion-dialog-label">Imagen del sitio</h2>
          <button type="button" class="ae-opinion-close" data-act="close" aria-label="Cerrar sin guardar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div class="ae-opinion-form-body">
          <div class="cam-site-image-where"><strong data-ui="label"></strong><span data-ui="section"></span><code data-ui="key"></code></div>
          <div class="cam-site-image-variants" data-ui="variants" role="group" aria-label="Variante"></div>
          <p class="cam-site-image-note" data-ui="note" hidden></p>
          <div class="cam-site-image-preview" data-ui="preview" role="img" aria-label="Vista previa"><span class="cam-site-image-badge" data-ui="badge"></span></div>
          <p class="cam-site-image-meta" data-ui="meta"></p>
          <section class="cam-logo-size-panel" data-ui="sizePanel" aria-label="Tamaño del logo" hidden>
            <div class="cam-logo-size-head"><strong>Tamaño</strong><span>100 % = tamaño original</span></div>
            <div class="cam-logo-size-tabs" data-ui="sizeDevices" role="group" aria-label="Dispositivo">
              <button type="button" data-size-device="desktop">Ordenador</button>
              <button type="button" data-size-device="mobile">Teléfono</button>
            </div>
            <div class="cam-logo-size-tabs is-themes" data-ui="sizeThemes" role="group" aria-label="Modo visual">
              <button type="button" data-size-theme="all">Ambos</button>
              <button type="button" data-size-theme="light">Día</button>
              <button type="button" data-size-theme="dark">Noche</button>
            </div>
            <div class="cam-logo-size-controls">
              <button type="button" data-size-step="-5" aria-label="Reducir tamaño">−</button>
              <input type="range" data-ui="sizeRange" min="50" max="200" step="5" value="100" aria-label="Tamaño del logo">
              <output data-ui="sizeValue">100 %</output>
              <button type="button" data-size-step="5" aria-label="Aumentar tamaño">+</button>
            </div>
            <div class="cam-logo-size-foot">
              <button type="button" data-act="resetSize">Restablecer tamaño original</button>
              <span class="cam-logo-size-thumb"><img data-ui="sizeThumb" alt="Vista previa del tamaño" decoding="async"></span>
            </div>
          </section>
          <div class="ae-opinion-field-row">
            <label class="ae-opinion-field"><span>Subir archivo <em>(JPG, PNG o WebP; se optimiza al subirla)</em></span><input data-ui="file" type="file" accept="image/jpeg,image/png,image/webp"></label>
            <label class="ae-opinion-field"><span>o pegar enlace</span><input data-ui="url" type="url" inputmode="url" placeholder="https://…" maxlength="2048" autocomplete="off"></label>
          </div>
          <div class="cam-site-image-focus" data-ui="focusBox">
            <label class="cam-site-image-check"><input data-ui="focusOn" type="checkbox"> Ajustar encuadre</label>
            <div class="ae-opinion-field-row" data-ui="focusFields" hidden>
              <label class="ae-opinion-field"><span>Encuadre horizontal</span><input data-ui="fx" type="range" min="0" max="100" value="50"></label>
              <label class="ae-opinion-field"><span>Encuadre vertical</span><input data-ui="fy" type="range" min="0" max="100" value="50"></label>
            </div>
          </div>
          <label class="ae-opinion-field" data-ui="altBox" hidden><span>Texto alternativo</span><input data-ui="alt" type="text" maxlength="200" autocomplete="off"></label>
          <p class="ae-opinion-form-error" data-ui="error" role="alert"></p>
        </div>
        <div class="ae-opinion-form-actions cam-site-image-actions">
          <button type="button" class="ae-opinions-button is-secondary cam-site-image-reset" data-act="reset" hidden>Restaurar original</button>
          <span class="cam-site-image-spacer"></span>
          <button type="button" class="ae-opinions-button is-secondary" data-act="cancel">Cancelar</button>
          <button type="submit" class="ae-opinions-button" data-act="save">Guardar</button>
        </div>
      </form>`;
    document.body.appendChild(d);
    ui.dialog = d;
    for (const n of d.querySelectorAll('[data-ui]')) ui[n.dataset.ui] = n;
    ui.form = d.querySelector('form');
    ui.save = d.querySelector('[data-act=save]');
    ui.reset = d.querySelector('[data-act=reset]');
    d.querySelector('[data-act=close]').addEventListener('click', () => d.close());
    d.querySelector('[data-act=cancel]').addEventListener('click', () => d.close());
    ui.reset.addEventListener('click', resetImage);
    ui.sizeRange.addEventListener('input', () => changeSize(ui.sizeRange.value));
    d.querySelectorAll('[data-size-step]').forEach(button => button.addEventListener('click', () =>
      changeSize(Number(ui.sizeRange.value) + Number(button.dataset.sizeStep))));
    d.querySelector('[data-act=resetSize]').addEventListener('click', () => changeSize(100));
    d.querySelectorAll('[data-size-device]').forEach(button => button.addEventListener('click', () => {
      if (!sizing) return;
      window.camVisualSizes.cancelPreview();
      sizing.device = button.dataset.sizeDevice; refreshSizeControls();
    }));
    d.querySelectorAll('[data-size-theme]').forEach(button => button.addEventListener('click', () => {
      if (!sizing) return;
      window.camVisualSizes.cancelPreview();
      sizing.theme = button.dataset.sizeTheme; refreshSizeControls();
    }));
    ui.form.addEventListener('submit', saveImage);
    window.camImageVisual?.attach(ui, updatePreview);
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
    d.addEventListener('close', () => {
      window.camVisualSizes?.cancelPreview?.();
      dropLocal(); editing = null; sizing = null; scheduleScan();
    });
    for (const n of [ui.url, ui.fx, ui.fy]) n.addEventListener('input', updatePreview);
    ui.focusOn.addEventListener('change', () => { ui.focusFields.hidden = !ui.focusOn.checked; updatePreview(); });
    ui.file.addEventListener('change', () => {
      dropLocal(); ui.error.textContent = '';
      const file = ui.file.files?.[0];
      if (file) {
        if (!IMAGE_TYPES[file.type] || file.size > MAX_ORIGINAL) { ui.error.textContent = 'La imagen debe ser JPG, PNG o WebP de hasta 25 MB.'; ui.file.value = ''; }
        else { ui.localUrl = URL.createObjectURL(file); ui.url.value = ''; }
      }
      updatePreview();
    });
    return d;
  }
  function dropLocal() { if (ui.localUrl) { URL.revokeObjectURL(ui.localUrl); ui.localUrl = ''; } }

  function originalSrc(entry) {
    const e = entry.kind === 'slot' ? ENTRIES.get(entry.atlas) : entry;
    if (e.embedded) return dataByKey.get(e.key) || '';
    return toURL(e.paths[0]).href;
  }
  function measure(src) {
    return new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([0, 0]); i.src = src; });
  }

  async function openEditor(key, el) {
    if (!editModeOn()) return;
    buildDialog();
    const entry = ENTRIES.get(key); if (!entry) return;
    const r = el?.getBoundingClientRect?.();
    const aspect = r && r.width > 4 && r.height > 4 ? Math.min(4, Math.max(.25, r.width / r.height)) : (editing?.aspect || 16 / 9);
    const contain = entry.kind === 'img' ? (el ? getComputedStyle(el).objectFit !== 'cover' && !/respaldo/.test(key) : true) : entry.kind === 'atlas';
    const decorative = entry.kind !== 'img' || (el && el.getAttribute('aria-hidden') === 'true');
    editing = { key, aspect, contain, decorative, el };
    fill();
    if (!ui.dialog.open) ui.dialog.showModal();
  }

  function refreshSizeControls() {
    if (!sizing) return;
    const draftId = sizing.device + '|' + sizing.theme;
    const pct = sizing.drafts.get(draftId) ?? window.camVisualSizes.get(sizing.key, sizing.device, sizing.theme);
    if (sizing.drafts.has(draftId))
      window.camVisualSizes.preview(sizing.key, sizing.device, sizing.theme, pct);
    ui.sizeRange.min = '50'; ui.sizeRange.max = String(sizing.max);
    ui.sizeRange.value = String(pct);
    ui.sizeValue.textContent = pct + ' %';
    ui.sizeRange.setAttribute('aria-valuetext', pct + ' por ciento');
    ui.sizeDevices.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.sizeDevice === sizing.device)));
    ui.sizeThemes.querySelectorAll('button').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.sizeTheme === sizing.theme)));
    ui.sizeThumb.style.scale = String(pct / 100);
  }
  function changeSize(value) {
    if (!sizing || !editing) return;
    const pct = Math.min(sizing.max, Math.max(50, Math.round(Number(value) / 5) * 5));
    ui.sizeRange.value = String(pct);
    ui.sizeValue.textContent = pct + ' %';
    ui.sizeThumb.style.scale = String(pct / 100);
    sizing.drafts.set(sizing.device + '|' + sizing.theme, pct);
    window.camVisualSizes.preview(sizing.key, sizing.device, sizing.theme, pct);
  }
  function setupSize(entry) {
    window.camVisualSizes?.cancelPreview?.();
    const item = window.camVisualSizes?.identify?.(editing?.el);
    sizing = item ? {
      key:item.key, device:window.camVisualSizes.deviceNow(),
      theme:entry.variant === NIGHT ? 'dark' : entry.variant === DAY ? 'light' : 'all',
      max:item.max || 200, drafts:new Map()
    } : null;
    ui.sizePanel.hidden = !sizing;
    if (!sizing) return;
    ui.sizeThumb.src = editing.el?.currentSrc || editing.el?.src || '';
    refreshSizeControls();
  }
  async function saveSize() {
    if (!sizing || !sizing.drafts.size) return;
    const { key } = sizing;
    // Guardar los ajustes de varios dispositivos o temas en el mismo diálogo.
    for (const [id, pct] of sizing.drafts) {
      const [device, theme] = id.split('|');
      await window.camVisualSizes.save(key, device, theme, pct);
    }
    sizing.drafts.clear();
  }
  async function fill() {
    const { key, aspect, contain, decorative } = editing;
    const entry = ENTRIES.get(key), row = rows.get(key);
    ui.label.textContent = entry.label;
    ui.section.textContent = entry.section;
    ui.key.textContent = key;
    // Variantes (día/noche…)
    ui.variants.textContent = '';
    const sibs = entry.group ? [...ENTRIES.values()].filter(e => e.group === entry.group) : [];
    ui.variants.hidden = sibs.length < 2;
    for (const s of sibs) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = s.variant + (rows.has(s.key) ? ' ·' : '');
      b.title = rows.has(s.key) ? 'Tiene una imagen personalizada' : 'Imagen original';
      b.setAttribute('aria-pressed', String(s.key === key));
      b.addEventListener('click', () => { if (s.key !== editing.key) { dropLocal(); editing = Object.assign({}, editing, { key: s.key }); fill(); } });
      ui.variants.appendChild(b);
    }
    const note = entry.kind === 'atlas' ? entry.note + ' Si subes una imagen aquí, reemplaza el mosaico completo: conserva la misma composición y proporción.'
      : entry.kind === 'slot' ? 'Este banner sale de un mosaico de varias escenas; aquí cambias solo este, sin tocar los demás.' : '';
    ui.note.hidden = !note; ui.note.textContent = note;
    ui.file.value = ''; dropLocal();
    ui.url.value = row?.url || '';
    const canFocus = entry.kind !== 'atlas';
    ui.focusBox.hidden = !canFocus;
    ui.focusOn.checked = Boolean(focusOf(row)) || entry.kind === 'slot' && Boolean(row?.url);
    ui.fx.value = row?.focus_x ?? 50; ui.fy.value = row?.focus_y ?? 50;
    ui.focusFields.hidden = !ui.focusOn.checked;
    ui.altBox.hidden = decorative;
    ui.alt.value = row?.alt || (editing.el?.getAttribute('alt') || '');
    ui.error.textContent = '';
    ui.dialog.classList.toggle('is-size-only', entry.kind === 'size-only');
    setupSize(entry);
    window.camImageVisual?.open(key, entry.kind === 'size-only' ? 'img' : entry.kind, row?.visual, editing.el, {x:row?.focus_x,y:row?.focus_y});
    if (entry.kind === 'size-only') {
      ui.reset.hidden = true; ui.variants.hidden = true; ui.note.hidden = true;
      ui.meta.textContent = '';
      ui.save.disabled = false; ui.save.textContent = 'Guardar';
      ui.preview.style.aspectRatio = '3';
      ui.preview.classList.add('is-contain');
      ui.preview.style.backgroundImage = cssUrl(editing.el?.currentSrc || editing.el?.src || '');
      ui.preview.style.backgroundPosition = 'center';
      ui.preview.style.backgroundSize = 'contain';
      ui.badge.textContent = 'Logo';
      window.camImageVisual?.preview(ui.preview, editing);
      return;
    }
    ui.reset.hidden = !row;
    ui.save.disabled = false; ui.save.textContent = 'Guardar';
    ui.preview.style.aspectRatio = String(entry.kind === 'atlas' ? 2 : aspect);
    ui.preview.classList.toggle('is-contain', contain);
    updatePreview();
    // Tamaño recomendado
    ui.meta.textContent = '';
    const src = originalSrc(entry);
    const [w, h] = await measure(src);
    if (!editing || editing.key !== key) return;
    const vector = /\.svg$/i.test(toURL(src)?.pathname || '');
    let text;
    if (entry.kind === 'slot') {
      const cells = ENTRIES.get(entry.atlas).cells || [1, 1];
      text = w ? 'Recomendado: ' + Math.round(w / cells[0]) + ' × ' + Math.round(h / cells[1]) + ' px o más (tamaño de este recorte en el original).' : '';
    } else if (vector) {
      const rr = editing.el?.getBoundingClientRect?.();
      text = 'Original vectorial (SVG).' + (rr && rr.width ? ' Recomendado: al menos ' + Math.round(rr.width * 2) + ' × ' + Math.round(rr.height * 2) + ' px.' : '');
    } else text = w ? 'Original: ' + w + ' × ' + h + ' px. Recomendado: el mismo tamaño o mayor, con la misma proporción.' : '';
    ui.meta.textContent = text;
  }

  function updatePreview() {
    if (!editing || ENTRIES.get(editing.key)?.kind === 'size-only') return;
    const entry = ENTRIES.get(editing.key), row = rows.get(editing.key);
    const typed = safeUrl(ui.url.value.trim());
    const fresh = ui.localUrl || typed;
    const src = fresh || row?.url || '';
    if (sizing && editing.el?.localName === 'img' && ui.sizeThumb)
      ui.sizeThumb.src = src || originalSrc(entry);
    const box = ui.preview;
    box.style.aspectRatio = String(entry.kind === 'atlas' ? 2 : editing.aspect);
    box.classList.toggle('is-contain', editing.contain);
    box.style.backgroundRepeat = 'no-repeat';
    if (src) {
      box.style.backgroundImage = cssUrl(src);
      box.style.backgroundSize = editing.contain ? 'contain' : 'cover';
      box.style.backgroundPosition = ui.focusOn.checked && entry.kind !== 'atlas' ? ui.fx.value + '% ' + ui.fy.value + '%' : 'center';
      ui.badge.textContent = fresh ? 'Nueva' : 'Personalizada';
    } else {
      box.style.backgroundImage = cssUrl(originalSrc(entry));
      if (entry.kind === 'slot') { box.style.backgroundSize = entry.crop.size; box.style.backgroundPosition = entry.crop.pos; }
      else {
        box.style.backgroundSize = editing.contain ? 'contain' : 'cover';
        box.style.backgroundPosition = ui.focusOn.checked && entry.kind !== 'atlas' ? ui.fx.value + '% ' + ui.fy.value + '%' : 'center';
      }
      ui.badge.textContent = 'Original';
    }
    window.camImageVisual?.preview(box, editing);
  }

  function friendly(err) {
    const m = String(err?.message || err || '');
    if (/ae_set_site_image|ae_reset_site_image|ae_site_images|schema cache|does not exist|404/i.test(m)) return 'La base de datos todavía no tiene activadas las imágenes editables (falta aplicar la migración).';
    return m || 'No se pudo guardar.';
  }

  async function uploadImage(file, key) {
    const sb = client();
    if (!sb?.storage) throw Error('La subida de imágenes no está disponible. Pega un enlace HTTPS.');
    // Igual que noticias y opiniones (cam-image-compress.js), pero con lado mayor de hasta
    // 2400 px: los fondos de cabecera y banners se ven a todo lo ancho en escritorio.
    if (window.camCompressImage) file = await window.camCompressImage(file, { maxSide: 2400 });
    if (!IMAGE_TYPES[file.type] || file.size > MAX_IMAGE) throw Error('La imagen sigue pesando más de 5 MB después de optimizarla. Prueba con una más pequeña.');
    const name = 'site/' + key + '-' + Date.now() + '.' + IMAGE_TYPES[file.type];
    const r = await sb.storage.from(BUCKET).upload(name, file, { contentType: file.type, cacheControl: '31536000', upsert: false });
    if (r.error) throw Error('No se pudo guardar la imagen: ' + r.error.message);
    const url = sb.storage.from(BUCKET).getPublicUrl(r.data?.path || name).data?.publicUrl || '';
    if (!safeUrl(url)) throw Error('La imagen se subió, pero no se obtuvo un enlace válido.');
    return url;
  }

  async function saveImage(e) {
    e.preventDefault();
    if (!editModeOn() || !editing) return;
    const { key } = editing; const entry = ENTRIES.get(key); const row = rows.get(key);
    ui.error.textContent = '';
    if (entry.kind === 'size-only') {
      ui.save.disabled = true;
      try {
        const visual = window.camImageVisual?.get() || null;
        const sb = client(); if (!sb?.rpc) throw Error('Sin conexión a la base de datos');
        const current = rows.get(key);
        const payload = {p_key:key,p_url:current?.url||null,p_focus_x:current?.focus_x??null,p_focus_y:current?.focus_y??null,p_alt:current?.alt||null,p_visual:visual};
        const saved = await sb.rpc('ae_set_site_image_visual',payload);
        if (saved.error) throw saved.error;
        if (!payload.p_url && payload.p_focus_x==null && !payload.p_alt && !visual) rows.delete(key);
        else rows.set(key,{url:payload.p_url,focus_x:payload.p_focus_x,focus_y:payload.p_focus_y,alt:payload.p_alt,visual});
        writeCache(); applyAll(); await saveSize(); ui.dialog.close(); notify('Tamaño y encuadre actualizados.');
      }
      catch (err) { ui.error.textContent = friendly(err); }
      finally { ui.save.disabled = false; }
      return;
    }
    const typed = ui.url.value.trim();
    if (typed && !safeUrl(typed)) { ui.error.textContent = 'El enlace de la imagen debe empezar por https://'; ui.url.focus(); return; }
    const file = ui.file.files?.[0];
    if (entry.kind === 'slot' && !file && !typed) { ui.error.textContent = 'Sube una imagen o pega un enlace para este banner.'; return; }
    const sb = client(); if (!sb?.rpc) { ui.error.textContent = 'La conexión no está disponible.'; return; }
    ui.save.disabled = true; ui.save.textContent = 'Guardando…';
    try {
      const url = file ? await uploadImage(file, key) : (typed || null);
      const focus = ui.focusOn.checked && entry.kind !== 'atlas';
      const args = {
        p_key: key, p_url: url,
        p_focus_x: focus ? Math.round(Number(ui.fx.value)) : null,
        p_focus_y: focus ? Math.round(Number(ui.fy.value)) : null,
        p_alt: editing.decorative ? null : (ui.alt.value.trim() || null),
        p_visual: window.camImageVisual?.get() || null
      };
      if (!args.p_url && args.p_focus_x == null && !args.p_alt && !args.p_visual) {
        if (!row) { await saveSize(); ui.dialog.close(); notify('Tamaño actualizado.'); return; }
      }
      const r = await sb.rpc('ae_set_site_image_visual', args);
      if (r.error) throw r.error;
      await saveSize();
      if (!args.p_url && args.p_focus_x == null && !args.p_alt && !args.p_visual) rows.delete(key);
      else rows.set(key, { url: args.p_url, focus_x: args.p_focus_x, focus_y: args.p_focus_y, alt: args.p_alt, visual: args.p_visual });
      writeCache(); applyAll();
      ui.dialog.close();
      notify('Imagen actualizada.');
    } catch (err) {
      ui.error.textContent = friendly(err);
    } finally { ui.save.disabled = false; ui.save.textContent = 'Guardar'; }
  }

  async function resetImage() {
    if (!editModeOn() || !editing) return;
    const { key } = editing;
    if (!window.confirm('¿Volver a la imagen original del diseño?')) return;
    const sb = client(); if (!sb?.rpc) { ui.error.textContent = 'La conexión no está disponible.'; return; }
    ui.reset.disabled = true;
    try {
      const r = await sb.rpc('ae_reset_site_image', { p_key: key });
      if (r.error) throw r.error;
      rows.delete(key); writeCache(); applyAll();
      ui.dialog.close();
      notify('Imagen original restaurada.');
    } catch (err) { ui.error.textContent = friendly(err); }
    finally { ui.reset.disabled = false; }
  }
  function notify(text) { try { if (typeof notifyCommunity === 'function') notifyCommunity(text); } catch {} }

  // ---------------------------------------------------------------------------
  // Arranque: se aplica la caché en cuanto el script corre (antes de pintar),
  // luego la base de datos al cargar el DOM.
  // ---------------------------------------------------------------------------
  readCache();
  if (rows.size) { try { walkSheets(); applyDecls(); } catch {} }
  const observer = new MutationObserver(onMutations);
  function start() {
    applyAll();
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'class', 'open', 'hidden'] });
    load();
    refresh();
    setInterval(refresh, 2500); // por si el inicio o cierre de sesión llega por otra vía
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  addEventListener('load', () => { sheetsChanged(); applyAll(); });
  // Al cruzar de escritorio a teléfono, aplicar el perfil visual adecuado.
  let visualResize = 0;
  addEventListener('resize', () => { clearTimeout(visualResize); visualResize = setTimeout(() => { applyAll(); if (admin.on) requestReposition(); }, 120); }, { passive: true });

  window.camSiteImages = {
    refresh, reload: load, open: openEditor,
    keys: () => [...ENTRIES.keys()],
    inventory: () => [...ENTRIES.values()].map(e => ({ key: e.key, label: e.label, section: e.section, kind: e.kind, paths: e.embedded ? ['assets/' + e.embedded + ' (incrustada)'] : (e.paths || [ENTRIES.get(e.atlas).paths[0]]) })),
    _state: () => ({ rows: [...rows.keys()], decls: decls.length, pencils: [...admin.pencils.values()].flat().map(p => p.key), admin: admin.on, tableReady })
  };
})();
