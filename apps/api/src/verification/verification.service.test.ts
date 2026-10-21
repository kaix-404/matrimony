import { VerificationService } from './verification.service';

/**
 * D9 turns on this one transition: a passed ID check is the only thing that
 * may move an account from PENDING_VERIFICATION to AWAITING_SETUP_FEE. The
 * service is tested against the ways that could go wrong — a failed check, a
 * replayed success, and a late success against an account that has already
 * left the funnel.
 */
interface FakeIdentity {
  id: string;
  userId: string;
  providerReference: string | null;
  status: string;
  verifiedAt: Date | null;
  failureReason: string | null;
  failureCode: string | null;
}

interface FakeUser {
  id: string;
  status: string;
  identityVerifiedAt: Date | null;
  statusChangedAt: Date | null;
  statusChangeReason: string | null;
}

function harness() {
  const identities: FakeIdentity[] = [];
  const users: FakeUser[] = [];
  let identitySeq = 1;

  const prisma = {
    identityVerification: {
      findFirst: async ({ where }: { where: { providerReference: string } }) =>
        identities.find((i) => i.providerReference === where.providerReference) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeIdentity>;
      }) => {
        const row = identities.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    user: {
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
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
  };

  const service = new VerificationService(prisma as never);

  return {
    users,
    service,
    seedIdentity(reference: string, userId = 'u1'): FakeIdentity {
      const row: FakeIdentity = {
        id: `i${identitySeq++}`,
        userId,
        providerReference: reference,
        status: 'PENDING',
        verifiedAt: null,
        failureReason: null,
        failureCode: null,
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
  };
}

describe('VerificationService.handleWebhook', () => {
  it('advances a PENDING_VERIFICATION user to AWAITING_SETUP_FEE on success', async () => {
    const { service, users, seedIdentity, seedUser } = harness();
    seedIdentity('ref-1');
    const user = seedUser('u1', 'PENDING_VERIFICATION');

    await service.handleWebhook({ data: { providerReference: 'ref-1', status: 'SUCCESS' } } as never);

    expect(user.status).toBe('AWAITING_SETUP_FEE');
    expect(user.identityVerifiedAt).toBeInstanceOf(Date);
    expect(user.statusChangedAt).toBeInstanceOf(Date);
    expect(users).toHaveLength(1);
  });

  it('leaves the account untouched when the check fails', async () => {
    const { service, users, seedIdentity, seedUser } = harness();
    const identity = seedIdentity('ref-2');
    const user = seedUser('u1', 'PENDING_VERIFICATION');

    await service.handleWebhook({
      data: { providerReference: 'ref-2', status: 'FAILED', failureReason: 'NAME_MISMATCH' },
    } as never);

    expect(user.status).toBe('PENDING_VERIFICATION');
    expect(user.identityVerifiedAt).toBeNull();
    expect(identity.status).toBe('FAILED');
    expect(identity.failureReason).toBe('NAME_MISMATCH');
    expect(users).toHaveLength(1);
  });

  it('does not pull an ACTIVE account back through the funnel on a replayed success', async () => {
    const { service, seedIdentity, seedUser } = harness();
    seedIdentity('ref-3');
    const user = seedUser('u1', 'ACTIVE');
    user.identityVerifiedAt = new Date();

    await service.handleWebhook({ data: { providerReference: 'ref-3', status: 'SUCCESS' } } as never);

    expect(user.status).toBe('ACTIVE');
  });

  it('ignores an unknown provider reference', async () => {
    const { service, users } = harness();

    await service.handleWebhook({ data: { providerReference: 'nope', status: 'SUCCESS' } } as never);

    expect(users).toHaveLength(0);
  });

  it('ignores a webhook with no provider reference at all', async () => {
    const { service, users } = harness();

    await service.handleWebhook({ data: { status: 'SUCCESS' } } as never);

    expect(users).toHaveLength(0);
  });
});
