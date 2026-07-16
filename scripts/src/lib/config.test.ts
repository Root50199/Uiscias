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

  /** Optional keys omitted when the config.yaml leaves them unset. */
  const OPTIONAL_KEYS: readonly (typeof CONFIG_JSON_KEY_ORDER)[number][] = [
    'readme',
    'images',
    'modAdditionalCredits',
    'recentUpdateNotes',
  ];
  /** Base config.json keys always present (no README / images / credits / notes). */
  const BASE_KEYS = CONFIG_JSON_KEY_ORDER.filter((k) => !OPTIONAL_KEYS.includes(k));

  describe('loadConfigYaml', () => {
    it('loads and validates config.yaml, leaving optional fields unset', async () => {
      const mod = await makeMod();
      const yaml = loadConfigYaml(mod);
      expect(yaml.modId).toBe('Zoom');
      expect(yaml.modAdditionalCredits).toBeUndefined();
      expect(yaml.recentUpdateNotes).toBeUndefined();
      expect(yaml.findiasTags).toEqual([]);
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

      // No README / images / credits / notes, so those keys are omitted (lean mods).
      expect(Object.keys(cfg)).toEqual(BASE_KEYS);
      expect(cfg.readme).toBeUndefined();
      expect(cfg.images).toBeUndefined();
      expect(cfg.modAdditionalCredits).toBeUndefined();
      expect(cfg.recentUpdateNotes).toBeUndefined();
      expect(cfg.usedFiles).toEqual(['data/x.xml']);
      expect(cfg.sourceHash).toMatch(/^sha256-[0-9a-f]{64}$/);
      expect(cfg.isVariant).toBe(false);
      expect(cfg.hasVariants).toBe(false);
    });

    it('flags variants via isVariant', async () => {
      const mod = await makeMod('variant');
      expect(buildConfigJson(mod).isVariant).toBe(true);
    });

    it('includes optional credits + notes when the yaml sets them', async () => {
      const mod = await makeMod();
      await fs.writeFile(
        join(mod.dir, 'config.yaml'),
        `${YAML_MIN}modAdditionalCredits: Thanks Bri\nrecentUpdateNotes: Fixed the thing\n`,
        'utf8',
      );
      const cfg = buildConfigJson(mod);
      expect(cfg.modAdditionalCredits).toBe('Thanks Bri');
      expect(cfg.recentUpdateNotes).toBe('Fixed the thing');
      // Present optional fields still land in canonical order (no README / images).
      const keysNoDocs = CONFIG_JSON_KEY_ORDER.filter((k) => k !== 'readme' && k !== 'images');
      expect(Object.keys(cfg)).toEqual(keysNoDocs);
    });

    it('reads README.md verbatim and scans images/ in canonical key order', async () => {
      const mod = await makeMod();
      await fs.writeFile(join(mod.dir, 'README.md'), '# Zoom\n\nHello.\n', 'utf8');
      const imagesDir = join(mod.dir, 'images');
      await fs.mkdir(imagesDir, { recursive: true });
      await fs.writeFile(join(imagesDir, 'b.png'), 'x');
      await fs.writeFile(join(imagesDir, 'a.gif'), 'x');

      const cfg = buildConfigJson(mod);
      // YAML_MIN sets no credits/notes, so those keys are absent; readme/images present.
      const keysWithDocs = CONFIG_JSON_KEY_ORDER.filter(
        (k) => k !== 'modAdditionalCredits' && k !== 'recentUpdateNotes',
      );
      expect(Object.keys(cfg)).toEqual(keysWithDocs);
      expect(cfg.readme).toBe('# Zoom\n\nHello.');
      expect(cfg.images).toEqual(['a.gif', 'b.png']);
    });

    it('omits readme for an empty README.md', async () => {
      const mod = await makeMod();
      await fs.writeFile(join(mod.dir, 'README.md'), '   \n', 'utf8');
      expect(buildConfigJson(mod).readme).toBeUndefined();
    });

    it('sorts findiasTags alphabetically regardless of config.yaml order', async () => {
      const mod = await makeMod();
      await fs.writeFile(
        join(mod.dir, 'config.yaml'),
        `${YAML_MIN}findiasTags:\n  - UI\n  - Combat\n  - QoL\n`,
        'utf8',
      );
      expect(buildConfigJson(mod).findiasTags).toEqual(['Combat', 'QoL', 'UI']);
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
