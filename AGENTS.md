# AE SPORTS maintenance

The published page loads `assets/site.css` and `assets/ae-editorial-bundle.css`.
The latter combines the source stylesheets listed in `assets/style-sources.json`, in their original cascade order.

After changing any listed stylesheet, run `node scripts/build-editorial-css.mjs` and commit the regenerated bundle. Add new editorial stylesheets at the appropriate position in `assets/style-sources.json` rather than adding more stylesheet requests to the page. Do not edit the generated bundle directly.

Run `npm run test:editor` when changing news editing or publication. Preserve the textarea fallback and the existing HTML of unchanged articles.
