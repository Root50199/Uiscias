import { describe, expect, it } from 'vitest';
import { configYamlSchema } from './configYaml';

const minimal = {
  modId: 'Zoom',
  modName: 'Zoom Mod',
  modAuthor: 'Root50199',
  updateType: 'stable',
} as const;

describe('configYamlSchema', () => {
  it('leaves optional credits/notes unset when the key is omitted', () => {
    const parsed = configYamlSchema.parse(minimal);
    expect(parsed.modAdditionalCredits).toBeUndefined();
    expect(parsed.recentUpdateNotes).toBeUndefined();
    expect(parsed.findiasTags).toEqual([]);
  });

  it('keeps optional credits/notes when provided', () => {
    const parsed = configYamlSchema.parse({
      ...minimal,
      modAdditionalCredits: 'Thanks Bri',
      recentUpdateNotes: 'Fixed the thing',
    });
    expect(parsed.modAdditionalCredits).toBe('Thanks Bri');
    expect(parsed.recentUpdateNotes).toBe('Fixed the thing');
  });

  it('rejects a blank optional field (null or empty string)', () => {
    // A bare `key:` in YAML parses to null; `key: ""` is empty. Both fail by
    // design so authors comment the line or fill it, never leave it ambiguous.
    expect(configYamlSchema.safeParse({ ...minimal, modAdditionalCredits: null }).success).toBe(
      false,
    );
    expect(configYamlSchema.safeParse({ ...minimal, recentUpdateNotes: '' }).success).toBe(false);
  });

  it.each(['n/a', 'none', 'None', 'N/A'] as const)(
    'rejects placeholder modAdditionalCredits: %s',
    (value) => {
      expect(configYamlSchema.safeParse({ ...minimal, modAdditionalCredits: value }).success).toBe(
        false,
      );
    },
  );

  it.each(['n/a', 'none', 'None', 'N/A'] as const)(
    'rejects placeholder recentUpdateNotes: %s',
    (value) => {
      expect(configYamlSchema.safeParse({ ...minimal, recentUpdateNotes: value }).success).toBe(
        false,
      );
    },
  );

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
