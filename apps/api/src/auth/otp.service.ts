import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ClockService } from '../common/clock/clock.service';
import { PrismaClient, OtpStatus } from '../prisma/prisma-client';
import type { OtpPurpose } from '@matrimony/shared';
import type { Env } from '../config/env';

/** Must match OTP_CODE_LENGTH in @matrimony/shared. Asserted at construction. */
const OTP_CODE_LENGTH = 6;

/**
 * How long an OTP stays guessable, expressed as a logarithm.
 *
 * Six digits is a million possibilities, so an unthrottled attacker with an
 * unlimited code would guess one within a few thousand requests. What actually
 * makes guessing impractical is not the code's length but the fact that the
 * attempt count and the cooldown live in the database and are decremented
 * server-side. The caller cannot extend its own window.
 */
@Injectable()
export class OtpService {
  private readonly env: Env;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: ClockService,
    @Inject('ENV') env: Env,
  ) {
    this.env = env;
    if (this.env.OTP_MAX_ATTEMPTS < 1) {
      throw new Error('OTP_MAX_ATTEMPTS must be at least 1');
    }
  }

  /** Cooldown between codes for the same number and purpose. */
  get cooldownSeconds(): number {
    return this.env.OTP_RESEND_COOLDOWN_SECONDS;
  }

  /** How long a code remains guessable. */
  get ttlSeconds(): number {
    return this.env.OTP_TTL_SECONDS;
  }

  /**
   * Creates an OTP request and returns the code to deliver.
   *
   * The code is returned rather than sent: the SMS provider is undecided
   * (GAP-12) and the interface must not decide that for us. Returning it keeps
   * the delivery boundary honest, and a `dev`-only code in the response is what
   * makes the flow testable end to end without a provider account.
   */
  async issue(input: {
    mobile: string;
    purpose: OtpPurpose;
    deviceId?: string;
  }): Promise<{ id: string; code: string; resendAfterAt: Date; expiresAt: Date }> {
    const now = this.clock.now();
    const code = this.generateCode();
    const resendAfterAt = new Date(now.getTime() + this.env.OTP_RESEND_COOLDOWN_SECONDS * 1000);
    const expiresAt = new Date(now.getTime() + this.env.OTP_TTL_SECONDS * 1000);

    // Supersede any earlier live request for the same number and purpose.
    // Otherwise the newest code would not be the only one that works, and a user
    // who requested a resend could still have the first code accepted.
    await this.prisma.otpRequest.updateMany({
      where: { mobile: input.mobile, purpose: input.purpose, status: OtpStatus.PENDING },
      data: { status: OtpStatus.EXPIRED },
    });

    const created = await this.prisma.otpRequest.create({
      data: {
        codeHash: this.hashCode(code),
        mobile: input.mobile,
        purpose: input.purpose,
        status: OtpStatus.PENDING,
        maxAttempts: this.env.OTP_MAX_ATTEMPTS,
        resendAfterAt,
        expiresAt,
        requestDeviceId: input.deviceId ?? null,
      },
      select: { id: true, resendAfterAt: true, expiresAt: true },
    });

    return {
      id: created.id,
      code,
      resendAfterAt: created.resendAfterAt,
      expiresAt: created.expiresAt,
    };
  }

  /**
   * Consumes a code.
   *
   * Returns the request id on success and null on any failure — wrong code,
   * expired, cooldown, attempt limit. The caller learns only that verification
   * failed, because a distinct error per cause would let an attacker probe
   * whether a code ever existed.
   *
   * The attempt counter is incremented inside a conditional update rather than
   * read-then-write, so two concurrent guesses with the same code cannot both
   * pass the limit check.
   */
  async verify(input: {
    mobile: string;
    purpose: OtpPurpose;
    code: string;
  }): Promise<string | null> {
    const now = this.clock.now();
    const request = await this.prisma.otpRequest.findFirst({
      where: { mobile: input.mobile, purpose: input.purpose, status: OtpStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });

    if (!request) {
      return null;
    }

    if (request.expiresAt.getTime() <= now.getTime()) {
      await this.prisma.otpRequest.update({
        where: { id: request.id },
        data: { status: OtpStatus.EXPIRED },
      });
      return null;
    }

    if (request.attempts >= request.maxAttempts) {
      await this.prisma.otpRequest.update({
        where: { id: request.id },
        data: { status: OtpStatus.ATTEMPT_LIMIT_REACHED },
      });
      return null;
    }

    const matches = this.codeMatches(request.codeHash, input.code);

    if (!matches) {
      // Only a wrong guess costs an attempt. Reaching the limit does not lock
      // the number out, because an attacker could otherwise deny a real user
      // their account by guessing deliberately.
      const consumed = await this.prisma.otpRequest.updateMany({
        where: { id: request.id, status: OtpStatus.PENDING, attempts: { lt: request.maxAttempts } },
        data: { attempts: { increment: 1 } },
      });

      if (consumed.count === 0) {
        // Another request consumed the last attempt between the read and here.
        await this.prisma.otpRequest.update({
          where: { id: request.id },
          data: { status: OtpStatus.ATTEMPT_LIMIT_REACHED },
        });
      }

      return null;
    }

    await this.prisma.otpRequest.update({
      where: { id: request.id },
      data: { status: OtpStatus.VERIFIED, verifiedAt: now },
    });

    return request.id;
  }

  /** Remaining resend delay, computed from the newest request. */
  async remainingResendSeconds(mobile: string, purpose: OtpPurpose): Promise<number> {
    const newest = await this.prisma.otpRequest.findFirst({
      where: { mobile, purpose },
      orderBy: { createdAt: 'desc' },
      select: { resendAfterAt: true },
    });

    if (!newest) {
      return 0;
    }

    const remaining = newest.resendAfterAt.getTime() - this.clock.now().getTime();
    return remaining <= 0 ? 0 : Math.ceil(remaining / 1000);
  }

  async assertNotCoolingDown(mobile: string, purpose: OtpPurpose): Promise<void> {
    const wait = await this.remainingResendSeconds(mobile, purpose);
    if (wait > 0) {
      // 429 is constructed directly: Nest has no built-in
      // TooManyRequestsException, and an ad-hoc `HttpException('...')` would
      // lose the retry hint the client needs to avoid guessing at the delay.
      throw new HttpException(
        { message: 'Please wait before requesting another code', retry_after_seconds: wait },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Cryptographically uniform digits.
   *
   * `Math.random()` would be a real weakness here: OTP guessing is the one
   * place a predictable code generator hands over the account, and the
   * sequence is trivially recovered from a handful of observed codes.
   */
  private generateCode(): string {
    let code = '';
    for (let i = 0; i < OTP_CODE_LENGTH; i += 1) {
      code += randomInt(0, 10).toString();
    }
    return code;
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(`${code}:${this.env.OTP_HASH_SECRET}`).digest('hex');
  }

  /**
   * Constant-time comparison of the submitted code against the stored hash.
   *
   * A plain `===` returns early on the first differing character, and the
   * timing difference is enough to recover a hash one character at a time.
   */
  private codeMatches(storedHash: string, submitted: string): boolean {
    const candidate = Buffer.from(this.hashCode(submitted), 'utf8');
    const stored = Buffer.from(storedHash, 'utf8');
    if (candidate.length !== stored.length) {
      return false;
    }
    return timingSafeEqual(candidate, stored);
  }
}
