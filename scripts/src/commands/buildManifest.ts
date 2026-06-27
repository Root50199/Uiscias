import fs from 'node:fs';
import path from 'node:path';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, groupMods, packTargets, type Mod, type ModGroup } from '../lib/mods';
import { readConfigJson, readBuildLock } from '../lib/config';
import { writeJsonFile } from '../lib/json';
import { ok, dim } from '../lib/term';
import {
  manifestCatalogSchema,
  type ManifestCatalog,
  type ManifestGroup,
  type ManifestVariant,
} from '../schema';

export interface BuildManifestOptions {
  /** Output path for the generated manifestCatalog.json. */
  out?: string;
  /** If set, also copy every shipped .it + the manifest into this directory. */
  assets?: string;
}

/** One installable entry, assembled from a mod's config.json + build.lock + .it. */
function variantEntry(mod: Mod): ManifestVariant {
  const cfg = readConfigJson(mod);
  const buildDir = path.join(mod.dir, 'build');
  const lock = readBuildLock(buildDir);
  if (!lock) {
    throw new Error(`${mod.relDir}: missing build/build.lock.json (run pack first)`);
  }
  const itPath = path.join(buildDir, lock.fileName);
  if (!fs.existsSync(itPath)) {
    throw new Error(`${mod.relDir}: build.lock points to missing ${lock.fileName}`);
  }

  return {
    modId: cfg.modId,
    modName: cfg.modName,
    fileName: lock.fileName,
    version: lock.version,
    size: fs.statSync(itPath).size,
    updateType: cfg.updateType,
    usedFiles: cfg.usedFiles,
    modAuthor: cfg.modAuthor,
    modAdditionalCredits: cfg.modAdditionalCredits,
    recentUpdateNotes: cfg.recentUpdateNotes,
  };
}

function groupEntry(group: ModGroup): ManifestGroup {
  if (group.hasVariants && group.parent) {
    const parent = readConfigJson(group.parent);
    return {
      groupId: group.parent.id,
      modName: parent.modName,
      findiasTags: parent.findiasTags,
      hasVariants: true,
      mutuallyExclusive: true,
      variants: group.members.map(variantEntry),
    };
  }

  const [mod] = group.members;
  const cfg = readConfigJson(mod);
  return {
    groupId: mod.id,
    modName: cfg.modName,
    findiasTags: cfg.findiasTags,
    hasVariants: false,
    mutuallyExclusive: false,
    variants: [variantEntry(mod)],
  };
}

/**
 * Aggregate every mod's config.json + build artifacts into manifestCatalog.json,
 * grouping variants. This is a release-time artifact and is not committed.
 */
export async function runBuildManifest(opts: BuildManifestOptions): Promise<void> {
  const repoRoot = getRepoRoot();
  const mods = discoverMods(repoRoot);
  const groups = groupMods(mods);

  const catalog: ManifestCatalog = groups
    .map(groupEntry)
    .sort((a, b) => a.groupId.localeCompare(b.groupId));

  // Validate before writing so a bad manifest never ships.
  manifestCatalogSchema.parse(catalog);

  const outPath = path.resolve(repoRoot, opts.out ?? 'manifestCatalog.json');
  await writeJsonFile(outPath, catalog);

  const variantCount = catalog.reduce((n, g) => n + g.variants.length, 0);
  console.log(
    `${ok(`Wrote ${path.relative(repoRoot, outPath)}`)} ${dim(`— ${catalog.length} groups, ${variantCount} variants.`)}`,
  );

  if (opts.assets) {
    const assetsDir = path.resolve(repoRoot, opts.assets);
    fs.mkdirSync(assetsDir, { recursive: true });
    let copied = 0;
    for (const mod of packTargets(mods)) {
      const buildDir = path.join(mod.dir, 'build');
      const lock = readBuildLock(buildDir);
      if (!lock) throw new Error(`${mod.relDir}: missing build.lock.json (run pack first)`);
      fs.copyFileSync(path.join(buildDir, lock.fileName), path.join(assetsDir, lock.fileName));
      copied++;
    }
    fs.copyFileSync(outPath, path.join(assetsDir, path.basename(outPath)));
    console.log(
      `${ok(`Copied ${copied} .it + manifest`)} ${dim(`into ${path.relative(repoRoot, assetsDir)}/.`)}`,
    );
  }
}
