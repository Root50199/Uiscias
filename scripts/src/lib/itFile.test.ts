import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { itName, itBelongsToId, listItFiles, pruneItFiles } from './itFile';

describe('itFile', () => {
  let buildDir: string;

  beforeEach(async () => {
    buildDir = await fs.mkdtemp(join(tmpdir(), 'uiscias-itfile-'));
  });

  afterEach(async () => {
    await fs.rm(buildDir, { recursive: true, force: true });
  });

  const touch = (name: string): Promise<void> => fs.writeFile(join(buildDir, name), 'x', 'utf8');

  describe('itName', () => {
    it('formats the canonical name with a zero-padded 5-digit version', () => {
      expect(itName('Zoom', 4)).toBe('UisciasZoom_00004.it');
      expect(itName('Zoom', 12345)).toBe('UisciasZoom_12345.it');
    });
  });

  describe('itBelongsToId', () => {
    it('matches a .it built for the exact id', () => {
      expect(itBelongsToId('UisciasZoom_00004.it', 'Zoom')).toBe(true);
    });

    it('rejects a .it built for a different (e.g. former) id', () => {
      expect(itBelongsToId('UisciasZoomOld_00004.it', 'Zoom')).toBe(false);
      expect(itBelongsToId('UisciasZoom_00004.it', 'ZoomOld')).toBe(false);
    });

    it('rejects wrong prefixes and non-.it names', () => {
      expect(itBelongsToId('Zoom_00004.it', 'Zoom')).toBe(false);
      expect(itBelongsToId('UisciasZoom_00004.zip', 'Zoom')).toBe(false);
      expect(itBelongsToId('UisciasZoom.it', 'Zoom')).toBe(false);
    });
  });

  describe('listItFiles', () => {
    it('returns only the current id, ascending by version', async () => {
      await touch('UisciasZoom_00002.it');
      await touch('UisciasZoom_00010.it');
      await touch('UisciasZoomOld_00004.it');
      await touch('not-a-pack.txt');

      expect(listItFiles(buildDir, 'Zoom')).toEqual([
        { name: 'UisciasZoom_00002.it', version: 2 },
        { name: 'UisciasZoom_00010.it', version: 10 },
      ]);
    });
  });

  describe('pruneItFiles', () => {
    it('deletes every .it except the keeper, including stale renamed ones', async () => {
      await touch('UisciasZoom_00005.it');
      await touch('UisciasZoomOld_00004.it');

      pruneItFiles(buildDir, 'UisciasZoom_00005.it');

      expect(existsSync(join(buildDir, 'UisciasZoom_00005.it'))).toBe(true);
      expect(existsSync(join(buildDir, 'UisciasZoomOld_00004.it'))).toBe(false);
    });
  });
});
