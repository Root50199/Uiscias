import { describe, expect, it } from 'vitest';
import { CONFIG_JSON_KEY_ORDER, configJsonSchema, sourceHashSchema } from './configJson';

const valid = {
  modId: 'Zoom',
  modName: 'Zoom Mod',
  modAuthor: 'Root50199',
  updateType: 'stable',
  findiasTags: ['Zoom'],
  isVariant: false,
  hasVariants: false,
  usedFiles: ['data/x.xml'],
  sourceHash: `sha256-${'a'.repeat(64)}`,
} as const;

describe('sourceHashSchema', () => {
  it('accepts a sha256-prefixed 64-hex string', () => {
    expect(sourceHashSchema.safeParse(`sha256-${'a'.repeat(64)}`).success).toBe(true);
  });

  it('rejects malformed hashes', () => {
    expect(sourceHashSchema.safeParse('sha256-xyz').success).toBe(false);
    expect(sourceHashSchema.safeParse('a'.repeat(64)).success).toBe(false);
    expect(sourceHashSchema.safeParse(`sha256-${'A'.repeat(64)}`).success).toBe(false);
  });
});

describe('configJsonSchema', () => {
  it('accepts a config without the optional credits/notes', () => {
    expect(configJsonSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts optional credits + notes when present', () => {
    const withCredits = {
      ...valid,
      modAdditionalCredits: 'Thanks Bri',
      recentUpdateNotes: 'Fixed the thing',
    };
    expect(configJsonSchema.safeParse(withCredits).success).toBe(true);
  });

  it('rejects unknown keys (strict)', () => {
    expect(configJsonSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it('rejects a missing required field', () => {
    const { sourceHash, ...rest } = valid;
    void sourceHash;
    expect(configJsonSchema.safeParse(rest).success).toBe(false);
  });
});

describe('CONFIG_JSON_KEY_ORDER', () => {
  it('lists exactly the schema keys', () => {
    const schemaKeys = Object.keys(configJsonSchema.shape).sort();
    expect([...CONFIG_JSON_KEY_ORDER].sort()).toEqual(schemaKeys);
  });
});
