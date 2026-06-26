import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Encryption key salt mabi-pack2 uses for Uiscias packs. */
const PACK_KEY = '})wWb4?-sVGHNoPKpc';

export function packerExePath(repoRoot: string): string {
  return path.join(repoRoot, 'scripts', 'Mabi-pack2', 'mabi-pack2.exe');
}

export function packerAvailable(repoRoot: string): boolean {
  return fs.existsSync(packerExePath(repoRoot));
}

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
export function packDataFolder(repoRoot: string, dataDir: string, outItPath: string): void {
  const exe = packerExePath(repoRoot);
  if (!fs.existsSync(exe)) {
    throw new Error(`mabi-pack2.exe not found at ${exe}`);
  }

  // Pack with the FINAL filename (never a placeholder like "out.it"); the copy
  // below preserves this exact basename, so the name mabi-pack2 embedded matches
  // the name the game loads.
  const finalName = path.basename(outItPath);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'uiscias-pack-'));
  try {
    fs.cpSync(dataDir, path.join(tmp, 'data'), { recursive: true });
    execFileSync(exe, ['pack', '-i', '.', '-o', finalName, '-k', PACK_KEY], {
      cwd: tmp,
      stdio: 'pipe',
    });

    const produced = path.join(tmp, finalName);
    if (!fs.existsSync(produced)) {
      throw new Error(`packer did not produce an output for ${dataDir}`);
    }
    fs.mkdirSync(path.dirname(outItPath), { recursive: true });
    fs.copyFileSync(produced, outItPath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
