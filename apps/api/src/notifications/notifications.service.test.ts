import { NotificationsService } from './notifications.service';

/**
 * Notification delivery-state tests — section 42.
 *
 * `NotificationsService` is the only writer of the delivery states, and each
 * transition is one-way: a `SENT` row that is not stamped with `sentAt`, or a
 * `FAILED` row whose error text is dropped, leaves an operator unable to tell
 * whether a notification actually reached anyone. These tests pin the fields
 * each transition is responsible for, and the cursor paging that the user-facing
 * list depends on.
 */

interface Row {
  id: string;
  userId: string | null;
  event: string;
  channel: string;
  status: string;
  title: string;
  body: string;
  isCritical: boolean;
  attempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  sentAt: Date | null;
  createdByAdminId: string | null;
  createdAt: Date;
}

class FakePrisma {
  rows: Row[] = [];

  notification = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row: Row = {
        id: `n${this.rows.length + 1}`,
        providerMessageId: null,
        lastError: null,
        sentAt: null,
        createdByAdminId: null,
        attempts: 0,
        createdAt: new Date('2026-10-13T00:00:00.000Z'),
        ...(data as unknown as Partial<Row>),
      } as Row;
      this.rows.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.rows.find((r) => r.id === where.id);
      if (!row) throw new Error('row not found');
      const increments = (data['attempts'] as { increment: number } | undefined)?.increment ?? 0;
      const rest: Record<string, unknown> = { ...data };
      delete rest['attempts'];
      Object.assign(row, rest);
      row.attempts += increments;
      return row;
    },
    findMany: async ({
      take,
      cursor,
      skip,
    }: {
      take: number;
      cursor?: { id: string };
      skip: number;
    }) => {
      const ordered = [...this.rows].sort((a, b) => (a.id < b.id ? 1 : -1));
      let start = 0;
      if (cursor) {
        const at = ordered.findIndex((r) => r.id === cursor.id);
        start = at + skip;
      }
      return ordered.slice(start, start + take);
    },
  };

  seed(count: number, userId = 'u1'): void {
    for (let i = 0; i < count; i += 1) {
      this.rows.push({
        id: `n${i + 1}`,
        userId,
        event: 'SYSTEM_ANNOUNCEMENT',
        channel: 'IN_APP',
        status: 'PENDING',
        title: `t${i}`,
        body: `b${i}`,
        isCritical: false,
        attempts: 0,
        providerMessageId: null,
        lastError: null,
        sentAt: null,
        createdByAdminId: null,
        createdAt: new Date('2026-10-13T00:00:00.000Z'),
      });
    }
  }
}

function setup() {
  const prisma = new FakePrisma();
  return { prisma, service: new NotificationsService(prisma as never) };
  }

describe('NotificationsService.create', () => {
  it('records a PENDING row and defaults the audience and criticality', async () => {
    const { service } = setup();
    const created = await service.create({
      event: 'SYSTEM_ANNOUNCEMENT',
      channel: 'IN_APP',
      title: 'Hello',
      body: 'World',
    });
    expect(created.status).toBe('PENDING');
    expect(created.userId).toBeNull();
    expect(created.isCritical).toBe(false);
  });

  it('carries an explicit audience and critical flag through', async () => {
    const { service } = setup();
    const created = await service.create({
      userId: 'u1',
      event: 'ACCOUNT_SUSPENDED',
      channel: 'EMAIL',
      title: 'Suspended',
      body: 'Your account is suspended.',
      isCritical: true,
    });
    expect(created.userId).toBe('u1');
    expect(created.isCritical).toBe(true);
  });
});

describe('NotificationsService delivery transitions', () => {
  it('markSent stamps sentAt, the provider id and increments attempts', async () => {
    const { service } = setup();
    const created = await service.create({
      event: 'SYSTEM_ANNOUNCEMENT',
      channel: 'PUSH',
      title: 't',
      body: 'b',
    });
    const sent = await service.markSent(created.id, 'fcm-123');
    expect(sent.status).toBe('SENT');
    expect(sent.providerMessageId).toBe('fcm-123');
    expect(sent.sentAt).toBeInstanceOf(Date);
    expect(sent.attempts).toBe(1);
  });

  it('markFailed keeps the error text so the failure is diagnosable', async () => {
    const { service } = setup();
    const created = await service.create({
      event: 'SYSTEM_ANNOUNCEMENT',
      channel: 'SMS',
      title: 't',
      body: 'b',
    });
    const failed = await service.markFailed(created.id, 'provider timeout');
    expect(failed.status).toBe('FAILED');
    expect(failed.lastError).toBe('provider timeout');
    expect(failed.attempts).toBe(1);
  });

  it('markSuppressed records the reason without counting an attempt', async () => {
    const { service } = setup();
    const created = await service.create({
      event: 'SYSTEM_ANNOUNCEMENT',
      channel: 'EMAIL',
      title: 't',
      body: 'b',
    });
    const suppressed = await service.markSuppressed(created.id, 'user opted out');
    expect(suppressed.status).toBe('SUPPRESSED');
    expect(suppressed.lastError).toBe('user opted out');
    expect(suppressed.attempts).toBe(0);
  });
});

describe('NotificationsService.listForUser', () => {
  it('returns a page and a cursor when more rows exist', async () => {
    const { prisma, service } = setup();
    prisma.seed(5);
    const page = await service.listForUser('u1', 2);
    expect(page.notifications).toHaveLength(2);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('n4');
  });

  it('reports no more pages on the final page', async () => {
    const { prisma, service } = setup();
    prisma.seed(2);
    const page = await service.listForUser('u1', 5);
    expect(page.notifications).toHaveLength(2);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('resumes after the supplied cursor', async () => {
    const { prisma, service } = setup();
    prisma.seed(5);
    const page = await service.listForUser('u1', 2, 'n5');
    expect(page.notifications.map((n) => n.id)).toEqual(['n4', 'n3']);
  });
});
