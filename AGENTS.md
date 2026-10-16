# AE SPORTS maintenance

Visual reference: `docs/visual-guide.md` and the illustrated `guia-visual.html`.
Preserve the current brand assets and approved mobile sport layouts. Use the
guide for new visual work; it does not authorize removing existing functionality.

The published page loads `assets/site.css` and `assets/ae-editorial-bundle.css`.
The latter combines the source stylesheets listed in `assets/style-sources.json`, in their original cascade order.

After changing any listed stylesheet, run `node scripts/build-editorial-css.mjs` and commit the regenerated bundle. Add new editorial stylesheets at the appropriate position in `assets/style-sources.json` rather than adding more stylesheet requests to the page. Do not edit the generated bundle directly.

Run `npm run test:editor` when changing news editing or publication. Preserve the textarea fallback and the existing HTML of unchanged articles.

## Public address and publication

The free branded public address is https://aesportsclub.github.io/.
This repository remains the canonical application source. The repository
https://github.com/aesportsclub/aesportsclub.github.io owns the GitHub Pages
publication workflow and reads this repository's main branch on a five-minute
schedule. Keep application changes here; do not create a divergent second site.
The previous project Pages address remains available. When changing browser
origin allowlists, preserve both controlled public origins.
