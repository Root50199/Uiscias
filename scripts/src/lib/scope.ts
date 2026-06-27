import { gitChangedPaths } from './git';
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

/**
 * Map changed paths to affected mods. Picks the most specific mod whose folder
 * contains the path; when a variant changes, its parent group is included too
 * (so the group config/manifest can be refreshed).
 */
export function modsForPaths(paths: string[], mods: Mod[]): Mod[] {
  const byRelDirDesc = [...mods].sort((a, b) => b.relDir.length - a.relDir.length);
  const result = new Map<string, Mod>();

  for (const p of paths) {
    const match = byRelDirDesc.find((m) => p === m.relDir || p.startsWith(`${m.relDir}/`));
    if (!match) continue;
    result.set(match.relDir, match);

    if (match.kind === 'variant' && match.groupId) {
      const parent = mods.find((m) => m.id === match.groupId && m.kind === 'variantParent');
      if (parent) result.set(parent.relDir, parent);
    }
  }

  return [...result.values()];
}
