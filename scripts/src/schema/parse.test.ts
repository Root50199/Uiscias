import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatZodIssues, parseOrThrow } from './parse';

const schema = z.object({ name: z.string().min(1), age: z.number() }).strict();

describe('formatZodIssues', () => {
  it('includes the issue path by default', () => {
    const result = schema.safeParse({ name: '', age: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatZodIssues(result.error)).toMatch(/^name: /);
    }
  });

  it('omits the path when path: false', () => {
    const result = schema.safeParse({ name: '', age: 1 });
    if (!result.success) {
      expect(formatZodIssues(result.error, { path: false })).not.toMatch(/name:/);
    }
  });
});

describe('parseOrThrow', () => {
  it('returns parsed data on success', () => {
    expect(parseOrThrow(schema, { name: 'a', age: 2 }, () => new Error('x'))).toEqual({
      name: 'a',
      age: 2,
    });
  });

  it('throws the error built from the formatted issues on failure', () => {
    expect(() =>
      parseOrThrow(schema, { name: '', age: 2 }, (issues) => new Error(`bad: ${issues}`)),
    ).toThrow(/^bad: /);
  });
});
