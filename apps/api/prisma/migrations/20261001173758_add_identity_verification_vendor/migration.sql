-- CreateEnum
CREATE TYPE "IdentityVerificationVendor" AS ENUM ('CASHFREE');

-- AlterTable
ALTER TABLE "IdentityVerification" ADD COLUMN     "vendor" "IdentityVerificationVendor";
