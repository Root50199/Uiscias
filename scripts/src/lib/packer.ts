import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fse } from './io';

/** Header salt for `--salts` mode (matches `scripts/mabi-patcher/packData.bat`). */
const HEADER_SALT = '1&w2!&w{Q)Fkz4e&p0';
/** Entries-table salt for `--salts` mode (the old mabi-pack2 key). */
const ENTRIES_SALT = '})wWb4?-sVGHNoPKpc';

/** An official game archive name, usable as a `--template`. */
const TEMPLATE_NAME = /^data_\d+\.it$/;

/** Folder holding `mabi-patcher.exe` and the single template `.it`. */
export const patcherDir = (repoRoot: string): string =>
  path.join(repoRoot, 'scripts', 'mabi-patcher');

const patcherExePath = (repoRoot: string): string =>
  path.join(patcherDir(repoRoot), 'mabi-patcher.exe');

/**
 * How `mabi-patcher` derives the archive encoding: copied from an original game
 * `.it` (`template`, the default), or from the hardcoded salts (`salts`).
 */
export type PackMode = { kind: 'template'; templatePath: string } | { kind: 'salts' };

/** A problem with the packer setup itself; it affects every mod, not just one. */
export class PackerSetupError extends Error {}

/**
 * The one `data_<digits>.it` in `dir`, used as the pack template. The numbers
 * aren't guaranteed to increase between game patches, so there is no "latest"
 * to pick: zero or several candidates is an error naming what was found.
 */
export const resolveTemplateIt = (dir: string): string => {
  const entries = fse.pathExistsSync(dir) ? fs.readdirSync(dir) : [];
  const candidates = entries.filter((name) => TEMPLATE_NAME.test(name)).sort();
  if (candidates.length === 1) return path.join(dir, candidates[0]);
  if (candidates.length === 0) {
    throw new PackerSetupError(
      `No template found: put exactly one data_#####.it in ${dir} (or pack with --salts).`,
    );
  }
  throw new PackerSetupError(
    `Found ${candidates.length} templates in ${dir} (${candidates.join(', ')}); keep only the latest one.`,
  );
};

/**
 * Lazily resolve the pack mode at most once per run. Template lookup only
 * happens the first time a mod actually needs packing, so runs that pack
 * nothing never touch the template folder.
 */
export const createPackModeResolver = (
  repoRoot: string,
  shouldUseSalts: boolean,
): (() => PackMode) => {
  let cached: PackMode | undefined;
  return () => {
    cached ??= shouldUseSalts
      ? { kind: 'salts' }
      : { kind: 'template', templatePath: resolveTemplateIt(patcherDir(repoRoot)) };
    return cached;
  };
};

const modeArgs = (mode: PackMode): string[] =>
  mode.kind === 'template'
    ? ['--template', mode.templatePath]
    : ['-k', HEADER_SALT, '--entries-key', ENTRIES_SALT, '--encrypt-files'];

/** The packer's captured stderr/stdout from a failed `execFileSync`, if any. */
const processOutput = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) return '';
  const stderr = 'stderr' in error ? String(error.stderr ?? '').trim() : '';
  const stdout = 'stdout' in error ? String(error.stdout ?? '').trim() : '';
  return [stderr, stdout].filter(Boolean).join('\n');
};

/**
 * Pack a mod's `data/` into a single `.it` at `outItPath`. `dataDir` holds the
 * files that belong under `data\` in the archive; `--wrap-data` adds that root.
 *
 * CRITICAL: the name passed to `-o` MUST be the mod's final filename. The header
 * key is derived from the output name, so renaming (or copying to a different
 * name) after packing BRICKS the mod in-game. We therefore pack to a temp file
 * that already carries the final basename and only ever copy it to its
 * destination under that same name. See `docs/packing.md`.
 */
export const packDataFolder = (
  repoRoot: string,
  dataDir: string,
  outItPath: string,
  mode: PackMode,
): void => {
  const exe = patcherExePath(repoRoot);
  if (!fse.pathExistsSync(exe)) {
    throw new PackerSetupError(`mabi-patcher.exe not found at ${exe}`);
  }

  // Pack with the FINAL filename (never a placeholder like "out.it"); the copy
  // below preserves this exact basename.
  const finalName = path.basename(outItPath);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uiscias-pack-'));
  try {
    try {
      execFileSync(
        exe,
        ['pack', '-i', dataDir, '--wrap-data', '-o', finalName, ...modeArgs(mode)],
        { cwd: tmp, stdio: 'pipe' },
      );
    } catch (e) {
      const output = processOutput(e);
      throw new Error(`mabi-patcher failed for ${dataDir}${output ? `:\n${output}` : ''}`, {
        cause: e,
      });
    }

    const produced = path.join(tmp, finalName);
    if (!fse.pathExistsSync(produced)) {
      throw new Error(`packer did not produce an output for ${dataDir}`);
    }
    fse.ensureDirSync(path.dirname(outItPath));
    fse.copySync(produced, outItPath);
  } finally {
    fse.removeSync(tmp);
  }
};
