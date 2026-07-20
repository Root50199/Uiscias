import { describe, expect, it } from 'vitest';
import {
  MANIFEST_SCHEMA_VERSION,
  manifestCatalogSchema,
  manifestGroupSchema,
} from './manifestCatalog';

const variant = {
  modId: 'Zoom',
  modName: 'Zoom Mod',
  fileName: 'UisciasZoom_00001.it',
  version: 1,
  size: 1024,
  updatedAt: '2026-07-16T15:29:10.000Z',
  updateType: 'stable',
  usedFiles: ['data/x.xml'],
  modAuthor: 'Root50199',
  downloadCount: 60,
} as const;

const group = {
  groupId: 'Zoom',
  modName: 'Zoom Mod',
  findiasTags: ['Zoom'],
  hasVariants: false,
  mutuallyExclusive: false,
  variants: [variant],
} as const;

const catalog = {
  metadata: {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    currentGameVersion: '1.0.0',
    supportedGameVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
  },
  modList: [group],
} as const;

describe('manifestGroupSchema', () => {
  it('accepts a well-formed group', () => {
    expect(manifestGroupSchema.safeParse(group).success).toBe(true);
  });

  it('requires at least one variant', () => {
    expect(manifestGroupSchema.safeParse({ ...group, variants: [] }).success).toBe(false);
  });

  it('rejects extra keys (strict)', () => {
    expect(manifestGroupSchema.safeParse({ ...group, extra: 1 }).success).toBe(false);
  });

  it('accepts optional readme + image URLs on a variant and group', () => {
    const withDocs = {
      ...group,
      readme: '# Zoom',
      images: ['https://raw.githubusercontent.com/Root50199/Uiscias/v1/mods/Zoom/images/a.png'],
      variants: [
        {
          ...variant,
          readme: '# Zoom variant',
          images: ['https://raw.githubusercontent.com/Root50199/Uiscias/v1/mods/Zoom/images/b.png'],
        },
      ],
    };
    expect(manifestGroupSchema.safeParse(withDocs).success).toBe(true);
  });

  it('rejects non-URL image entries', () => {
    const bad = { ...group, images: ['a.png'] };
    expect(manifestGroupSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts optional credits + notes on a variant', () => {
    const withCredits = {
      ...group,
      variants: [{ ...variant, modAdditionalCredits: 'Thanks Bri', recentUpdateNotes: 'Fixed X' }],
    };
    expect(manifestGroupSchema.safeParse(withCredits).success).toBe(true);
  });

  it('accepts a zero downloadCount (e.g. a never-downloaded new variant)', () => {
    const zero = { ...group, variants: [{ ...variant, downloadCount: 0 }] };
    expect(manifestGroupSchema.safeParse(zero).success).toBe(true);
  });

  it('requires downloadCount on every variant', () => {
    const { downloadCount: _downloadCount, ...variantWithoutCount } = variant;
    const missing = { ...group, variants: [variantWithoutCount] };
    expect(manifestGroupSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects a negative or non-integer downloadCount', () => {
    const negative = { ...group, variants: [{ ...variant, downloadCount: -1 }] };
    expect(manifestGroupSchema.safeParse(negative).success).toBe(false);
    const fractional = { ...group, variants: [{ ...variant, downloadCount: 1.5 }] };
    expect(manifestGroupSchema.safeParse(fractional).success).toBe(false);
  });

  it('requires a datetime updatedAt on every variant', () => {
    const { updatedAt: _updatedAt, ...variantWithoutUpdatedAt } = variant;
    const missing = { ...group, variants: [variantWithoutUpdatedAt] };
    expect(manifestGroupSchema.safeParse(missing).success).toBe(false);
    const bad = { ...group, variants: [{ ...variant, updatedAt: 'nope' }] };
    expect(manifestGroupSchema.safeParse(bad).success).toBe(false);
  });
});

describe('manifestCatalogSchema', () => {
  it('accepts a full catalog', () => {
    expect(manifestCatalogSchema.safeParse(catalog).success).toBe(true);
  });

  it('rejects a non-datetime generatedAt', () => {
    const bad = { ...catalog, metadata: { ...catalog.metadata, generatedAt: 'yesterday' } };
    expect(manifestCatalogSchema.safeParse(bad).success).toBe(false);
  });

  it('allows an empty modList', () => {
    expect(manifestCatalogSchema.safeParse({ ...catalog, modList: [] }).success).toBe(true);
  });
});
