import { z } from 'zod';

/** Placeholder values authors must not use — comment out or omit the key instead. */
export const PLACEHOLDER_MOD_TEXT_VALUES = ['n/a', 'none'] as const;

const placeholderSet = new Set<string>(PLACEHOLDER_MOD_TEXT_VALUES);

/** True when `value` is a disallowed placeholder (case-insensitive, trimmed). */
export const isPlaceholderModText = (value: string): boolean =>
  placeholderSet.has(value.trim().toLowerCase());

/**
 * Optional mod credits / update notes. Omit or comment out the YAML key when
 * unset; if present, must be non-empty and not a placeholder like "n/a" or "none".
 */
export const optionalModTextSchema = z
  .string()
  .min(1)
  .refine((value) => !isPlaceholderModText(value), {
    message: 'must be a real value or omitted — placeholders like "n/a" and "none" are not allowed',
  })
  .optional();
