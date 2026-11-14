-- Client feedback point 4: the Edit Profile data points.
--
-- Additive only: every column is nullable or defaulted, so existing rows keep
-- their current values and nothing has to be backfilled. The list columns are
-- NOT NULL with an empty-array default because Prisma types a scalar list as
-- non-nullable; a NULL there would surface as a null where the contract promises
-- an array.

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "weightKg" INTEGER,
ADD COLUMN     "physicalStatus" TEXT,
ADD COLUMN     "languagesKnown" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hobbies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "favouriteMusic" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "favouriteFood" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "familyValue" TEXT,
ADD COLUMN     "familyType" TEXT,
ADD COLUMN     "familyStatus" TEXT,
ADD COLUMN     "nativePlace" TEXT,
ADD COLUMN     "brothersCount" INTEGER,
ADD COLUMN     "brothersMarriedCount" INTEGER,
ADD COLUMN     "sistersCount" INTEGER,
ADD COLUMN     "sistersMarriedCount" INTEGER;
