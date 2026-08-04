import { describe, expect, it } from 'vitest';
import { describeConfigDrift } from './configDrift';

/** A config.json body, serialized the way `formatJson` would emit it. */
const asJson = (value: Record<string, unknown>): string => `${JSON.stringify(value, null, 2)}\n`;

const BASE = {
  modId: 'Zoom',
  modName: 'Zoom Mod',
  updateType: 'stable',
  usedFiles: ['data/a.xml', 'data/b.xml'],
  sourceHash: `sha256-${'a'.repeat(64)}`,
} satisfies Record<string, unknown>;

describe('describeConfigDrift', () => {
  it('reports a missing config.json', () => {
    expect(describeConfigDrift(null, asJson(BASE))).toEqual(['missing config.json']);
  });

  it('reports an unparseable config.json', () => {
    const reasons = describeConfigDrift('{ "modId": ', asJson(BASE));
    expect(reasons).toEqual(['not valid JSON — the file was hand-edited or truncated']);
  });

  it('reports formatting-only drift when every value still matches', () => {
    const current = `${JSON.stringify({ modName: 'Zoom Mod', modId: 'Zoom' })}\n`;
    const desired = asJson({ modId: 'Zoom', modName: 'Zoom Mod' });
    expect(describeConfigDrift(current, desired)).toEqual([
      'JSON formatting differs (key order or indentation)',
    ]);
  });

  it('reports a field the committed file is missing', () => {
    const desired = asJson({ ...BASE, recentUpdateNotes: 'added bomb timer' });
    expect(describeConfigDrift(asJson(BASE), desired)).toEqual([
      'recentUpdateNotes: missing, should be "added bomb timer"',
    ]);
  });

  it('reports a field that is no longer generated', () => {
    const current = asJson({ ...BASE, images: ['old.png'] });
    expect(describeConfigDrift(current, asJson(BASE))).toEqual([
      'images: no longer generated, but committed as 1 entry',
    ]);
  });

  it('reports added and removed array entries', () => {
    const desired = asJson({ ...BASE, usedFiles: ['data/a.xml', 'data/c.xml'] });
    expect(describeConfigDrift(asJson(BASE), desired)).toEqual([
      'usedFiles: +1 missing ("data/c.xml"), -1 stale ("data/b.xml")',
    ]);
  });

  it('reports a reordered array without listing entries', () => {
    const desired = asJson({ ...BASE, usedFiles: ['data/b.xml', 'data/a.xml'] });
    expect(describeConfigDrift(asJson(BASE), desired)).toEqual([
      'usedFiles: same 2 entries, different order',
    ]);
  });

  it('quotes short single-line strings inline', () => {
    const desired = asJson({ ...BASE, modName: 'Zoom Mod 2' });
    expect(describeConfigDrift(asJson(BASE), desired)).toEqual([
      'modName: "Zoom Mod" → "Zoom Mod 2"',
    ]);
  });

  it('summarizes a type change', () => {
    const desired = asJson({ ...BASE, isVariant: true });
    const current = asJson({ ...BASE, isVariant: 'yes' });
    expect(describeConfigDrift(current, desired)).toEqual(['isVariant: "yes" → true']);
  });

  // The PR #165 regression: `generate-configs` ran before Prettier stripped a
  // trailing space from the README, so the embedded copy kept it. The old report
  // said only "stale: mods/BriMidirEffects", which hid a one-character cause.
  it('pinpoints a trailing space inside the embedded readme', () => {
    const lines = ['# Bri Midir Effects', '', '## What it does', '', 'Tornado effects replaced.'];
    const desired = asJson({ ...BASE, readme: [...lines, 'Halo beam is now blue.'].join('\n') });
    const current = asJson({ ...BASE, readme: [...lines, 'Halo beam is now blue. '].join('\n') });

    expect(describeConfigDrift(current, desired)).toEqual([
      [
        'readme: line 6 differs (trailing whitespace)',
        '  committed: Halo beam is now blue.·',
        '  expected:  Halo beam is now blue.',
      ].join('\n'),
    ]);
  });

  it('makes a tab visible in a readme snippet', () => {
    const readme = '# Zoom\n\nIndented line.';
    const current = asJson({ ...BASE, readme: '# Zoom\n\n\tIndented line.' });
    const desired = asJson({ ...BASE, readme });

    expect(describeConfigDrift(current, desired)).toEqual([
      [
        'readme: line 3 differs (leading whitespace)',
        '  committed: →Indented line.',
        '  expected:  Indented line.',
      ].join('\n'),
    ]);
  });

  it('windows a long readme line around the first difference', () => {
    const prefix = 'x'.repeat(200);
    const current = asJson({ ...BASE, readme: `# Zoom\n\n${prefix}alpha` });
    const desired = asJson({ ...BASE, readme: `# Zoom\n\n${prefix}omega` });

    const [reason] = describeConfigDrift(current, desired);
    expect(reason).toContain('readme: line 3 differs');
    // The skipped prefix is elided, the divergence itself stays on screen, and
    // the whole snippet is short enough to read in a CI log.
    expect(reason).toContain('  committed: …');
    expect(reason).toContain('alpha');
    expect(reason).toContain('omega');
    for (const line of reason.split('\n')) expect(line.length).toBeLessThan(110);
  });

  it('elides both ends when the difference is mid-line', () => {
    const pad = 'x'.repeat(200);
    const current = asJson({ ...BASE, readme: `# Zoom\n\n${pad}alpha${pad}` });
    const desired = asJson({ ...BASE, readme: `# Zoom\n\n${pad}omega${pad}` });

    const [reason] = describeConfigDrift(current, desired);
    expect(reason).toContain('  committed: …');
    expect(reason).toMatch(/alpha.*…$/m);
  });

  it('reports a line count difference in the readme', () => {
    const current = asJson({ ...BASE, readme: '# Zoom\n\nOne.' });
    const desired = asJson({ ...BASE, readme: '# Zoom\n\nOne.\nTwo.\nThree.' });
    expect(describeConfigDrift(current, desired)).toEqual(['readme: 2 lines missing at line 4']);
  });

  it('caps the report and counts the remaining fields', () => {
    const current = asJson({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 });
    const desired = asJson({ a: 10, b: 20, c: 30, d: 40, e: 50, f: 60, g: 70 });
    const reasons = describeConfigDrift(current, desired);

    expect(reasons).toHaveLength(6);
    expect(reasons[0]).toBe('a: 1 → 10');
    expect(reasons[5]).toBe('… and 2 more field(s)');
  });
});
