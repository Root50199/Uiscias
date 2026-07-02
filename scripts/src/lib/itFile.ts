import path from 'node:path';
import { globSync } from 'tinyglobby';
import { fse } from './io';

const pad5 = (n: number): string => String(n).padStart(5, '0');

/** The canonical `.it` filename for a mod's build: `Uiscias<id>_<00000>.it`. */
export const itName = (id: string, version: number): string => `Uiscias${id}_${pad5(version)}.it`;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const itNameRegExp = (modId: string): RegExp =>
  new RegExp(`^Uiscias${escapeRegExp(modId)}_(\\d{1,5})\\.it$`);

/** True when `fileName` is a `.it` built for exactly this `modId`. */
export const itBelongsToId = (fileName: string, modId: string): boolean =>
  itNameRegExp(modId).test(fileName);

export interface ExistingIt {
  name: string;
  version: number;
}

/**
 * Every `.it` in `buildDir` built for `modId`, ascending by version. Scoped to
 * the id on purpose — callers use it for version detection, where a stray file
 * from a former id must not influence the next version.
 */
export const listItFiles = (buildDir: string, modId: string): ExistingIt[] => {
  const re = itNameRegExp(modId);
  return globSync('Uiscias*_*.it', { cwd: buildDir })
    .map((name) => {
      const m = re.exec(name);
      return m ? { name, version: Number(m[1]) } : undefined;
    })
    .filter((x): x is ExistingIt => x !== undefined)
    .sort((a, b) => a.version - b.version);
};

/**
 * Delete every `.it` in `buildDir` except `keep`. Not scoped to a mod id: a
 * `build/` folder belongs to exactly one mod, so any other `.it` (e.g. left over
 * from a folder rename) is stale and should be removed.
 */
export const pruneItFiles = (buildDir: string, keep: string): void => {
  for (const name of globSync('Uiscias*_*.it', { cwd: buildDir })) {
    if (name !== keep) fse.removeSync(path.join(buildDir, name));
  }
};
