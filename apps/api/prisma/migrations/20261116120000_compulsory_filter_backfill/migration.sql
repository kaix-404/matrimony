-- Compulsory filters become the single rule: only ticked preferences filter.
--
-- Every preference saved before the ticks existed has none, so under the new rule
-- those members' feeds would silently widen to everything their visibility
-- settings allow — the opposite of what they asked for. This backfills a tick on
-- every answer each row actually has, which reproduces today's filtering exactly
-- and leaves the member free to untick what they did not mean as a hard filter.
--
-- `annual_income` is included when a band is set even though the feed cannot
-- filter on it yet (income is free text on the profile, client instruction D3):
-- the tick records what the member asked for, so it starts working the day income
-- becomes structured instead of being silently dropped.

UPDATE "PartnerPreference"
SET "compulsoryFilters" = ARRAY_REMOVE(
  ARRAY[
    CASE WHEN "ageMin" IS NOT NULL OR "ageMax" IS NOT NULL THEN 'age' END,
    CASE WHEN cardinality("annualIncomeBands") > 0 THEN 'annual_income' END,
    CASE WHEN "preferredCity" IS NOT NULL THEN 'city' END,
    CASE WHEN "preferredCountry" IS NOT NULL THEN 'country' END,
    CASE WHEN cardinality("drinkingHabits") > 0 THEN 'drinking' END,
    CASE WHEN cardinality("eatingHabits") > 0 THEN 'eating' END,
    CASE WHEN "educationId" IS NOT NULL THEN 'education' END,
    CASE WHEN cardinality("employedIn") > 0 THEN 'employed_in' END,
    CASE WHEN "gender" <> 'ANY' THEN 'gender' END,
    CASE WHEN "heightMinCm" IS NOT NULL OR "heightMaxCm" IS NOT NULL THEN 'height' END,
    CASE WHEN cardinality("kujaDosham") > 0 THEN 'kuja_dosham' END,
    CASE WHEN "maritalStatus" IS NOT NULL THEN 'marital_status' END,
    CASE WHEN "motherTongue" IS NOT NULL THEN 'mother_tongue' END,
    CASE WHEN "professionId" IS NOT NULL THEN 'occupation' END,
    CASE WHEN cardinality("physicalStatus") > 0 THEN 'physical_status' END,
    CASE WHEN "religion" IS NOT NULL THEN 'religion' END,
    CASE WHEN cardinality("smokingHabits") > 0 THEN 'smoking' END,
    CASE WHEN "preferredState" IS NOT NULL THEN 'state' END,
    CASE WHEN "subCaste" IS NOT NULL THEN 'sub_caste' END
  ],
  NULL
)
-- Only rows that predate the feature. A row that already carries ticks was saved
-- by the screen, and overwriting it would re-add answers the member deliberately
-- left unticked.
WHERE cardinality("compulsoryFilters") = 0;
