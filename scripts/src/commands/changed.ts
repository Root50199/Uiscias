import { getRepoRoot } from '../lib/repo';
import { discoverMods } from '../lib/mods';
import { resolveTargetMods, type ScopeOptions } from '../lib/scope';
import { dim } from '../lib/term';

/** Print the mods affected by the requested scope (a Phase 0 sanity tool). */
export function runChanged(opts: ScopeOptions): void {
  const repoRoot = getRepoRoot();
  const mods = discoverMods(repoRoot);
  const targets = resolveTargetMods(repoRoot, mods, { ...opts, changed: true });

  if (targets.length === 0) {
    console.log(dim('No affected mods.'));
    return;
  }
  for (const m of targets) {
    console.log(`${dim(m.kind.padEnd(14))} ${m.relDir}`);
  }
  console.log(dim(`\n${targets.length} affected mod(s).`));
}
