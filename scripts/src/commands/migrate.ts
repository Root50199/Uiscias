import path from 'node:path';
import { z } from 'zod';
import { fse, readText, writeYamlFile, orderKeys } from '../lib/io';
import { getRepoRoot } from '../lib/repo';
import { discoverMods, type Mod } from '../lib/mods';
import { humanizeModId } from '../lib/humanize';
import { ok, warn, glyph, Tally } from '../lib/term';
import {
  CONFIG_YAML_KEY_ORDER,
  configYamlSchema,
  findiasTagSchema,
  formatZodIssues,
  normalizeUpdateType,
  type ConfigYaml,
  type FindiasTag,
} from '../schema';

const legacyConfigSchema = z
  .object({
    modID: z.string().optional(),
    modId: z.string().optional(),
    modName: z.string().optional(),
    modAuthor: z.string().optional(),
    modAdditionalCredits: z.string().optional(),
    updateType: z.string().optional(),
    recentUpdateNotes: z.string().optional(),
    findiasTags: z.array(z.string()).optional(),
  })
  .passthrough();

type LegacyConfig = z.infer<typeof legacyConfigSchema>;

const readLegacy = (dir: string): LegacyConfig | undefined => {
  const p = path.join(dir, 'config.json');
  if (!fse.pathExistsSync(p)) return undefined;
  try {
    // Legacy files were written by PowerShell with a UTF-8 BOM, which breaks JSON.parse.
    const parsed = legacyConfigSchema.safeParse(JSON.parse(readText(p)));
    return parsed.success ? parsed.data : undefined;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `  ! ${path.relative(process.cwd(), p)}: failed to read legacy config (${message})`,
    );
    return undefined;
  }
};

const cleanTags = (tags: string[] | undefined): FindiasTag[] => {
  const seen = new Set<string>();
  const out: FindiasTag[] = [];
  for (const raw of tags ?? []) {
    const t = raw.trim();
    const parsed = findiasTagSchema.safeParse(t);
    if (parsed.success && !seen.has(parsed.data)) {
      seen.add(parsed.data);
      out.push(parsed.data);
    }
  }
  return out;
};

/** Read comma-separated tags from a legacy `Tags.md`/`tags.md`, if present. */
const readTagsMd = (dir: string): string[] => {
  for (const name of ['Tags.md', 'tags.md']) {
    const p = path.join(dir, name);
    if (fse.pathExistsSync(p)) {
      return readText(p)
        .split(',')
        .map((s) => s.trim());
    }
  }
  return [];
};

/** Union of tags declared in a mod's legacy config.json and its Tags.md. */
const collectTags = (dir: string, legacy: LegacyConfig | undefined): FindiasTag[] =>
  cleanTags([...(legacy?.findiasTags ?? []), ...readTagsMd(dir)]);

const resolveModName = (
  mod: Mod,
  legacy: LegacyConfig | undefined,
  parentName: Map<string, string | undefined>,
): string => {
  if (mod.kind === 'variantParent') return humanizeModId(mod.id);
  if (mod.kind === 'variant') {
    const dupOfParent =
      legacy?.modName && mod.groupId && legacy.modName === parentName.get(mod.groupId);
    if (!legacy?.modName || dupOfParent) return humanizeModId(mod.id);
    return legacy.modName;
  }
  return legacy?.modName?.trim() || humanizeModId(mod.id);
};

/**
 * One-time migration: produce a `config.yaml` for every mod/variant/parent from
 * its existing (legacy) `config.json`. Folder + `.it` renames are done
 * separately via `git mv`; run this AFTER the renames so ids match folders.
 * Does not touch `config.json` (Phase 2 `generate-configs` regenerates those).
 */
export const runMigrate = async (): Promise<void> => {
  const repoRoot = getRepoRoot();
  const mods = discoverMods(repoRoot);

  // parent id → legacy modName, to detect non-variant-specific (duplicate) names
  const parentName = new Map<string, string | undefined>();
  for (const m of mods) {
    if (m.kind === 'variantParent') parentName.set(m.id, readLegacy(m.dir)?.modName);
  }

  const warnings: string[] = [];
  const tally = new Tally();

  for (const mod of mods) {
    const legacy = readLegacy(mod.dir);

    const modName = resolveModName(mod, legacy, parentName);
    const updateType = (legacy?.updateType && normalizeUpdateType(legacy.updateType)) || 'volatile';

    let tags = collectTags(mod.dir, legacy);
    if (tags.length === 0 && mod.kind === 'variant' && mod.groupId) {
      const parent = mods.find((m) => m.id === mod.groupId && m.kind === 'variantParent');
      if (parent) tags = collectTags(parent.dir, readLegacy(parent.dir));
    }
    if (tags.length === 0) {
      warnings.push(
        `${mod.relDir}: no findiasTags (optional — add some in config.yaml if you want)`,
      );
    }

    const candidate: ConfigYaml = {
      modId: mod.id,
      modName,
      modAuthor: legacy?.modAuthor?.trim() || 'Root50199',
      modAdditionalCredits: legacy?.modAdditionalCredits?.trim() || 'None',
      updateType,
      recentUpdateNotes: legacy?.recentUpdateNotes?.trim() || 'n/a',
      findiasTags: tags,
    };

    const parsed = configYamlSchema.safeParse(candidate);
    if (!parsed.success) {
      warnings.push(`${mod.relDir}: SKIPPED — ${formatZodIssues(parsed.error, { path: false })}`);
      continue;
    }

    await writeYamlFile(
      path.join(mod.dir, 'config.yaml'),
      orderKeys(parsed.data, CONFIG_YAML_KEY_ORDER),
    );
    tally.bump('written');
  }

  console.log(ok(`Wrote ${tally.get('written')} config.yaml file(s).`));
  if (warnings.length > 0) {
    console.log(warn(`\n${warnings.length} warning(s):`));
    for (const w of warnings) console.log(`  ${glyph.warn} ${w}`);
  }
};
