import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  VERSION_LEDGER_FILE,
  floorFor,
  readVersionLedger,
  readVersionLedgerStrict,
  recordVersion,
  versionLedgerPath,
  writeVersionLedger,
} from './versionLedger';
import type { VersionLedger } from '../schema';

describe('versionLedger', () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'uiscias-ledger-'));
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const writeRaw = (contents: string): Promise<void> =>
    fs.writeFile(versionLedgerPath(root), contents, 'utf8');

  describe('versionLedgerPath', () => {
    it('resolves the ledger under the repo root', () => {
      expect(versionLedgerPath(root)).toBe(join(root, VERSION_LEDGER_FILE));
    });
  });

  describe('floorFor', () => {
    it('returns the recorded version for a known modId', () => {
      expect(floorFor({ Zoom: 4 }, 'Zoom')).toBe(4);
    });

    it('returns 0 for an unknown modId', () => {
      expect(floorFor({ Zoom: 4 }, 'Nope')).toBe(0);
    });
  });

  describe('recordVersion', () => {
    it('records a new modId and reports the change', () => {
      const ledger: VersionLedger = {};
      expect(recordVersion(ledger, 'Zoom', 3)).toBe(true);
      expect(ledger).toEqual({ Zoom: 3 });
    });

    it('raises an existing floor to a higher version', () => {
      const ledger: VersionLedger = { Zoom: 3 };
      expect(recordVersion(ledger, 'Zoom', 5)).toBe(true);
      expect(ledger.Zoom).toBe(5);
    });

    it('is a no-op for an equal version', () => {
      const ledger: VersionLedger = { Zoom: 3 };
      expect(recordVersion(ledger, 'Zoom', 3)).toBe(false);
      expect(ledger.Zoom).toBe(3);
    });

    it('never lowers an existing floor', () => {
      const ledger: VersionLedger = { Zoom: 5 };
      expect(recordVersion(ledger, 'Zoom', 2)).toBe(false);
      expect(ledger.Zoom).toBe(5);
    });
  });

  describe('readVersionLedger (lenient)', () => {
    it('returns an empty ledger when the file is absent', () => {
      expect(readVersionLedger(root)).toEqual({});
    });

    it('reads and validates a present ledger', async () => {
      await writeVersionLedger(root, { Zoom: 4, Bri: 1 });
      expect(readVersionLedger(root)).toEqual({ Zoom: 4, Bri: 1 });
    });

    it('self-heals to an empty ledger on malformed JSON', async () => {
      await writeRaw('{ not json');
      expect(readVersionLedger(root)).toEqual({});
    });

    it('self-heals to an empty ledger on schema-invalid data', async () => {
      await writeRaw(JSON.stringify({ Zoom: -1 }));
      expect(readVersionLedger(root)).toEqual({});
    });
  });

  describe('readVersionLedgerStrict', () => {
    it('returns an empty ledger when the file is absent (first-run, not corruption)', () => {
      expect(readVersionLedgerStrict(root)).toEqual({});
    });

    it('reads and validates a present ledger', async () => {
      await writeVersionLedger(root, { Zoom: 4 });
      expect(readVersionLedgerStrict(root)).toEqual({ Zoom: 4 });
    });

    it('throws on malformed JSON', async () => {
      await writeRaw('{ not json');
      expect(() => readVersionLedgerStrict(root)).toThrow();
    });

    it('throws on schema-invalid data', async () => {
      await writeRaw(JSON.stringify({ Zoom: 1.5 }));
      expect(() => readVersionLedgerStrict(root)).toThrow();
    });
  });

  describe('writeVersionLedger', () => {
    it('round-trips through readVersionLedger', async () => {
      const ledger: VersionLedger = { Zoom: 2, Bri: 7 };
      await writeVersionLedger(root, ledger);
      expect(readVersionLedger(root)).toEqual(ledger);
    });

    it('sorts keys alphabetically for a stable committed file', async () => {
      await writeVersionLedger(root, { Zoom: 1, Achievement: 2, Mana: 3 });
      const parsed = JSON.parse(await fs.readFile(versionLedgerPath(root), 'utf8'));
      expect(Object.keys(parsed)).toEqual(['Achievement', 'Mana', 'Zoom']);
    });
  });
});
