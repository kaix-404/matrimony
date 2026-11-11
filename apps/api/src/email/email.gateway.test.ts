import { Msg91EmailGateway } from './email.gateway';

/**
 * The MSG91 email gateway.
 *
 * The tests that matter are the failure ones. MSG91 answers HTTP 200 to sends it
 * has rejected in the body, so a gateway that trusted the status would report a
 * delivered code that never left the vendor — and the member would sit on the
 * code screen waiting for a message that does not exist.
 */

const CONFIG = {
  authKey: 'key_test',
  fromEmail: 'no-reply@example.com',
  fromName: 'Networth Matrimony',
  templateId: 'otp_template',
  templateVariable: 'otp',
  sendUrl: 'https://email.test/send',
};

function respond(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('Msg91EmailGateway', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('is unconfigured when the template id is missing', () => {
    expect(new Msg91EmailGateway({ ...CONFIG, templateId: '' }).configured).toBe(false);
    expect(new Msg91EmailGateway(CONFIG).configured).toBe(true);
  });

  it('refuses to send when unconfigured', async () => {
    const gateway = new Msg91EmailGateway({ ...CONFIG, authKey: '  ' });
    await expect(gateway.sendOtp({ email: 'a@b.com', code: '123456' })).rejects.toThrow(
      /not configured/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the template, the sender and the code as a recipient variable', async () => {
    fetchMock.mockResolvedValue(respond({ message: 'req_123' }));
    const gateway = new Msg91EmailGateway(CONFIG);

    const result = await gateway.sendOtp({ email: 'a@b.com', code: '123456' });

    expect(result.providerMessageId).toBe('req_123');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CONFIG.sendUrl);
    expect(new Headers(init.headers).get('authkey')).toBe('key_test');
    expect(JSON.parse(String(init.body))).toEqual({
      template_id: 'otp_template',
      from: { email: 'no-reply@example.com', name: 'Networth Matrimony' },
      recipients: [{ to: [{ email: 'a@b.com' }], variables: { otp: '123456' } }],
    });
  });

  it('treats an HTTP 200 with hasError as a failure', async () => {
    fetchMock.mockResolvedValue(respond({ hasError: true, message: 'template not approved' }));
    const gateway = new Msg91EmailGateway(CONFIG);

    await expect(gateway.sendOtp({ email: 'a@b.com', code: '123456' })).rejects.toThrow(
      /template not approved/,
    );
  });

  it('treats an error body as a failure even when the status is fine', async () => {
    fetchMock.mockResolvedValue(respond({ type: 'error', message: 'unverified domain' }));
    const gateway = new Msg91EmailGateway(CONFIG);

    await expect(gateway.sendOtp({ email: 'a@b.com', code: '123456' })).rejects.toThrow(
      /unverified domain/,
    );
  });

  it('surfaces a non-2xx status', async () => {
    fetchMock.mockResolvedValue(respond({ message: 'unauthorised' }, false, 401));
    const gateway = new Msg91EmailGateway(CONFIG);

    await expect(gateway.sendOtp({ email: 'a@b.com', code: '123456' })).rejects.toThrow(/HTTP 401/);
  });
});
