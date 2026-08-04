import path from 'node:path';
import { fse, readText, readYamlFile, orderKeys, readJsonFile, formatText } from './io';
import { scanUsedFiles, scanImages, computeDataHash } from './hash';
import type { Mod } from './mods';
import {
  CONFIG_JSON_KEY_ORDER,
  configYamlSchema,
  configJsonSchema,
  buildLockSchema,
  catalogConfigSchema,
  parseOrThrow,
  sortFindiasTags,
  type BuildLock,
  type CatalogConfig,
  type ConfigJson,
  type ConfigYaml,
} from '../schema';

export class ConfigError extends Error {}

/** Load + validate a mod's config.yaml, enforcing modId === folder name. */
export const loadConfigYaml = (mod: Mod): ConfigYaml => {
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
};

/** Load + validate the catalog-level `catalog.yaml` at the repo root. */
export const readCatalogConfig = (repoRoot: string): CatalogConfig => {
  const yamlPath = path.join(repoRoot, 'catalog.yaml');
  if (!fse.pathExistsSync(yamlPath)) {
    throw new ConfigError(`missing catalog.yaml at repo root (${yamlPath})`);
  }

  return parseOrThrow(
    catalogConfigSchema,
    readYamlFile(yamlPath),
    (issues) => new ConfigError(`invalid catalog.yaml — ${issues}`),
  );
};

/**
 * Read a mod's README.md, or `undefined` when it has none. Formatted with
 * Prettier first: the text is embedded verbatim into config.json, so capturing
 * it raw would drift from the file the moment the `lint-staged` Prettier pass
 * normalizes it (e.g. dropping a stray trailing space mid-document, which
 * `.trim()` alone does not catch).
 */
const readReadme = async (mod: Mod): Promise<string | undefined> => {
  const readmePath = path.join(mod.dir, 'README.md');
  if (!fse.pathExistsSync(readmePath)) return undefined;
  const raw = readText(readmePath);
  if (raw.trim().length === 0) return undefined;
  const text = (await formatText(raw, 'markdown', readmePath)).trim();
  return text.length > 0 ? text : undefined;
};

/** Build the generated config.json object for a mod (deterministic key order). */
export const buildConfigJson = async (mod: Mod): Promise<ConfigJson> => {
  const yaml = loadConfigYaml(mod);
  const dataDir = mod.dataDir ?? path.join(mod.dir, 'data');
  const readme = await readReadme(mod);
  const images = scanImages(mod.dir);

  const config: ConfigJson = {
    ...yaml,
    findiasTags: sortFindiasTags(yaml.findiasTags),
    isVariant: mod.kind === 'variant',
    hasVariants: mod.kind === 'variantParent',
    usedFiles: mod.dataDir ? scanUsedFiles(mod.dir, mod.dataDir) : [],
    sourceHash: computeDataHash(mod.dir, dataDir),
    // Omit when absent so docs-less mods regenerate byte-identically.
    ...(readme ? { readme } : {}),
    ...(images.length > 0 ? { images } : {}),
  };

  // Validate the generated shape, then enforce key order for stable output.
  return configJsonSchema.parse(orderKeys(configJsonSchema.parse(config), CONFIG_JSON_KEY_ORDER));
};

/**
 * Read + validate a mod's committed config.json. Schema failures surface as a
 * `ConfigError` with the issues formatted the same way `loadConfigYaml` does —
 * a raw ZodError stringifies to a multi-line dump of issue objects, which is
 * unreadable when embedded in a one-line CI error.
 */
export const readConfigJson = (mod: Mod): ConfigJson =>
  parseOrThrow(
    configJsonSchema,
    readJsonFile(path.join(mod.dir, 'config.json')),
    (issues) => new ConfigError(`${mod.relDir}: invalid config.json — ${issues}`),
  );

/** Read + validate a build/build.lock.json, if present. */
export const readBuildLock = (buildDir: string): BuildLock | undefined => {
  const p = path.join(buildDir, 'build.lock.json');
  if (!fse.pathExistsSync(p)) return undefined;
  const parsed = buildLockSchema.safeParse(readJsonFile(p));
  return parsed.success ? parsed.data : undefined;
};
