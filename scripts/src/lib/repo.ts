import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Resolve the repository root. Prefers `git rev-parse --show-toplevel` so the
 * tooling works regardless of the cwd a hook/CI invokes it from; falls back to
 * the current working directory outside a git checkout.
 */
export const getRepoRoot = (): string => {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
    }).trim();
    if (out) return path.resolve(out);
  } catch {
    // not a git repo (or git unavailable) — fall back to cwd
  }
  return path.resolve(process.cwd());
};

/**
 * The single place that defines **where mod folders live**. Every mod is a
 * folder directly under `<repoRoot>/mods/`. If this ever moves again, change it
 * here only — discovery, packing, the CLI, and CI all resolve mods through
 * `getModsRoot`.
 */
export const MODS_DIR = 'mods';

/** Absolute path to the directory that contains every mod folder. */
export const getModsRoot = (repoRoot: string): string => path.join(repoRoot, MODS_DIR);

/**
 * GitHub coordinates for this repo, used to build release-pinned
 * `raw.githubusercontent.com` URLs for README images at manifest time.
 */
export const REPO_OWNER = 'Root50199';
export const REPO_NAME = 'Uiscias';

/** Base raw-content URL for a given git ref (branch, tag, or SHA). */
export const rawContentBase = (ref: string): string =>
  `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}`;

/**
 * Repo exclusions for mod discovery — the one place to add things the tooling
 * should ignore.
 *
 * Note: dot-folders (`.git`, `.github`, `.husky`, `.cursor`, …) are excluded
 * automatically by discovery (any name starting with `.`), so they don't need
 * to be listed here.
 */

/** Non-mod folders to skip if they ever appear under `mods/` (defensive). */
export const NON_MOD_DIRS = new Set(['node_modules']);

/**
 * Mod-shaped folders to skip anyway (e.g. scaffolding templates). These keep
 * their committed files as references but are never generated, packed, drift-
 * checked, or shipped in a release.
 */
export const EXCLUDED_MOD_IDS = new Set(['NewModTemplate']);
