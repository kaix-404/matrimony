import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient, ConsentType, ConsentStatus } from '../prisma/prisma-client';
import {
  DIGILOCKER_EVENTS,
  type IdentityVerificationProvider,
  type IdentityVerificationStatus,
  type InitiateVerificationRequest,
  type VerificationStatusResponse,
  type VerificationWebhook,
} from '@matrimony/shared';
import { VerificationGateway } from './verification.gateway';

/**
 * One code for every cause, because the user's situation is the same in all of
 * them: the check cannot be started right now. The vendor diagnostic stays in
 * the log, where an operator can act on it.
 */
const VERIFICATION_UNAVAILABLE_CODE = 'VERIFICATION_UNAVAILABLE';

/** The version recorded when a client does not name one. */
const DEFAULT_POLICY_VERSION = 'v1';

/**
 * D9 makes identity verification mandatory: a VERIFIED check is the only thing
 * that moves an account from PENDING_VERIFICATION to AWAITING_SETUP_FEE.
 *
 * Two properties matter more than the happy path:
 *
 *   * Consent is captured *before* the supplier is called, and the record is
 *     referenced from the verification row, so the ordering H3 requires is
 *     auditable rather than implied.
 *   * A webhook is applied only to the verification row this server created,
 *     and a passed check is never downgraded afterwards. A replayed success, a
 *     late expiry, or an event for somebody else's attempt cannot move an
 *     account back through the funnel or revoke a check that already passed.
 */
