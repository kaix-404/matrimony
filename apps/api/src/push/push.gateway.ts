import { Logger } from '@nestjs/common';
import { createSign } from 'node:crypto';

/**
 * The push delivery seam (section 42).
 *
 * THE CLIENT CHOSE FIREBASE
 * -------------------------
 * Push was confirmed as Firebase on 2026-10-01, so this is not provider-agnostic
 * config waiting on a decision. It sits behind an abstract class for the same
 * two reasons the SMS and payment gateways do: tests exercise delivery without
 * the network, and no other code can reach the vendor directly.
 *
 * HTTP v1, NOT THE LEGACY SERVER KEY
 * ----------------------------------
 * The legacy FCM server key is deprecated and was deliberately dropped from
 * configuration. HTTP v1 authenticates with a service-account assertion: a
 * short-lived RS256 JWT is exchanged for an OAuth2 access token, which is then
 * cached until it nears expiry. That is done here on `node:crypto` rather than
 * pulling in `firebase-admin`, which would drag a large SDK in for two HTTP
 * calls.
 *
 * A DEAD TOKEN IS A RESULT, NOT AN ERROR
 * --------------------------------------
 * FCM answers `UNREGISTERED` for a token whose app was uninstalled. That is a
 * normal lifecycle event, so `send` reports it as `invalidToken` for the caller
 * to prune rather than throwing — a thrown error would look like a provider
 * outage and strand the row in `FAILED` forever.
 */

export interface PushMessage {
  /** FCM registration token of one device. */
  token: string;
  title: string;
  body: string;
  /** Small string map carried alongside the notification for the app to act on. */
  data?: Record<string, string>;
}

export interface PushDeliveryResult {
  /** FCM's message name; null when the send did not produce one. */
  providerMessageId: string | null;
  /** True when FCM reports the token is no longer valid and should be pruned. */
  invalidToken: boolean;
}

export abstract class PushGateway {
  /**
   * False when the service-account credential is absent or unusable. Callers
   * rely on this to skip dispatch entirely rather than attempting a send that
   * must fail.
   */
  abstract readonly configured: boolean;

  abstract send(message: PushMessage): Promise<PushDeliveryResult>;
}

export const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_BASE_URL = 'https://fcm.googleapis.com';
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export interface FcmConfig {
  /** The service-account JSON (`FCM_SERVICE_ACCOUNT_JSON`), as a string. */
  serviceAccountJson: string;
  /** Overridable for tests. */
  tokenUrl?: string;
  /** Overridable for tests. */
  baseUrl?: string;
  /** Overridable for tests. */
  timeoutMs?: number;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface CachedToken {
  value: string;
  expiresAtMs: number;
}

/** FCM's error envelope, narrowed to the fields that change our behaviour. */
interface FcmErrorBody {
  error?: {
    status?: string;
    message?: string;
    details?: { errorCode?: string }[];
  };
}

export class FcmPushGateway extends PushGateway {
  private readonly logger = new Logger(FcmPushGateway.name);
  readonly configured: boolean;
  private readonly account: ServiceAccount | null;
  private readonly tokenUrl: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private cached: CachedToken | null = null;

  constructor(config: FcmConfig) {
    super();
    this.tokenUrl = config.tokenUrl ?? FCM_TOKEN_URL;
    this.baseUrl = config.baseUrl ?? FCM_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.account = this.parseAccount(config.serviceAccountJson);
    this.configured = this.account !== null;

    if (!this.configured) {
      this.logger.warn('FCM push is not configured; notifications will not be pushed');
    }
  }

  async send(message: PushMessage): Promise<PushDeliveryResult> {
    if (!this.account) {
      throw new Error('FCM is not configured');
    }

    // One retry, only on an authentication failure: a cached access token can be
    // revoked out from under us, and refreshing then is cheap. Any other failure
    // (a bad request, a provider outage) is surfaced instead of retried blindly.
    let accessToken = await this.accessToken();
    let response = await this.post(message, accessToken);
    if (response.status === 401) {
      this.cached = null;
      accessToken = await this.accessToken();
      response = await this.post(message, accessToken);
    }

    const raw = await response.text();
    const parsed = this.parse(raw) as ({ name?: string } & FcmErrorBody) | null;

    if (response.ok) {
      return { providerMessageId: parsed?.name ?? null, invalidToken: false };
    }

    if (this.isInvalidToken(response.status, parsed)) {
      return { providerMessageId: null, invalidToken: true };
    }

    throw new Error(
      `FCM rejected the send (HTTP ${response.status}): ${
        parsed?.error?.message ?? raw.slice(0, 200)
      }`,
    );
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private parseAccount(json: string): ServiceAccount | null {
    if (!json || json.trim() === '') return null;
    try {
      const parsed = JSON.parse(json) as Partial<ServiceAccount>;
      if (
        typeof parsed.project_id === 'string' &&
        parsed.project_id !== '' &&
        typeof parsed.client_email === 'string' &&
        parsed.client_email !== '' &&
        typeof parsed.private_key === 'string' &&
        parsed.private_key !== ''
      ) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          private_key: parsed.private_key,
        };
      }
      return null;
    } catch {
      // A malformed credential is the same as no credential: push is disabled
      // rather than the process refusing to boot.
      return null;
    }
  }

  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAtMs - 60_000 > Date.now()) {
      return this.cached.value;
    }

    const assertion = this.signAssertion();
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    let raw: string;
    try {
      response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      raw = await response.text();
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`FCM token exchange failed (HTTP ${response.status}): ${raw.slice(0, 200)}`);
    }

    const parsed = this.parse(raw) as { access_token?: string; expires_in?: number } | null;
    if (!parsed?.access_token) {
      throw new Error('FCM token exchange returned no access_token');
    }

    const ttlMs = (parsed.expires_in ?? 3600) * 1000;
    this.cached = { value: parsed.access_token, expiresAtMs: Date.now() + ttlMs };
    return parsed.access_token;
  }

  /** A self-signed RS256 JWT the token endpoint will accept for the scope. */
  private signAssertion(): string {
    const account = this.account as ServiceAccount;
    const iat = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: this.tokenUrl,
      iat,
      exp: iat + 3600,
    };
    const signingInput = `${this.b64(header)}.${this.b64(claims)}`;
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(account.private_key)
      .toString('base64url');
    return `${signingInput}.${signature}`;
  }

  private async post(message: PushMessage, accessToken: string): Promise<Response> {
    const account = this.account as ServiceAccount;
    const url = `${this.baseUrl}/v1/projects/${account.project_id}/messages:send`;
    const payload: Record<string, unknown> = {
      message: {
        token: message.token,
        notification: { title: message.title, body: message.body },
        ...(message.data ? { data: message.data } : {}),
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Whether FCM is telling us the token itself is gone, as opposed to the send
   * being malformed or the provider being down. Only the former is safe to prune.
   */
  private isInvalidToken(status: number, body: FcmErrorBody | null): boolean {
    const code = body?.error?.details?.find((d) => d.errorCode)?.errorCode;
    if (code === 'UNREGISTERED' || code === 'INVALID_REGISTRATION') return true;
    // A token that belongs to another Firebase project (SENDER_ID_MISMATCH) is
    // equally undeliverable for us and is pruned for the same reason.
    if (code === 'SENDER_ID_MISMATCH') return true;
    return status === 404;
  }

  private b64(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private parse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
