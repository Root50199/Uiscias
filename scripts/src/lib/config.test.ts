import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigError, buildConfigJson, loadConfigYaml, readBuildLock } from './config';
import { CONFIG_JSON_KEY_ORDER } from '../schema';
import type { Mod } from './mods';

const YAML_MIN = ['modId: Zoom', 'modName: Zoom Mod', 'modAuthor: Root50199', 'updateType: stable']
  .map((l) => `${l}\n`)
  .join('');

describe('config', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'uiscias-config-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function makeMod(kind: Mod['kind'] = 'standalone'): Promise<Mod> {
    const dir = join(root, 'Zoom');
    const dataDir = join(dir, 'data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(join(dir, 'config.yaml'), YAML_MIN, 'utf8');
    await fs.writeFile(join(dataDir, 'x.xml'), 'hello\n', 'utf8');
    return { id: 'Zoom', dir, relDir: 'mods/Zoom', kind, dataDir };
  }

  describe('loadConfigYaml', () => {
    it('loads and validates config.yaml, applying defaults', async () => {
      const mod = await makeMod();
      const yaml = loadConfigYaml(mod);
      expect(yaml).toMatchObject({
        modId: 'Zoom',
        modAdditionalCredits: 'None',
        recentUpdateNotes: 'n/a',
        findiasTags: [],
      });
    });

    it('throws when config.yaml is missing', () => {
      const mod: Mod = {
        id: 'Zoom',
        dir: join(root, 'Zoom'),
        relDir: 'mods/Zoom',
        kind: 'standalone',
      };
      expect(() => loadConfigYaml(mod)).toThrow(ConfigError);
    });

    it('throws when modId does not match the folder name', async () => {
      const mod = await makeMod();
      const mismatched: Mod = { ...mod, id: 'NotZoom' };
      expect(() => loadConfigYaml(mismatched)).toThrow(/must equal folder name/);
    });
  });

  describe('buildConfigJson', () => {
    it('produces a config in canonical key order with scanned files + hash', async () => {
      const mod = await makeMod();
      const cfg = buildConfigJson(mod);

      expect(Object.keys(cfg)).toEqual(CONFIG_JSON_KEY_ORDER);
      expect(cfg.usedFiles).toEqual(['data/x.xml']);
      expect(cfg.sourceHash).toMatch(/^sha256-[0-9a-f]{64}$/);
      expect(cfg.isVariant).toBe(false);
      expect(cfg.hasVariants).toBe(false);
    });

    it('flags variants via isVariant', async () => {
      const mod = await makeMod('variant');
      expect(buildConfigJson(mod).isVariant).toBe(true);
    });
  });

  describe('readBuildLock', () => {
    it('returns undefined when build.lock.json is absent', () => {
      expect(readBuildLock(join(root, 'nope'))).toBeUndefined();
    });

    it('reads and validates a present lock', async () => {
      const buildDir = join(root, 'build');
      await fs.mkdir(buildDir, { recursive: true });
      const lock = {
        version: 3,
        fileName: 'UisciasZoom_00003.it',
        builtFromHash: `sha256-${'a'.repeat(64)}`,
      };
      await fs.writeFile(join(buildDir, 'build.lock.json'), JSON.stringify(lock), 'utf8');
      expect(readBuildLock(buildDir)).toEqual(lock);
    });

    it('returns undefined for a malformed lock', async () => {
      const buildDir = join(root, 'build');
      await fs.mkdir(buildDir, { recursive: true });
      await fs.writeFile(join(buildDir, 'build.lock.json'), '{"version":-1}', 'utf8');
      expect(readBuildLock(buildDir)).toBeUndefined();
    });
  });
});
