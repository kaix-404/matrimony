/**
 * Fixture profiles, so discovery and the unlock flow can be demonstrated.
 *
 * These are invented people. They exist to be browsed, previewed and unlocked in
 * a deployment where the only real accounts are the client's own test members —
 * without them the feed is empty and nothing downstream of it can be tried.
 *
 * Two rules make them safe to have in a shared database:
 *
 *   1. They are created by `prisma/seed.ts` and never by the application, so a
 *      deployment that does not ask for them never gets them
 *      (`SEED_DEMO_PROFILES`, see docs/ops/demo-profiles.md).
 *   2. Every one of them says so in its own about-me text, and every mobile
 *      number is in the reserved `90000000xx` block, so an unlock cannot hand
 *      anyone a real person's number.
 *
 * The seed creates a fixture once and then leaves it alone. Moderation state is
 * the application's to own: re-running must not resurrect a profile that an
 * administrator suspended while testing moderation, or a fixture that was
 * deliberately removed with `SEED_DEMO_PROFILES=remove`.
 */

import type { PrismaClient } from '../src/prisma/prisma-client';

/**
 * Reserved for fixtures. Nothing outside this file may allocate these numbers,
 * and `removeDemoProfiles` deletes by this prefix, so the range is the identity
 * of the demo set.
 */
export const DEMO_MOBILE_PREFIX = '90000000';

/** Spelled out in every fixture so a real member who stumbles in can tell. */
export const DEMO_MARKER = 'Demo profile used to test browsing and unlocking.';

export type DemoBand =
  | 'BELOW_2CR'
  | 'TWO_CR_TO_FIVE_CR'
  | 'FIVE_CR_TO_TEN_CR'
  | 'ABOVE_10CR';

export type DemoGender = 'MALE' | 'FEMALE';

export interface DemoProfile {
  /** In the reserved block: 9000000001, 9000000002, ... */
  mobile: string;
  firstName: string;
  lastName: string;
  gender: DemoGender;
  /** ISO date, at least 18 years before the fixtures were written. */
  dateOfBirth: string;
  band: DemoBand;
  heightCm: number;
  maritalStatus: 'NEVER_MARRIED' | 'DIVORCED' | 'WIDOWED';
  religion: string;
  motherTongue: string;
  city: string;
  state: string;
  company: string;
  annualIncome: string;
  workLocation: string;
  aboutMe: string;
  familyDescription: string;
}

/**
 * Three per band, both genders, so whichever band a test member registered in
 * already has a feed, and widening the discovery setting in the app adds the
 * other nine rather than duplicating three.
 *
 * Education and profession are left unset on purpose: they are master-list
 * backed, and the master lists are client-supplied (the seed deliberately seeds
 * the containers only). Inventing values there would mean inventing rows the
 * business never approved.
 */
