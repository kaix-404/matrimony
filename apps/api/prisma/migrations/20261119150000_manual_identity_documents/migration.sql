-- Manual identity review (D9 fallback).
--
-- Cashfree Secure ID refuses this deployment's IP addresses, so every account
-- was stuck at PENDING_VERIFICATION and `can_discover` was false for everybody.
-- A member can now upload a copy of their Aadhaar and an administrator decides,
-- reaching the same VERIFIED state the DigiLocker webhook writes.
--
-- `ADD VALUE` is safe inside Prisma's per-migration transaction on PostgreSQL 12+
-- and up, provided the new value is not used by a statement in the same file —
-- and nothing here writes a row.

ALTER TYPE "IdentityVerificationProvider" ADD VALUE 'MANUAL_DOCUMENT';

ALTER TABLE "IdentityVerification"
  ADD COLUMN "documentObjectKey" TEXT,
  ADD COLUMN "documentMimeType" TEXT,
  ADD COLUMN "documentSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedByAdminId" TEXT,
  ADD COLUMN "reviewNote" TEXT;
