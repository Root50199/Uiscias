import { execFileSync } from 'node:child_process';

/** `git add -- <paths>` (stages additions/modifications of specific files). */
export function gitAdd(repoRoot: string, paths: string[]): void {
  if (paths.length === 0) return;
  execFileSync('git', ['add', '--', ...paths], { cwd: repoRoot, stdio: 'pipe' });
}

/** `git add -A -- <paths>` (also stages deletions, e.g. pruned old `.it`). */
export function gitAddAll(repoRoot: string, paths: string[]): void {
  if (paths.length === 0) return;
  execFileSync('git', ['add', '-A', '--', ...paths], { cwd: repoRoot, stdio: 'pipe' });
}