export const DEMO_PROFILES: readonly DemoProfile[] = [
  {
    mobile: '9000000001',
    firstName: 'Aarti',
    lastName: 'Sharma',
    gender: 'FEMALE',
    dateOfBirth: '1997-04-18',
    band: 'BELOW_2CR',
    heightCm: 160,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Hindi',
    city: 'Jaipur',
    state: 'Rajasthan',
    company: 'School teacher',
    annualIncome: 'Below 5 lakh',
    workLocation: 'Jaipur',
    aboutMe:
      'Demo profile used to test browsing and unlocking. I teach primary school, read a lot, and would like a partner who is kind before anything else.',
    familyDescription: 'Parents in Jaipur; one younger brother, still studying.',
  },
  {
    mobile: '9000000002',
    firstName: 'Rohan',
    lastName: 'Patel',
    gender: 'MALE',
    dateOfBirth: '1994-11-02',
    band: 'BELOW_2CR',
    heightCm: 174,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Gujarati',
    city: 'Ahmedabad',
    state: 'Gujarat',
    company: 'Textile trader',
    annualIncome: 'Below 5 lakh',
    workLocation: 'Ahmedabad',
    aboutMe:
      'Demo profile used to test browsing and unlocking. Family business by day, cricket on Sundays. Looking for someone I can talk to easily.',
    familyDescription: 'Joint family in Ahmedabad, three generations.',
  },
  {
    mobile: '9000000003',
    firstName: 'Sneha',
    lastName: 'Iyer',
    gender: 'FEMALE',
    dateOfBirth: '1999-02-09',
    band: 'BELOW_2CR',
    heightCm: 157,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Tamil',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    company: 'Diagnostic lab technician',
    annualIncome: 'Below 5 lakh',
    workLocation: 'Coimbatore',
    aboutMe:
      'Demo profile used to test browsing and unlocking. I work in a diagnostic lab, and I spend my weekends with my cousins.',
    familyDescription: 'Parents and a younger sister in Coimbatore.',
  },
  {
    mobile: '9000000004',
    firstName: 'Meera',
    lastName: 'Nair',
    gender: 'FEMALE',
    dateOfBirth: '1995-07-27',
    band: 'TWO_CR_TO_FIVE_CR',
    heightCm: 163,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Malayalam',
    city: 'Kochi',
    state: 'Kerala',
    company: 'Chartered accountancy practice',
    annualIncome: '15\u201320 lakh',
    workLocation: 'Kochi',
    aboutMe:
      'Demo profile used to test browsing and unlocking. I am a chartered accountant, I swim most mornings, and I am close to my family.',
    familyDescription: 'Parents in Kochi; older sister married and in Bengaluru.',
  },
  {
    mobile: '9000000005',
    firstName: 'Vikram',
    lastName: 'Reddy',
    gender: 'MALE',
    dateOfBirth: '1992-01-14',
    band: 'TWO_CR_TO_FIVE_CR',
    heightCm: 178,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Telugu',
    city: 'Hyderabad',
    state: 'Telangana',
    company: 'Software architect',
    annualIncome: '20\u201325 lakh',
    workLocation: 'Hyderabad',
    aboutMe:
      'Demo profile used to test browsing and unlocking. Architect by trade, amateur cook, reasonably good at both.',
    familyDescription: 'Parents in Hyderabad; one brother in the United States.',
  },
  {
    mobile: '9000000006',
    firstName: 'Divya',
    lastName: 'Fernandes',
    gender: 'FEMALE',
    dateOfBirth: '1998-09-05',
    band: 'TWO_CR_TO_FIVE_CR',
    heightCm: 165,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Christian',
    motherTongue: 'Konkani',
    city: 'Mangaluru',
    state: 'Karnataka',
    company: 'Hospital administrator',
    annualIncome: '10\u201315 lakh',
    workLocation: 'Mangaluru',
    aboutMe:
      'Demo profile used to test browsing and unlocking. I run the front office of a hospital, sing in a choir, and prefer long conversations to short ones.',
    familyDescription: 'Parents and two siblings, all in coastal Karnataka.',
  },
  {
    mobile: '9000000007',
    firstName: 'Kavya',
    lastName: 'Menon',
    gender: 'FEMALE',
    dateOfBirth: '1994-03-21',
    band: 'FIVE_CR_TO_TEN_CR',
    heightCm: 168,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Malayalam',
    city: 'Bengaluru',
    state: 'Karnataka',
    company: 'Investment bank',
    annualIncome: '30\u201340 lakh',
    workLocation: 'Bengaluru',
    aboutMe:
      'Demo profile used to test browsing and unlocking. I work in an investment bank and would like a partner with their own ambitions.',
    familyDescription: 'Parents retired in Thiruvananthapuram; one brother in Dubai.',
  },
  {
    mobile: '9000000008',
    firstName: 'Arjun',
    lastName: 'Chopra',
    gender: 'MALE',
    dateOfBirth: '1991-06-30',
    band: 'FIVE_CR_TO_TEN_CR',
    heightCm: 181,
    maritalStatus: 'DIVORCED',
    religion: 'Hindu',
    motherTongue: 'Punjabi',
    city: 'Delhi',
    state: 'Delhi',
    company: 'Real estate developer',
    annualIncome: '35\u201345 lakh',
    workLocation: 'Delhi',
    aboutMe:
      'Demo profile used to test browsing and unlocking. Divorced, no children, and honest about it up front. Family business, my own decisions.',
    familyDescription: 'Parents in Delhi; one sister in Chandigarh.',
  },
  {
    mobile: '9000000009',
    firstName: 'Isha',
    lastName: 'Kulkarni',
    gender: 'FEMALE',
    dateOfBirth: '1996-12-11',
    band: 'FIVE_CR_TO_TEN_CR',
    heightCm: 162,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Marathi',
    city: 'Pune',
    state: 'Maharashtra',
    company: 'Product designer',
    annualIncome: '20\u201325 lakh',
    workLocation: 'Pune',
    aboutMe:
      'Demo profile used to test browsing and unlocking. Product designer, part-time potter, and very serious about filter coffee.',
    familyDescription: 'Parents in Pune, both academics; one elder brother.',
  },
  {
    mobile: '9000000010',
    firstName: 'Ananya',
    lastName: 'Rao',
    gender: 'FEMALE',
    dateOfBirth: '1993-08-16',
    band: 'ABOVE_10CR',
    heightCm: 170,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Kannada',
    city: 'Bengaluru',
    state: 'Karnataka',
    company: 'Family manufacturing group',
    annualIncome: 'Above 50 lakh',
    workLocation: 'Bengaluru',
    aboutMe:
      'Demo profile used to test browsing and unlocking. I work in the family manufacturing business and would like a partner who has a life of their own.',
    familyDescription: 'Joint family in Bengaluru; the business is third generation.',
  },
  {
    mobile: '9000000011',
    firstName: 'Siddharth',
    lastName: 'Bajaj',
    gender: 'MALE',
    dateOfBirth: '1990-05-23',
    band: 'ABOVE_10CR',
    heightCm: 183,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Hindi',
    city: 'Mumbai',
    state: 'Maharashtra',
    company: 'Private equity',
    annualIncome: 'Above 50 lakh',
    workLocation: 'Mumbai',
    aboutMe:
      'Demo profile used to test browsing and unlocking. I invest for a living, sail badly, and would rather be judged by my manners than my portfolio.',
    familyDescription: 'Parents in Mumbai; one sister, married, in London.',
  },
  {
    mobile: '9000000012',
    firstName: 'Riya',
    lastName: 'Singh',
    gender: 'FEMALE',
    dateOfBirth: '1995-10-08',
    band: 'ABOVE_10CR',
    heightCm: 166,
    maritalStatus: 'NEVER_MARRIED',
    religion: 'Hindu',
    motherTongue: 'Hindi',
    city: 'Gurugram',
    state: 'Haryana',
    company: 'Corporate law firm',
    annualIncome: 'Above 50 lakh',
    workLocation: 'Gurugram',
    aboutMe:
      'Demo profile used to test browsing and unlocking. Corporate lawyer, early riser, and a fairly good badminton player.',
    familyDescription: 'Parents in Gurugram; elder sister in Singapore.',
  },
];

