import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient, ConsentType, ConsentStatus } from '../prisma/prisma-client';
import {
  DIGILOCKER_EVENTS,
  MANUAL_DOCUMENT_MIME_TYPES,
  MAX_MANUAL_DOCUMENT_BYTES,
  NOTIFICATION_EVENTS,
  type IdentityVerificationProvider,
  type IdentityVerificationStatus,
  type InitiateVerificationRequest,
  type SubmitManualDocumentInput,
  type VerificationStatusResponse,
  type VerificationWebhook,
} from '@matrimony/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/s3.service';
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
 * `failureCode` written when an administrator refuses a document.
 *
 * A code rather than the note, because the note is prose for the member and this
 * column is what a support query filters on. The reason they were given lives in
 * `failureReason`.
 */
const MANUAL_REJECTION_CODE = 'MANUAL_DOCUMENT_REJECTED';

/** What the member is told when a reviewer rejects without saying why. */
const DEFAULT_MANUAL_REJECTION =
  'The document could not be accepted. Please upload a clearer copy of your Aadhaar.';

/**
 * Bounds on the recovery sweep, chosen for the deployment this runs on.
 *
 * The API is on Render's free plan, where an idle instance sleeps and the next
 * request waits for a cold start that runs migrations first. A DigiLocker
 * webhook sent into that window can outlast Cashfree's retries, leaving an
 * attempt that passed at the supplier and is still PENDING here — the member is
 * asked to verify again for a check that already succeeded.
 *
 * `graceMs` keeps the sweep away from sessions the member may still be inside;
 * a consent link lives ten minutes, so a sweep only looks at attempts whose link
 * has lapsed. `lookbackMs` bounds the query to recent attempts, and `batch`
 * keeps one sweep to a handful of supplier calls.
 */
const RECONCILE = {
  graceMs: 2 * 60_000,
  lookbackMs: 7 * 24 * 60 * 60_000,
  batch: 25,
} as const;

/** What one sweep did, so the caller can put a single line in the log. */
export interface VerificationReconcileSummary {
  /** Attempts that were due for a check. */
  checked: number;
  /** Attempts the supplier had resolved, now reflected here. */
  settled: number;
  /** Attempts the supplier still reports as unfinished. */
  pending: number;
  /** Attempts the supplier could not be asked about. */
  failed: number;
}

