/**
 * The identity-verification seam.
 *
 * Cashfree Secure ID is the only supplier (client decision 2026-10-01), but it
 * sits behind an abstract class for the same two reasons the payment gateway
 * does: tests must exercise the flow without network or credentials, and
 * section 46 keeps the vendor out of the rest of the code so a supplier change
 * touches this file alone.
 *
 * The vendor is treated as a source of *assertions*. A webhook saying a check
 * passed is not taken as authority on its own — it is accepted only when the
 * signature over the raw body verifies, and only for a verification row this
 * server created, which is what stops a forged or replayed callback from
 * unlocking an account.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';

/** A DigiLocker consent session, as the supplier created it. */
export interface DigiLockerSession {
  /** Cashfree's `reference_id`, kept for reconciliation and webhook fallback. */
  providerReference: string;
  /** The one-time consent URL the user must open. */
  url: string;
  /**
   * When the URL stops working. Cashfree documents ten minutes; it is stored so
   * the app can tell "start again" apart from "waiting on the user".
   */
  expiresAt: Date;
}

export abstract class VerificationGateway {
  /** False when the supplier credentials are absent; callers must fail closed. */
  abstract readonly configured: boolean;

  /**
   * Creates the DigiLocker consent URL for one verification attempt.
   *
   * `verificationId` is our own row id, sent as Cashfree's `verification_id`.
   * That is what makes the callback attributable: the webhook carries it back,
   * so the service can find the exact attempt it created instead of guessing
   * from a phone number or a name.
   */
  abstract createDigiLockerSession(input: { verificationId: string }): Promise<DigiLockerSession>;

  /**
   * Verifies a Secure ID webhook.
   *
   * Cashfree signs `timestamp + rawBody` with the client secret and sends the
   * result Base64-encoded in `x-webhook-signature`, with the timestamp in
   * `x-webhook-timestamp`. The raw body is required — re-serialising the parsed
   * JSON changes key order and spacing and would fail verification for reasons
   * unrelated to tampering. This is a different scheme from the Razorpay
   * payment webhook (`body|secret`, hex), which is why it lives here rather
   * than being shared.
   */
  abstract verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
    timestamp: string | undefined,
  ): boolean;
}

/** How long a DigiLocker consent URL stays valid, per Cashfree's docs. */
const DIGILOCKER_URL_TTL_MS = 10 * 60_000;

/** Supplier call budget: a hung request must not hold an HTTP request open. */
const VENDOR_TIMEOUT_MS = 15_000;

@Injectable()
export class CashfreeVerificationGateway extends VerificationGateway {
  private readonly logger = new Logger(CashfreeVerificationGateway.name);
  private readonly baseUrl: string;
  readonly configured: boolean;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    environment: 'sandbox' | 'production',
  ) {
    super();
    this.baseUrl =
      environment === 'production'
        ? 'https://api.cashfree.com/verification'
        : 'https://sandbox.cashfree.com/verification';

    this.configured =
      typeof this.clientId === 'string' &&
      this.clientId.trim() !== '' &&
      typeof this.clientSecret === 'string' &&
      this.clientSecret.trim() !== '';

    if (!this.configured) {
      // Loud, not fatal: the API must boot without KYC credentials so the rest
      // of the product can be developed and deployed. Every attempt to start a
      // verification fails closed in `createDigiLockerSession`.
      this.logger.warn(
        'CASHFREE_CLIENT_ID/CASHFREE_CLIENT_SECRET are empty — identity verification will reject.',
      );
    } else {
      // Operators need to know which tenant they are talking to: sandbox and
      // production credentials are not interchangeable, and Cashfree rejects a
      // test secret on the production host with a validation error rather than
      // anything that reads like a configuration mistake.
      this.logger.log(`Cashfree Secure ID configured against ${this.baseUrl}`);
    }
  }

  async createDigiLockerSession(input: { verificationId: string }): Promise<DigiLockerSession> {
    if (!this.configured) {
      throw new Error('Cashfree Secure ID is not configured; cannot create a DigiLocker session');
    }

    // `redirect_url` is deliberately omitted. It is where Cashfree sends the
    // browser after consent, and this product's journey continues in the app:
    // the consent screen reports back through the webhook, and the app re-reads
    // `GET /verification/status` when it regains focus. Inventing a web page to
    // redirect to would be a feature we do not have.
    //
    // Only AADHAAR is requested: it is the one document D9 asks for, and asking
    // for PAN or a driving licence would collect identity data with no purpose.
    const response = await fetch(`${this.baseUrl}/digilocker`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-id': this.clientId,
        'x-client-secret': this.clientSecret,
      },
      body: JSON.stringify({
        verification_id: input.verificationId,
        document_requested: ['AADHAAR'],
        user_flow: 'signin',
      }),
      signal: AbortSignal.timeout(VENDOR_TIMEOUT_MS),
    });

    const text = await response.text();

    if (!response.ok) {
      // The vendor's body explains the refusal (bad credentials, an IP that is
      // not whitelisted, a duplicate verification id). It is kept in the error
      // for the server log; the controller never forwards it to a client.
      throw new Error(
        `Cashfree DigiLocker URL creation failed (HTTP ${response.status}): ${text.slice(0, 400)}`,
      );
    }

    let payload: { url?: unknown; reference_id?: unknown; verification_id?: unknown };
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      throw new Error('Cashfree DigiLocker URL creation returned a non-JSON body');
    }

    if (typeof payload.url !== 'string' || payload.url === '') {
      // A success status with no URL is still a failed session: the user has
      // nothing to open, and pretending otherwise would park them on a screen
      // waiting for a browser that never launches.
      throw new Error('Cashfree DigiLocker URL creation returned no consent URL');
    }

    const reference = payload.reference_id ?? payload.verification_id ?? input.verificationId;

    return {
      providerReference: String(reference),
      url: payload.url,
      expiresAt: new Date(Date.now() + DIGILOCKER_URL_TTL_MS),
    };
  }

  verifyWebhookSignature(
    rawBody: string,
    signature: string | undefined,
    timestamp: string | undefined,
  ): boolean {
    if (!this.configured) {
      this.logger.error('CASHFREE_CLIENT_SECRET is empty — cannot verify webhooks, rejecting.');
      return false;
    }
    if (typeof signature !== 'string' || signature.length === 0) return false;
    if (typeof timestamp !== 'string' || timestamp.length === 0) return false;
    if (rawBody.length === 0) return false;

    const expected = createHmac('sha256', this.clientSecret)
      .update(`${timestamp}${rawBody}`)
      .digest('base64');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    // timingSafeEqual throws on a length mismatch, so the lengths are compared
    // first. That early return is safe: a wrong-length signature cannot be the
    // right one.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
