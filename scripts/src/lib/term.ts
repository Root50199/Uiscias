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

/**
 * Small accumulator for the commands' "loop over mods, tally outcomes, then
 * print a summary + any errors" shape. Holds named counts and an error list;
 * each command still composes its own summary line (wording/colors stay exact).
 */
export class Tally {
  private readonly counts = new Map<string, number>();
  readonly errors: string[] = [];

  /** Increment a named counter (created on first use). */
  bump(key: string, by = 1): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + by);
  }

  /** Current value of a named counter (0 if never bumped). */
  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  /** Record an error message for the trailing error block. */
  addError(message: string): void {
    this.errors.push(message);
  }

  get hasErrors(): boolean {
    return this.errors.length > 0;
  }

  /** Print the standard `N error(s):` block (no-op when there are none). */
  printErrors(): void {
    if (this.errors.length === 0) return;
    console.error(err(`\n${this.errors.length} error(s):`));
    for (const e of this.errors) console.error(`  ${glyph.bad} ${e}`);
  }
}
