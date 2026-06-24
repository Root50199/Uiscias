import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';

/** Reorder an object's keys to match `order` (keys not listed are dropped). */
export function orderKeys<T extends Record<string, unknown>>(
  value: T,
  order: readonly (keyof T)[],
): T {
  const out = {} as T;
  for (const key of order) {
    if (key in value) out[key] = value[key];
  }
  return out;
}

/**
 * Serialize a value to JSON formatted exactly as Prettier would (using the
 * repo's prettier config, resolved from `filepath`), so generated files are
 * stable and the `lint-staged` Prettier pass never rewrites them.
 */
export async function formatJson(value: unknown, filepath: string): Promise<string> {
  const raw = JSON.stringify(value, null, 2);
  return prettier.format(raw, { ...(await prettier.resolveConfig(filepath)), parser: 'json' });
}

/** Write `value` as Prettier-formatted JSON, creating parent dirs as needed. */
export async function writeJsonFile(filepath: string, value: unknown): Promise<void> {
  const text = await formatJson(value, filepath);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, text, 'utf8');
}

export function readJsonFile<T = unknown>(filepath: string): T {
  const text = fs.readFileSync(filepath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(text) as T;
}
