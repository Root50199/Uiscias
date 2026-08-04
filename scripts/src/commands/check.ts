import path from 'node:path';
import { fse } from '../lib/io';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, packTargets } from '../lib/mods';
import { computeDataHash } from '../lib/hash';
import { readConfigJson, readBuildLock, ConfigError } from '../lib/config';
import { itBelongsToId } from '../lib/itFile';
import { readVersionLedgerStrict, floorFor } from '../lib/versionLedger';
import { ok, err, glyph, Tally } from '../lib/term';
import type { VersionLedger } from '../schema';
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

  // Read strictly so a corrupt ledger fails CI instead of zeroing every floor
  // and hiding the version regression the floor check exists to catch.
  let ledger: VersionLedger = {};
  try {
    ledger = readVersionLedgerStrict(repoRoot);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    tally.addError(
      `version-ledger.json is unreadable or invalid (${message}) — fix the file or regenerate it via npm run pack`,
    );
  }

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
      // ConfigError already names the mod and the problem; anything else is a
      // read/JSON-syntax failure that still needs the path for context.
      tally.addError(
        e instanceof ConfigError
          ? e.message
          : `${mod.relDir}: unreadable config.json (${String(e)})`,
      );
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
    if (!itBelongsToId(lock.fileName, mod.id)) {
      tally.addError(
        `${mod.relDir}: build.lock ${lock.fileName} doesn't match mod id (folder renamed? run pack)`,
      );
    }

    const floor = floorFor(ledger, mod.id);
    if (lock.version < floor) {
      tally.addError(
        `${mod.relDir}: build.lock version ${lock.version} is below the version-ledger floor ${floor} for "${mod.id}" — this number was already published for this modId. ` +
          `Fix: npm run pack -- --mods ${mod.id} --force (repacks past the floor), then commit the new .it, build.lock.json, and version-ledger.json.`,
      );
    }
  }

  const problemText = tally.hasErrors ? err(`${tally.errors.length} problem(s)`) : ok('0 problems');
  console.log(`Pack drift: checked ${targets.length} mod(s), ${problemText}.`);
  for (const f of tally.errors) console.error(`  ${glyph.bad} ${f}`);
  if (tally.hasErrors) process.exitCode = 1;
};
