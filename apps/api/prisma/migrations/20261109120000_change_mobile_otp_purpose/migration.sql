-- The mobile number is the login identity, so moving an account to a new
-- number needs a code sent to that number. Its own purpose keeps it from
-- being interchangeable with a login code.
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'CHANGE_MOBILE';
