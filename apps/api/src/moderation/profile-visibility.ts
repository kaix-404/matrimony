import { UserStatus } from '../prisma/prisma-client';

/**
 * The shape both the block and report paths project when they look a profile up
 * in order to decide whether the caller may act on it.
 */
export interface LivenessCandidate {
  deletedAt: Date | null;
  user: {
    deletedAt: Date | null;
    isAnonymised: boolean;
    status: UserStatus;
  };
}

/**
 * Whether a profile still identifies someone the app is willing to let a user
 * act on.
 *
 * Shared by block and report because the two must agree: if blocking a deleted
 * profile 404'd while reporting it filed a row, the moderation queue would fill
 * with complaints about accounts that no longer exist, and the difference
 * between the two endpoints would be a way to probe a profile that section 21
 * says must stop being reachable.
 *
 * A soft-deleted profile, a hard-deleted owner, an anonymised account and a
 * moderation-deleted account all collapse to the same "not found" at the call
 * site. None of them may be distinguished: the distinction is only interesting
 * to somebody confirming that a specific id was once real.
 */
export function isLiveProfile(profile: LivenessCandidate | null): profile is LivenessCandidate {
  if (!profile) return false;
  if (profile.deletedAt !== null) return false;
  if (profile.user.deletedAt !== null) return false;
  if (profile.user.isAnonymised) return false;
  return profile.user.status !== UserStatus.DELETED;
}
