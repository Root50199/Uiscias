import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { orderKeys, readText, relPosix, toPosix } from './io';

describe('orderKeys', () => {
  it('reorders keys to match the requested order', () => {
    const out = orderKeys({ b: 2, a: 1, c: 3 }, ['a', 'b', 'c']);
    expect(Object.keys(out)).toEqual(['a', 'b', 'c']);
  });

  it('drops keys that are not in the order list', () => {
    const out = orderKeys({ a: 1, secret: 9 } as Record<string, number>, ['a']);
    expect(out).toEqual({ a: 1 });
    expect(Object.keys(out)).toEqual(['a']);
  });

  it('skips order keys absent from the value', () => {
    const out = orderKeys({ a: 1 } as Record<string, number>, ['a', 'b']);
    expect(Object.keys(out)).toEqual(['a']);
  });
});

describe('toPosix / relPosix', () => {
  it('converts OS separators to posix', () => {
    expect(toPosix(join('a', 'b', 'c'))).toBe('a/b/c');
  });

  it('produces a posix relative path between two absolute paths', () => {
    const from = join('X:', 'repo');
    const to = join('X:', 'repo', 'mods', 'Zoom', 'data');
    expect(relPosix(from, to)).toBe('mods/Zoom/data');
  });
});

describe('readText', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(tmpdir(), 'uiscias-io-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('strips a leading UTF-8 BOM', async () => {
    const file = join(dir, 'bom.json');
    await fs.writeFile(file, '\uFEFF{"a":1}', 'utf8');
    expect(readText(file)).toBe('{"a":1}');
  });

  it('returns content unchanged when there is no BOM', async () => {
    const file = join(dir, 'plain.txt');
    await fs.writeFile(file, 'hello', 'utf8');
    expect(readText(file)).toBe('hello');
  });
});
