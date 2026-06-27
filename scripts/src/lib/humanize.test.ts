import { describe, expect, it } from 'vitest';
import { humanizeModId } from './humanize';

describe('humanizeModId', () => {
  it('spaces a PascalCase id with embedded digits', () => {
    expect(humanizeModId('BriHpBars1And2')).toBe('Bri Hp Bars 1 And 2');
  });

  it('inserts a space between a letter and a following capital', () => {
    expect(humanizeModId('ZoomOut')).toBe('Zoom Out');
  });

  it('splits letter<->digit boundaries in both directions', () => {
    expect(humanizeModId('Crom2')).toBe('Crom 2');
    expect(humanizeModId('2Fast')).toBe('2 Fast');
  });

  it('preserves the FoV acronym instead of splitting it', () => {
    expect(humanizeModId('WideFoV')).toBe('Wide FoV');
  });

  it('leaves a single word untouched', () => {
    expect(humanizeModId('Zoom')).toBe('Zoom');
  });
});
