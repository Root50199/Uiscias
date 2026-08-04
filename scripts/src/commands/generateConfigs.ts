import path from 'node:path';
import { fse, readText, formatJson, writeJsonFile } from '../lib/io';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, type Mod } from '../lib/mods';
import { resolveTargetMods, type ScopeOptions } from '../lib/scope';
import { buildConfigJson, ConfigError } from '../lib/config';
import { describeConfigDrift } from '../lib/configDrift';
import { gitAdd } from '../lib/git';
import { ok, warn, dim, glyph, Tally } from '../lib/term';

export interface GenerateConfigsOptions extends ScopeOptions {
  /** Verify mode: fail if any config.json would change; do not write. */
  check?: boolean;
}

type StaleMod = { readonly mod: Mod; readonly reasons: readonly string[] };

/**
 * Report a stale mod with the reasons indented beneath it, then the command that
 * fixes it. A reason may span several lines (a before/after snippet), so every
 * line is indented rather than just the first.
 */
const printStale = ({ mod, reasons }: StaleMod): void => {
  console.log(`  ${glyph.bad} ${warn('stale')}: ${mod.relDir}`);
  for (const reason of reasons) {
    for (const line of reason.split('\n')) console.log(`      ${dim(line)}`);
  }
  console.log(`      ${dim(`Fix: npm run generate-configs -- --mods ${mod.id}`)}`);
};

/**
 * Regenerate (or, with --check, verify) config.json for the target mods from
 * their config.yaml + a scan of data/. Deterministic: unchanged input produces
 * byte-identical output, so re-running is a no-op.
 */
export const runGenerateConfigs = async (opts: GenerateConfigsOptions): Promise<void> => {
  const repoRoot = getRepoRoot();
  const mods = discoverMods(repoRoot);
  const targets = resolveTargetMods(repoRoot, mods, opts);

  const tally = new Tally();
  const stale: StaleMod[] = [];
  const writtenPaths: string[] = [];

  for (const mod of targets) {
    const jsonPath = path.join(mod.dir, 'config.json');
    let desired: string;
    try {
      desired = await formatJson(await buildConfigJson(mod), jsonPath);
    } catch (e) {
      tally.addError(e instanceof ConfigError ? e.message : `${mod.relDir}: ${String(e)}`);
      continue;
    }

    const current = fse.pathExistsSync(jsonPath) ? readText(jsonPath) : null;

    if (current === desired) {
      tally.bump('unchanged');
      continue;
    }

    if (opts.check) {
      stale.push({ mod, reasons: describeConfigDrift(current, desired) });
    } else {
      await writeJsonFile(jsonPath, JSON.parse(desired));
      writtenPaths.push(jsonPath);
      tally.bump('written');
    }
  }

  if (opts.stage && writtenPaths.length > 0) {
    gitAdd(repoRoot, writtenPaths);
  }

  if (opts.check) {
    const staleText = stale.length > 0 ? warn(`${stale.length} stale`) : dim('0 stale');
    console.log(
      `Checked ${targets.length} mod(s): ${dim(`${tally.get('unchanged')} up to date`)}, ${staleText}.`,
    );
    for (const s of stale) printStale(s);
  } else {
    console.log(
      `Generated configs for ${targets.length} mod(s): ${ok(`${tally.get('written')} written`)}, ${dim(`${tally.get('unchanged')} unchanged`)}.`,
    );
  }

  tally.printErrors();

  if (tally.hasErrors || (opts.check && stale.length > 0)) {
    process.exitCode = 1;
  }
};