@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly gateway: VerificationGateway,
  ) {}

  /**
   * Starts a DigiLocker attempt and returns the consent URL to open.
   *
   * The row is written before the supplier is called because its id *is* the
   * `verification_id` Cashfree is given. If the process dies between the two
   * writes the attempt is simply PENDING with no reference, which the next
   * initiate replaces — whereas calling the supplier first would leave a
   * session in the vendor that no row could be matched to.
   */
  async initiateVerification(
    userId: string,
    body: InitiateVerificationRequest,
  ): Promise<VerificationStatusResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // D2/D9: DigiLocker is the approved method. AADHAAR_UIDAI needs an AUA/KUA
    // licence we do not hold, so accepting it here would record an attempt that
    // could never be completed.
    if (body.provider !== 'DIGILOCKER') {
      throw new BadRequestException('Only DigiLocker verification is available');
    }

    if (!this.gateway.configured) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: VERIFICATION_UNAVAILABLE_CODE,
        message: 'Identity verification is temporarily unavailable; please try again shortly.',
      });
    }

    // A passed check is final. Re-running it would collect Aadhaar consent
    // again for no reason and could replace a VERIFIED row with PENDING just
    // because the user tapped the button twice.
    const existing = await this.prisma.identityVerification.findUnique({ where: { userId } });
    if (existing?.status === 'VERIFIED') return this.toResponse(existing);

    const now = new Date();

    const consent = await this.prisma.consentRecord.create({
      data: {
        userId,
        type: ConsentType.AADHAAR_PROCESSING,
        status: ConsentStatus.GRANTED,
        policyVersion: body.policy_version ?? DEFAULT_POLICY_VERSION,
        grantedAt: now,
        deviceId: null,
      },
    });

    const identity = await this.prisma.identityVerification.upsert({
      where: { userId },
      create: {
        userId,
        provider: body.provider as never,
        vendor: 'CASHFREE' as never,
        status: 'PENDING' as never,
        consentRecordId: consent.id,
      },
      update: {
        provider: body.provider as never,
        vendor: 'CASHFREE' as never,
        status: 'PENDING' as never,
        consentRecordId: consent.id,
        // A fresh attempt invalidates the previous verdict and reference: the
        // old URL has expired, and leaving `verifiedAt` set on a row that is
        // now PENDING would report a pass that no longer has a session.
        verifiedAt: null,
        failureCode: null,
        failureReason: null,
        providerReference: null,
        providerReferenceExpiresAt: null,
        updatedAt: now,
      },
    });

    let session;
    try {
      session = await this.gateway.createDigiLockerSession({ verificationId: identity.id });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`DigiLocker session not created: ${detail}`);
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: VERIFICATION_UNAVAILABLE_CODE,
        message: 'Identity verification is temporarily unavailable; please try again shortly.',
      });
    }

    const updated = await this.prisma.identityVerification.update({
      where: { id: identity.id },
      data: {
        providerReference: session.providerReference,
        providerReferenceExpiresAt: session.expiresAt,
        updatedAt: now,
      },
    });

    return { ...this.toResponse(updated), redirect_url: session.url };
  }

  /**
   * The caller's verification state.
   *
   * An account that has never started is `NOT_STARTED` rather than a 404: the
   * absence of a row is a normal state of the funnel, and answering it with an
   * error would make the app treat its own first visit as a failure.
   */
  async getVerificationStatus(userId: string): Promise<VerificationStatusResponse> {
    const identity = await this.prisma.identityVerification.findUnique({ where: { userId } });
    if (!identity) {
      return {
        status: 'NOT_STARTED',
        provider: null,
        vendor: null,
        aadhaarLast4: null,
        nameOnId: null,
        yearOfBirth: null,
        failureCode: null,
        failureReason: null,
        verifiedAt: null,
        providerReferenceExpiresAt: null,
      };
    }
    return this.toResponse(identity);
  }

  /**
   * Applies a signed DigiLocker webhook.
   *
   * The caller has already verified the signature over the raw body; this
   * method is about *effect*. Unknown events are logged and ignored: Cashfree
   * adds events without warning, and a new event type must never become an
   * error the vendor retries forever.
   */
  async handleWebhook(body: VerificationWebhook): Promise<void> {
    const data = body.data ?? {};

    const verificationId =
      data.verification_id !== undefined ? String(data.verification_id) : undefined;
    const referenceId = data.reference_id !== undefined ? String(data.reference_id) : undefined;

    const identity = verificationId
      ? await this.prisma.identityVerification.findUnique({ where: { id: verificationId } })
      : referenceId
        ? await this.prisma.identityVerification.findFirst({
            where: { providerReference: referenceId },
          })
        : null;

    if (!identity) {
      // Not an error to the sender: a retry cannot fix a reference we do not
      // know, and a 4xx would make Cashfree replay the same event.
      this.logger.warn(
        `DigiLocker webhook ${body.event_type} for an unknown verification (verification_id=${verificationId ?? 'none'}, reference_id=${referenceId ?? 'none'})`,
      );
      return;
    }

    const next = statusForEvent(body.event_type);
    if (!next) {
      this.logger.log(`Ignoring DigiLocker webhook ${body.event_type}`);
      return;
    }

    // A passed check is final in this direction: a later expiration or failure
    // event must not take verification away from an account that has it, or a
    // user would silently lose access after a successful check.
    if (identity.status === 'VERIFIED') {
      this.logger.log(
        `Ignoring ${body.event_type} for verification ${identity.id}: already VERIFIED`,
      );
      return;
    }

    const now = new Date();
    const details = data.user_details ?? {};

    await this.prisma.$transaction(async (tx) => {
      await tx.identityVerification.update({
        where: { id: identity.id },
        data:
          next === 'VERIFIED'
            ? {
                status: 'VERIFIED' as never,
                verifiedAt: now,
                failureCode: null,
                failureReason: null,
                nameOnId: details.name ?? identity.nameOnId,
                yearOfBirth: parseBirthYear(details.dob) ?? identity.yearOfBirth,
                updatedAt: now,
              }
            : {
                status: next as never,
                verifiedAt: null,
                failureCode: body.event_type,
                failureReason: data.status ?? null,
                updatedAt: now,
              },
      });

      if (next !== 'VERIFIED') return;

      // Guarded on PENDING_VERIFICATION so a replayed or late webhook cannot
      // pull an already-ACTIVE (or suspended/deleted) account back through the
      // funnel.
      await tx.user.updateMany({
        where: { id: identity.userId, status: 'PENDING_VERIFICATION' },
        data: {
          identityVerifiedAt: now,
          status: 'AWAITING_SETUP_FEE',
          statusChangedAt: now,
          statusChangeReason:
            'Identity verification passed; awaiting the one-time account setup fee.',
        },
      });
    });

    this.logger.log(`DigiLocker ${body.event_type} applied to verification ${identity.id}: ${next}`);
  }

  private toResponse(identity: {
    status: unknown;
    provider: unknown;
    vendor: unknown;
    aadhaarLast4: string | null;
    nameOnId: string | null;
    yearOfBirth: number | null;
    failureCode: string | null;
    failureReason: string | null;
    verifiedAt: Date | null;
    providerReferenceExpiresAt: Date | null;
  }): VerificationStatusResponse {
    return {
      status: identity.status as IdentityVerificationStatus,
      provider: identity.provider as IdentityVerificationProvider,
      vendor: identity.vendor as VerificationStatusResponse['vendor'],
      aadhaarLast4: identity.aadhaarLast4,
      nameOnId: identity.nameOnId,
      yearOfBirth: identity.yearOfBirth,
      failureCode: identity.failureCode,
      failureReason: identity.failureReason,
      verifiedAt: identity.verifiedAt?.toISOString() ?? null,
      providerReferenceExpiresAt: identity.providerReferenceExpiresAt?.toISOString() ?? null,
    };
  }
}

/**
 * Which stored status an event produces, or null for an event with no effect
 * on verification state.
 *
 * The DigiLocker flow reports consent as `AUTHENTICATED` rather than
 * `VERIFIED`, which is why the event name — not `data.status` — is the
 * authority here.
 */
function statusForEvent(eventType: string): 'VERIFIED' | 'FAILED' | 'EXPIRED' | null {
  switch (eventType) {
    case DIGILOCKER_EVENTS.success:
      return 'VERIFIED';
    case DIGILOCKER_EVENTS.failure:
    case DIGILOCKER_EVENTS.consentDenied:
      return 'FAILED';
    case DIGILOCKER_EVENTS.linkExpired:
    case DIGILOCKER_EVENTS.consentExpired:
      return 'EXPIRED';
    default:
      return null;
  }
}

/**
 * `user_details.dob` arrives as `DD-MM-YYYY` (Cashfree's sample) and
 * occasionally as an ISO date. Only the year is stored: the profile already
 * holds the birth date, and this value exists to warn the user about a
 * mismatch, not to assert identity.
 */
export function parseBirthYear(dob: string | undefined): number | null {
  if (!dob) return null;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dob);
  if (dmy) return Number(dmy[3]);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (iso) return Number(iso[1]);
  return null;
}
