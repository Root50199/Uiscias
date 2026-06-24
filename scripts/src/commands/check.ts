import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, packTargets } from '../lib/mods';
import { computeDataHash } from '../lib/hash';
import { readConfigJson, readBuildLock } from '../lib/config';
import { runGenerateConfigs } from './generateConfigs';

/**
 * CI drift check (hash-only; safe on Linux, never packs). Fails if any
 * generated artifact is out of sync with its source:
 *  - config.json is stale vs config.yaml + data/ (delegated to generate-configs --check),
 *  - config.json.sourceHash ≠ the current data/ hash,
 *  - build.lock.json is missing, stale, or points to a missing .it.
 * Backstops `--no-verify` commits and hook misconfiguration.
 */
export async function runCheck(): Promise<void> {
  // 1. config.json freshness (also validates config.yaml + schema).
  await runGenerateConfigs({ all: true, check: true });

  // 2. Pack drift: hashes must line up across data/ ↔ config.json ↔ build.lock.
  const repoRoot = getRepoRoot();
  const targets = packTargets(discoverMods(repoRoot));
  const failures: string[] = [];

  for (const mod of targets) {
    const hash = computeDataHash(mod.dir, mod.dataDir!);

    let sourceHash: string | undefined;
    try {
      sourceHash = readConfigJson(mod).sourceHash;
    } catch (err) {
      failures.push(`${mod.relDir}: unreadable config.json (${(err as Error).message})`);
      continue;
    }
    if (sourceHash !== hash) {
      failures.push(`${mod.relDir}: config.json sourceHash stale (run generate-configs)`);
    }

    const buildDir = path.join(mod.dir, 'build');
    const lock = readBuildLock(buildDir);
    if (!lock) {
      failures.push(`${mod.relDir}: missing/invalid build.lock.json (run pack)`);
      continue;
    }
    if (lock.builtFromHash !== hash) {
      failures.push(`${mod.relDir}: build.lock stale — data changed without a repack`);
    }
    if (!fs.existsSync(path.join(buildDir, lock.fileName))) {
      failures.push(`${mod.relDir}: build.lock points to missing ${lock.fileName}`);
    }
  }

  console.log(`Pack drift: checked ${targets.length} mod(s), ${failures.length} problem(s).`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  if (failures.length > 0) process.exitCode = 1;
}
