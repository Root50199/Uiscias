import { gitChangedPaths, modsForPaths } from './changed';
import { type Mod } from './mods';

export interface ScopeOptions {
  all?: boolean;
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

/** Minimal flag/option parser for the tooling CLI. */
export function parseScopeArgs(argv: string[]): ScopeOptions {
  const opts: ScopeOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--all':
        opts.all = true;
        break;
      case '--changed':
        opts.changed = true;
        break;
      case '--staged':
        opts.staged = true;
        break;
      case '--stage':
        opts.stage = true;
        break;
      case '--base':
        opts.base = argv[++i];
        break;
      case '--mods':
        opts.mods = (argv[++i] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      default:
        break;
    }
  }
  return opts;
}
