/**
 * Idempotent seed for the reference data the application requires to function.
 *
 *   npx prisma db seed
 *
 * Every write is an upsert keyed on a stable natural key, so the script is safe
 * to re-run. This is *not* a data-migration tool: schema changes go through
 * `prisma migrate`, and reference-data changes go through the admin dashboard
 * (section 20 makes report reasons admin-configurable).
 *
 * Requires a reachable database. Start one with:
 *   docker compose -f infra/docker/docker-compose.yml up -d postgres
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { AdminRoleSlug, PrismaClient } from '../src/prisma/prisma-client';
import {
  ACCOUNT_SETUP_FEE,
  CRORE_INR,
  DEFAULT_PRICING,
  GST_PERCENT,
  NET_WORTH_BANDS,
  NET_WORTH_PENDING_REVIEW_KEY,
  classifyNetWorth,
  quotePayment,
  toGstRate,
  type PricedBandKey,
} from '@matrimony/shared';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set; the seed cannot run.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** Section 4 as confirmed by the client on 2026-09-29. */
const EXPECTED_TOTALS: Record<PricedBandKey, string> = {
  BELOW_2CR: '116.82',
  TWO_CR_TO_FIVE_CR: '293.82',
  FIVE_CR_TO_TEN_CR: '588.82',
  ABOVE_10CR: '1178.82',
};

// ---------------------------------------------------------------------------
// Section 3 / 7 — net-worth bands
// ---------------------------------------------------------------------------

