import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NOTIFICATION_EVENTS } from '@matrimony/shared';
import { VerificationService, parseBirthYear } from './verification.service';
import type { VerificationGateway } from './verification.gateway';
import type { NotificationsService } from '../notifications/notifications.service';

/**
 * D9 turns on one transition: a passed ID check is the only thing that may move
 * an account from PENDING_VERIFICATION to AWAITING_SETUP_FEE. These tests cover
 * the ways that could go wrong — a forged reference, a failed check, a replayed
 * success, a late success against an account that already left the funnel — and
 * the initiate path, which must capture consent before it calls the supplier
 * and must fail closed when the supplier is not configured.
 */
interface FakeIdentity {
  id: string;
  userId: string;
  provider: string;
  vendor: string | null;
  providerReference: string | null;
  providerReferenceExpiresAt: Date | null;
  status: string;
  verifiedAt: Date | null;
  failureReason: string | null;
  failureCode: string | null;
  nameOnId: string | null;
  yearOfBirth: number | null;
  consentRecordId: string | null;
  documentObjectKey: string | null;
  documentMimeType: string | null;
  documentSubmittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedByAdminId: string | null;
  reviewNote: string | null;
}

interface FakeUser {
  id: string;
  status: string;
  identityVerifiedAt: Date | null;
  statusChangedAt: Date | null;
  statusChangeReason: string | null;
}

interface FakeConsent {
  id: string;
  userId: string | null;
  type: string;
  status: string;
  policyVersion: string;
  grantedAt: Date;
}

