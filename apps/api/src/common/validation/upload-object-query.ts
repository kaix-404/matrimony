import { z } from 'zod';

/**
 * Which reserved upload a body belongs to, when the bytes come to the API.
 *
 * The website sends uploads through the API rather than to the bucket (a browser
 * PUT needs a bucket CORS rule this deployment cannot write), and the body is the
 * file itself — so the object key travels in the query string. It is only ever a
 * lookup key: each service checks that it names an upload this caller reserved.
 */
export const UploadObjectQuerySchema = z
  .object({
    object_key: z.string().min(1).max(512),
  })
  .strict();

export type UploadObjectQuery = z.infer<typeof UploadObjectQuerySchema>;