async function seedNetWorthCategories(): Promise<void> {
  for (const band of NET_WORTH_BANDS) {
    const pricing = DEFAULT_PRICING[band.key];

    // The band table, the pricing table and the money helper must agree, or a
    // user could be quoted a total that contradicts the published schedule.
    const quote = quotePayment(pricing.baseAmount, pricing.gstPercent);
    if (quote.totalAmount !== EXPECTED_TOTALS[band.key]) {
      throw new Error(
        `Band ${band.key} totals ${quote.totalAmount}, expected ${EXPECTED_TOTALS[band.key]}. ` +
          'Check DEFAULT_PRICING against the client schedule of 2026-09-29 before seeding.',
      );
    }

    const description =
      `You will discover profiles of users in this category. ` +
      `Unlock price \u20b9${pricing.baseAmount} plus ${pricing.gstPercent}% GST, ` +
      `a total of \u20b9${quote.totalAmount}.`;

    await prisma.netWorthCategoryRef.upsert({
      where: { key: band.key },
      update: {
        label: band.label,
        description,
        minInr: band.minInr,
        maxInr: band.maxInr,
        thresholdInr: band.maxInr,
        setupFeeAmount: ACCOUNT_SETUP_FEE,
        isDiscoverable: true,
        sortOrder: band.minInr === null ? 1 : Number(band.minInr / CRORE_INR) + 1,
      },
      create: {
        key: band.key,
        label: band.label,
        description,
        minInr: band.minInr,
        maxInr: band.maxInr,
        thresholdInr: band.maxInr,
        setupFeeAmount: ACCOUNT_SETUP_FEE,
        isDiscoverable: true,
        sortOrder: band.minInr === null ? 1 : Number(band.minInr / CRORE_INR) + 1,
      },
    });
  }

  // The review bucket is a row, not an enum member, and must never be
  // discoverable — a user whose category is unreviewed must see nobody.
  await prisma.netWorthCategoryRef.upsert({
    where: { key: NET_WORTH_PENDING_REVIEW_KEY },
    update: { isDiscoverable: false },
    create: {
      key: NET_WORTH_PENDING_REVIEW_KEY,
      label: 'Under manual review',
      description:
        'A net worth falling exactly on a band boundary requires manual classification. ' +
        'Discovery stays unavailable until an administrator assigns a category.',
      minInr: null,
      maxInr: null,
      thresholdInr: null,
      setupFeeAmount: ACCOUNT_SETUP_FEE,
      isDiscoverable: false,
      sortOrder: 99,
    },
  });

  // Assert the bands partition the number line. An overlap or a gap here is a
  // privacy bug: a user in the gap would classify nowhere, and a user in an
  // overlap could be classified two ways.
  const rows = await prisma.netWorthCategoryRef.findMany({
    where: { isDiscoverable: true },
    orderBy: { minInr: 'asc' },
  });
  if (rows.length !== NET_WORTH_BANDS.length) {
    throw new Error(`Expected ${NET_WORTH_BANDS.length} discoverable bands, found ${rows.length}.`);
  }
  for (const row of rows) {
    if (classifyNetWorth(row.minInr ?? 0n) !== row.key) {
      throw new Error(`Band ${row.key} does not own its own lower bound ${row.minInr}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Section 4 / 29 — pricing
// ---------------------------------------------------------------------------

async function seedPricing(): Promise<void> {
  for (const band of NET_WORTH_BANDS) {
    const defaults = DEFAULT_PRICING[band.key];
    const current = await prisma.pricingConfig.findFirst({
      where: { category: band.key, effectiveTo: null },
      orderBy: { version: 'desc' },
    });
    // Pricing is append-only, so an existing active row is left untouched.
    if (current) continue;

    const highest = await prisma.pricingConfig.aggregate({
      where: { category: band.key },
      _max: { version: true },
    });

    await prisma.pricingConfig.create({
      data: {
        category: band.key,
        baseAmount: defaults.baseAmount,
        // Stored as a fraction (0.1800 = 18%) to match the Decimal(5,4) column.
        gstRate: toGstRate(defaults.gstPercent).toFixed(4),
        version: (highest._max.version ?? 0) + 1,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        note: 'Client schedule confirmed 2026-09-29.',
      },
    });
  }

  // PENDING_REVIEW is intentionally absent: it must never be unlockable.
  const reviewPrice = await prisma.pricingConfig.count({
    where: { category: NET_WORTH_PENDING_REVIEW_KEY },
  });
  if (reviewPrice > 0) {
    throw new Error('PENDING_REVIEW must never have a price, otherwise it becomes purchasable.');
  }
}

// ---------------------------------------------------------------------------
// D3 — master lists
// ---------------------------------------------------------------------------

const MASTER_LISTS = [
  { key: 'EDUCATION', label: 'Education', isSensitive: false },
  { key: 'PROFESSION', label: 'Profession', isSensitive: false },
  { key: 'CASTE', label: 'Caste', isSensitive: true },
  { key: 'COMMUNITY', label: 'Community', isSensitive: true },
] as const;

/**
 * Seeds the list containers only. The individual values are the client's call
 * and are maintained from the admin dashboard, so inventing a default value
 * list here would be fabricating data that the business has not agreed to.
 */
async function seedMasterListContainers(): Promise<void> {
  for (const list of MASTER_LISTS) {
    await prisma.masterList.upsert({
      where: { key: list.key },
      update: { label: list.label, isSensitive: list.isSensitive },
      create: { key: list.key, label: list.label, isSensitive: list.isSensitive },
    });
  }
}

// ---------------------------------------------------------------------------
// Section 20 — report reasons
// ---------------------------------------------------------------------------

const REPORT_REASONS = [
  { code: 'FAKE_PROFILE', label: 'Fake profile', requiresDescription: false, sortOrder: 1 },
  { code: 'INCORRECT_INFORMATION', label: 'Incorrect information', requiresDescription: false, sortOrder: 2 },
  { code: 'INAPPROPRIATE_CONTENT', label: 'Inappropriate photo or content', requiresDescription: false, sortOrder: 3 },
  { code: 'INCORRECT_CONTACT', label: 'Incorrect contact information', requiresDescription: true, sortOrder: 4 },
  { code: 'HARASSMENT', label: 'Harassment', requiresDescription: true, sortOrder: 5 },
  { code: 'OTHER', label: 'Other', requiresDescription: true, sortOrder: 6 },
] as const;

async function seedReportReasons(): Promise<void> {
  for (const reason of REPORT_REASONS) {
    await prisma.reportReason.upsert({
      where: { code: reason.code },
      update: {
        label: reason.label,
        requiresDescription: reason.requiresDescription,
        sortOrder: reason.sortOrder,
      },
      create: { ...reason },
    });
  }
}

// ---------------------------------------------------------------------------
// Section 33 — permissions and roles, per client answer F2(a)
// ---------------------------------------------------------------------------

const PERMISSIONS = [
  { key: 'user:read', resource: 'user', action: 'read', isSensitive: false },
  { key: 'user:suspend', resource: 'user', action: 'suspend', isSensitive: true },
  { key: 'user:delete', resource: 'user', action: 'delete', isSensitive: true },
  { key: 'user:change_category', resource: 'user', action: 'change_category', isSensitive: true },
  { key: 'profile:read', resource: 'profile', action: 'read', isSensitive: false },
  { key: 'profile:approve', resource: 'profile', action: 'approve', isSensitive: false },
  { key: 'profile:reject', resource: 'profile', action: 'reject', isSensitive: false },
  { key: 'profile:suspend', resource: 'profile', action: 'suspend', isSensitive: true },
  { key: 'photo:review', resource: 'photo', action: 'review', isSensitive: false },
  { key: 'payment:read', resource: 'payment', action: 'read', isSensitive: false },
  { key: 'payment:refund', resource: 'payment', action: 'refund', isSensitive: true },
  { key: 'unlock:read', resource: 'unlock', action: 'read', isSensitive: false },
  { key: 'unlock:grant', resource: 'unlock', action: 'grant', isSensitive: true },
  { key: 'report:review', resource: 'report', action: 'review', isSensitive: false },
  { key: 'pricing:read', resource: 'pricing', action: 'read', isSensitive: false },
  { key: 'pricing:write', resource: 'pricing', action: 'write', isSensitive: true },
  { key: 'notification:send', resource: 'notification', action: 'send', isSensitive: false },
  { key: 'audit:read', resource: 'audit', action: 'read', isSensitive: false },
  { key: 'data_request:handle', resource: 'data_request', action: 'handle', isSensitive: true },
  { key: 'identity_verify:review', resource: 'identity_verify', action: 'review', isSensitive: true },
  { key: 'admin:manage', resource: 'admin', action: 'manage', isSensitive: true },
] as const;

const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/**
 * F2(a), answered 2026-09-29: "Only Super Admin may change category or edit
 * pricing. Only Super Admin may issue a manual unlock, and every such action is
 * audit logged."
 *
 * That makes three permissions Super Admin only. `user:delete` is also held by
 * Super Admin alone as a working assumption — the questionnaire asked who may
 * delete a user and F2(a) does not answer it (docs/decisions GAP-6), so it is
 * restricted to the safest role pending a decision rather than left open.
 */
const SUPER_ADMIN_ONLY = ['user:change_category', 'pricing:write', 'unlock:grant', 'user:delete'];

const ROLE_GRANTS = {
  SUPER_ADMIN: ALL_PERMISSION_KEYS,
  ADMIN: ALL_PERMISSION_KEYS.filter((k) => !SUPER_ADMIN_ONLY.includes(k) && k !== 'admin:manage'),
  MODERATION_ADMIN: [
    'user:read',
    'profile:read',
    'profile:approve',
    'profile:reject',
    'profile:suspend',
    'photo:review',
    'report:review',
    'unlock:read',
    'identity_verify:review',
  ],
  FINANCE_ADMIN: ['user:read', 'payment:read', 'payment:refund', 'unlock:read', 'pricing:read', 'data_request:handle'],
} as const;

const ROLE_COPY = {
  SUPER_ADMIN: { name: 'Super Admin', description: 'Unrestricted access, including role management.' },
  ADMIN: {
    name: 'Admin',
    description:
      'Day-to-day operations. May not change net-worth categories, edit pricing, grant unlocks or delete users (F2(a)).',
  },
  MODERATION_ADMIN: { name: 'Moderation Admin', description: 'Profile, photo, report and identity review.' },
  FINANCE_ADMIN: { name: 'Finance Admin', description: 'Payments, refunds, pricing visibility and data requests.' },
} as const;

async function seedRolesAndPermissions(): Promise<void> {
  const permissionIdByKey = new Map<string, string>();
  for (const permission of PERMISSIONS) {
    const row = await prisma.permission.upsert({
      where: { key: permission.key },
      update: { isSensitive: permission.isSensitive, resource: permission.resource, action: permission.action },
      create: permission,
    });
    permissionIdByKey.set(permission.key, row.id);
  }

  const roleSlugs = Object.keys(ROLE_GRANTS) as AdminRoleSlug[];

  for (const slug of roleSlugs) {
    const copy = ROLE_COPY[slug];
    const role = await prisma.adminRole.upsert({
      where: { slug },
      update: { name: copy.name, description: copy.description },
      create: { slug, name: copy.name, description: copy.description },
    });

    // Roles are a catalogue, so the grant set is replaced rather than merged:
    // a permission removed from a role in code must actually lose its grant.
    await prisma.adminRolePermission.deleteMany({ where: { roleId: role.id } });
    for (const key of ROLE_GRANTS[slug]) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) throw new Error(`Unknown permission key in grant matrix: ${key}`);
      await prisma.adminRolePermission.create({ data: { roleId: role.id, permissionId } });
    }
  }

  // F2(a) is the client's stated policy, so assert it rather than trust the
  // matrix above. A guard that checks a role *name* is weak, so this checks
  // that the sensitive permission is held by exactly one role, and that role
  // is Super Admin.
  for (const key of SUPER_ADMIN_ONLY) {
    const permission = await prisma.permission.findUnique({ where: { key }, include: { roleGrants: true } });
    if (!permission) throw new Error(`Missing permission ${key}`);
    if (permission.roleGrants.length !== 1) {
      throw new Error(
        `F2(a): "${key}" must be granted to exactly one role, found ${permission.roleGrants.length}.`,
      );
    }
    const holdingRole = await prisma.adminRole.findUnique({ where: { id: permission.roleGrants[0]!.roleId } });
    if (holdingRole?.slug !== 'SUPER_ADMIN') {
      throw new Error(`F2(a): "${key}" is granted to ${holdingRole?.slug}, expected SUPER_ADMIN.`);
    }
  }
}

async function main(): Promise<void> {
  await seedNetWorthCategories();
  await seedPricing();
  await seedMasterListContainers();
  await seedReportReasons();
  await seedRolesAndPermissions();

  const [bands, activePrices, lists, reasons, permissions, roles] = await Promise.all([
    prisma.netWorthCategoryRef.count(),
    prisma.pricingConfig.count({ where: { effectiveTo: null } }),
    prisma.masterList.count(),
    prisma.reportReason.count(),
    prisma.permission.count(),
    prisma.adminRole.count(),
  ]);

  console.log('Seed complete.');
  console.log(`  net-worth bands     : ${bands} (4 discoverable + 1 review bucket)`);
  console.log(`  active price configs: ${activePrices} (review bucket excluded)`);
  console.log(`  master lists        : ${lists} (values are client-supplied)`);
  console.log(`  report reasons      : ${reasons}`);
  console.log(`  permissions         : ${permissions}`);
  console.log(`  roles               : ${roles}`);
  console.log(`  setup fee           : \u20b9${ACCOUNT_SETUP_FEE} (flat, no GST, ${GST_PERCENT}% applies to unlocks)`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
