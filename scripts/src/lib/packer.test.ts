import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPackModeResolver, patcherDir, PackerSetupError, resolveTemplateIt } from './packer';

describe('packer', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'uiscias-packer-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const touch = (name: string): Promise<void> => fs.writeFile(join(root, name), 'x', 'utf8');

  describe('resolveTemplateIt', () => {
    it('returns the single data_<digits>.it, ignoring other files', async () => {
      await touch('data_00650.it');
      await touch('mabi-patcher.exe');
      await touch('packData.bat');
      await touch('uisciasZoom_00001.it');
      await touch('data_00650.it.bak');

      expect(resolveTemplateIt(root)).toBe(join(root, 'data_00650.it'));
    });

    it('accepts any number, not just 00650', async () => {
      await touch('data_00123.it');
      expect(resolveTemplateIt(root)).toBe(join(root, 'data_00123.it'));
    });

    it('throws when there is no template', async () => {
      await touch('mabi-patcher.exe');
      expect(() => resolveTemplateIt(root)).toThrow(PackerSetupError);
      expect(() => resolveTemplateIt(root)).toThrow(/No template found/);
    });

    it('throws when the folder does not exist', () => {
      expect(() => resolveTemplateIt(join(root, 'missing'))).toThrow(PackerSetupError);
    });

    it('throws and names every candidate when there are several', async () => {
      await touch('data_00650.it');
      await touch('data_00651.it');

      expect(() => resolveTemplateIt(root)).toThrow(PackerSetupError);
      expect(() => resolveTemplateIt(root)).toThrow(/data_00650\.it, data_00651\.it/);
    });
  });

  describe('createPackModeResolver', () => {
    it('salt mode never reads the template folder', () => {
      const getPackMode = createPackModeResolver(root, true);
      expect(getPackMode()).toEqual({ kind: 'salts' });
    });

    it('template mode resolves the template once and reuses it', async () => {
      const dir = patcherDir(root);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(join(dir, 'data_00650.it'), 'x', 'utf8');

      const getPackMode = createPackModeResolver(root, false);
      const first = getPackMode();
      expect(first).toEqual({ kind: 'template', templatePath: join(dir, 'data_00650.it') });

      await fs.writeFile(join(dir, 'data_00651.it'), 'x', 'utf8');
      expect(getPackMode()).toBe(first);
    });

    it('does not look for a template until a mode is requested', () => {
      expect(() => createPackModeResolver(root, false)).not.toThrow();
    });
  });
});
