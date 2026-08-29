import path from 'node:path';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, packTargets, type Mod } from '../lib/mods';
import { resolveTargetMods, type ScopeOptions } from '../lib/scope';
import { listFilesRecursive } from '../lib/hash';
import { gitTrackedPaths } from '../lib/git';
import { relPosix } from '../lib/io';
import { findCaseMismatches, describeCaseMismatch, type CaseMismatch } from '../lib/caseDrift';
import { err, ok, glyph } from '../lib/term';

export interface ModCaseMismatches {
  readonly mod: Mod;
  readonly mismatches: CaseMismatch[];
}

/**
 * A mod's `data/` + `images/` files, repo-relative posix, in their real on-disk
 * case. These are the trees that feed `usedFiles`/`sourceHash`, so a case-only
 * divergence here is what silently drifts config.json on a case-insensitive FS.
 */
const scannedFilesFor = (repoRoot: string, mod: Mod): string[] => {
  const dirs = [mod.dataDir, path.join(mod.dir, 'images')].filter(
    (dir): dir is string => dir !== undefined,
  );
  return dirs.flatMap((dir) => listFilesRecursive(dir)).map((full) => relPosix(repoRoot, full));
};

/**
 * Compare each mod's working-tree file names against git's case-exact tracked
 * names, returning only the mods that have a case-only divergence. One
 * `git ls-files` call for the whole run.
 */
export const collectCaseMismatches = (repoRoot: string, mods: Mod[]): ModCaseMismatches[] => {
  const tracked = gitTrackedPaths(repoRoot, ['mods']);
  const results: ModCaseMismatches[] = [];
  for (const mod of mods) {
    const mismatches = findCaseMismatches(tracked, scannedFilesFor(repoRoot, mod));
    if (mismatches.length > 0) results.push({ mod, mismatches });
  }
  return results;
};

/**
 * Standalone case-drift check, scoped like the other commands. Catches a
 * working-tree-vs-git case divergence locally (in the pre-commit hook) where the
 * hash-based drift check is blind on a case-insensitive filesystem.
 */
export const runCheckCase = (opts: ScopeOptions): void => {
  const repoRoot = getRepoRoot();
  const targets = packTargets(resolveTargetMods(repoRoot, discoverMods(repoRoot), opts));
  const results = collectCaseMismatches(repoRoot, targets);

  const problems = results.reduce((n, r) => n + r.mismatches.length, 0);
  const problemText = problems > 0 ? err(`${problems} problem(s)`) : ok('0 problems');
  console.log(`Case drift: checked ${targets.length} mod(s), ${problemText}.`);

  for (const { mod, mismatches } of results) {
    for (const mismatch of mismatches) {
      console.error(`  ${glyph.bad} ${mod.relDir}: ${describeCaseMismatch(mismatch)}`);
    }
  }

  if (problems > 0) process.exitCode = 1;
};
