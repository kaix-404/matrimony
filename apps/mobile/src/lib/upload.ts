/**
 * Direct-to-storage upload.
 *
 * The API hands back a presigned PUT and the object key; the bytes never pass
 * through the app server (section 9). React Native's `fetch` can read a local
 * `file://` URI into a `Blob`, and the same call uploads that blob, so no
 * extra-permission filesystem module is needed. The `Content-Type` must match
 * what the signature was minted for or the storage provider rejects the PUT.
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
