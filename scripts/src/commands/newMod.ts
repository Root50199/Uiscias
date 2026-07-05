import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Document, isMap, isScalar } from 'yaml';
import { fse, formatText, writeJsonFile, relPosix } from '../lib/io';
import { getRepoRoot, getModsRoot } from '../lib/repo';
import { humanizeModId } from '../lib/humanize';
import { ok, err, dim } from '../lib/term';
import { FINDIAS_TAGS } from '../schema';

/** Folder-name format every mod id must follow (UpperCamelCase / PascalCase). */
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Validate a candidate mod id's format. Returns a human-readable error message,
 * or `null` when the name is acceptable. Shared by the CLI-arg and interactive
 * paths so the rules and wording stay in sync.
 */
const validateModIdFormat = (name: string): string | null => {
  if (!name) {
    return 'Mod name cannot be empty.';
  }
  if (!PASCAL_CASE.test(name)) {
    return (
      `Invalid mod name "${name}".\n` +
      '  Mod names must be UpperCamelCase: start with a capital letter and contain\n' +
      '  only letters and digits (no spaces, hyphens, or underscores).\n' +
      `  e.g. "SomeModName"  (not "${name}")`
    );
  }
  return null;
};

export interface NewModOptions {
  /** The requested mod id / folder name (raw, unvalidated). */
  name: string | undefined;
  /**
   * When true, scaffold a variant group (a parent folder with two stub variant
   * subfolders) instead of a single standalone mod.
   */
  variant?: boolean;
}

/** Hardcoded stub variant suffixes; authors rename these after scaffolding. */
const VARIANT_SUFFIXES = ['Variant1', 'Variant2'] as const;

class NewModError extends Error {}

/**
 * Scaffold a brand-new mod folder at the repo root:
 *
 *   <ModId>/
 *   ├─ build/              (empty)
 *   ├─ data/               (empty)
 *   ├─ images/             (empty)
 *   ├─ config.json         ({})
 *   ├─ config.yaml         (all fields + every allowed tag, for trimming)
 *   └─ README.md           (title + placeholder)
 *
 * With `opts.variant`, scaffold a variant group instead: a parent folder (no
 * `data/`/`build/`, only `images/` + config/README) plus two stub variant
 * subfolders (`<ModId>Variant1`, `<ModId>Variant2`), each with the full layout.
 *
 * The name must be UpperCamelCase; anything else cancels with a clear message.
 */
export const runNewMod = async (opts: NewModOptions): Promise<void> => {
  const repoRoot = getRepoRoot();
  const modsRoot = getModsRoot(repoRoot);
  const exists = (id: string): boolean => fse.pathExistsSync(path.join(modsRoot, id));

  let modId = (opts.name ?? '').trim();

  if (modId) {
    // A name was passed via CLI: validate up front and fail fast. This keeps the
    // command usable in non-interactive contexts (pipes, other scripts, CI).
    const formatError = validateModIdFormat(modId);
    if (formatError) {
      throw new NewModError(formatError);
    }
  } else {
    // No name passed: prompt interactively, re-asking until we get a valid,
    // unused id. Without a TTY there is nobody to answer, so fail fast instead
    // of looping forever on empty stdin.
    if (!input.isTTY) {
      throw new NewModError(
        'Missing mod name.\n  Usage: npm run new-mod <ModName>   (UpperCamelCase, e.g. SomeModName)',
      );
    }

    const rl = readline.createInterface({ input, output });
    try {
      while (!modId) {
        const answer = (
          await rl.question('Enter mod name (UpperCamelCase, e.g. SomeModName): ')
        ).trim();

        const formatError = validateModIdFormat(answer);
        if (formatError) {
          console.error(err(`Error: ${formatError}\n`));
          continue;
        }

        if (exists(answer)) {
          console.error(err(`Error: "${answer}" already exists — choose a different name.\n`));
          continue;
        }

        modId = answer;
      }
    } finally {
      rl.close();
    }
  }

  const modDir = path.join(modsRoot, modId);
  const relDir = relPosix(repoRoot, modDir);
  if (fse.pathExistsSync(modDir)) {
    throw new NewModError(`"${modId}" already exists at ${relDir}/ — refusing to overwrite.`);
  }

  if (opts.variant) {
    await scaffoldVariantGroup(modDir, modId);
    printVariantSummary(relDir, modId);
    return;
  }

  await scaffoldModFolder(modDir, modId, { withDataDirs: true });
  printStandaloneSummary(relDir);
};

/**
 * Write the shared per-folder scaffold: `config.json` ({}), a `config.yaml`
 * template, and a placeholder `README.md`. An empty `images/` folder is created
 * at every level; `build/`/`data/` are created only when `withDataDirs` is set
 * (a variant parent must NOT have `data/`, or mod discovery treats it as a
 * standalone mod — see `scripts/src/lib/mods.ts`).
 *
 * config.json is intentionally empty — `generate-configs` (or the pre-commit
 * hook) fills it in once the mod has real data + a finished config.yaml.
 */
