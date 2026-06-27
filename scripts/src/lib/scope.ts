import { gitChangedPaths, modsForPaths } from './changed';
import { type Mod } from './mods';

export interface ScopeOptions {
  changed?: boolean;
  staged?: boolean;
  base?: string;
  mods?: string[];
  /** After writing generated files, `git add` them (for pre-commit). */
  stage?: boolean;
}

/**
 * Resolve which mods a command should operate on, from `--all` / `--changed`
 * (`--staged` / `--base`) / `--mods <csv>`. Defaults to all mods.
 */
export function resolveTargetMods(repoRoot: string, mods: Mod[], opts: ScopeOptions): Mod[] {
  if (opts.mods && opts.mods.length > 0) {
    const wanted = new Set(opts.mods);
    return mods.filter((m) => wanted.has(m.id));
  }
  if (opts.changed) {
    const paths = gitChangedPaths(repoRoot, { staged: opts.staged, base: opts.base });
    return modsForPaths(paths, mods);
  }
  return mods;
}
