# CSS, article metadata and database performance — 25 October 2026

## CSS

Four sport-banner sources used to appear both in the editorial bundle and
again later in the HTML. They now appear once in the sport-banner performance
pack. The football heading rule remains between the same two sources, and the
pack stays at the original location in the cascade. Edit its component files
and regenerate with npm run build:css-packs.

The editorial bundle is 52,552 bytes smaller, before compression. The HTML
requests three fewer stylesheets. This is a payload reduction, not a measured
promise about page-load time.

## News metadata

The homepage includes description, canonical, Open Graph and Twitter tags
without JavaScript. Opening a news article sets its title, summary, cover and
canonical URL; closing it or navigating back restores the homepage metadata.

GitHub Pages cannot render a database query into the initial response. The
article share buttons therefore use generated public preview pages under
compartir/noticias/ when the manifest confirms those pages exist. Their HTML
contains the article metadata for sharing crawlers. Readers continue into the
existing article reader; canonical URLs keep the existing ?article= links.
The previews are marked noindex to avoid duplicate search results.

Run node scripts/build-news-seo.mjs to refresh the previews, catalog, sitemap
and robots.txt. The public-news workflow also runs after generator changes,
on demand and every 15 minutes. GitHub can delay scheduled runs; the existing
CAM publisher must then deploy the new source revision. New articles keep
using their working original links until their preview is available.

Generation uses the site's existing public publishable key and RLS, selects
only public articles, and validates the complete response before replacing
files. API failures preserve the previous generated files. Article bodies are
used only as a summary fallback and are not copied into the preview files.
Unpublished articles are removed at the next successful refresh.

## Database

The migration optimizes seven session-dependent RLS policies, removes six
redundant permissive definitions, and retains the canonical rules plus every
restrictive publication/ownership/anonymous-account guard. Session checks
are evaluated once per statement rather than once per candidate row.

Eight indexes cover missing leading foreign-key columns on article likes,
comment votes, comment authors/parents, free-Take votes, Pick-comment votes,
Take-reply parents and NFL Pick teams. Existing primary/composite indexes
are preserved. No rows, authentication settings or backup tables are changed.

The migration was applied in staging and production through the SQL connector
after the migration endpoint failed with an expired-request-state error.
It is repeatable and remains in supabase/migrations/ for reproducible local
setup. The SQL fallback does not register a Supabase migration-history entry.

Production performance advisors now report zero auth_rls_initplan and zero
multiple_permissive_policies findings. Unindexed-FK information findings
dropped from 35 to 27. The remaining findings concern other relations; they
are not all candidates for automatic indexing. Newly added indexes can be
reported as unused until real traffic uses them. Backup-table primary-key
notices and authentication/security settings were outside this change.

Run npm run test:seo and npm run test:database:performance for metadata,
public-only generation, failed refreshes, and 25 before/after authorization
cases with synthetic data. The database test also checks migration
repeatability and the eight indexes. CI additionally compares computed
styles across five sections, two themes and mobile/desktop.