const scaffoldModFolder = async (
  dir: string,
  id: string,
  opts: { withDataDirs: boolean },
): Promise<void> => {
  if (opts.withDataDirs) {
    fse.ensureDirSync(path.join(dir, 'build'));
    fse.ensureDirSync(path.join(dir, 'data'));
  }
  fse.ensureDirSync(path.join(dir, 'images'));

  await writeJsonFile(path.join(dir, 'config.json'), {});
  await writeConfigYamlTemplate(path.join(dir, 'config.yaml'), id);
  await writeReadme(path.join(dir, 'README.md'), id);
};

/**
 * Scaffold a variant group: the parent folder (no `data/`/`build/`, so it is
 * discovered as a `variantParent`) plus two stub variant subfolders that each
 * get the full standalone layout.
 */
const scaffoldVariantGroup = async (parentDir: string, parentId: string): Promise<void> => {
  await scaffoldModFolder(parentDir, parentId, { withDataDirs: false });
  for (const suffix of VARIANT_SUFFIXES) {
    const variantId = `${parentId}${suffix}`;
    await scaffoldModFolder(path.join(parentDir, variantId), variantId, { withDataDirs: true });
  }
};

const printStandaloneSummary = (relDir: string): void => {
  console.log(ok(`Created mod scaffold: ${relDir}/`));
  console.log(dim('  build/              (empty)'));
  console.log(dim('  data/               (empty)'));
  console.log(dim('  images/             (empty)'));
  console.log(dim('  config.json         ({})'));
  console.log(dim('  config.yaml         (edit values; trim findiasTags)'));
  console.log(dim('  README.md           (placeholder)'));
  console.log(
    '\nNext: drop your game files in data/, finish config.yaml, then commit\n' +
      '(the pre-commit hook generates config.json and packs the .it).',
  );
  console.log(
    dim(
      'Note: git does not track empty folders — build/, data/, and images/ appear once you add files.',
    ),
  );
};

const printVariantSummary = (relDir: string, modId: string): void => {
  console.log(ok(`Created variant group scaffold: ${relDir}/`));
  console.log(dim('  images/             (empty)'));
  console.log(dim('  config.json         ({})'));
  console.log(dim('  config.yaml         (edit values; trim findiasTags)'));
  console.log(dim('  README.md           (placeholder)'));
  for (const suffix of VARIANT_SUFFIXES) {
    console.log(dim(`  ${modId}${suffix}/`));
    console.log(dim('    build/  data/  images/  (empty)'));
    console.log(dim('    config.json         ({})'));
    console.log(dim('    config.yaml         (edit values; trim findiasTags)'));
    console.log(dim('    README.md           (placeholder)'));
  }
  console.log(
    "\nNext: rename the stub variant folders, drop game files in each variant's data/,\n" +
      'finish each config.yaml, then commit (the pre-commit hook generates config.json\n' +
      'and packs the .it for every variant).',
  );
  console.log(
    dim(
      'Note: git does not track empty folders — build/, data/, and images/ appear once you add files.',
    ),
  );
};

/**
 * Emit a `config.yaml` pre-filled with the required fields and **all** allowed
 * `findiasTags` (sourced from the schema, so new tags appear here automatically)
 * for the author to trim down. The two optional fields (`modAdditionalCredits`,
 * `recentUpdateNotes`) are emitted **commented out** in their canonical
 * positions: authors can see they exist, but a commented/omitted key means
 * "unset" and is dropped from the generated config.json / manifest.
 */
const writeConfigYamlTemplate = async (filepath: string, modId: string): Promise<void> => {
  const doc = new Document({
    modId,
    modName: humanizeModId(modId),
    modAuthor: 'Root50199',
    updateType: 'stable',
    findiasTags: [...FINDIAS_TAGS],
  });

  // Attach the optional fields as comment lines before the key that would
  // follow them, so they render in schema order (credits before updateType,
  // notes before findiasTags). A leading space yields `# key:` after `#`.
  const commentBeforeKey = (key: string, comment: string): void => {
    if (!isMap(doc.contents)) return;
    for (const item of doc.contents.items) {
      if (isScalar(item.key) && item.key.value === key) item.key.commentBefore = comment;
    }
  };
  commentBeforeKey('updateType', ' modAdditionalCredits:');
  commentBeforeKey('findiasTags', ' recentUpdateNotes:');

  const text = await formatText(doc.toString(), 'yaml', filepath);
  await fse.outputFile(filepath, text, 'utf8');
};

const writeReadme = async (filepath: string, modId: string): Promise<void> => {
  const formatted = await formatText(
    `# ${humanizeModId(modId)}\n\n## What it does\n\nDescription coming soon.\n\n### How it's made\n\nDescription coming soon.\n`,
    'markdown',
    filepath,
  );
  await fse.outputFile(filepath, formatted, 'utf8');
};
