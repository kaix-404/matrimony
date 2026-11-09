-- Master lists gain a group so one list can carry sections: education by
-- degree family, occupation by industry, sub-caste by religion. Uniqueness
-- moves to (list, group, value) because the client's own lists legitimately
-- repeat a label in two sections ("Manager" under Administration and under
-- Corporate Professionals) and repeat a sub-caste block per sect.
ALTER TABLE "MasterListValue" ADD COLUMN "groupLabel" TEXT NOT NULL DEFAULT '';

-- Sub-caste is chosen from the religion-scoped list, so it is stored as text
-- beside the religion it was picked under, like religion and mother tongue.
ALTER TABLE "Profile" ADD COLUMN "subCaste" TEXT;

DROP INDEX "MasterListValue_listKey_value_key";
CREATE UNIQUE INDEX "MasterListValue_listKey_groupLabel_value_key" ON "MasterListValue"("listKey", "groupLabel", "value");
