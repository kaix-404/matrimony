import { Logger } from '@nestjs/common';

/**
 * The SMS delivery seam.
 *
 * THE CLIENT CHOSE MSG91
 * ----------------------
 * The SMS provider was open (GAP-12) and MSG91 was the fallback; the client
 * confirmed MSG91 on 2026-10-14, so this is no longer provider-agnostic config
 * waiting on a decision. MSG91 sits behind an abstract class for the same two
 * reasons the payment gateway does: tests must exercise delivery without the
 * network, and no other code should be able to reach the vendor SDK directly.
 *
 * WHY THE FLOW API AND NOT MSG91'S OTP API
 * ----------------------------------------
 * MSG91 offers a SendOTP API that generates and verifies the code itself. Using
 * it would move verification into the vendor while the platform already owns OTP
 * state — codes are hashed under `OTP_HASH_SECRET`, attempt-counted and expired
 * against `OtpRequest`, and the delete-account flow has to consume a code at a
 * later step. Two sources of truth for "is this code valid" is exactly the
 * ambiguity the OTP module was written to avoid, so only the templated Flow API
 * is used: our code travels as a template variable and MSG91 just delivers it.
 *
 * SMS IS OTP-ONLY
 * ---------------
 * The client's answer G1 keeps SMS for one-time codes alone, deliberately, as a
 * cost saving. The seam therefore models that single job rather than a general
 * "send a message" channel; a second SMS use would be a deliberate widening.
 */

export interface SmsDeliveryResult {
  /** MSG91's request id for the send; null when the provider did not return one. */
  providerMessageId: string | null;
}

export interface OtpSmsInput {
  /** 10-digit Indian mobile, already normalised by `IndianMobileSchema`. */
  mobile: string;
  /** The one-time code, substituted into the template's variable. */
  code: string;
}

/**
 * What the rest of the app is allowed to ask of the SMS provider. Deliberately
 * narrow: SMS exists here to carry one-time codes and nothing else.
 */
export abstract class SmsGateway {
  /**
   * False when any required credential is absent. Callers rely on this to fall
   * back to the development echo rather than attempting a send that must fail.
   */
  abstract readonly configured: boolean;

  abstract sendOtp(input: OtpSmsInput): Promise<SmsDeliveryResult>;
}

/** MSG91 Flow API. A templated send: our code travels as a template variable. */
export const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow/';

export interface Msg91Config {
  /** MSG91 authkey (`SMS_PROVIDER_API_KEY`). */
  authKey: string;
  /** Registered sender id, e.g. `MTRIMY` (`SMS_SENDER_ID`). */
  senderId: string;
  /** MSG91 template id (`SMS_TEMPLATE_ID`) — not the DLT template id. */
  templateId: string;
  /** Template variable that holds the code, e.g. `OTP`. Case-sensitive. */
  templateVariable: string;
  /** Dialing code prefixed to a bare 10-digit number, e.g. `91`. */
  countryCode: string;
  /** Overridable for tests. */
  flowUrl?: string;
  /** Overridable for tests. */
  timeoutMs?: number;
}

/** The response shape MSG91 returns for a Flow send. */
interface Msg91Response {
  type?: string;
  message?: string;
}

export class Msg91SmsGateway extends SmsGateway {
  private readonly logger = new Logger(Msg91SmsGateway.name);
  readonly configured: boolean;
  private readonly flowUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: Msg91Config) {
    super();
    this.configured = [config.authKey, config.senderId, config.templateId].every(
      (value) => typeof value === 'string' && value.trim() !== '',
    );
    this.flowUrl = config.flowUrl ?? MSG91_FLOW_URL;
    this.timeoutMs = config.timeoutMs ?? 10_000;

    if (!this.configured) {
      // Not fatal at boot: in development the controller echoes the code
      // instead. In production the controller fails closed, so a missing
      // credential shows up as a 503 rather than a silently undelivered code.
      this.logger.warn('MSG91 SMS is not configured; one-time codes will not be sent');
    }
  }

  async sendOtp({ mobile, code }: OtpSmsInput): Promise<SmsDeliveryResult> {
    if (!this.configured) {
      throw new Error('MSG91 is not configured');
    }

    // The Flow API addresses the send with `flow_id` plus a `recipients` array:
    // the number and that template's variables live on the recipient, not at the
    // top level of the body. Variables are keyed by the name given when the
    // template was created on MSG91, case included.
    const payload = {
      flow_id: this.config.templateId,
      sender: this.config.senderId,
      recipients: [
        {
          mobiles: this.toInternational(mobile),
          [this.config.templateVariable]: code,
        },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    let raw: string;
    try {
      response = await fetch(this.flowUrl, {
        method: 'POST',
        headers: {
          authkey: this.config.authKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      raw = await response.text();
    } finally {
      clearTimeout(timer);
    }

    const parsed = this.parse(raw);

    // MSG91 answers 200 with `{ type: "error" }` for some failures, so the body
    // is checked as well as the status. A send is successful only when both say
    // so; anything else must surface, because a code that never left the vendor
    // strands the user at the OTP screen.
    if (!response.ok || parsed?.type !== 'success') {
      // The body can echo the rejected template but never the authkey, so it is
      // safe to include; the key is kept out of the message regardless.
      throw new Error(
        `MSG91 rejected the send (HTTP ${response.status}): ${
          parsed?.message ?? raw.slice(0, 200)
        }`,
      );
    }

    return { providerMessageId: parsed?.message ?? null };
  }

  private parse(raw: string): Msg91Response | null {
    try {
      return JSON.parse(raw) as Msg91Response;
    } catch {
      return null;
    }
  }

  private toInternational(mobile: string): string {
    const digits = mobile.replace(/[^\d]/g, '');
    // A number longer than ten digits already carries a country code; prefixing
    // it again would produce an undeliverable "91919876543210".
    return digits.length > 10 ? digits : `${this.config.countryCode}${digits}`;
  }
}
