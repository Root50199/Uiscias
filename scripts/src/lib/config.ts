import fs from 'node:fs';
import path from 'node:path';
import { readYamlFile } from './yaml';
import { orderKeys, readJsonFile } from './json';
import { scanUsedFiles, computeDataHash } from './hash';
import type { Mod } from './mods';
import {
  CONFIG_JSON_KEY_ORDER,
  configYamlSchema,
  configJsonSchema,
  buildLockSchema,
  type BuildLock,
  type ConfigJson,
  type ConfigYaml,
} from '../schema';

export interface LoadedConfig {
  mod: Mod;
  yaml: ConfigYaml;
}

export class ConfigError extends Error {}

/** Load + validate a mod's config.yaml, enforcing modId === folder name. */
export function loadConfigYaml(mod: Mod): ConfigYaml {
  const yamlPath = path.join(mod.dir, 'config.yaml');
  if (!fs.existsSync(yamlPath)) {
    throw new ConfigError(`${mod.relDir}: missing config.yaml`);
  }

  const parsed = configYamlSchema.safeParse(readYamlFile(yamlPath));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new ConfigError(`${mod.relDir}: invalid config.yaml — ${issues}`);
  }

  if (parsed.data.modId !== mod.id) {
    throw new ConfigError(
      `${mod.relDir}: modId "${parsed.data.modId}" must equal folder name "${mod.id}"`,
    );
  }

  return parsed.data;
}

/** Build the generated config.json object for a mod (deterministic key order). */
export function buildConfigJson(mod: Mod): ConfigJson {
  const yaml = loadConfigYaml(mod);
  const dataDir = mod.dataDir ?? path.join(mod.dir, 'data');

  const config: ConfigJson = {
    ...yaml,
    isVariant: mod.kind === 'variant',
    hasVariants: mod.kind === 'variantParent',
    usedFiles: mod.dataDir ? scanUsedFiles(mod.dir, mod.dataDir) : [],
    sourceHash: computeDataHash(mod.dir, dataDir),
  };

  // Validate the generated shape, then enforce key order for stable output.
  return orderKeys(configJsonSchema.parse(config), CONFIG_JSON_KEY_ORDER);
}

/** Read + validate a mod's committed config.json. */
export function readConfigJson(mod: Mod): ConfigJson {
  return configJsonSchema.parse(readJsonFile(path.join(mod.dir, 'config.json')));
}

/** Read + validate a build/build.lock.json, if present. */
export function readBuildLock(buildDir: string): BuildLock | undefined {
  const p = path.join(buildDir, 'build.lock.json');
  if (!fs.existsSync(p)) return undefined;
  const parsed = buildLockSchema.safeParse(readJsonFile(p));
  return parsed.success ? parsed.data : undefined;
}
