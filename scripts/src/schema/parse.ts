import { z } from 'zod';

/** Render a ZodError's issues as `path: message; path: message`. */
export function formatZodIssues(error: z.ZodError, opts: { path?: boolean } = {}): string {
  const withPath = opts.path ?? true;
  return error.issues
    .map((i) => (withPath ? `${i.path.join('.') || '(root)'}: ${i.message}` : i.message))
    .join('; ');
}

/**
 * Validate `data` against `schema`, returning the parsed value or throwing the
 * error produced by `makeError(formattedIssues)`. Centralizes the
 * safeParse → format issues → throw pattern.
 */
export function parseOrThrow<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
  makeError: (issues: string) => Error,
): z.infer<S> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw makeError(formatZodIssues(parsed.error));
  return parsed.data;
}
