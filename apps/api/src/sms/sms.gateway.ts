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
  /**
   * MSG91's balance endpoint reported zero immediately before this send.
   *
   * Advisory, never a refusal. See `MSG91_BALANCE_URL`: the reading is not
   * trustworthy enough to gate on, but a zero is worth repeating to a caller in
   * development when the client swears the account is funded — that mismatch is
   * the thing worth investigating.
   */
  reportedZeroBalance: boolean;
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

/**
 * MSG91's wallet balance endpoint.
 *
 * READ THIS BEFORE TRUSTING IT, AND BEFORE CHANGING IT: the authkey has to
 * travel as a *query parameter* here — the `authkey` header that the Flow API
 * honours is not read by this endpoint, and sends the request back as `201
 * error`. That also means this URL must never be logged: it carries the
 * credential in the path a proxy would record.
 *
 * The reading is a legacy figure and is NOT authoritative for the newer plans:
 * MSG91 documents no general wallet-balance API (its own FAQ asks for the use
 * case before granting one), and the account this was built against returned
 * `0` on every route while the customer's dashboard showed a funded balance.
 * It is therefore used only to raise a flag, never to block a send: a false
 * zero would lock every user out of signing in, which is a worse failure than
 * the silence it would be trying to prevent.
 */
export const MSG91_BALANCE_URL = 'https://control.msg91.com/api/balance.php';

/** MSG91 route 4 is transactional, which is where one-time codes are billed. */
const MSG91_TRANSACTIONAL_ROUTE = '4';

/**
 * A balance reading, or `null` when the probe could not produce one. `null` is
 * deliberately distinct from `0`: only a confirmed zero may block a send.
 */
function parseBalance(raw: string): number | null {
  const text = raw.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  try {
    const parsed = JSON.parse(text) as { balance?: unknown };
    const value = typeof parsed.balance === 'string' ? Number(parsed.balance) : parsed.balance;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  } catch {
    // Not JSON either, so the shape is unknown to us; treated as no reading.
  }
  return null;
}

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
  balanceUrl?: string;
  /** How long a balance reading is trusted, so a burst of codes costs one probe. */
  balanceCacheMs?: number;
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
  private readonly balanceUrl: string;
  private readonly balanceCacheMs: number;
  private readonly timeoutMs: number;
  private balanceReading: { value: number | null; at: number } | null = null;

  constructor(private readonly config: Msg91Config) {
    super();
    this.configured = [config.authKey, config.senderId, config.templateId].every(
      (value) => typeof value === 'string' && value.trim() !== '',
    );
    this.flowUrl = config.flowUrl ?? MSG91_FLOW_URL;
    this.balanceUrl = config.balanceUrl ?? MSG91_BALANCE_URL;
    this.balanceCacheMs = config.balanceCacheMs ?? 60_000;
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

    const reportedZeroBalance = await this.warnIfUnfunded();

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

    return { providerMessageId: parsed?.message ?? null, reportedZeroBalance };
  }

  /**
   * Notes when the wallet looks empty, and sends anyway.
   *
   * MSG91 accepts a Flow request, answers `type: "success"` with a request id,
   * and can drop the message afterwards for want of credit, which to this
   * gateway is indistinguishable from a delivered code. An earlier version of
   * this file refused the send outright on a zero reading. That was wrong: the
   * balance endpoint is a legacy figure that reported zero for an account the
   * customer could see funded, so the guard would have turned a migrating
   * ledger into a total sign-in outage. The reading is now reported, not obeyed.
   *
   * Fail-open by construction: no reading (unreachable, unparseable) is not a
   * zero, and a zero does not stop the send.
   */
  private async warnIfUnfunded(): Promise<boolean> {
    const balance = await this.currentBalance();
    if (balance === null || balance > 0) return false;

    this.logger.error(
      'MSG91 reports a zero SMS balance, so this code may be accepted and then dropped. ' +
        'Sending anyway: the balance figure is not reliable enough to block on. ' +
        'Confirm delivery in the MSG91 panel, and check the account the authkey belongs to.',
    );
    return true;
  }

  private async currentBalance(): Promise<number | null> {
    const now = Date.now();
    if (this.balanceReading && now - this.balanceReading.at < this.balanceCacheMs) {
      return this.balanceReading.value;
    }
    const value = await this.fetchBalance();
    this.balanceReading = { value, at: now };
    return value;
  }

  private async fetchBalance(): Promise<number | null> {
    // Built as a URL so the key is encoded rather than pasted into a string that
    // might later be logged with the rest of the request.
    const url = new URL(this.balanceUrl);
    url.searchParams.set('authkey', this.config.authKey);
    url.searchParams.set('type', MSG91_TRANSACTIONAL_ROUTE);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      return parseBalance(await response.text());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
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
