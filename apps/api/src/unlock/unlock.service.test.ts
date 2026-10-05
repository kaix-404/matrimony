import { FrozenClock } from '../common/clock/clock.service';
import { UnlockService } from './unlock.service';
import {
  ExpiredUnlockResponseSchema,
  HIDDEN_BEFORE_PAYMENT,
  LockedProfileResponseSchema,
  UnlockListResponseSchema,
  UnlockedProfileResponseSchema,
} from '@matrimony/shared';

/**
 * The enforcement tests.
 *
 * These are the tests that decide whether an unlock means anything. The payment
 * tests prove money was taken safely; nothing else in the codebase reads the
 * `ContactUnlock` row, so if `view` here is wrong, a buyer pays and sees a
 * paywall forever — or worse, sees contact they never bought.
 *
 * Responses are validated against the shared schemas rather than spot-checked,
 * because the schemas are the client contract. An earlier defect returned
 * `first_name: ''` on an idempotent replay, which satisfied every hand-written
 * expectation and would have been rejected by the real client.
 */

const VIEWER = 'user_viewer';
const TARGET_OWNER = 'user_target';
const PROFILE = 'profile_target';
const NOW = '2026-10-04T12:00:00.000Z';
/** The unlock window is 24 hours. */
const WINDOW_MS = 24 * 60 * 60 * 1000;

type ProfileRow = Record<string, unknown>;

function profile(overrides: ProfileRow = {}): ProfileRow {
  return {
    id: PROFILE,
    userId: TARGET_OWNER,
    status: 'APPROVED',
    visibility: 'ACTIVE',
    deletedAt: null,
    firstName: 'Ananya',
    lastName: 'Sharma',
    gender: 'FEMALE',
    dateOfBirth: new Date('1994-05-20T00:00:00.000Z'),
    timeOfBirth: '07:30',
    placeOfBirth: 'Pune',
    heightCm: 165,
    religion: 'Hindu',
    motherTongue: 'Marathi',
    swagotra: 'Kashyap',
    maternalGothra: 'Bharadwaj',
    rashi: 'Kanya',
    nakshatra: 'Hasta',
    gan: 'Manushya',
    manglikStatus: 'No',
    company: 'Infosys',
    annualIncome: '18,00,000',
    workLocation: 'Pune',
    fathersOccupation: 'Engineer',
    mothersOccupation: 'Teacher',
    siblings: 'One',
    familyLocation: 'Pune',
    familyDescription: 'Well off family',
    foodPreference: 'Vegetarian',
    smoking: 'No',
    drinking: 'No',
    aboutMe: 'Reader and trekker.',
    country: 'IN',
    state: 'Maharashtra',
    city: 'Pune',
    communityValue: { value: 'Marathi' },
    educationValue: { value: 'Master' },
    professionValue: { value: 'Software Engineer' },
    user: {
      id: TARGET_OWNER,
      networthCategory: 'B',
      mobile: '919876543210',
      isAnonymised: false,
      deletedAt: null,
      status: 'ACTIVE',
      blocksInitiated: [],
      blockedBy: [],
    },
    ...overrides,
  };
}

/** An unlock row, defaulting to a window that is still open. */
function unlock(overrides: Record<string, unknown> = {}) {
  const at = new Date(NOW);
  return {
    id: 'unlock_1',
    userId: VIEWER,
    profileId: PROFILE,
    paymentId: 'pay_1',
    status: 'ACTIVE',
    unlockedAt: at,
    unlockExpiresAt: new Date(at.getTime() + WINDOW_MS),
    revokedAt: null,
    revokedReason: null,
    supersededByEvent: null,
    createdAt: at,
    ...overrides,
  };
}

