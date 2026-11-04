# CAM SPORTS maintenance

Visual reference: `docs/visual-guide.md` and the illustrated `guia-visual.html`.
Preserve the current brand assets and approved mobile sport layouts. Use the
guide for new visual work; it does not authorize removing existing functionality.

The published page loads `assets/site.css` and `assets/ae-editorial-bundle.css`.
The latter combines the source stylesheets listed in `assets/style-sources.json`, in their original cascade order.

After changing any listed stylesheet, run `node scripts/build-editorial-css.mjs` and commit the regenerated bundle. Add new editorial stylesheets at the appropriate position in `assets/style-sources.json` rather than adding more stylesheet requests to the page. Do not edit the generated bundle directly.

Run `npm run test:editor` when changing news editing or publication. Preserve the textarea fallback and the existing HTML of unchanged articles.


## CSS request consolidation (2026-11-04)

Eleven local stylesheet requests replace the former 28, preserving the exact
component order and every existing inline-style/script boundary. The editorial
bundle combines the 98 sources in `assets/style-sources.json`; the eight smaller
packs combine the 69 sources in `assets/performance-css-packs.json`. All generated
CSS uses the same whitespace-only compressor in `scripts/css-minifier.mjs`.

**Edit original component CSS**, never generated bundles. Run `npm run build:styles`
after source changes and commit the outputs. `npm run test:performance` checks
freshness, rule/declaration equality and delivery order. Do not load a bundled
source as an additional link or move a bundle across an inline style or script.
The retired core-extras output is retained for already cached older HTML; do not
reintroduce it as a link. The five obsolete header stylesheet sources are removed;
`assets/cam-header-system.css` remains the shared header authority.

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
