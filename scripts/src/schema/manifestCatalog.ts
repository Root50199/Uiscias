import { z } from 'zod';
import { findiasTagsSchema, updateTypeSchema } from './tags';

/**
 * One installable artifact. A non-variant mod has exactly one of these; a
 * variant group has one per variant.
 */
export const manifestVariantSchema = z
  .object({
    modId: z.string().min(1),
    modName: z.string().min(1),
    fileName: z.string().min(1),
    version: z.number().int().positive(),
    size: z.number().int().nonnegative(),
    updateType: updateTypeSchema,
    usedFiles: z.array(z.string()),
    modAuthor: z.string().min(1),
    modAdditionalCredits: z.string().min(1),
    recentUpdateNotes: z.string().min(1),
  })
  .strict();

/**
 * A catalog group. Every entry is a group so Findias has a single code path: a
 * non-variant mod is a group of one (`mutuallyExclusive: false`); a variant set
 * is a group whose variants are mutually exclusive.
 */
export const manifestGroupSchema = z
  .object({
    groupId: z.string().min(1),
    modName: z.string().min(1),
    findiasTags: findiasTagsSchema,
    hasVariants: z.boolean(),
    mutuallyExclusive: z.boolean(),
    variants: z.array(manifestVariantSchema).min(1),
  })
  .strict();

export const manifestCatalogSchema = z.array(manifestGroupSchema);

export type ManifestVariant = z.infer<typeof manifestVariantSchema>;
export type ManifestGroup = z.infer<typeof manifestGroupSchema>;
export type ManifestCatalog = z.infer<typeof manifestCatalogSchema>;
