# Champions production repair

The frontend queried champions_clubs and champions_rankings, but production lacked both tables. On 2026-10-15 the published staging edition Jornada 1 was transferred with its exact ten-team order, publication date, and 36-club catalog. No standings were generated or presented as official results. Source ranking ID: 46134654-7cec-4acd-9177-5b475a795113. Production generates its own ID and does not copy staging user identities.

Both tables have RLS and explicit SELECT-only access for anon/authenticated. Writes remain server-side. This migration restores public display; it does not add a Champions editing interface. Existing frontend reads and animation require no code changes.

Validation: unique ten-team source checked against the catalog; production anonymous SELECT returns the published edition and ten resolved logo URLs. Browser verification checks six-team preview and full ten-team ranking.
