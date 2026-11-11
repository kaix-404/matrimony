-- Adding an email address is verified by a code sent to that mailbox. Its own
-- purpose keeps it from being interchangeable with a sign-in or number-change
-- code, exactly as CHANGE_MOBILE does for the number.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'CHANGE_EMAIL';

-- The address a code was issued for.
--
-- The row stays keyed by the account's mobile: that is how every other purpose
-- finds it, and the number is the login identity. This column is what binds a
-- code to one mailbox, so a code obtained for one address cannot be spent on
-- another.
ALTER TABLE "OtpRequest" ADD COLUMN IF NOT EXISTS "email" TEXT;

CREATE INDEX IF NOT EXISTS "OtpRequest_mobile_purpose_email_idx"
  ON "OtpRequest" ("mobile", "purpose", "email");