function makeService(
  opts: {
    now?: string;
    profiles?: ProfileRow[];
    photos?: Record<string, unknown>[];
    unlocks?: Record<string, unknown>[];
    discoverable?: boolean;
    signable?: boolean;
    pricing?: boolean;
  } = {},
) {
  const clock = new FrozenClock(new Date(opts.now ?? NOW));

  const rows = opts.profiles ?? [profile()];
  const unlocks = opts.unlocks ?? [];

  const prisma = {
    profile: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((p) => p.id === where.id) ?? null,
    },
    profilePhoto: {
      findMany: async () => opts.photos ?? [],
    },
    contactUnlock: {
      findFirst: async ({ where }: { where: { userId: string; profileId: string } }) =>
        unlocks.find((u) => u.userId === where.userId && u.profileId === where.profileId) ?? null,
      findMany: async () =>
        unlocks.map((u) => ({
          ...u,
          // The list resolves each unlock's target; a row whose profile is gone
          // keeps the unlock but resolves to nothing.
          profile:
            rows.find((p) => p.id === u.profileId) ??
            ({
              firstName: 'Other',
              lastName: 'Person',
              status: 'APPROVED',
              visibility: 'ACTIVE',
              deletedAt: null,
            } as ProfileRow),
        })),
      updateMany: async ({
        where,
      }: {
        where: { status: string; unlockExpiresAt: { lte: Date } };
      }) => {
        const at = clock.now();
        const matched = unlocks.filter(
          (u) => u.status === where.status && (u.unlockExpiresAt as Date).getTime() <= at.getTime(),
        );
        for (const u of matched) u.status = 'EXPIRED';
        return { count: matched.length };
      },
    },
    pricingConfig: {
      findFirst: async () =>
        opts.pricing === false ? null : { baseAmount: '1000.00', gstRate: 0.18 },
    },
  };

  const storage = {
    presignDownload: async (key: string) =>
      opts.signable === false ? null : `https://s3.test/${key}`,
  };

  const preferences = { isDiscoverableBy: async () => opts.discoverable ?? true };

  return {
    clock,
    prisma,
    unlocks,
    service: new UnlockService(prisma as never, clock, storage as never, preferences as never),
  };
}

/** Every key name anywhere in a payload, so a nested leak cannot hide. */
function allKeys(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, found));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      allKeys(v, found);
    }
  }
  return found;
}

const PHOTO = {
  id: 'photo_1',
  objectKey: 'photos/1.jpg',
  widthPx: 800,
  heightPx: 1000,
  isPrimary: true,
  photoType: 'SINGLE',
};

