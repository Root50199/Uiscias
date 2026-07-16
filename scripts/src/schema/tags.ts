import { z } from 'zod';

/** The closed set of tags a mod may declare in its `config.yaml`. */
export const FINDIAS_TAGS = [
  '1440p Required',
  'Arcana',
  'Audio',
  'Bri Leith',
  'Combat',
  'Cosmetic',
  'Crom Bas',
  'Cutscene Skip',
  'FoV',
  'Fx',
  'Glenn Bearna',
  'Lag Helper',
  'QoL',
  'Rabbie Phantasm',
  'Tech Duinn',
  'UI',
  'Visual Clarity',
  'Zoom',
] as const;

export const findiasTagSchema = z.enum(FINDIAS_TAGS);
export const findiasTagsSchema = z.array(findiasTagSchema);
export type FindiasTag = z.infer<typeof findiasTagSchema>;

/** Return tags in stable alphabetical order for generated artifacts. */
export const sortFindiasTags = (tags: readonly FindiasTag[]): FindiasTag[] =>
  [...tags].sort((a, b) => a.localeCompare(b));

/** The canonical `updateType` values. */
export const UPDATE_TYPES = ['stable', 'volatile'] as const;
export const updateTypeSchema = z.enum(UPDATE_TYPES);
export type UpdateType = z.infer<typeof updateTypeSchema>;
