import { z } from 'zod';
import { findiasTagsSchema, updateTypeSchema } from './tags';

/**
 * The single hand-edited metadata file per mod (and per variant, and per
 * variant-parent group). Everything else is generated from this plus `data/`.
 */
export const configYamlSchema = z
  .object({
    modId: z.string().min(1),
    modName: z.string().min(1),
    modAuthor: z.string().min(1),
    modAdditionalCredits: z.string().min(1).default('None'),
    updateType: updateTypeSchema,
    recentUpdateNotes: z.string().min(1).default('n/a'),
    // Optional: not every mod has tags. Omitting the key is the same as [].
    findiasTags: findiasTagsSchema.default([]),
  })
  .strict();

export type ConfigYaml = z.infer<typeof configYamlSchema>;

/** Field order used when emitting a `config.yaml` (migration / formatting). */
export const CONFIG_YAML_KEY_ORDER: (keyof ConfigYaml)[] = [
  'modId',
  'modName',
  'modAuthor',
  'modAdditionalCredits',
  'updateType',
  'recentUpdateNotes',
  'findiasTags',
];
