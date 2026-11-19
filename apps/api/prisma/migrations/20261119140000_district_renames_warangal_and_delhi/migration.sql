-- The last of the client's district labels that no longer match what the state
-- prints: Telangana's second Warangal district is plain "Warangal" now that the
-- urban one is Hanumakonda, and three Delhi districts carried a double space from
-- the source file ("North East  Delhi"), which read wrong in the picker and on
-- every profile that had chosen one.
--
-- `Profile.district` holds the label as text, so the row and the profiles move
-- together. Renaming only the seed would leave the old label active beside the new
-- one, and a member could not re-select their own district.
--
-- Guarded per group: the unique index is (list, group, value), and an
-- administrator may already have added the corrected name under the same state.

UPDATE "MasterListValue" AS v
SET "value" = fix."new"
FROM (VALUES
  ('Warangal (Rural)', 'Warangal'),
  ('North East  Delhi', 'North East Delhi'),
  ('North West  Delhi', 'North West Delhi'),
  ('South West  Delhi', 'South West Delhi')
) AS fix("old", "new")
WHERE v."listKey" = 'DISTRICT'
  AND v."value" = fix."old"
  AND NOT EXISTS (
    SELECT 1 FROM "MasterListValue" AS taken
    WHERE taken."listKey" = 'DISTRICT'
      AND taken."groupLabel" = v."groupLabel"
      AND taken."value" = fix."new"
  );

UPDATE "Profile" SET "district" = 'Warangal' WHERE "district" = 'Warangal (Rural)';
UPDATE "Profile" SET "district" = 'North East Delhi' WHERE "district" = 'North East  Delhi';
UPDATE "Profile" SET "district" = 'North West Delhi' WHERE "district" = 'North West  Delhi';
UPDATE "Profile" SET "district" = 'South West Delhi' WHERE "district" = 'South West  Delhi';

-- Only the old labels: a renamed row now carries the corrected name and must stay
-- offered. Retiring matters when the corrected label already existed, so the
-- superseded row is kept for history but no longer shown.
UPDATE "MasterListValue"
SET "isActive" = false
WHERE "listKey" = 'DISTRICT'
  AND "value" IN ('Warangal (Rural)', 'North East  Delhi', 'North West  Delhi', 'South West  Delhi');
