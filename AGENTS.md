# AE SPORTS maintenance

Visual reference: `docs/visual-guide.md` and the illustrated `guia-visual.html`.
Preserve the current brand assets and approved mobile sport layouts. Use the
guide for new visual work; it does not authorize removing existing functionality.

The published page loads `assets/site.css` and `assets/ae-editorial-bundle.css`.
The latter combines the source stylesheets listed in `assets/style-sources.json`, in their original cascade order.

After changing any listed stylesheet, run `node scripts/build-editorial-css.mjs` and commit the regenerated bundle. Add new editorial stylesheets at the appropriate position in `assets/style-sources.json` rather than adding more stylesheet requests to the page. Do not edit the generated bundle directly.

## CSS source ownership and visual maintenance

The HTML cascade intentionally contains standalone CSS links after the editorial
bundle. Never add a stylesheet already bundled by `assets/style-sources.json`
as a separate link without checking cascade order: use `npm run css:audit`
to see actual loads and duplicate selectors.

Four component stylesheets are generated from **editable originals** via
`assets/component-css-groups.json` and `scripts/build-component-css.mjs`.
Edit their listed source CSS, then run `npm run build:css`, and commit generated
files. Do **not** edit `*-group.css` outputs directly.

Four inline-style migrations are maintained directly in:
`assets/ae-inline-mobile-layout.css`,
`assets/ae-inline-news-rankings.css`,
`assets/ae-inline-brand-header.css` and
`assets/ae-inline-standings-trending.css`.
Their provenance markers indicate the former `<style id="...">` blocks.
Keep these external stylesheets in their current link positions; do not
re-introduce their rules as inline CSS or concatenate them with unrelated
files, as doing so may alter media-query or cascade precedence.

After CSS changes run `npm run test:css`. For any visual changes or cleanup,
run the CI comparison of desktop/mobile/day/night across responsive
breakpoints and the community regression suites. The static screenshot
comparison does not replace interactive QA of cards, modals, takes, picks,
rankings, account states or dynamic content.

Run `npm run test:editor` when changing news editing or publication. Preserve the textarea fallback and the existing HTML of unchanged articles.

## Public address and publication

The free branded public address is https://aesportsclub.github.io/.
This repository remains the canonical application source. The repository
https://github.com/aesportsclub/aesportsclub.github.io owns the GitHub Pages
publication workflow and reads this repository's main branch on a five-minute
schedule. Keep application changes here; do not create a divergent second site.
The previous project Pages address remains available. When changing browser
origin allowlists, preserve both controlled public origins.

## Immediately publish source changes to the AE SPORTS address

After completing and committing any application change to this repository's `main`
branch, also request an immediate branded-site publication. The source checkout
remains the single source of truth; never edit or replicate application code in
the branded repository.

1. Read the **current** `main` commit SHA of `eduardcarrera00-pixel/RCM-Sports`
   after all source commits are finished.
2. With authorized GitHub write access, create or update
   `.github/source-revision-request.txt` in
   `aesportsclub/aesportsclub.github.io` on `main` to contain that full SHA and a
   final newline. Its `push` event triggers the existing `Publish AE SPORTS`
   workflow immediately, avoiding reliance on GitHub's occasionally delayed
   five-minute schedule. Do not write if that request already contains the
   current SHA and a deployment of that SHA has been confirmed.
3. Check that the resulting Pages workflow completes successfully and checked
   out the requested source SHA; check the published `source-revision.txt` when
   reachable. Do not claim the public site updated solely because a commit or
   deployment request was created.

If an immediate trigger is unavailable, retain the scheduled publisher and say
that publication may lag. Never add credentials, change database endpoints,
replace the website with an iframe or redirect, or reset published changes to
accomplish this synchronization.
