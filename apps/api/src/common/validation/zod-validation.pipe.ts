import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * Request validation, using the same Zod schemas as the shared contracts.
 *
 * Section 41 requires request validation, and the previous implementation used
 * Nest's `ValidationPipe`, which silently requires `class-validator` at
 * runtime. That package was not installed, and `ValidationPipe` responds by
 * calling `process.exit(1)`, so the API exited during bootstrap instead of
 * starting. Validating with Zod instead of class-validator keeps one schema
 * language across the API, the shared package and the clients, so a contract
 * cannot drift between the server and the app that consumes it.
 */

export interface FieldIssue {
  field: string;
  messages: string[];
}

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);

    if (result.success) {
      // The parsed value is returned, not the raw input, so defaults and
      // coercions declared in the schema actually reach the handler.
      return result.data;
    }

    throw new BadRequestException({
      message: 'Request validation failed',
      errors: toFieldIssues(result.error.issues),
    });
  }
}

/**
 * Flattens Zod issues into per-field messages.
 *
 * Zod's path may point into nested objects and arrays (`body.photos.0.url`),
 * which is joined with a dot so a client can map an error straight onto the
 * field the user was editing. Issues with an empty path land under `_root`,
 * which happens for schema-level refinements.
 */
export function toFieldIssues(
  issues: readonly { path: PropertyKey[]; message: string }[],
): FieldIssue[] {
  const byField = new Map<string, string[]>();

  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.map(String).join('.') : '_root';
    const messages = byField.get(field);
    if (messages) {
      messages.push(issue.message);
    } else {
      byField.set(field, [issue.message]);
    }
  }

  return [...byField.entries()].map(([field, messages]) => ({ field, messages }));
}
