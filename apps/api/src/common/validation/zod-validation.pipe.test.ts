import { describe, it, expect } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe, toFieldIssues } from './zod-validation.pipe';

const METADATA = { type: 'body' as const, metatype: undefined, data: undefined };

const Profile = z.object({
  name: z.string().min(1),
  age: z.coerce.number().int().min(18),
  religion: z.string().optional(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(Profile);

  it('returns the parsed value so schema defaults reach the handler', () => {
    const parsed = pipe.transform({ name: 'Asha', age: 29 }, METADATA);
    expect(parsed).toEqual({ name: 'Asha', age: 29 });
  });

  it('applies coercions declared in the schema', () => {
    // Query strings arrive as strings. Without coercion, `age` would stay a
    // string and any numeric comparison downstream would be wrong.
    const parsed = pipe.transform({ name: 'Asha', age: '29' }, METADATA);
    expect(parsed.age).toBe(29);
    expect(typeof parsed.age).toBe('number');
  });

  it('rejects an invalid body with 400', () => {
    expect(() => pipe.transform({ name: '', age: 29 }, METADATA)).toThrow(BadRequestException);
  });

  it('groups messages by field so a client can map them to inputs', () => {
    try {
      pipe.transform({ name: '', age: 12 }, METADATA);
      throw new Error('expected the pipe to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        errors: { field: string; messages: string[] }[];
      };
      const fields = response.errors.map((issue) => issue.field);
      expect(fields).toContain('name');
      expect(fields).toContain('age');
    }
  });

  it('rejects unknown fields so a typo is not silently ignored', () => {
    // A misspelled field that is silently dropped would look like a successful
    // write that stored nothing.
    const strict = new ZodValidationPipe(Profile.strict());
    expect(() => strict.transform({ name: 'Asha', age: 29, religon: 'Hindu' }, METADATA)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a non-object body', () => {
    expect(() => pipe.transform('not-a-profile', METADATA)).toThrow(BadRequestException);
  });
});

describe('toFieldIssues', () => {
  it('joins nested paths with dots', () => {
    const issues = toFieldIssues([{ path: ['body', 'photos', 0, 'url'], message: 'Required' }]);
    expect(issues).toEqual([{ field: 'body.photos.0.url', messages: ['Required'] }]);
  });

  it('merges repeated failures on the same field', () => {
    const issues = toFieldIssues([
      { path: ['age'], message: 'Too small' },
      { path: ['age'], message: 'Not an integer' },
    ]);
    expect(issues).toEqual([{ field: 'age', messages: ['Too small', 'Not an integer'] }]);
  });

  it('labels a path-less issue as _root rather than dropping it', () => {
    // Schema-level refinements produce these. Silently discarding them would
    // return an empty error list for a rejected request.
    const issues = toFieldIssues([{ path: [], message: 'Unprocessable' }]);
    expect(issues).toEqual([{ field: '_root', messages: ['Unprocessable'] }]);
  });
});
