import {
  MSG91_BALANCE_URL,
  MSG91_FLOW_URL,
  Msg91SmsGateway,
  SmsCreditExhaustedError,
} from './sms.gateway';

/**
 * MSG91 Flow delivery.
 *
 * The gateway is the one place the platform talks to the SMS vendor, so its
 * contract is pinned here against a stubbed `fetch`: the request it builds, the
 * body it sends, and — most importantly — that it refuses to call a send "done"
 * unless MSG91 agreed *and* the wallet could pay for it. MSG91 accepts a send it
 * will never deliver when the account has no credit, so a gateway that trusted
 * the success body alone would leave users waiting for a code that was never
 * going to arrive.
 */

const BALANCE_URL = 'https://example.test/balance';
const FLOW_URL = 'https://example.test/flow';

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

function textResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async (): Promise<string> => body,
  } as unknown as Response;
}

function callUrl(input: unknown): string {
  return String(input instanceof URL ? input.toString() : input);
}

interface VendorOptions {
  /** Raw balance body; `null` makes the probe fail outright. */
  balance?: string | null;
  flow?: { body: unknown; status?: number };
}

/** Stubs the vendor, dispatching on the URL the way the real service is split. */
function mockVendor({ balance = '25.00', flow }: VendorOptions = {}): jest.Mock {
  return jest.fn(async (input: unknown) => {
    if (callUrl(input).startsWith(BALANCE_URL)) {
      return balance === null ? textResponse('unavailable', 503) : textResponse(balance);
    }
    const answered = flow ?? { body: { type: 'success', message: 'req-1' } };
    return jsonResponse(answered.body, answered.status);
  });
}

function callsTo(mock: jest.Mock, url: string): unknown[][] {
  return mock.mock.calls.filter((call) => callUrl(call[0]).startsWith(url));
}

function makeGateway(overrides: Partial<ConstructorParameters<typeof Msg91SmsGateway>[0]> = {}) {
  return new Msg91SmsGateway({
    authKey: 'auth-key',
    senderId: 'MTRIMY',
    templateId: 'template-1',
    templateVariable: 'OTP',
    countryCode: '91',
    flowUrl: FLOW_URL,
    balanceUrl: BALANCE_URL,
    ...overrides,
  });
}

afterEach(() => {
  setFetch(originalFetch);
});

