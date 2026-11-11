import { Logger } from '@nestjs/common';

export interface EmailDeliveryResult {
  /** MSG91's identifier for the send; null when the provider did not return one. */
  providerMessageId: string | null;
}

export interface OtpEmailInput {
  /** Already normalised and lower-cased by `EmailAddressSchema`. */
  email: string;
  /** The one-time code, substituted into the template's variable. */
  code: string;
}

/**
 * What the rest of the app may ask of the email provider.
 *
 * Deliberately narrow, like `SmsGateway`: email exists here to carry one-time
 * codes for an address the member is adding, and nothing else. Transactional
 * notifications would be a different seam, with a different template id, and
 * pretending they are the same operation is how a marketing send ends up on the
 * OTP path.
 */
export abstract class EmailGateway {
  /**
   * False when any required credential is absent. Callers rely on this to fail
   * closed in production and to echo a development code locally, exactly as the
   * SMS gateway does.
   */
  abstract readonly configured: boolean;

  abstract sendOtp(input: OtpEmailInput): Promise<EmailDeliveryResult>;
}

/** MSG91's transactional email endpoint (client decision GAP-12: use MSG91). */
export const MSG91_EMAIL_SEND_URL = 'https://control.msg91.com/api/v5/email/send';

export interface Msg91EmailConfig {
  /** MSG91 authkey (`EMAIL_PROVIDER_API_KEY`). */
  authKey: string;
  /** Verified sender address on the MSG91 domain (`EMAIL_FROM_ADDRESS`). */
  fromEmail: string;
  /** Display name on the envelope (`EMAIL_FROM_NAME`). */
  fromName: string;
  /** MSG91 email template id or name (`EMAIL_TEMPLATE_ID`). */
  templateId: string;
  /** Template variable holding the code, e.g. `otp`. Case-sensitive. */
  templateVariable: string;
  /** Overridable for tests. */
  sendUrl?: string;
  /** Overridable for tests. */
  timeoutMs?: number;
}

/** The response shape MSG91 returns for an email send. */
interface Msg91EmailResponse {
  type?: string;
  message?: string;
  hasError?: boolean;
}

export class Msg91EmailGateway extends EmailGateway {
  private readonly logger = new Logger(Msg91EmailGateway.name);
  readonly configured: boolean;
  private readonly sendUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: Msg91EmailConfig) {
    super();
    this.configured = [
      config.authKey,
      config.fromEmail,
      config.templateId,
      config.templateVariable,
    ].every((value) => typeof value === 'string' && value.trim() !== '');
    this.sendUrl = config.sendUrl ?? MSG91_EMAIL_SEND_URL;
    this.timeoutMs = config.timeoutMs ?? 10_000;

    if (!this.configured) {
      // Not fatal at boot: the controller fails closed in production and echoes
      // a development code locally, so a missing credential is visible as a 503
      // rather than a code that silently never arrived.
      this.logger.warn('MSG91 email is not configured; verification codes will not be sent');
    } else {
      // The same trap the SMS gateway logs for: MSG91 accepts a send and bills
      // it even when the variable name does not match the template, and the
      // message then arrives with the code's slot empty. Logging the name we
      // send turns that into a one-line check.
      this.logger.log(
        `MSG91 email sends: template ${config.templateId}, variable "${config.templateVariable}", from ${config.fromEmail}`,
      );
    }
  }

  async sendOtp({ email, code }: OtpEmailInput): Promise<EmailDeliveryResult> {
    if (!this.configured) {
      throw new Error('MSG91 email is not configured');
    }

    // MSG91's v5 email API is recipient-oriented, like its Flow API for SMS: the
    // template is named once, and each recipient carries its own variables.
    const payload = {
      template_id: this.config.templateId,
      from: { email: this.config.fromEmail, name: this.config.fromName },
      recipients: [
        {
          to: [{ email }],
          variables: { [this.config.templateVariable]: code },
        },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    let raw: string;
    try {
      response = await fetch(this.sendUrl, {
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

    // A 200 is not proof of a send: MSG91 answers 200 with `hasError: true` or
    // `type: "error"` for some rejections. A code that never left the vendor
    // strands the member on the code screen, so every failure has to surface.
    if (!response.ok || parsed?.hasError === true || parsed?.type === 'error') {
      // The body can echo the rejected template but never the authkey, so it is
      // safe to include; the key stays out of the message either way.
      throw new Error(
        `MSG91 email rejected the send (HTTP ${response.status}): ${
          parsed?.message ?? raw.slice(0, 200)
        }`,
      );
    }

    return { providerMessageId: parsed?.message ?? null };
  }

  private parse(raw: string): Msg91EmailResponse | null {
    try {
      return JSON.parse(raw) as Msg91EmailResponse;
    } catch {
      return null;
    }
  }
}
