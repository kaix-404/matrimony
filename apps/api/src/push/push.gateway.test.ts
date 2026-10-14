import { generateKeyPairSync } from 'node:crypto';
import { FcmPushGateway, FCM_BASE_URL, FCM_TOKEN_URL, type FcmConfig } from './push.gateway';

/**
 * The FCM gateway (section 42). `fetch` is replaced wholesale: these tests are
 * about the shape of the two HTTP calls and the reading of FCM's responses, not
 * about Google being reachable. A real RSA key is generated once so the JWT
 * assertion actually signs — that path is worth exercising, since a broken
 * assertion is the single failure that disables push entirely.
 */
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function account(overrides: Partial<Record<string, string>> = {}): string {
  return JSON.stringify({
    project_id: 'matrimony-test',
    client_email: 'push@matrimony-test.iam.gserviceaccount.com',
    private_key: privateKey,
    ...overrides,
  });
}

/** A minimal stand-in for the parts of `Response` the gateway touches. */
function response(status: number, body: unknown): Response {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => raw,
  } as unknown as Response;
}

function gateway(overrides: Partial<FcmConfig> = {}): FcmPushGateway {
  return new FcmPushGateway({
    serviceAccountJson: account(),
    tokenUrl: FCM_TOKEN_URL,
    baseUrl: FCM_BASE_URL,
    ...overrides,
  });
}

const message = { token: 'device-token', title: 'Hello', body: 'World' };

describe('FcmPushGateway configuration', () => {
  it('is not configured when the credential is empty', () => {
    const gw = new FcmPushGateway({ serviceAccountJson: '' });
    expect(gw.configured).toBe(false);
  });

  it('is not configured when the credential is malformed', () => {
    const gw = new FcmPushGateway({ serviceAccountJson: '{not json' });
    expect(gw.configured).toBe(false);
  });

  it('is not configured when a required field is missing', () => {
    const gw = new FcmPushGateway({
      serviceAccountJson: JSON.stringify({ project_id: 'p', client_email: 'e' }),
    });
    expect(gw.configured).toBe(false);
  });

  it('is configured with a complete service account', () => {
    expect(gateway().configured).toBe(true);
  });
});

describe('FcmPushGateway.send', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exchanges an assertion for a token and posts the message', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(200, { access_token: 'ya29.token', expires_in: 3600 }))
      .mockResolvedValueOnce(response(200, { name: 'projects/matrimony-test/messages/1' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gateway().send(message);

    expect(result).toEqual({
      providerMessageId: 'projects/matrimony-test/messages/1',
      invalidToken: false,
    });

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe(FCM_TOKEN_URL);
    expect(String((tokenInit as RequestInit).body)).toContain('grant_type=');

    const [sendUrl, sendInit] = fetchMock.mock.calls[1];
    expect(sendUrl).toBe(`${FCM_BASE_URL}/v1/projects/matrimony-test/messages:send`);
    expect((sendInit as RequestInit).headers).toMatchObject({
      authorization: 'Bearer ya29.token',
    });
    expect(JSON.parse(String((sendInit as RequestInit).body))).toEqual({
      message: { token: 'device-token', notification: { title: 'Hello', body: 'World' } },
    });
  });

  it('includes the data map only when one is supplied', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(200, { access_token: 't', expires_in: 3600 }))
      .mockResolvedValueOnce(response(200, { name: 'n' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await gateway().send({ ...message, data: { event: 'MATCH_NEW' } });

    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(body.message.data).toEqual({ event: 'MATCH_NEW' });
  });

  it('reports an unregistered token instead of throwing', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(200, { access_token: 't', expires_in: 3600 }))
      .mockResolvedValueOnce(
        response(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gateway().send(message);

    expect(result).toEqual({ providerMessageId: null, invalidToken: true });
  });

  it('treats a bare 404 as an invalid token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(200, { access_token: 't', expires_in: 3600 }))
      .mockResolvedValueOnce(response(404, { error: { message: 'Requested entity was not found.' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gateway().send(message);
    expect(result.invalidToken).toBe(true);
  });

  it('throws on a provider error that is not a dead token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(200, { access_token: 't', expires_in: 3600 }))
      .mockResolvedValueOnce(response(500, { error: { message: 'Internal error.' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(gateway().send(message)).rejects.toThrow(/HTTP 500/);
  });

  it('caches the access token across sends', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(200, { access_token: 't', expires_in: 3600 }))
      .mockResolvedValue(response(200, { name: 'n' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const gw = gateway();
    await gw.send(message);
    await gw.send(message);

    const tokenCalls = fetchMock.mock.calls.filter((c) => c[0] === FCM_TOKEN_URL);
    expect(tokenCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('refreshes the access token once on a 401 and retries', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(200, { access_token: 'old', expires_in: 3600 }))
      .mockResolvedValueOnce(response(401, { error: { message: 'Expired' } }))
      .mockResolvedValueOnce(response(200, { access_token: 'new', expires_in: 3600 }))
      .mockResolvedValueOnce(response(200, { name: 'n' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await gateway().send(message);

    expect(result.invalidToken).toBe(false);
    const tokenCalls = fetchMock.mock.calls.filter((c) => c[0] === FCM_TOKEN_URL);
    expect(tokenCalls).toHaveLength(2);
    const lastSend = fetchMock.mock.calls[3][1] as RequestInit;
    expect(lastSend.headers).toMatchObject({ authorization: 'Bearer new' });
  });

  it('throws when the token exchange fails', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response(400, { error: 'invalid_grant' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(gateway().send(message)).rejects.toThrow(/token exchange failed/);
  });
});
