import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Resolve the repository root. Prefers `git rev-parse --show-toplevel` so the
 * tooling works regardless of the cwd a hook/CI invokes it from; falls back to
 * the current working directory outside a git checkout.
 */
export function getRepoRoot(): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
    if (out) return path.resolve(out);
  } catch {
    // not a git repo (or git unavailable) — fall back to cwd
  }
  return path.resolve(process.cwd());
}

/**
 * Repo exclusions for mod discovery — the one place to add things the tooling
 * should ignore.
 *
 * Note: dot-folders (`.git`, `.github`, `.husky`, `.cursor`, …) are excluded
 * automatically by discovery (any name starting with `.`), so they don't need
 * to be listed here.
 */

/** Top-level non-mod folders to skip. */
export const NON_MOD_DIRS = new Set(['scripts', 'node_modules', 'docs', 'images']);

/**
 * Mod-shaped folders to skip anyway (e.g. scaffolding templates). These keep
 * their committed files as references but are never generated, packed, drift-
 * checked, or shipped in a release.
 */
export const EXCLUDED_MOD_IDS = new Set(['NewModTemplate']);
