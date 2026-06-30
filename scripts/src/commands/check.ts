import path from 'node:path';
import { fse } from '../lib/io';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, packTargets } from '../lib/mods';
import { computeDataHash } from '../lib/hash';
import { readConfigJson, readBuildLock } from '../lib/config';
import { ok, err, glyph, Tally } from '../lib/term';
import { runGenerateConfigs } from './generateConfigs';

/**
 * CI drift check (hash-only; safe on Linux, never packs). Fails if any
 * generated artifact is out of sync with its source:
 *  - config.json is stale vs config.yaml + data/ (delegated to generate-configs --check),
 *  - config.json.sourceHash ≠ the current data/ hash,
 *  - build.lock.json is missing, stale, or points to a missing .it.
 * Backstops `--no-verify` commits and hook misconfiguration.
 */
export const runCheck = async (): Promise<void> => {
  // 1. config.json freshness (also validates config.yaml + schema).
  // No scope flags = all mods (the default).
  await runGenerateConfigs({ check: true });

  // 2. Pack drift: hashes must line up across data/ ↔ config.json ↔ build.lock.
  const repoRoot = getRepoRoot();
  const targets = packTargets(discoverMods(repoRoot));
  const tally = new Tally();

  for (const mod of targets) {
    if (!mod.dataDir) {
      tally.addError(`${mod.relDir}: missing data/ (cannot compute hash)`);
      continue;
    }
    const hash = computeDataHash(mod.dir, mod.dataDir);

    let sourceHash: string | undefined;
    try {
      sourceHash = readConfigJson(mod).sourceHash;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      tally.addError(`${mod.relDir}: unreadable config.json (${message})`);
      continue;
    }
    if (sourceHash !== hash) {
      tally.addError(`${mod.relDir}: config.json sourceHash stale (run generate-configs)`);
    }

    const buildDir = path.join(mod.dir, 'build');
    const lock = readBuildLock(buildDir);
    if (!lock) {
      tally.addError(`${mod.relDir}: missing/invalid build.lock.json (run pack)`);
      continue;
    }
    if (lock.builtFromHash !== hash) {
      tally.addError(`${mod.relDir}: build.lock stale — data changed without a repack`);
    }
    if (!fse.pathExistsSync(path.join(buildDir, lock.fileName))) {
      tally.addError(`${mod.relDir}: build.lock points to missing ${lock.fileName}`);
    }
  }

  const problemText = tally.hasErrors ? err(`${tally.errors.length} problem(s)`) : ok('0 problems');
  console.log(`Pack drift: checked ${targets.length} mod(s), ${problemText}.`);
  for (const f of tally.errors) console.error(`  ${glyph.bad} ${f}`);
  if (tally.hasErrors) process.exitCode = 1;
};
