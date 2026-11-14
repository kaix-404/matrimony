import { Share } from 'react-native';

/**
 * Sharing a profile.
 *
 * The link is the app's own deep link (`networth-matrimony://member/<id>`), the
 * same route the feed opens, so a recipient who has the app lands on the profile
 * page and one who does not is told the app exists. There is no public web page
 * for a member: a URL that rendered a profile without a session would be a
 * second, unauthenticated copy of section 12's scoping rules.
 *
 * The name is passed only when the sharer is entitled to it. A locked preview
 * has no name, and a share sheet that filled one in would hand every member a
 * way to redistribute exactly what section 13 withholds until payment — so a
 * locked profile is shared as "this profile".
 */
export function profileLink(profileId: string): string {
  return `networth-matrimony://member/${profileId}`;
}

export async function shareProfile(options: {
  profileId: string;
  /** Omitted for a profile whose name the sharer has not unlocked. */
  name?: string | null;
  /** The sharer's own profile, which reads differently. */
  own?: boolean;
}): Promise<void> {
  const link = profileLink(options.profileId);
  const message = options.own
    ? `I am on Networth Matrimony. Here is my profile: ${link}`
    : options.name
      ? `Have a look at ${options.name}'s profile on Networth Matrimony: ${link}`
      : `Have a look at this profile on Networth Matrimony: ${link}`;

  try {
    await Share.share({ message, title: 'Networth Matrimony' });
  } catch {
    // Dismissing the sheet is a normal outcome, and on web `navigator.share`
    // may not exist at all. Neither is an error worth a message.
  }
}
