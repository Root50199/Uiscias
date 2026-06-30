import path from 'node:path';
import { globSync } from 'tinyglobby';
import { fse, orderKeys, writeJsonFile } from '../lib/io';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, packTargets, type Mod } from '../lib/mods';
import { resolveTargetMods, type ScopeOptions } from '../lib/scope';
import { computeDataHash } from '../lib/hash';
import { packDataFolder } from '../lib/packer';
import { gitAddAll } from '../lib/git';
import { readBuildLock } from '../lib/config';
import { ok, dim, Tally } from '../lib/term';
import { buildLockSchema, BUILD_LOCK_KEY_ORDER, type BuildLock } from '../schema';

export interface PackOptions extends ScopeOptions {
  /** Repack even when the source hash matches the lock. */
  force?: boolean;
}

const pad5 = (n: number): string => String(n).padStart(5, '0');
const itName = (id: string, n: number): string => `Uiscias${id}_${pad5(n)}.it`;

interface ExistingIt {
  name: string;
  version: number;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listItFiles = (buildDir: string, modId: string): ExistingIt[] => {
  const re = new RegExp(`^Uiscias${escapeRegExp(modId)}_(\\d{1,5})\\.it$`);
  return globSync('Uiscias*_*.it', { cwd: buildDir })
    .map((name) => {
      const m = re.exec(name);
      return m ? { name, version: Number(m[1]) } : undefined;
    })
    .filter((x): x is ExistingIt => x !== undefined)
    .sort((a, b) => a.version - b.version);
};

const writeLock = async (buildDir: string, lock: BuildLock): Promise<void> => {
  await writeJsonFile(
    path.join(buildDir, 'build.lock.json'),
    buildLockSchema.parse(orderKeys(lock, BUILD_LOCK_KEY_ORDER)),
  );
};

/** Delete every `.it` in buildDir except `keep`. */
const pruneItFiles = (buildDir: string, modId: string, keep: string): void => {
  for (const it of listItFiles(buildDir, modId)) {
    if (it.name !== keep) fse.removeSync(path.join(buildDir, it.name));
  }
};

/**
 * Pack target mods into their `build/` folder, bumping the version only when the
 * source `data/` hash differs from the recorded `build.lock.json`. Keeps only
 * the latest `.it` per mod. On first run for a mod that already has a committed
 * `.it` but no lock, the existing `.it` is *adopted* (lock written, no repack).
 */
export const runPack = async (opts: PackOptions): Promise<void> => {
  const repoRoot = getRepoRoot();
  const mods = discoverMods(repoRoot);
  const targets = packTargets(resolveTargetMods(repoRoot, mods, opts));

  const tally = new Tally();
  const touchedBuildDirs: string[] = [];

  for (const mod of targets) {
    try {
      await packOne(repoRoot, mod, opts.force ?? false, (kind) => {
        tally.bump(kind);
        if (kind !== 'skipped') touchedBuildDirs.push(path.join(mod.dir, 'build'));
      });
    } catch (e) {
      tally.addError(`${mod.relDir}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (opts.stage && touchedBuildDirs.length > 0) {
    gitAddAll(repoRoot, touchedBuildDirs);
  }

  const adopted = tally.get('adopted');
  console.log(
    `${ok(`Packed ${tally.get('packed')}`)}, ${adopted > 0 ? ok(`adopted ${adopted}`) : dim('adopted 0')}, ${dim(`up to date ${tally.get('skipped')}`)} (of ${targets.length} target(s)).`,
  );
  tally.printErrors();
  if (tally.hasErrors) process.exitCode = 1;
};

type PackResult = 'packed' | 'adopted' | 'skipped';

const packOne = async (
  repoRoot: string,
  mod: Mod,
  force: boolean,
  report: (kind: PackResult) => void,
): Promise<void> => {
  if (!mod.dataDir) {
    throw new Error('missing data/');
  }
  const dataDir = mod.dataDir;
  const buildDir = path.join(mod.dir, 'build');
  const hash = computeDataHash(mod.dir, dataDir);
  const lock = readBuildLock(buildDir);
  const existing = listItFiles(buildDir, mod.id);
  const newest = existing.at(-1);

  const lockFileExists = lock ? fse.pathExistsSync(path.join(buildDir, lock.fileName)) : false;
  if (!force && lock && lock.builtFromHash === hash && lockFileExists) {
    report('skipped');
    return;
  }

  // Bootstrap: a committed .it but no lock — adopt it as-is rather than churn.
  if (!force && !lock && newest) {
    pruneItFiles(buildDir, mod.id, newest.name);
    await writeLock(buildDir, {
      version: newest.version,
      fileName: newest.name,
      builtFromHash: hash,
    });
    report('adopted');
    return;
  }

  const nextVersion = (lock?.version ?? newest?.version ?? 0) + 1;
  const outName = itName(mod.id, nextVersion);
  packDataFolder(repoRoot, dataDir, path.join(buildDir, outName));
  pruneItFiles(buildDir, mod.id, outName);
  await writeLock(buildDir, { version: nextVersion, fileName: outName, builtFromHash: hash });
  report('packed');
};
