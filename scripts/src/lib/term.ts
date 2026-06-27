import pc from 'picocolors';

/**
 * Semantic terminal helpers. picocolors auto-detects TTY / `NO_COLOR` /
 * `FORCE_COLOR`, so output is colored in a real terminal (and CI runners that
 * set `FORCE_COLOR`) but degrades to plain text when piped — e.g. the
 * non-interactive pre-commit hook launched from an editor Git UI.
 */
export const ok = (s: string): string => pc.green(s);
export const warn = (s: string): string => pc.yellow(s);
export const err = (s: string): string => pc.red(s);
export const dim = (s: string): string => pc.dim(s);
export const bold = (s: string): string => pc.bold(s);

/** Status glyphs, pre-colored to match their meaning. */
export const glyph = {
  ok: pc.green('✓'),
  warn: pc.yellow('!'),
  bad: pc.red('✗'),
} as const;