/** The columns the outcome transition reads. */
interface IdentitySnapshot {
  id: string;
  userId: string;
  status: string;
  nameOnId: string | null;
  yearOfBirth: number | null;
}

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
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
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

    // A fresh row per attempt, because its id is the `verification_id` sent to
    // Cashfree and Cashfree refuses an id it has already seen (409,
    // `verification_id already exists`). Updating the existing row would keep
    // its id, so every attempt after a failed or lapsed one was refused for a
    // reason that had nothing to do with the member. The old row is deleted
    // rather than updated; the consent record it referenced is a row of its own
    // and stays, so the audit trail survives.
    if (existing) {
      await this.prisma.identityVerification.delete({ where: { userId } });
    }

    const identity = await this.prisma.identityVerification.create({
      data: {
        userId,
        provider: body.provider as never,
        vendor: 'CASHFREE' as never,
        status: 'PENDING' as never,
        consentRecordId: consent.id,
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
   * Reserves an upload for the manual fallback.
   *
   * The same three steps as every other upload in this product — reserve a key,
   * send the bytes, submit the key — and for the same reason: the size is bounded
   * before a byte moves, and the object lives under a prefix this member owns, so
   * the submit step is a string check rather than a lookup.
   *
   * A check that has already passed is refused rather than replaced: asking a
   * verified member for their Aadhaar again is a request for data there is no
   * longer any purpose in collecting.
   */
  async initiateManualUpload(
    userId: string,
    input: { mime_type: string; byte_size: number },
  ): Promise<{ upload_url: string; object_key: string; expires_in_seconds: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    assertDocumentType(input.mime_type);

    if (input.byte_size <= 0 || input.byte_size > MAX_MANUAL_DOCUMENT_BYTES) {
      throw new BadRequestException('The document must be between 1 byte and 10 MB');
    }

    const existing = await this.prisma.identityVerification.findUnique({ where: { userId } });
    if (existing?.status === 'VERIFIED') {
      throw new ConflictException('Identity verification is already complete');
    }

    const objectKey = `verification/${userId}/${randomKey()}`;
    const uploadUrl = await this.storage.presignUpload(objectKey, input.mime_type, input.byte_size);

    return { upload_url: uploadUrl, object_key: objectKey, expires_in_seconds: 300 };
  }

  /**
   * Stores document bytes the API received itself — the website's upload path.
   *
   * The website cannot PUT to the bucket (a browser PUT is cross-origin and the
   * bucket has no CORS rule this deployment can write), exactly as for photos.
   * The prefix check is what keeps this from writing anywhere but the caller's
   * own verification folder.
   */
  async uploadManualBytes(
    userId: string,
    objectKey: string,
    body: Buffer,
    mimeType: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!objectKey.startsWith(`verification/${userId}/`)) {
      throw new NotFoundException('No upload was found for that key');
    }

    assertDocumentType(mimeType);

    if (body.byteLength === 0 || body.byteLength > MAX_MANUAL_DOCUMENT_BYTES) {
      throw new BadRequestException('The document must be between 1 byte and 10 MB');
    }

    await this.storage.putObject(objectKey, body, mimeType);
  }

  /**
   * Puts an uploaded document forward for review.
   *
   * This is where the row is written, not at upload time: an abandoned upload
   * must not sit in the review queue as something an administrator might approve.
   * The object is checked in storage first, so a submission that points at a key
   * with nothing behind it is refused here rather than becoming a queue entry
   * whose evidence is missing.
   *
   * Consent to processing an Aadhaar copy is recorded before the row exists, and
   * referenced from it — the ordering H3 asks for, made auditable rather than
   * implied.
   */
  async submitManualDocument(
    userId: string,
    input: SubmitManualDocumentInput,
  ): Promise<VerificationStatusResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (!input.object_key.startsWith(`verification/${userId}/`)) {
      throw new NotFoundException('No upload was found for that key');
    }

    const existing = await this.prisma.identityVerification.findUnique({ where: { userId } });
    // A passed check is final, as on the DigiLocker path: a second submission
    // must not replace a verification the member already has.
    if (existing?.status === 'VERIFIED') return this.toResponse(existing);

    const head = await this.storage.headObject(input.object_key).catch(() => null);
    if (!head || head.byteLength === 0) {
      throw new NotFoundException('The uploaded document could not be read');
    }
    if (head.byteLength > MAX_MANUAL_DOCUMENT_BYTES) {
      throw new BadRequestException('The document must be at most 10 MB');
    }
    if (head.contentType !== null) assertDocumentType(head.contentType);

    const now = new Date();

    const consent = await this.prisma.consentRecord.create({
      data: {
        userId,
        type: ConsentType.AADHAAR_PROCESSING,
        status: ConsentStatus.GRANTED,
        policyVersion: input.policy_version,
        grantedAt: now,
        deviceId: null,
      },
    });

    // One row per account, as on the DigiLocker path. The old attempt is replaced
    // rather than updated so the row describes this submission only; the consent
    // record it referenced is its own row and stays for the audit trail.
    if (existing) {
      await this.prisma.identityVerification.delete({ where: { userId } });
    }

    const identity = await this.prisma.identityVerification.create({
      data: {
        userId,
        provider: 'MANUAL_DOCUMENT' as never,
        // No supplier is involved in a manual review.
        vendor: null,
        status: 'PENDING' as never,
        consentRecordId: consent.id,
        documentObjectKey: input.object_key,
        documentMimeType: head.contentType,
        documentSubmittedAt: now,
      },
    });

    this.logger.log(`Manual document submitted for verification ${identity.id}; awaiting review`);

    return this.toResponse(identity);
  }

  /**
   * An administrator's decision on a manual check.
   *
   * The effect is deliberately identical to a DigiLocker success: the row is
   * VERIFIED, and an account that is still PENDING_VERIFICATION moves to
   * AWAITING_SETUP_FEE. That sameness is the point of the fallback — nothing
   * downstream should need to know which method produced the verification, and
   * `identityVerifiedAt` is what `can_discover` reads either way.
   *
   * Approval of a check that already passed is a no-op (two administrators on a
   * stale page are asking for the same outcome). Anything else is a conflict: a
   * failed or expired manual check is not "approved" after the fact, the member
   * re-submits and gets a fresh decision.
   */
  async decideManualVerification(input: {
    verificationId: string;
    decision: 'APPROVE' | 'REJECT';
    note?: string;
    adminId: string;
  }): Promise<void> {
    const identity = await this.prisma.identityVerification.findUnique({
      where: { id: input.verificationId },
    });
    if (!identity) throw new NotFoundException('Identity check not found');

    if (identity.provider !== 'MANUAL_DOCUMENT') {
      throw new BadRequestException('Only a document check can be decided by hand');
    }
    if (identity.status === 'VERIFIED') return;
    if (identity.status !== 'PENDING') {
      throw new ConflictException('This check is no longer awaiting review');
    }

    const now = new Date();

    if (input.decision === 'APPROVE') {
      await this.prisma.$transaction(async (tx) => {
        await tx.identityVerification.update({
          where: { id: identity.id },
          data: {
            status: 'VERIFIED' as never,
            verifiedAt: now,
            failureCode: null,
            failureReason: null,
            reviewedAt: now,
            reviewedByAdminId: input.adminId,
            reviewNote: null,
            updatedAt: now,
          },
        });

        // Guarded exactly as the webhook path is: a late decision cannot pull an
        // account that has moved on (or been suspended) back through the funnel.
        await tx.user.updateMany({
          where: { id: identity.userId, status: 'PENDING_VERIFICATION' },
          data: {
            identityVerifiedAt: now,
            status: 'AWAITING_SETUP_FEE',
            statusChangedAt: now,
            statusChangeReason:
              'Identity document approved; awaiting the one-time account setup fee.',
          },
        });
      });

      await this.notifyOutcome(identity.userId, 'VERIFIED');
      this.logger.log(`Manual identity document approved on verification ${identity.id}`);
      return;
    }

    await this.prisma.identityVerification.update({
      where: { id: identity.id },
      data: {
        status: 'FAILED' as never,
        verifiedAt: null,
        failureCode: MANUAL_REJECTION_CODE,
        failureReason: input.note ?? DEFAULT_MANUAL_REJECTION,
        reviewedAt: now,
        reviewedByAdminId: input.adminId,
        reviewNote: input.note ?? null,
        updatedAt: now,
      },
    });

    await this.notifyOutcome(identity.userId, 'FAILED');
    this.logger.log(`Manual identity document rejected on verification ${identity.id}`);
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

    await this.applyOutcome(
      identity,
      next,
      data.user_details ?? {},
      `DigiLocker ${body.event_type}`,
      body.event_type,
      data.status ?? null,
    );
  }

  // -------------------------------------------------------------------------
  // Reconciliation — the webhook that never arrived
  // -------------------------------------------------------------------------

  /**
   * Asks Cashfree what became of attempts whose callback we never recorded.
   *
   * The failure it repairs is the one a sleeping instance creates: the member
   * authorises on DigiLocker, Cashfree sends the webhook, the request wakes a
   * service that is still running migrations, and the delivery is gone before
   * the app can accept it. Nothing here knows the check passed, so the member is
   * left on a screen that will never advance — and asks them to hand over their
   * Aadhaar consent again for a check that already succeeded.
   *
   * Only attempts whose consent link has lapsed are read, so a member mid-flow is
   * never interrupted by the sweep, and only statuses the supplier actually
   * resolved are applied: `PENDING` means the member has not finished, which is
   * already what this row says.
   */
  async reconcilePending(): Promise<VerificationReconcileSummary> {
    const summary: VerificationReconcileSummary = {
      checked: 0,
      settled: 0,
      pending: 0,
      failed: 0,
    };

    // Nothing to ask without credentials. Checked before the query so a
    // deployment with KYC switched off, and every test that boots the module
    // graph, does no work and makes no vendor call.
    if (!this.gateway.configured) return summary;

    const now = new Date();
    const attempts = await this.prisma.identityVerification.findMany({
      where: {
        // Manual checks are excluded by `vendor`: a human decides those, and
        // there is no supplier to ask about them.
        status: 'PENDING' as never,
        vendor: 'CASHFREE' as never,
        providerReference: { not: null },
        providerReferenceExpiresAt: { lt: new Date(now.getTime() - RECONCILE.graceMs) },
        updatedAt: { gt: new Date(now.getTime() - RECONCILE.lookbackMs) },
      },
      orderBy: { updatedAt: 'asc' },
      take: RECONCILE.batch,
    });
    summary.checked = attempts.length;

    // Collect failures rather than logging them as they happen. Cashfree refuses
    // this host's IPs, so one sweep can fail on every attempt it looked at for
    // the same reason — twenty-five identical lines hide the one fact worth
    // reading. One line per sweep, naming the count and the distinct errors.
    const failures: string[] = [];

    for (const identity of attempts) {
      let provider;
      try {
        provider = await this.gateway.fetchDigiLockerStatus({
          verificationId: identity.id,
          providerReference: identity.providerReference,
        });
      } catch (error) {
        summary.failed += 1;
        failures.push(error instanceof Error ? error.message : String(error));
        continue;
      }

      const next = statusForProvider(provider.status);
      if (!next) {
        summary.pending += 1;
        continue;
      }

      await this.applyOutcome(
        identity,
        next,
        provider.userDetails ?? {},
        `Reconciled DigiLocker status ${provider.status}`,
        provider.status,
      );
      summary.settled += 1;
    }

    if (failures.length > 0) {
      const distinct = [...new Set(failures)];
      const detail =
        distinct.length === 1
          ? distinct[0]
          : `${distinct.length} distinct errors, latest: ${distinct[distinct.length - 1]}`;
      this.logger.error(
        `[reconcile] identity: could not read ${failures.length} ` +
          `${failures.length === 1 ? 'attempt' : 'attempts'} from Cashfree; will retry on the next sweep. ${detail}`,
      );
    }

    if (summary.checked > 0) {
      this.logger.log(
        `[reconcile] identity: ${summary.checked} due, ${summary.settled} applied, ` +
          `${summary.pending} unfinished, ${summary.failed} errors.`,
      );
    }

    return summary;
  }

  /**
   * The one transition both the webhook and the reconciliation sweep apply.
   *
   * Kept in one place because the two sources must not disagree: the row is
   * VERIFIED (or FAILED, or EXPIRED), an account still awaiting verification
   * moves on, and the member is told — by the same wording, once per real change.
   */
  private async applyOutcome(
    identity: IdentitySnapshot,
    next: 'VERIFIED' | 'FAILED' | 'EXPIRED',
    details: { name?: string | undefined; dob?: string | undefined },
    source: string,
    failureCode: string,
    reason: string | null = null,
  ): Promise<void> {
    const now = new Date();
    // Read before the write: the row goes on to be updated, and the decision to
    // announce an outcome is about what changed, not about what it now says.
    const previousStatus = identity.status;

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
                failureCode,
                failureReason: reason,
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
    }); // Only a real transition is announced. A duplicate delivery of the same
    // outcome updates nothing new about the member's situation, and section 42
    // is about telling them something happened, not about replaying it.
    if (previousStatus !== next) {
      await this.notifyOutcome(identity.userId, next);
    }

    this.logger.log(`${source} applied to verification ${identity.id}: ${next}`);
  }

  /**
   * Section 42: the member is told the outcome of their identity check.
   *
   * Until now verification was silent — the app polled `GET /verification/status`
   * and nothing else ever mentioned it, so a member who failed had to reopen the
   * screen to find out. The wording for a failure deliberately does not repeat
   * the provider's reason: it is a vendor string about a document, and the
   * member's next step is the same whatever it says.
   *
   * Best-effort, like every notification written after a committed transition:
   * the verification result is already stored, and an error here must not make
   * Cashfree replay a webhook whose work is done.
   */
  private async notifyOutcome(userId: string, outcome: 'VERIFIED' | 'FAILED' | 'EXPIRED') {
    const verified = outcome === 'VERIFIED';
    try {
      await this.notifications.create({
        userId,
        event: verified
          ? NOTIFICATION_EVENTS.IDENTITY_VERIFIED
          : NOTIFICATION_EVENTS.IDENTITY_VERIFICATION_FAILED,
        channel: 'PUSH',
        title: verified ? 'Your identity is verified' : 'We could not verify your identity',
        body: verified
          ? 'Verification is complete. Pay the one-time setup fee to finish setting up your account.'
          : 'Open the app to try the identity check again.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Could not record a verification notification for user ${userId}: ${message}`,
      );
    }
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
 * Which stored status the supplier's own status word produces, or null when the
 * attempt is not resolved yet.
 *
 * A separate mapping from `statusForEvent` because the two vocabularies are
 * different: events are named after what happened, statuses after where the
 * session stands (`AUTHENTICATED` for a passed consent, `CONSENT_DENIED` for a
 * refused one). Unknown words return null rather than being guessed at — a
 * supplier adding a status must never become an account that verified itself.
 */
function statusForProvider(status: string): 'VERIFIED' | 'FAILED' | 'EXPIRED' | null {
  switch (status) {
    case 'AUTHENTICATED':
      return 'VERIFIED';
    case 'FAILED':
    case 'CONSENT_DENIED':
      return 'FAILED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return null;
  }
}

/**
 * Refuses anything that is not an image or a PDF.
 *
 * SVG is excluded for the same reason it is excluded from photos: it is a script
 * container, and this file is opened in an administrator's browser.
 */
function assertDocumentType(mimeType: string): void {
  if (!(MANUAL_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new BadRequestException('Upload a JPEG, PNG, WebP or PDF of your Aadhaar');
  }
}

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
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
