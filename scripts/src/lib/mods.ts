import fs from 'node:fs';
import path from 'node:path';
import { getModsRoot, NON_MOD_DIRS, EXCLUDED_MOD_IDS } from './repo';

/** Repo-relative posix path for a mod folder (e.g. `mods/BriHpBars`). */
function relDirOf(repoRoot: string, dir: string): string {
  return path.relative(repoRoot, dir).split(path.sep).join('/');
}

export type ModKind = 'standalone' | 'variantParent' | 'variant';

export interface Mod {
  /** Folder name; also the `modId` (and the `<ModFileName>` in the `.it`). */
  id: string;
  /** Absolute path to the mod's folder. */
  dir: string;
  /** Repo-relative folder path, posix separators (e.g. `mods/BriHpBars/BriHpBars1And2`). */
  relDir: string;
  kind: ModKind;
  /** For variants, the parent group's id (folder name). */
  groupId?: string;
  /** Absolute path to `data/` — present for `standalone` and `variant` only. */
  dataDir?: string;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function hasDataDir(dir: string): boolean {
  return isDir(path.join(dir, 'data'));
}

function childDirNames(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Discover every mod in the repo. Mods live under `<repoRoot>/mods/` (see
 * `getModsRoot`); `relDir` stays repo-root-relative (e.g. `mods/BriHpBars`) so
 * it lines up directly with the paths `git diff` reports.
 *
 * Shapes:
 * - A folder under `mods/` with a `data/` is a **standalone** mod.
 * - A folder under `mods/` with no `data/` but child folders that have `data/`
 *   is a **variantParent**; each such child is a **variant**.
 * - Anything else is ignored.
 */
export function discoverMods(repoRoot: string): Mod[] {
  const mods: Mod[] = [];
  const modsRoot = getModsRoot(repoRoot);
  if (!isDir(modsRoot)) return mods;

  for (const name of childDirNames(modsRoot)) {
    if (NON_MOD_DIRS.has(name) || EXCLUDED_MOD_IDS.has(name) || name.startsWith('.')) {
      continue;
    }
    const dir = path.join(modsRoot, name);

    if (hasDataDir(dir)) {
      mods.push({
        id: name,
        dir,
        relDir: relDirOf(repoRoot, dir),
        kind: 'standalone',
        dataDir: path.join(dir, 'data'),
      });
      continue;
    }

    const variantNames = childDirNames(dir).filter((child) => hasDataDir(path.join(dir, child)));
    if (variantNames.length === 0) continue; // not a mod folder

    mods.push({ id: name, dir, relDir: relDirOf(repoRoot, dir), kind: 'variantParent' });
    for (const child of variantNames) {
      const childDir = path.join(dir, child);
      mods.push({
        id: child,
        dir: childDir,
        relDir: relDirOf(repoRoot, childDir),
        kind: 'variant',
        groupId: name,
        dataDir: path.join(childDir, 'data'),
      });
    }
  }

  return mods;
}

/** Mods that actually get packed (have a `data/`): standalone + variants. */
export function packTargets(mods: Mod[]): Mod[] {
  return mods.filter((m) => m.kind !== 'variantParent');
}

export function findMod(mods: Mod[], id: string): Mod | undefined {
  return mods.find((m) => m.id === id);
}

export interface ModGroup {
  parent?: Mod; // variantParent, when the group has variants
  /** The single standalone mod, or the group's variants. */
  members: Mod[];
  hasVariants: boolean;
}

/** Group mods for manifest emission: a standalone is its own group of one. */
export function groupMods(mods: Mod[]): ModGroup[] {
  const groups: ModGroup[] = [];
  const variantsByParent = new Map<string, Mod[]>();

  for (const m of mods) {
    if (m.kind === 'variant' && m.groupId) {
      const list = variantsByParent.get(m.groupId) ?? [];
      list.push(m);
      variantsByParent.set(m.groupId, list);
    }
  }

  for (const m of mods) {
    if (m.kind === 'standalone') {
      groups.push({ members: [m], hasVariants: false });
    } else if (m.kind === 'variantParent') {
      groups.push({
        parent: m,
        members: variantsByParent.get(m.id) ?? [],
        hasVariants: true,
      });
    }
  }

  return groups;
}
