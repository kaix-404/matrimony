-- Education and profession become partner preferences, referencing the same
-- master-list values the profile does. The lists repeat a label across sections
-- ("Manager" under Administration and under Corporate Professionals), so the
-- preference stores the id: filtering on the label would match the wrong rows.
ALTER TABLE "PartnerPreference" ADD COLUMN "educationId" TEXT;
ALTER TABLE "PartnerPreference" ADD COLUMN "professionId" TEXT;

-- Retiring a list value must not delete a member's saved preference; the row
-- keeps the preference but the picker stops offering it.
ALTER TABLE "PartnerPreference" ADD CONSTRAINT "PartnerPreference_educationId_fkey" FOREIGN KEY ("educationId") REFERENCES "MasterListValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerPreference" ADD CONSTRAINT "PartnerPreference_professionId_fkey" FOREIGN KEY ("professionId") REFERENCES "MasterListValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
