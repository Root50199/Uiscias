import path from 'node:path';
import { globSync } from 'tinyglobby';
import { fse } from './io';

/**
 * Leading word of every managed `.it` name. The only place a new filename's
 * prefix is spelled. Recognition (`parseItName`, `itBelongsToId`) matches it
 * case-insensitively so files published under an older casing still count.
 *
 * mabi-patcher rejects output names that don't start with a lowercase ASCII
 * letter, contain anything but letters/digits/`_`/`-`, or don't sort after
 * `data`; `itFile.test.ts` guards this value against those rules.
 */
export const MANAGED_PREFIX = 'uiscias';

const pad5 = (n: number): string => String(n).padStart(5, '0');

/** The canonical `.it` filename for a mod's build: `uiscias<id>_<00000>.it`. */
export const itName = (id: string, version: number): string =>
  `${MANAGED_PREFIX}${id}_${pad5(version)}.it`;

/** The part of `fileName` after the prefix (matched case-insensitively), or `null`. */
const stripPrefix = (fileName: string): string | null =>
  fileName.slice(0, MANAGED_PREFIX.length).toLowerCase() === MANAGED_PREFIX
    ? fileName.slice(MANAGED_PREFIX.length)
    : null;

/** `<modId>_<version>.it`; the greedy `(.+)` captures the modId. */
const MANAGED_REST = /^(.+)_(\d{1,5})\.it$/;

export interface ParsedItName {
  modId: string;
  version: number;
}

/** Parse a managed `.it` name into its modId + version, or `null` if it isn't one. */
export const parseItName = (fileName: string): ParsedItName | null => {
  const rest = stripPrefix(fileName);
  const match = rest === null ? null : MANAGED_REST.exec(rest);
  return match ? { modId: match[1], version: Number(match[2]) } : null;
};

/** True when `fileName` is a `.it` built for exactly this `modId`. */
export const itBelongsToId = (fileName: string, modId: string): boolean =>
  parseItName(fileName)?.modId === modId;

export interface ExistingIt {
  name: string;
  version: number;
}

/** Every managed `.it` name in `buildDir`, under any casing of the prefix. */
const managedItNames = (buildDir: string): string[] =>
  globSync('*.it', { cwd: buildDir }).filter((name) => parseItName(name) !== null);

/**
 * Every `.it` in `buildDir` built for `modId`, ascending by version. Scoped to
 * the id on purpose — callers use it for version detection, where a stray file
 * from a former id must not influence the next version.
 */
export const listItFiles = (buildDir: string, modId: string): ExistingIt[] =>
  managedItNames(buildDir)
    .map((name) => {
      const parsed = parseItName(name);
      return parsed?.modId === modId ? { name, version: parsed.version } : undefined;
    })
    .filter((x): x is ExistingIt => x !== undefined)
    .sort((a, b) => a.version - b.version);

/**
 * Delete every managed `.it` in `buildDir` except `keep`. Not scoped to a mod
 * id: a `build/` folder belongs to exactly one mod, so any other `.it` (e.g. left
 * over from a folder rename or an older prefix casing) is stale and should be
 * removed.
 */
export const pruneItFiles = (buildDir: string, keep: string): void => {
  for (const name of managedItNames(buildDir)) {
    if (name !== keep) fse.removeSync(path.join(buildDir, name));
  }
};
