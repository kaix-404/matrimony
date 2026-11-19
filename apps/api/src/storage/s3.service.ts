import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
  type CORSRule,
} from '@aws-sdk/client-s3';
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
 * Photos normally never pass through the API. The client asks for a presigned
 * PUT, sends the bytes straight to storage, then confirms the upload. That keeps
 * large bodies out of the app server entirely, which matters for a service whose
 * whole job is serving images, and it means the API is never the thing holding an
 * unmoderated image in memory.
 *
 * The website is the exception, and it is a CORS problem rather than a design
 * preference: a browser PUT to the bucket is a cross-origin request, so it needs
 * a bucket CORS rule, and the R2 token this deployment holds cannot write one.
 * Browsers therefore send the bytes to the API (`putObject` below), which is one
 * origin from where the web app runs — the landing server proxies `/api` — so no
 * preflight is involved and no bucket rule is needed. The native app keeps the
 * presigned PUT.
 */
/** The one CORS rule this service owns; rules with other ids are left alone. */
const CORS_RULE_ID = 'member-app-uploads';

@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly signedUrlTtl: number;
  private readonly corsOrigins: string[];
  private readonly logger = new Logger(StorageService.name);

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
    // Tolerant of an env stub that predates the field: booting the graph must
    // not fail over an optional setting, and no origins means no write.
    this.corsOrigins = (env.S3_CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin !== '');

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
      // SDK v3 attaches a CRC32 checksum to every request. For a presigned PUT
      // it can only sign a placeholder — the body does not exist yet — so the
      // URL went out asking for `x-amz-checksum-crc32=AAAAAA==`, which no
      // browser can reproduce; the upload is then rejected for a checksum
      // mismatch even when everything else is right. Nothing here needs an
      // SDK-computed checksum: what a presigned PUT enforces is the size the
      // API signed.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  /**
   * Applies the bucket's browser-upload rule at boot.
   *
   * A presigned PUT is still a cross-origin request: the browser sends an
   * OPTIONS preflight first, and a bucket with no CORS rule refuses it — which
   * is exactly how photo and biodata uploads failed on the website while they
   * worked in the app. The rule is written from here because this process is
   * the one place that already holds the bucket's credentials, so a deploy
   * fixes it without anyone editing the bucket by hand.
   *
   * Best-effort, like the demo seed: the API must boot when the bucket cannot be
   * reached, and uploads fail loudly on their own until it can.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (this.corsOrigins.length === 0) return;
    try {
      // A bucket that has never had a CORS rule answers GetBucketCors with
      // `NoSuchCORSConfiguration` rather than an empty list, which is the very
      // case this exists for — starting from no rules, not skipping them.
      const current = await this.client
        .send(new GetBucketCorsCommand({ Bucket: this.bucket }))
        .catch((error: unknown) => {
          const name = (error as { name?: string }).name;
          if (name === 'NoSuchCORSConfiguration') return { CORSRules: [] as CORSRule[] };
          throw error;
        });
      const rules = mergeCorsRules(current.CORSRules ?? [], this.corsOrigins);
      if (JSON.stringify(rules) === JSON.stringify(current.CORSRules ?? [])) {
        this.logger.log(`Bucket CORS already allows uploads from ${this.corsOrigins.join(', ')}`);
        return;
      }
      await this.client.send(
        new PutBucketCorsCommand({ Bucket: this.bucket, CORSConfiguration: { CORSRules: rules } }),
      );
      this.logger.log(`Bucket CORS allows browser uploads from ${this.corsOrigins.join(', ')}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // The website does not need this rule — it sends its bytes through the API
      // (`putObject`). It is the direct-browser case that would break, so the
      // message says which one rather than implying uploads are down.
      this.logger.error(
        `Could not apply bucket CORS (direct browser uploads will be blocked; the website uses the API): ${detail}`,
      );
    }
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
   * Stores bytes the API is already holding.
   *
   * Used for website uploads, where the bytes arrived at the API because the
   * browser could not send them to the bucket (see the class comment). The
   * `ContentType` is the one the caller checked against the upload's own
   * reservation, not the raw request header, so what is stored is never whatever
   * a client claimed in a header this service did not validate.
   */
  async putObject(objectKey: string, body: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: mimeType,
        ContentLength: body.byteLength,
      }),
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

  /**
   * Reads an object back into memory.
   *
   * The one place the API does hold an upload's bytes: biodata extraction has to
   * see the document to parse it, and unlike a photo there is no way to hand the
   * parsing to the client without shipping the whole parser there too. The cap
   * is the caller's job — this returns whatever is stored — so the only callers
   * are ones that reserved the key through a flow which bounded the size.
   */
  async getObjectBytes(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    const body = response.Body;
    if (!body) throw new Error('Object has no body');

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}

/**
 * The upload rule, merged into whatever else the bucket already allows.
 *
 * Ours is replaced rather than appended, so changing the allowed origins is
 * idempotent instead of accumulating rules; every rule we did not write is kept
 * as it was, because this service does not own them.
 */
export function mergeCorsRules(existing: CORSRule[], origins: string[]): CORSRule[] {
  const ours: CORSRule = {
    ID: CORS_RULE_ID,
    AllowedOrigins: [...new Set(origins)],
    AllowedMethods: ['GET', 'PUT', 'HEAD'],
    // `content-type` is the header the upload sends; `content-length` is added
    // by the browser itself and allowed by the wildcard.
    AllowedHeaders: ['*'],
    ExposeHeaders: ['ETag'],
    MaxAgeSeconds: 3600,
  };

  return [...existing.filter((rule) => rule.ID !== CORS_RULE_ID), ours];
}