describe('Msg91SmsGateway', () => {
  it('reports unconfigured when any credential is blank', () => {
    expect(makeGateway({ senderId: '' }).configured).toBe(false);
    expect(makeGateway({ templateId: '   ' }).configured).toBe(false);
    expect(makeGateway({ authKey: '' }).configured).toBe(false);
  });

  it('is configured when every credential is present', () => {
    expect(makeGateway().configured).toBe(true);
  });

  it('refuses to send when unconfigured', async () => {
    const fetchMock = jest.fn();
    setFetch(fetchMock);

    await expect(
      makeGateway({ authKey: '' }).sendOtp({ mobile: '9876543210', code: '123456' }),
    ).rejects.toThrow(/not configured/);
    // The vendor must never be contacted without a credential to authenticate.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a templated flow request with the code and an international number', async () => {
    const fetchMock = mockVendor({ flow: { body: { type: 'success', message: 'req-9' } } });
    setFetch(fetchMock);

    const result = await makeGateway().sendOtp({ mobile: '9876543210', code: '123456' });

    const [flowCall] = callsTo(fetchMock, FLOW_URL);
    const [url, init] = flowCall as [string, RequestInit];
    expect(url).toBe(FLOW_URL);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authkey).toBe('auth-key');
    expect(headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      flow_id: 'template-1',
      sender: 'MTRIMY',
      recipients: [{ mobiles: '919876543210', OTP: '123456' }],
    });
    expect(result.providerMessageId).toBe('req-9');
  });

  it('does not prefix the country code onto a number that already carries one', async () => {
    const fetchMock = mockVendor();
    setFetch(fetchMock);

    await makeGateway().sendOtp({ mobile: '+91 98765 43210', code: '123456' });

    const [, init] = callsTo(fetchMock, FLOW_URL)[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.recipients[0].mobiles).toBe('919876543210');
  });

  it('asks for the transactional balance, sending the authkey as a query parameter', async () => {
    const fetchMock = mockVendor();
    setFetch(fetchMock);

    await makeGateway().sendOtp({ mobile: '9876543210', code: '123456' });

    const [balanceCall] = callsTo(fetchMock, BALANCE_URL);
    const url = new URL(callUrl(balanceCall[0]));
    // This endpoint ignores the `authkey` header the Flow API uses, so the key
    // has to be in the query string — never assert otherwise.
    expect(url.searchParams.get('authkey')).toBe('auth-key');
    expect(url.searchParams.get('type')).toBe('4');
    const headers = (balanceCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authkey).toBeUndefined();
  });

  it('refuses to send when the wallet is empty, rather than reporting a queued drop as sent', async () => {
    const fetchMock = mockVendor({ balance: '0' });
    setFetch(fetchMock);

    // The class matters, not just the wording: the controller turns this one
    // refusal into a coded 503, and a plain Error would reach the app as an
    // anonymous failure.
    const send = makeGateway().sendOtp({ mobile: '9876543210', code: '123456' });
    await expect(send).rejects.toBeInstanceOf(SmsCreditExhaustedError);
    await expect(send).rejects.toMatchObject({ code: 'SMS_UNAVAILABLE' });
    // Nothing is posted: a send the wallet cannot pay for would be accepted and
    // silently dropped, so the message must not reach the vendor at all.
    expect(callsTo(fetchMock, FLOW_URL)).toHaveLength(0);
  });

  it('still sends when the balance probe cannot answer', async () => {
    const fetchMock = mockVendor({ balance: null });
    setFetch(fetchMock);

    await expect(
      makeGateway().sendOtp({ mobile: '9876543210', code: '123456' }),
    ).resolves.toEqual({ providerMessageId: 'req-1' });
    expect(callsTo(fetchMock, FLOW_URL)).toHaveLength(1);
  });

  it('treats an unreadable balance body as no reading rather than zero', async () => {
    const fetchMock = mockVendor({ balance: '{"msg":"201","msgType":"error"}' });
    setFetch(fetchMock);

    await expect(
      makeGateway().sendOtp({ mobile: '9876543210', code: '123456' }),
    ).resolves.toEqual({ providerMessageId: 'req-1' });
  });

  it('reuses one balance reading for sends inside the cache window', async () => {
    const fetchMock = mockVendor();
    setFetch(fetchMock);
    const gateway = makeGateway();

    await gateway.sendOtp({ mobile: '9876543210', code: '111111' });
    await gateway.sendOtp({ mobile: '9876543211', code: '222222' });

    expect(callsTo(fetchMock, FLOW_URL)).toHaveLength(2);
    // One code per login, so a probe per send would double the vendor traffic for
    // a number that only moves when someone recharges.
    expect(callsTo(fetchMock, BALANCE_URL)).toHaveLength(1);
  });

  it('throws when MSG91 answers 200 with an error type', async () => {
    setFetch(mockVendor({ flow: { body: { type: 'error', message: 'invalid template' } } }));

    await expect(
      makeGateway().sendOtp({ mobile: '9876543210', code: '123456' }),
    ).rejects.toThrow(/invalid template/);
  });

  it('throws on a non-2xx response', async () => {
    setFetch(mockVendor({ flow: { body: {}, status: 500 } }));

    await expect(
      makeGateway().sendOtp({ mobile: '9876543210', code: '123456' }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('throws a readable error when the body is not JSON', async () => {
    setFetch(
      jest.fn(async (input: unknown) =>
        callUrl(input).startsWith(BALANCE_URL)
          ? textResponse('10.00')
          : textResponse('<html>gateway</html>', 502),
      ),
    );

    await expect(
      makeGateway().sendOtp({ mobile: '9876543210', code: '123456' }),
    ).rejects.toThrow(/HTML|502|gateway/i);
  });
});

describe('vendor endpoints', () => {
  it('pins the URLs callers cannot accidentally change', () => {
    expect(MSG91_FLOW_URL).toBe('https://control.msg91.com/api/v5/flow/');
    expect(MSG91_BALANCE_URL).toBe('https://control.msg91.com/api/balance.php');
  });
});
