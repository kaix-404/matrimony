import { uploadToStorage } from './upload';

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