/** Every band the fixtures occupy, so the seed can grant visibility in each. */
export const DEMO_BANDS: readonly DemoBand[] = [
  'BELOW_2CR',
  'TWO_CR_TO_FIVE_CR',
  'FIVE_CR_TO_TEN_CR',
  'ABOVE_10CR',
];

function dob(value: string): Date {
  // Stored as a @db.Date column; midnight UTC keeps the calendar day stable
  // regardless of the server's timezone.
  return new Date(`${value}T00:00:00.000Z`);
}

export interface DemoSeedResult {
  created: number;
  existing: number;
}

/**
 * Creates any missing fixtures.
 *
 * Existing rows get their descriptive fields refreshed (so a copy fix reaches a
 * database that already has them) but keep their lifecycle columns: status,
 * verification, the fee and the profile's moderation state are the application's
 * to change, and a boot must not undo an administrator's decision.
 */
export async function seedDemoProfiles(prisma: PrismaClient): Promise<DemoSeedResult> {
  const now = new Date();
  const result: DemoSeedResult = { created: 0, existing: 0 };

  for (const fixture of DEMO_PROFILES) {
    const existing = await prisma.user.findUnique({
      where: { mobile: fixture.mobile },
      select: { id: true },
    });

    const user =
      existing ??
      (await prisma.user.create({
        data: {
          mobile: fixture.mobile,
          networthCategory: fixture.band,
          // Verified, paid and active: these are the eligibility gates discovery
          // checks, and a fixture that cannot be discovered is not a fixture.
          status: 'ACTIVE',
          isPhoneVerified: true,
          identityVerifiedAt: now,
          setupFeePaidAt: now,
        },
        select: { id: true },
      }));

    if (existing) {
      result.existing += 1;
    } else {
      result.created += 1;
    }

    const profile = {
      firstName: fixture.firstName,
      lastName: fixture.lastName,
      gender: fixture.gender,
      dateOfBirth: dob(fixture.dateOfBirth),
      heightCm: fixture.heightCm,
      maritalStatus: fixture.maritalStatus,
      religion: fixture.religion,
      motherTongue: fixture.motherTongue,
      country: 'IN',
      state: fixture.state,
      city: fixture.city,
      company: fixture.company,
      annualIncome: fixture.annualIncome,
      workLocation: fixture.workLocation,
      aboutMe: fixture.aboutMe,
      familyDescription: fixture.familyDescription,
    };

    await prisma.profile.upsert({
      where: { userId: user.id },
      update: profile,
      create: {
        ...profile,
        userId: user.id,
        // Approved on creation only: a re-seed must not un-suspend a profile an
        // administrator suspended while testing moderation.
        status: 'APPROVED',
        visibility: 'ACTIVE',
        approvedAt: now,
      },
    });

    // The default visibility rule is "my own band only". The fixtures instead
    // opt in to every band, so widening discovery in the app surfaces all twelve
    // rather than three — which is what makes the bands worth demonstrating.
    await prisma.partnerPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, gender: 'ANY', visibilityConfigured: true },
    });

    await prisma.userVisibilityCategory.createMany({
      data: DEMO_BANDS.map((category) => ({ userId: user.id, category })),
      skipDuplicates: true,
    });
  }

  return result;
}

/**
 * Removes every fixture, leaving real accounts untouched.
 *
 * Unlocks are deleted first: `ContactUnlock.profile` is `onDelete: Restrict`
 * precisely so a paid unlock cannot be orphaned, and that rule applies to a
 * fixture too. The payment rows survive with `targetProfileId` set to null,
 * because a client testing the flow will have made one and it is still a real
 * payment record.
 */
export async function removeDemoProfiles(prisma: PrismaClient): Promise<number> {
  const users = await prisma.user.findMany({
    where: { mobile: { startsWith: DEMO_MOBILE_PREFIX } },
    select: { id: true },
  });
  if (users.length === 0) {
    return 0;
  }

  const ids = users.map((user) => user.id);
  await prisma.contactUnlock.deleteMany({ where: { profile: { userId: { in: ids } } } });
  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return deleted.count;
}
