import path from 'node:path';
import { fse, readJsonFile, writeJsonFile } from './io';
import { versionLedgerSchema, type VersionLedger } from '../schema';

/** File name of the committed version ledger at the repo root. */
export const VERSION_LEDGER_FILE = 'version-ledger.json';

/** Absolute path to the repo-root version ledger. */
export const versionLedgerPath = (repoRoot: string): string =>
  path.join(repoRoot, VERSION_LEDGER_FILE);

/**
 * Read + validate the committed version ledger. Returns an empty ledger when the
 * file is absent (first run) or fails validation, so a fresh or corrupt file
 * simply self-heals as mods are packed rather than crashing the pack.
 */
export const readVersionLedger = (repoRoot: string): VersionLedger => {
  const p = versionLedgerPath(repoRoot);
  if (!fse.pathExistsSync(p)) return {};
  try {
    const parsed = versionLedgerSchema.safeParse(readJsonFile(p));
    return parsed.success ? parsed.data : {};
  } catch {
    // Malformed JSON (readJsonFile throws) is treated the same as schema-invalid:
    // self-heal to an empty ledger so a corrupt file never crashes a pack.
    return {};
  }
};

/**
 * Like {@link readVersionLedger}, but **throws** when the file exists yet is
 * unreadable (bad JSON) or fails validation, instead of silently degrading to an
 * empty ledger. `check` uses this so a corrupt ledger fails CI rather than
 * zeroing every floor — which would let a version regression slip through
 * undetected. A missing file is still fine (empty ledger): that is the first-run
 * state, not corruption.
 */
export const readVersionLedgerStrict = (repoRoot: string): VersionLedger => {
  const p = versionLedgerPath(repoRoot);
  if (!fse.pathExistsSync(p)) return {};
  return versionLedgerSchema.parse(readJsonFile(p));
};

/** The recorded version floor for a modId (0 when the modId is unknown). */
export const floorFor = (ledger: VersionLedger, modId: string): number => ledger[modId] ?? 0;

/**
 * Record a version for a modId, keeping the highest ever seen (monotonic).
 * Returns `true` when the ledger actually changed, so callers can skip a no-op
 * write (and no-op git stage).
 */
export const recordVersion = (ledger: VersionLedger, modId: string, version: number): boolean => {
  if ((ledger[modId] ?? 0) >= version) return false;
  ledger[modId] = version;
  return true;
};

/**
 * Write the ledger to the repo root as Prettier-formatted JSON with keys sorted
 * alphabetically, so the committed file stays stable regardless of pack order.
 */
export const writeVersionLedger = async (
  repoRoot: string,
  ledger: VersionLedger,
): Promise<void> => {
  const sorted = Object.fromEntries(Object.entries(ledger).sort(([a], [b]) => a.localeCompare(b)));
  await writeJsonFile(versionLedgerPath(repoRoot), sorted);
};