function harness() {
  const identities: FakeIdentity[] = [];
  const users: FakeUser[] = [];
  const consents: FakeConsent[] = [];
  let seq = 1;

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        users.find((u) => u.id === where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: Partial<FakeUser>;
      }) => {
        const matches = users.filter((u) => u.id === where.id && u.status === where.status);
        for (const row of matches) Object.assign(row, data);
        return { count: matches.length };
      },
    },
    identityVerification: {
      findUnique: async ({ where }: { where: { id?: string; userId?: string } }) => {
        if (where.id !== undefined) return identities.find((i) => i.id === where.id) ?? null;
        return identities.find((i) => i.userId === where.userId) ?? null;
      },
      findFirst: async ({ where }: { where: { providerReference: string } }) =>
        identities.find((i) => i.providerReference === where.providerReference) ?? null,
      /**
       * The reconciliation query. Every predicate is applied, so a sweep that
       * forgot to exclude manual checks or sessions inside their consent window
       * would read them here rather than passing against a permissive fake.
       */
      findMany: async ({
        where,
      }: {
        where: {
          status?: string;
          vendor?: string;
          providerReference?: { not: null };
          providerReferenceExpiresAt?: { lt: Date };
        };
      }) =>
        identities.filter((i) => {
          if (where.status !== undefined && i.status !== where.status) return false;
          if (where.vendor !== undefined && i.vendor !== where.vendor) return false;
          if (where.providerReference !== undefined && i.providerReference === null) return false;
          if (where.providerReferenceExpiresAt !== undefined) {
            if (i.providerReferenceExpiresAt === null) return false;
            if (i.providerReferenceExpiresAt >= where.providerReferenceExpiresAt.lt) return false;
          }
          return true;
        }),
      // Each attempt creates its own row (the vendor refuses a reused
      // `verification_id`), so the fake offers create/delete rather than upsert.
      create: async ({ data }: { data: Partial<FakeIdentity> }) => {
        const row: FakeIdentity = {
          id: `i${seq++}`,
          userId: 'u1',
          provider: 'DIGILOCKER',
          vendor: 'CASHFREE',
          providerReference: null,
          providerReferenceExpiresAt: null,
          status: 'PENDING',
          verifiedAt: null,
          failureReason: null,
          failureCode: null,
          nameOnId: null,
          yearOfBirth: null,
          consentRecordId: null,
          documentObjectKey: null,
          documentMimeType: null,
          documentSubmittedAt: null,
          reviewedAt: null,
          reviewedByAdminId: null,
          reviewNote: null,
          ...data,
        };
        identities.push(row);
        return row;
      },
      delete: async ({ where }: { where: { userId: string } }) => {
        const at = identities.findIndex((i) => i.userId === where.userId);
        if (at !== -1) identities.splice(at, 1);
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<FakeIdentity> }) => {
        const row = identities.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    consentRecord: {
      create: async ({ data }: { data: Partial<FakeConsent> }) => {
        const row: FakeConsent = {
          id: `c${seq++}`,
          userId: null,
          type: 'AADHAAR_PROCESSING',
          status: 'GRANTED',
          policyVersion: 'v1',
          grantedAt: new Date(),
          ...data,
        };
        consents.push(row);
        return row;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
  };

  // A recorder rather than the real service: what matters is that the row is
  // written with the right event and recipient, and a fake keeps that assertion
  // independent of the notifications module's own queries.
  const notifications = {
    created: [] as Array<Parameters<NotificationsService['create']>[0]>,
    create(input: Parameters<NotificationsService['create']>[0]) {
      notifications.created.push(input);
      return Promise.resolve({ id: `notif_${notifications.created.length}`, ...input });
    },
  };

  /**
   * The bucket, reduced to what the manual path touches: a reservation, the
   * bytes written to it, and the head that proves something is there.
   */
  const storage = {
    objects: new Map<string, { bytes: Buffer; mime: string }>(),
    presignUpload: async (key: string, mime: string) => `https://storage.test/${key}?sig=${mime}`,
    putObject: async (key: string, body: Buffer, mime: string) => {
      storage.objects.set(key, { bytes: body, mime });
    },
    headObject: async (key: string) => {
      const hit = storage.objects.get(key);
      return hit ? { byteLength: hit.bytes.byteLength, contentType: hit.mime } : null;
    },
  };

  return {
    users,
    notifications,
    identities,
    consents,
    storage,
    seedIdentity(overrides: Partial<FakeIdentity> = {}): FakeIdentity {
      const row: FakeIdentity = {
        id: `i${seq++}`,
        userId: 'u1',
        provider: 'DIGILOCKER',
        vendor: 'CASHFREE',
        providerReference: 'ref-1',
        providerReferenceExpiresAt: null,
        status: 'PENDING',
        verifiedAt: null,
        failureReason: null,
        failureCode: null,
        nameOnId: null,
        yearOfBirth: null,
        consentRecordId: null,
        documentObjectKey: null,
        documentMimeType: null,
        documentSubmittedAt: null,
        reviewedAt: null,
        reviewedByAdminId: null,
        reviewNote: null,
        ...overrides,
      };
      identities.push(row);
      return row;
    },
    seedUser(id: string, status: string): FakeUser {
      const row: FakeUser = {
        id,
        status,
        identityVerifiedAt: null,
        statusChangedAt: null,
        statusChangeReason: null,
      };
      users.push(row);
      return row;
    },
    service(gateway: VerificationGateway): VerificationService {
      return new VerificationService(
        prisma as never,
        gateway,
        notifications as unknown as NotificationsService,
        storage as never,
      );
    },
  };
}

function gateway(overrides: Partial<VerificationGateway> = {}): VerificationGateway {
  return {
    configured: true,
    createDigiLockerSession: async () => ({
      providerReference: 'cf-12345',
      url: 'https://verification-test.cashfree.com/dgl/h7562ci7us0',
      expiresAt: new Date(Date.now() + 600_000),
    }),
    verifyWebhookSignature: () => true,
    // The supplier has nothing new to say unless a test says otherwise.
    fetchDigiLockerStatus: async () => ({ status: 'PENDING' }),
    ...overrides,
  } as VerificationGateway;
}

describe('VerificationService.handleWebhook', () => {
  it('advances a PENDING_VERIFICATION user to AWAITING_SETUP_FEE on success', async () => {
    const h = harness();
    const identity = h.seedIdentity();
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: {
        verification_id: identity.id,
        status: 'AUTHENTICATED',
        user_details: { name: 'John Doe', dob: '02-02-1995' },
      },
    });

    expect(user.status).toBe('AWAITING_SETUP_FEE');
    expect(user.identityVerifiedAt).toBeInstanceOf(Date);
    expect(user.statusChangedAt).toBeInstanceOf(Date);
    expect(identity.status).toBe('VERIFIED');
    expect(identity.nameOnId).toBe('John Doe');
    expect(identity.yearOfBirth).toBe(1995);
  });

  it('announces a passed check once, and not again on a replayed delivery', async () => {
    const h = harness();
    const identity = h.seedIdentity();
    h.seedUser('u1', 'PENDING_VERIFICATION');

    const body = {
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { verification_id: identity.id, status: 'AUTHENTICATED' },
    };
    const service = h.service(gateway());
    await service.handleWebhook(body);
    await service.handleWebhook(body);

    expect(h.notifications.created).toEqual([
      expect.objectContaining({
        userId: 'u1',
        event: NOTIFICATION_EVENTS.IDENTITY_VERIFIED,
        channel: 'PUSH',
      }),
    ]);
  });

  it('announces a failed check without repeating the vendor reason', async () => {
    const h = harness();
    const identity = h.seedIdentity();
    h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_CONSENT_DENIED',
      data: { verification_id: identity.id, status: 'CONSENT_DENIED' },
    });

    expect(h.notifications.created).toHaveLength(1);
    expect(h.notifications.created[0]).toMatchObject({
      event: NOTIFICATION_EVENTS.IDENTITY_VERIFICATION_FAILED,
      channel: 'PUSH',
    });
    expect(h.notifications.created[0]?.body).not.toContain('CONSENT_DENIED');
  });

  it('finds the attempt by reference id when the vendor omits verification_id', async () => {
    const h = harness();
    const identity = h.seedIdentity({ providerReference: '999' });
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { reference_id: 999 },
    });

    expect(identity.status).toBe('VERIFIED');
    expect(user.status).toBe('AWAITING_SETUP_FEE');
  });

  it('leaves the account untouched when the user denies consent', async () => {
    const h = harness();
    const identity = h.seedIdentity();
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_CONSENT_DENIED',
      data: { verification_id: identity.id, status: 'CONSENT_DENIED' },
    });

    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(user.identityVerifiedAt).toBeNull();
    expect(identity.status).toBe('FAILED');
    expect(identity.failureCode).toBe('DIGILOCKER_VERIFICATION_CONSENT_DENIED');
    expect(identity.failureReason).toBe('CONSENT_DENIED');
  });

  it('marks an expired consent link as EXPIRED so the user can start again', async () => {
    const h = harness();
    const identity = h.seedIdentity();

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_LINK_EXPIRED',
      data: { verification_id: identity.id, status: 'EXPIRED' },
    });

    expect(identity.status).toBe('EXPIRED');
    expect(identity.failureCode).toBe('DIGILOCKER_VERIFICATION_LINK_EXPIRED');
  });

  it('never downgrades a check that already passed', async () => {
    const h = harness();
    const identity = h.seedIdentity({ status: 'VERIFIED', verifiedAt: new Date() });

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_LINK_EXPIRED',
      data: { verification_id: identity.id },
    });

    expect(identity.status).toBe('VERIFIED');
  });

  it('does not pull an ACTIVE account back through the funnel on a replayed success', async () => {
    const h = harness();
    const identity = h.seedIdentity();
    const user = h.seedUser('u1', 'ACTIVE');
    user.identityVerifiedAt = new Date();

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { verification_id: identity.id },
    });

    expect(user.status).toBe('ACTIVE');
  });

  it('ignores an unknown verification id', async () => {
    const h = harness();
    h.seedIdentity();
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { verification_id: 'nope' },
    });

    expect(user.status).toBe('PENDING_VERIFICATION');
  });

  it('ignores a webhook with no identifiers at all', async () => {
    const h = harness();
    h.seedIdentity();
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).handleWebhook({
      event_type: 'DIGILOCKER_VERIFICATION_SUCCESS',
      data: { status: 'AUTHENTICATED' },
    });

    expect(user.status).toBe('PENDING_VERIFICATION');
  });

  it('ignores an event it does not model instead of failing the delivery', async () => {
    const h = harness();
    const identity = h.seedIdentity();

    await expect(
      h.service(gateway()).handleWebhook({
        event_type: 'DIGILOCKER_SOMETHING_NEW',
        data: { verification_id: identity.id },
      }),
    ).resolves.toBeUndefined();

    expect(identity.status).toBe('PENDING');
  });
});

