# Quiniela de Fútbol: puntos automáticos

Only football is changed. NFL code, tables and scheduled jobs remain unchanged.

The existing hourly football schedule imports fixtures/results. Before a scheduled
future game opens, `cam-football-sync` requests one 1X2 market per competition
only when unscored games exist. Unambiguous complete markets are passed to the
service-only `cam_football_freeze_points` RPC. It removes the bookmaker margin,
then applies the NFL scale `clamp(round(2 / p), 2, 12)` independently to home,
draw and away. Invalid, missing or unavailable markets use 6/6/6, with NULL odds
and probabilities and `odds_source = automatic_equal_v1` (not invented odds).

The RPC locks the same game row as `cam_football_save_pick`, writes the entire
snapshot and opens the match in one transaction. A manually closed round stays
closed. Live/started games and games already carrying picks are excluded. A
trigger prevents repricing a published snapshot, including before the first
pick. Later odds cannot replace either a market or fallback snapshot. To retry
providers before opening, leave a game unscored; never retry by unlocking it.

The existing settlement trigger assigns the stored points on final results,
updates rather than increments, and supplies the existing leaderboard, history
and profile. Existing games and picks are not backfilled or repriced by the
migration. After deploying the migration and Edge Function, the existing sync
initializes previously unscored future games. There are no manual odds fields or
callable manual-odds RPC grants for browser roles. Result correction and optional
round opening/closure remain available.

Deployment order:

1. Apply `20261024162230_cam_football_automatic_points.sql`.
2. Deploy `supabase/functions/cam-football-sync/index.ts`, preserving its internal
   admin/cron authentication and `verify_jwt=false` setting.
3. Dispatch `cam_football_sync_private.dispatch('hourly')` and verify the response
   and stored snapshots. The existing cron handles subsequent updates.
4. Publish the frontend from the canonical source repository.

Validation: `npm run test:football:points`. Database coverage includes normalized
markets, the draw as favorite, fallback without fabricated probabilities,
preservation of existing history, role permissions, immutable snapshots,
closure, kickoff locks, 1X2 submission, idempotent settlement, leaderboard and
profile. Sync coverage includes absent credentials, provider failure, invalid and
ambiguous markets, repeated sync, no unnecessary provider requests and denied
unauthenticated callers. Browser coverage checks mobile/desktop and day/night,
points display, removal of odds inputs and saving a draw.
