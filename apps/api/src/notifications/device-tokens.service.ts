import { Injectable } from '@nestjs/common';
import { PrismaClient } from '../prisma/prisma-client';
import type { DeviceTokenResponse, RegisterDeviceTokenRequest } from '@matrimony/shared';

/**
 * Push device registration (section 42).
 *
 * Registration is an upsert on the token, not a create. FCM issues one token per
 * app instance and reissues it on reinstall, and a token can outlive the account
 * that registered it — so the same token may arrive from a second user who has
 * just signed in on the same device. Upserting and reassigning `userId` is what
 * keeps a stale owner from continuing to receive another account's pushes.
 */
@Injectable()
export class DeviceTokensService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(
    userId: string,
    input: RegisterDeviceTokenRequest,
  ): Promise<DeviceTokenResponse> {
    // One server-side timestamp for the upsert, so "create" and "update" cannot
    // disagree about when the device was last seen.
    const now = new Date();
    const row = await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: {
        userId,
        token: input.token,
        platform: input.platform,
        deviceId: input.device_id ?? null,
        lastSeenAt: now,
      },
      update: {
        userId,
        platform: input.platform,
        deviceId: input.device_id ?? null,
        lastSeenAt: now,
      },
    });
    return toResponse(row);
  }

  /**
   * Remove a token, scoped to its owner so one account cannot unregister
   * another's device. Silent when nothing matched (a repeated logout, or a
   * token already pruned by a failed send), because "it is gone" is the goal.
   */
  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token, userId } });
  }

  async listForUser(userId: string): Promise<DeviceTokenResponse[]> {
    const rows = await this.prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map(toResponse);
  }
}

/** Maps the row to the contract, dropping the token itself (never echoed). */
function toResponse(row: {
  id: string;
  platform: string;
  deviceId: string | null;
  lastSeenAt: Date;
  createdAt: Date;
}): DeviceTokenResponse {
  return {
    id: row.id,
    platform: row.platform as DeviceTokenResponse['platform'],
    device_id: row.deviceId,
    last_seen_at: row.lastSeenAt,
    created_at: row.createdAt,
  };
}
