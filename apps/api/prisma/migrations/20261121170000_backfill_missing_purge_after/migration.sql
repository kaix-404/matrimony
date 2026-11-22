-- Section 21: a soft-deleted account with no `purgeAfter` is invisible to both
-- the six-hourly anonymisation sweep and the readiness check that watches it,
-- because both read the deadline. No current path writes that state —
-- `deleteAccount` sets `purgeAfter` in the same transaction as `deletedAt`, and
-- a restore clears both — but a row written by an older build after a partial
-- failure, or edited by hand, would be retained forever with nothing to report
-- it.
--
-- Six months is the F6 default and the default of
-- `DELETED_ACCOUNT_RETENTION_MONTHS`. A deployment that has configured a
-- different window should re-run the UPDATE below with its own value; the sweep
-- also erases undated deletions by their own deletion date, so this only decides
-- how soon an already overdue row is first seen.
UPDATE "User"
SET "purgeAfter" = "deletedAt" + interval '6 months'
WHERE "deletedAt" IS NOT NULL
  AND "purgeAfter" IS NULL
  AND "isAnonymised" = false;
