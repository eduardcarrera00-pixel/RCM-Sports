# Ligas CAM

First season: November 2026. No earlier badges or ranks are fabricated.
Independent leagues: Picks, Quiniela NFL and Quiniela Fútbol. Existing scoring,
votes, news, take rankings and quiniela results are unchanged.

Ranks: Cobre, Bronce, Plata, Oro, Platino, Diamante, Leyenda CAM. New members
start at Cobre; the profile header uses the highest earned rank by default.
Selecting a league card changes its accent, avatar frame and shield; the Picks
tab uses the Picks rank. Day/night themes and distinct shield symbols remain
readable without relying only on color.

## Monthly rules

- Only approved, visible, won/lost Picks count, by Toronto settlement month.
  Ten are required. Voids, pending and rejected records do not count.
- Quinielas use existing awarded points and only final games with a winner or
  football outcome. Month is the game's kickoff in Toronto; the minimum is
  50% (rounded up) of the final games in that league across competitions.
- Correct quiniela predictions earn their selected published points; misses
  lose that same selection's points. NFL ties/cancellations and football
  cancellations score zero. The NFL laurel doubles wins only; misses lose
  the base points. Signed totals drive standings, profiles, Parties and ranks.
- Only eligible participants determine percentiles and awards. The top 20%
  rise one rank; the bottom 20% lose one. Promotion slots round up and demotion
  slots round down so a tiny league does not assign the same player both.
- Tie order: points, correct predictions, accuracy, earliest counting result,
  then stable user ID as the final deterministic tie break.
- Diamante requires two consecutive eligible months in the top 5% while at
  Diamante to reach Leyenda. Leyenda requires top 10% each month to remain.
- Below the participation minimum, one month pauses rank; every second
  consecutive inactive month loses one rank. A league with no final results
  pauses without incrementing inactivity or breaking an elite streak.
- Cobre is the floor; best rank is retained permanently.
- The first following day at 12:00 America/Toronto is the cutoff. Final-only
  quiniela results available then count; later corrections do not rewrite
  awarded history. Approved Pick results count in their settlement month.
- Positions 1–10 at close earn a dated competition badge. It is active during
  the following calendar month and remains in profile history permanently.
  Positions 1–3 use gold, silver and bronze; live Top 10 is explicitly provisional.

## Data and operations

`cam_competitive.tick()` runs at minutes 09, 24, 39 and 54. It closes missed
months in sequence, then refreshes current standings. A transaction advisory
lock and the `(competition, season_month)` key prevent repeat awards. Closed
snapshots cannot be recomputed through refresh. Browser refreshes only read.
Updates to provisional standings may take up to 15 minutes.

All five public tables use RLS, grant only SELECT to visitors and authenticated
members, and contain sporting aggregates only. Read RPCs are SECURITY INVOKER.
The private scheduler functions are invoker functions with no public schema
usage or EXECUTE grants. The pure outcome function cannot write any data.
No service credentials are shipped to the browser.

Validation: `npm run test:leagues`, `npm run test:quiniela:profile`,
`npm run test:performance`, and browser QA on the existing site preview.
