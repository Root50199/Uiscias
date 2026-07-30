import path from 'node:path';
import { fse, orderKeys, writeJsonFile } from '../lib/io';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, packTargets, type Mod } from '../lib/mods';
import { resolveTargetMods, type ScopeOptions } from '../lib/scope';
import { computeDataHash } from '../lib/hash';
import { packDataFolder } from '../lib/packer';
import { gitAdd, gitAddAll } from '../lib/git';
import { readBuildLock } from '../lib/config';
import { itName, itBelongsToId, listItFiles, pruneItFiles } from '../lib/itFile';
import {
  readVersionLedger,
  writeVersionLedger,
  versionLedgerPath,
  floorFor,
  recordVersion,
} from '../lib/versionLedger';
import { ok, dim, Tally } from '../lib/term';
import {
  buildLockSchema,
  BUILD_LOCK_KEY_ORDER,
  type BuildLock,
  type VersionLedger,
} from '../schema';

export interface PackOptions extends ScopeOptions {
  /** Repack even when the source hash matches the lock. */
  force?: boolean;
}

/**
 * Write a mod's `build.lock.json`, stamping `updatedAt` with the current instant
 * (UTC ISO-8601). Callers pass everything *but* the date (`Omit<…, 'updatedAt'>`)
 * so the timestamp is owned in one place: every write records "packed just now",
 * and no call site can pass a stale or hand-picked value. Since a repack only
 * happens on a source-hash change, this timestamp tracks real content updates.
 */
const writeLock = async (buildDir: string, lock: Omit<BuildLock, 'updatedAt'>): Promise<void> => {
  await writeJsonFile(
    path.join(buildDir, 'build.lock.json'),
    buildLockSchema.parse(
      orderKeys({ ...lock, updatedAt: new Date().toISOString() }, BUILD_LOCK_KEY_ORDER),
    ),
  );
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

  // The version ledger is read once, floored/recorded per mod, and written once
  // at the end so a single pack run touches the committed file at most once.
  const ledger = readVersionLedger(repoRoot);
  let hasLedgerChanged = false;

  const tally = new Tally();
  const touchedBuildDirs: string[] = [];

  for (const mod of targets) {
    try {
      const didRecord = await packOne(repoRoot, mod, opts.force ?? false, ledger, (kind) => {
        tally.bump(kind);
        if (kind !== 'skipped') touchedBuildDirs.push(path.join(mod.dir, 'build'));
      });
      if (didRecord) hasLedgerChanged = true;
    } catch (e) {
      tally.addError(`${mod.relDir}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (hasLedgerChanged) {
    await writeVersionLedger(repoRoot, ledger);
  }

  if (opts.stage) {
    if (touchedBuildDirs.length > 0) gitAddAll(repoRoot, touchedBuildDirs);
    if (hasLedgerChanged) gitAdd(repoRoot, [versionLedgerPath(repoRoot)]);
  }

  const adopted = tally.get('adopted');
  console.log(
    `${ok(`Packed ${tally.get('packed')}`)}, ${adopted > 0 ? ok(`adopted ${adopted}`) : dim('adopted 0')}, ${dim(`up to date ${tally.get('skipped')}`)} (of ${targets.length} target(s)).`,
  );
  tally.printErrors();
  if (tally.hasErrors) process.exitCode = 1;
};

type PackResult = 'packed' | 'adopted' | 'skipped';

/**
 * Pack a single mod. Records the resulting version into `ledger` on every branch
 * (skip/adopt/pack) so the ledger self-heals to the current max each run, and
 * returns whether that record actually changed the ledger.
 */
const packOne = async (
  repoRoot: string,
  mod: Mod,
  force: boolean,
  ledger: VersionLedger,
  report: (kind: PackResult) => void,
): Promise<boolean> => {
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
  const lockNameMatchesId = lock ? itBelongsToId(lock.fileName, mod.id) : false;
  if (!force && lock && lock.builtFromHash === hash && lockFileExists && lockNameMatchesId) {
    report('skipped');
    return recordVersion(ledger, mod.id, lock.version);
  }

  // Bootstrap: a committed .it but no lock — adopt it as-is rather than churn.
  if (!force && !lock && newest) {
    pruneItFiles(buildDir, newest.name);
    await writeLock(buildDir, {
      version: newest.version,
      fileName: newest.name,
      builtFromHash: hash,
    });
    report('adopted');
    return recordVersion(ledger, mod.id, newest.version);
  }

  // Floor the bump against the ledger so a wiped lock/`.it` can never restart at
  // a number this modId has already published.
  const prior = Math.max(lock?.version ?? 0, newest?.version ?? 0, floorFor(ledger, mod.id));
  const nextVersion = prior + 1;
  const outName = itName(mod.id, nextVersion);
  packDataFolder(repoRoot, dataDir, path.join(buildDir, outName));
  pruneItFiles(buildDir, outName);
  await writeLock(buildDir, { version: nextVersion, fileName: outName, builtFromHash: hash });
  report('packed');
  return recordVersion(ledger, mod.id, nextVersion);
};
