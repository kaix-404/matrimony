import { createHmac } from 'node:crypto';
import { CashfreeVerificationGateway } from './verification.gateway';

/**
 * Cashfree Secure ID.
 *
 * The gateway is the one place the platform talks to the KYC vendor, so its
 * contract is pinned here against a stubbed `fetch` and a hand-computed
 * signature: the request it builds, and the two ways a callback can arrive
 * without ever having been signed by Cashfree.
 */

const originalFetch = globalThis.fetch;

function setFetch(fn: unknown): void {
  (globalThis as unknown as { fetch: unknown }).fetch = fn;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async (): Promise<string> => JSON.stringify(body),
  } as unknown as Response;
}

function gateway(overrides: { id?: string; secret?: string; env?: 'sandbox' | 'production' } = {}) {
  return new CashfreeVerificationGateway(
    overrides.id ?? 'client-id',
    overrides.secret ?? 'client-secret',
    overrides.env ?? 'sandbox',
  );
}

function sign(rawBody: string, timestamp: string, secret = 'client-secret'): string {
  return createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('base64');
}

afterEach(() => {
  setFetch(originalFetch);
});

describe('CashfreeVerificationGateway.createDigiLockerSession', () => {
  it('requests an Aadhaar-only DigiLocker link under our verification id', async () => {
    const fetchMock = jest.fn(async () =>
      jsonResponse({
        verification_id: 'i1',
        reference_id: 12345,
        url: 'https://verification-test.cashfree.com/dgl/h7562ci7us0',
        status: 'PENDING',
      }),
    );
    setFetch(fetchMock);

    const session = await gateway().createDigiLockerSession({ verificationId: 'i1' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sandbox.cashfree.com/verification/digilocker');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-client-id']).toBe('client-id');
    expect(headers['x-client-secret']).toBe('client-secret');
    expect(JSON.parse(init.body as string)).toEqual({
      verification_id: 'i1',
      document_requested: ['AADHAAR'],
      user_flow: 'signin',
    });
    expect(session.providerReference).toBe('12345');
    expect(session.url).toBe('https://verification-test.cashfree.com/dgl/h7562ci7us0');
  });

  it('expires the URL ten minutes out, as the vendor documents', async () => {
    setFetch(async () => jsonResponse({ reference_id: 1, url: 'https://example.test/dgl/x' }));

    const before = Date.now();
    const session = await gateway().createDigiLockerSession({ verificationId: 'i1' });
    const after = Date.now();

    // Bounded on both sides: the lifetime is measured from the call, so it can
    // never be shorter than nine minutes nor longer than ten minutes after it.
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 9 * 60_000);
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(after + 10 * 60_000);
  });

  it('uses the production host in production', async () => {
    const fetchMock = jest.fn(async () => jsonResponse({ reference_id: 1, url: 'https://x.test/u' }));
    setFetch(fetchMock);

    await gateway({ env: 'production' }).createDigiLockerSession({ verificationId: 'i1' });

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.cashfree.com/verification/digilocker');
  });

  it('refuses to invent a session when the vendor returns no URL', async () => {
    setFetch(async () => jsonResponse({ reference_id: 1, status: 'PENDING' }));

    await expect(gateway().createDigiLockerSession({ verificationId: 'i1' })).rejects.toThrow(
      /no consent URL/,
    );
  });

  it('surfaces a rejected request with the vendor diagnostic in the message', async () => {
    setFetch(async () =>
      jsonResponse({ code: 'x-client-secret_value_invalid', message: 'bad secret' }, 401),
    );

    await expect(gateway().createDigiLockerSession({ verificationId: 'i1' })).rejects.toThrow(
      /HTTP 401/,
    );
  });

  it('fails closed instead of calling the vendor when it is not configured', async () => {
    const fetchMock = jest.fn();
    setFetch(fetchMock);

    await expect(gateway({ secret: '' }).createDigiLockerSession({ verificationId: 'i1' })).rejects.toThrow(
      /not configured/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CashfreeVerificationGateway.verifyWebhookSignature', () => {
  const body = '{"event_type":"DIGILOCKER_VERIFICATION_SUCCESS","data":{}}';

  it('accepts the HMAC Cashfree would send over timestamp + raw body', () => {
    const timestamp = '1746427759733';

    expect(gateway().verifyWebhookSignature(body, sign(body, timestamp), timestamp)).toBe(true);
  });

  it('rejects a signature computed without the timestamp, which is the easy mistake', () => {
    const timestamp = '1746427759733';
    const wrong = createHmac('sha256', 'client-secret').update(body).digest('base64');

    expect(gateway().verifyWebhookSignature(body, wrong, timestamp)).toBe(false);
  });

  it('rejects a body that was altered after signing', () => {
    const timestamp = '1746427759733';
    const signature = sign(body, timestamp);

    expect(
      gateway().verifyWebhookSignature(`${body} `, signature, timestamp),
    ).toBe(false);
  });

  it('rejects a missing signature or timestamp without throwing', () => {
    expect(gateway().verifyWebhookSignature(body, undefined, '1746427759733')).toBe(false);
    expect(gateway().verifyWebhookSignature(body, 'abc=', undefined)).toBe(false);
  });

  it('rejects an empty body even when a matching signature is presented', () => {
    const timestamp = '1746427759733';

    expect(gateway().verifyWebhookSignature('', sign('', timestamp), timestamp)).toBe(false);
  });

  it('rejects everything when the client secret is empty', () => {
    const timestamp = '1746427759733';

    expect(
      gateway({ secret: '' }).verifyWebhookSignature(body, sign(body, timestamp), timestamp),
    ).toBe(false);
  });
});
