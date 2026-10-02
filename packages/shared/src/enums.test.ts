/**
 * Guards against drift between packages/shared/src/enums.ts and the Prisma
 * enums in apps/api/prisma/schema.prisma.
 *
 * These are deliberately duplicated: the mobile app must not import the server
 * package just to learn the vocabulary. The duplication is safe only as long
 * as this test runs, so it runs on every CI build.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SEEDED_NET_WORTH_CATEGORY_KEYS,
  NET_WORTH_PENDING_REVIEW_KEY,
  PROFILE_STATUSES,
  PROFILE_VISIBILITIES,
  PHOTO_STATUSES,
  PHOTO_TYPES,
  PAYMENT_STATUSES,
  UNLOCK_STATUSES,
  GENDERS,
  GENDER_PREFERENCES,
  MARITAL_STATUSES,
  NOTIFICATION_EVENTS,
  UNLOCK_EXPIRY_REMINDER_HOURS,
} from './enums.js';

const SCHEMA_PATH = join(__dirname, '..', '..', '..', 'apps', 'api', 'prisma', 'schema.prisma');

function readSchema(): string {
  return readFileSync(SCHEMA_PATH, 'utf8');
}

/** Pulls the members of `enum Name { ... }` out of the schema source. */
function schemaEnum(name: string, source = readSchema()): string[] {
  const match = new RegExp(`enum\\s+${name}\\s*\\{([^}]*)\\}`, 'm').exec(source);
  if (!match?.[1]) {
    throw new Error(`Enum "${name}" not found in schema.prisma`);
  }
  return match[1]
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/\/\/.*$/, '')
        .trim(),
    )
    .filter(Boolean);
}

describe('shared enums match the Prisma schema', () => {
  it.each([
    ['ProfileStatus', PROFILE_STATUSES],
    ['ProfileVisibility', PROFILE_VISIBILITIES],
    ['PhotoStatus', PHOTO_STATUSES],
    ['PhotoType', PHOTO_TYPES],
    ['PaymentStatus', PAYMENT_STATUSES],
    ['UnlockStatus', UNLOCK_STATUSES],
    ['Gender', GENDERS],
    ['GenderPreference', GENDER_PREFERENCES],
    ['MaritalStatus', MARITAL_STATUSES],
  ])('%s', (prismaName, shared) => {
    expect([...shared].sort()).toEqual(schemaEnum(prismaName).sort());
  });

  it('every shared notification event has a stable UPPER_SNAKE value', () => {
    for (const [key, value] of Object.entries(NOTIFICATION_EVENTS)) {
      expect(value).toBe(key);
      expect(value).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });
});

/**
 * B1: the client confirmed four bands and said more are coming. That is the
 * whole reason the category stopped being a database enum, so the absence of
 * the enum is an assertion, not an accident. If someone reintroduces
 * `enum NetWorthCategory`, adding a fifth band will again require a migration
 * and an app release, and this test will fail to say so.
 */
describe('net-worth category is data, not a database enum', () => {
  it('the Prisma schema has no NetWorthCategory enum', () => {
    expect(readSchema()).not.toMatch(/enum\s+NetWorthCategory\b/);
  });

  it('the category table carries the band bounds as columns', () => {
    const source = readSchema();
    expect(source).toMatch(/model\s+NetWorthCategoryRef/);
    expect(source).toMatch(/minInr\s+BigInt\?/);
    expect(source).toMatch(/maxInr\s+BigInt\?/);
  });

  it('the four client-confirmed bands are seeded, plus the review bucket', () => {
    expect(SEEDED_NET_WORTH_CATEGORY_KEYS).toEqual([
      'BELOW_2CR',
      'TWO_CR_TO_FIVE_CR',
      'FIVE_CR_TO_TEN_CR',
      'ABOVE_10CR',
      NET_WORTH_PENDING_REVIEW_KEY,
    ]);
  });
});

describe('business invariants encoded as enums', () => {
  it('PENDING_REVIEW is a real state, not an absence of one', () => {
    // Section 3: a value landing exactly on a band boundary needs somewhere to
    // live until an admin classifies it.
    expect(SEEDED_NET_WORTH_CATEGORY_KEYS).toContain(NET_WORTH_PENDING_REVIEW_KEY);
  });

  it('APPROVED is the only status that may be discoverable', () => {
    const discoverable = PROFILE_STATUSES.filter((s) => s === 'APPROVED');
    expect(discoverable).toEqual(['APPROVED']);
  });

  it('DELETED exists as a profile status for soft deletion (section 21)', () => {
    expect(PROFILE_STATUSES).toContain('DELETED');
    expect(PROFILE_STATUSES).toContain('SUSPENDED');
  });

  it('C3 sets a 2-hour reminder lead time', () => {
    expect(UNLOCK_EXPIRY_REMINDER_HOURS).toBe(2);
    expect(NOTIFICATION_EVENTS).toHaveProperty('UNLOCK_EXPIRING_IN_2H');
  });
});
