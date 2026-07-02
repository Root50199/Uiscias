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
    // Optional: present only when the mod's config sets them.
    modAdditionalCredits: z.string().min(1).optional(),
    recentUpdateNotes: z.string().min(1).optional(),
    // Optional docs: the README.md text (verbatim) and fully-qualified,
    // release-pinned raw.githubusercontent.com URLs for the mod's images.
    readme: z.string().min(1).optional(),
    images: z.array(z.string().url()).optional(),
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
    // Optional group-level docs (a variant may override these with its own).
    readme: z.string().min(1).optional(),
    images: z.array(z.string().url()).optional(),
  })
  .strict();

/**
 * The current manifest format version. A code constant (not a `catalog.yaml`
 * field) so it bumps deliberately with the format. Consumers can use it to
 * detect/reject an incompatible manifest shape.
 */
export const MANIFEST_SCHEMA_VERSION = 1;

/**
 * The hand-edited, catalog-level metadata file (`catalog.yaml` at the repo
 * root). The only human input that is not per-mod. Game versions are authored
 * here; `schemaVersion`/`generatedAt` are added by the builder.
 */
export const catalogConfigSchema = z
  .object({
    currentGameVersion: z.string().min(1),
    supportedGameVersion: z.string().min(1),
  })
  .strict();

/**
 * The embedded `metadata` block of the manifest: the authored game versions
 * plus the builder-stamped `schemaVersion` and `generatedAt`.
 */
export const manifestMetadataSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    currentGameVersion: z.string().min(1),
    supportedGameVersion: z.string().min(1),
    generatedAt: z.string().datetime(),
  })
  .strict();

/**
 * The full release artifact: a metadata block plus the list of groups. Every
 * entry in `modList` is a group so Findias has a single code path (a non-variant
 * mod is a group of one).
 */
export const manifestCatalogSchema = z
  .object({
    metadata: manifestMetadataSchema,
    modList: z.array(manifestGroupSchema),
  })
  .strict();

export type ManifestVariant = z.infer<typeof manifestVariantSchema>;
export type ManifestGroup = z.infer<typeof manifestGroupSchema>;
export type CatalogConfig = z.infer<typeof catalogConfigSchema>;
export type ManifestMetadata = z.infer<typeof manifestMetadataSchema>;
export type ManifestCatalog = z.infer<typeof manifestCatalogSchema>;
