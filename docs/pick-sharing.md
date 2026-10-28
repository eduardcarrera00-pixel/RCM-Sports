# Public Pick sharing

`CamPickShare` keeps its existing `open(pick, {kind, opener})` and `button` entry
points, compact permalinks and public profile/community/editorial integration.
Only the share dialog and exported artwork change. Take rendering is unchanged.
There are no new queries, writes, auth rules, migrations or publication systems.

The blue canvas is opaque #073B83 on every edge. All formats draw the exact
transparent `cam-sports-logo-completo.webp` used by the header, with natural
proportions. Generation awaits that asset and local Playfair fonts. A failed
logo blocks image export; copying the original link remains available.

## Data and controls

The immutable model copies public selection, event, sport, market and line
fields. Compound stored selection strings are split on the existing ticket
separators; selection words, signs and numbers are preserved. The publication
footer uses the saved `publication_day`, or the original `created_at` local
calendar day; it never substitutes the event date or today's date. The original
American odds are retained, and absent odds/dates are omitted. Editorial
settlement comes from the existing weekly-results resolver. State labels and
moderation labels do not depend solely on color.

An editor starts with one Pick and a square image. It can select other loaded
public Picks registered by existing share buttons, choose square 1080×1080,
story 1080×1920 or compact horizontal 1080×700, hide date/odds and include an
immutable contiguous original analysis fragment. Analysis is off by default.
Independent Picks always get separate images, attribution and original links;
they are never converted to a parlay or assigned calculated combined odds.
A stored multi-selection Pick is labelled as a combinada and uses only its
original stored total odds.

Private capture metadata, screenshots, emails, balances, stakes and payouts
are not read into the export model. The current public Pick schema does not
persist stake/payout fields, so it offers no money toggle and invents none.

The canvas measures all content and paginates long tickets at fixed readable
sizes; very long individual rows continue on another page. It does not drop
selections or ellipsize exported content. Each page is numbered for multi-image
exports. Story branding/text/footer stay in the central platform-safe region.
Preview paging uses the same already-generated PNG objects as downloads and
native sharing. Download all produces a standard ZIP of those exact PNG bytes.

## Native sharing

The main action prepares all PNG files before enabling sharing, checks
`navigator.canShare({files})`, and invokes `navigator.share` synchronously from
the tap. X uses native file sharing rather than a text-only intent; Instagram
and TikTok receive file-only payloads. A supported generic share includes the
original permalink(s). An unsuccessful combined payload offers a new user tap
for file-only sharing. Cancel is neutral, and promise resolution never claims
that a social post was published. A multiple-file rejection offers an explicit
single-image action and ZIP/individual PNG downloads. No images are silently
removed from the requested native payload.

All generated URLs are revoked on regeneration/close. A generation token and
the dialog request token discard stale asynchronous jobs. The mobile modal
scrolls vertically with a sticky action bar, respects both UI themes and
retains a fixed blue exported image.

## Validation

`npm run test:sharing` covers original data, analysis toggles, collections vs
parlays, public links, native cancellation/fallback and unchanged Takes/profiles.
`npm run test:sharing:browser` includes real PNG/ZIP, font/artwork loading,
three formats, pixel checks on every edge, all ticket selections, exact
preview/download/native bytes, safe content bounds, long words/props,
320–1366px and both themes. CI also runs Take and Pick export in WebKit with
an iPhone viewport. Native destinations are mocked: a physical iPhone and
actual target-app receipt still require a device test; no social account is
posted to by QA.
