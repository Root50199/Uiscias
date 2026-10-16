import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MANAGED_PREFIX,
  itName,
  itBelongsToId,
  listItFiles,
  parseItName,
  pruneItFiles,
} from './itFile';

describe('itFile', () => {
  let buildDir: string;

  beforeEach(async () => {
    buildDir = await fs.mkdtemp(join(tmpdir(), 'uiscias-itfile-'));
  });

  afterEach(async () => {
    await fs.rm(buildDir, { recursive: true, force: true });
  });

  const touch = (name: string): Promise<void> => fs.writeFile(join(buildDir, name), 'x', 'utf8');

  describe('MANAGED_PREFIX', () => {
    it("satisfies mabi-patcher's modern .it filename rules", () => {
      expect(MANAGED_PREFIX).toMatch(/^[a-z][A-Za-z0-9_-]*$/);
      const basename = itName('Zoom', 1).replace(/\.it$/, '');
      expect(basename.toLowerCase() > 'data').toBe(true);
    });
  });

  describe('itName', () => {
    it('formats the canonical name with a zero-padded 5-digit version', () => {
      expect(itName('Zoom', 4)).toBe('uisciasZoom_00004.it');
      expect(itName('Zoom', 12345)).toBe('uisciasZoom_12345.it');
    });
  });

  describe('parseItName', () => {
    it('parses both prefix casings into the same modId + version', () => {
      expect(parseItName('uisciasZoom_00004.it')).toEqual({ modId: 'Zoom', version: 4 });
      expect(parseItName('UisciasZoom_00004.it')).toEqual({ modId: 'Zoom', version: 4 });
    });

    it('rejects non-managed names', () => {
      expect(parseItName('manifestCatalog.json')).toBeNull();
      expect(parseItName('data_00650.it')).toBeNull();
      expect(parseItName('Zoom_00004.it')).toBeNull();
      expect(parseItName('uisciasZoom.it')).toBeNull();
      expect(parseItName('uisciasZoom_00004.zip')).toBeNull();
    });
  });

  describe('itBelongsToId', () => {
    it('matches a .it built for the exact id, under either prefix casing', () => {
      expect(itBelongsToId('uisciasZoom_00004.it', 'Zoom')).toBe(true);
      expect(itBelongsToId('UisciasZoom_00004.it', 'Zoom')).toBe(true);
    });

    it('rejects a .it built for a different (e.g. former) id', () => {
      expect(itBelongsToId('uisciasZoomOld_00004.it', 'Zoom')).toBe(false);
      expect(itBelongsToId('uisciasZoom_00004.it', 'ZoomOld')).toBe(false);
    });

    it('matches the modId case-sensitively', () => {
      expect(itBelongsToId('uisciaszoom_00004.it', 'Zoom')).toBe(false);
    });

    it('rejects wrong prefixes and non-.it names', () => {
      expect(itBelongsToId('Zoom_00004.it', 'Zoom')).toBe(false);
      expect(itBelongsToId('uisciasZoom_00004.zip', 'Zoom')).toBe(false);
      expect(itBelongsToId('uisciasZoom.it', 'Zoom')).toBe(false);
    });
  });

  describe('listItFiles', () => {
    it('returns only the current id, ascending by version', async () => {
      await touch('uisciasZoom_00002.it');
      await touch('uisciasZoom_00010.it');
      await touch('uisciasZoomOld_00004.it');
      await touch('not-a-pack.txt');

      expect(listItFiles(buildDir, 'Zoom')).toEqual([
        { name: 'uisciasZoom_00002.it', version: 2 },
        { name: 'uisciasZoom_00010.it', version: 10 },
      ]);
    });

    it('includes files under the older prefix casing', async () => {
      await touch('UisciasZoom_00003.it');
      await touch('uisciasZoom_00004.it');

      expect(listItFiles(buildDir, 'Zoom')).toEqual([
        { name: 'UisciasZoom_00003.it', version: 3 },
        { name: 'uisciasZoom_00004.it', version: 4 },
      ]);
    });
  });

  describe('pruneItFiles', () => {
    it('deletes every .it except the keeper, including stale renamed ones', async () => {
      await touch('uisciasZoom_00005.it');
      await touch('uisciasZoomOld_00004.it');

      pruneItFiles(buildDir, 'uisciasZoom_00005.it');

      expect(existsSync(join(buildDir, 'uisciasZoom_00005.it'))).toBe(true);
      expect(existsSync(join(buildDir, 'uisciasZoomOld_00004.it'))).toBe(false);
    });

    it('deletes the older-cased file when the keeper uses the new prefix', async () => {
      await touch('UisciasZoom_00003.it');
      await touch('uisciasZoom_00004.it');

      pruneItFiles(buildDir, 'uisciasZoom_00004.it');

      expect((await fs.readdir(buildDir)).sort()).toEqual(['uisciasZoom_00004.it']);
    });
  });
});
