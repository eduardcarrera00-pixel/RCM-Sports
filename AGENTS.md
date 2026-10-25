# CAM SPORTS maintenance

Visual reference: `docs/visual-guide.md` and the illustrated `guia-visual.html`.
Preserve the current brand assets and approved mobile sport layouts. Use the
guide for new visual work; it does not authorize removing existing functionality.

The published page loads `assets/site.css` and `assets/ae-editorial-bundle.css`.
The latter combines the source stylesheets listed in `assets/style-sources.json`, in their original cascade order.

After changing any listed stylesheet, run `node scripts/build-editorial-css.mjs` and commit the regenerated bundle. Add new editorial stylesheets at the appropriate position in `assets/style-sources.json` rather than adding more stylesheet requests to the page. Do not edit the generated bundle directly.

Run `npm run test:editor` when changing news editing or publication. Preserve the textarea fallback and the existing HTML of unchanged articles.


## CSS request consolidation (2026-10-24)

Five compiled CSS packs replace 62 adjacent standalone stylesheets/rules while
preserving their exact original ordering and the existing inline-style boundaries:
`assets/cam-perf-core-extras.css`, `assets/cam-perf-home-components.css`,
`assets/cam-perf-rankings.css`, `assets/cam-perf-picks-mobile.css` and
`assets/cam-perf-sport-banners.css`.

**Edit the original component CSS**, never the generated packs. The definitive
source list is `assets/performance-css-packs.json`. After editing any included CSS
source, run `npm run build:css-packs` and commit the updated pack alongside it.
`npm run build:css` also regenerates these packs. CI verifies freshness and
cascade grouping with `npm run test:performance`. Never append a bundled source
as another stylesheet link, and never move a pack across inline `<style>` blocks.

## Public address and publication

The free branded public address is https://camsports.github.io/.
This repository remains the canonical application source. The repository
https://github.com/camsports/camsports.github.io owns the GitHub Pages
publication workflow and reads this repository's main branch on a five-minute
schedule. Keep application changes here; do not create a divergent second site.
The previous project Pages address and https://aesportsclub.github.io/ remain
available. When changing browser origin allowlists, preserve all three
controlled public origins. Since 20 Oct 2026 the legacy AE publisher
(`aesportsclub/aesportsclub.github.io`, workflow `Publish AE SPORTS`) is
disabled at the owner's request: that address keeps its last published version
and no longer updates. Do not re-enable it or write publication requests there;
publish only to CAM Sports.

## Immediately publish source changes to the CAM SPORTS address

After completing and committing any application change to this repository's `main`
branch, also request an immediate branded-site publication. The source checkout
remains the single source of truth; never edit or replicate application code in
the branded repository.

1. Read the **current** `main` commit SHA of `eduardcarrera00-pixel/RCM-Sports`
   after all source commits are finished.
2. With authorized GitHub write access, create or update
   `.github/source-revision-request.txt` in
   `camsports/camsports.github.io` on `main` to contain that full SHA and a
   final newline. Its `push` event triggers the existing `Publish CAM Sports`
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
