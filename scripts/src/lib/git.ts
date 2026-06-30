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
