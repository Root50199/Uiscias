import { z } from 'zod';

/**
 * Explain *why* a committed config.json differs from the freshly generated one.
 *
 * `generate-configs --check` only knows the two are not byte-identical, which
 * makes a one-character difference (a stray trailing space inside the embedded
 * README, say) invisible in CI output. These reasons name the field that moved
 * and, for prose fields, point at the exact line with whitespace made visible.
 */

/** Fields reported before the rest are summarized as a count. */
const MAX_FIELDS = 5;
/** Array entries listed per +/- group before the rest are summarized. */
const MAX_ARRAY_ENTRIES = 3;
/** Characters of a line kept on either side of the first differing character. */
const WINDOW_RADIUS = 45;
/** Single-line strings up to this length are shown whole instead of windowed. */
const INLINE_STRING_LIMIT = 80;

const jsonObjectSchema = z.record(z.string(), z.unknown());

/**
 * Human-readable reasons the committed config.json is stale, most significant
 * first. Entries may span multiple lines; callers should indent every line.
 * `currentText` is `null` when the file does not exist yet.
 */
export const describeConfigDrift = (
  currentText: string | null,
  desiredText: string,
): readonly string[] => {
  if (currentText === null) return ['missing config.json'];

  const current = parseJsonObject(currentText);
  if (!current) return ['not valid JSON — the file was hand-edited or truncated'];

  const desired = parseJsonObject(desiredText);
  if (!desired) return ['could not parse the regenerated config.json'];

  const fields = describeFieldDrift(current, desired);
  // Every value matches, so the bytes differ only in key order or indentation.
  if (fields.length === 0) return ['JSON formatting differs (key order or indentation)'];

  if (fields.length <= MAX_FIELDS) return fields;
  const rest = fields.length - MAX_FIELDS;
  return [...fields.slice(0, MAX_FIELDS), `… and ${rest} more field(s)`];
};

const parseJsonObject = (text: string): Record<string, unknown> | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = jsonObjectSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

/**
 * One reason per field that differs. Generated keys come first so the report
 * follows CONFIG_JSON_KEY_ORDER, with any leftover committed-only keys after.
 */
const describeFieldDrift = (
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
): readonly string[] => {
  const fields = [...new Set([...Object.keys(desired), ...Object.keys(current)])];
  const reasons: string[] = [];

  for (const field of fields) {
    if (!(field in current)) {
      reasons.push(`${field}: missing, should be ${summarize(desired[field])}`);
      continue;
    }
    if (!(field in desired)) {
      reasons.push(`${field}: no longer generated, but committed as ${summarize(current[field])}`);
      continue;
    }
    const detail = describeValueDrift(current[field], desired[field]);
    if (detail) reasons.push(`${field}: ${detail}`);
  }

  return reasons;
};

const describeValueDrift = (current: unknown, desired: unknown): string | undefined => {
  if (JSON.stringify(current) === JSON.stringify(desired)) return undefined;

  if (typeof current === 'string' && typeof desired === 'string') {
    return describeStringDrift(current, desired);
  }
  if (isStringArray(current) && isStringArray(desired)) {
    return describeStringArrayDrift(current, desired);
  }
  return `${summarize(current)} → ${summarize(desired)}`;
};

/**
 * Locate the difference in a text field. Short single-line values are quoted
 * inline; anything longer (notably `readme`) reports the line number plus an
 * aligned before/after window around the first differing character.
 */
const describeStringDrift = (current: string, desired: string): string => {
  const currentLines = current.split('\n');
  const desiredLines = desired.split('\n');

  const isSingleLine = currentLines.length === 1 && desiredLines.length === 1;
  const isShort = current.length <= INLINE_STRING_LIMIT && desired.length <= INLINE_STRING_LIMIT;
  if (isSingleLine && isShort) {
    return `${JSON.stringify(current)} → ${JSON.stringify(desired)}`;
  }

  const lineIndex = firstDifferenceIndex(currentLines, desiredLines);
  const currentLine = currentLines[lineIndex];
  const desiredLine = desiredLines[lineIndex];

  if (currentLine === undefined) {
    return `${countLines(desiredLines.length - currentLines.length)} missing at line ${lineIndex + 1}`;
  }
  if (desiredLine === undefined) {
    return `${countLines(currentLines.length - desiredLines.length)} extra at line ${lineIndex + 1}`;
  }

  const cause = whitespaceCause(currentLine, desiredLine);
  const where = isSingleLine ? 'differs' : `line ${lineIndex + 1} differs`;

  // Whitespace glyphs are 1:1 substitutions, so the window still lines up.
  const shownCurrent = visibleWhitespace(currentLine);
  const shownDesired = visibleWhitespace(desiredLine);
  const window = windowAround(firstDifferenceIndex(currentLine, desiredLine), [
    shownCurrent,
    shownDesired,
  ]);

  return [
    cause ? `${where} (${cause})` : where,
    `  committed: ${snippet(shownCurrent, window)}`,
    `  expected:  ${snippet(shownDesired, window)}`,
  ].join('\n');
};

