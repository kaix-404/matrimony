/**
 * Direct-to-storage upload.
 *
 * The API hands back a presigned PUT and the object key; the bytes never pass
 * through the app server (section 9). React Native's `fetch` can read a local
 * `file://` URI into a `Blob`, and the same call uploads that blob, so no
 * extra-permission filesystem module is needed. The `Content-Type` must match
 * what the signature was minted for or the storage provider rejects the PUT.
 */
export async function uploadToStorage(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
): Promise<void> {
  const local = await fetch(fileUri);
  const blob = await local.blob();

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  });

  if (!response.ok) {
    throw new Error('Upload failed (' + response.status + ')');
  }
}
