-- Sub-caste becomes a partner preference, next to religion and mother tongue.
-- Stored as the label, not a MasterListValue id: the list is religion-scoped and
-- is editable by admins, so an id would let a rename silently change what a
-- saved preference means, and a retired id would stop matching anything.
ALTER TABLE "PartnerPreference" ADD COLUMN "subCaste" TEXT;
