-- District as a data point: a grouped DISTRICT master-list value, scoped by
-- the profile's state. Nullable: existing profiles have no district yet.
ALTER TABLE "Profile" ADD COLUMN "district" TEXT;
