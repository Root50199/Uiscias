import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fse } from './io';

/** Encryption key salt mabi-pack2 uses for Uiscias packs. */
const PACK_KEY = '})wWb4?-sVGHNoPKpc';

const packerExePath = (repoRoot: string): string =>
  path.join(repoRoot, 'scripts', 'Mabi-pack2', 'mabi-pack2.exe');

/**
 * Pack a mod's `data/` into a single `.it` at `outItPath`. The pack input is a
 * temp folder containing `data/`, so packed paths are rooted at `data/…`,
 * matching the game's expectations.
 *
 * CRITICAL: the name passed to `mabi-pack2 -o` MUST be the mod's final filename.
 * mabi-pack2 bakes the output name into the packed `.it`, so renaming (or
 * copying to a different name) after packing BRICKS the mod in-game. We
 * therefore pack to a temp file that already carries the final basename and only
 * ever copy it to its destination under that same name. See `docs/packing.md`.
 */
export const packDataFolder = (repoRoot: string, dataDir: string, outItPath: string): void => {
  const exe = packerExePath(repoRoot);
  if (!fse.pathExistsSync(exe)) {
    throw new Error(`mabi-pack2.exe not found at ${exe}`);
  }

  // Pack with the FINAL filename (never a placeholder like "out.it"); the copy
  // below preserves this exact basename, so the name mabi-pack2 embedded matches
  // the name the game loads.
  const finalName = path.basename(outItPath);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uiscias-pack-'));
  try {
    fse.copySync(dataDir, path.join(tmp, 'data'));
    execFileSync(exe, ['pack', '-i', '.', '-o', finalName, '-k', PACK_KEY], {
      cwd: tmp,
      stdio: 'pipe',
    });

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
