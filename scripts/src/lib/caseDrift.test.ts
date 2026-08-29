import { describe, expect, it } from 'vitest';
import { findCaseMismatches, describeCaseMismatch } from './caseDrift';

describe('findCaseMismatches', () => {
  it('returns nothing when disk and tracked cases match exactly', () => {
    const paths = ['mods/A/data/db/Race.xml', 'mods/A/data/db/npcclientappearance.xml'];
    expect(findCaseMismatches(paths, paths)).toEqual([]);
  });

  it('detects a case-only difference in the file name', () => {
    const tracked = ['mods/A/data/db/CommerceCommon.xml'];
    const disk = ['mods/A/data/db/commercecommon.xml'];
    expect(findCaseMismatches(tracked, disk)).toEqual([
      { onDisk: 'mods/A/data/db/commercecommon.xml', tracked: 'mods/A/data/db/CommerceCommon.xml' },
    ]);
  });

  it('detects a case-only difference in a directory segment', () => {
    const tracked = ['mods/A/data/db/Race.xml'];
    const disk = ['mods/A/data/DB/Race.xml'];
    expect(findCaseMismatches(tracked, disk)).toEqual([
      { onDisk: 'mods/A/data/DB/Race.xml', tracked: 'mods/A/data/db/Race.xml' },
    ]);
  });

  it('ignores an untracked new file (no tracked counterpart)', () => {
    const tracked = ['mods/A/data/db/Race.xml'];
    const disk = ['mods/A/data/db/Race.xml', 'mods/A/data/db/BrandNew.xml'];
    expect(findCaseMismatches(tracked, disk)).toEqual([]);
  });

  it('ignores a tracked file missing from disk (deletion in progress)', () => {
    const tracked = ['mods/A/data/db/Race.xml', 'mods/A/data/db/Gone.xml'];
    const disk = ['mods/A/data/db/Race.xml'];
    expect(findCaseMismatches(tracked, disk)).toEqual([]);
  });

  it('reports multiple mismatches sorted by the on-disk path', () => {
    const tracked = ['mods/A/data/db/Zed.xml', 'mods/A/data/db/Alpha.xml'];
    const disk = ['mods/A/data/db/zed.xml', 'mods/A/data/db/alpha.xml'];
    expect(findCaseMismatches(tracked, disk)).toEqual([
      { onDisk: 'mods/A/data/db/alpha.xml', tracked: 'mods/A/data/db/Alpha.xml' },
      { onDisk: 'mods/A/data/db/zed.xml', tracked: 'mods/A/data/db/Zed.xml' },
    ]);
  });
});

describe('describeCaseMismatch', () => {
  it('names both the disk and tracked paths and the fix', () => {
    const message = describeCaseMismatch({
      onDisk: 'mods/A/data/db/commercecommon.xml',
      tracked: 'mods/A/data/db/CommerceCommon.xml',
    });
    expect(message).toContain('working tree has "mods/A/data/db/commercecommon.xml"');
    expect(message).toContain('git tracks "mods/A/data/db/CommerceCommon.xml"');
    expect(message).toContain('generate-configs');
  });
});