describe('UnlockService', () => {
  describe('a profile the viewer has not unlocked', () => {
    it('returns the paywall preview, not a refusal', async () => {
      const { service } = makeService();

      const result = await service.view(VIEWER, PROFILE);

      // Section 38: a 403 would make the app reconstruct the price from an error.
      expect(LockedProfileResponseSchema.parse(result)).toEqual(result);
      expect(result.profile_locked).toBe(true);
      expect(result.unlock_price.total_amount).toBe('1180.00');
      expect(result).not.toHaveProperty('previously_unlocked');
    });

    it('leaks none of the fields section 13 hides before payment', async () => {
      const { service } = makeService();

      const keys = allKeys(await service.view(VIEWER, PROFILE));

      // The list exists in the contract precisely so a test can assert this.
      // Jest's `expect` takes no message argument, so the offending key is
      // surfaced by asserting on the filtered list instead.
      for (const hidden of HIDDEN_BEFORE_PAYMENT) {
        expect([...keys].filter((k) => k === hidden)).toEqual([]);
      }
    });

    it('shows the preview-visible fields the client was promised', async () => {
      const { service } = makeService();

      const result = await service.view(VIEWER, PROFILE);

      // A1 makes the full DOB visible, which makes age unavoidable; A2 moved
      // religion onto the free preview and community behind payment.
      expect(result).toHaveProperty('date_of_birth', '1994-05-20');
      expect(result).toHaveProperty('religion', 'Hindu');
      expect(result).toHaveProperty('swagotra', 'Kashyap');
      expect(result).not.toHaveProperty('community');
    });

    it('computes age from server time, not the birth year alone', async () => {
      // Born 20 May 1994; on 4 Oct 2026 the birthday has passed.
      const { service } = makeService();
      expect((await service.view(VIEWER, PROFILE)) as { age: number }).toHaveProperty('age', 32);

      // One day before the 2026 birthday, the same profile is 31.
      const justBefore = makeService({ now: '2026-05-19T00:00:00.000Z' });
      expect((await justBefore.service.view(VIEWER, PROFILE)) as { age: number }).toHaveProperty(
        'age',
        31,
      );
    });

    it('drops a photo whose URL cannot be signed rather than sending a null', async () => {
      const { service } = makeService({ photos: [PHOTO], signable: false });

      const result = await service.view(VIEWER, PROFILE);

      expect(result.photos).toEqual([]);
      // The shape still has to satisfy the contract with no photos at all.
      expect(LockedProfileResponseSchema.parse(result)).toEqual(result);
    });

    it('fails closed rather than showing a price it cannot quote', async () => {
      const { service } = makeService({ pricing: false });

      // A zero or invented amount would be worse than an error: it would be
      // charged.
      await expect(service.view(VIEWER, PROFILE)).rejects.toThrow('Profile not found');
    });
  });

  describe('a profile the viewer has unlocked', () => {
    it('returns contact and the full profile inside the window', async () => {
      const { service } = makeService({ photos: [PHOTO], unlocks: [unlock()] });

      const result = await service.view(VIEWER, PROFILE);

      expect(UnlockedProfileResponseSchema.parse(result)).toEqual(result);
      expect(result.profile_locked).toBe(false);
      if (result.profile_locked) throw new Error('expected an unlocked response');
      expect(result.contact.mobile).toBe('919876543210');
      expect(result.contact.is_available).toBe(true);
      expect(result.full_profile.first_name).toBe('Ananya');
      expect(result.full_profile.community).toBe('Marathi');
      expect(result.unlock_expires_at).toBe('2026-10-05T12:00:00.000Z');
      expect(result.photos[0].url).toBe('https://s3.test/photos/1.jpg');
    });

    it('resolves master-list values to their labels, not raw ids', async () => {
      const { service } = makeService({
        unlocks: [unlock()],
        profiles: [
          profile({
            communityValue: { value: 'Marathi' },
            educationValue: { value: 'Master' },
            professionValue: { value: 'Software Engineer' },
          }),
        ],
      });

      const result = await service.view(VIEWER, PROFILE);

      if (result.profile_locked) throw new Error('expected an unlocked response');
      expect(result.full_profile).toMatchObject({
        community: 'Marathi',
        education: 'Master',
        profession: 'Software Engineer',
      });
    });

    it("withholds an anonymised owner's contact and says why", async () => {
      const { service } = makeService({
        unlocks: [unlock()],
        profiles: [
          profile({
            user: {
              id: TARGET_OWNER,
              networthCategory: 'B',
              mobile: '',
              isAnonymised: true,
              deletedAt: new Date('2026-09-01T00:00:00.000Z'),
              status: 'DELETED',
              blocksInitiated: [],
              blockedBy: [],
            },
          }),
        ],
      });

      const result = await service.view(VIEWER, PROFILE);

      if (result.profile_locked) throw new Error('expected an unlocked response');
      // Section 21: reported unavailable with a reason, not as an empty string
      // the app would render as "not provided".
      expect(result.contact).toEqual({
        mobile: '',
        is_available: false,
        hidden_reason: 'This profile is no longer active.',
      });
    });
  });

  describe('once the window closes', () => {
    it('withholds contact the moment the unlock expires', async () => {
      const { service, clock } = makeService({ unlocks: [unlock()] });
      await service.view(VIEWER, PROFILE);

      clock.advance(WINDOW_MS);

      const result = await service.view(VIEWER, PROFILE);

      expect(result.profile_locked).toBe(true);
      expect(allKeys(result).has('contact')).toBe(false);
      expect(allKeys(result).has('mobile')).toBe(false);
      expect(result).toHaveProperty('previously_unlocked', true);
    });

    it('keeps contact available until the window actually closes', async () => {
      const { service, clock } = makeService({ unlocks: [unlock()] });

      clock.advance(WINDOW_MS - 1_000);

      expect((await service.view(VIEWER, PROFILE)).profile_locked).toBe(false);
    });

    it('marks an expired unlock as previously unlocked rather than as a first visit', async () => {
      const { service } = makeService({
        unlocks: [
          unlock({ status: 'EXPIRED', unlockExpiresAt: new Date('2026-10-03T00:00:00.000Z') }),
        ],
      });

      const result = await service.view(VIEWER, PROFILE);

      // Section 38: the app can show "your access ended" copy, not a paywall.
      expect(result).toHaveProperty('previously_unlocked', true);
      // The locked preview plus exactly one extra flag. `previously_unlocked`
      // has its own schema because the locked one is strict.
      expect(ExpiredUnlockResponseSchema.parse(result)).toEqual(result);
    });

    it('refuses contact for a revoked unlock', async () => {
      const { service } = makeService({
        unlocks: [unlock({ status: 'REVOKED', revokedAt: new Date(NOW), revokedReason: 'refund' })],
      });

      const result = await service.view(VIEWER, PROFILE);

      // REVOKED must not be revived by a live-looking expiry timestamp.
      expect(result.profile_locked).toBe(true);
      expect(allKeys(result).has('contact')).toBe(false);
    });

    it('ignores an unlock belonging to somebody else', async () => {
      const { service } = makeService({ unlocks: [unlock({ userId: 'user_other' })] });

      expect((await service.view(VIEWER, PROFILE)).profile_locked).toBe(true);
    });

    it('ignores an unlock for a different profile', async () => {
      const { service } = makeService({ unlocks: [unlock({ profileId: 'profile_other' })] });

      expect((await service.view(VIEWER, PROFILE)).profile_locked).toBe(true);
    });
  });

  describe('who may be looked at', () => {
    it('hides a profile from its own owner', async () => {
      const { service } = makeService({ profiles: [profile({ userId: VIEWER })] });

      await expect(service.view(VIEWER, PROFILE)).rejects.toThrow('Profile not found');
    });

    it.each([
      ['paused', { visibility: 'PAUSED' }],
      ['deleted', { deletedAt: new Date('2026-09-01T00:00:00.000Z') }],
      ['unapproved', { status: 'PENDING' }],
    ])('hides a %s profile', async (_label, overrides) => {
      const { service } = makeService({ profiles: [profile(overrides)] });

      await expect(service.view(VIEWER, PROFILE)).rejects.toThrow('Profile not found');
    });

    it("hides a profile outside the viewer's visibility scope", async () => {
      const { service } = makeService({ discoverable: false });

      await expect(service.view(VIEWER, PROFILE)).rejects.toThrow('Profile not found');
    });

    it('hides a missing profile with the same 404, so ids cannot be probed', async () => {
      const { service } = makeService({ profiles: [] });

      await expect(service.view(VIEWER, 'profile_nope')).rejects.toThrow('Profile not found');
    });

    it('hides a blocked profile even when an unlock is active', async () => {
      const { service } = makeService({
        unlocks: [unlock()],
        profiles: [
          profile({
            user: {
              id: TARGET_OWNER,
              networthCategory: 'B',
              mobile: '919876543210',
              isAnonymised: false,
              deletedAt: null,
              status: 'ACTIVE',
              blocksInitiated: [{ blockedId: VIEWER }],
              blockedBy: [],
            },
          }),
        ],
      });

      // A block outranks a paid unlock. Checking the unlock first would let a
      // blocked pair keep reading a profile the blocker asked to be left alone.
      await expect(service.view(VIEWER, PROFILE)).rejects.toThrow('Profile not found');
    });

    it('hides a profile that blocked the viewer', async () => {
      const { service } = makeService({
        unlocks: [unlock()],
        profiles: [
          profile({
            user: {
              id: TARGET_OWNER,
              networthCategory: 'B',
              mobile: '919876543210',
              isAnonymised: false,
              deletedAt: null,
              status: 'ACTIVE',
              blocksInitiated: [],
              blockedBy: [{ blockerId: VIEWER }],
            },
          }),
        ],
      });

      await expect(service.view(VIEWER, PROFILE)).rejects.toThrow('Profile not found');
    });
  });

  describe("the caller's own unlocks", () => {
    it('lists an active unlock with the name and time remaining', async () => {
      const { service } = makeService({
        unlocks: [
          unlock(),
          {
            ...unlock(),
            id: 'unlock_2',
            profileId: 'profile_two',
            unlockedAt: new Date('2026-10-04T11:00:00.000Z'),
          },
        ],
      });

      const result = UnlockListResponseSchema.parse(await service.listUnlocks(VIEWER));

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toEqual({
        profile_id: PROFILE,
        display_name: 'Ananya Sharma',
        status: 'ACTIVE',
        unlocked_at: NOW,
        unlock_expires_at: '2026-10-05T12:00:00.000Z',
        remaining_ms: WINDOW_MS,
      });
    });

    it('stops disclosing the name once the unlock has expired', async () => {
      const { service } = makeService({
        unlocks: [unlock({ unlockExpiresAt: new Date('2026-10-03T00:00:00.000Z') })],
      });

      const result = await service.listUnlocks(VIEWER);

      // The list is reachable after expiry, so a lingering name would re-disclose
      // a section 13 field on every page load.
      expect(result.items[0]).toMatchObject({ display_name: null, status: 'EXPIRED' });
      expect(result.items[0].remaining_ms).toBe(0);
    });

    it('reports a stale ACTIVE row as expired, because that is the truth', async () => {
      const { service } = makeService({
        unlocks: [unlock({ unlockExpiresAt: new Date('2026-10-03T00:00:00.000Z') })],
      });

      expect((await service.listUnlocks(VIEWER)).items[0].status).toBe('EXPIRED');
    });
  });

  describe('closing out expired unlocks', () => {
    it('expires only the rows whose window has passed', async () => {
      const past = new Date('2026-10-03T00:00:00.000Z');
      const future = new Date('2026-10-05T00:00:00.000Z');
      const rows = [
        unlock({ id: 'stale', unlockExpiresAt: past }),
        unlock({ id: 'live', unlockExpiresAt: future }),
        unlock({ id: 'revoked', status: 'REVOKED', unlockExpiresAt: past }),
      ];
      const { service } = makeService({ unlocks: rows });

      const count = await service.expireDue();

      expect(count).toBe(1);
      expect(rows.map((r) => r.status)).toEqual(['EXPIRED', 'ACTIVE', 'REVOKED']);
    });

    it('changes nothing on a second pass, so a retry cannot double-count', async () => {
      const { service } = makeService({
        unlocks: [unlock({ unlockExpiresAt: new Date('2026-10-03T00:00:00.000Z') })],
      });

      expect(await service.expireDue()).toBe(1);
      expect(await service.expireDue()).toBe(0);
    });
  });
});
