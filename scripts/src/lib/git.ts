import { execFileSync } from 'node:child_process';

/** `git add -- <paths>` (stages additions/modifications of specific files). */
export const gitAdd = (repoRoot: string, paths: string[]): void => {
  if (paths.length === 0) return;
  execFileSync('git', ['add', '--', ...paths], { cwd: repoRoot, stdio: 'pipe' });
};

/** `git add -A -- <paths>` (also stages deletions, e.g. pruned old `.it`). */
export const gitAddAll = (repoRoot: string, paths: string[]): void => {
  if (paths.length === 0) return;
  execFileSync('git', ['add', '-A', '--', ...paths], { cwd: repoRoot, stdio: 'pipe' });
};

export interface ChangedOptions {
  /** Use the staged index (`git diff --cached`). For pre-commit hooks. */
  staged?: boolean;
  /** Diff against this ref (e.g. `origin/main`). For CI. */
  base?: string;
}

/**
 * Case-exact, repo-relative posix paths that git tracks (from the index).
 * `git ls-files` reports the stored case regardless of `core.ignorecase`, so it
 * is the source of truth for a file's canonical name — unlike a working-tree
 * scan on a case-insensitive filesystem. Optionally scope to `pathspecs`.
 */
export const gitTrackedPaths = (repoRoot: string, pathspecs: string[] = []): string[] => {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...pathspecs], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return out.split('\0').filter(Boolean); // already posix, case-exact
};

/** Repo-relative paths (posix) that changed, per the requested git scope. */
export const gitChangedPaths = (repoRoot: string, opts: ChangedOptions): string[] => {
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
};
