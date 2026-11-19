import { PayloadTooLargeException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';

/**
 * How far past the cap a refused upload is read and thrown away.
 *
 * A refusal has to be delivered: cutting the socket while the client is still
 * sending turns "that file is too large" into a network error the member cannot
 * act on. So the remainder is drained — but only this far, because a client
 * that keeps sending after being refused is not owed an unbounded read.
 */
const DRAIN_ALLOWANCE_BYTES = 2 * 1024 * 1024;

/**
 * Reads a file the client is sending to the API itself.
 *
 * This exists only for the website's upload path (see `StorageService.putObject`).
 * It is safe to read the stream here because Nest's Express adapter registers
 * parsers for `application/json` and `application/x-www-form-urlencoded` only:
 * a body declared as `image/jpeg`, `application/pdf` or `text/plain` is not
 * consumed by anything before this, so the raw stream is still intact and
 * `req.body` is empty.
 *
 * The cap is applied while reading rather than after, so an oversized upload is
 * never buffered in full.
 */
export async function readUploadBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  let refused = false;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buf.byteLength;

    if (total <= maxBytes) {
      chunks.push(buf);
      continue;
    }

    refused = true;
    if (total > maxBytes + DRAIN_ALLOWANCE_BYTES) break;
  }

  if (refused) {
    throw new PayloadTooLargeException(`Upload must be at most ${maxBytes} bytes`);
  }

  return Buffer.concat(chunks);
}

/**
 * The media type without its parameters.
 *
 * A browser sends `image/jpeg` exactly, but a `Blob` given a type with a charset,
 * or a proxy that appends one, would otherwise fail the equality check against
 * the reserved type for a cosmetic reason.
 */
export function bareContentType(header: string | undefined): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}
