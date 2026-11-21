-- Section 21 retention: the readiness check counts accounts past `purgeAfter`
-- and not yet anonymised on every poll, and the sweep reads the same predicate.
-- Equality on `isAnonymised` first, then the deadline range.
CREATE INDEX "User_isAnonymised_purgeAfter_idx" ON "User"("isAnonymised", "purgeAfter");
