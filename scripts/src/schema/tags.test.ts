import { describe, expect, it } from 'vitest';
import { findiasTagSchema, updateTypeSchema } from './tags';

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
