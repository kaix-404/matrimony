-- The client's state list predates three renames and one merger: Orissa became
-- Odisha in 2011, Pondicherry became Puducherry in 2006, Lakshwadeep was
-- misspelt for Lakshadweep, and Dadra & Nagar Haveli merged with Daman & Diu in
-- 2020 into a single union territory.
--
-- Each is a rename in place rather than a new row. `Profile.state`,
-- `Profile.district` and `PartnerPreference.preferredState` hold the label as
-- text, so inserting a corrected row would leave every existing profile pointing
-- at a label the picker no longer offers: the member would keep a state they
-- could not re-select, and a district whose group had disappeared. Renaming
-- keeps them attached, and retiring the row a member was moved off means nothing
-- is ever deleted.
--
-- The district rows move with their state, because the district picker is scoped
-- by the state label.

-- 1. The three renames. Skipped when the corrected label is already present —
--    an administrator may have added it from the console — so the unique
--    (list, group, value) index cannot be violated. The profiles below move
--    either way, so a pre-existing row is used rather than duplicated.
UPDATE "MasterListValue" AS v
SET "value" = fix."new"
FROM (VALUES
  ('Orissa', 'Odisha'),
  ('Pondicherry', 'Puducherry'),
  ('Lakshwadeep', 'Lakshadweep')
) AS fix("old", "new")
WHERE v."listKey" = 'STATE'
  AND v."value" = fix."old"
  AND NOT EXISTS (
    SELECT 1 FROM "MasterListValue" AS taken
    WHERE taken."listKey" = 'STATE' AND taken."value" = fix."new"
  );

UPDATE "Profile" SET "state" = 'Odisha' WHERE "state" = 'Orissa';
UPDATE "Profile" SET "state" = 'Puducherry' WHERE "state" = 'Pondicherry';
UPDATE "Profile" SET "state" = 'Lakshadweep' WHERE "state" = 'Lakshwadeep';

UPDATE "PartnerPreference" SET "preferredState" = 'Odisha' WHERE "preferredState" = 'Orissa';
UPDATE "PartnerPreference" SET "preferredState" = 'Puducherry' WHERE "preferredState" = 'Pondicherry';
UPDATE "PartnerPreference" SET "preferredState" = 'Lakshadweep' WHERE "preferredState" = 'Lakshwadeep';

-- 2. One union territory instead of two. The Dadra & Nagar Haveli row becomes the
--    merged UT in place (it comes first alphabetically, so it keeps the position
--    the list already shows); the Daman & Diu row is retired at the end.
UPDATE "MasterListValue"
SET "value" = 'Dadra & Nagar Haveli and Daman & Diu'
WHERE "listKey" = 'STATE'
  AND "value" = 'Dadra & Nagar Haveli'
  AND NOT EXISTS (
    SELECT 1 FROM "MasterListValue" AS taken
    WHERE taken."listKey" = 'STATE' AND taken."value" = 'Dadra & Nagar Haveli and Daman & Diu'
  );

UPDATE "Profile"
SET "state" = 'Dadra & Nagar Haveli and Daman & Diu'
WHERE "state" IN ('Dadra & Nagar Haveli', 'Daman & Diu');

UPDATE "PartnerPreference"
SET "preferredState" = 'Dadra & Nagar Haveli and Daman & Diu'
WHERE "preferredState" IN ('Dadra & Nagar Haveli', 'Daman & Diu');

-- 3. Districts follow their state's label. Silvassa, Daman and Diu land in one
--    group of three; no two merged groups share a district name, so the
--    (list, group, value) index still holds.
UPDATE "MasterListValue" SET "groupLabel" = 'Odisha' WHERE "listKey" = 'DISTRICT' AND "groupLabel" = 'Orissa';
UPDATE "MasterListValue" SET "groupLabel" = 'Puducherry' WHERE "listKey" = 'DISTRICT' AND "groupLabel" = 'Pondicherry';
UPDATE "MasterListValue" SET "groupLabel" = 'Lakshadweep' WHERE "listKey" = 'DISTRICT' AND "groupLabel" = 'Lakshwadeep';

UPDATE "MasterListValue"
SET "groupLabel" = 'Dadra & Nagar Haveli and Daman & Diu'
WHERE "listKey" = 'DISTRICT'
  AND "groupLabel" IN ('Dadra & Nagar Haveli', 'Daman & Diu');

-- 4. Retire whatever the renames left behind. A no-op on a clean database; it
--    matters when the corrected row already existed, so the superseded one is
--    kept for history but no longer offered.
UPDATE "MasterListValue"
SET "isActive" = false
WHERE "listKey" = 'STATE'
  AND "value" IN ('Orissa', 'Pondicherry', 'Lakshwadeep', 'Dadra & Nagar Haveli', 'Daman & Diu');

-- 5. States are shown in the client's order, which is alphabetical and is now one
--    row shorter. The seed only assigns a sort order when it creates a row, so
--    the old numbers would leave Ladakh tied with Kerala and the merged UT out of
--    place. Renumber from the labels themselves.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "value") AS position
  FROM "MasterListValue"
  WHERE "listKey" = 'STATE'
)
UPDATE "MasterListValue" AS v
SET "sortOrder" = ranked.position
FROM ranked
WHERE v."id" = ranked."id";
