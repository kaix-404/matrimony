-- Client feedback point 4: the partner-preference rows the form was missing,
-- plus "Employed In" on the profile so that preference can match anything.
--
-- Additive only. The list columns are NOT NULL with an empty-array default
-- because Prisma types a scalar list as non-nullable; NULL there would surface as
-- a null where the contract promises a set.

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "employedIn" TEXT;

-- AlterTable
ALTER TABLE "PartnerPreference" ADD COLUMN     "physicalStatus" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "eatingHabits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "drinkingHabits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "smokingHabits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "kujaDosham" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "employedIn" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "annualIncomeBands" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "compulsoryFilters" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
