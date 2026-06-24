import { execFileSync } from 'node:child_process';
import type { Mod } from './mods';

export interface ChangedOptions {
  /** Use the staged index (`git diff --cached`). For pre-commit hooks. */
  staged?: boolean;
  /** Diff against this ref (e.g. `origin/main`). For CI. */
  base?: string;
}

/** Repo-relative paths (posix) that changed, per the requested git scope. */
export function gitChangedPaths(repoRoot: string, opts: ChangedOptions): string[] {
  const args = ['diff', '--name-only'];
  if (opts.staged) {
    args.push('--cached');
  } else if (opts.base) {
    args.push(`${opts.base}...HEAD`);
  } else {
    args.push('HEAD');
  }

  const out = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  return out
    .split('\n')
    .map((s) => s.trim().replace(/\\/g, '/'))
    .filter(Boolean);
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
