import { MSG91_FLOW_URL, Msg91SmsGateway } from './sms.gateway';

/**
 * MSG91 Flow delivery.
 *
 * The gateway is the one place the platform talks to the SMS vendor, so its
 * contract is pinned here against a stubbed `fetch`: the request it builds, the
 * body it sends, and — most importantly — that it refuses to call a send "done"
 * unless MSG91 agreed. A gateway that returned success on an error body would
 * leave users waiting for a code that was never accepted.
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

function makeGateway(overrides: Partial<ConstructorParameters<typeof Msg91SmsGateway>[0]> = {}) {
  return new Msg91SmsGateway({
    authKey: 'auth-key',
    senderId: 'MTRIMY',
    templateId: 'template-1',
    templateVariable: 'OTP',
    countryCode: '91',
    flowUrl: 'https://example.test/flow',
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

    await expect(makeGateway({ authKey: '' }).sendOtp({ mobile: '9876543210', code: '123456' })).rejects.toThrow(
      /not configured/,
    );
    // The vendor must never be contacted without a credential to authenticate.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a templated flow request with the code and an international number', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ type: 'success', message: 'req-9' }));
    setFetch(fetchMock);

    const result = await makeGateway().sendOtp({ mobile: '9876543210', code: '123456' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/flow');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.authkey).toBe('auth-key');
    expect(headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      template_id: 'template-1',
      sender: 'MTRIMY',
      mobiles: '919876543210',
      OTP: '123456',
    });
    expect(result.providerMessageId).toBe('req-9');
  });

  it('does not prefix the country code onto a number that already carries one', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ type: 'success', message: 'req-1' }));
    setFetch(fetchMock);

    await makeGateway().sendOtp({ mobile: '+91 98765 43210', code: '123456' });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.mobiles).toBe('919876543210');
  });

  it('throws when MSG91 answers 200 with an error type', async () => {
    setFetch(
      jest.fn().mockResolvedValue(jsonResponse({ type: 'error', message: 'invalid template' })),
    );

    await expect(makeGateway().sendOtp({ mobile: '9876543210', code: '123456' })).rejects.toThrow(
      /invalid template/,
    );
  });

  it('throws on a non-2xx response', async () => {
    setFetch(jest.fn().mockResolvedValue(jsonResponse({}, 500)));

    await expect(makeGateway().sendOtp({ mobile: '9876543210', code: '123456' })).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it('throws a readable error when the body is not JSON', async () => {
    setFetch(
      jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async (): Promise<string> => '<html>gateway</html>',
      } as unknown as Response),
    );

    await expect(makeGateway().sendOtp({ mobile: '9876543210', code: '123456' })).rejects.toThrow(
      /HTML|502|gateway/i,
    );
  });
});

describe('MSG91_FLOW_URL', () => {
  it('pins the vendor endpoint callers cannot accidentally change', () => {
    expect(MSG91_FLOW_URL).toBe('https://control.msg91.com/api/v5/flow/');
  });
});
