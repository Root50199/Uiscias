import { describe, expect, it } from 'vitest';
import { modsForPaths } from './scope';
import type { Mod } from './mods';

const mod = (over: Partial<Mod> & Pick<Mod, 'id' | 'relDir' | 'kind'>): Mod => ({
  dir: `/repo/${over.relDir}`,
  ...over,
});

const Standalone = mod({ id: 'Zoom', relDir: 'mods/Zoom', kind: 'standalone' });
const Parent = mod({ id: 'BriHpBars', relDir: 'mods/BriHpBars', kind: 'variantParent' });
const Variant = mod({
  id: 'BriHpBars1And2',
  relDir: 'mods/BriHpBars/BriHpBars1And2',
  kind: 'variant',
  groupId: 'BriHpBars',
});
const ALL = [Standalone, Parent, Variant];

describe('modsForPaths', () => {
  it('maps a file under a standalone mod to that mod', () => {
    expect(modsForPaths(['mods/Zoom/data/x.xml'], ALL)).toEqual([Standalone]);
  });

  it('picks the most specific (variant) mod and pulls in its parent group', () => {
    const result = modsForPaths(['mods/BriHpBars/BriHpBars1And2/data/x.xml'], ALL);
    expect(result.map((m) => m.id).sort()).toEqual(['BriHpBars', 'BriHpBars1And2']);
  });

  it('ignores paths outside any mod folder', () => {
    expect(modsForPaths(['README.md', 'scripts/src/index.ts'], ALL)).toEqual([]);
  });

  it('deduplicates when multiple paths hit the same mod', () => {
    const result = modsForPaths(['mods/Zoom/config.yaml', 'mods/Zoom/data/a.xml'], ALL);
    expect(result).toEqual([Standalone]);
  });

  it('matches a path equal to the mod relDir itself', () => {
    expect(modsForPaths(['mods/Zoom'], ALL)).toEqual([Standalone]);
  });
});
