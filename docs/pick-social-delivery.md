# Automatic editorial Pick sharing

A newly published Pick already creates one delivery for each enabled channel.
The Pick published on 25 October reached X, while Instagram and TikTok stayed
queued waiting for an event-specific MP4. The GitHub video worker, scheduled
every five minutes, actually started hours apart. The queue and permissions
were working; media readiness was the delay.

## Current format: photo and complete parlay (25 October)

New editorial Pick events use `video_version: pick-v2`. A private before-insert
trigger runs after the brand illustration rotation and restores the actual Pick
image (photo path, photo URL, banner path, then banner URL). The event freezes the
match, original selection line breaks and odds alongside its publication data.
X receives that same actual photo. If no editor image exists, the approved brand
illustration remains the fallback.

Instagram and TikTok render individual 720×1280 H.264/AAC videos. Meaningful
content stays within x=72…588 and y=200…820, leaving room for the immersive app
controls. The photo is contained without cropping. Every parlay selection is
numbered and wrapped at a readable fixed font size. Long parlays receive more
pages (at least four seconds each, eight seconds minimum total); no selection is
ellipsized or discarded. A failed photo download stops that Pick's rendering
instead of silently substituting a logo.

New filenames use `pick-v2-` plus the existing event/network hash, so old generated
files cannot be mistaken for the new layout. Other unsent videos use `safe-v2-`
filenames, so pre-rendered unsafe files cannot be reused. Existing news/promos receive the
safe framing too. Their data and per-network licensed music rotation are unchanged.
Published, accepted or uncertain deliveries are never reset or re-sent.

The individual media worker still runs on GitHub's five-minute schedule, which
GitHub may delay. Renderer changes also trigger it on push to main. The branded
Pages publisher must deploy its resulting media before the database can send a
Reel. Individual photo/selection videos therefore wait for rendering; they no
longer use a generic instant clip. Only public, visible, queued content is exposed
by the existing read-only worker RPC; credentials and delivery metadata remain
private.

Apply `20261025213843_cam_pick_photo_parlay_video.sql` only after deploying this
renderer. It marks future Pick events only and does not backfill history. The
existing ready cache remains compatible with older unmarked events.

## Ready media retained for legacy Picks

`cam_social.ready_pick_videos` maps the three approved Pick illustrations and
ten existing CC0 music assignments to thirty prepared 9:16 H.264/AAC videos.
For legacy unmarked events, the dispatcher reuses a clip while keeping the individual
title, match, selection, odds and exact Pick link in its caption. Instagram
still publishes a Reel shared to the feed. X keeps its existing image post.

The existing shuffled music assignment remains unchanged. Instagram and TikTok
keep independent tracks. The ready library's rotation uses the licensed catalog
in `assets/social-videos/pick-template-tracks.json`; it is not a claim that these
tracks are currently trending on either platform.

The lookup runs only for legacy editorial Picks. Other content and future music
tracks without a prepared clip retain the existing individual renderer. File
HTTP/MIME verification, source visibility, rate limits, immutable results and
ambiguous-send protection still run. Repeated edits and dispatches cannot
create a second delivery for an already published Pick/network pair.

## Music choice and connection limits

The user chose automatic publication after being offered notification publishing
with native music selection. The current Instagram connection returns
`ChannelRefreshRequired` when requesting its recommended audio catalog: it must
be connected through Facebook Login to browse those tracks. The current Buffer
`InstagramPostMetadataInput`/`VideoMetadataInput` also expose no audio attachment
field. TikTok's Buffer input exposes no music selection field. No unsupported
audio IDs or undocumented fields are submitted.

Native TikTok trending sounds can be added when finishing a notification post
in the TikTok app. This change preserves automatic publishing with authorized
audio instead. No credentials, connection permissions or posting modes change.

References checked on 25 October 2026:

- https://support.buffer.com/articles/adding-music-stickers-and-other-effects-to-instagram-and-tiktok-posts-G5QrWfQL4k
- https://developers.buffer.com/reference.html
- https://developers.tiktok.com/docs/en/content-posting-api-reference-photo-post

## Deployment and activation

1. Apply `20261025195044_cam_pick_ready_social_videos.sql`. Its feature flag
   defaults to false, preserving the current dispatcher until media is ready.
2. Deploy the thirty clips and their manifest to the existing CAM Sports site.
3. Verify each public file returns a playable MP4 and matches the local manifest.
4. Enable `cam_social.settings.pick_media_cache_enabled` and reset only queued
   editorial Pick video checks. Never requeue accepted, published or uncertain
   deliveries. The normal database cron sends ready deliveries.

Turning the flag off restores the old renderer path without changing any
historical publication or result. Reapplying the migration preserves the flag.
Use `python scripts/cam_social_make_video.py --prepare-pick-templates` only when
deliberately rebuilding the ready library; use a new URL version for changes to
an already published template.

Validation: `node tests/ready-pick-social-videos.mjs` checks all thirty actual
files, their hashes, resolution, duration, codecs and audio. It also exercises
the rollout flag, captions, per-network audio, MIME checks, duplicate prevention,
fallbacks and private access in a local database. The existing social tests
cover publication, licensing, Instagram/TikTok routing and result quotes.
