import { describe, expect, it } from 'vitest';
import { configYamlSchema } from './configYaml';

const minimal = {
  modId: 'Zoom',
  modName: 'Zoom Mod',
  modAuthor: 'Root50199',
  updateType: 'stable',
} as const;

describe('configYamlSchema', () => {
  it('applies defaults for optional fields', () => {
    const parsed = configYamlSchema.parse(minimal);
    expect(parsed.modAdditionalCredits).toBe('None');
    expect(parsed.recentUpdateNotes).toBe('n/a');
    expect(parsed.findiasTags).toEqual([]);
  });

  it('rejects unknown keys (strict)', () => {
    expect(configYamlSchema.safeParse({ ...minimal, extra: 1 }).success).toBe(false);
  });

  it('rejects empty required strings', () => {
    expect(configYamlSchema.safeParse({ ...minimal, modName: '' }).success).toBe(false);
  });

  it('rejects an invalid updateType', () => {
    expect(configYamlSchema.safeParse({ ...minimal, updateType: 'evergreen' }).success).toBe(false);
  });

  it('rejects an unknown tag', () => {
    expect(configYamlSchema.safeParse({ ...minimal, findiasTags: ['Nope'] }).success).toBe(false);
  });
});
