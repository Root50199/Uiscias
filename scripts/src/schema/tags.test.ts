import { describe, expect, it } from 'vitest';
import { findiasTagSchema, normalizeUpdateType, updateTypeSchema } from './tags';

describe('normalizeUpdateType', () => {
  it('passes through canonical values (case-insensitively)', () => {
    expect(normalizeUpdateType('stable')).toBe('stable');
    expect(normalizeUpdateType('Volatile')).toBe('volatile');
  });

  it('maps legacy aliases onto the canonical enum', () => {
    expect(normalizeUpdateType('Evergreen')).toBe('stable');
    expect(normalizeUpdateType('NeedsMaintenance')).toBe('volatile');
    expect(normalizeUpdateType('  maintenanceRequired  ')).toBe('volatile');
  });

  it('returns undefined for unknown values', () => {
    expect(normalizeUpdateType('whatever')).toBeUndefined();
  });
});

describe('updateTypeSchema', () => {
  it('accepts canonical values and rejects others', () => {
    expect(updateTypeSchema.safeParse('stable').success).toBe(true);
    expect(updateTypeSchema.safeParse('evergreen').success).toBe(false);
  });
});

describe('findiasTagSchema', () => {
  it('accepts a known tag and rejects an unknown one', () => {
    expect(findiasTagSchema.safeParse('Zoom').success).toBe(true);
    expect(findiasTagSchema.safeParse('NotATag').success).toBe(false);
  });
});
