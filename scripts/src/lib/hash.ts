import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import { relPosix } from './io';

/** All files under `dir`, recursively, as absolute paths. */
export const listFilesRecursive = (dir: string): string[] =>
  globSync('**/*', { cwd: dir, onlyFiles: true, dot: true }).map((rel) => path.join(dir, rel));

/**
 * `usedFiles` for a mod: every file under its `data/`, expressed relative to the
 * mod folder (e.g. `data/db/Race.xml`), posix separators, sorted.
 */
export const scanUsedFiles = (modDir: string, dataDir: string): string[] =>
  listFilesRecursive(dataDir)
    .map((f) => relPosix(modDir, f))
    .sort((a, b) => a.localeCompare(b));

const sha256 = (buf: Buffer): string => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Read a file for hashing, normalizing CRLF→LF for text files so the hash is
 * independent of the checkout's line endings (Windows working tree is CRLF, CI
 * on Linux is LF). Binary files (those containing a NUL byte) are hashed as-is.
 */
const readForHash = (full: string): Buffer => {
  const buf = fs.readFileSync(full);
  if (buf.includes(0)) return buf; // binary — never normalize
  return Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
};

/**
 * Content hash of a mod's `data/` (the pack input). This — not the mod's
 * metadata — is the signal that determines whether a repack/version bump is
 * needed, since metadata changes do not alter the packed bytes. Returns
 * `sha256-<hex>`.
 */
export const computeDataHash = (modDir: string, dataDir: string): string => {
  const hash = crypto.createHash('sha256');
  const files = listFilesRecursive(dataDir)
    .map((full) => ({ rel: relPosix(modDir, full), full }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  for (const f of files) {
    hash.update('\nfile:');
    hash.update(f.rel);
    hash.update(':');
    hash.update(sha256(readForHash(f.full)));
  }

  return `sha256-${hash.digest('hex')}`;
};
