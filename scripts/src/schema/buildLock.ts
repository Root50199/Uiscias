import { z } from 'zod';
import { sourceHashSchema } from './configJson';

/**
 * Records which source the committed `.it` in a mod's `build/` was built from.
 * The packer compares `config.json.sourceHash` against `builtFromHash` to
 * decide whether a repack + version bump is required.
 */
export const buildLockSchema = z
  .object({
    version: z.number().int().positive(),
    fileName: z.string().min(1),
    builtFromHash: sourceHashSchema,
    /** UTC ISO-8601 instant the `.it` was last (re)packed. Moves only on a repack. */
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type BuildLock = z.infer<typeof buildLockSchema>;

export const BUILD_LOCK_KEY_ORDER: (keyof BuildLock)[] = [
  'version',
  'fileName',
  'builtFromHash',
  'updatedAt',
];
