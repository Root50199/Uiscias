export interface CaseMismatch {
  /** The path as it exists in the working tree (wrong case). */
  readonly onDisk: string;
  /** The path as git tracks it (canonical case). */
  readonly tracked: string;
}

/**
 * Files whose working-tree name matches a tracked file case-insensitively but
 * differs in case. On a case-insensitive filesystem (`core.ignorecase=true` on
 * Windows) git silently keeps the old case after a case-only rename, so
 * config.json's `usedFiles` + `sourceHash` (both scanned from disk) drift from
 * the committed tree and only fail on a case-sensitive CI runner. Comparing the
 * disk scan against `git ls-files` catches it locally instead.
 *
 * New files with no tracked counterpart, and tracked files missing from disk,
 * produce no match — only a genuine case-only divergence is reported.
 */
export const findCaseMismatches = (
  trackedPaths: readonly string[],
  diskPaths: readonly string[],
): CaseMismatch[] => {
  const trackedByLower = new Map<string, string>();
  for (const tracked of trackedPaths) trackedByLower.set(tracked.toLowerCase(), tracked);

  const mismatches: CaseMismatch[] = [];
  for (const onDisk of diskPaths) {
    const tracked = trackedByLower.get(onDisk.toLowerCase());
    if (tracked !== undefined && tracked !== onDisk) {
      mismatches.push({ onDisk, tracked });
    }
  }

  return mismatches.sort((a, b) => a.onDisk.localeCompare(b.onDisk));
};

/** One-line, actionable description of a single case mismatch. */
export const describeCaseMismatch = ({ onDisk, tracked }: CaseMismatch): string =>
  `filename case mismatch — working tree has "${onDisk}" but git tracks "${tracked}". ` +
  `Rename the working-tree file to match git's case, then re-run generate-configs + pack.`;