const describeStringArrayDrift = (
  current: readonly string[],
  desired: readonly string[],
): string => {
  const added = desired.filter((entry) => !current.includes(entry));
  const removed = current.filter((entry) => !desired.includes(entry));
  if (added.length === 0 && removed.length === 0) {
    return `same ${desired.length} entries, different order`;
  }

  const parts: string[] = [];
  if (added.length > 0) parts.push(`+${added.length} missing (${previewEntries(added)})`);
  if (removed.length > 0) parts.push(`-${removed.length} stale (${previewEntries(removed)})`);
  return parts.join(', ');
};

const previewEntries = (entries: readonly string[]): string => {
  const shown = entries
    .slice(0, MAX_ARRAY_ENTRIES)
    .map((entry) => JSON.stringify(entry))
    .join(', ');
  const rest = entries.length - MAX_ARRAY_ENTRIES;
  return rest > 0 ? `${shown}, … and ${rest} more` : shown;
};

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const summarize = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.length > INLINE_STRING_LIMIT
      ? `${JSON.stringify(value.slice(0, INLINE_STRING_LIMIT))}…`
      : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `${countEntries(value.length)}`;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (value === null) return 'null';
  if (value === undefined) return 'absent';
  return JSON.stringify(value);
};

const countLines = (n: number): string => `${n} line${n === 1 ? '' : 's'}`;
const countEntries = (n: number): string => `${n} entr${n === 1 ? 'y' : 'ies'}`;

/**
 * Index of the first element that differs. Reads past the end of the shorter
 * input as `undefined`, so a pure length difference reports the first extra
 * index rather than "equal".
 */
const firstDifferenceIndex = (
  current: string | readonly string[],
  desired: string | readonly string[],
): number => {
  const max = Math.max(current.length, desired.length);
  for (let i = 0; i < max; i++) {
    if (current[i] !== desired[i]) return i;
  }
  return max;
};

/** Why two lines differ, when the only difference is whitespace. */
const whitespaceCause = (current: string, desired: string): string | undefined => {
  if (current.trimEnd() === desired.trimEnd()) return 'trailing whitespace';
  if (current.trimStart() === desired.trimStart()) return 'leading whitespace';
  const collapse = (line: string): string => line.replace(/\s+/g, ' ').trim();
  if (collapse(current) === collapse(desired)) return 'whitespace';
  return undefined;
};

/**
 * Render invisible characters that would otherwise make a diff unreadable:
 * trailing spaces, tabs, and stray carriage returns. Each substitution is a
 * single character so column positions are preserved.
 */
const visibleWhitespace = (line: string): string =>
  line
    .replace(/\r/g, '␍')
    .replace(/\t/g, '→')
    .replace(/ +$/, (run) => '·'.repeat(run.length));

type Window = { readonly start: number; readonly end: number };

/** A slice window shared by both snippets, so they align when printed. */
const windowAround = (column: number, lines: readonly string[]): Window => {
  const longest = Math.max(...lines.map((line) => line.length));
  if (longest <= WINDOW_RADIUS * 2) return { start: 0, end: longest };
  const start = Math.max(0, column - WINDOW_RADIUS);
  return { start, end: start + WINDOW_RADIUS * 2 };
};

const snippet = (line: string, window: Window): string => {
  const head = window.start > 0 ? '…' : '';
  const tail = window.end < line.length ? '…' : '';
  return `${head}${line.slice(window.start, window.end)}${tail}`;
};
