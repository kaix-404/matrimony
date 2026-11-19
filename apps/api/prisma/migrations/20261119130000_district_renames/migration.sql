-- Three districts were renamed after the client's list was assembled: Warangal
-- (Urban) became Hanumakonda in 2018, Hoshangabad became Narmadapuram in 2021,
-- and Ramanagara became Bengaluru South in May 2025.
--
-- `Profile.district` holds the label as text, so renaming the row alone would
-- leave every member on a district the picker no longer offers — they could not
-- re-select their own district from the form. The row and the profiles therefore
-- move together, and the row that is left behind is retired rather than deleted,
-- the same way the console's rename path treats a superseded value.
--
-- Guarded per group: the unique index is (list, group, value), and an
-- administrator may already have added the new name under the same state.

UPDATE "MasterListValue" AS v
SET "value" = fix."new"
FROM (VALUES
  ('Warangal (Urban)', 'Hanumakonda'),
  ('Ramanagara', 'Bengaluru South'),
  ('Hoshangabad', 'Narmadapuram')
) AS fix("old", "new")
WHERE v."listKey" = 'DISTRICT'
  AND v."value" = fix."old"
  AND NOT EXISTS (
    SELECT 1 FROM "MasterListValue" AS taken
    WHERE taken."listKey" = 'DISTRICT'
      AND taken."groupLabel" = v."groupLabel"
      AND taken."value" = fix."new"
  );

UPDATE "Profile" SET "district" = 'Hanumakonda' WHERE "district" = 'Warangal (Urban)';
UPDATE "Profile" SET "district" = 'Narmadapuram' WHERE "district" = 'Hoshangabad';
UPDATE "Profile" SET "district" = 'Bengaluru South' WHERE "district" = 'Ramanagara';

-- Only the old names: the renamed rows now carry the corrected labels and must
-- stay offered. Retiring a superseded row matters when the corrected label
-- already existed, so it is kept for history but no longer shown.
UPDATE "MasterListValue"
SET "isActive" = false
WHERE "listKey" = 'DISTRICT'
  AND "value" IN ('Warangal (Urban)', 'Hoshangabad', 'Ramanagara');
