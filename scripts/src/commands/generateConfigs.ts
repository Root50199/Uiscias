import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from '../lib/repo';
import { discoverMods } from '../lib/mods';
import { resolveTargetMods, type ScopeOptions } from '../lib/scope';
import { buildConfigJson, ConfigError } from '../lib/config';
import { formatJson, writeJsonFile } from '../lib/json';
import { gitAdd } from '../lib/git';
import { ok, warn, err, dim, glyph } from '../lib/term';

export interface GenerateConfigsOptions extends ScopeOptions {
  /** Verify mode: fail if any config.json would change; do not write. */
  check?: boolean;
}

/**
 * Regenerate (or, with --check, verify) config.json for the target mods from
 * their config.yaml + a scan of data/. Deterministic: unchanged input produces
 * byte-identical output, so re-running is a no-op.
 */
export async function runGenerateConfigs(opts: GenerateConfigsOptions): Promise<void> {
  const repoRoot = getRepoRoot();
  const mods = discoverMods(repoRoot);
  const targets = resolveTargetMods(repoRoot, mods, opts);

  const errors: string[] = [];
  const stale: string[] = [];
  const writtenPaths: string[] = [];
  let written = 0;
  let unchanged = 0;

  for (const mod of targets) {
    const jsonPath = path.join(mod.dir, 'config.json');
    let desired: string;
    try {
      desired = await formatJson(buildConfigJson(mod), jsonPath);
    } catch (err) {
      errors.push(err instanceof ConfigError ? err.message : `${mod.relDir}: ${String(err)}`);
      continue;
    }

    const current = fs.existsSync(jsonPath)
      ? fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '')
      : null;

    if (current === desired) {
      unchanged++;
      continue;
    }

    if (opts.check) {
      stale.push(mod.relDir);
    } else {
      await writeJsonFile(jsonPath, JSON.parse(desired));
      writtenPaths.push(jsonPath);
      written++;
    }
  }

  if (opts.stage && writtenPaths.length > 0) {
    gitAdd(repoRoot, writtenPaths);
  }

  if (opts.check) {
    const staleText = stale.length > 0 ? warn(`${stale.length} stale`) : dim('0 stale');
    console.log(
      `Checked ${targets.length} mod(s): ${dim(`${unchanged} up to date`)}, ${staleText}.`,
    );
    for (const s of stale) console.log(`  ${glyph.bad} ${warn('stale')}: ${s}`);
  } else {
    console.log(
      `Generated configs for ${targets.length} mod(s): ${ok(`${written} written`)}, ${dim(`${unchanged} unchanged`)}.`,
    );
  }

  if (errors.length > 0) {
    console.error(err(`\n${errors.length} error(s):`));
    for (const e of errors) console.error(`  ${glyph.bad} ${e}`);
  }

  if (errors.length > 0 || (opts.check && stale.length > 0)) {
    process.exitCode = 1;
  }
}