describe('VerificationService.getVerificationStatus', () => {
  it('reports NOT_STARTED rather than an error when nothing was ever attempted', async () => {
    const h = harness();

    const status = await h.service(gateway()).getVerificationStatus('u1');

    expect(status.status).toBe('NOT_STARTED');
    expect(status.verifiedAt).toBeNull();
  });
});

describe('VerificationService.initiateVerification', () => {
  it('captures Aadhaar consent, then returns the DigiLocker URL', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(gateway());

    const result = await service.initiateVerification('u1', { provider: 'DIGILOCKER' });

    expect(h.consents).toHaveLength(1);
    expect(h.consents[0].type).toBe('AADHAAR_PROCESSING');
    expect(h.identities[0].consentRecordId).toBe(h.consents[0].id);
    expect(result.status).toBe('PENDING');
    expect(result.redirect_url).toBe('https://verification-test.cashfree.com/dgl/h7562ci7us0');
    expect(h.identities[0].providerReference).toBe('cf-12345');
    expect(h.identities[0].providerReferenceExpiresAt).toBeInstanceOf(Date);
  });

  it('sends our own row id to the vendor so the callback is attributable', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const calls: string[] = [];

    const service = h.service(
      gateway({
        createDigiLockerSession: async ({ verificationId }) => {
          calls.push(verificationId);
          return {
            providerReference: 'cf-1',
            url: 'https://verification-test.cashfree.com/dgl/x',
            expiresAt: new Date(),
          };
        },
      }),
    );

    await service.initiateVerification('u1', { provider: 'DIGILOCKER' });

    expect(calls).toEqual([h.identities[0].id]);
  });

  it('uses a new verification id for a retry, which Cashfree requires', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const seen: string[] = [];
    const service = h.service(
      gateway({
        createDigiLockerSession: async ({ verificationId }) => {
          seen.push(verificationId);
          return {
            providerReference: `cf-${seen.length}`,
            url: 'https://verification-test.cashfree.com/dgl/x',
            expiresAt: new Date(),
          };
        },
      }),
    );

    await service.initiateVerification('u1', { provider: 'DIGILOCKER' });
    await service.initiateVerification('u1', { provider: 'DIGILOCKER' });

    // A reused id is answered with 409 `verification_id already exists`, so a
    // member retrying after a lapsed link would never get a new one.
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(h.identities).toHaveLength(1);
  });

  it('fails closed when the supplier is not configured', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(gateway({ configured: false }));

    await expect(
      service.initiateVerification('u1', { provider: 'DIGILOCKER' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    // Nothing was recorded: an attempt that cannot happen must not capture
    // Aadhaar consent or claim a pending check.
    expect(h.consents).toHaveLength(0);
    expect(h.identities).toHaveLength(0);
  });

  it('reports a vendor failure as unavailable rather than as a broken request', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(
      gateway({
        createDigiLockerSession: async () => {
          throw new Error('Cashfree DigiLocker URL creation failed (HTTP 401)');
        },
      }),
    );

    await expect(
      service.initiateVerification('u1', { provider: 'DIGILOCKER' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('refuses an Aadhaar method we have no licence to use', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(gateway());

    await expect(
      service.initiateVerification('u1', { provider: 'AADHAAR_UIDAI' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not start a second session for an account that already passed', async () => {
    const h = harness();
    h.seedUser('u1', 'AWAITING_SETUP_FEE');
    h.seedIdentity({ status: 'VERIFIED', verifiedAt: new Date() });
    const service = h.service(gateway());

    const result = await service.initiateVerification('u1', { provider: 'DIGILOCKER' });

    expect(result.status).toBe('VERIFIED');
    expect(result.redirect_url).toBeUndefined();
    expect(h.consents).toHaveLength(0);
  });
});

describe('parseBirthYear', () => {
  it('understands the DD-MM-YYYY date Cashfree sends', () => {
    expect(parseBirthYear('02-02-1995')).toBe(1995);
  });

  it('understands an ISO date', () => {
    expect(parseBirthYear('1995-02-02')).toBe(1995);
  });

  it('returns null for something it cannot read', () => {
    expect(parseBirthYear('not-a-date')).toBeNull();
    expect(parseBirthYear(undefined)).toBeNull();
  });
});

/**
 * The manual fallback (D9).
 *
 * Submitting a document verifies nobody: it records consent, stores the key and
 * leaves the row PENDING for a person. The decision is then the same transition
 * the DigiLocker webhook applies, which is what lets everything downstream —
 * `identityVerifiedAt`, `can_discover`, the setup-fee gate — stay unaware of
 * which method produced it.
 */
describe('VerificationService.submitManualDocument', () => {
  const submit = {
    object_key: 'verification/u1/doc.jpg',
    policy_version: 'manual-document-v1',
  };

  it('records consent, keeps the key and leaves the check pending for a person', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    h.storage.objects.set(submit.object_key, { bytes: Buffer.alloc(3, 1), mime: 'image/jpeg' });

    const result = await h.service(gateway()).submitManualDocument('u1', submit);

    expect(result.status).toBe('PENDING');
    expect(result.provider).toBe('MANUAL_DOCUMENT');
    expect(h.consents[0]?.policyVersion).toBe('manual-document-v1');

    const row = h.identities[0]!;
    expect(row.provider).toBe('MANUAL_DOCUMENT');
    // No supplier is involved in a manual review.
    expect(row.vendor).toBeNull();
    expect(row.documentObjectKey).toBe(submit.object_key);
    expect(row.documentSubmittedAt).toBeInstanceOf(Date);
    // The consent record is referenced from the row, so the ordering is auditable.
    expect(row.consentRecordId).toBe(h.consents[0]?.id);
    // Nothing is verified by submitting.
    expect(h.users[0]!.identityVerifiedAt).toBeNull();
  });

  it("refuses a key outside the caller's own folder", async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    h.storage.objects.set('verification/u2/doc.jpg', {
      bytes: Buffer.alloc(3, 1),
      mime: 'image/jpeg',
    });

    await expect(
      h
        .service(gateway())
        .submitManualDocument('u1', { ...submit, object_key: 'verification/u2/doc.jpg' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(h.consents).toHaveLength(0);
    expect(h.identities).toHaveLength(0);
  });

  it('refuses a key with nothing stored behind it', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');

    await expect(h.service(gateway()).submitManualDocument('u1', submit)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(h.identities).toHaveLength(0);
  });

  it('replaces an earlier failed attempt instead of stacking rows', async () => {
    const h = harness();
    h.seedUser('u1', 'PENDING_VERIFICATION');
    h.seedIdentity({ provider: 'MANUAL_DOCUMENT', status: 'FAILED' });
    h.storage.objects.set(submit.object_key, { bytes: Buffer.alloc(3, 1), mime: 'image/jpeg' });

    await h.service(gateway()).submitManualDocument('u1', submit);

    expect(h.identities).toHaveLength(1);
    expect(h.identities[0]!.status).toBe('PENDING');
  });

  it('keeps a check that has already passed', async () => {
    const h = harness();
    h.seedUser('u1', 'AWAITING_SETUP_FEE');
    h.seedIdentity({ status: 'VERIFIED', verifiedAt: new Date() });

    const result = await h.service(gateway()).submitManualDocument('u1', submit);

    expect(result.status).toBe('VERIFIED');
    expect(h.consents).toHaveLength(0);
  });
});

describe('VerificationService.decideManualVerification', () => {
  it('verifies the account the way a DigiLocker success does', async () => {
    const h = harness();
    const identity = h.seedIdentity({ provider: 'MANUAL_DOCUMENT' });
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).decideManualVerification({
      verificationId: identity.id,
      decision: 'APPROVE',
      adminId: 'admin_1',
    });

    expect(identity.status).toBe('VERIFIED');
    expect(identity.verifiedAt).toBeInstanceOf(Date);
    expect(identity.reviewedByAdminId).toBe('admin_1');
    expect(user.status).toBe('AWAITING_SETUP_FEE');
    expect(user.identityVerifiedAt).toBeInstanceOf(Date);
    expect(h.notifications.created[0]?.event).toBe(NOTIFICATION_EVENTS.IDENTITY_VERIFIED);
  });

  it('tells the member why a document was refused and leaves the account where it was', async () => {
    const h = harness();
    const identity = h.seedIdentity({ provider: 'MANUAL_DOCUMENT' });
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');

    await h.service(gateway()).decideManualVerification({
      verificationId: identity.id,
      decision: 'REJECT',
      note: 'The photograph is too blurred to read.',
      adminId: 'admin_1',
    });

    expect(identity.status).toBe('FAILED');
    expect(identity.failureCode).toBe('MANUAL_DOCUMENT_REJECTED');
    expect(identity.failureReason).toBe('The photograph is too blurred to read.');
    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(user.identityVerifiedAt).toBeNull();
    expect(h.notifications.created[0]?.event).toBe(
      NOTIFICATION_EVENTS.IDENTITY_VERIFICATION_FAILED,
    );
  });

  it('refuses to decide a DigiLocker check', async () => {
    const h = harness();
    const identity = h.seedIdentity();

    await expect(
      h.service(gateway()).decideManualVerification({
        verificationId: identity.id,
        decision: 'APPROVE',
        adminId: 'admin_1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(identity.status).toBe('PENDING');
  });

  it('refuses a check that is no longer awaiting review', async () => {
    const h = harness();
    const identity = h.seedIdentity({ provider: 'MANUAL_DOCUMENT', status: 'FAILED' });

    await expect(
      h.service(gateway()).decideManualVerification({
        verificationId: identity.id,
        decision: 'APPROVE',
        adminId: 'admin_1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(identity.status).toBe('FAILED');
  });

  it('treats a second approval as the same outcome', async () => {
    const h = harness();
    const identity = h.seedIdentity({ provider: 'MANUAL_DOCUMENT' });
    h.seedUser('u1', 'PENDING_VERIFICATION');
    const service = h.service(gateway());

    await service.decideManualVerification({
      verificationId: identity.id,
      decision: 'APPROVE',
      adminId: 'admin_1',
    });
    await service.decideManualVerification({
      verificationId: identity.id,
      decision: 'APPROVE',
      adminId: 'admin_2',
    });

    // Announced once: the second administrator asked for what already happened.
    expect(h.notifications.created).toHaveLength(1);
    expect(identity.reviewedByAdminId).toBe('admin_1');
  });
});

/**
 * The recovery sweep.
 *
 * Cashfree recorded a result and its webhook was lost to a cold start. These
 * tests pin what the sweep may do with what the supplier reports: apply a
 * resolved outcome through the same transition the webhook uses, and leave an
 * unfinished session — or an unreachable supplier — exactly where it is.
 */
describe('VerificationService.reconcilePending', () => {
  const LAPSED = new Date('2026-10-04T09:00:00.000Z');

  it('applies a pass the supplier recorded for an attempt whose webhook never arrived', async () => {
    const h = harness();
    const identity = h.seedIdentity({ providerReferenceExpiresAt: LAPSED });
    const user = h.seedUser('u1', 'PENDING_VERIFICATION');
    const reads: string[] = [];

    const summary = await h
      .service(
        gateway({
          fetchDigiLockerStatus: async (input) => {
            reads.push(input.verificationId);
            return { status: 'AUTHENTICATED', userDetails: { name: 'Asha R', dob: '01-02-1990' } };
          },
        }),
      )
      .reconcilePending();

    expect(summary).toMatchObject({ checked: 1, settled: 1, pending: 0, failed: 0 });
    // Read by our own row id: the supplier is asked about this attempt, not
    // about a phone number or a name.
    expect(reads).toEqual([identity.id]);
    expect(identity.status).toBe('VERIFIED');
    expect(identity.nameOnId).toBe('Asha R');
    expect(identity.yearOfBirth).toBe(1990);
    expect(user.status).toBe('AWAITING_SETUP_FEE');
    expect(user.identityVerifiedAt).toBeInstanceOf(Date);
    expect(h.notifications.created[0]).toMatchObject({
      event: NOTIFICATION_EVENTS.IDENTITY_VERIFIED,
      userId: 'u1',
      channel: 'PUSH',
    });
  });

  it('records a refused consent as FAILED without repeating the vendor word to the member', async () => {
    const h = harness();
    const identity = h.seedIdentity({ providerReferenceExpiresAt: LAPSED });
    h.seedUser('u1', 'PENDING_VERIFICATION');

    const summary = await h
      .service(gateway({ fetchDigiLockerStatus: async () => ({ status: 'CONSENT_DENIED' }) }))
      .reconcilePending();

    expect(summary.settled).toBe(1);
    expect(identity.status).toBe('FAILED');
    expect(identity.failureCode).toBe('CONSENT_DENIED');
    expect(h.notifications.created[0]?.event).toBe(
      NOTIFICATION_EVENTS.IDENTITY_VERIFICATION_FAILED,
    );
    expect(h.notifications.created[0]?.body).not.toContain('CONSENT_DENIED');
  });

  it('leaves a session the member has not finished untouched', async () => {
    const h = harness();
    const identity = h.seedIdentity({ providerReferenceExpiresAt: LAPSED });
    h.seedUser('u1', 'PENDING_VERIFICATION');

    const summary = await h.service(gateway()).reconcilePending();

    expect(summary).toMatchObject({ checked: 1, settled: 0, pending: 1, failed: 0 });
    expect(identity.status).toBe('PENDING');
    expect(h.notifications.created).toHaveLength(0);
  });

  it('does not ask about a session whose consent link is still live', async () => {
    const h = harness();
    h.seedIdentity({ providerReferenceExpiresAt: new Date(Date.now() + 5 * 60_000) });
    const reads: string[] = [];

    const summary = await h
      .service(
        gateway({
          fetchDigiLockerStatus: async (input) => {
            reads.push(input.verificationId);
            return { status: 'AUTHENTICATED' };
          },
        }),
      )
      .reconcilePending();

    expect(summary.checked).toBe(0);
    expect(reads).toHaveLength(0);
  });

  it('never reads a manual check: a person decides those', async () => {
    const h = harness();
    h.seedIdentity({
      provider: 'MANUAL_DOCUMENT',
      vendor: null,
      providerReference: null,
      providerReferenceExpiresAt: LAPSED,
    });
    const reads: string[] = [];

    const summary = await h
      .service(
        gateway({
          fetchDigiLockerStatus: async (input) => {
            reads.push(input.verificationId);
            return { status: 'AUTHENTICATED' };
          },
        }),
      )
      .reconcilePending();

    expect(summary.checked).toBe(0);
    expect(reads).toHaveLength(0);
  });

  it('logs one line for a whole sweep of refusals, not one per attempt', async () => {
    const h = harness();
    const first = h.seedIdentity({ userId: 'u1', providerReferenceExpiresAt: LAPSED });
    h.seedIdentity({ userId: 'u2', providerReferenceExpiresAt: LAPSED });
    h.seedIdentity({ userId: 'u3', providerReferenceExpiresAt: LAPSED });
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    try {
      const summary = await h
        .service(
          gateway({
            fetchDigiLockerStatus: async () => {
              throw new Error('Cashfree DigiLocker status failed (HTTP 403): IP not allowed');
            },
          }),
        )
        .reconcilePending();

      expect(summary).toMatchObject({ checked: 3, settled: 0, failed: 3 });
      // Cashfree refusing the host's IPs fails every attempt for the same
      // reason; three identical lines per sweep would bury the signal.
      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0][0]).toBe(
        '[reconcile] identity: could not read 3 attempts from Cashfree; will retry on the next sweep. ' +
          'Cashfree DigiLocker status failed (HTTP 403): IP not allowed',
      );
      expect(first.status).toBe('PENDING');
    } finally {
      error.mockRestore();
    }
  });

  it('survives an unreachable supplier and leaves the row for the next sweep', async () => {
    const h = harness();
    const identity = h.seedIdentity({ providerReferenceExpiresAt: LAPSED });

    const summary = await h
      .service(
        gateway({
          fetchDigiLockerStatus: async () => {
            throw new Error('Cashfree DigiLocker status failed (HTTP 403): IP not whitelisted');
          },
        }),
      )
      .reconcilePending();

    expect(summary).toMatchObject({ checked: 1, settled: 0, failed: 1 });
    expect(identity.status).toBe('PENDING');
  });

  it('asks nothing when the supplier is not configured', async () => {
    const h = harness();
    h.seedIdentity({ providerReferenceExpiresAt: LAPSED });
    const reads: string[] = [];

    const summary = await h
      .service(
        gateway({
          configured: false,
          fetchDigiLockerStatus: async (input) => {
            reads.push(input.verificationId);
            return { status: 'AUTHENTICATED' };
          },
        }),
      )
      .reconcilePending();

    expect(summary).toEqual({ checked: 0, settled: 0, pending: 0, failed: 0 });
    expect(reads).toHaveLength(0);
  });
});
