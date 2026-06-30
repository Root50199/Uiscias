import { z } from 'zod';

/** The closed set of tags a mod may declare in its `config.yaml`. */
export const FINDIAS_TAGS = [
  '1440p Required',
  'Arcana',
  'Audio',
  'Bri Leith',
  'Combat',
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

/** The canonical `updateType` values. */
export const UPDATE_TYPES = ['stable', 'volatile'] as const;
export const updateTypeSchema = z.enum(UPDATE_TYPES);
export type UpdateType = z.infer<typeof updateTypeSchema>;

/**
 * Maps legacy/aliased `updateType` strings (case-insensitive) onto the
 * canonical enum. Used only by the one-time migration; new `config.yaml` files
 * must already use a canonical value.
 */
export const LEGACY_UPDATE_TYPE_MAP: Record<string, UpdateType> = {
  stable: 'stable',
  volatile: 'volatile',
  evergreen: 'stable',
  needsmaintenance: 'volatile',
  maintenancerequired: 'volatile',
};

export const normalizeUpdateType = (raw: string): UpdateType | undefined =>
  LEGACY_UPDATE_TYPE_MAP[raw.trim().toLowerCase()];
