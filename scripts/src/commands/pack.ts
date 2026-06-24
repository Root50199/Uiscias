import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, packTargets, type Mod } from '../lib/mods';
import { resolveTargetMods, type ScopeOptions } from '../lib/scope';
import { computeDataHash } from '../lib/hash';
import { orderKeys, writeJsonFile } from '../lib/json';
import { packDataFolder } from '../lib/packer';
import { gitAddAll } from '../lib/git';
import { readBuildLock } from '../lib/config';
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

function listItFiles(buildDir: string, modId: string): ExistingIt[] {
  if (!fs.existsSync(buildDir)) return [];
  const re = new RegExp(`^Uiscias${escapeRegExp(modId)}_(\\d{1,5})\\.it$`);
  return fs
    .readdirSync(buildDir)
    .map((name) => {
      const m = re.exec(name);
      return m ? { name, version: Number(m[1]) } : undefined;
    })
    .filter((x): x is ExistingIt => x !== undefined)
    .sort((a, b) => a.version - b.version);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function writeLock(buildDir: string, lock: BuildLock): Promise<void> {
  await writeJsonFile(
    path.join(buildDir, 'build.lock.json'),
    orderKeys(buildLockSchema.parse(lock), BUILD_LOCK_KEY_ORDER),
  );
}

/** Delete every `.it` in buildDir except `keep`. */
function pruneItFiles(buildDir: string, modId: string, keep: string): void {
  for (const it of listItFiles(buildDir, modId)) {
    if (it.name !== keep) fs.rmSync(path.join(buildDir, it.name), { force: true });
  }
}

/**
 * Pack target mods into their `build/` folder, bumping the version only when the
 * source `data/` hash differs from the recorded `build.lock.json`. Keeps only
 * the latest `.it` per mod. On first run for a mod that already has a committed
 * `.it` but no lock, the existing `.it` is *adopted* (lock written, no repack).
 */
export async function runPack(opts: PackOptions): Promise<void> {
  const repoRoot = getRepoRoot();
  const mods = discoverMods(repoRoot);
  const targets = packTargets(resolveTargetMods(repoRoot, mods, opts));

  let packed = 0;
  let adopted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const touchedBuildDirs: string[] = [];

  for (const mod of targets) {
    try {
      await packOne(repoRoot, mod, opts.force ?? false, (kind) => {
        if (kind === 'packed') packed++;
        else if (kind === 'adopted') adopted++;
        else skipped++;
        if (kind !== 'skipped') touchedBuildDirs.push(path.join(mod.dir, 'build'));
      });
    } catch (err) {
      errors.push(`${mod.relDir}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (opts.stage && touchedBuildDirs.length > 0) {
    gitAddAll(repoRoot, touchedBuildDirs);
  }

  console.log(
    `Packed ${packed}, adopted ${adopted}, up to date ${skipped} (of ${targets.length} target(s)).`,
  );
  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s):`);
    for (const e of errors) console.error(`  ! ${e}`);
    process.exitCode = 1;
  }
}

type PackResult = 'packed' | 'adopted' | 'skipped';

async function packOne(
  repoRoot: string,
  mod: Mod,
  force: boolean,
  report: (kind: PackResult) => void,
): Promise<void> {
  const dataDir = mod.dataDir!;
  const buildDir = path.join(mod.dir, 'build');
  const hash = computeDataHash(mod.dir, dataDir);
  const lock = readBuildLock(buildDir);
  const existing = listItFiles(buildDir, mod.id);
  const newest = existing.at(-1);

  const lockFileExists = lock ? fs.existsSync(path.join(buildDir, lock.fileName)) : false;
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
}
