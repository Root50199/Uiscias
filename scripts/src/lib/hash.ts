import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** All files under `dir`, recursively, as absolute paths. */
export function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) out.push(full);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/**
 * `usedFiles` for a mod: every file under its `data/`, expressed relative to the
 * mod folder (e.g. `data/db/Race.xml`), posix separators, sorted.
 */
export function scanUsedFiles(modDir: string, dataDir: string): string[] {
  return listFilesRecursive(dataDir)
    .map((f) => path.relative(modDir, f).split(path.sep).join('/'))
    .sort((a, b) => a.localeCompare(b));
}

function sha256(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Read a file for hashing, normalizing CRLF→LF for text files so the hash is
 * independent of the checkout's line endings (Windows working tree is CRLF, CI
 * on Linux is LF). Binary files (those containing a NUL byte) are hashed as-is.
 */
function readForHash(full: string): Buffer {
  const buf = fs.readFileSync(full);
  if (buf.includes(0)) return buf; // binary — never normalize
  return Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

/**
 * Content hash of a mod's `data/` (the pack input). This — not the mod's
 * metadata — is the signal that determines whether a repack/version bump is
 * needed, since metadata changes do not alter the packed bytes. Returns
 * `sha256-<hex>`.
 */
export function computeDataHash(modDir: string, dataDir: string): string {
  const hash = crypto.createHash('sha256');
  const files = listFilesRecursive(dataDir)
    .map((full) => ({
      rel: path.relative(modDir, full).split(path.sep).join('/'),
      full,
    }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  for (const f of files) {
    hash.update('\nfile:');
    hash.update(f.rel);
    hash.update(':');
    hash.update(sha256(readForHash(f.full)));
  }

  return `sha256-${hash.digest('hex')}`;
}
