import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeDataHash, listFilesRecursive, scanUsedFiles } from './hash';

/** Create `<modDir>/data/<rel>` (with parent dirs) and return the mod dir. */
async function makeMod(
  root: string,
  files: Record<string, string | Buffer>,
): Promise<{ modDir: string; dataDir: string }> {
  const modDir = await fs.mkdtemp(join(root, 'mod-'));
  const dataDir = join(modDir, 'data');
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dataDir, rel);
    await fs.mkdir(join(full, '..'), { recursive: true });
    await fs.writeFile(full, content);
  }
  return { modDir, dataDir };
}

describe('hash', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'uiscias-hash-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('normalizes CRLF vs LF so the hash is line-ending independent', async () => {
    const crlf = await makeMod(root, { 'db/Race.xml': 'a\r\nb\r\n' });
    const lf = await makeMod(root, { 'db/Race.xml': 'a\nb\n' });
    expect(computeDataHash(crlf.modDir, crlf.dataDir)).toBe(computeDataHash(lf.modDir, lf.dataDir));
  });

  it('treats binary files (with a NUL byte) as distinct content', async () => {
    const a = await makeMod(root, { 'blob.bin': Buffer.from([0x00, 0x01, 0x02]) });
    const b = await makeMod(root, { 'blob.bin': Buffer.from([0x00, 0x01, 0x03]) });
    expect(computeDataHash(a.modDir, a.dataDir)).not.toBe(computeDataHash(b.modDir, b.dataDir));
  });

  it('is deterministic regardless of file creation order', async () => {
    const a = await makeMod(root, { 'a.xml': '1', 'b.xml': '2' });
    const b = await makeMod(root, { 'b.xml': '2', 'a.xml': '1' });
    expect(computeDataHash(a.modDir, a.dataDir)).toBe(computeDataHash(b.modDir, b.dataDir));
  });

  it('changes when file content changes', async () => {
    const before = await makeMod(root, { 'a.xml': '1' });
    const hash1 = computeDataHash(before.modDir, before.dataDir);
    await fs.writeFile(join(before.dataDir, 'a.xml'), '2');
    expect(computeDataHash(before.modDir, before.dataDir)).not.toBe(hash1);
  });

  it('produces a sha256-prefixed hex digest', async () => {
    const m = await makeMod(root, { 'a.xml': '1' });
    expect(computeDataHash(m.modDir, m.dataDir)).toMatch(/^sha256-[0-9a-f]{64}$/);
  });

  it('scanUsedFiles returns sorted, mod-relative posix paths', async () => {
    const m = await makeMod(root, { 'z.xml': '1', 'db/Race.xml': '2' });
    expect(scanUsedFiles(m.modDir, m.dataDir)).toEqual(['data/db/Race.xml', 'data/z.xml']);
  });

  it('listFilesRecursive finds every file under a directory', async () => {
    const m = await makeMod(root, { 'a.xml': '1', 'nested/b.xml': '2' });
    expect(listFilesRecursive(m.dataDir).sort()).toEqual(
      [join(m.dataDir, 'a.xml'), join(m.dataDir, 'nested', 'b.xml')].sort(),
    );
  });
});
