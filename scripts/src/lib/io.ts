import path from 'node:path';
import YAML from 'yaml';
import prettier from 'prettier';
import type { BuiltInParserName } from 'prettier';
import fse from 'fs-extra';

/** Re-export the fs-extra surface the scripts use, so callers import from one place. */
export { fse };

// --- paths ---------------------------------------------------------------

/** Convert a path to posix separators (no-op on posix, `\` → `/` on Windows). */
export const toPosix = (p: string): string => p.split(path.sep).join('/');

/** `path.relative(from, to)` expressed with posix separators. */
export const relPosix = (from: string, to: string): string => toPosix(path.relative(from, to));

// --- text io -------------------------------------------------------------

/**
 * Read a UTF-8 text file, stripping a leading BOM. Legacy files (and anything a
 * PowerShell `Out-File` produced) carry a UTF-8 BOM that breaks `JSON.parse` and
 * `YAML.parse`, so every text read in the tooling goes through here.
 */
export const readText = (file: string): string =>
  fse.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');

// --- formatting ----------------------------------------------------------

/**
 * Format `text` with Prettier using the repo's resolved config (looked up from
 * `filepath`), so generated files match what the `lint-staged` Prettier pass
 * would produce and never get rewritten on commit.
 */
export const formatText = async (
  text: string,
  parser: BuiltInParserName,
  filepath: string,
): Promise<string> =>
  prettier.format(text, { ...(await prettier.resolveConfig(filepath)), parser });

// --- json / yaml ---------------------------------------------------------

/** Reorder an object's keys to match `order` (keys not listed are dropped). */
export const orderKeys = <T extends Record<string, unknown>>(
  value: T,
  order: readonly (keyof T)[],
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of order) {
    if (key in value) out[String(key)] = value[key];
  }
  return out;
};

/**
 * Serialize a value to JSON formatted exactly as Prettier would (using the
 * repo's prettier config, resolved from `filepath`), so generated files are
 * stable and the `lint-staged` Prettier pass never rewrites them.
 */
export const formatJson = async (value: unknown, filepath: string): Promise<string> =>
  formatText(JSON.stringify(value, null, 2), 'json', filepath);

/** Write `value` as Prettier-formatted JSON, creating parent dirs as needed. */
export const writeJsonFile = async (filepath: string, value: unknown): Promise<void> => {
  await fse.outputFile(filepath, await formatJson(value, filepath), 'utf8');
};

export const readJsonFile = (filepath: string): unknown => JSON.parse(readText(filepath));

/** Write a value as Prettier-formatted YAML, creating parent dirs as needed. */
export const writeYamlFile = async (filepath: string, value: unknown): Promise<void> => {
  const text = await formatText(YAML.stringify(value), 'yaml', filepath);
  await fse.outputFile(filepath, text, 'utf8');
};

export const readYamlFile = (filepath: string): unknown => YAML.parse(readText(filepath));
