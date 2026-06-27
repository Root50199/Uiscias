import path from 'node:path';
import { fse, readYamlFile, orderKeys, readJsonFile } from './io';
import { scanUsedFiles, computeDataHash } from './hash';
import type { Mod } from './mods';
import {
  CONFIG_JSON_KEY_ORDER,
  configYamlSchema,
  configJsonSchema,
  buildLockSchema,
  catalogConfigSchema,
  parseOrThrow,
  type BuildLock,
  type CatalogConfig,
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
  if (!fse.pathExistsSync(yamlPath)) {
    throw new ConfigError(`${mod.relDir}: missing config.yaml`);
  }

  const data = parseOrThrow(
    configYamlSchema,
    readYamlFile(yamlPath),
    (issues) => new ConfigError(`${mod.relDir}: invalid config.yaml — ${issues}`),
  );

  if (data.modId !== mod.id) {
    throw new ConfigError(
      `${mod.relDir}: modId "${data.modId}" must equal folder name "${mod.id}"`,
    );
  }

  return data;
}

/** Load + validate the catalog-level `catalog.yaml` at the repo root. */
export function readCatalogConfig(repoRoot: string): CatalogConfig {
  const yamlPath = path.join(repoRoot, 'catalog.yaml');
  if (!fse.pathExistsSync(yamlPath)) {
    throw new ConfigError(`missing catalog.yaml at repo root (${yamlPath})`);
  }

  return parseOrThrow(
    catalogConfigSchema,
    readYamlFile(yamlPath),
    (issues) => new ConfigError(`invalid catalog.yaml — ${issues}`),
  );
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
  if (!fse.pathExistsSync(p)) return undefined;
  const parsed = buildLockSchema.safeParse(readJsonFile(p));
  return parsed.success ? parsed.data : undefined;
}
