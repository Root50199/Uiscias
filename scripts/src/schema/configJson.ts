import { z } from 'zod';
import { findiasTagsSchema, updateTypeSchema } from './tags';

/** A content hash, e.g. `sha256-<64 hex chars>`. */
export const sourceHashSchema = z.string().regex(/^sha256-[0-9a-f]{64}$/);

/**
 * The generated, committed per-mod config. Produced by `generate-configs` from
 * `config.yaml` + a scan of `data/`. Aggregated into `manifestCatalog.json` at
 * release time. Emitted with a fixed key order so unchanged input regenerates
 * byte-identically.
 */
export const configJsonSchema = z
  .object({
    modId: z.string().min(1),
    modName: z.string().min(1),
    modAuthor: z.string().min(1),
    modAdditionalCredits: z.string().min(1),
    updateType: updateTypeSchema,
    findiasTags: findiasTagsSchema,
    recentUpdateNotes: z.string().min(1),
    isVariant: z.boolean(),
    hasVariants: z.boolean(),
    usedFiles: z.array(z.string()),
    sourceHash: sourceHashSchema,
  })
  .strict();

export type ConfigJson = z.infer<typeof configJsonSchema>;

export const CONFIG_JSON_KEY_ORDER: (keyof ConfigJson)[] = [
  'modId',
  'modName',
  'modAuthor',
  'modAdditionalCredits',
  'updateType',
  'findiasTags',
  'recentUpdateNotes',
  'isVariant',
  'hasVariants',
  'usedFiles',
  'sourceHash',
];
