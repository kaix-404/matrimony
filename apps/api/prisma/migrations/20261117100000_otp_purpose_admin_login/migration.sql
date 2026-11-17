-- SMS sign-in codes for administrators get a purpose of their own, so a code
-- minted for a member flow can never satisfy an administrator's second factor.
ALTER TYPE "OtpPurpose" ADD VALUE 'ADMIN_LOGIN';
