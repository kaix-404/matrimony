-- AlterTable
ALTER TABLE "OtpRequest" ADD COLUMN     "consumedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "OtpRequest_mobile_purpose_status_consumedAt_idx" ON "OtpRequest"("mobile", "purpose", "status", "consumedAt");
