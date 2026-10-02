import { Inject, Injectable } from '@nestjs/common';
import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../config/env';

/**
 * Object storage, addressed through the S3 API.
 *
 * Cloudflare R2 in production and MinIO locally (client decision 2026-10-01),
 * so the client code never names a provider. This is what makes swapping the
 * bucket a config change — and what would let us move off R2 if GAP-11 (R2 has
 * no India jurisdiction) is decided against it.
 *
 * Photos never pass through the API. The client asks for a presigned PUT, sends
 * the bytes straight to storage, then confirms the upload. That keeps large
 * bodies out of the app server entirely, which matters for a service whose whole
 * job is serving images, and it means the API is never the thing holding an
 * unmoderated image in memory.
 */
@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtl: number;

  /**
   * `@Inject('ENV')` is required rather than decorative: `Env` is a TypeScript
   * type, so it does not exist at runtime and `design:paramtypes` records
   * `Object` for this parameter. Without the explicit token, Nest looks for a
   * provider whose token *is* `Object` and fails to resolve — a wiring error
   * that type-checking cannot see, the same shape of problem as the Prisma token
   * in `prisma.module.ts`.
   */
  constructor(@Inject('ENV') env: Env) {
    this.bucket = env.S3_BUCKET;
    this.signedUrlTtl = env.S3_SIGNED_URL_TTL;
    this.client = new S3Client({
      // R2 is addressed as a single global service by account, so `endpoint`
      // plus path-style addressing is what makes it work; a regional AWS
      // endpoint works through the same code with no change.
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
    });
  }

  /**
   * Presigns an upload.
   *
   * The `ContentType` is bound into the signature, so the client cannot upload
   * an HTML or SVG file under an `image/jpeg` content type and have it stored
   * and later served as such. That binding is the point: without it the
   * declared type is a claim the client makes, and stored XSS via a "photo" is
   * the outcome.
   */
  async presignUpload(objectKey: string, mimeType: string, byteSize: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ContentType: mimeType,
        ContentLength: byteSize,
      }),
      { expiresIn: this.signedUrlTtl },
    );
  }

  /**
   * Presigns a read.
   *
   * Short-lived by design (section 41): a leaked photo URL is a permanent leak
   * for as long as it is valid, so the lifetime is minutes rather than hours.
   */
  async presignDownload(objectKey: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      {
        expiresIn: this.signedUrlTtl,
      },
    );
  }
}
