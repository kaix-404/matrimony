/**
 * File upload, per platform.
 *
 * The native app PUTs straight to storage with the presigned URL the API minted:
 * React Native's `fetch` reads a local `file://` URI into a `Blob`, and the
 * `Content-Type` must match what the signature was minted for or the storage
 * provider rejects the PUT (section 9).
 *
 * The website cannot do that. A browser PUT to the bucket is a cross-origin
 * request, so it needs a CORS rule on the bucket, and the deployment's R2 token
 * has no bucket-config rights to write one — the preflight came back
 * "CORS not configured for this bucket" and the upload died before it started.
 * The web build therefore sends the same bytes through the API, which is one
 * origin away (the landing server proxies `/api`), so there is no preflight and
 * no bucket rule to depend on. `uploadPickedFile` is the one place that chooses.
 */

/**
 * What the provider said about a rejected upload.
 *
 * S3 and R2 answer a refused PUT with an XML body naming the cause —
 * `AccessDenied`, `SignatureDoesNotMatch`, `NoSuchBucket`, `EntityTooLarge`.
 * Throwing that away left the member with `Upload failed (403)`, which is
 * unactionable: every one of those causes needs a different fix and none of them
 * is visible from the status code alone.
 */
async function rejectionMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1]?.trim();
  const detail = /<Message>([^<]+)<\/Message>/.exec(body)?.[1]?.trim();

  if (code) {
    return `Upload failed (HTTP ${response.status} · ${code}${detail ? `: ${detail}` : ''})`;
  }

  const text = body.trim();
  return text === ''
    ? `Upload failed (HTTP ${response.status})`
    : `Upload failed (HTTP ${response.status}: ${text.slice(0, 200)})`;
}

export async function uploadToStorage(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
): Promise<void> {
  const local = await fetch(fileUri);
  const blob = await local.blob();

  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: blob,
    });
  } catch {
    // A browser refuses this before a status exists when the bucket sends no
    // CORS headers for this origin; React Native has no such check, so the same
    // code works there and fails only on the website. Saying which of the two
    // happened is the difference between a bucket rule and a network problem.
    throw new Error(
      'Upload failed: storage could not be reached from this device. ' +
        'On the website this is usually the bucket refusing this origin.',
    );
  }

  if (!response.ok) {
    throw new Error(await rejectionMessage(response));
  }
}

/**
 * Whether this build runs in a browser.
 *
 * `document` rather than `Platform.OS` for the same reason `config.ts` uses it:
 * this module is plain logic and unit tested, and the mobile test runner has no
 * React Native transform. A browser has a `document`; the native runtime does
 * not.
 */
function isBrowser(): boolean {
  return typeof document !== 'undefined';
}

/**
 * Sends a picked file the way this platform can.
 *
 * Native keeps the presigned PUT: the bytes go straight to storage and never
 * touch the API. The website posts them to the API instead (`viaApi`), which
 * checks they belong to an upload this member reserved before storing them.
 * Both paths take the same local file, so the screens do not branch.
 */
export async function uploadPickedFile(file: {
  /** The presigned PUT from the API; used on native. */
  presignedUrl: string;
  fileUri: string;
  mimeType: string;
  /** Sends the bytes through the API; used on the website. */
  viaApi: (blob: Blob, mimeType: string) => Promise<void>;
}): Promise<void> {
  if (!isBrowser()) {
    await uploadToStorage(file.presignedUrl, file.fileUri, file.mimeType);
    return;
  }

  const local = await fetch(file.fileUri);
  const blob = await local.blob();
  await file.viaApi(blob, file.mimeType);
}
