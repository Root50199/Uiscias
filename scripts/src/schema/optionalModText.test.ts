import { describe, expect, it } from 'vitest';
import { isPlaceholderModText, optionalModTextSchema } from './optionalModText';

describe('isPlaceholderModText', () => {
  it.each(['n/a', 'N/A', 'none', 'None', 'NONE', '  n/a  ', ' none '])(
    'treats %s as a placeholder',
    (value) => {
      expect(isPlaceholderModText(value)).toBe(true);
    },
  );

  it.each(['Thanks Bri', 'Ported and maintained by Root50199', 'Fixed the thing', 'na', ''])(
    'does not treat %s as a placeholder',
    (value) => {
      expect(isPlaceholderModText(value)).toBe(false);
    },
  );
});

describe('optionalModTextSchema', () => {
  it('accepts undefined (omitted key)', () => {
    expect(optionalModTextSchema.safeParse(undefined).success).toBe(true);
  });

  it('accepts a real value', () => {
    expect(optionalModTextSchema.safeParse('Thanks Bri').success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(optionalModTextSchema.safeParse('').success).toBe(false);
  });

  it.each(['n/a', 'none', 'None', 'N/A'])('rejects placeholder %s', (value) => {
    expect(optionalModTextSchema.safeParse(value).success).toBe(false);
  });
});
