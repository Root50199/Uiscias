import { describe, expect, it } from 'vitest';
import { buildLockSchema } from './buildLock';

const valid = {
  version: 1,
  fileName: 'UisciasZoom_00001.it',
  builtFromHash: `sha256-${'a'.repeat(64)}`,
  updatedAt: '2026-07-16T15:29:10.000Z',
} as const;

describe('buildLockSchema', () => {
  it('accepts a well-formed lock', () => {
    expect(buildLockSchema.safeParse(valid).success).toBe(true);
  });

  it('requires a positive integer version', () => {
    expect(buildLockSchema.safeParse({ ...valid, version: 0 }).success).toBe(false);
    expect(buildLockSchema.safeParse({ ...valid, version: 1.5 }).success).toBe(false);
    expect(buildLockSchema.safeParse({ ...valid, version: -1 }).success).toBe(false);
  });

  it('rejects an empty fileName', () => {
    expect(buildLockSchema.safeParse({ ...valid, fileName: '' }).success).toBe(false);
  });

  it('rejects a malformed builtFromHash', () => {
    expect(buildLockSchema.safeParse({ ...valid, builtFromHash: 'nope' }).success).toBe(false);
  });

  it('requires a datetime updatedAt', () => {
    const { updatedAt: _updatedAt, ...withoutUpdatedAt } = valid;
    expect(buildLockSchema.safeParse(withoutUpdatedAt).success).toBe(false);
    expect(buildLockSchema.safeParse({ ...valid, updatedAt: 'not-a-date' }).success).toBe(false);
  });

  it('rejects extra keys (strict)', () => {
    expect(buildLockSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
  });
});
