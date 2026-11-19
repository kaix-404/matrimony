import { uploadPickedFile, uploadToStorage } from './upload';

/**
 * The platform decides where the bytes go, so the test has to be able to say
 * which platform it is on. The helper asks whether a `document` exists — the same
 * signal `config.ts` uses — so occupying that global is what makes it a browser.
 */
const globals = globalThis as { document?: unknown };

function setBrowser(on: boolean): void {
  globals.document = on ? {} : undefined;
}

/**
 * The upload helper is the only place a member sees why a file did not reach
 * storage. A bare status code made "the bucket rejected the signature", "the
 * bucket does not exist" and "the browser blocked this origin" look identical.
 */
let fetchMock: jest.Mock;

const localFile = { blob: async () => ({ size: 3 }) } as unknown as Response;

function putResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

describe('uploading to storage', () => {
  beforeEach(() => {
    fetchMock = jest.fn();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves when storage accepts the PUT', async () => {
    fetchMock.mockResolvedValueOnce(localFile).mockResolvedValueOnce(putResponse(200, ''));

    await expect(
      uploadToStorage('https://r2.test/put', 'file:///a.jpg', 'image/jpeg'),
    ).resolves.toBeUndefined();
  });

  it("surfaces the provider's reason, not just the status", async () => {
    fetchMock
      .mockResolvedValueOnce(localFile)
      .mockResolvedValueOnce(
        putResponse(
          403,
          '<Error><Code>SignatureDoesNotMatch</Code>' +
            '<Message>The request signature we calculated does not match</Message></Error>',
        ),
      );

    await expect(
      uploadToStorage('https://r2.test/put', 'file:///a.jpg', 'image/jpeg'),
    ).rejects.toThrow(/SignatureDoesNotMatch/);
  });

  it('names a PUT that never got a response as unreachable storage', async () => {
    fetchMock
      .mockResolvedValueOnce(localFile)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(
      uploadToStorage('https://r2.test/put', 'file:///a.jpg', 'image/jpeg'),
    ).rejects.toThrow(/could not be reached/);
  });
});

/**
 * Which path a picked file takes.
 *
 * The app PUTs to the bucket; the website cannot, because that PUT is
 * cross-origin and the bucket has no CORS rule, so it sends the bytes through the
 * API. Picking the wrong one on the website is what made uploads fail there while
 * they worked in the app.
 */
describe('uploadPickedFile', () => {
  beforeEach(() => {
    fetchMock = jest.fn();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as unknown as typeof fetch);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setBrowser(false);
  });

  it('PUTs straight to storage in the app', async () => {
    setBrowser(false);
    fetchMock.mockResolvedValueOnce(localFile).mockResolvedValueOnce(putResponse(200, ''));
    const viaApi = jest.fn();

    await uploadPickedFile({
      presignedUrl: 'https://r2.test/put',
      fileUri: 'file:///a.jpg',
      mimeType: 'image/jpeg',
      viaApi,
    });

    expect(viaApi).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://r2.test/put');
  });

  it('sends the bytes through the API on the website', async () => {
    setBrowser(true);
    fetchMock.mockResolvedValueOnce(localFile);
    const viaApi = jest.fn(async () => undefined);

    await uploadPickedFile({
      presignedUrl: 'https://r2.test/put',
      fileUri: 'blob:http://localhost/abc',
      mimeType: 'image/jpeg',
      viaApi,
    });

    // One local read, then the API call: nothing is sent to the bucket.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(viaApi).toHaveBeenCalledWith(expect.anything(), 'image/jpeg');
  });
});
