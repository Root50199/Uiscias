import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverMods, findMod, groupMods, packTargets, type Mod } from './mods';

/** Touch a file under the repo root, creating parent dirs. */
async function touch(root: string, rel: string): Promise<void> {
  const full = join(root, rel);
  await fs.mkdir(join(full, '..'), { recursive: true });
  await fs.writeFile(full, 'x');
}

describe('discoverMods', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'uiscias-mods-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('returns an empty list when there is no mods/ directory', () => {
    expect(discoverMods(root)).toEqual([]);
  });

  it('classifies standalone mods, variant parents, and variants', async () => {
    await touch(root, 'mods/Zoom/data/x.xml');
    await touch(root, 'mods/BriHpBars/BriHpBars1/data/x.xml');
    await touch(root, 'mods/BriHpBars/BriHpBars2/data/x.xml');

    const mods = discoverMods(root);
    const byId = new Map(mods.map((m) => [m.id, m]));

    expect(byId.get('Zoom')?.kind).toBe('standalone');
    expect(byId.get('BriHpBars')?.kind).toBe('variantParent');
    expect(byId.get('BriHpBars1')).toMatchObject({ kind: 'variant', groupId: 'BriHpBars' });
    expect(byId.get('BriHpBars2')).toMatchObject({ kind: 'variant', groupId: 'BriHpBars' });
    expect(byId.get('Zoom')?.relDir).toBe('mods/Zoom');
    expect(byId.get('BriHpBars1')?.relDir).toBe('mods/BriHpBars/BriHpBars1');
  });

  it('skips excluded, node_modules, dot, and non-mod folders', async () => {
    await touch(root, 'mods/Zoom/data/x.xml');
    await touch(root, 'mods/NewModTemplate/data/x.xml');
    await touch(root, 'mods/node_modules/data/x.xml');
    await touch(root, 'mods/.hidden/data/x.xml');
    await touch(root, 'mods/EmptyFolder/notes.txt');

    expect(discoverMods(root).map((m) => m.id)).toEqual(['Zoom']);
  });
});

describe('groupMods / packTargets / findMod', () => {
  const standalone: Mod = {
    id: 'Zoom',
    dir: '/r/mods/Zoom',
    relDir: 'mods/Zoom',
    kind: 'standalone',
    dataDir: '/r/mods/Zoom/data',
  };
  const parent: Mod = { id: 'Bri', dir: '/r/mods/Bri', relDir: 'mods/Bri', kind: 'variantParent' };
  const variant: Mod = {
    id: 'Bri1',
    dir: '/r/mods/Bri/Bri1',
    relDir: 'mods/Bri/Bri1',
    kind: 'variant',
    groupId: 'Bri',
    dataDir: '/r/mods/Bri/Bri1/data',
  };
  const all = [standalone, parent, variant];

  it('groups a standalone as a group of one and a parent with its variants', () => {
    const groups = groupMods(all);
    const standaloneGroup = groups.find((g) => !g.hasVariants);
    const variantGroup = groups.find((g) => g.hasVariants);

    expect(standaloneGroup?.members).toEqual([standalone]);
    expect(variantGroup?.parent).toEqual(parent);
    expect(variantGroup?.members).toEqual([variant]);
  });

  it('packTargets excludes variant parents', () => {
    expect(
      packTargets(all)
        .map((m) => m.id)
        .sort(),
    ).toEqual(['Bri1', 'Zoom']);
  });

  it('findMod looks up by id', () => {
    expect(findMod(all, 'Bri1')).toBe(variant);
    expect(findMod(all, 'Nope')).toBeUndefined();
  });
});
