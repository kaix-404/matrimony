-- Phase 4. A webhook identifies a payment by its gateway order id and nothing
-- else, so the server needs to know which profile that payment was buying
-- before it can create the ContactUnlock. Nullable because a SETUP_FEE payment
-- has no target profile.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "targetProfileId" TEXT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_targetProfileId_fkey" FOREIGN KEY ("targetProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
